// js/auth.js
// Authentication module — uses Django session auth instead of Firebase.
import { apiRegister, apiLogin, apiLogout, apiGetMe } from "./api.js";
import { createStore } from "./store.js";

export const authStore = createStore({
  user: null,
  loading: true,
  error: null,
  isGuest: false,
});

const GUEST_KEY = "cosmoslab_guest_session";

function isGuestSessionActive() {
  return sessionStorage.getItem(GUEST_KEY) === "1";
}

/**
 * Check if the user is already logged in via session cookie.
 * Called once on page load.
 */
export async function initAuthListener() {
  try {
    const data = await apiGetMe();
    if (data.user) {
      sessionStorage.removeItem(GUEST_KEY);
      authStore.setState({ user: data.user, loading: false, error: null, isGuest: false });
    } else if (isGuestSessionActive()) {
      authStore.setState({ user: null, loading: false, error: null, isGuest: true });
    } else {
      authStore.setState({ user: null, loading: false, error: null, isGuest: false });
    }
  } catch (err) {
    // Server might be down or unreachable — check guest mode
    if (isGuestSessionActive()) {
      authStore.setState({ user: null, loading: false, error: null, isGuest: true });
    } else {
      authStore.setState({ user: null, loading: false, error: err.message, isGuest: false });
    }
  }
}

export async function signUpEmail(email, password) {
  try {
    authStore.setState({ error: null });
    const data = await apiRegister(email, password);
    authStore.setState({ user: data.user, loading: false, error: null, isGuest: false });
    return data.user;
  } catch (err) {
    authStore.setState({ error: err.message });
    throw err;
  }
}

export async function signInEmail(email, password) {
  try {
    authStore.setState({ error: null });
    const data = await apiLogin(email, password);
    authStore.setState({ user: data.user, loading: false, error: null, isGuest: false });
    return data.user;
  } catch (err) {
    authStore.setState({ error: err.message });
    throw err;
  }
}

export function enableGuestMode() {
  sessionStorage.setItem(GUEST_KEY, "1");
  authStore.setState({ user: null, loading: false, error: null, isGuest: true });
}

export async function signOutUser() {
  sessionStorage.removeItem(GUEST_KEY);
  try {
    await apiLogout();
  } catch (err) {
    // Ignore logout errors
  }
  authStore.setState({ user: null, loading: false, error: null, isGuest: false });
}
