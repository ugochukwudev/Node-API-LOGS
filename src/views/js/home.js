// Global variable to track current time range
let currentTimeRange = '24h';

document.addEventListener('DOMContentLoaded', async () => {
  // Set up time range selector
  const timeRangeSelect = document.getElementById('time-range');
  if (timeRangeSelect) {
    timeRangeSelect.addEventListener('change', (e) => {
      currentTimeRange = e.target.value;
      loadDashboardData();
    });
  }

  // Load initial data
  await loadDashboardData();
  
  // Load system stats and charts (these don't depend on time range)
  await loadSystemStats();
  await loadCharts();
  
  // Initialize slow endpoints loading
  initSlowEndpoints();
});

async function loadDashboardData() {
  try {
    // Fetch metrics from API with time range
    const response = await fetch(`/logs/api/metrics?timeRange=${currentTimeRange}`);
    const data = await response.json();

    // Populate metrics cards (convert ms to seconds)
    const totalEl = document.getElementById('total-requests');
    totalEl.textContent = data.totalRequests;
    totalEl.classList.remove('bg-gray-700', 'animate-pulse');

    const avgEl = document.getElementById('avg-response');
    avgEl.textContent = (data.avgResponseTime / 1000).toFixed(2) + ' s';
    avgEl.classList.remove('bg-gray-700', 'animate-pulse');

    const errorEl = document.getElementById('error-count');
    errorEl.textContent = data.errorCount;
    errorEl.classList.remove('bg-gray-700', 'animate-pulse');

    // Populate slow endpoints list
    const slowList = document.getElementById('slow-list');
    slowList.classList.remove('animate-pulse');
    slowList.innerHTML = '';
    data.slowEndpoints.forEach(item => {
      const li = document.createElement('li');
      li.textContent = `${item._id} (${(item.avgTime / 1000).toFixed(3)} s)`;
      slowList.appendChild(li);
    });

    // Populate detailed table
    const tableBody = document.getElementById('slow-endpoints-body');
    data.slowEndpoints.forEach(item => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td class="px-4 py-2 border">${item._id}</td>
        <td class="px-4 py-2 border">${(item?.avgTime??0 / 1000).toFixed(3)} s</td>
        <td class="px-4 py-2 border">${item?.count??0}</td>
      `;
      tableBody.appendChild(row);
    });
  } catch (err) {
    console.error('Error loading metrics', err);
  }
}

// Helper: format seconds into human-readable years, months, weeks, days, hours, minutes, seconds
function formatUptime(seconds) {
  let s = Math.floor(seconds);
  const years = Math.floor(s / (3600 * 24 * 365)); s %= 3600 * 24 * 365;
  const months = Math.floor(s / (3600 * 24 * 30)); s %= 3600 * 24 * 30;
  const weeks = Math.floor(s / (3600 * 24 * 7)); s %= 3600 * 24 * 7;
  const days = Math.floor(s / (3600 * 24)); s %= 3600 * 24;
  const hours = Math.floor(s / 3600); s %= 3600;
  const mins = Math.floor(s / 60); s %= 60;
  const parts = [];
  if (years) parts.push(years + 'y');
  if (months) parts.push(months + 'mo');
  if (weeks) parts.push(weeks + 'w');
  if (days) parts.push(days + 'd');
  if (hours) parts.push(hours + 'h');
  if (mins) parts.push(mins + 'm');
  if (s) parts.push(s + 's');
  return parts.length ? parts.join(' ') : '0s';
}

async function loadSystemStats() {
  try {
    // Fetch system stats
    const sysRes = await fetch('/logs/api/system');
    const sys = await sysRes.json();
    // Memory usage
    const memEl = document.getElementById('mem-usage');
    memEl.textContent = sys.memUsage.toFixed(2) + ' %';
    // CPU load average
    document.getElementById('cpu-load').textContent = sys.loadAvg.map(n => n.toFixed(2)).join(', ');
    // System uptime
    document.getElementById('sys-uptime').textContent = formatUptime(sys.uptime);
    // Process RSS in MB
    const rssMB = sys.procMem.rss / (1024 * 1024);
    document.getElementById('proc-rss').textContent = rssMB.toFixed(2) + ' MB';
    // Process memory usage %
    const procPercentEl = document.createElement('div');
    procPercentEl.className = 'text-xs text-gray-400 mt-1';
    procPercentEl.textContent = `(${sys.procMemPercent.toFixed(2)}% of total RAM)`;
    document.getElementById('proc-rss').parentNode.appendChild(procPercentEl);
  } catch (err) {
    console.error('Error loading system stats', err);
  }
}

let trendsChart; // hold reference

async function loadTrends(windowKey = '7d') {
  try {
    const trRes = await fetch(`/logs/api/status-trends?window=${windowKey}`);
    const trendData = await trRes.json();
    const ctx = document.getElementById('trendsChart').getContext('2d');
    const config = {
      type: 'line',
      data: {
        labels: trendData.labels,
        datasets: [
          { label: '2xx Success', data: trendData.success, borderColor: '#10B981', backgroundColor: 'transparent' },
          { label: '4xx Client', data: trendData.client, borderColor: '#FBBF24', backgroundColor: 'transparent' },
          { label: '5xx Server', data: trendData.server, borderColor: '#EF4444', backgroundColor: 'transparent' }
        ]
      },
      options: {
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#CBD5E0' } }, x: { grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#CBD5E0' } } },
        plugins: { legend: { labels: { color: '#E2E8F0' } } }
      }
    };
    if (trendsChart) {
      trendsChart.data = config.data;
      trendsChart.options = config.options;
      trendsChart.update();
    } else {
      trendsChart = new Chart(ctx, config);
    }
  } catch (err) {
    console.error('Error loading status trends', err);
  }
}

async function loadCharts() {
  // Hook up trend-window selector
  const trendSelect = document.getElementById('trend-window');
  if (trendSelect) {
    trendSelect.addEventListener('change', e => loadTrends(e.target.value));
    await loadTrends(trendSelect.value);
  }
}

// Function to load slow endpoints based on selected window
async function loadSlowEndpoints(windowKey = '1d') {
  const slowList = document.getElementById('slow-list');
  const tableBody = document.getElementById('slow-endpoints-body');
  // Show loading state
  slowList.innerHTML = '<li class="text-gray-400">Loading...</li>';
  tableBody.innerHTML = '';
  try {
    const res = await fetch(`/logs/api/slow-endpoints?window=${windowKey}`);
    const { slowEndpoints } = await res.json();

    // Render list
    slowList.innerHTML = '';    
    slowEndpoints.forEach(item => {
      const li = document.createElement('li');
      li.className = 'text-slate-200 font-medium';
      li.textContent = `${item._id} (${(item.avgTime / 1000).toFixed(3)} s)`;
      slowList.appendChild(li);
    });

    // Render table
    tableBody.innerHTML = '';
    slowEndpoints.forEach(item => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="px-4 py-2 border text-gray-100">${item._id}</td>
        <td class="px-4 py-2 border text-gray-100">${(item.avgTime / 1000).toFixed(3)} s</td>
        <td class="px-4 py-2 border text-gray-100">${item.count}</td>
      `;
      tableBody.appendChild(tr);
    });
  } catch (err) {
    console.error('Error loading slow endpoints', err);
    slowList.innerHTML = '<li class="text-red-400 bg-red-500/10 border-red-500/20">Error loading data</li>';
  }
}

// Initialize slow endpoints loading
function initSlowEndpoints() {
  // Hook up slow-endpoints window selector
  const windowSelect = document.getElementById('slow-window');
  if (windowSelect) {
    windowSelect.addEventListener('change', (e) => {
      const key = e.target.value;
      loadSlowEndpoints(key);
    });
    // Initial load
    loadSlowEndpoints(windowSelect.value);
  }
} 