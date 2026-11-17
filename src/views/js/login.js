const { bind, showError, clearError, postJson, withBusy, startEnroll, startVerify } = window.TwoFactor;
bind();

document.getElementById('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    clearError();
    withBusy(document.getElementById('login-btn'), 'Signing in...', async () => {
        try {
            const result = await postJson('/logs/auth/login', {
                email: document.getElementById('email').value,
                password: document.getElementById('password').value,
            });
            if (result.next === 'enroll') await startEnroll();
            else startVerify();
        } catch (err) {
            showError(err.message);
        }
    });
});
