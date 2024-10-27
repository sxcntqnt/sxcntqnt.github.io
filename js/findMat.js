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

// Function to build the Directed Acyclic Graph (DAG) from coordinates
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

            // Check if the current index is adjacent to the previous index
            const neighbors = h3.h3ToNeighbors(prevH3Index);
            if (neighbors.includes(h3Index)) {
                // Add the current index as a neighbor of the previous index
                if (!dag[prevH3Index].neighbors.includes(h3Index)) {
                    dag[prevH3Index].neighbors.push(h3Index);
                }
            } else {
                console.log(`Hexagons ${prevH3Index} and ${h3Index} are not adjacent. Filling gap...`);

                // Interpolate points between previous and current coordinates
                const midPoints = interpolatePoints(coordinates[i - 1], coordinates[i], resolution);
                midPoints.forEach(point => {
                    const midH3Index = h3.latLngToCell(point[0], point[1], resolution);
                    // Add midpoint to the DAG
                    if (!dag[midH3Index]) {
                        dag[midH3Index] = {
                            neighbors: [],
                            coordinate: point,
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

// Function to interpolate points between two coordinates
function interpolatePoints(startCoord, endCoord, resolution) {
    const [startLat, startLng] = startCoord;
    const [endLat, endLng] = endCoord;
    
    // Use a simple linear interpolation; you can refine this logic as needed
    const midPoints = [];
    const numSteps = Math.max(Math.ceil(h3.distance(startCoord, endCoord) / 100), 1); // Define step size

    for (let j = 1; j < numSteps; j++) {
        const lat = startLat + (endLat - startLat) * (j / numSteps);
        const lng = startLng + (endLng - startLng) * (j / numSteps);
        midPoints.push([lat, lng]);
    }

    return midPoints;
}

// Main function to handle the directions response
export function handleDirectionsResponse(directionsResponse) {
    console.log('Received directions response in findMat.js:', directionsResponse);

    // Extract the polyline from the directionsResponse
    const polylineStr = directionsResponse.routes[0].overview_polyline.points; // Adjust index if necessary
    const decodedCoordinates = decodePolyline(polylineStr);
    console.log('Decoded Coordinates:', decodedCoordinates);

    // Build the DAG
    const dag = buildDAG(decodedCoordinates, 7); // Change 7 to your desired resolution
    console.log('DAG:', dag);
}
window.handleDirectionsResponse = handleDirectionsResponse;
