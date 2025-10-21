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
    if (status >= 200 && status < 300) return 'text-green-400';
    if (status >= 300 && status < 400) return 'text-blue-400';
    if (status >= 400 && status < 500) return 'text-yellow-400';
    if (status >= 500) return 'text-red-400';
    return 'text-slate-400';
  }

  function statusBgColor(status) {
    if (status >= 200 && status < 300) return 'bg-green-500/20';
    if (status >= 300 && status < 400) return 'bg-blue-500/20';
    if (status >= 400 && status < 500) return 'bg-yellow-500/20';
    if (status >= 500) return 'bg-red-500/20';
    return 'bg-slate-500/20';
  }

  function methodColor(method) {
    switch(method.toLowerCase()) {
      case 'get': return 'text-blue-400 bg-blue-500/20';
      case 'post': return 'text-green-400 bg-green-500/20';
      case 'put': return 'text-yellow-400 bg-yellow-500/20';
      case 'patch': return 'text-orange-400 bg-orange-500/20';
      case 'delete': return 'text-red-400 bg-red-500/20';
      default: return 'text-slate-400 bg-slate-500/20';
    }
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
      
      // Enhanced metadata display with modern design
      metaEl.innerHTML = `
        <div class="bg-slate-900/50 rounded-lg p-6 border border-slate-700/50">
          <div class="flex items-center justify-between mb-6">
            <div class="flex items-center space-x-3">
              <div class="w-10 h-10 bg-gradient-to-br from-slate-500/20 to-slate-600/20 rounded-lg flex items-center justify-center">
                <svg class="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                </svg>
              </div>
              <div>
                <h3 class="text-lg font-semibold text-white">Request Information</h3>
                <p class="text-sm text-slate-400">Complete request details and metadata</p>
              </div>
            </div>
          </div>
          
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div class="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
              <div class="flex items-center justify-between mb-2">
                <span class="text-sm font-medium text-slate-400">Method</span>
                <span class="px-3 py-1 rounded-full text-xs font-medium ${methodColor(log.method)}">${log.method}</span>
              </div>
              <div class="text-white font-mono text-sm">${log.method}</div>
            </div>
            
            <div class="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
              <div class="flex items-center justify-between mb-2">
                <span class="text-sm font-medium text-slate-400">Status</span>
                <span class="px-3 py-1 rounded-full text-xs font-medium ${statusColor(log.status)} ${statusBgColor(log.status)}">${log.status}</span>
              </div>
              <div class="text-white font-mono text-sm">${log.status}</div>
            </div>
            
            <div class="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
              <div class="flex items-center justify-between mb-2">
                <span class="text-sm font-medium text-slate-400">Response Time</span>
                <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
              </div>
              <div class="text-white font-mono text-sm">${log.responseTime} ms</div>
            </div>
            
            <div class="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50 md:col-span-2 lg:col-span-3">
              <div class="flex items-center justify-between mb-2">
                <span class="text-sm font-medium text-slate-400">Endpoint</span>
                <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path>
                </svg>
              </div>
              <div class="text-white font-mono text-sm break-all">${log.endpoint}</div>
            </div>
            
            <div class="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
              <div class="flex items-center justify-between mb-2">
                <span class="text-sm font-medium text-slate-400">IP Address</span>
                <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
                </svg>
              </div>
              <div class="text-white font-mono text-sm">${log.ip}</div>
            </div>
            
            <div class="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
              <div class="flex items-center justify-between mb-2">
                <span class="text-sm font-medium text-slate-400">Date & Time</span>
                <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                </svg>
              </div>
              <div class="text-white font-mono text-sm">${new Date(log.date).toLocaleString()}</div>
            </div>
          </div>
        </div>
      `;
      
      // Set content for the sections
      reqPre.textContent = JSON.stringify(log.requestBody, null, 2);
      resPre.textContent = JSON.stringify(log.responseBody, null, 2);
      headersPre.textContent = JSON.stringify(log.headers, null, 2);
      document.getElementById('sessionLogsContent').textContent = log.sessionLogs.join('\n');
    } catch (err) {
      console.error(err);
      metaEl.innerHTML = `
        <div class="card">
          <div class="flex items-center space-x-3">
            <div class="w-10 h-10 bg-gradient-to-br from-red-500/20 to-red-600/20 rounded-lg flex items-center justify-center">
              <svg class="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
            </div>
            <div>
              <h3 class="text-lg font-semibold text-red-400">Error Loading Log Details</h3>
              <p class="text-sm text-slate-400">Failed to fetch log information</p>
            </div>
          </div>
        </div>
      `;
    }
  }

  reqCopyBtn.addEventListener('click', () => copyToClipboard(reqPre.textContent, reqCopyBtn));
  resCopyBtn.addEventListener('click', () => copyToClipboard(resPre.textContent, resCopyBtn));
  headersCopyBtn.addEventListener('click', () => copyToClipboard(headersPre.textContent, headersCopyBtn));
  sessionCopyBtn.addEventListener('click', () => copyToClipboard(document.getElementById('sessionLogsContent').textContent, sessionCopyBtn));

  loadLog();
});
        
