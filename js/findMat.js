let globalRoutesDAG = null;

// Utility to remove empty dictionaries
function removeEmptyDicts(obj) {
    if (Array.isArray(obj)) {
        return obj.map(removeEmptyDicts).filter(item => item && Object.keys(item).length > 0);
    }
    if (typeof obj === 'object' && obj !== null) {
        return Object.fromEntries(
            Object.entries(obj)
                .map(([key, value]) => [key, removeEmptyDicts(value)])
                .filter(([_, value]) => value && Object.keys(value).length > 0)
        );
    }
    return obj;
}

// Decode polyline into coordinates
function decodePolyline(polylineStr) {
    let index = 0, lat = 0, lng = 0, coordinates = [];
    while (index < polylineStr.length) {
        let result = 0, shift = 0, byte;
        do {
            byte = polylineStr.charCodeAt(index++) - 63;
            result |= (byte & 0x1f) << shift;
            shift += 5;
        } while (byte >= 0x20);
        lat += (result >> 1) ^ (-(result & 1));
        result = shift = 0;
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

// Function to build a DAG from coordinates
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

// Fetch and process routes
async function fetchAndIndexBusRoutes(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch routes: ${response.statusText}`);
        const data = await response.json();
        const cleanedData = removeEmptyDicts(data);
        if (!cleanedData.nonNullObjects?.length) return new RBush();

        const tree = new RBush();
        tree.load(cleanedData.nonNullObjects.map(route => ({
            minX: route.pickupPoint.longitude,
            minY: route.pickupPoint.latitude,
            maxX: route.pickupPoint.longitude,
            maxY: route.pickupPoint.latitude,
            route
        })));
        return tree;
    } catch (error) {
        console.error('Error fetching bus routes:', error);
        return new RBush();
    }
}

export async function findMa3(directionsResponse) {
    try {
        console.log('Processing directions response...');
        const cleanedResponse = removeEmptyDicts(directionsResponse);

        if (!cleanedResponse.routes?.length) {
            throw new Error('No routes found.');
        }

        if (!globalRoutesDAG) {
            globalRoutesDAG = await fetchAndIndexBusRoutes('../json/YesBana.json');
        }

        for (const [routeIndex, route] of cleanedResponse.routes.entries()) {
            console.log(`Processing Route ${routeIndex + 1}`);
            await processRouteLegs(route);
        }
    } catch (error) {
        console.error('Error in findMa3:', error.message);
        alert('An error occurred while processing directions. Please try again.');
    }
}

// Helper to process route legs
async function processRouteLegs(route) {
    for (const leg of route.legs) {
        if (!leg.steps?.length) {
            console.warn('No steps found in this leg.');
            continue;
        }
        await Promise.all(leg.steps.map(step => processStep(step)));
    }
}

// Helper to process individual steps
async function processStep(step) {
    const { encoded_lat_lngs: encodedLatLngs } = step;
    if (!encodedLatLngs) {
        console.warn('No encoded_lat_lngs in step.');
        return;
    }

    const decodedCoordinates = decodePolyline(encodedLatLngs);
    const dag = buildDAG(decodedCoordinates, 7); // Example resolution
    console.log('Built DAG:', dag);
}

// Function to align polyline with the global routes DAG
function alignPolylineWithDAG(decodedCoordinates) {
    const alignedRoute = decodedCoordinates.map(point => {
        const { lng, lat } = point;
        const closestNodes = globalRoutesDAG.search({ minX: lng, minY: lat, maxX: lng, maxY: lat });

        if (closestNodes.length > 0) {
            const closestNode = closestNodes[0];
            return {
                route_number: closestNode.route_number,
                pickup_point: closestNode.pickup_point,
                destinations: closestNode.destinations,
            };
        }

        return null;
    }).filter(Boolean);

    return alignedRoute;
}

export async function handleDirectionsResponse(directionsResponse) {
    try {
        console.log('Processing directions response...');
        const { start_address: origin, end_address: destination } = directionsResponse.routes[0].legs[0];
        console.log(`Origin: ${origin}, Destination: ${destination}`);

        const additionalLocations = []; // Add your additional locations here, if any

        const { busesToCBD, busesFromCBD, error } = await fetchBusRoutes(origin, destination, additionalLocations);

        if (error) {
            console.error('Failed to fetch bus routes:', error);
            alert('An error occurred while fetching bus routes. Please try again.');
            return;
        }

        displayResults(busesToCBD, busesFromCBD);
    } catch (error) {
        console.error('Error in handleDirectionsResponse:', error);
        alert('An error occurred while processing bus routes. Please try again.');
    }
}

async function fetchBusRoutes(origin, destination, additionalLocations = []) {
    const busesToCBD = [];
    const busesFromCBD = [];

    try {
        const originCoords = convertToBoundingBox(origin);

        const matchingRoutesFromOrigin = globalRoutesDAG.search(originCoords);
        processMatchingRoutes(matchingRoutesFromOrigin, destination, busesToCBD, busesFromCBD);

        for (const location of additionalLocations) {
            const locationCoords = convertToBoundingBox(location);
            const matchingRoutesFromAdditional = globalRoutesDAG.search(locationCoords);
            processMatchingRoutes(matchingRoutesFromAdditional, destination, busesToCBD, busesFromCBD);
        }

        return { busesToCBD, busesFromCBD };
    } catch (error) {
        console.error('Error fetching bus routes:', error);
        return { busesToCBD: [], busesFromCBD: [], error: error.message };
    }
}

function convertToBoundingBox(location) {
    return {
        minX: location.longitude,
        minY: location.latitude,
        maxX: location.longitude,
        maxY: location.latitude,
    };
}

function processMatchingRoutes(routes, destination, busesToCBD, busesFromCBD) {
    routes.forEach(route => {
        busesToCBD.push(`${route.route_number} (TO CBD)`);
        route.destinations.forEach(busDestination => {
            if (busDestination.destination.toLowerCase().includes(destination.toLowerCase())) {
                busesFromCBD.push(`${route.route_number} / ${busDestination.destination}`);
            }
        });
    });
}

async function processRoutes(tree, busesToCBD, busesFromCBD, origin, additionalLocations, resolution, maxDistanceKm) {
    const allLocations = [{ coords: convertToBoundingBox(origin), label: 'origin' }, 
        ...additionalLocations.map(location => ({ coords: convertToBoundingBox(location), label: 'additional' }))];

    for (const { coords, label } of allLocations) {
        console.log(`Searching for routes near ${label}:`, coords);

        const filteredBuses = filterBusesByProximity(busesToCBD, coords.minY, coords.minX, resolution, maxDistanceKm);
        console.log(`Found ${filteredBuses.length} buses near ${label} within ${maxDistanceKm} km.`);

        const matchingRoutes = tree.search(coords);
        console.log(`Found ${matchingRoutes.length} matching routes near ${label}.`);
    }
}

function displayResults(busesToCBD, busesFromCBD) {
    const resultDiv = document.getElementById('bus-routes');
    resultDiv.innerHTML = busesToCBD.length || busesFromCBD.length
        ? `<h2>Bus Routes:</h2>
            ${busesToCBD.length ? `<h3>Buses to CBD:</h3><ul>${busesToCBD.map(route => `<li>${route}</li>`).join('')}</ul>` : ''}
            ${busesFromCBD.length ? `<h3>Buses from CBD:</h3><ul>${busesFromCBD.map(route => `<li>${route}</li>`).join('')}</ul>` : ''}`
        : '<p>No bus routes found for the given locations.</p>';
}

// Call findMa3 directly with directions response (you can now invoke this function in the event handler)
window.findMa3 = findMa3;
