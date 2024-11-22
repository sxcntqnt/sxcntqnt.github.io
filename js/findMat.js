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

                                // Build the Directed Acyclic Graph (DAG) using the decoded coordinates
                                const dag = buildDAG(decodedCoordinates, 7);
                                console.log(`    Step ${parseInt(stepIndex) + 1}: DAG:`, dag);
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


// Refactor the bus route fetching and processing into a separate function
async function handleDirectionsResponse(directionsResponse) {
    try {
        console.log('Received directions response in handleDirectionsResponse:', directionsResponse);

        // Extract origin and destination
        const origin = directionsResponse.routes[0].legs[0].start_address;
        const destination = directionsResponse.routes[0].legs[0].end_address;
        console.log(`Origin: ${origin}, Destination: ${destination}`);

        // Fetch and process bus routes
        const buses = await fetchBusRoutes(origin, destination);
        displayResults(buses);

    } catch (error) {
        console.error('Error in handleDirectionsResponse:', error);
        alert('An error occurred while processing bus routes. Please try again.');
    }
}

// Refactor bus route fetching into a separate async function
async function fetchBusRoutes(origin, destination) {
    try {
        const response = await fetch("../json/YesBana.json");
        const data = await response.json();

        const cleanedData = removeEmptyDicts(data);
        if (!cleanedData.non_null_objects || cleanedData.non_null_objects.length === 0) {
            return [];
        }

        const busesToCBD = [];
        const busesFromCBD = [];

        cleanedData.non_null_objects.forEach(route => {
            if (route.pickup_point.toLowerCase().includes(origin.toLowerCase())) {
                busesToCBD.push(`${route.route_number} (TO CBD)`);
            }

            route.destinations.forEach(busDestination => {
                if (busDestination.toLowerCase().includes(destination.toLowerCase())) {
                    busesFromCBD.push(`${route.route_number} / ${busDestination}`);
                }
            });
        });

        return [...busesToCBD, ...busesFromCBD];
    } catch (error) {
        console.error('Error fetching bus routes:', error);
        return [];
    }
}

// Display the bus route results
function displayResults(routes) {
    const resultDiv = document.getElementById('bus-routes');
    resultDiv.innerHTML = ""; // Clear previous results

    if (routes && routes.length > 0) {
        resultDiv.innerHTML = "<h2>Bus Routes:</h2>";

        // Grouping the results into "To CBD" and "From CBD" sections
        const busesToCBD = routes.filter(route => route.includes("TO CBD"));
        const busesFromCBD = routes.filter(route => route.includes("/"));

        let busesToCBDHTML = busesToCBD.length > 0
            ? `<h3>Buses to CBD:</h3><ul>${busesToCBD.map(route => `<li>${route}</li>`).join('')}</ul>`
            : "";
        
        let busesFromCBDHTML = busesFromCBD.length > 0
            ? `<h3>Buses from CBD:</h3><ul>${busesFromCBD.map(route => `<li>${route}</li>`).join('')}</ul>`
            : "";

        // Combine the sections
        resultDiv.innerHTML += busesToCBDHTML + busesFromCBDHTML;
    } else {
        resultDiv.innerHTML = "<p>No bus routes found for the given locations.</p>";
    }
}

// Call findMa3 directly with directions response (you can now invoke this function in the event handler)
window.findMa3 = findMa3;
