let globalRoutesDAG = null; // Variable to store the global routes DAG

// Function to remove empty dictionaries from an object
function removeEmptyDicts(obj) {
    if (Array.isArray(obj)) {
        // If it's an array, recursively clean each item
        return obj
            .map(removeEmptyDicts) // Recursively process each item
            .filter(item => item !== null && item !== undefined && Object.keys(item).length > 0); // Remove empty items
    } else if (typeof obj === 'object' && obj !== null) {
        // If it's an object, recursively clean each key-value pair
        return Object.fromEntries(
            Object.entries(obj)
                .map(([key, value]) => [key, removeEmptyDicts(value)]) // Recursively process value
                .filter(([key, value]) => value !== null && value !== undefined && Object.keys(value).length > 0) // Remove empty entries
        );
    }
    // Return the item as is if it's neither an object nor an array
    return obj;
}

// Function to decode Google Maps encoded polyline string
function decodePolyline(polylineStr) {
    let index = 0;
    let lat = 0;
    let lng = 0;
    const coordinates = [];

    while (index < polylineStr.length) {
        // Decode latitude
        let b = 0;
        let shift = 0;
        let result = 0;
        let byte = null;
        
        do {
            byte = polylineStr.charCodeAt(index++) - 63;
            result |= (byte & 0x1f) << shift;
            shift += 5;
        } while (byte >= 0x20);
        
        lat += (result >> 1) ^ (-(result & 1));

        // Decode longitude
        shift = 0;
        result = 0;

        do {
            byte = polylineStr.charCodeAt(index++) - 63;
            result |= (byte & 0x1f) << shift;
            shift += 5;
        } while (byte >= 0x20);

        lng += (result >> 1) ^ (-(result & 1));

        // Convert coordinates from integers to floats
        coordinates.push([lat / 1E5, lng / 1E5]);
    }

    return coordinates;
}
// The buildDAG function uses these decoded coordinates to create a Directed Acyclic Graph (DAG) based on H3 cells.
function buildDAG(coordinates, resolution) {
    const dag = {};

    for (let i = 0; i < coordinates.length; i++) {
        const [lat, lng] = coordinates[i];
        const h3Index = h3.latLngToCell(lat, lng, resolution);

        // Initialize the DAG node if it doesn't exist
        if (!dag[h3Index]) {
            dag[h3Index] = {
                neighbors: [],
                coordinate: [lat, lng],
            };
        }

        // Connect to the previous coordinate's H3 index
        if (i > 0) {
            const prevH3Index = h3.latLngToCell(coordinates[i - 1][0], coordinates[i - 1][1], resolution);

            // Check if the current index is adjacent to the previous index using areNeighborCells
            if (h3.areNeighborCells(prevH3Index, h3Index)) {
                // Add the current index as a neighbor of the previous index
                if (!dag[prevH3Index].neighbors.includes(h3Index)) {
                    dag[prevH3Index].neighbors.push(h3Index);
                }
            } else {
                console.log(`Hexagons ${prevH3Index} and ${h3Index} are not adjacent. Filling gap...`);

                // Use gridPathCells to find a path from prevH3Index to h3Index
                const pathH3Indexes = h3.gridPathCells(prevH3Index, h3Index);
                pathH3Indexes.forEach(midH3Index => {
                    // Add each hexagon in the path as a node in the DAG
                    if (!dag[midH3Index]) {
                        dag[midH3Index] = {
                            neighbors: [],
                            coordinate: h3.cellToLatLng(midH3Index),
                        };
                    }
                    // Connect the previous hexagon to the midpoint
                    if (!dag[prevH3Index].neighbors.includes(midH3Index)) {
                        dag[prevH3Index].neighbors.push(midH3Index);
                    }
                    // Connect the midpoint to the current hexagon
                    if (!dag[midH3Index].neighbors.includes(h3Index)) {
                        dag[midH3Index].neighbors.push(h3Index);
                    }
                });
            }
        }
    }

    return dag;
}

// Interpolation: The interpolateH3Grid function leverages h3.gridPathCells to interpolate between two hexagons.
function interpolateH3Grid(startH3, endH3) {
    let path = h3.gridPathCells(startH3, endH3);
    return path;
}

function interpolatePoints(startCoord, endCoord, resolution) {
    // Convert the coordinates to H3 cells
    const startH3 = h3.latLngToCell(startCoord[0], startCoord[1], resolution);
    const endH3 = h3.latLngToCell(endCoord[0], endCoord[1], resolution);

    // Get the hexagonal path between the two points
    const path = interpolateH3Grid(startH3, endH3);

    // Convert the path of H3 cells back to coordinates (lat, lng)
    const coordinates = path.map(h3Index => h3.cellToLatLng(h3Index));
    return coordinates;
}


