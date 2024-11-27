document.addEventListener("DOMContentLoaded", function() {
    var overlay = document.getElementById("overlay");
    var openSignUpButton = document.getElementById("slide-left-button");
    var openSignInButton = document.getElementById("slide-right-button");
    var leftText = document.getElementById("sign-in");
    var rightText = document.getElementById("sign-up");
    var accountForm = document.getElementById("sign-in-info");
    var signinForm = document.getElementById("sign-up-info");

    const openSignUp = () => {
        leftText.classList.remove("overlay-text-left-animation-out");
        overlay.classList.remove("open-sign-in");
        rightText.classList.remove("overlay-text-right-animation");
        accountForm.classList.add("form-left-slide-out");
        rightText.classList.add("overlay-text-right-animation-out");
        overlay.classList.add("open-sign-up");
        leftText.classList.add("overlay-text-left-animation");

        setTimeout(function() {
            accountForm.classList.remove("form-left-slide-in");
            accountForm.style.display = "none";
            accountForm.classList.remove("form-left-slide-out");
        }, 700);

        setTimeout(function() {
            signinForm.style.display = "flex";
            signinForm.classList.add("form-right-slide-in");
        }, 200);
    };

    const openSignIn = () => {
        leftText.classList.remove("overlay-text-left-animation");
        overlay.classList.remove("open-sign-up");
        rightText.classList.remove("overlay-text-right-animation-out");
        signinForm.classList.add("form-right-slide-out");
        leftText.classList.add("overlay-text-left-animation-out");
        overlay.classList.add("open-sign-in");
        rightText.classList.add("overlay-text-right-animation");

        setTimeout(function() {
            signinForm.classList.remove("form-right-slide-in");
            signinForm.style.display = "none";
            signinForm.classList.remove("form-right-slide-out");
        }, 700);

        setTimeout(function() {
            accountForm.style.display = "flex";
            accountForm.classList.add("form-left-slide-in");
        }, 200);
    };

    // When a 'switch' button is pressed, switch page
    openSignUpButton.addEventListener("click", openSignUp, false);
    openSignInButton.addEventListener("click", openSignIn, false);
});
