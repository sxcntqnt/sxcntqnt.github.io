import { removeEmptyDicts, decodePolyline, fetchAndIndexBusRoutes, getNearbyRoutes } from './utils.js';

let globalRoutesDAG = null;

export async function findMa3({ locations, directionsResponse = null }) {
    try {
        console.log('Starting findMa3 function...');
        console.log('Locations:', locations);
        if (directionsResponse) console.log('Directions Response:', directionsResponse);

        // Validate input
        if (!locations || !Array.isArray(locations) || locations.length < 2) {
            throw new Error('At least two locations (origin and destination) are required.');
        }
        for (const loc of locations) {
            if (!loc.lat || !loc.lng) {
                throw new Error('Each location must have lat and lng properties.');
            }
        }

        // Initialize global DAG if not already done
        if (!globalRoutesDAG) {
            globalRoutesDAG = await fetchAndIndexBusRoutes('../json/YesBana.json');
        }

        // Build helical H3 structure
        let helixStructure;
        if (directionsResponse) {
            const cleanedResponse = removeEmptyDicts(directionsResponse);
            if (!cleanedResponse.routes?.length) {
                throw new Error('No routes found in the directions response.');
            }
            helixStructure = buildHelixStructureFromDirections(cleanedResponse);
        } else {
            helixStructure = buildHelixStructureFromLocations(locations);
        }

        // Find bus route numbers with part-of relationship
        const busRouteNumbers = await findRoutesWithPartOfRelationship(locations, helixStructure, globalRoutesDAG, directionsResponse);

        console.log('Bus Route Numbers:', busRouteNumbers);
        displayResults(busRouteNumbers, helixStructure);
        return busRouteNumbers;
    } catch (error) {
        console.error('Error in findMa3:', error.message);
        alert('An error occurred while finding bus routes. Please try again.');
        return [];
    }
}

function buildHelixStructureFromLocations(locations) {
    const radiusIncrement = 0.1;
    const heightIncrement = 0.05;
    const angleIncrement = Math.PI / 8;
    const h3Resolution = 9;

    const helix = {
        points: [],
        center: { lat: 0, lng: 0 },
        h3Center: null,
        maxRadius: 0,
        totalHeight: 0,
        resolution: h3Resolution
    };

    let currentAngle = 0;
    let currentHeight = 0;
    let currentRadius = 0;

    const avgLat = locations.reduce((sum, loc) => sum + loc.lat, 0) / locations.length;
    const avgLng = locations.reduce((sum, loc) => sum + loc.lng, 0) / locations.length;
    helix.center = { lat: avgLat, lng: avgLng };
    helix.h3Center = h3.latLngToCell(helix.center.lat, helix.center.lng, h3Resolution);

    locations.forEach((loc, index) => {
        const h3Index = h3.latLngToCell(loc.lat, loc.lng, h3Resolution);
        const point = {
            lat: loc.lat,
            lng: loc.lng,
            h3Index,
            helixX: Math.cos(currentAngle) * currentRadius,
            helixY: Math.sin(currentAngle) * currentRadius,
            helixZ: currentHeight,
            index
        };
        helix.points.push(point);
        currentAngle += angleIncrement;
        currentHeight += heightIncrement;
        currentRadius += radiusIncrement;
        helix.maxRadius = Math.max(helix.maxRadius, currentRadius);
    });

    helix.totalHeight = currentHeight;
    return helix;
}

