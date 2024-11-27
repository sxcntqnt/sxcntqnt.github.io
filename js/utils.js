let response; // Store response for ETA checks

const buttons = document.querySelectorAll('.dvd-button');

function randomPosition(element) {
    const container = document.querySelector('.header-container');
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    const randomX = Math.random() * (containerWidth - 200); // Adjust for button width
    const randomY = Math.random() * (containerHeight - 50); // Adjust for button height

    element.style.left = `${randomX}px`;
    element.style.top = `${randomY}px`;
}

buttons.forEach(button => {
    setInterval(() => {
        randomPosition(button);
    }, 2000); // Change position every 2 seconds
});
