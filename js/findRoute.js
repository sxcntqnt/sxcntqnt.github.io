// Define the findRoute function
function findRoute() {
    // Get user input for starting point and destination
    var from = document.getElementById("from").value.trim().toLowerCase();
    var to = document.getElementById("to").value.trim().toLowerCase();

    // Fetch routes data
    fetch("YesBana.json")
        .then(response => response.json())
        .then(data => {
            // Search for routes from starting point to CBD
            var routesToCBD = data.filter(route => {
                return route.FIELD1.toLowerCase().includes(from) || route.FIELD2.toLowerCase().includes(from);
            });

            // Extract bus number(s) from routes to CBD
            var busesToCBD = routesToCBD.map(route => route.FIELD1 + " (TO CBD)");

            // Search for routes from CBD to destination
            var routesFromCBD = data.filter(route => {
                return route.FIELD2.toLowerCase().includes(to);
            });

            // Extract bus number(s) from routes from CBD
            var busesFromCBD = routesFromCBD.map(route => route.FIELD1 + " / " + route.FIELD2);

            // Combine results
            var result = [...busesToCBD, ...busesFromCBD];

            // Display results on the webpage
            displayResults(result);
        })
        .catch(error => {
            console.error("Error fetching data:", error);
        });
}

// Function to display the search results on the webpage
function displayResults(routes) {
    var resultDiv = document.getElementById("result");
    if (routes.length > 0) {
        resultDiv.innerHTML = "<h2>Route(s) found:</h2>";
        routes.forEach(route => {
            resultDiv.innerHTML += `<p>${route}</p>`;
        });
    } else {
        resultDiv.innerHTML = "<p>No route found for the given locations.</p>";
    }
}
