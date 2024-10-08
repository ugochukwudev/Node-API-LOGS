document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    document.getElementById("login-btn").textContent = "loading";
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    try {
        const response = await fetch('/logs/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email, password }),
        });

        const result = await response.json();
        if (response.ok) {
            window.location.href = '/logs'; // Redirect to logs page on successful login
        } else {
            document.getElementById('error-message').textContent = result.message;
            document.getElementById("login-btn").textContent = "Login";

        }
    } catch (error) {
        document.getElementById('error-message').textContent = error;
        document.getElementById("login-btn").textContent = "Login";

    }
})