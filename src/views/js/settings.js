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
  console.log('DOM loaded, calling loadUsers...'); // Debug log
  
  // Small delay to ensure DOM is fully ready
  setTimeout(async () => {
    await loadUsers();
  }, 100);
});

// Check if current user is admin
async function checkAdminStatus() {
  try {
    const res = await fetch('/logs/auth/users');
    return res.ok; // If user can access users endpoint, they're admin
  } catch (error) {
    return false;
  }
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

// Make removeUser globally available
window.removeUser = removeUser;

// Load users from server
async function loadUsers() {
  const usersList = document.getElementById('users-list');
  
  if (!usersList) {
    console.error('users-list element not found!');
    return;
  }
  
  console.log('Loading users...'); // Debug log
  
  try {
    console.log('Making fetch request to /logs/auth/users...'); // Debug log
    const res = await fetch('/logs/auth/users');
    console.log('Users response status:', res.status); // Debug log
    console.log('Users response ok:', res.ok); // Debug log
    
    if (!res.ok) {
      if (res.status === 403) {
        console.log('User is not admin, hiding user management section'); // Debug log
        // Hide user management section if not admin
        document.getElementById('user-management-section').style.display = 'none';
        return;
      }
      throw new Error('Failed to load users');
    }
    
    const data = await res.json();
    console.log('Users data:', data); // Debug log
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
          <span>Error loading users: ${error.message}</span>
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
  
  console.log('Rendering users, count:', currentUsers.length); // Debug log
  
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

  // Check if current user is admin
  const isAdmin = await checkAdminStatus();
  
  usersList.innerHTML = currentUsers.map(user => `
    <div class="user-list-item">
      <div class="flex items-center justify-between">
        <div class="flex items-center space-x-4">
          <div class="w-12 h-12 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-lg flex items-center justify-center">
            <svg class="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
            </svg>
          </div>
          <div>
            <p class="font-semibold text-white text-lg">${user.email}</p>
            <p class="text-sm text-slate-400">${user.role === 'admin' ? 'Administrator' : 'Developer'}</p>
          </div>
        </div>
        <div class="flex items-center space-x-4">
          <span class="px-4 py-2 rounded-full text-sm font-medium ${user.role === 'admin' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'}">
            ${user.role === 'admin' ? 'Admin' : 'Developer'}
          </span>
          ${isAdmin && user.role === 'dev' ? `
            <button onclick="removeUser('${user._id}')" class="text-red-400 hover:text-red-300 transition-colors duration-200 p-2 rounded-lg hover:bg-red-500/10">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
              </svg>
            </button>
          ` : ''}
        </div>
      </div>
    </div>
  `).join('');
}

// Handle add user form submission
document.getElementById('add-user-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const formData = new FormData(e.target);
  const userData = {
    email: formData.get('email'),
    password: formData.get('password'),
    role: 'dev' // Always set as developer
  };

  const submitBtn = e.target.querySelector('button[type="submit"]');
  const originalText = submitBtn.innerHTML;
  
  try {
    // Show loading state
    submitBtn.disabled = true;
    submitBtn.innerHTML = `
      <svg class="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
      </svg>
      <span>Adding...</span>
    `;

    const res = await fetch('/logs/auth/add-user', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(userData)
    });

    const data = await res.json();

    if (res.ok) {
      // Success - show success message and reload users
      showNotification('User added successfully!', 'success');
      e.target.reset();
      await loadUsers();
    } else {
      // Error - show error message
      showNotification(data.message || 'Failed to add user', 'error');
    }
  } catch (error) {
    console.error('Error adding user:', error);
    showNotification('Failed to add user', 'error');
  } finally {
    // Reset button state
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalText;
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
      <span class="font-medium">${message}</span>
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