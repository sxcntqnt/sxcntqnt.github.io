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
            if (!dag[prevH3Index]) {
                dag[prevH3Index] = {
                    neighbors: [],
                    coordinate: coordinates[i - 1],
                };
            }
            // Add the current index as a neighbor of the previous index
            if (!dag[prevH3Index].neighbors.includes(h3Index)) {
                dag[prevH3Index].neighbors.push(h3Index);
            }
        }
    }

    return dag;
}

// Expose the function globally if needed
window.handleDirectionsResponse = handleDirectionsResponse;
