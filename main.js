import { calcRoute } from './calcRoute.js';
import { findMa3, displayResults } from './findMat.js';
import { decodePolyline, removeEmptyDicts, fetchAndIndexBusRoutes, extractLocationsFromDirections, buildHelixStructure, refineCoordinates } from './utils.js';

let globalRoutesDAG = null;
let globalRoute3DIndex = null;

async function loadRouteData(jsonPath = './json/YesBana.json') {
    try {
        const data = await fetchAndIndexBusRoutes(jsonPath);
        if (!data || !Array.isArray(data.non_null_objects) || !data.non_null_objects.length) {
            throw new Error('Fetched route data is invalid or contains no valid routes');
        }

        // Pre-process routes: refine coordinates and validate H3 indices
        const h3 = window.h3 || { latLngToCell: () => { throw new Error('H3 library not loaded'); } };
        const refinedRoutes = data.non_null_objects.map(route => {
            console.log(`Pre-processing route ${route.route_number}`);
            const pickupLatLng = route.pickup_point?.pickup_latlng;
            let refinedPickup = null;
            let pickupHexId = route.pickup_point?.pickup_hexid;

            // Refine pickup coordinates
            if (pickupLatLng) {
                refinedPickup = refineCoordinates(pickupLatLng);
                if (!refinedPickup) {
                    console.warn(`Route ${route.route_number}: Invalid pickup coordinates: ${JSON.stringify(pickupLatLng)}`);
                } else {
                    // Validate or regenerate H3 index for pickup
                    if (!pickupHexId || !h3.isValidCell(pickupHexId)) {
                        try {
                            pickupHexId = h3.latLngToCell(refinedPickup.lat, refinedPickup.lng, 9);
                            console.log(`Route ${route.route_number}: Regenerated pickup H3 index: ${pickupHexId}`);
                        } catch (error) {
                            console.warn(`Route ${route.route_number}: Failed to generate pickup H3 index: ${error.message}`);
                            pickupHexId = null;
                        }
                    }
                }
            }

            // Refine destination coordinates
            const refinedDestinations = (route.destinations || []).map(d => {
                const dLatLng = d.destination_latlng;
                let refinedDest = null;
                let destHexId = d.destination_hexid;
                if (dLatLng) {
                    refinedDest = refineCoordinates(dLatLng);
                    if (!refinedDest) {
                        console.warn(`Route ${route.route_number}: Invalid destination coordinates for ${d.destination || 'Unknown'}: ${JSON.stringify(dLatLng)}`);
                    } else {
                        // Validate or regenerate H3 index for destination
                        if (!destHexId || !h3.isValidCell(destHexId)) {
                            try {
                                destHexId = h3.latLngToCell(refinedDest.lat, refinedDest.lng, 9);
                                console.log(`Route ${route.route_number}: Regenerated destination H3 index for ${d.destination || 'Unknown'}: ${destHexId}`);
                            } catch (error) {
                                console.warn(`Route ${route.route_number}: Failed to generate destination H3 index for ${d.destination || 'Unknown'}: ${error.message}`);
                                destHexId = null;
                            }
                        }
                    }
                }
                return refinedDest ? { ...d, destination_latlng: refinedDest, destination_hexid: destHexId } : null;
            }).filter(Boolean);

            // Skip routes with no valid pickup or destinations
            if (!refinedPickup && !refinedDestinations.length) {
                console.warn(`Skipping route ${route.route_number}: No valid pickup or destinations`);
                return null;
            }

            return {
                ...route,
                pickup_point: refinedPickup ? {
                    ...route.pickup_point,
                    pickup_latlng: refinedPickup,
                    pickup_hexid: pickupHexId
                } : route.pickup_point,
                destinations: refinedDestinations
            };
        }).filter(Boolean);

        if (!refinedRoutes.length) {
            throw new Error('No valid routes after pre-processing');
        }

        // Store refined routes in globalRoutesDAG
        globalRoutesDAG = { non_null_objects: refinedRoutes };
        console.log('Route data pre-processed:', { totalRoutes: globalRoutesDAG.non_null_objects.length });

        // Pre-build RBush-3D index
        const RBush3D = window.RBush3D?.RBush3D || window.RBush || function () { throw new Error('No RBush-3D available'); };
        globalRoute3DIndex = new RBush3D();
        const items = refinedRoutes.flatMap(route => {
            console.log(`Pre-indexing route ${route.route_number}`);
            const pickupItems = route.pickup_point?.pickup_latlng && route.pickup_point?.pickup_hexid && h3.isValidCell(route.pickup_point.pickup_hexid) ? [{
                minX: route.pickup_point.pickup_latlng.lat,
                minY: route.pickup_point.pickup_latlng.lng,
                minZ: route.pickup_point.pickup_hexid,
                maxX: route.pickup_point.pickup_latlng.lat,
                maxY: route.pickup_point.pickup_latlng.lng,
                maxZ: route.pickup_point.pickup_hexid,
                routeNumber: route.route_number,
                label: route.pickup_point.pickup_point || 'Unknown',
                lat: route.pickup_point.pickup_latlng.lat,
                lng: route.pickup_point.pickup_latlng.lng
            }].filter(item => !isNaN(item.lat) && !isNaN(item.lng) && item.lat >= -90 && item.lat <= 90 && item.lng >= -180 && item.lng <= 180) : [];

            const destItems = (route.destinations || []).filter(dest => {
                if (!dest.destination_latlng || !dest.destination_hexid || !h3.isValidCell(dest.destination_hexid)) {
                    console.warn(`Route ${route.route_number}: Skipped destination ${dest.destination || 'Unknown'} due to invalid data`);
                    return false;
                }
                return !isNaN(dest.destination_latlng.lat) && !isNaN(dest.destination_latlng.lng) &&
                       dest.destination_latlng.lat >= -90 && dest.destination_latlng.lat <= 90 &&
                       dest.destination_latlng.lng >= -180 && dest.destination_latlng.lng <= 180;
            }).map(dest => ({
                minX: dest.destination_latlng.lat,
                minY: dest.destination_latlng.lng,
                minZ: dest.destination_hexid,
                maxX: dest.destination_latlng.lat,
                maxY: dest.destination_latlng.lng,
                maxZ: dest.destination_hexid,
                routeNumber: route.route_number,
                label: dest.destination || 'Unknown',
                lat: dest.destination_latlng.lat,
                lng: dest.destination_latlng.lng
            }));

            return [...pickupItems, ...destItems];
        });

        globalRoute3DIndex.load(items);
        console.log(`Pre-indexed ${items.length} points into RBush-3D`);

        return true;
    } catch (error) {
        console.error('Failed to load and pre-process route data:', error);
        throw new Error(`Could not load bus route data: ${error.message}`);
    }
}

