import json
import h3
import re  # Regular expressions for splitting

# Load the JSON data from the original file
with open('YesBana.json', 'r') as file:
    data = json.load(file)

# Initialize the output list
standardized_objects = []

# Function to standardize the route_number (preserve format and characters)
def standardize_route_number(route_number):
    return route_number.strip()

# Check if 'non_null_objects' exists in the loaded data
if 'non_null_objects' in data:
    routes = data['non_null_objects']

    # Iterate through each route object in the non_null_objects
    for obj in routes:
        # Ensure obj is a dictionary
        if isinstance(obj, dict):
            # Extract necessary fields
            route_number = obj.get('route_number')
            pickup_point = obj.get('pickup_point')
            pickup_latlng = obj.get('pickup_latlng')
            destination_latlng = obj.get('destination_latlng')

            # Standardize the route_number (in case of leading/trailing spaces)
            if route_number:
                route_number = standardize_route_number(str(route_number))

            if isinstance(pickup_latlng, dict) and isinstance(destination_latlng, dict):
                pickup_latitude = pickup_latlng.get('latitude')
                pickup_longitude = pickup_latlng.get('longitude')
                destination_latitude = destination_latlng.get('latitude')
                destination_longitude = destination_latlng.get('longitude')
                
                if pickup_latitude is not None and pickup_longitude is not None:
                    # Calculate the H3 index for the pickup location at resolution 7
                    pickup_h3_index = h3.latlng_to_cell(pickup_latitude, pickup_longitude, 7)

                if destination_latitude is not None and destination_longitude is not None:
                    # Calculate the H3 index for the destination location at resolution 7
                    destination_h3_index = h3.latlng_to_cell(destination_latitude, destination_longitude, 7)

                    # Get the destinations and split by various separators including comma, slash, and period
                    destinations = obj.get('destinations', ["Unknown"])

                    # Add the first object with the full route details
                    first_obj = {
                        "route_number": route_number,  # Keep the route number in the first object
                        "pickup_point": pickup_point,
                        "pickup_latlng": pickup_latlng,
                        "pickup_hexid": pickup_h3_index,  # Add pickup hex ID
                        "destination": destinations[0].strip(),  # Add first destination to the first object
                        "destination_latlng": destination_latlng,
                        "destination_hexid": destination_h3_index,  # Add destination hex ID
                    }
                    standardized_objects.append(first_obj)

                    # Now, process the rest of the destinations separately (without route_number)
                    for destination in destinations[1:]:
                        # For subsequent destinations, we only include the destination data
                        standardized_objects.append({
                            "destination": destination.strip(),
                            "destination_latlng": destination_latlng,
                            "destination_hexid": destination_h3_index,  # Add destination hex ID
                        })

# Save the standardized output to a new JSON file
with open('standardized_output.json', 'w') as file:
    json.dump(standardized_objects, file, indent=4)

print("Processing complete. File saved as 'standardized_output.json'.")
