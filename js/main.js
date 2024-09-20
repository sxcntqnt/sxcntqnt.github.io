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

function initMap() {
  const mapOptions = {
    center: { lat: 1.2921, lng: 36.8219 },
    zoom: 12,
    mapTypeId: google.maps.MapTypeId.ROADMAP
  };

  const map = new google.maps.Map(document.getElementById('map'), mapOptions);

  window.map = map; // Make `map` accessible globally for use in other functions


    // Create a DirectionsService object
    var directionsService = new google.maps.DirectionsService();

    // Create a DirectionsRenderer object
    var directionsDisplay = new google.maps.DirectionsRenderer();

    // Bind the DirectionsRenderer to the map
    directionsDisplay.setMap(map);

    // Optional: Add traffic layer to the map
    var trafficLayer = new google.maps.TrafficLayer();
    trafficLayer.setMap(map);

    // Fetch origin and destination from the input fields
    var originInput = document.getElementById("origin").value;
    var destinationInput = document.getElementById("destination").value;

    // Convert origin and destination strings to LatLng objects
    geocodeAddress(originInput).then(function(origin) {
        geocodeAddress(destinationInput).then(function(destination) {
            // Create a DirectionsRequest object
            var request = {
                origin: origin,
                destination: destination,
                travelMode: google.maps.TravelMode.DRIVING
            };

            // Call the route method of the DirectionsService to get the directions
            directionsService.route(request, function(response, status) {
                if (status === 'OK') {
                    // Display the route on the map
                    directionsDisplay.setDirections(response);
                } else {
                    window.alert('Directions request failed due to ' + status);
                }
            });
        }).catch(function(error) {
            console.error('Error geocoding destination:', error);
        });
    }).catch(function(error) {
        console.error('Error geocoding origin:', error);
    });
}