function buildHelixStructureFromDirections(directionsResponse) {
    const legs = directionsResponse.routes[0].legs;
    const radiusIncrement = 0.1;
    const heightIncrement = 0.05;
    const angleIncrement = Math.PI / 8;
    const h3Resolution = 9;

    const helix = {
        points: [],
        center: { lat: 0, lng: 0 },
        h3Center: null,
        maxRadius: 0,
        totalHeight: 0,
        resolution: h3Resolution
    };

    let currentAngle = 0;
    let currentHeight = 0;
    let currentRadius = 0;

    const start = legs[0].start_location;
    const end = legs[legs.length - 1].end_location;
    helix.center = { lat: (start.lat + end.lat) / 2, lng: (start.lng + end.lng) / 2 };
    helix.h3Center = h3.latLngToCell(helix.center.lat, helix.center.lng, h3Resolution);

    legs.forEach((leg, legIndex) => {
        leg.steps.forEach((step, stepIndex) => {
            const decodedCoords = decodePolyline(step.polyline?.points || step.encoded_lat_lngs || '');
            decodedCoords.forEach(([lat, lng]) => {
                const h3Index = h3.latLngToCell(lat, lng, h3Resolution);
                const point = {
                    lat, lng,
                    h3Index,
                    helixX: Math.cos(currentAngle) * currentRadius,
                    helixY: Math.sin(currentAngle) * currentRadius,
                    helixZ: currentHeight,
                    legIndex,
                    stepIndex,
                    instructions: step.instructions
                };
                helix.points.push(point);
                currentAngle += angleIncrement;
                currentHeight += heightIncrement;
                currentRadius += radiusIncrement;
                helix.maxRadius = Math.max(helix.maxRadius, currentRadius);
            });
        });
    });

    helix.totalHeight = currentHeight;
    return helix;
}

async function findRoutesWithPartOfRelationship(locations, helixStructure, globalRoutesDAG, directionsResponse) {
    const busRouteNumbers = new Set();
    const userHexes = new Set(helixStructure.points.map(p => p.h3Index));

    // Expand user hexes with a 1-ring buffer
    const expandedUserHexes = new Set();
    userHexes.forEach(hex => {
        const neighbors = h3.gridDisk(hex, 1);
        neighbors.forEach(n => expandedUserHexes.add(n));
    });

    // Process YesBana.json routes
    const allRoutes = globalRoutesDAG.all().map(node => node.route);
    const uniqueRoutes = new Map();
    allRoutes.forEach(route => uniqueRoutes.set(route.route_number, route));

    uniqueRoutes.forEach((route, routeNumber) => {
        const pickupHex = route.pickup_point.pickup_hexid;
        const destinationHexes = new Set(route.destinations.map(d => d.destination_hexid));

        const intersects = expandedUserHexes.has(pickupHex) || 
                          Array.from(destinationHexes).some(destHex => expandedUserHexes.has(destHex));
        if (intersects) {
            busRouteNumbers.add(routeNumber);
        }
    });

    // If Directions API data is provided, decode polylines and align with YesBana.json
    if (directionsResponse) {
        for (const route of directionsResponse.routes) {
            for (const leg of route.legs) {
                for (const step of leg.steps) {
                    if (step.travel_mode === 'TRANSIT' && step.transit_details?.vehicle?.type === 'BUS') {
                        const busLine = step.transit_details.line.short_name;
                        if (busLine) busRouteNumbers.add(busLine);
                    }
                    if (step.polyline?.points || step.encoded_lat_lngs) {
                        const decodedCoords = decodePolyline(step.polyline?.points || step.encoded_lat_lngs);
                        decodedCoords.forEach(([lat, lng]) => {
                            const h3Index = h3.latLngToCell(lat, lng, helixStructure.resolution);
                            if (expandedUserHexes.has(h3Index)) {
                                const nearbyRoutes = getNearbyRoutes(lat, lng, globalRoutesDAG);
                                nearbyRoutes.forEach(route => busRouteNumbers.add(route.route_number));
                            }
                        });
                    }
                }
            }
        }
    }

    return Array.from(busRouteNumbers);
}

function displayResults(busRouteNumbers, helixStructure) {
    const resultDiv = document.getElementById('bus-routes');
    if (!busRouteNumbers.length) {
        resultDiv.innerHTML = '<p>No bus routes found for the given locations.</p>';
        return;
    }

    resultDiv.innerHTML = `
        <h2>Bus Route Numbers (Helix: Height ${helixStructure.totalHeight.toFixed(2)}, Radius ${helixStructure.maxRadius.toFixed(2)})</h2>
        <p>H3 Center: ${helixStructure.h3Center}</p>
        <ul>${busRouteNumbers.map(route => `<li>${route}</li>`).join('')}</ul>
    `;
}

window.findMa3 = findMa3;
