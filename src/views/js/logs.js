document.addEventListener('DOMContentLoaded', () => {
  const limit = 20;
  let currentPage = 1;

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
  async function fetchLogs(page = 1) {
    currentPage = page;
    // Collect filters
    const endpoint = document.getElementById('filter-endpoint').value;
    const date = document.getElementById('filter-date').value;
    const time = document.getElementById('filter-time').value;
    const status = document.getElementById('filter-status').value;
    // Request logs
    const params = new URLSearchParams({ page, limit, endpoint, date, time, status });
    const res = await fetch(`/logs/api/logs?${params}`);
    const data = await res.json();
    // Populate table
    const container = document.getElementById('logs-container');
    container.innerHTML = '';
    data.logs.forEach(log => {
      const color = log.status < 300 ? 'text-green-500' : log.status < 400 ? 'text-yellow-400' : 'text-red-500';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="px-4 py-2 ${color}">${log.method}</td>
        <td class="px-4 py-2 ${color}"><a href="/logs/${log._id}" class="hover:underline">${log.endpoint}</a></td>
        <td class="px-4 py-2 ${color}">${log.status}</td>
        <td class="px-4 py-2 text-gray-200">${new Date(log.date).toLocaleString()}</td>
        <td class="px-4 py-2"><a href="/logs/${log._id}" class="text-blue-400 hover:underline">Details</a></td>
      `;
      container.appendChild(tr);
    });
    // Pagination info
    const totalPages = Math.ceil(data.total / limit);
    document.getElementById('page-info').textContent = `Page ${page} of ${totalPages}`;
    document.getElementById('prev-btn').disabled = page <= 1;
    document.getElementById('next-btn').disabled = page >= totalPages;
  }

  // Event hookups
  document.getElementById('filter-endpoint').addEventListener('input', () => fetchLogs(1));
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