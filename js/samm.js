document.getElementById('reservationForm').addEventListener('submit', function(event) {
    event.preventDefault();

    const matatuType = document.getElementById('matatuType').value;
    const seats = document.getElementById('seats').value;

    // Simple validation for maximum seats based on matatu type
    let maxSeats;
    switch (matatuType) {
        case '14':
            maxSeats = 14;
            break;
        case '33':
            maxSeats = 33;
            break;
        case '60':
            maxSeats = 60;
            break;
        default:
            maxSeats = 0;
    }

    if (seats > maxSeats) {
        alert(`You can only reserve up to ${maxSeats} seats for a ${matatuType}-seater matatu.`);
        return;
    }

    // Display confirmation message
    const confirmationMessage = `You have successfully reserved ${seats} seat(s) in a ${matatuType}-seater matatu.`;
    const confirmationDiv = document.getElementById('confirmation');
    confirmationDiv.innerText = confirmationMessage;
    confirmationDiv.style.display = 'block'; // Show confirmation
});
