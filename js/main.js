import { initializeAutocomplete, createInputGroup, addLocation, getAdditionalLocations, calcRoute } from './calcRoute.js';
import { handleDirectionsResponse } from './findMat.js';

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
    const inputs = ['origin', 'destination', ...Array.from(document.querySelectorAll('.smallInput')).map(input => input.id)];
    
    for (const inputId of inputs) {
        const inputElement = document.getElementById(inputId);
        if (inputElement) {
            try {
                await initializeAutocomplete(inputElement);
            } catch (error) {
                console.error(`Failed to initialize autocomplete for ${inputId}:`, error);
            }
        } else {
            console.error(`${inputId} input not found!`);
        }
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

// Call this function to initialize inputs when the page is loaded
document.addEventListener('DOMContentLoaded', initializeInputs);

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
    await main(directionsService, directionsDisplay);
}

let directionsResponse; // Global variable to store directionsResponse

async function main(directionsService, directionsDisplay) {
    document.querySelector('.btn-success').addEventListener('click', async () => {
        try {
            directionsResponse = await calcRoute(directionsService, directionsDisplay); // Store the response globally
            
            // Pass the directionsResponse to findMat.js function
            handleDirectionsResponse(directionsResponse); 

        } catch (error) {
            console.error('An error occurred:', error);
        }
    });
}
