let additionalLocationsCount = 0;
const MAX_LOCATIONS = 10;
const additionalLocations = []; // Initialize an array to hold additional locations

// Initialize the autocomplete for the input element
async function initializeAutocomplete(input) {
    await google.maps.importLibrary("places");

    const autocomplete = new google.maps.places.Autocomplete(input);
    autocomplete.setFields(['address_components', 'geometry', 'icon', 'name']);
}

// Create a new input group for additional locations
function createInputGroup() {
    const inputGroup = document.createElement('div');
    inputGroup.classList.add('input-group', 'mb-3');

    const input = createInput(additionalLocationsCount); // Pass the current count for accurate placeholder
    initializeAutocomplete(input);

    inputGroup.appendChild(input);
    return inputGroup;
}

// Create a new input element for the specified index
function createInput(index) {
    const input = document.createElement('input');
    input.type = 'text';
    input.classList.add('form-control', 'smallInput');
    input.placeholder = `Location ${index}`; // Use the provided index for accurate labeling
    return input;
}

// Add a new location input if the maximum hasn't been reached
export async function addLocation() {
    if (additionalLocationsCount < MAX_LOCATIONS) {
        additionalLocationsCount++;
        const inputGroup = createInputGroup(); // Create a new input group
        const container = document.getElementById('additionalLocations');
        container.appendChild(inputGroup); // Append it to the container
    } else {
        alert(`You have reached the maximum limit of additional locations (${MAX_LOCATIONS}).`);
    }
}

// Get additional locations from the input fields
export async function getAdditionalLocations() {
    additionalLocations.length = 0; // Clear previous locations
    const inputs = document.querySelectorAll('#additionalLocations input[type="text"]');
    inputs.forEach(input => {
        const value = input.value.trim();
        if (value) {
            additionalLocations.push(value); // Add non-empty values to the array
        }
    });
    return additionalLocations; // Return the populated array
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


async function fetchDirections(origin, destination, waypoints) {
    const request = {
        origin: origin,
        destination: destination,
        travelMode: google.maps.TravelMode.DRIVING, // Default travel mode
    };  

    // Add waypoints only if they exist
    if (waypoints.length > 0) {
        request.waypoints = waypoints.map(location => ({ location, stopover: true }));
    }

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

async function drawPath(directionsResponse) {
    const directionsDisplay = new google.maps.DirectionsRenderer();
    
    // Set the map for the directions display
    const map = new google.maps.Map(document.getElementById('googlemap'), {
        center: { lat: 1.2921, lng: 36.8219 },
        zoom: 12,
    });
    
    directionsDisplay.setMap(map); // Set the map
    directionsDisplay.setDirections(directionsResponse);
    displayResults(directionsResponse); // Call your display results function
}

export async function calcRoute(directionsService, directionsDisplay) {
    const origin = document.getElementById('origin').value.trim();
    const destination = document.getElementById('destination').value.trim();

    if (!origin || !destination) {
        alert('Please provide both origin and destination.');
        return;
    }

    const additionalLocations = await getAdditionalLocations(); // Fetch additional locations
    const waypoints = additionalLocations.map(location => ({ location, stopover: true })); // Format as waypoints

    try {
        const directionsResponse = await fetchDirections(origin, destination, waypoints);

        // Log the response to the console
        console.log('Directions Response:', directionsResponse);

        // Call drawPath to handle displaying the directions
        await drawPath(directionsResponse); // Pass the directionsDisplay

    } catch (error) {
        console.error('Error calculating route:', error.message);
        alert('Failed to calculate the route. Please try again.');
    }
}


window.calcRoute = calcRoute; // Make calcRoute globally accessible
window.addLocation = addLocation;