// Function to convert address string to LatLng object
function geocodeAddress(address) {
    return new Promise(function(resolve, reject) {
        var geocoder = new google.maps.Geocoder();
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

// Function to initialize autocomplete for input fields
function initializeAutocomplete(input) {
    var autocomplete = new google.maps.places.Autocomplete(input, { types: ['(cities)'] });
}

class Graph {
    constructor() {
        this.pickupPoints = new HashSet(); // Set to store pickup points
        this.destinations = new HashSet(); // Set to store destinations
        this.adjacencyList = new Map(); // Adjacency list to store the connections between vertices
        this.vertexCoordinates = new Map(); // Map to store vertex coordinates
        this.vertexProperties = new Map(); // Map to store additional vertex properties
    }

    // Add a vertex (pickup point or destination) to the graph
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

    // Add an edge between two vertices
    addEdge(vertex1, vertex2, routeNumber) {
        if (!this.containsVertex(vertex1) || !this.containsVertex(vertex2)) {
            console.error("Vertices not found in the graph.");
            return;
        }
        // Add vertex2 to the adjacency list of vertex1
        this.adjacencyList.get(vertex1).add({ destination: vertex2, routeNumber });
        // For an undirected graph, uncomment the line below to add vertex1 to the adjacency list of vertex2
        // this.adjacencyList.get(vertex2).add({ destination: vertex1, routeNumber });
    }

    // Set vertex properties
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

    // Check if the graph contains a specific vertex
    containsVertex(vertex) {
        return this.pickupPoints.has(vertex) || this.destinations.has(vertex);
    }

    getVertexProperty(vertex) {
        return this.vertexProperties.get(vertex) || null;
    }

    getAdjacentVertices(vertex) {
        return this.adjacencyList.get(vertex) || null;
    }

    getVertexCoordinates(vertex) {
        return this.vertexCoordinates.get(vertex) || null;
    }

    // Function to check if the graph contains a specific edge and retrieve the route number
    getEdgeRoute(pickupPoint, destination) {
        const edgeKey = `${pickupPoint}_${destination}`;
        const edge = this.adjacencyList.get(pickupPoint);
        if (edge) {
            for (const { destination: dest, routeNumber } of edge) {
                if (dest === destination) {
                    return routeNumber;
                }
            }
        }
        return null; // Return null if the edge does not exist
    }

    // Function to get all edges in the graph
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

    // Function to check if the graph contains a specific edge (combined with getEdgeRoute)
    containsEdge(pickupPoint, destination) {
        const edge = this.adjacencyList.get(pickupPoint);
        if (edge) {
            for (const { destination: dest } of edge) {
                if (dest === destination) {
                    return true;
                }
            }
        }
        return false;
    }
}

// Instantiate the HashSet class for managing sets
class HashSet {
  constructor() {
    this.map = new Map();
  }

  // Method to add a value to the set
  add(value) {
    this.map.set(value, true);
  }

  // Method to delete a value from the set
  delete(value) {
    this.map.delete(value);
  }

  // Method to check if the set contains a value
  has(value) {
    return this.map.has(value);
  }

  // Method to get an array of values in the set
  values() {
    return Array.from(this.map.keys());
  }

  // Method to get the size of the set
  size() {
    return this.map.size;
  }
}

async function loadGraphFromJSON(jsonFile) {
    try {
        const response = await fetch(jsonFile);
        const data = await response.json();
        const graph = new Graph();

        data.forEach(routeData => {
            const routeNumber = routeData["route_number"];
            const pickupPoint = routeData["pickup_point"];
            const routeDestinations = routeData["destinations"];

            const pickupPoints = pickupPoint.split('/');

            // Add pickup points to the graph
            pickupPoints.forEach(pickup => {
                graph.addVertex(pickup.toLowerCase()); // Add pickup point to the graph
            });

            // Process destinations
            routeDestinations.forEach(destinationInfo => {
                const parts = destinationInfo.split('|');
                const destinationName = parts[0].trim();
                const distance = parseInt(parts[1].trim());

                graph.addVertex(destinationName); // Add destination to the graph
                graph.destinations.add(destinationName.toLowerCase()); // Update destinations set
                graph.setVertexProperty(destinationName, 'heuristic_distance', distance); // Add heuristic distance property

                // Connect each destination to all pickup points
                pickupPoints.forEach(pickup => {
                    graph.addEdge(pickup, destinationName, routeNumber);
                });
            });
        });

        return graph;
    } catch (error) {
        console.error('Error loading graph from JSON file:', error);
        return null;
    }
}

// Define the main function
async function main() {
    try {
        // Load graph data from JSON file
        const jsonFilePath = '../json/YesBana.json'; // Adjust the file path as needed
        const graph = await loadGraphFromJSON(jsonFilePath);

        // Check if the graph was successfully loaded
        if (!graph) {
            console.log('Failed to load graph from JSON file.');
            return;
        }

        console.log('Graph loaded successfully.');

        // Get origin and destination locations from user input
        const origin = document.getElementById("origin").value.trim().toLowerCase();
        const destination = document.getElementById("destination").value.trim().toLowerCase();

        // Validate if both origin and destination are provided
        if (!origin || !destination) {
            console.log('Please provide both origin and destination locations.');
            return;
        }

        // Get additional locations from input fields
        const additionalLocations = await getAdditionalLocations(); // Assuming there's an asynchronous function to get additional locations

        // Log all the values retrieved
        console.log("Origin:", origin);
        console.log("Destination:", destination);
        console.log("Additional Locations:", additionalLocations);
        console.log("graph", graph)

        // Call findMat function with necessary parameters
        window.findMat(origin, destination, additionalLocations, graph);

        // Wait for the Google Maps API to load before initializing the map and calling other functions
        loadGoogleMapsAPI(() => {
            // Initialize the map globally
            let map;
            initMap();

            if (!origin || !destination || !graph) {
                console.log('Invalid graph data or missing origin/destination.');
            }
        });
    } catch (error) {
        console.error('An error occurred:', error);
    }
}

// Call main function to start the program
main();
