
// Fetch route details using Dgraph
async function fetchRouteDetails(origin, destination, additionalLocations) {
    const query = `
        query($origin: String!, $destination: String!, $additionalLocations: [String!]) {
            findRoute(origin: $origin, destination: $destination, additionalLocations: $additionalLocations) {
                edges {
                    source
                    destination
                    routeNumber
                }
            }
        }
    `;

    const variables = {
        origin,
        destination,
        additionalLocations
    };

    const response = await fetch('https://blue-surf-1310330.us-east-1.aws.cloud.dgraph.io/graphql', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, variables }),
    });

    const data = await response.json();
    return data.data.findRoute.edges;
}

async function calculateRouteWithGeocoding(originInput, destinationInput) {
    try {
        const origin = await geocodeAddress(originInput);
        const destination = await geocodeAddress(destinationInput);

        // Fetch route details from Dgraph
        const additionalLocations = await getAdditionalLocations();
        const routeDetails = await fetchRouteDetails(originInput, destinationInput, additionalLocations);

        if (routeDetails) {
            return { origin, destination, routeDetails }; // Return the necessary details
        } else {
            console.error("Failed to fetch route details from Dgraph.");
            return null;
        }
    } catch (error) {
        console.error('Error geocoding addresses or fetching route:', error);
        return null;
    }
}

async function processRouteDetails(origin, destination, additionalLocations, graph) {
    try {
        const routeDetails = await fetchRouteDetails(origin, destination, additionalLocations);

        if (routeDetails) {
            window.findMat(origin, destination, additionalLocations, graph);
        } else {
            console.error("No route details returned.");
        }
    } catch (error) {
        console.error('Error fetching route details:', error);
    }
}
