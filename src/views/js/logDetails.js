
        let id = window.location.pathname.slice(6);
        async function getLogData(id) {
            const response = await fetch(`/logs/api/logs/${id}`);
            const data = await response.json();
            
            document.getElementById('json').innerHTML = jsontohtml(data);
        }
        getLogData(id)
        
