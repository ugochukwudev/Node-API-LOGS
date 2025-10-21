document.addEventListener('DOMContentLoaded', () => {
  const limit = 20;
let currentPage = 1;

  // Debounce function to delay API calls until user stops typing
  function debounce(func, delay) {
    let timeoutId;
    return function (...args) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
  }

  // Redirect to login page if any API call returns 401
  const originalFetch = window.fetch;
  window.fetch = async (...args) => {
    const res = await originalFetch(...args);
    if (res.status === 401) {
      window.location.href = '/logs/login';
    }
    return res;
  };

  // Fetch and render logs table
  async function fetchLogs(page = 1, showLoading = true) {
    currentPage = page;
    
    // Show loading state
    if (showLoading) {
      const container = document.getElementById('logs-container');
      container.innerHTML = `
        <tr>
          <td colspan="5" class="px-8 py-12 text-center">
            <div class="flex items-center justify-center space-x-3">
              <div class="loading-pulse"></div>
              <span class="text-slate-400">Loading logs...</span>
            </div>
          </td>
        </tr>
      `;
    }
    
    // Collect filters
    const endpoint = document.getElementById('filter-endpoint').value;
    const date = document.getElementById('filter-date').value;
    const time = document.getElementById('filter-time').value;
    const status = document.getElementById('filter-status').value;
    
    try {
      // Request logs
      const params = new URLSearchParams({ page, limit, endpoint, date, time, status });
      const res = await fetch(`/logs/api/logs?${params}`);
      const data = await res.json();
      
      // Populate table
      const container = document.getElementById('logs-container');
      container.innerHTML = '';
    data.logs.forEach(log => {
      // Determine colors based on status codes
      let statusColor = 'text-slate-200';
      let statusBg = '';
      let methodColor = 'text-slate-300';
      
      if (log.status >= 200 && log.status < 300) {
        // Success (2xx)
        statusColor = 'text-green-400';
        statusBg = 'bg-green-500/20';
        methodColor = 'text-green-300';
      } else if (log.status >= 300 && log.status < 400) {
        // Redirect (3xx)
        statusColor = 'text-blue-400';
        statusBg = 'bg-blue-500/20';
        methodColor = 'text-blue-300';
      } else if (log.status >= 400 && log.status < 500) {
        // Client Error (4xx)
        statusColor = 'text-yellow-400';
        statusBg = 'bg-yellow-500/20';
        methodColor = 'text-yellow-300';
      } else if (log.status >= 500) {
        // Server Error (5xx)
        statusColor = 'text-red-400';
        statusBg = 'bg-red-500/20';
        methodColor = 'text-red-300';
      }
      
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-800/30 transition-colors duration-200';
      tr.innerHTML = `
        <td class="px-8 py-6 border-b border-slate-800/50">
          <span class="px-2 py-1 rounded text-xs font-medium ${methodColor} bg-slate-800/50">${log.method}</span>
        </td>
        <td class="px-8 py-6 border-b border-slate-800/50 text-slate-200">
          <a href="/logs/${log._id}" class="hover:text-blue-400 transition-colors duration-200">${log.endpoint}</a>
        </td>
        <td class="px-8 py-6 border-b border-slate-800/50">
          <span class="px-3 py-1 rounded-full text-sm font-medium ${statusColor} ${statusBg} border border-current/20">
            ${log.status}
          </span>
        </td>
        <td class="px-8 py-6 border-b border-slate-800/50 text-slate-300">
          ${new Date(log.date).toLocaleString()}
        </td>
        <td class="px-8 py-6 border-b border-slate-800/50">
          <a href="/logs/${log._id}" class="text-blue-400 hover:text-blue-300 transition-colors duration-200 font-medium">
            View Details
          </a>
        </td>
      `;
      container.appendChild(tr);
    });
    
    // Pagination info
    const totalPages = Math.ceil(data.total / limit);
    document.getElementById('page-info').textContent = `Page ${page} of ${totalPages}`;
    document.getElementById('prev-btn').disabled = page <= 1;
    document.getElementById('next-btn').disabled = page >= totalPages;
    
    } catch (error) {
      console.error('Error fetching logs:', error);
      const container = document.getElementById('logs-container');
      container.innerHTML = `
        <tr>
          <td colspan="5" class="px-8 py-12 text-center">
            <div class="flex items-center justify-center space-x-3">
              <svg class="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
              <span class="text-red-400">Error loading logs. Please try again.</span>
            </div>
          </td>
        </tr>
      `;
    }
  }

  // Event hookups
  // Debounced search for endpoint filter (500ms delay)
  const debouncedFetchLogs = debounce(() => fetchLogs(1), 500);
  
  // Add visual feedback for typing
  document.getElementById('filter-endpoint').addEventListener('input', (e) => {
    // Add a visual indicator that search is pending
    const input = e.target;
    input.style.borderColor = '#3b82f6'; // Blue border while typing
    
    // Clear the border after search completes
    setTimeout(() => {
      input.style.borderColor = '';
    }, 500);
    
    debouncedFetchLogs();
  });
  
  // Immediate search for other filters
  ['filter-date','filter-time','filter-status'].forEach(id => {
    document.getElementById(id).addEventListener('change', () => fetchLogs(1));
  });
  document.getElementById('filter-clear').addEventListener('click', () => {
    ['filter-endpoint','filter-date','filter-time','filter-status'].forEach(id => document.getElementById(id).value = '');
    fetchLogs(1);
  });
  document.getElementById('prev-btn').addEventListener('click', () => fetchLogs(currentPage - 1));
  document.getElementById('next-btn').addEventListener('click', () => fetchLogs(currentPage + 1));

  // Initial load
  fetchLogs(1);
});