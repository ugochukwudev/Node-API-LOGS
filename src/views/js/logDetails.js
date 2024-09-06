
        let id = window.location.pathname.slice(6);
        async function getLogData(id) {
            const response = await fetch(`/logs/api/logs/${id}`);
            const data = await response.json();
            console.log(data);
            document.getElementById('json').innerHTML = jsontohtml(data);
        }
        getLogData(id)
        
