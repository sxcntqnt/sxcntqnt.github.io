function addPolygons() {
  const polygonCoords = [
    { lat: -1.2900, lng: 36.8100 }, // Example polygon coordinates
    { lat: -1.2800, lng: 36.8200 },
    { lat: -1.2700, lng: 36.8100 },
  ];

  const polygon = new google.maps.Polygon({
    paths: polygonCoords,
    strokeColor: "#FF0000",
    strokeOpacity: 0.8,
    strokeWeight: 2,
    fillColor: "#FF0000",
    fillOpacity: 0.35,
    editable: true, // Optional: Make polygon editable
    draggable: true, // Optional: Make polygon draggable
    geodesic: true,
    map: map,
  });
}

