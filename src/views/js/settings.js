// Handle logout button click
document.getElementById('logout-btn').addEventListener('click', async () => {
  const res = await fetch('/logs/auth/logout', { method: 'POST' });
  if (res.ok) {
    window.location.href = '/logs/login';
  } else {
    alert('Logout failed');
  }
}); 