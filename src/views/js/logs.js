let currentPage = 1;
const limit = 20;

async function fetchLogs(page = 1) {
    const endpoint = document.querySelector('input[placeholder="Search for endpoint"]').value || '';
    const date = document.querySelector('input[type="date"]').value || '';
    const time = document.querySelector('input[type="time"]').value || '';
    const status = document.querySelector('input[placeholder="request status"]').value || '';
    const pagination = document.querySelector('input[placeholder="pagination number"]').value || page;

    const queryParams = new URLSearchParams({
        page: pagination,
        limit,
        endpoint,
        date,
        time,
        status
    }).toString();

    const response = await fetch(`/logs/api/logs?${queryParams}`);
    const data = await response.json();
    const logsContainer = document.getElementById('logs-container');
    logsContainer.innerHTML = '';

    if (!data.logs) {
        if(data.message=="Invalid token"){
            window.location.pathname="/logs/login";
        }
        return alert(JSON.stringify(data.message));
    }

    data.logs.forEach(log => {
        const string_text = log.status.toLocaleString();
        const text_color = string_text.startsWith("2") ? "green" : string_text.startsWith("3") ? "yellow" : string_text.startsWith("4") ? "blue" : string_text.startsWith("5") ? "red" : "purple";
        const row = document.createElement('tr');
        row.innerHTML = `
            <td style="color:${text_color};">${log.method}</td>
            <td style="color:${text_color};"><a href="/logs/${log._id}">${log.endpoint}</a></td>
            <td style="color:${text_color};">${log.status}</td>
            <td style="color:${text_color};">${new Date(log.date).toLocaleString()}</td>
        `;
        logsContainer.appendChild(row);
    });

    document.getElementById('page-info').textContent = `Page ${page} of ${Math.ceil(data.total / limit)}`;
    document.getElementById('prev-btn').disabled = page === 1;
    document.getElementById('next-btn').disabled = page * limit >= data.total;
}

// Add onchange event listeners to the inputs
document.querySelector('input[placeholder="Search for endpoint"]').addEventListener('change', () => fetchLogs(currentPage));
document.querySelector('input[type="date"]').addEventListener('change', () => fetchLogs(currentPage));
document.querySelector('input[type="time"]').addEventListener('change', () => fetchLogs(currentPage));
document.querySelector('input[placeholder="request status"]').addEventListener('change', () => fetchLogs(currentPage));
document.querySelector('input[placeholder="pagination number"]').addEventListener('change', () => {
    currentPage = document.querySelector('input[placeholder="pagination number"]').value || 1;
    fetchLogs(currentPage);
});

document.getElementById('prev-btn').addEventListener('click', () => {
    if (currentPage > 1) {
        currentPage--;
        fetchLogs(currentPage);
    }
});

document.getElementById('next-btn').addEventListener('click', () => {
    currentPage++;
    fetchLogs(currentPage);
});

document.querySelector('button').addEventListener('click', () => {
    document.querySelector('input[type="date"]').value = '';
    document.querySelector('input[type="time"]').value = '';
    fetchLogs(currentPage);
});

fetchLogs(currentPage);