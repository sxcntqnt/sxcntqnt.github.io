let additionalLocationsCount = 0;
const MAX_LOCATIONS = 10;
const additionalLocations = []; // Initialize an array to hold additional locations

// Initialize the autocomplete for the input element
export async function initializeAutocomplete(input) {
    await google.maps.importLibrary("places");

    const autocomplete = new google.maps.places.Autocomplete(input);
    autocomplete.setFields(['address_components', 'geometry', 'icon', 'name']);
}

// Create a new input group for additional locations
export function createInputGroup() {
    const inputGroup = document.createElement('div');
    inputGroup.classList.add('input-group', 'mb-3');

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'form-control smallInput';
    input.placeholder = 'Additional Location';

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'btn btn-danger';
    removeButton.innerText = 'Remove';
    removeButton.onclick = () => inputGroup.remove(); // Remove the input group

    inputGroup.appendChild(input);
    inputGroup.appendChild(removeButton);
    return inputGroup;
}

// Add a new location input if the maximum hasn't been reached
export async function addLocation() {
    if (additionalLocationsCount < MAX_LOCATIONS) {
        additionalLocationsCount++;
        const inputGroup = createInputGroup();
        const container = document.getElementById('additionalLocations');

        container.appendChild(inputGroup); // Append it to the container

        // Initialize autocomplete for the newly added input
        const newInput = inputGroup.querySelector('input[type="text"]');
        await initializeAutocomplete(newInput);
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

// Display the results of the directions response
function displayRouteDetails(response) {
    const resultDiv = document.getElementById('route-summary');
    resultDiv.innerHTML = ""; // Clear previous results

    if (response && response.routes && response.routes.length > 0) {
        resultDiv.innerHTML = "<h2>Route Details:</h2>";
        const route = response.routes[0];
        const routeSummary = route.summary;
        const totalDistance = route.legs.reduce((acc, leg) => acc + leg.distance.value, 0) / 1000; // Convert to km
        const totalDuration = route.legs.reduce((acc, leg) => acc + leg.duration.value, 0);

        const formattedDistance = totalDistance.toFixed(2) + ' km';
        const formattedDuration = formatDuration(totalDuration);

        let legsDetails = route.legs.map((leg, index) => {
            const legDistance = (leg.distance.value / 1000).toFixed(2); // Convert to km
            const legDuration = formatDuration(leg.duration.value);
            const legStart = leg.start_address;
            const legEnd = leg.end_address;

            return `<p><strong>Leg ${index + 1}:</strong> ${legStart} to ${legEnd}<br>
                     Distance: ${legDistance} km<br>
                     Estimated Time: ${legDuration}</p>`;
        }).join('');

        const htmlContent = `
            <p><strong>Summary:</strong> ${routeSummary}</p>
            <p><strong>Total Distance:</strong> ${formattedDistance}</p>
            <p><strong>Total Estimated Time:</strong> ${formattedDuration}</p>
            ${legsDetails}
        `;
        resultDiv.innerHTML = htmlContent;
    } else {
        resultDiv.innerHTML = "<p>No route found for the given locations.</p>";
    }
}


// Format duration from seconds to a more readable format
function formatDuration(durationInSeconds) {
    const hours = Math.floor(durationInSeconds / 3600);
    const minutes = Math.floor((durationInSeconds % 3600) / 60);
    let formattedDuration = '';
    if (hours > 0) formattedDuration += hours + ' hour' + (hours > 1 ? 's' : '');
    if (minutes > 0) formattedDuration += (formattedDuration ? ' ' : '') + minutes + ' min';
    return formattedDuration || '0 min';
}

// Fetch directions from the Google Maps Directions Service
async function fetchDirections(origin, destination, waypoints) {
    const request = {
        origin: origin,
        destination: destination,
        travelMode: google.maps.TravelMode.DRIVING, // Default travel mode
    };

    // Add waypoints only if they exist
    if (waypoints.length > 0) {
        request.waypoints = waypoints;
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

// Locally scoped drawPath function
async function drawPath(response, map) {
    if (!response || !response.routes || response.routes.length === 0) {
        console.error("Invalid or empty directions response.");
        console.log("Unable to draw path: Invalid directions response.");
        return; // Early return to prevent further execution
    }
    
    // Valid response and map, proceed to draw the path
    try {
        const directionsDisplay = new google.maps.DirectionsRenderer();
        directionsDisplay.setMap(map); // Set the map for the new DirectionsRenderer
        directionsDisplay.setDirections(response); // Use the passed response
        displayRouteDetails(response); // Call to display results
        console.log("Path drawn successfully.");
    } catch (error) {
        console.error("Error drawing path:", error);
        console.log("An error occurred while drawing the path. Please try again.");
    }
}

// Calculate the route based on user inputs and fetch directions
export async function calcRoute(directionsService, map) {
    const origin = document.getElementById('origin').value.trim();
    const destination = document.getElementById('destination').value.trim();

    if (!origin || !destination) {
        alert('Please provide both origin and destination.');
        return;
    }

    // Fetch additional locations as waypoints
    const additionalLocations = await getAdditionalLocations();
    const waypoints = additionalLocations.map(location => ({ location, stopover: true }));

    try {
        const directionsResponse = await fetchDirections(origin, destination, waypoints);
        
        // Call the function to draw the path on the map
        await drawPath(directionsResponse, map); // Pass the map to drawPath

        // Return the directionsResponse
        return directionsResponse; 

    } catch (error) {
        console.error('Error calculating route:', error.message);
        alert('Failed to calculate the route. Please try again.');
    }
}

// Expose functions to global scope
window.initializeAutocomplete = initializeAutocomplete;
window.addLocation = addLocation;
window.createInputGroup = createInputGroup;
window.calcRoute = calcRoute; // Make calcRoute globally accessible

