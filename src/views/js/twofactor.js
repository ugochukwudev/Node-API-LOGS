// Shared sign-in steps for login.html and invite.html:
// authenticator enrollment, code entry and backup codes.
(function () {
  const $ = (id) => document.getElementById(id);

  const showStep = (name) => {
    document.querySelectorAll('[data-step]').forEach((el) => {
      el.hidden = el.dataset.step !== name;
    });
  };

  const showError = (message) => {
    const el = $('error-message');
    el.textContent = message;
    el.hidden = false;
  };

  const clearError = () => {
    $('error-message').hidden = true;
  };

  const postJson = async (url, body) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'Something went wrong');
    return data;
  };

  const withBusy = async (button, busyText, fn) => {
    const original = button.textContent;
    button.disabled = true;
    button.textContent = busyText;
    try {
      await fn();
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  };

  const showBackupCodes = (codes) => {
    const list = $('backup-codes');
    list.replaceChildren(
      ...codes.map((code) => {
        const li = document.createElement('li');
        li.textContent = code;
        li.className = 'font-mono text-white bg-gray-700 rounded px-3 py-2 text-center';
        return li;
      })
    );
    $('copy-backup-codes').onclick = () => {
      navigator.clipboard.writeText(codes.join('\n'));
      $('copy-backup-codes').textContent = 'Copied';
    };
    $('backup-continue').onclick = () => {
      window.location.href = '/logs/home';
    };
    showStep('backup');
  };

  const startEnroll = async () => {
    clearError();
    showStep('enroll');
    const res = await fetch('/logs/auth/2fa/setup');
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showError(data.message || 'Sign in again');
      return;
    }
    $('enroll-qr').src = data.qr;
    $('enroll-secret').textContent = data.secret.replace(/(.{4})/g, '$1 ').trim();
  };

  const startVerify = () => {
    clearError();
    showStep('verify');
    $('verify-code').focus();
  };

  const bind = () => {
    $('enroll-form').addEventListener('submit', (e) => {
      e.preventDefault();
      clearError();
      withBusy($('enroll-btn'), 'Checking...', async () => {
        try {
          const data = await postJson('/logs/auth/2fa/enable', { code: $('enroll-code').value });
          showBackupCodes(data.backupCodes);
        } catch (err) {
          showError(err.message);
        }
      });
    });

    let usingBackup = false;
    $('toggle-backup').addEventListener('click', () => {
      usingBackup = !usingBackup;
      $('verify-code').value = '';
      $('verify-code').placeholder = usingBackup ? 'Backup code, e.g. A1B2C-3D4E5' : '6-digit code';
      $('verify-code').inputMode = usingBackup ? 'text' : 'numeric';
      $('verify-code').maxLength = usingBackup ? 11 : 6;
      $('verify-label').textContent = usingBackup
        ? 'Enter one of your backup codes. Each code works once.'
        : 'Enter the 6-digit code from your authenticator app.';
      $('toggle-backup').textContent = usingBackup ? 'Use the authenticator app instead' : 'Lost your phone? Use a backup code';
    });

    $('verify-form').addEventListener('submit', (e) => {
      e.preventDefault();
      clearError();
      withBusy($('verify-btn'), 'Checking...', async () => {
        try {
          const value = $('verify-code').value;
          await postJson('/logs/auth/2fa/verify', usingBackup ? { backupCode: value } : { code: value });
          window.location.href = '/logs/home';
        } catch (err) {
          showError(err.message);
        }
      });
    });
  };

  window.TwoFactor = { bind, showStep, showError, clearError, postJson, withBusy, startEnroll, startVerify };
})();
