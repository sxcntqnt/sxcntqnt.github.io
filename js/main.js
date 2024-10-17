import { calcRoute } from './calcRoute.js';
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


window.initMap = async function() {   
    const directionsService = new google.maps.DirectionsService();
    const mapOptions = {
        center: { lat: 1.2921, lng: 36.8219 },
        zoom: 12,
        mapTypeId: google.maps.MapTypeId.ROADMAP
    };

    const map = new google.maps.Map(document.getElementById('googlemap'), mapOptions);
    const directionsDisplay = new google.maps.DirectionsRenderer();
    directionsDisplay.setMap(map);

    await main(directionsService, map);
}

// Main function to handle the overall logic
async function main() {
    // Get the directions service and map from the global scope or your context
    const directionsService = new google.maps.DirectionsService();
    const mapOptions = {
        center: { lat: 1.2921, lng: 36.8219 },
        zoom: 12,
        mapTypeId: google.maps.MapTypeId.ROADMAP
    };
    const map = new google.maps.Map(document.getElementById('googlemap'), mapOptions);

    // Add event listener for the "Find Route" button
    document.querySelector('.btn-success').addEventListener('click', async () => {
        try {
            const origin = document.getElementById("origin").value.trim().toLowerCase();
            const destination = document.getElementById("destination").value.trim().toLowerCase();

            if (!origin || !destination) {
                console.log('Please provide both origin and destination locations.');
                return;
            }

            const additionalLocations = await getAdditionalLocations();
            await calcRoute(directionsService, map, origin, destination, additionalLocations);

        } catch (error) {
            console.error('An error occurred:', error);
        }
    });
}

