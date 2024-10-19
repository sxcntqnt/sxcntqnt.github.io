import json

# Load the JSON data from the original file
with open('YesBana.json', 'r') as file:
    data = json.load(file)
    print(f"Loaded data type: {type(data)}")
    print(f"Loaded data: {data}")

# Initialize the output dictionary
non_null_objects = []
null_objects = []

# Iterate through each object in the data
for obj in data:
    # Ensure obj is a dictionary
    if isinstance(obj, dict):
        # Check if the expected keys exist and are in the correct format
        pickup_latlng = obj.get('pickup_latlng')
        destination_latlng = obj.get('destination_latlng')
        
        if isinstance(pickup_latlng, dict) and isinstance(destination_latlng, dict):
            # Check if any of the lat/lng values are null
            if (pickup_latlng.get('latitude') is None or
                pickup_latlng.get('longitude') is None or
                destination_latlng.get('latitude') is None or
                destination_latlng.get('longitude') is None):
                null_objects.append(obj)
            else:
                non_null_objects.append(obj)
        else:
            # Ignore objects with unexpected structures
            continue
    else:
        # Ignore any non-dictionary objects
        continue


# Save non-null objects to Yesbana.json as a dictionary
with open('Yesbana.json', 'w') as file:
    json.dump({"non_null_objects": non_null_objects}, file, indent=4)

# Save null objects to null-objects.json as a dictionary
with open('null-objects.json', 'w') as file:
    json.dump({"null_objects": null_objects}, file, indent=4)



print("Processing complete. File saved as 'Yesbana.json'.")
