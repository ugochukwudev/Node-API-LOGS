document.addEventListener('DOMContentLoaded', () => {
  const id = window.location.pathname.split('/').pop();
  const metaEl = document.getElementById('meta');
  const reqPre = document.getElementById('requestBodyContent');
  const resPre = document.getElementById('responseBodyContent');
  const headersPre = document.getElementById('headersContent');
  const reqCopyBtn = document.getElementById('requestBodyCopyBtn');
  const resCopyBtn = document.getElementById('responseBodyCopyBtn');
  const headersCopyBtn = document.getElementById('headersCopyBtn');
  const sessionCopyBtn = document.getElementById('sessionLogsCopyBtn');

  function statusColor(status) {
    if (status < 300) return 'text-green-500';
    if (status < 400) return 'text-yellow-400';
    return 'text-red-500';
  }

  function copyToClipboard(text, btn) {
    navigator.clipboard.writeText(text).then(() => {
      const original = btn.innerText;
      btn.innerText = 'Copied!';
      setTimeout(() => btn.innerText = original, 2000);
    }).catch(err => console.error('Copy failed', err));
  }

  async function loadLog() {
    try {
      const res = await fetch(`/logs/api/logs/${id}`);
      const { log } = await res.json();
      metaEl.innerHTML = `
        <div class="grid grid-cols-2 gap-4 bg-gray-800 p-4 rounded shadow">
          <div><strong>Method:</strong> ${log.method}</div>
          <div><strong>Endpoint:</strong> ${log.endpoint}</div>
          <div><strong>Status:</strong> <span class="${statusColor(log.status)}">${log.status}</span></div>
          <div><strong>Response Time:</strong> ${log.responseTime} ms</div>
          <div><strong>IP:</strong> ${log.ip}</div>
          <div><strong>Date:</strong> ${new Date(log.date).toLocaleString()}</div>
        </div>
      `;
      reqPre.textContent = JSON.stringify(log.requestBody, null, 2);
      resPre.textContent = JSON.stringify(log.responseBody, null, 2);
      headersPre.textContent = JSON.stringify(log.headers, null, 2);
      document.getElementById('sessionLogsContent').textContent = log.sessionLogs.join('\n');
    } catch (err) {
      console.error(err);
      metaEl.innerHTML = `<p class="text-red-500">Error loading log details.</p>`;
    }
  }

  reqCopyBtn.addEventListener('click', () => copyToClipboard(reqPre.textContent, reqCopyBtn));
  resCopyBtn.addEventListener('click', () => copyToClipboard(resPre.textContent, resCopyBtn));
  headersCopyBtn.addEventListener('click', () => copyToClipboard(headersPre.textContent, headersCopyBtn));
  sessionCopyBtn.addEventListener('click', () => copyToClipboard(document.getElementById('sessionLogsContent').textContent, sessionCopyBtn));

  loadLog();
});
        
