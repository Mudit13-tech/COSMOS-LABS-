// js/progress.js
import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase-config.js";
import { createStore } from "./store.js";
import { getPlan } from "./plan-data.js";

const GUEST_STORAGE_KEY = "cosmoslab_guest_progress";

function defaultProgress() {
  return {
    currentPhaseIndex: 0,
    currentDayIndex: 1,
    completedTasks: {}, // taskId -> { done, note, loggedMinutes, completedAt }
    completedDays: {}, // dayIndex -> true
    completedPhases: {}, // phaseIndex -> true
    phaseUnlocked: getPlan() ? getPlan().phases.map((_, i) => i === 0) : [],
    lastUpdated: Date.now(),
    currentStreak: 0,
  };
}

export const progressStore = createStore({
  data: defaultProgress(),
  viewedPhaseIndex: 0, // browsing state, separate from currentPhaseIndex
  loading: true,
  planId: "local-plan",
});

let unsubscribeSnapshot = null;
let mode = "guest"; // "guest" | "cloud"
let currentUid = null;

function progressDocRef(uid, planId) {
  return doc(db, "progress", `${uid}_${planId}`);
}

function readGuestProgress() {
  try {
    const raw = localStorage.getItem(GUEST_STORAGE_KEY);
    return raw ? JSON.parse(raw) : defaultProgress();
  } catch {
    return defaultProgress();
  }
}

function writeGuestProgress(data) {
  localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(data));
}

/** Recomputes the consecutive-day streak from completedDays. */
function computeStreak(completedDays) {
  const days = Object.keys(completedDays)
    .map(Number)
    .sort((a, b) => b - a);
  if (days.length === 0) return 0;
  let streak = 1;
  for (let i = 0; i < days.length - 1; i++) {
    if (days[i] - days[i + 1] === 1) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

export async function initProgress({ uid, isGuest, planId = "local-plan" }) {
  if (unsubscribeSnapshot) {
    unsubscribeSnapshot();
    unsubscribeSnapshot = null;
  }
  currentUid = uid || null;

  if (isGuest || !uid) {
    mode = "guest";
    const data = readGuestProgress();
    progressStore.setState({ data, loading: false, planId });
    return;
  }

  mode = "cloud";
  const ref = progressDocRef(uid, planId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    const initial = defaultProgress();
    await setDoc(ref, initial);
  }

  unsubscribeSnapshot = onSnapshot(ref, (docSnap) => {
    if (docSnap.exists()) {
      progressStore.setState({ data: docSnap.data(), loading: false, planId });
    }
  });
}

async function persist(nextData) {
  nextData.lastUpdated = Date.now();
  if (mode === "guest") {
    writeGuestProgress(nextData);
    progressStore.setState({ data: nextData });
  } else {
    const { planId } = progressStore.getState();
    await setDoc(progressDocRef(currentUid, planId), nextData);
    // onSnapshot listener above will also update state; setting it here
    // too keeps the UI snappy while the round-trip completes.
    progressStore.setState({ data: nextData });
  }
}

export async function completeTask(taskId, dayIndex, { note = "", loggedMinutes = 0 } = {}) {
  const { data } = progressStore.getState();
  const next = { ...data, completedTasks: { ...data.completedTasks } };
  next.completedTasks[taskId] = {
    done: true,
    note,
    loggedMinutes,
    completedAt: Date.now(),
  };
  await maybeCompleteDay(next, dayIndex);
}

export async function toggleTaskQuick(taskId, dayIndex) {
  const { data } = progressStore.getState();
  const next = { ...data, completedTasks: { ...data.completedTasks } };
  if (next.completedTasks[taskId]) {
    delete next.completedTasks[taskId];
  } else {
    next.completedTasks[taskId] = { done: true, note: "", loggedMinutes: 0, completedAt: Date.now() };
  }
  await maybeCompleteDay(next, dayIndex);
}

async function maybeCompleteDay(next, dayIndex) {
  const phase = getPlan().phases.find((p) => p.days.some((d) => d.dayIndex === dayIndex));
  if (!phase) return; 
  const dayObj = phase.days.find((d) => d.dayIndex === dayIndex);
  const allDone = dayObj.tasks.every((t) => next.completedTasks[t.id]);

  next.completedDays = { ...next.completedDays };
  if (allDone) {
    next.completedDays[dayIndex] = true;
  } else {
    delete next.completedDays[dayIndex];
  }
  next.currentStreak = computeStreak(next.completedDays);

  // Phase completion check.
  const allDaysDone = phase.days.every((d) => next.completedDays[d.dayIndex]);
  next.completedPhases = { ...next.completedPhases };
  if (allDaysDone) {
    next.completedPhases[phase.phaseIndex] = true;
    const nextPhaseIndex = phase.phaseIndex + 1;
    if (nextPhaseIndex < getPlan().phases.length) {
      next.phaseUnlocked = [...next.phaseUnlocked];
      next.phaseUnlocked[nextPhaseIndex] = true;
    }
  }

  await persist(next);
}

export function setViewedPhase(index) {
  const clamped = Math.max(0, Math.min(getPlan().phases.length - 1, index));
  progressStore.setState({ viewedPhaseIndex: clamped });
}

export async function resetProgress() {
  if (mode === "guest") {
    const fresh = defaultProgress();
    writeGuestProgress(fresh);
    progressStore.setState({ data: fresh, viewedPhaseIndex: 0 });
    return;
  }
  const { planId } = progressStore.getState();
  const fresh = defaultProgress();
  await setDoc(progressDocRef(currentUid, planId), fresh);
  // onSnapshot listener will pick up the reset doc and update state;
  // reset the viewed phase locally right away for a snappy UI.
  progressStore.setState({ viewedPhaseIndex: 0 });
}
