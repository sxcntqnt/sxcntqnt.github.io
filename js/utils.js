export async function locateAndMarkUser(map) {
    try {
        // Await the user's location using a Promise
        const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject);
        });

        // Use the position to create the user location object
        const userLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
        };

        // Reverse geocode to get the street address
        const geocoder = new google.maps.Geocoder();
        const latLng = new google.maps.LatLng(userLocation.lat, userLocation.lng);
        const results = await new Promise((resolve, reject) => {
            geocoder.geocode({ location: latLng }, (results, status) => {
                if (status === google.maps.GeocoderStatus.OK && results[0]) {
                    resolve(results[0].formatted_address);
                } else {
                    reject(new Error('Geocoder failed or no results found.'));
                }
            });
        });

        // Mark the user's location on the map
        new google.maps.Marker({
            position: userLocation,
            map: map,
            title: "You are here"
        });

        // Return both the address and coordinates
        return { address: results, coordinates: userLocation };

    } catch (error) {
        console.error("Failed to retrieve the user's location:", error.message);
        alert("Unable to retrieve your location. Please check your permissions.");
        throw error; // Re-throw to let the calling function handle it
    }
}

// Select all buttons with the class 'dvd-button'
const buttons = document.querySelectorAll('.dvd-button');

// Function to set a random position for an element
function randomPosition(element) {
    const container = document.querySelector('.header-container');
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    // Calculate random X and Y positions
    const randomX = Math.random() * (containerWidth - 200); // Adjust for button width (200px)
    const randomY = Math.random() * (containerHeight - 50); // Adjust for button height (50px)

    // Set the new position of the element
    element.style.left = `${randomX}px`;
    element.style.top = `${randomY}px`;
}

// Loop through each button and set an interval to change its position
buttons.forEach(button => {
    setInterval(() => {
        randomPosition(button);
    }, 2000); // Change position every 2 seconds
});


window.locateAndMarkUser = locateAndMarkUser
