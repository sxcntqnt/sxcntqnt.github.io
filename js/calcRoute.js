let additionalLocationsCount = 0;

function addLocation() {
  if (additionalLocationsCount < 10) {
    additionalLocationsCount++;

    const inputGroup = createInputGroup();
    const container = document.getElementById('additionalLocations');
    container.appendChild(inputGroup);
  } else {
    alert('You have reached the maximum limit of additional locations (10).');
  }
}

function createInputGroup() {
  const inputGroup = document.createElement('div');
  inputGroup.classList.add('input-group', 'mb-3');

  const input = createInput();
  const autocomplete = new google.maps.places.Autocomplete(input);
  autocomplete.setFields(['address_components', 'geometry', 'icon', 'name']);

  inputGroup.appendChild(input);
  return inputGroup;
}

function createInput() {
  const input = document.createElement('input');
  input.type = 'text';
  input.classList.add('form-control', 'smallInput');
  input.placeholder = `Location ${additionalLocationsCount}`;
  return input;
}

window.calcRoute = async function(map) {
  // Define request parameters
  const request = {
    origin: document.getElementById('origin').value,
    destination: document.getElementById('destination').value,
    travelMode: google.maps.TravelMode.DRIVING // Default to driving
  };

  // Collect additional locations as waypoints
  const additionalLocations = document.querySelectorAll('.smallInput');
  const waypoints = Array.from(additionalLocations)
    .map(location => ({
      location: location.value.trim(),
      stopover: true // Adjust if intermediate stops are required
    }))
    .filter(waypoint => waypoint.location !== ''); // Filter out empty waypoints

  // Check if there are more than one additional locations
  if (waypoints.length > 1) {
    // If there are more than one additional locations, use transit
    request.travelMode = google.maps.TravelMode.TRANSIT;
  } else if (waypoints.length === 1) {
    // If there is only one additional location, use driving
    request.waypoints = waypoints;
  }

  // Initialize DirectionsService object
  const directionsService = new google.maps.DirectionsService();

  async function fetchDirections(request) {
    try {
      const response = await new Promise((resolve, reject) => {
        const directionsService = new google.maps.DirectionsService();
        directionsService.route(request, (response, status) => {
          if (status === 'OK') {
            resolve(response);
          } else {
            reject(`Directions request failed: ${status}`);
          }
        });
      });
      return response;
    } catch (error) {
      console.error('Error fetching directions:', error);
      throw new Error('Failed to fetch directions');
    }
  }

  try {
    // Fetch directions asynchronously
    const directionsResponse = await fetchDirections(request);

    // Display route details
    displayResults(directionsResponse);

    // Initialize DirectionsRenderer object
    const directionsRenderer = new google.maps.DirectionsRenderer();

    // Set renderer to render directions on the map
    directionsRenderer.setMap(map);

    // Set additional options for the renderer (customize as needed)
    directionsRenderer.setOptions({
      suppressMarkers: false, // Display markers along the route
      preserveViewport: true // Optionally preserve viewport during rendering
    });

    // Set the directions for rendering
    directionsRenderer.setDirections(directionsResponse);


  } catch (error) {
    console.error('Error calculating route:', error.message);
    alert('Failed to calculate the route. Please try again.');
  }
}

// Function to display route details
function displayResults(response) {
  console.log(response)
  const resultDiv = document.getElementById('result');
  if (response) {
    resultDiv.innerHTML = "<h2>Route Details:</h2>";

    const routeSummary = response.routes[0].summary;
    const routeLegs = response.routes[0].legs;
    let startAddress = routeLegs[0].start_address;
    let endAddress;

    // If there are additional locations, set the last one as the end address
    if (routeLegs.length > 1) {
      endAddress = routeLegs[routeLegs.length - 1].end_address;
    } else {
      // Otherwise, use the destination address
      endAddress = routeLegs[0].end_address;
    }

    const totalDistance = response.routes[0].legs.reduce((acc, leg) => acc + leg.distance.value, 0) / 1000; // Convert to kilometers
    const totalDuration = response.routes[0].legs.reduce((acc, leg) => acc + leg.duration.value, 0);
    const formattedDistance = totalDistance.toFixed(2) + ' km';
    const formattedDuration = formatDuration(totalDuration);

    const htmlContent = `<p><strong>Summary:</strong> ${routeSummary}</p>
                         <p><strong>Start Address:</strong> ${startAddress}</p>
                         <p><strong>End Address:</strong> ${endAddress}</p>
                         <p><strong>Total Distance:</strong> ${formattedDistance}</p>
                         <p><strong>Estimated Time:</strong> <span id="estimatedTime">${formattedDuration}</span></p>`;

    resultDiv.innerHTML = htmlContent;
  } else {
    resultDiv.innerHTML = "<p>No route found for the given locations.</p>";
  }
}

// Helper function to format duration
function formatDuration(durationInSeconds) {
    const hours = Math.floor(durationInSeconds / 3600);
    const minutes = Math.floor((durationInSeconds % 3600) / 60);
    const seconds = durationInSeconds % 60;

    // Convert UTC time to local time
    const localTime = new Date(Date.UTC(1970, 0, 1, 0, 0, durationInSeconds * 1000));

    let formattedDuration = '';
    if (hours > 0) {
        formattedDuration += hours + ' hour' + (hours > 1 ? 's' : '') + ' ';
    }
    if (minutes > 0) {
        formattedDuration += minutes + ' min' + (minutes > 1 ? 's' : '') + ' ';
    }
    if (seconds > 0) {
        formattedDuration += seconds + ' sec' + (seconds > 1 ? 's' : '');
    }

    return formattedDuration.trim() + ' (' + localTime.toLocaleTimeString() + ')';
}

// Function to handle distance matrix API calls
function getDistanceMatrix(distanceMatrixService, leg) {
    return new Promise((resolve, reject) => {
        distanceMatrixService.getDistanceMatrix({
            origins: [leg.start_location],
            destinations: [leg.end_location],
            travelMode: 'DRIVING'
        }, (results, status) => {
            if (status === 'OK') {
                resolve(results.rows[0].elements[0]);
            } else {
                reject(`Error getting distance matrix: ${status}`);
            }
        });
    });
}

/*
async function fetchDirections(request) {
    try {
        const response = await new Promise((resolve, reject) => {
            const directionsService = new google.maps.DirectionsService();
            directionsService.route(request, (response, status) => {
                if (status === 'OK') {
                    resolve(response);
                } else {
                    reject(`Directions request failed: ${status}`);
                }
            });
        });
        return response;
    } catch (error) {
        console.error('Error fetching directions:', error);
        throw new Error('Failed to fetch directions');
    }
}
*/

// Function to refresh the page and clear search results
// Function to refresh the page and clear search results
window.refresh = async function() {
    document.getElementById("origin").value = "";
    document.getElementById("destination").value = "";
    document.getElementById("result").innerHTML = "";

    const additionalLocationsContainer = document.getElementById("additionalLocations");
    additionalLocationsContainer.innerHTML = "";
}
/*
  // Assuming you have a function to re-initialize the map
  if (map) {
    // Center the map in Nairobi
    map.setCenter({ lat: 1.2921, lng: 36.8219 }); // Nairobi's coordinates
    map.setZoom(12); // Set an appropriate zoom level
  } else {
    // Call initMap function to re-initialize the map (assuming it exists)
    initMap();
  }
}
*/