// Main function to find routes and buses based on directions response
export async function findMa3(directionsResponse) {
    try {
        console.log('Received directions response in findMa3:', directionsResponse);

        // Clean up the directionsResponse
        const cleanedResponse = removeEmptyDicts(directionsResponse);
        console.log('Cleaned Directions Response:', JSON.stringify(cleanedResponse, null, 4));

        if (!cleanedResponse.routes || cleanedResponse.routes.length === 0) {
            console.error('No routes found in the cleaned response.');
            return;
        }

        // Fetch and index bus routes only once
        if (!globalRoutesDAG) {
            globalRoutesDAG = await fetchAndIndexBusRoutes("../json/YesBana.json");
        }

        for (const routeIndex in cleanedResponse.routes) {
            const route = cleanedResponse.routes[routeIndex];
            console.log(`Processing route ${parseInt(routeIndex) + 1}:`);

            if (route.legs && route.legs.length > 0) {
                for (const legIndex in route.legs) {
                    const leg = route.legs[legIndex];
                    console.log(`  Processing leg ${parseInt(legIndex) + 1}:`);

                    if (leg.steps && leg.steps.length > 0) {
                        for (const stepIndex in leg.steps) {
                            const step = leg.steps[stepIndex];

                            // Decode the polyline string into coordinates
                            const encodedLatLngs = step.encoded_lat_lngs;
                            if (encodedLatLngs) {
                                const decodedCoordinates = decodePolyline(encodedLatLngs);
                                console.log(`    Step ${parseInt(stepIndex) + 1}: Decoded Coordinates:`, decodedCoordinates);

                                // Build the DAG from the decoded coordinates
                                const dag = buildDAG(decodedCoordinates, 7); // Using 7 as an example resolution
                                console.log(`    Built DAG:`, dag);

                                // Align the polyline with the global routes DAG
                                const alignedRoute = alignPolylineWithDAG(decodedCoordinates, globalRoutesDAG);
                                console.log(`    Aligned Route:`, alignedRoute);
                            }
                        }
                    } else {
                        console.error(`  Leg ${parseInt(legIndex) + 1}: No steps found in this leg.`);
                    }
                }
            } else {
                console.error(`Route ${parseInt(routeIndex) + 1}: No legs found in this route.`);
            }
        }

        // Handle bus routes or continue processing
        await handleDirectionsResponse(cleanedResponse);

    } catch (error) {
        console.error('Error in findMa3:', error);
        alert('An error occurred while processing directions. Please try again.');
    }
}

