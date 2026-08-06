// js/login.js
// Login page controller — uses Django session auth via api.js
import { signUpEmail, signInEmail, enableGuestMode } from "./auth.js";
import { initPlanetScene } from "./scene.js";

let mode = "login"; // or "signup"

const form = document.getElementById("login-form");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const errorEl = document.getElementById("form-error");
const authenticateBtn = document.getElementById("authenticate-btn");
const registerToggleBtn = document.getElementById("register-toggle-btn");
const googleBtn = document.getElementById("google-btn");
const guestLink = document.getElementById("guest-link");

function setError(message) {
  errorEl.textContent = message || "";
}

function setBusy(isBusy) {
  authenticateBtn.disabled = isBusy;
  if (googleBtn) googleBtn.disabled = isBusy;
}

function applyMode() {
  authenticateBtn.textContent = mode === "login" ? "Authenticate" : "Register";
  registerToggleBtn.textContent = mode === "login" ? "Register Link" : "Back To Login";
  passwordInput.setAttribute("autocomplete", mode === "login" ? "current-password" : "new-password");
}

registerToggleBtn.addEventListener("click", () => {
  mode = mode === "login" ? "signup" : "login";
  setError("");
  applyMode();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setError("");

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    setError("Enter a valid identification email.");
    return;
  }
  if (!password || password.length < 8) {
    setError("Passcode must be at least 8 characters.");
    return;
  }

  setBusy(true);
  try {
    if (mode === "login") {
      await signInEmail(email, password);
    } else {
      await signUpEmail(email, password);
    }
    window.location.href = "/dashboard.html";
  } catch (err) {
    setError(err.message);
  } finally {
    setBusy(false);
  }
});

// Google login — hide the button since we don't have OAuth set up in Django yet
if (googleBtn) {
  googleBtn.style.display = "none";
}

guestLink.addEventListener("click", (event) => {
  event.preventDefault();
  enableGuestMode();
  window.location.href = "/dashboard.html";
});

applyMode();

// Ambient decorative solar system overview, purely cosmetic -- failures here should
// never block the login form itself.
try {
  const canvas = document.getElementById("login-planet");
  // Do not call setPlanet() so it defaults to the moving overview mode
  const scene = initPlanetScene(canvas, { interactive: false });
} catch (err) {
  console.warn("Ambient planet scene failed to init", err);
}

// 3D Panel Tilt Physics and Spotlight Tracker
document.addEventListener("mousemove", (e) => {
  const panel = document.querySelector(".login-panel");
  if (!panel) return;
  
  // Calculate cursor distance from center of screen (normalized -1 to 1) for 3D tilt
  const xAxis = (window.innerWidth / 2 - e.pageX) / (window.innerWidth / 2);
  const yAxis = (window.innerHeight / 2 - e.pageY) / (window.innerHeight / 2);
  
  // Apply rotation (max 12 degrees)
  const tiltX = yAxis * 12;
  const tiltY = xAxis * -12;
  
  panel.style.transform = `rotateX(${tiltX}deg) rotateY(${tiltY}deg)`;

// Spotlight logic (mouse position relative to the panel itself)
  // We only want the spotlight when the cursor is actually hovering over the panel
});

const panel = document.querySelector(".login-panel");
if (panel) {
  panel.addEventListener("mousemove", (e) => {
    const rect = panel.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    panel.style.setProperty('--mouse-x', `${x}px`);
    panel.style.setProperty('--mouse-y', `${y}px`);
  });

  panel.addEventListener("mouseleave", () => {
    panel.style.setProperty('--mouse-x', `-1000px`);
    panel.style.setProperty('--mouse-y', `-1000px`);
  });
}
