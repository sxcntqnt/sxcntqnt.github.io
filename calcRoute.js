// calcRoute.js

// Fetch directions from the Google Maps Directions Service
async function fetchDirections(origin, destination, waypoints, directionsService) {
    if (!google || !google.maps || !google.maps.TravelMode) {
        throw new Error('Google Maps API not loaded yet.');
    }

    const request = {
        origin: origin,
        destination: destination,
        waypoints: waypoints.length > 0 ? waypoints : undefined,
        travelMode: google.maps.TravelMode.DRIVING, // Use DRIVING to avoid TRANSIT waypoint restrictions
        optimizeWaypoints: true, // Optional: optimize waypoint order
    };

    return new Promise((resolve, reject) => {
        console.log('Fetching directions with request:', request);
        directionsService.route(request, (response, status) => {
            if (status === 'OK') {
                console.log("API Response Legs:", response.routes[0].legs.map(leg => `${leg.start_address} → ${leg.end_address}`));
                resolve(response);
            } else {
                console.error('Directions API failed with status:', status);
                reject(new Error(`Directions request failed: ${status}`));
            }
        });
    });
}

// Calculate the route based on user inputs and fetch directions
export async function calcRoute(directionsService) {
    try {
        const originInput = document.getElementById('origin');
        const destinationInput = document.getElementById('destination');
        const additionalLocationsInput = document.getElementById('additional-locations');

        if (!originInput || !destinationInput || !additionalLocationsInput) {
            throw new Error('One or more input elements not found in the DOM.');
        }

        const origin = originInput.value.trim();
        const destination = destinationInput.value.trim();
        const additionalLocationsInputValue = additionalLocationsInput.value.trim();

        if (!origin || !destination) {
            console.warn('Origin or destination is empty.');
            throw new Error('Please provide both origin and destination.');
        }

        // Parse additional locations from the single input field
        const additionalLocations = additionalLocationsInputValue
            ? additionalLocationsInputValue.split(',').map(loc => loc.trim()).filter(loc => loc)
            : [];
        const waypoints = additionalLocations.map(location => ({ location, stopover: true }));
        console.log("Waypoints Order:", waypoints.map(wp => wp.location));

        if (!directionsService) {
            throw new Error('directionsService is not provided.');
        }

        const directionsResponse = await fetchDirections(origin, destination, waypoints, directionsService);
        return directionsResponse;
    } catch (error) {
        console.error('Error in calcRoute:', error.message);
        alert('Failed to calculate the route: ' + error.message);
        return null; // Return null to indicate failure
    }
}
