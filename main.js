// main.js
import { calcRoute } from './calcRoute.js';
import { findMa3 } from './findMat.js';
import { decodePolyline, removeEmptyDicts, fetchAndIndexBusRoutes, extractLocationsFromDirections, buildHelixStructure } from './utils.js';

let globalRoutesDAG = null;

async function loadRouteData(jsonPath = './json/YesBana.json') {
    try {
        const data = await fetchAndIndexBusRoutes(jsonPath);
        if (!data || !Array.isArray(data.non_null_objects) || !data.non_null_objects.length) {
            throw new Error('Fetched route data is invalid or contains no valid routes');
        }
        globalRoutesDAG = data;
        console.log('Route data loaded and processed:', {
            totalRoutes: globalRoutesDAG.non_null_objects.length,
            firstRoute: globalRoutesDAG.non_null_objects[0].route_number
        });
        return true; // Indicate success
    } catch (error) {
        console.error('Failed to load and process route data:', error);
        throw new Error(`Could not load bus route data from ${jsonPath}: ${error.message}`);
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
        console.log('Raw Directions Response:', JSON.stringify(directionsResponse, null, 2));

        if (directionsResponse?.status !== google.maps.DirectionsStatus.OK) {
            throw new Error(`Directions API failed: ${directionsResponse?.status}`);
        }

        const cleanedResponse = removeEmptyDicts(directionsResponse);
        if (!cleanedResponse || !cleanedResponse.routes || cleanedResponse.routes.length === 0) {
            throw new Error('Cleaned directions response is empty or invalid');
        }

        console.log('Cleaned Response:', JSON.stringify(cleanedResponse, null, 2));
        return cleanedResponse;
    } catch (error) {
        console.error('Directions API or data processing error:', error);
        throw error; // Re-throw to be handled by the main function
    }
}

