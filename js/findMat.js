//let directionsResponse; // This should match the global variable name in main.js


export function handleDirectionsResponse(directionsResponse) {
    // Process the directionsResponse here
    console.log('Received directions response in findMat.js:', directionsResponse);

    // Implement your logic to handle the directions response
}

window.handleDirectionsResponse = handleDirectionsResponse;


/*
// Class for Union-Find data structure
class UnionFind {
    constructor(size) {
        this.parent = new Array(size).fill(-1);
    }

    find(x) {
        if (this.parent[x] === -1) return x;
        return this.find(this.parent[x]);
    }

    union(x, y) {
        let rootX = this.find(x);
        let rootY = this.find(y);
        if (rootX !== rootY) {
            this.parent[rootX] = rootY;
        }
    }
}

// Function to convert address string to LatLng object
function geocodeAddress(address) {
    return new Promise((resolve, reject) => {
        const geocoder = new google.maps.Geocoder();
        geocoder.geocode({ address: address }, (results, status) => {
            if (status === 'OK' && results[0]) {
                resolve(results[0].geometry.location);
            } else {
                reject('Geocode was not successful for the following reason: ' + status);
            }
        });
    });
}



// Main function to find the route
export async function findMat(origin, destination, additionalLocations, graph)  {
    // Error handling for missing vertices
    if (!graph.containsVertex(origin) || !graph.containsVertex(destination)) {
        console.error("Origin or destination vertex not found in the graph.");
        return null;
    }

    // Find connected components using Union-Find
    const connectedComponents = findConnectedComponents(graph);

    // Find the relevant component containing origin, destination, and additional locations
    let relevantComponent = null;
    for (const component of connectedComponents) {
        if (component.includes(origin) && component.includes(destination) && 
            additionalLocations.every(location => component.includes(location))) {
            relevantComponent = component;
            break;
        }
    }

    // If relevant component found, fetch edges connected to its vertices
    if (relevantComponent) {
        const relevantEdges = await fetchRouteDetails(origin, destination, additionalLocations);
        return relevantEdges;
    } else {
        console.error("No connected component containing origin, destination, and additional locations found.");
        return null;
    }
}

window.getAdditionalLocations = async function() {
    const additionalLocations = [];
    const inputs = document.querySelectorAll('#additionalLocations input[type="text"]');
    inputs.forEach(input => {
        if (input.value.trim() !== '') {
            additionalLocations.push(input.value.trim());
        }
    });
    return additionalLocations;
}



function findConnectedComponents(graph) {
    const numVertices = Object.keys(graph).length;
    const uf = new UnionFind(numVertices);

    // Union all edges in the graph
    for (const vertex in graph) {
        const neighbors = graph[vertex];
        for (const neighbor of neighbors) {
            uf.union(vertex, neighbor); // Assuming neighbor is a vertex identifier
        }
    }

    // Collect connected components
    const componentsMap = new Map();
    for (const vertex in graph) {
        const root = uf.find(vertex);
        if (!componentsMap.has(root)) {
            componentsMap.set(root, []);
        }
        componentsMap.get(root).push(vertex);
    }

    return Array.from(componentsMap.values());
}

window.findMat = async function(origin, destination, additionalLocations, graph) {
    // Error handling for missing vertices
    if (!graph.containsVertex(origin) || !graph.containsVertex(destination)) {
        console.error("Origin or destination vertex not found in the graph.");
        return null;
    }

    // Find connected components using Union-Find
    const connectedComponents = findConnectedComponents(graph);

    // Find the connected component containing origin, destination, and additional locations
    let relevantComponent = null;
    for (const component of connectedComponents) {
        if (component.includes(origin) && component.includes(destination)) {
            let containsAllAdditionalLocations = true;
            for (const location of additionalLocations) {
                if (!component.includes(location)) {
                    containsAllAdditionalLocations = false;
                    break;
                }
            }
            if (containsAllAdditionalLocations) {
                relevantComponent = component;
                break;
            }
        }
    }

    // If relevant component found, extract edges connected to its vertices
    if (relevantComponent) {
        const relevantEdges = [];
        for (const vertex of relevantComponent) {
            const edges = graph[vertex];
            for (const { destination, routeNumber } of edges) {
                if (relevantComponent.includes(destination)) {
                    relevantEdges.push({ source: vertex, destination, routeNumber });
                }
            }
        }
        return relevantEdges;
    } else {
        console.error("No connected component containing origin, destination, and additional locations found.");
        return null;
    }
}


// Function to reconstruct the path from the cameFrom map
function reconstructPath(cameFrom, current) {
    const path = [];
    while (cameFrom.has(current)) {
        path.unshift(current);
        current = cameFrom.get(current);
    }
    path.unshift(current); // Add the origin vertex
    console.log('Reconstructed path:', path);
    return path;
}

// Method to check if all specified locations are found in the path
function locationsFound(parentMap, locations, from, to) {
    let currentVertex = to;
    let foundLocations = new HashSet();

    // Updated this condition to prevent comparison mistakes
    if (Array.isArray(locations) && locations.includes(currentVertex.toString())) {
        foundLocations.add(currentVertex);
    }

    // Traverse parentMap from destination to source and track visited locations
    while (currentVertex !== undefined && currentVertex !== from) {
        currentVertex = parentMap.get(currentVertex);
        if (Array.isArray(locations) && locations.includes(currentVertex.toString())) {
            foundLocations.add(currentVertex);
        }
    }

    // Check if all specified locations are found in the path
    return locations.every(location => foundLocations.has(location));
}

// Display BFS results
function displayBFSResults(parentMap, from, to) {
    let currentVertex = to;
    const path = [];

    while (currentVertex !== from) {
        path.unshift(currentVertex);
        currentVertex = parentMap.get(currentVertex);
    }
    path.unshift(from);

    console.log('BFS results:');
    console.log(path);
}

// Function to display BFS results and route details
function displayResults(parentMap, from, to) {
    const resultDiv = document.getElementById('result');

    // Display BFS results using displayBFSResults function
    displayBFSResults(parentMap, from, to);

    // Display route details
    resultDiv.innerHTML = "<h2>Route Details:</h2>";
    const htmlContent = `<p><strong>Start Address:</strong> ${from}</p>
                         <p><strong>End Address:</strong> ${to}</p>`;
    resultDiv.innerHTML += htmlContent;
}

//const adjacentVertices = routesGraph.getAdjacentVertices(fromVertex);
//console.log(`Adjacent vertices of ${fromVertex}:`, adjacentVertices);

//const vertexCoordinates = routesGraph.getVertexCoordinates(vertex);
//console.log(`GPS coordinates of ${vertex}:`, vertexCoordinates);

//const route = routesGraph.findRoute(fromLocation, toLocation, viaVertices);
//console.log("Route:", route);
*/