// Function to fetch and index bus routes
async function fetchAndIndexBusRoutes(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch bus routes: ${response.statusText}`);
        }
        const data = await response.json();

        // Assuming removeEmptyDicts is a function that cleans the data
        const cleanedData = removeEmptyDicts(data);
        if (!cleanedData.non_null_objects || cleanedData.non_null_objects.length === 0) {
            console.warn('No valid bus routes found.');
            return new RBush(); // Return an empty R-tree if no routes found
        }

        // Create an R-Tree instance
        const tree = new RBush();

        // Prepare data for R-Tree indexing
        const indexedRoutes = cleanedData.non_null_objects.map(route => {
            const pickupLat = route.pickup_point.latitude;
            const pickupLng = route.pickup_point.longitude;

            return {
                minX: pickupLng,
                minY: pickupLat,
                maxX: pickupLng,
                maxY: pickupLat,
                route_number: route.route_number,
                pickup_point: route.pickup_point.pickup_point,
                destinations: route.destinations.map(dest => ({
                    destination: dest.destination,
                    latitude: dest.latitude,
                    longitude: dest.longitude
                })),
            };
        });

        // Load indexed routes into the R-Tree
        tree.load(indexedRoutes);

        return tree; // Return the R-tree for later use
    } catch (error) {
        console.error('Error fetching bus routes:', error);
        return new RBush(); // Return an empty R-tree on error
    }
}

// Function to align polyline with the global routes DAG
function alignPolylineWithDAG(decodedCoordinates, globalRoutesDAG) {
    const alignedRoute = [];

    for (let i = 0; i < decodedCoordinates.length; i++) {
        const currentPoint = decodedCoordinates[i];

        // Query the spatial index for the closest node
        const closestNodes = globalRoutesDAG.search({
            minX: currentPoint.lng,
            minY: currentPoint.lat,
            maxX: currentPoint.lng,
            maxY: currentPoint.lat
        });

        if (closestNodes.length > 0) {
            // Assuming we take the first closest node for simplicity
            const closestNode = closestNodes[0];
            alignedRoute.push({
                route_number: closestNode.route_number,
                pickup_point: closestNode.pickup_point,
                destinations: closestNode.destinations
            });
        }
    }

    return alignedRoute;
}

// Refactor the bus route fetching and processing into a separate function
async function handleDirectionsResponse(directionsResponse) {
    try {
        console.log('Received directions response in handleDirectionsResponse:', directionsResponse);

        // Extract origin and destination
        const origin = directionsResponse.routes[0].legs[0].start_address;
        const destination = directionsResponse.routes[0].legs[0].end_address;
        console.log(`Origin: ${origin}, Destination: ${destination}`);

        // Define additional locations if needed (e.g., waypoints or other relevant locations)
        const additionalLocations = []; // Add your additional locations here, if any

        // Fetch and process bus routes using the globalRoutesDAG
        const { busesToCBD, busesFromCBD, error } = await fetchBusRoutes(origin, destination, additionalLocations);

        if (error) {
            console.error('Failed to fetch bus routes:', error);
            alert('An error occurred while fetching bus routes. Please try again.');
        } else {
            displayResults(busesToCBD, busesFromCBD);
        }
        
    } catch (error) {
        console.error('Error in handleDirectionsResponse:', error);
        alert('An error occurred while processing bus routes. Please try again.');
    }
}

// Refactor bus route fetching into a separate async function
async function fetchBusRoutes(origin, destination, additionalLocations = []) {
    const busesToCBD = [];
    const busesFromCBD = [];

    try {
        // Use the already built globalRoutesDAG
        const originCoords = {
            minX: origin.longitude,
            minY: origin.latitude,
            maxX: origin.longitude,
            maxY: origin.latitude
        };

        const matchingRoutesFromOrigin = globalRoutesDAG.search(originCoords);
        if (matchingRoutesFromOrigin.length === 0) {
            console.warn('No matching routes found from the origin.');
            return { busesToCBD, busesFromCBD };
        }

        matchingRoutesFromOrigin.forEach(route => {
            busesToCBD.push(`${route.route_number} (TO CBD)`);
            route.destinations.forEach(busDestination => {
                if (busDestination.destination.toLowerCase().includes(destination.toLowerCase())) {
                    busesFromCBD.push(`${route.route_number} / ${busDestination.destination}`);
                }
            });
        });

        // Search for additional locations
        for (const location of additionalLocations) {
            const locationCoords = {
                minX: location.longitude,
                minY: location.latitude,
                maxX: location.longitude,
                maxY: location.latitude
            };

            const matchingRoutesFromAdditional = globalRoutesDAG.search(locationCoords);
            if (matchingRoutesFromAdditional.length === 0) {
                console.warn(`No matching routes found for additional location: ${JSON.stringify(location)}`);
                continue; // Skip to the next location
            }

            matchingRoutesFromAdditional.forEach(route => {
                busesToCBD.push(`${route.route_number} (TO CBD)`);
                route.destinations.forEach(busDestination => {
                    if (busDestination.destination.toLowerCase().includes(destination.toLowerCase())) {
                        busesFromCBD.push(`${route.route_number} / ${busDestination.destination}`);
                    }
                });
            });
        }

        return { busesToCBD, busesFromCBD };

    } catch (error) {
        console.error('Error fetching bus routes:', error);
        // Handle the error gracefully, e.g., return an empty array or a specific error object
        return { busesToCBD: [], busesFromCBD: [], error: error.message };
    }
}
// Display the bus route results
function displayResults(busesToCBD, busesFromCBD) {
    const resultDiv = document.getElementById('bus-routes');
    resultDiv.innerHTML = ""; // Clear previous results

    // Check if there are any routes to display
    if (busesToCBD.length > 0 || busesFromCBD.length > 0) {
        resultDiv.innerHTML = "<h2>Bus Routes:</h2>";

        // Display Buses to CBD
        if (busesToCBD.length > 0) {
            resultDiv.innerHTML += `<h3>Buses to CBD:</h3><ul>${busesToCBD.map(route => `<li>${route}</li>`).join('')}</ul>`;
        }

        // Display Buses from CBD
        if (busesFromCBD.length > 0) {
            resultDiv.innerHTML += `<h3>Buses from CBD:</h3><ul>${busesFromCBD.map(route => `<li>${route}</li>`).join('')}</ul>`;
        }
    } else {
        resultDiv.innerHTML = "<p>No bus routes found for the given locations.</p>";
    }
}
// Call findMa3 directly with directions response (you can now invoke this function in the event handler)
window.findMa3 = findMa3;
