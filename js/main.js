let response; // Define the response variable outside the setInterval function

// Periodically check ETA based on live traffic conditions
setInterval(() => {
    // Check if response is defined and contains the required data
    if (response && response.routes && response.routes.length > 0 &&
        response.routes[0].legs && response.routes[0].legs.length > 0) {
        const actualRoute = response.routes[0];
        let actualDistancesSum = 0;
        let actualTimesSum = 0;

        actualRoute.legs.forEach(function(leg) {
            actualDistancesSum += ((new google.maps.DistanceMatrixService()).fromLatLngToPoint(leg.start_location)).toMeters();
            actualTimesSum += leg.duration.value;
        });

        const etaMinutes = Math.ceil(actualTimesSum / 60);
        document.getElementById("estimatedTime").innerText = etaMinutes + ' min';
    }
}, 5 * 60 * 1000); // Check every 5 minutes

document.addEventListener('DOMContentLoaded', function() {
    initMap();
});

async function initMap() {
    const mapOptions = {
        center: { lat: 1.2921, lng: 36.8219 },
        zoom: 12,
        mapTypeId: google.maps.MapTypeId.ROADMAP
    };

    const map = new google.maps.Map(document.getElementById('map'), mapOptions);
    window.map = map; // Make `map` accessible globally for use in other functions

    // Create a DirectionsService object
    const directionsService = new google.maps.DirectionsService();
    const directionsDisplay = new google.maps.DirectionsRenderer();
    directionsDisplay.setMap(map); // Bind the DirectionsRenderer to the map

    // Optional: Add traffic layer to the map
    const trafficLayer = new google.maps.TrafficLayer();
    trafficLayer.setMap(map);

    // Fetch origin and destination from the input fields
    const originInput = document.getElementById("origin").value;
    const destinationInput = document.getElementById("destination").value;

    try {
        const origin = await geocodeAddress(originInput);
        const destination = await geocodeAddress(destinationInput);

        // Fetch route details from Dgraph
        const additionalLocations = await getAdditionalLocations();
        const routeDetails = await fetchRouteDetails(originInput, destinationInput, additionalLocations);

        if (routeDetails) {
            const request = {
                origin: origin,
                destination: destination,
                travelMode: google.maps.TravelMode.DRIVING
            };

            // Call the route method of the DirectionsService to get the directions
            directionsService.route(request, function(response, status) {
                if (status === 'OK') {
                    // Display the route on the map
                    directionsDisplay.setDirections(response);
                    window.response = response; // Save response for ETA checking
                } else {
                    window.alert('Directions request failed due to ' + status);
                }
            });
        } else {
            console.error("Failed to fetch route details from Dgraph.");
        }
    } catch (error) {
        console.error('Error geocoding addresses or fetching route:', error);
    }
}

// Function to convert address string to LatLng object
function geocodeAddress(address) {
    return new Promise(function(resolve, reject) {
        const geocoder = new google.maps.Geocoder();
        geocoder.geocode({ address: address }, function(results, status) {
            if (status === 'OK' && results[0]) {
                resolve(results[0].geometry.location);
            } else {
                reject('Geocode was not successful for the following reason: ' + status);
            }
        });
    });
}

// Load Google Maps API asynchronously
function loadGoogleMapsAPI(callback) {
    const script = document.createElement('script');
    script.src = 'https://maps.googleapis.com/maps/api/js?key=AIzaSyAk4DSvWZU1IwLX3bITVDEGTsRnWu0Vu3U&callback=initMap&libraries=places&v=weekly'; // Replace YOUR_API_KEY with your actual API key
    document.head.appendChild(script);
}

// Function to fetch route details using Dgraph
async function fetchRouteDetails(origin, destination, additionalLocations) {
    const query = `
        query($origin: String!, $destination: String!, $additionalLocations: [String!]) {
            findRoute(origin: $origin, destination: $destination, additionalLocations: $additionalLocations) {
                edges {
                    source
                    destination
                    routeNumber
                }
            }
        }
    `;

    const variables = {
        origin,
        destination,
        additionalLocations
    };

    const response = await fetch('https://blue-surf-1310330.us-east-1.aws.cloud.dgraph.io/graphql', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, variables }),
    });

    const data = await response.json();
    return data.data.findRoute.edges;
}

