# Matatu Route Finder

Matatu Route Finder is a web-based tool designed to help users find the best routes for Matatu (public transport) and display those routes on an interactive Google Map. 
The application allows users to input their origin and destination, calculate the route, and find available Matatus (minivans) that serve the selected route. 


### What's new:
- **link to your GitHub repository**: 
  ```
  [Matatu Route Finder on  GitHub](https://sxcntqnt.github.io/concept.html)

  ```
## Features

- **Origin and Destination Input**: Users can enter their starting point and destination to calculate a route.
- **Add Additional Locations**: Users can add more locations to their route by clicking the "Add Location" button.
- **Route Calculation**: Once the origin and destination are selected, users can calculate the best route using the "Find Route" button.
- **Matatu Search**: After calculating the route, users can search for Matatus serving that route by clicking the "Find Matatu" button.
- **Interactive Google Map**: The map displays the route visually and shows bus/Matatu stops, with interactive features powered by Google Maps.
- **Route Summary & Bus Routes**: Displays detailed information about the route (such as distance and estimated time) and lists available bus/Matatu routes for the journey.
- **Responsive Layout**: The application is built using Bootstrap, ensuring that it looks great on both desktop and mobile devices.

## User Interface

The user interface consists of two main sections:
1. **Left Section**: 
   - Input fields for **Origin** and **Destination**.
   - A button to **Add Location** for additional stops.
   - Buttons to **Find Route**, **Find Matatu**, and **Refresh** the inputs.
2. **Right Section**:
   - **Google Map** showing the route and Matatu stops.
   - **Route Summary**: Displays a summary of the route.
   - **Bus Routes**: Lists the available Matatu routes based on the input locations.

## Technologies Used

- **HTML5**: For page structure.
- **CSS**: For styling (with Bootstrap for responsive layout).
- **JavaScript**: For interactivity and route calculation. 
    - Custom scripts: `calcRoute.js`, `findMat.js`, `main.js`
- **Google Maps API**: For interactive maps and displaying the route.
- **H3.js**: Likely used for geolocation or routing calculations.
- **Font Awesome**: For icons (e.g., in the input fields and buttons).
- **jQuery & Popper.js**: For handling interactivity (tooltips, dropdowns, etc.).

## External Libraries and Scripts

- **Bootstrap** (via CDN) - For responsive design.
- **Font Awesome** (via CDN) - For icons.
- **jQuery** (via CDN) - For DOM manipulation.
- **Popper.js** (via CDN) - For handling tooltips and popovers.
- **Google Maps API** - To integrate and display the interactive map.
- **H3.js** - For handling geolocation and routing calculations.
