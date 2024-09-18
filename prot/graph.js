class Graph {
    constructor() {
        this.pickupPoints = new Set(); // Set to store pickup points
        this.destinations = new Set(); // Set to store destinations
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
                graph.addVertex(pickup); // Add pickup point to the graph
            });

            // Process destinations
            routeDestinations.forEach(destinationInfo => {
                const parts = destinationInfo.split('|');
                const destinationName = parts[0].trim();
                const distance = parseInt(parts[1].trim());

                graph.addVertex(destinationName); // Add destination to the graph
                graph.destinations.add(destinationName); // Update destinations set
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

function visualizeGraph(graph) {
  // Create datasets for nodes and edges in the format required by vis.js
  const nodes = new vis.DataSet(graph.getVertices().map(vertex => ({ id: vertex })));
  const edges = new vis.DataSet(graph.getEdges().map(edge => ({ from: edge.pickupPoint, to: edge.destination })));

  // Combine nodes and edges into a data object
  const data = { nodes, edges };

  // Customize the visualization options
  const options = {
    layout: {
      randomSeed: 2 // Ensure a consistent layout across page reloads
    },
    nodes: {
      shape: 'circle' // Display nodes as circles
    },
    edges: {
      arrows: {
        to: true // Show arrows indicating edge direction
      }
    }
  };

  // Create the graph visualization in the specified container
  const container = document.getElementById('graph');
  const network = new vis.Network(container, data, options);
}

// Define the main function
async function main() {
    try {
        const jsonFilePath = './YesBana.json';
        const graph = await loadGraphFromJSON(jsonFilePath);
        console.log(graph);
        visualizeGraph(graph);
        if (!graph) {
            console.log('Failed to load graph from JSON file.');
            return;
        }
        console.log('Graph loaded successfully.');
    } catch (error) {
        console.error('An error occurred:', error);
    }
}

// Call the main function
main();

