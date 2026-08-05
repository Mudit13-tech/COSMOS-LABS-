// js/auth.js
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";
import { createStore } from "./store.js";

export const authStore = createStore({
  user: null,
  loading: true,
  error: null,
  isGuest: false,
});

const GUEST_KEY = "cosmoslab_guest_session";

// Maps raw Firebase Auth error codes to plain, user-facing copy.
// Never show a raw "Firebase: Error (auth/...)" string to the user.
function mapAuthError(err) {
  const code = err && err.code;
  switch (code) {
    case "auth/invalid-email":
      return "That email address doesn't look right.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Identification or passcode not recognized.";
    case "auth/email-already-in-use":
      return "An account already exists for that email. Try authenticating instead.";
    case "auth/weak-password":
      return "Passcode must be at least 8 characters.";
    case "auth/popup-closed-by-user":
      return "Google uplink cancelled.";
    case "auth/network-request-failed":
      return "Network error -- check your connection and try again.";
    default:
      return "Authentication failed. Please try again.";
  }
}

function isGuestSessionActive() {
  return sessionStorage.getItem(GUEST_KEY) === "1";
}

// Calls the createUserProfile callable Cloud Function. Idempotent server
// side -- safe to call on every sign-in, not just the first one.
async function ensureUserProfile(user) {
  try {
    const ref = doc(db, "users", user.uid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      return;
    }
    await setDoc(ref, {
      name: user.displayName || user.email.split("@")[0],
      email: user.email,
      createdAt: Date.now(),
      activePlanId: null,
    });
  } catch (err) {
    // Non-fatal for the UI -- log it, the dashboard guard will still work
    // off the Firebase Auth user, and profile creation can be retried.
    console.error("createUserProfile failed", err);
  }
}

export function initAuthListener() {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      sessionStorage.removeItem(GUEST_KEY);
      authStore.setState({ user, loading: false, error: null, isGuest: false });
    } else if (isGuestSessionActive()) {
      authStore.setState({ user: null, loading: false, error: null, isGuest: true });
    } else {
      authStore.setState({ user: null, loading: false, error: null, isGuest: false });
    }
  });
}

export async function signUpEmail(email, password) {
  try {
    authStore.setState({ error: null });
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await ensureUserProfile(cred.user);
    return cred.user;
  } catch (err) {
    const message = mapAuthError(err);
    authStore.setState({ error: message });
    throw new Error(message);
  }
}

export async function signInEmail(email, password) {
  try {
    authStore.setState({ error: null });
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return cred.user;
  } catch (err) {
    const message = mapAuthError(err);
    authStore.setState({ error: message });
    throw new Error(message);
  }
}

export async function signInGoogle() {
  try {
    authStore.setState({ error: null });
    const provider = new GoogleAuthProvider();
    const cred = await signInWithPopup(auth, provider);
    await ensureUserProfile(cred.user);
    return cred.user;
  } catch (err) {
    const message = mapAuthError(err);
    authStore.setState({ error: message });
    throw new Error(message);
  }
}

export function enableGuestMode() {
  sessionStorage.setItem(GUEST_KEY, "1");
  authStore.setState({ user: null, loading: false, error: null, isGuest: true });
}

export async function signOutUser() {
  sessionStorage.removeItem(GUEST_KEY);
  await signOut(auth);
  authStore.setState({ user: null, loading: false, error: null, isGuest: false });
}