function validateGlobalRoutesDAG(data) {
    if (!data || !data.non_null_objects || !Array.isArray(data.non_null_objects)) {
        console.error('Invalid globalRoutesDAG structure:', data);
        return false;
    }
    return true;
}

async function getDirections(directionsService, origin, destination, additionalLocations) {
    try {
        const directionsResponse = await calcRoute(directionsService, origin, destination, additionalLocations);
        if (directionsResponse?.status !== google.maps.DirectionsStatus.OK) {
            throw new Error(`Directions API failed: ${directionsResponse?.status}`);
        }
        const cleanedResponse = removeEmptyDicts(directionsResponse);
        if (!cleanedResponse || !cleanedResponse.routes || cleanedResponse.routes.length === 0) {
            throw new Error('Cleaned directions response is empty or invalid');
        }
        return cleanedResponse;
    } catch (error) {
        console.error('Directions API error:', error);
        throw error;
    }
}

async function main(directionsService, overrideOrigin = null, overrideDestination = null, overrideWaypoints = null) {
    if (!directionsService) {
        console.error('DirectionsService not provided');
        return;
    }

    const button = document.querySelector('.btn-success');
    if (!button) {
        console.error('Button not found!');
        return;
    }

    if (!globalRoutesDAG || !globalRoute3DIndex) {
        try {
            await loadRouteData();
        } catch (error) {
            console.error('Route data load failed:', error);
            alert(`Failed to initialize: ${error.message}`);
            return;
        }
    }

    if (!validateGlobalRoutesDAG(globalRoutesDAG)) {
        alert('Route data not initialized.');
        return;
    }

    button.addEventListener('click', async () => {
        try {
            button.disabled = true;
            button.textContent = 'Calculating...';

            const originInput = document.getElementById('origin');
            const destinationInput = document.getElementById('destination');
            const additionalLocationsInput = document.getElementById('additional-locations');
            const h3ResolutionInput = document.getElementById('h3-resolution');
            const rnpInput = document.getElementById('rnp-value');
            const maxDistanceInput = document.getElementById('max-distance-km');
            const ringSizeInput = document.getElementById('ring-size');

            if (!originInput || !destinationInput) {
                throw new Error('Origin or destination input missing.');
            }

            let origin = overrideOrigin || originInput.value.trim();
            let destination = overrideDestination || destinationInput.value.trim();
            let additionalLocations = overrideWaypoints ||
                (additionalLocationsInput?.value.trim()
                    ? additionalLocationsInput.value.split(',').map(loc => loc.trim())
                    : []);

            if (origin.includes('→') || destination.includes('→')) {
                const legs = [origin, ...additionalLocations, destination]
                    .flatMap(str => str.split('→').map(s => s.trim()))
                    .filter(s => s);
                if (legs.length < 2) {
                    throw new Error('Multi-leg input needs origin and destination.');
                }
                origin = legs[0];
                destination = legs[legs.length - 1];
                additionalLocations = legs.slice(1, -1);
            }

            if (!origin || !destination) {
                throw new Error('Enter both origin and destination.');
            }

            const cleanedResponse = await getDirections(directionsService, origin, destination, additionalLocations);
            const locations = extractLocationsFromDirections(cleanedResponse, origin, additionalLocations, destination);
            if (!locations.length) {
                throw new Error('No locations extracted.');
            }

            const sanitizedLocations = locations.map(loc => {
                const lat = parseFloat(loc.lat);
                const lng = parseFloat(loc.lng);
                if (isNaN(lat) || lat < -90 || lat > 90 || isNaN(lng) || lng < -180 || lng > 180) {
                    console.warn(`Invalid coordinates for ${loc.label}: lat ${lat}, lng ${lng}`);
                    return null;
                }
                return { ...loc, lat, lng };
            }).filter(Boolean);

            if (!sanitizedLocations.length) {
                throw new Error('All locations had invalid coordinates.');
            }

            const h3Resolution = h3ResolutionInput?.value ? parseInt(h3ResolutionInput.value, 10) : 8;
            const rnpValue = rnpInput?.value ? parseFloat(rnpInput.value) : 0.3;
            const maxDistanceKm = maxDistanceInput?.value ? parseFloat(maxDistanceInput.value) : 1.0;
            const ringSize = ringSizeInput?.value ? parseInt(ringSizeInput.value, 10) : 1;

            if (isNaN(h3Resolution) || h3Resolution < 0 || h3Resolution > 15) {
                throw new Error('Invalid H3 resolution (0-15).');
            }
            if (isNaN(rnpValue) || rnpValue <= 0) {
                throw new Error('Invalid RNP value (>0).');
            }
            if (isNaN(maxDistanceKm) || maxDistanceKm <= 0) {
                throw new Error('Invalid max distance (>0).');
            }
            if (isNaN(ringSize) || ringSize < 0) {
                throw new Error('Invalid ring size (>=0).');
            }

            const helixStructure = buildHelixStructure(sanitizedLocations, rnpValue, h3Resolution);
            helixStructure.h3Resolution = h3Resolution;
            helixStructure.maxDistanceKm = maxDistanceKm;
            helixStructure.ringSize = ringSize;

            const busRoutesResult = await findMa3(helixStructure, {
                non_null_objects: globalRoutesDAG.non_null_objects,
                prebuiltRoute3DIndex: globalRoute3DIndex
            });
            const resultDiv = document.getElementById('bus-routes');
            if (!resultDiv) {
                console.log('Bus Routes Result:', busRoutesResult);
            } else if (!busRoutesResult.routes.length) {
                resultDiv.innerHTML = '<p>No bus routes found. Check inputs or data.</p>';
            } else {
                displayResults(busRoutesResult, helixStructure);
            }
        } catch (error) {
            console.error('Route calculation error:', error);
            alert(`Error: ${error.message}`);
        } finally {
            button.disabled = false;
            button.textContent = 'Calculate Route';
        }
    });
}

export { main };
