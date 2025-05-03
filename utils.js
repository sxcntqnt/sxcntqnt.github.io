
/**
 * Fetches and processes bus route data from a JSON file for indexing.
 * @param {string} jsonPath - Path to the JSON file (e.g., 'json/YesBana.json')
 * @returns {Promise<Object>} Processed route data compatible with Supercluster and RBush3D
 */
export async function fetchAndIndexBusRoutes(jsonPath) {
    try {
        const response = await fetch(jsonPath);
        if (!response.ok) throw new Error(`HTTP error ${response.status}: ${response.statusText}`);

        const data = await response.json();
        if (!data?.non_null_objects?.length) throw new Error('No valid routes found in JSON under "non_null_objects"');

        const h3 = window.h3 || {};
        if (!h3.latLngToCell) throw new Error('H3 library not loaded');

        const processedRoutes = data.non_null_objects
            .filter(route => 
                route.route_number && 
                route.pickup_point?.pickup_latlng?.latitude != null && 
                route.pickup_point?.pickup_latlng?.longitude != null && 
                route.destinations?.length > 0
            )
            .map(route => {
                const pickupLat = route.pickup_point.pickup_latlng.latitude;
                const pickupLng = route.pickup_point.pickup_latlng.longitude;
                const lastDestination = route.destinations[route.destinations.length - 1];
                const destLat = lastDestination.destination_latlng.latitude;
                const destLng = lastDestination.destination_latlng.longitude;

                return {
                    route_number: route.route_number,
                    pickup_point: {
                        name: route.pickup_point.pickup_point,
                        pickup_latlng: { latitude: pickupLat, longitude: pickupLng },
                        pickup_hexid: route.pickup_point.pickup_hexid || 
                            h3.latLngToCell(pickupLat, pickupLng, 7)
                    },
                    destinations: route.destinations.map(dest => ({
                        name: dest.destination,
                        destination_latlng: { 
                            latitude: dest.destination_latlng.latitude, 
                            longitude: dest.destination_latlng.longitude 
                        },
                        destination_hexid: dest.destination_hexid || 
                            h3.latLngToCell(dest.destination_latlng.latitude, dest.destination_latlng.longitude, 7)
                    })),
                    h3Index: route.pickup_point.pickup_hexid || h3.latLngToCell(pickupLat, pickupLng, 7) // For backward compatibility
                };
            })
            .filter(route => 
                route.h3Index && 
                route.pickup_point.pickup_hexid && 
                route.destinations.every(dest => dest.destination_hexid)
            );

        if (!processedRoutes.length) {
            console.warn('No routes with valid H3 indices after filtering');
        } else {
            console.log(`Processed ${processedRoutes.length} routes from ${jsonPath}`);
        }

        return { non_null_objects: processedRoutes };
    } catch (error) {
        console.error('Bus routes fetch error:', error);
        return { non_null_objects: [] };
    }
}