async function main(directionsService, overrideOrigin = null, overrideDestination = null, overrideWaypoints = null) {
    if (!directionsService) {
        console.error('DirectionsService not provided');
        return;
    }

    const button = document.querySelector('.btn-success');
    if (!button) {
        console.error('Button for route calculation not found!');
        return;
    }

    // Load route data if not already loaded
    if (!globalRoutesDAG) {
        try {
            await loadRouteData();
        } catch (error) {
            console.error('Initial route data load failed:', error);
            alert(`Failed to initialize route data: ${error.message}`);
            return; // Exit early if loading fails
        }
    }

    // Double-check globalRoutesDAG before proceeding
    if (!validateGlobalRoutesDAG(globalRoutesDAG)) {
        alert('Route data is not properly initialized. Check console for details.');
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
                throw new Error('Origin or destination input field not found in DOM.');
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
                    throw new Error('Multi-leg input must specify at least origin and destination.');
                }
                origin = legs[0];
                destination = legs[legs.length - 1];
                additionalLocations = legs.slice(1, -1);
            }

            if (!origin || !destination) {
                throw new Error('Please enter both origin and destination.');
            }

            // Get directions
            let cleanedResponse;
            try {
                cleanedResponse = await getDirections(directionsService, origin, destination, additionalLocations);
                window.response = cleanedResponse;
            } catch (error) {
                console.error('Error fetching directions:', error);
                alert(`Failed to get directions: ${error.message}`);
                return; // Exit early
            }

            const locations = extractLocationsFromDirections(cleanedResponse, origin, additionalLocations, destination);
            if (!locations.length) {
                throw new Error('No locations extracted from cleaned directions');
            }

            const sanitizedLocations = locations.map(loc => {
                const lat = parseFloat(loc.lat);
                const lng = parseFloat(loc.lng);
                if (isNaN(lat) || lat < -90 || lat > 90 || isNaN(lng) || lng < -180 || lng > 180) {
                    console.warn(`Invalid coordinates for ${loc.label}: lat ${lat}, lng ${lng} - skipping`);
                    return null;
                }
                return { ...loc, lat, lng };
            }).filter(Boolean);

            if (!sanitizedLocations.length) {
                throw new Error('All extracted locations had invalid coordinates');
            }
            console.log('Sanitized Processed Locations:', sanitizedLocations);

            const h3Resolution = h3ResolutionInput?.value ? parseInt(h3ResolutionInput.value, 10) : 8;
            const rnpValue = rnpInput?.value ? parseFloat(rnpInput.value) : 0.3;
            const maxDistanceKm = maxDistanceInput?.value ? parseFloat(maxDistanceInput.value) : 1.0;
            const ringSize = ringSizeInput?.value ? parseInt(ringSizeInput.value, 10) : 1;

            if (isNaN(h3Resolution) || h3Resolution < 0 || h3Resolution > 15) {
                throw new Error('Invalid H3 resolution; must be between 0 and 15.');
            }
            if (isNaN(rnpValue) || rnpValue <= 0) {
                throw new Error('Invalid RNP value; must be a positive number.');
            }
            if (isNaN(maxDistanceKm) || maxDistanceKm <= 0) {
                throw new Error('Invalid max distance for clustering; must be a positive number.');
            }
            if (isNaN(ringSize) || ringSize < 0) {
                throw new Error('Invalid ring size for hex clustering; must be non-negative.');
            }

            const helixStructure = buildHelixStructure(sanitizedLocations, rnpValue, h3Resolution);
            helixStructure.h3Resolution = h3Resolution;
            helixStructure.maxDistanceKm = maxDistanceKm;
            helixStructure.ringSize = ringSize;
            console.log('Helix Structure:', helixStructure);

            // Validate globalRoutesDAG structure before refining
            if (!globalRoutesDAG.non_null_objects || !Array.isArray(globalRoutesDAG.non_null_objects)) {
                console.error('globalRoutesDAG.non_null_objects is invalid:', globalRoutesDAG);
                throw new Error('Route data structure is corrupted or missing non_null_objects');
            }

            const refinedRoutes = globalRoutesDAG.non_null_objects.map(route => {
                const pickupLatLng = route.pickup_point?.pickup_latlng;
                if (!pickupLatLng || isNaN(pickupLatLng.latitude) || isNaN(pickupLatLng.longitude)) {
                    console.warn(`Skipping route ${route.route_number}: Missing or invalid pickup coordinates`);
                    return null;
                }
                const pickupLat = parseFloat(pickupLatLng.latitude);
                const pickupLng = parseFloat(pickupLatLng.longitude);
                if (pickupLat < -90 || pickupLat > 90 || pickupLng < -180 || pickupLng > 180) {
                    console.warn(`Skipping route ${route.route_number}: Invalid pickup coordinates (lat: ${pickupLat}, lng: ${pickupLng})`);
                    return null;
                }

                const validDestinations = (route.destinations || []).map(d => {
                    const dLatLng = d.destination_latlng;
                    if (!dLatLng || isNaN(dLatLng.latitude) || isNaN(dLatLng.longitude)) {
                        console.warn(`Skipping destination in route ${route.route_number}: Missing or invalid coordinates`);
                        return null;
                    }
                    const dLat = parseFloat(dLatLng.latitude);
                    const dLng = parseFloat(dLatLng.longitude);
                    if (dLat < -90 || dLat > 90 || dLng < -180 || dLng > 180) {
                        console.warn(`Skipping destination in route ${route.route_number}: Invalid coordinates (lat: ${dLat}, lng: ${dLng})`);
                        return null;
                    }
                    return { ...d, destination_latlng: { latitude: dLat, longitude: dLng } };
                }).filter(Boolean);

                if (!validDestinations.length) {
                    console.warn(`Skipping route ${route.route_number}: No valid destinations`);
                    return null;
                }

                return {
                    ...route,
                    pickup_point: {
                        ...route.pickup_point,
                        pickup_latlng: { latitude: pickupLat, longitude: pickupLng }
                    },
                    destinations: validDestinations
                };
            }).filter(Boolean);

            if (!refinedRoutes.length) {
                throw new Error('No valid routes found in globalRoutesDAG after validation');
            }
            console.log('Refined Routes Sample:', refinedRoutes.slice(0, 2));

            const busRoutesResult = await findMa3(helixStructure, { non_null_objects: refinedRoutes });
            const resultDiv = document.getElementById('bus-routes');
            if (!resultDiv) {
                console.warn('No #bus-routes element found; logging results instead');
                console.log('Bus Routes Result:', busRoutesResult);
            } else if (!busRoutesResult.routes.length) {
                console.warn('No bus routes found');
                resultDiv.innerHTML = '<p>No bus routes found. Check input locations or data availability.</p>';
            } else {
                console.log('Bus Routes Result:', busRoutesResult);
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