// Function to initialize autocomplete for input fields
function initializeAutocomplete(input) {
    const autocomplete = new google.maps.places.Autocomplete(input, { types: ['(cities)'] });
}

class Graph {
    constructor() {
        this.pickupPoints = new HashSet(); // Set to store pickup points
        this.destinations = new HashSet(); // Set to store destinations
        this.adjacencyList = new Map(); // Adjacency list to store the connections between vertices
        this.vertexCoordinates = new Map(); // Map to store vertex coordinates
        this.vertexProperties = new Map(); // Map to store additional vertex properties
    }

    addVertex(vertex) {
        if (!this.containsVertex(vertex)) {
            if (vertex.startsWith("pickup")) {
                this.pickupPoints.add(vertex);
            } else {
                this.destinations.add(vertex);
            }
            this.adjacencyList.set(vertex, new Set());
        }
    }

    addEdge(vertex1, vertex2, routeNumber) {
        if (!this.containsVertex(vertex1) || !this.containsVertex(vertex2)) {
            console.error("Vertices not found in the graph.");
            return;
        }
        this.adjacencyList.get(vertex1).add({ destination: vertex2, routeNumber });
    }

    setVertexProperty(vertex, property, value) {
        if (property === 'latlng' && typeof value === 'object' && value !== null) {
            if ('latitude' in value && 'longitude' in value) {
                this.vertexCoordinates.set(vertex, value);
            }
        } else {
            if (!this.vertexProperties.has(vertex)) {
                this.vertexProperties.set(vertex, new Map());
            }
            this.vertexProperties.get(vertex).set(property, value);
        }
    }

    containsVertex(vertex) {
        return this.pickupPoints.has(vertex) || this.destinations.has(vertex);
    }

    getAdjacentVertices(vertex) {
        return this.adjacencyList.get(vertex) || null;
    }

    getVertexCoordinates(vertex) {
        return this.vertexCoordinates.get(vertex) || null;
    }

    getEdges() {
        const edges = [];
        for (const [vertex, adjList] of this.adjacencyList.entries()) {
            for (const { destination, routeNumber } of adjList) {
                edges.push({ pickupPoint: vertex, destination, routeNumber });
            }
        }
        return edges;
    }

    getVertices() {
        return [...this.pickupPoints.values(), ...this.destinations.values()];
    }
}

class HashSet {
    constructor() {
        this.map = new Map();
    }

    add(value) {
        this.map.set(value, true);
    }

    delete(value) {
        this.map.delete(value);
    }

    has(value) {
        return this.map.has(value);
    }

    values() {
        return Array.from(this.map.keys());
    }

    size() {
        return this.map.size;
    }
}

// Define the main function
async function main() {
    try {
        // Get origin and destination locations from user input
        const origin = document.getElementById("origin").value.trim().toLowerCase();
        const destination = document.getElementById("destination").value.trim().toLowerCase();

        // Validate if both origin and destination are provided
        if (!origin || !destination) {
            console.log('Please provide both origin and destination locations.');
            return;
        }

        // Get additional locations from input fields
        const additionalLocations = await getAdditionalLocations();

        console.log("Origin:", origin);
        console.log("Destination:", destination);
        console.log("Additional Locations:", additionalLocations);

        // Call findMat function with necessary parameters
        const graph = new Graph(); // Initialize the graph
        const routeDetails = await fetchRouteDetails(origin, destination, additionalLocations);

        if (routeDetails) {
            window.findMat(origin, destination, additionalLocations, graph);
        }

        // Load Google Maps API
        loadGoogleMapsAPI(() => {
            initMap();
        });
    } catch (error) {
        console.error('An error occurred:', error);
    }
}

// Call main function to start the program
main();
