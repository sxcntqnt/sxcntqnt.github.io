export async function locateAndMarkUser(map) {
    // Check if the browser supports Geolocation
    if (!navigator.geolocation) {
        console.error("Geolocation is not supported by your browser.");
        return;
    }

    try {
        // Await the user's location using a Promise
        const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject);
        });

        // Extract latitude and longitude
        const myLat = position.coords.latitude;
        const myLong = position.coords.longitude;

        // Create a LatLng object for the user's coordinates
        const coords = new google.maps.LatLng(myLat, myLong);

        // Create a marker to display the user's location on the map
        const marker = new google.maps.Marker({
            map: map, // Use the passed map instance
            position: coords,
        });

        // Center the map at the user's location
        map.setCenter(coords);

        console.log("User's location has been marked on the map:", myLat, myLong);
    } catch (error) {
        // Handle errors
        console.error("Failed to retrieve the user's location:", error.message);
        alert("Unable to retrieve your location. Please check your permissions.");
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
