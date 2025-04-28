document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const loginBtn = document.getElementById('login-btn');
    const errorDiv = document.getElementById('error-message');
    loginBtn.textContent = 'Loading...';
    errorDiv.classList.add('hidden');
    errorDiv.classList.remove('block');

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    try {
        const response = await fetch('/logs/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });

        const result = await response.json();
        if (response.ok) {
            window.location.href = '/logs/home';
        } else {
            errorDiv.textContent = result.message || 'Login failed';
            errorDiv.classList.remove('hidden');
            errorDiv.classList.add('block');
            loginBtn.textContent = 'Login';
        }
    } catch (error) {
        errorDiv.textContent = error.message || 'An unexpected error occurred';
        errorDiv.classList.remove('hidden');
        errorDiv.classList.add('block');
        loginBtn.textContent = 'Login';
    }
});