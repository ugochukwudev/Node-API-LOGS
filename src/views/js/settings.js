// Values from the server (emails, messages) are always escaped before inserting as HTML.
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Handle logout button click
document.getElementById('logout-btn').addEventListener('click', async () => {
  const res = await fetch('/logs/auth/logout', { method: 'POST' });
  if (res.ok) {
    window.location.href = '/logs/login';
  } else {
    alert('Logout failed');
  }
});

// User Management Functions
let currentUsers = [];
let isCurrentUserAdmin = false;

// Load users on page load
document.addEventListener('DOMContentLoaded', async () => {
  
  // Small delay to ensure DOM is fully ready
  setTimeout(async () => {
    await loadUsers();
  }, 100);
});

// Current user, from the session
let me = null;
async function loadMe() {
  const res = await fetch('/logs/auth/me');
  if (res.ok) me = await res.json();
  return me;
}

// Remove user function
async function removeUser(userId) {
  if (!confirm('Are you sure you want to remove this user? This action cannot be undone.')) {
    return;
  }

  try {
    const res = await fetch(`/logs/auth/users/${userId}`, {
      method: 'DELETE'
    });

    const data = await res.json();

    if (res.ok) {
      showNotification('User removed successfully!', 'success');
      await loadUsers();
    } else {
      showNotification(data.message || 'Failed to remove user', 'error');
    }
  } catch (error) {
    console.error('Error removing user:', error);
    showNotification('Failed to remove user', 'error');
  }
}


// Load users from server
async function loadUsers() {
  const usersList = document.getElementById('users-list');
  
  if (!usersList) {
    console.error('users-list element not found!');
    return;
  }
  
  try {
    const res = await fetch('/logs/auth/users');
    
    if (!res.ok) {
      if (res.status === 403) {
        // Hide user management section if not admin
        document.getElementById('user-management-section').style.display = 'none';
        return;
      }
      throw new Error('Failed to load users');
    }
    
    const data = await res.json();
    currentUsers = data.users;
    await renderUsers();
  } catch (error) {
    console.error('Error loading users:', error);
    usersList.innerHTML = `
      <div class="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-red-400">
        <div class="flex items-center space-x-2">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          <span>Error loading users: ${escapeHtml(error.message)}</span>
        </div>
      </div>
    `;
  }
}

// Render users list
async function renderUsers() {
  const usersList = document.getElementById('users-list');
  
  if (!usersList) {
    console.error('users-list element not found in renderUsers!');
    return;
  }
  
  if (currentUsers.length === 0) {
    usersList.innerHTML = `
      <div class="bg-slate-800/50 rounded-lg p-12 text-center border border-slate-700/50">
        <svg class="w-16 h-16 text-slate-400 mx-auto mb-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"></path>
        </svg>
        <h3 class="text-lg font-semibold text-slate-300 mb-2">No users found</h3>
        <p class="text-slate-400">Add your first user using the form above</p>
      </div>
    `;
    return;
  }

  if (!me) await loadMe();
  const statusLabel = { invited: 'Invite pending', 'needs-2fa': 'Sets up 2FA at next sign-in', active: 'Active' };

  usersList.innerHTML = currentUsers.map(user => {
    const isSelf = me && String(me.id) === String(user._id);
    const id = escapeHtml(user._id);
    return `
    <div class="user-list-item">
      <div class="flex items-center justify-between">
        <div class="flex items-center space-x-4">
          <div class="w-12 h-12 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-lg flex items-center justify-center">
            <svg class="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
            </svg>
          </div>
          <div>
            <p class="font-semibold text-white text-lg">${escapeHtml(user.email)}${isSelf ? ' <span class="text-sm text-slate-400">(you)</span>' : ''}</p>
            <p class="text-sm text-slate-400">${escapeHtml(statusLabel[user.status] || user.status)}</p>
          </div>
        </div>
        <div class="flex items-center space-x-4">
          <span class="px-4 py-2 rounded-full text-sm font-medium ${user.role === 'admin' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'}">
            ${user.role === 'admin' ? 'Admin' : 'Developer'}
          </span>
          ${!isSelf && user.status === 'invited' ? `
            <button data-action="reinvite" data-email="${escapeHtml(user.email)}" class="text-sm text-blue-400 hover:text-blue-300 px-3 py-2 rounded-lg hover:bg-blue-500/10">New link</button>
          ` : ''}
          ${!isSelf && user.status === 'active' ? `
            <button data-action="reset-2fa" data-id="${id}" class="text-sm text-yellow-400 hover:text-yellow-300 px-3 py-2 rounded-lg hover:bg-yellow-500/10">Reset 2FA</button>
          ` : ''}
          ${!isSelf && user.role === 'dev' ? `
            <button data-action="remove" data-id="${id}" title="Remove user" class="text-red-400 hover:text-red-300 transition-colors duration-200 p-2 rounded-lg hover:bg-red-500/10">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
              </svg>
            </button>
          ` : ''}
        </div>
      </div>
    </div>
  `;
  }).join('');
}

