function removeEmptyDicts(obj) {
    if (Array.isArray(obj)) {
        return obj
            .map(removeEmptyDicts)
            .filter(item => item && Object.keys(item).length > 0); // Simplified check
    } else if (typeof obj === 'object' && obj !== null) {
        return Object.fromEntries(
            Object.entries(obj)
                .map(([key, value]) => [key, removeEmptyDicts(value)])
                .filter(([key, value]) => value && Object.keys(value).length > 0)
        );
    }
    return obj;
}

function decodePolyline(polylineStr) {
    let index = 0;
    let lat = 0;
    let lng = 0;
    const coordinates = [];

    while (index < polylineStr.length) {
        let b = 0, shift = 0, result = 0;
        let byte = null;

        do {
            byte = polylineStr.charCodeAt(index++) - 63;
            result |= (byte & 0x1f) << shift;
            shift += 5;
        } while (byte >= 0x20);

        lat += (result >> 1) ^ (-(result & 1));

        shift = 0;
        result = 0;

        do {
            byte = polylineStr.charCodeAt(index++) - 63;
            result |= (byte & 0x1f) << shift;
            shift += 5;
        } while (byte >= 0x20);

        lng += (result >> 1) ^ (-(result & 1));

        coordinates.push([lat / 1E5, lng / 1E5]);
    }

    return coordinates;
}

function buildDAG(coordinates, resolution) {
    const dag = {};

    coordinates.forEach(([lat, lng], i) => {
        const h3Index = h3.latLngToCell(lat, lng, resolution);
        if (!dag[h3Index]) {
            dag[h3Index] = { neighbors: [], coordinate: [lat, lng] };
        }

        if (i > 0) {
            const [prevLat, prevLng] = coordinates[i - 1];
            const prevH3Index = h3.latLngToCell(prevLat, prevLng, resolution);
            connectHexagons(dag, prevH3Index, h3Index);
        }
    });

    return dag;
}

function connectHexagons(dag, prevH3Index, h3Index) {
    if (h3.areNeighborCells(prevH3Index, h3Index)) {
        if (!dag[prevH3Index].neighbors.includes(h3Index)) {
            dag[prevH3Index].neighbors.push(h3Index);
        }
    } else {
        console.log(`Hexagons ${prevH3Index} and ${h3Index} are not adjacent. Filling gap...`);
        const pathH3Indexes = h3.gridPathCells(prevH3Index, h3Index);
        pathH3Indexes.forEach((midH3Index, j) => {
            if (!dag[midH3Index]) {
                dag[midH3Index] = {
                    neighbors: [],
                    coordinate: h3.cellToLatLng(midH3Index),
                };
            }
            if (j > 0) {
                const prevMidH3Index = pathH3Indexes[j - 1];
                if (!dag[prevMidH3Index].neighbors.includes(midH3Index)) {
                    dag[prevMidH3Index].neighbors.push(midH3Index);
                }
            }
            if (j === pathH3Indexes.length - 1 && !dag[midH3Index].neighbors.includes(h3Index)) {
                dag[midH3Index].neighbors.push(h3Index);
            }
        });
    }
}

function interpolatePoints(startCoord, endCoord, resolution) {
    const startH3 = h3.latLngToCell(startCoord[0], startCoord[1], resolution);
    const endH3 = h3.latLngToCell(endCoord[0], endCoord[1], resolution);
    return convertH3ToCoordinates(h3.gridPathCells(startH3, endH3));
}

function convertH3ToCoordinates(path) {
    return path.map(h3Index => h3.cellToLatLng(h3Index));
}

function interpolateH3OnRoutes(jsonData, resolution) {
    console.log('Starting H3 interpolation on routes...');

    jsonData.non_null_objects.forEach(route => {
        const pickupCoords = route.pickup_point.pickup_latlng;

        if (route.route_length < 10) {
            resolution = 9;
        } else {
            resolution = 6;
        }

        route.destinations.forEach(destination => {
            const pickupH3 = h3.latLngToCell(pickupCoords.latitude, pickupCoords.longitude, resolution);
            const destH3 = h3.latLngToCell(destination.destination_latlng.latitude, destination.destination_latlng.longitude, resolution);
            const h3Path = h3.gridPathCells(pickupH3, destH3);
            const pathCoordinates = h3Path.map(h3Index => h3.cellToLatLng(h3Index));
            destination.interpolated_path = pathCoordinates;
        });
    });

    console.log('Completed H3 interpolation on all routes.');
    return jsonData;
}

