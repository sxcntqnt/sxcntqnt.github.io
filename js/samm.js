const seatLayout = document.getElementById('seatLayout');
const reservationForm = document.getElementById('reservationForm');
const confirmationDiv = document.getElementById('confirmation');

let bookedSeats = [];

// Function to create seat layout based on selected matatu type
function createSeatLayout(matatuType) {
    seatLayout.innerHTML = ''; // Clear existing seats
    let totalSeats = parseInt(matatuType);

    for (let i = 1; i <= totalSeats; i++) {
        const seat = document.createElement('div');
        seat.classList.add('seat');
        seat.innerText = i;
        seat.dataset.seatNumber = i;

        // Add click event to select/deselect the seat
        seat.addEventListener('click', () => {
            if (!bookedSeats.includes(i)) {
                if (seat.classList.contains('selected')) {
                    seat.classList.remove('selected'); // Deselect if already selected
                } else {
                    seat.classList.add('selected'); // Select the seat
                }
            }
        });

        seatLayout.appendChild(seat);
    }
}

function updateIcon() {
    const matatuTypeSelect = document.getElementById('matatuType');
    const selectedOption = matatuTypeSelect.options[matatuTypeSelect.selectedIndex];
    const iconSrc = selectedOption.getAttribute('data-icon');
    const matatuIcon = document.getElementById('matatuIcon');

    matatuIcon.src = iconSrc; // Change the icon based on selection
    createSeatLayout(selectedOption.value); // Update seat layout based on selected type
}


// Function to book selected seats
function bookSelectedSeats() {
    const selectedSeats = seatLayout.querySelectorAll('.seat.selected');
    if (selectedSeats.length === 0) {
        alert('Please select at least one seat to reserve.');
        return;
    }

    // Check if there are enough available seats
    if (bookedSeats.length + selectedSeats.length > parseInt(document.getElementById('matatuType').value)) {
        alert(`Not enough available seats. You can only reserve up to ${document.getElementById('matatuType').value - bookedSeats.length} more seats.`);
        return;
    }

    selectedSeats.forEach(seat => {
        const seatNumber = parseInt(seat.dataset.seatNumber);
        bookedSeats.push(seatNumber);
        seat.classList.add('booked');
        seat.classList.remove('selected');
        seat.innerText = 'X'; // Indicate the seat is booked
    });

    confirmationDiv.innerText = `Successfully reserved ${selectedSeats.length} seats!`;
    confirmationDiv.style.display = 'block'; // Make confirmation visible
}

// Handle form submission
reservationForm.addEventListener('submit', function(event) {
    event.preventDefault();
    bookSelectedSeats();
});

// Initialize seat layout on matatu type change
document.getElementById('matatuType').addEventListener('change', function() {
    createSeatLayout(this.value);
});

// Create initial seat layout for the default matatu type when the page loads
window.onload = function() {
    createSeatLayout(document.getElementById('matatuType').value);
};
