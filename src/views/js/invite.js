const { bind, showStep, showError, clearError, postJson, withBusy, startEnroll } = window.TwoFactor;
bind();

const token = window.location.pathname.split('/').pop();

(async () => {
    const res = await fetch(`/logs/auth/invites/${encodeURIComponent(token)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        showError(data.message || 'This link is not valid');
        return;
    }
    document.getElementById('invite-email').textContent = data.email;
    showStep('credentials');
})();

document.getElementById('invite-form').addEventListener('submit', (e) => {
    e.preventDefault();
    clearError();
    const password = document.getElementById('invite-password').value;
    if (password !== document.getElementById('invite-confirm').value) {
        showError('The passwords do not match');
        return;
    }
    withBusy(document.getElementById('invite-btn'), 'Saving...', async () => {
        try {
            await postJson(`/logs/auth/invites/${encodeURIComponent(token)}/accept`, { password });
            await startEnroll();
        } catch (err) {
            showError(err.message);
        }
    });
});
