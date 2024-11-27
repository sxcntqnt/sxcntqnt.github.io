import { initializeAutocomplete, createInputGroup, addLocation, getAdditionalLocations, calcRoute } from './calcRoute.js';
import { findMa3 } from './findMat.js';
import { locateAndMarkUser } from './utils.js';

let response; // Store response for ETA checks

// Periodically check ETA based on live traffic conditions
setInterval(() => {
    if (response && response.routes && response.routes.length > 0 &&
        response.routes[0].legs && response.routes[0].legs.length > 0) {
        
        const actualRoute = response.routes[0];
        let actualTimesSum = actualRoute.legs.reduce((sum, leg) => sum + leg.duration.value, 0);
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
    const initialInputGroup = createInputGroup();
    additionalLocationsContainer.appendChild(initialInputGroup);

    // Initialize autocomplete for all relevant inputs
    await initializeAllAutocompletes();
}


//initialize program
window.initMap = async function() {   
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
    await locateAndMarkUser(map);
    await main(directionsService, directionsDisplay, map); // Pass the map instance
}


// Assume directionsService, directionsDisplay, and map are defined earlier in your code
async function main(directionsService, directionsDisplay, map) {
    document.querySelector('.btn-success').addEventListener('click', async () => {
        try {
            // Fetch user's location
            const userLocation = await new Promise((resolve, reject) => {
                getUserLocation(apiKey, (error, location) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve(location);
                    }
                });
            });

            console.log("User's Location:", userLocation);

            // Calculate the route
            const directionsResponse = await calcRoute(directionsService, map);
            if (directionsResponse && directionsResponse.status === 'OK') {
                // Pass userLocation and directionsResponse to findMa3
                findMa3({ userLocation, directionsResponse });
            } else {
                console.error('No valid directions received:', directionsResponse);
                alert('No valid directions found. Please check your inputs and try again.');
            }
        } catch (error) {
            console.error('An error occurred:', error);
            alert('An error occurred. Please try again.');
        }
    });
}