export async function findMa3(directionsResponse) {
    try {
        console.log('Received directions response:', directionsResponse);
        const cleanedResponse = removeEmptyDicts(directionsResponse);
        if (!cleanedResponse.routes?.length) {
            throw new Error('No routes found.');
        }

        for (const route of cleanedResponse.routes) {
            if (route.legs?.length) {
                await processRouteLegs(route);
            }
        }

        await handleDirectionsResponse(cleanedResponse);

    } catch (error) {
        console.error('Error in findMa3:', error);
        alert('An error occurred while processing directions. Please try again.');
    }
}

async function processRouteLegs(route) {
    for (const leg of route.legs) {
        if (leg.steps?.length) {
            await processStep(leg.steps);
        } else {
            console.error('No steps found in this leg.');
        }
    }
}

async function processStep(step) {
    const encodedLatLngs = step.encoded_lat_lngs;
    if (encodedLatLngs) {
        const decodedCoordinates = decodePolyline(encodedLatLngs);
        console.log(`    Decoded Coordinates:`, decodedCoordinates);

        const dag = buildDAG(decodedCoordinates, 7);
        console.log(`    DAG:`, dag);
    }
}

async function handleDirectionsResponse(directionsResponse) {
    try {
        console.log('Received directions response in handleDirectionsResponse:', directionsResponse);

        const { start_address: origin, end_address: destination } = directionsResponse.routes[0].legs[0];
        console.log(`Origin: ${origin}, Destination: ${destination}`);

        const tree = new RBush()

        const buses = await processRoutes(tree, busesToCBD, busesFromCBD, origin, destination, additionalLocations, resolution, maxDistanceKm);
        displayResults(buses);

    } catch (error) {
        console.error('Error in handleDirectionsResponse:', error);
        alert('An error occurred while processing bus routes. Please try again.');
    }
}

async function processRoutes(tree, busesToCBD, busesFromCBD, origin, destination, additionalLocations, resolution, maxDistanceKm) {
    try {
        function isWithinProximity(busLatLng, pointLatLng, resolution, maxDistanceKm) {
            const busH3 = h3.latLngToCell(busLatLng.latitude, busLatLng.longitude, resolution);
            const pointH3 = h3.latLngToCell(pointLatLng.latitude, pointLatLng.longitude, resolution);

            const distance = h3.h3Distance(busH3, pointH3);

            const cellSizeKm = h3.edgeLength(resolution, 'km');
            const actualDistanceKm = distance * cellSizeKm;

            return actualDistanceKm <= maxDistanceKm;
        }

        function filterBusesByProximity(buses, pointLatLng, resolution, maxDistanceKm) {
            return buses.filter(bus => {
                const busLatLng = { latitude: bus.pickup_point.latitude, longitude: bus.pickup_point.longitude };
                return isWithinProximity(busLatLng, pointLatLng, resolution, maxDistanceKm);
            });
        }

        const searchCoordinates = [
            {
                coords: {
                    minX: origin.longitude,
                    minY: origin.latitude,
                    maxX: origin.longitude,
                    maxY: origin.latitude
                },
                label: 'origin'
            }
        ];

        additionalLocations.forEach(location => {
            searchCoordinates.push({
                coords: {
                    minX: location.longitude,
                    minY: location.latitude,
                    maxX: location.longitude,
                    maxY: location.latitude
                },
                label: 'additional'
            });
        });

        for (const { coords, label } of searchCoordinates) {
            console.log(`Searching for routes from ${label}:`, coords);

            let filteredBuses = await filterBusesByProximity(busesToCBD, { latitude: coords.minY, longitude: coords.minX }, resolution, maxDistanceKm);

            console.log(`Found ${filteredBuses.length} buses near ${label} within ${maxDistanceKm} km.`);

            const matchingRoutes = tree.search(coords);
            console.log(`Found ${matchingRoutes.length} matching routes from ${label}.`);
        }

    } catch (error) {
        console.error('Error in processRoutes:', error);
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