export function decodePolyline(polylineStr) {
    if (!polylineStr) {
        console.warn('Invalid polyline string provided.');
        return [];
    }
    try {
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
    } catch (error) {
        console.error('Error decoding polyline:', error);
        return [];
    }
}
// Ensure removeEmptyDicts preserves polyline strings
export function removeEmptyDicts(obj) {
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

export function buildHelixStructure(locations, rnpValue, h3Resolution = 8) {
    const points = locations.map(loc => {
        const lat = loc.lat;
        const lng = loc.lng;
        return {
            label: loc.label,
            lat,
            lng,
            h3Index: h3.latLngToCell(lat, lng, h3Resolution)
        };
    });
    return {
        points,
        rnpValue,
        h3Center: h3.latLngToCell(locations[0].lat, locations[0].lng, h3Resolution),
        h3Resolution
    };
}

export function extractLocationsFromDirections(directionsResponse, origin, waypoints, destination) {
    if (!directionsResponse || !directionsResponse.routes || directionsResponse.routes.length === 0) {
        console.error('Invalid or empty directionsResponse:', directionsResponse);
        return [];
    }

    const inputLabels = [origin, ...waypoints, destination];
    const locations = [];
    const legs = directionsResponse.routes[0].legs || [];

    if (!legs.length) {
        console.error('No legs found in directionsResponse:', directionsResponse);
        return [];
    }

    legs.forEach((leg, legIndex) => {
        let startLat, startLng;
        if (leg.start_location) {
            startLat = typeof leg.start_location.lat === 'function' ? leg.start_location.lat() : leg.start_location.lat;
            startLng = typeof leg.start_location.lng === 'function' ? leg.start_location.lng() : leg.start_location.lng;
            if (typeof startLat === 'number' && typeof startLng === 'number' && legIndex === 0) {
                locations.push({
                    lat: startLat,
                    lng: startLng,
                    label: inputLabels[0]
                });
            }
        } else if (legIndex === 0) {
            console.warn('No start_location in leg 0; will try steps');
        }

        let endLat, endLng;
        if (leg.end_location) {
            endLat = typeof leg.end_location.lat === 'function' ? leg.end_location.lat() : leg.end_location.lat;
            endLng = typeof leg.end_location.lng === 'function' ? leg.end_location.lng() : leg.end_location.lng;
            if (typeof endLat === 'number' && typeof endLng === 'number') {
                locations.push({
                    lat: endLat,
                    lng: endLng,
                    label: inputLabels[legIndex + 1]
                });
            } else {
                console.warn(`Invalid end_location in leg ${legIndex}:`, leg.end_location);
            }
        } else {
            console.warn(`No end_location in leg ${legIndex}; will try steps`);
        }

        if ((!leg.start_location || !leg.end_location) && leg.steps && Array.isArray(leg.steps)) {
            console.log(`Falling back to steps for leg ${legIndex}`);
            let addedStart = legIndex !== 0 || leg.start_location;
            leg.steps.forEach((step, stepIndex) => {
                const encodedString = step.encoded_lat_lngs || (step.polyline && step.polyline.points);
                if (!encodedString || typeof encodedString !== 'string') {
                    console.warn(`Skipping step ${stepIndex} due to missing or invalid encoded_lat_lngs/polyline`, step);
                    return;
                }

                const decodedCoords = decodePolyline(encodedString);
                if (!Array.isArray(decodedCoords) || !decodedCoords.length) {
                    console.warn(`Skipping step ${stepIndex}: decodePolyline failed`, decodedCoords);
                    return;
                }

                if (!addedStart && legIndex === 0 && stepIndex === 0) {
                    const [lat, lng] = decodedCoords[0];
                    locations.push({ lat, lng, label: inputLabels[0] });
                    addedStart = true;
                }
                if (!leg.end_location && stepIndex === leg.steps.length - 1) {
                    const [lat, lng] = decodedCoords[decodedCoords.length - 1];
                    locations.push({ lat, lng, label: inputLabels[legIndex + 1] });
                }
            });
        }
    });

    const uniqueLocations = [];
    const seen = new Set();
    for (const loc of locations) {
        if (!loc || typeof loc.lat !== 'number' || typeof loc.lng !== 'number' || !loc.label) {
            console.warn('Skipping invalid location:', loc);
            continue;
        }
        const key = `${loc.lat.toFixed(6)},${loc.lng.toFixed(6)}`;
        if (!seen.has(key)) {
            seen.add(key);
            uniqueLocations.push(loc);
        }
    }

    if (!uniqueLocations.length) {
        console.error('Failed to extract any valid locations from directionsResponse');
    } else {
        console.log('Final Locations:', uniqueLocations);
    }
    return uniqueLocations;
}


export function refineCoordinates(latLng) {
    if (!latLng) return null;
    const lat = typeof latLng.latitude === 'function' ? latLng.latitude() : parseFloat(latLng.latitude);
    const lng = typeof latLng.longitude === 'function' ? latLng.longitude() : parseFloat(latLng.longitude);
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        console.warn(`Invalid coordinates: lat ${lat}, lng ${lng}`);
        return null;
    }
    return { lat, lng };
}
