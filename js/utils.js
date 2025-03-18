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

// utils.js
export function decodePolyline(polylineStr) {
    if (!polylineStr) {
        console.warn('Invalid polyline string provided.');
        return [];
    }
    try {
        let index = 0, lat = 0, lng = 0, coordinates = [];
        while (index < polylineStr.length) {
            let result = 0, shift = 0, byte;
            do {
                byte = polylineStr.charCodeAt(index++) - 63;
                result |= (byte & 0x1f) << shift;
                shift += 5;
            } while (byte >= 0x20);
            lat += (result >> 1) ^ (-(result & 1));

            result = shift = 0;
            do {
                byte = polylineStr.charCodeAt(index++) - 63;
                result |= (byte & 0x1f) << shift;
                shift += 5;
            } while (byte >= 0x20);
            lng += (result >> 1) ^ (-(result & 1));

            coordinates.push([lat / 1E5, lng / 1E5]);
        }
        return coordinates;
    } catch (error) {
        console.error('Error decoding polyline:', error);
        return [];
    }
}

export function buildDAG(coordinates, resolution) {
    const dag = {};
    coordinates.forEach(([lat, lng], i) => {
        const h3Index = h3.latLngToCell(lat, lng, resolution);
        dag[h3Index] = dag[h3Index] || { neighbors: [], coordinate: [lat, lng] };
        if (i > 0) {
            const [prevLat, prevLng] = coordinates[i - 1];
            const prevH3Index = h3.latLngToCell(prevLat, prevLng, resolution);
            connectHexagons(dag, prevH3Index, h3Index);
        }
    });
    return dag;
}

export function removeEmptyDicts(obj) {
    if (Array.isArray(obj)) {
        return obj.map(removeEmptyDicts).filter(item => item && Object.keys(item).length > 0);
    }
    if (typeof obj === 'object' && obj !== null) {
        return Object.fromEntries(
            Object.entries(obj)
                .map(([key, value]) => [key, removeEmptyDicts(value)])
                .filter(([_, value]) => value && Object.keys(value).length > 0)
        );
    }
    return obj;
}

export async function fetchAndIndexBusRoutes(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch routes: ${response.statusText}`);
        const data = await response.json();
        const cleanedData = removeEmptyDicts(data);
        if (!cleanedData.non_null_objects?.length) return new RBush();

        const tree = new RBush();
        const items = [];

        cleanedData.non_null_objects.forEach(route => {
            // Index pickup point
            items.push({
                minX: route.pickup_point.pickup_latlng.longitude,
                minY: route.pickup_point.pickup_latlng.latitude,
                maxX: route.pickup_point.pickup_latlng.longitude,
                maxY: route.pickup_point.pickup_latlng.latitude,
                route
            });

            // Index each destination
            route.destinations.forEach(dest => {
                items.push({
                    minX: dest.destination_latlng.longitude,
                    minY: dest.destination_latlng.latitude,
                    maxX: dest.destination_latlng.longitude,
                    maxY: dest.destination_latlng.latitude,
                    route
                });
            });
        });

        tree.load(items);
        return tree;
    } catch (error) {
        console.error('Error fetching bus routes:', error);
        return new RBush();
    }
}

export function getNearbyRoutes(lat, lng, globalRoutesDAG, buffer = 0.01) {
    if (!globalRoutesDAG || globalRoutesDAG.all().length === 0) return [];

    const nearbyNodes = globalRoutesDAG.search({
        minX: lng - buffer,
        minY: lat - buffer,
        maxX: lng + buffer,
        maxY: lat + buffer,
    });

    const uniqueRoutes = new Map();
    nearbyNodes.forEach(node => {
        uniqueRoutes.set(node.route.route_number, node.route);
    });

    return Array.from(uniqueRoutes.values());
}
