import { initializeAutocomplete, createInputGroup, addLocation, getAdditionalLocations, calcRoute } from './calcRoute.js';
import { findMa3 } from './findMat.js';
import { locateAndMarkUser } from './utils.js';

let response; // Store response for ETA checks

// Periodically check ETA based on live traffic conditions
setInterval(() => {
    if (response?.routes?.[0]?.legs?.length > 0) {
        const actualRoute = response.routes[0];
        const actualTimesSum = actualRoute.legs.reduce((sum, leg) => sum + leg.duration.value, 0);
        const etaMinutes = Math.ceil(actualTimesSum / 60);
        document.getElementById("estimatedTime").innerText = `${etaMinutes} min`;
    }
}, 5 * 60 * 1000); // Check every 5 minutes

// Function to initialize all input fields with autocomplete
async function initializeAllAutocompletes() {
    const originInput = document.getElementById('origin');
    const destinationInput = document.getElementById('destination');

    if (originInput) {
        await initializeAutocomplete(originInput);
    } else {
        console.error('Origin input not found!');
    }

    if (destinationInput) {
        await initializeAutocomplete(destinationInput);
    } else {
        console.error('Destination input not found!');
    }

    // Initialize autocomplete for additional location inputs
    const additionalLocationInputs = document.querySelectorAll('#additionalLocations input[type="text"]');
    for (const input of additionalLocationInputs) {
        await initializeAutocomplete(input);
    }
}

// Initialize the inputs on page load
async function initializeInputs() {
    const additionalLocationsContainer = document.getElementById('additionalLocations');
    if (!additionalLocationsContainer) {
        console.error('Additional locations container not found!');
        return;
    }

    const initialInputGroup = createInputGroup();
    additionalLocationsContainer.appendChild(initialInputGroup);

    // Initialize autocomplete for all relevant inputs
    await initializeAllAutocompletes();
}

// Initialize the program
window.initMap = async function () {
    const directionsService = new google.maps.DirectionsService();
    const mapOptions = {
        center: { lat: -1.286389, lng: 36.817223 },
        zoom: 10,
        mapTypeId: google.maps.MapTypeId.ROADMAP
    };

    const map = new google.maps.Map(document.getElementById('googlemap'), mapOptions);
    const directionsDisplay = new google.maps.DirectionsRenderer();
    directionsDisplay.setMap(map); // Set the map for the directions display

    await initializeInputs(); // Initialize inputs here
    await main(directionsService, directionsDisplay, map); // Pass the map instance
}

// Main function to handle user interaction and route calculation
async function main(directionsService, directionsDisplay, map) {
    const button = document.querySelector('.btn-success');
    if (button) {
        button.addEventListener('click', async () => {
            try {
                // Fetch user's location and mark it on the map
                const { address, coordinates } = await getUserLocationAndMark(map);
                console.log('User location:', coordinates);
                console.log('User address:', address);

                // Populate the origin input with the user's address
                const originInput = document.getElementById('origin');
                originInput.value = address;  // Set the address into the input field

                // You can now use the coordinates in the `coordinates` variable
                // for any further processing or API calls.

                // Calculate the route
                const directionsResponse = await calcRoute(directionsService, map);

                if (directionsResponse && directionsResponse.status === 'OK') {
                    // Pass userLocation and directionsResponse to findMa3
                    response = directionsResponse; // Store response for ETA checks
                    await findMa3({ userLocation: coordinates, directionsResponse });
                } else {
                    console.error('No valid directions received:', directionsResponse);
                    alert('No valid directions found. Please check your inputs and try again.');
                }
            } catch (error) {
                console.error('An error occurred while getting user location:', error);
                alert('An error occurred while locating you. Please ensure location services are enabled and try again.');
            }
        });
    } else {
        console.error('Button for route calculation not found!');
    }
}

// Function to get user location and mark it on the map
async function getUserLocationAndMark(map) {
    try {
        // Call locateAndMarkUser and await the result (address and location)
        const { address, coordinates } = await locateAndMarkUser(map);
        if (!coordinates) {
            throw new Error('User location could not be determined.');
        }

        // Return both the address and coordinates
        return { address, coordinates };
    } catch (error) {
        console.error('Error in getUserLocationAndMark:', error);
        throw new Error(`Error locating user: ${error.message}`);
    }
}
