let additionalLocationsCount = 0;
const MAX_LOCATIONS = 10;

function addLocation() {
    if (additionalLocationsCount < MAX_LOCATIONS) {
        additionalLocationsCount++;
        const inputGroup = createInputGroup();
        const container = document.getElementById('additionalLocations');
        container.appendChild(inputGroup);
    } else {
        alert(`You have reached the maximum limit of additional locations (${MAX_LOCATIONS}).`);
    }
}

function createInputGroup() {
    const inputGroup = document.createElement('div');
    inputGroup.classList.add('input-group', 'mb-3');

    const input = createInput();
    initializeAutocomplete(input);

    inputGroup.appendChild(input);
    return inputGroup;
}

function createInput() {
    const input = document.createElement('input');
    input.type = 'text';
    input.classList.add('form-control', 'smallInput');
    input.placeholder = `Location ${additionalLocationsCount}`;
    return input;
}

function initializeAutocomplete(input) {
    const autocomplete = new google.maps.places.Autocomplete(input);
    autocomplete.setFields(['address_components', 'geometry', 'icon', 'name']);
}

window.getAdditionalLocations = async function() {
    const additionalLocations = [];
    const inputs = document.querySelectorAll('#additionalLocations input[type="text"]');
    inputs.forEach(input => {
        const value = input.value.trim();
        if (value) {
            additionalLocations.push(value);
        }
    });
    return additionalLocations;
}


async function fetchDirections(origin, destination, waypoints) {
    const request = {
        origin: origin,
        destination: destination,
        travelMode: google.maps.TravelMode.DRIVING, // Default travel mode
        waypoints: waypoints.length > 0 ? waypoints : undefined,
    };

    const directionsService = new google.maps.DirectionsService();

    return new Promise((resolve, reject) => {
        directionsService.route(request, (response, status) => {
            if (status === 'OK') {
                resolve(response);
            } else {
                reject(`Directions request failed: ${status}`);
            }
        });
    });
}

function displayResults(response) {
    const resultDiv = document.getElementById('result');
    if (response) {
        resultDiv.innerHTML = "<h2>Route Details:</h2>";
        const route = response.routes[0];
        const routeSummary = route.summary;
        const totalDistance = route.legs.reduce((acc, leg) => acc + leg.distance.value, 0) / 1000; // Convert to km
        const totalDuration = route.legs.reduce((acc, leg) => acc + leg.duration.value, 0);

        const formattedDistance = totalDistance.toFixed(2) + ' km';
        const formattedDuration = formatDuration(totalDuration);

        const htmlContent = `
            <p><strong>Summary:</strong> ${routeSummary}</p>
            <p><strong>Total Distance:</strong> ${formattedDistance}</p>
            <p><strong>Estimated Time:</strong> ${formattedDuration}</p>
        `;
        resultDiv.innerHTML = htmlContent;
    } else {
        resultDiv.innerHTML = "<p>No route found for the given locations.</p>";
    }
}

function formatDuration(durationInSeconds) {
    const hours = Math.floor(durationInSeconds / 3600);
    const minutes = Math.floor((durationInSeconds % 3600) / 60);
    let formattedDuration = '';
    if (hours > 0) formattedDuration += hours + ' hour' + (hours > 1 ? 's' : '');
    if (minutes > 0) formattedDuration += (formattedDuration ? ' ' : '') + minutes + ' min';
    return formattedDuration || '0 min';
}

export async function calcRoute(directionsService, map) {
    const origin = document.getElementById('origin').value;
    const destination = document.getElementById('destination').value;

    const additionalLocations = document.querySelectorAll('.smallInput');
    const waypoints = Array.from(additionalLocations)
        .map(location => ({ location: location.value.trim(), stopover: true }))
        .filter(waypoint => waypoint.location !== '')
        .slice(0, MAX_LOCATIONS); // Limit to MAX_LOCATIONS

    const request = {
        origin: origin,
        destination: destination,
        waypoints: waypoints,
        travelMode: google.maps.TravelMode.DRIVING,
    };

    try {
        const directionsResponse = await fetchDirections(request, directionsService);
        response = directionsResponse; // Store the response for ETA checks
        directionsDisplay.setDirections(directionsResponse);
        displayResults(directionsResponse); // Call your display results function
    } catch (error) {
        console.error('Error calculating route:', error.message);
        alert('Failed to calculate the route. Please try again.');
    }
}


window.calcRoute = calcRoute; // Make calcRoute globally accessible
