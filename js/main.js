import { calcRoute, addLocation, getAdditionalLocations } from './calcRoute.js';
import { findMat } from './findMat.js';

let response; // Store response for ETA checks
window.calcRoute = calcRoute; // Make it globally accessible

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
/*
window.initMap = async function() {   
    const directionsService = new google.maps.DirectionsService();
    const directionsDisplay = new google.maps.DirectionsRenderer()
    const mapOptions = {
        center: { lat: 1.2921, lng: 36.8219 },
        zoom: 12,
        mapTypeId: google.maps.MapTypeId.ROADMAP
    };

    const map = new google.maps.Map(document.getElementById('googlemap'), mapOptions);
    const directionsDisplay = new google.maps.DirectionsRenderer();
    directionsDisplay.setMap(map);

    await main(directionsService, directionsDisplay);
}

// Main function to handle the overall logic
async function main(directionsService, directionsDisplay) {
    // Add event listener for the "Find Route" button
    document.querySelector('.btn-success').addEventListener('click', async () => {
        try {
            const origin = document.getElementById("origin").value.trim();
            const destination = document.getElementById("destination").value.trim();

            if (!origin || !destination) {
                console.log('Please provide both origin and destination locations.');
                return;
            }

            const additionalLocations = await getAdditionalLocations(); // Fetch additional locations
            response = await calcRoute(directionsService,directionsDisplay, map, origin, destination, additionalLocations);
            directionsDisplay.setDirections(response); // Ensure directions are displayed

        } catch (error) {
            console.error('An error occurred:', error);
        }
    });
}
*/
window.initMap = async function() {   
    const directionsService = new google.maps.DirectionsService();
    const mapOptions = {
        center: { lat: 1.2921, lng: 36.8219 },
        zoom: 12,
        mapTypeId: google.maps.MapTypeId.ROADMAP
    };

    const map = new google.maps.Map(document.getElementById('googlemap'), mapOptions);
    const directionsDisplay = new google.maps.DirectionsRenderer();
    directionsDisplay.setMap(map); // Set the map for the directions display

    await main(directionsService, directionsDisplay); // Pass directionsDisplay to main
}

// Main function to handle the overall logic
async function main(directionsService, directionsDisplay) {
    // Add event listener for the "Find Route" button
    document.querySelector('.btn-success').addEventListener('click', async () => {
        try {
            await calcRoute(directionsService, directionsDisplay); // Call calcRoute with the correct parameters
        } catch (error) {
            console.error('An error occurred:', error);
        }
    });
}