// Row buttons (event delegation, no inline handlers)
document.getElementById('users-list').addEventListener('click', async (e) => {
  const button = e.target.closest('button[data-action]');
  if (!button) return;
  const { action, id, email } = button.dataset;
  if (action === 'remove') return removeUser(id);
  if (action === 'reinvite') return createInviteLink(email);
  if (action === 'reset-2fa') {
    if (!confirm('Reset this person\'s authenticator? They will scan a new QR code at their next sign-in.')) return;
    const res = await fetch(`/logs/auth/users/${encodeURIComponent(id)}/reset-2fa`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    showNotification(data.message || (res.ok ? 'Done' : 'Failed to reset 2FA'), res.ok ? 'success' : 'error');
    await loadUsers();
  }
});

async function createInviteLink(email) {
  const res = await fetch('/logs/auth/invites', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    showNotification(data.message || 'Failed to create invite', 'error');
    return false;
  }
  document.getElementById('invite-result-email').textContent = data.email;
  document.getElementById('invite-link').value = window.location.origin + data.path;
  document.getElementById('invite-result').hidden = false;
  showNotification('Invite link created. Copy it and send it to them.', 'success');
  await loadUsers();
  return true;
}

document.getElementById('copy-invite-link').addEventListener('click', () => {
  navigator.clipboard.writeText(document.getElementById('invite-link').value);
  showNotification('Link copied', 'success');
});

// Handle invite form submission
document.getElementById('invite-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const submitBtn = e.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  try {
    if (await createInviteLink(new FormData(e.target).get('email'))) e.target.reset();
  } catch (error) {
    showNotification('Failed to create invite', 'error');
  } finally {
    submitBtn.disabled = false;
  }
});

// Handle refresh users button
document.getElementById('refresh-users').addEventListener('click', async () => {
  const refreshBtn = document.getElementById('refresh-users');
  const originalText = refreshBtn.innerHTML;
  
  try {
    refreshBtn.disabled = true;
    refreshBtn.innerHTML = `
      <svg class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
      </svg>
      <span>Refreshing...</span>
    `;
    
    await loadUsers();
    showNotification('Users refreshed', 'success');
  } catch (error) {
    console.error('Error refreshing users:', error);
    showNotification('Failed to refresh users', 'error');
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.innerHTML = originalText;
  }
});

// Show notification
function showNotification(message, type = 'info') {
  // Remove existing notifications
  const existingNotifications = document.querySelectorAll('.notification');
  existingNotifications.forEach(notification => notification.remove());

  const notification = document.createElement('div');
  notification.className = `notification fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg max-w-sm transform transition-all duration-300 translate-x-full`;
  
  const bgColor = type === 'success' ? 'bg-green-500/20 border-green-500/50 text-green-400' : 
                  type === 'error' ? 'bg-red-500/20 border-red-500/50 text-red-400' : 
                  'bg-blue-500/20 border-blue-500/50 text-blue-400';
  
  notification.innerHTML = `
    <div class="flex items-center space-x-3 ${bgColor} border rounded-lg p-4">
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
      </svg>
      <span class="font-medium">${escapeHtml(message)}</span>
      <button class="ml-auto text-slate-400 hover:text-white" onclick="this.parentElement.parentElement.remove()">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
        </svg>
      </button>
    </div>
  `;
  
  document.body.appendChild(notification);
  
  // Animate in
  setTimeout(() => {
    notification.classList.remove('translate-x-full');
  }, 100);
  
  // Auto remove after 5 seconds
  setTimeout(() => {
    notification.classList.add('translate-x-full');
    setTimeout(() => {
      if (notification.parentElement) {
        notification.remove();
      }
    }, 300);
  }, 5000);
} 