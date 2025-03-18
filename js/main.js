import { initializeAutocomplete, createInputGroup, addLocation, getAdditionalLocations, calcRoute } from './calcRoute.js';
import { findMa3 } from './findMat.js';
//import { locateAndMarkUser } from './utils.js';

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
                // Get origin, destination, and additional locations from input fields
                const originInput = document.getElementById('origin');
                const destinationInput = document.getElementById('destination');
                const additionalLocationsInput = document.getElementById('additional-locations'); // Optional field for extra points

                if (!originInput || !destinationInput) {
                    throw new Error('Origin or destination input field not found.');
                }

                const origin = originInput.value.trim();
                const destination = destinationInput.value.trim();
                let additionalLocations = additionalLocationsInput && additionalLocationsInput.value.trim() 
                    ? additionalLocationsInput.value.split(',').map(loc => loc.trim()) 
                    : [];

                if (!origin || !destination) {
                    throw new Error('Please enter both origin and destination.');
                }

                console.log('Origin:', origin);
                console.log('Destination:', destination);
                console.log('Additional Locations:', additionalLocations);

                // Calculate the route using existing calcRoute function
                const directionsResponse = await calcRoute(directionsService, map);

                if (directionsResponse && directionsResponse.status === 'OK') {
                    // Extract locations from inputs and Directions API
                    const locations = [
                        { lat: directionsResponse.routes[0].legs[0].start_location.lat, lng: directionsResponse.routes[0].legs[0].start_location.lng }
                    ];

                    // Add any additional locations (assuming they need geocoding or manual lat/lng input)
                    if (additionalLocations.length > 0) {
                        // For simplicity, assume additionalLocations are lat,lng strings (e.g., "-1.2932,36.8128")
                        additionalLocations.forEach(loc => {
                            const [lat, lng] = loc.split(',').map(Number);
                            if (!isNaN(lat) && !isNaN(lng)) {
                                locations.push({ lat, lng });
                            } else {
                                console.warn(`Invalid lat/lng format for additional location: ${loc}`);
                            }
                        });
                    }

                    // Add destination from Directions API
                    locations.push({
                        lat: directionsResponse.routes[0].legs[0].end_location.lat,
                        lng: directionsResponse.routes[0].legs[0].end_location.lng
                    });

                    console.log('Processed Locations:', locations);

                    // Store response for ETA checks (assuming response is global)
                    response = directionsResponse;

                    // Pass locations and directionsResponse to findMa3
                    await findMa3({ locations, directionsResponse });
                } else {
                    console.error('No valid directions received:', directionsResponse);
                    alert('No valid directions found. Please check your inputs and try again.');
                }
            } catch (error) {
                console.error('An error occurred while calculating the route:', error.message);
                alert('An error occurred: ' + error.message);
            }
        });
    } else {
        console.error('Button for route calculation not found!');
    }
}
