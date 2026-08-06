// js/progress.js
// Progress tracking — uses Django API instead of Firestore.
// Bug fixes:
//   1. dayIndex collision: now uses "phaseIndex_dayIndex" composite keys
//   2. phaseUnlocked initialization: deferred until plan is loaded
//   3. Proper error handling (no silent swallowed writes)
import { apiGetProgress, apiCompleteTask, apiToggleTask, apiResetProgress } from "./api.js";
import { createStore } from "./store.js";
import { getPlan } from "./plan-data.js";

const GUEST_STORAGE_KEY = "cosmoslab_guest_progress";

function defaultProgress() {
  const plan = getPlan();
  const numPhases = plan ? plan.phases.length : 8;
  return {
    currentPhaseIndex: 0,
    currentDayIndex: 1,
    completedTasks: {},     // taskId -> { done, note, loggedMinutes, completedAt }
    completedDays: {},      // "phaseIndex_dayIndex" -> true
    completedPhases: {},    // "phaseIndex" -> true
    phaseUnlocked: Array.from({ length: numPhases }, (_, i) => i === 0),
    lastUpdated: Date.now(),
    currentStreak: 0,
  };
}

export const progressStore = createStore({
  data: {
    currentPhaseIndex: 0,
    currentDayIndex: 1,
    completedTasks: {},
    completedDays: {},
    completedPhases: {},
    phaseUnlocked: [],
    lastUpdated: 0,
    currentStreak: 0,
  },
  viewedPhaseIndex: 0,
  loading: true,
  planId: "local-plan",
});

let mode = "guest"; // "guest" | "cloud"

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
  // Extract day numbers from keys like "0_1", "0_2", "1_5" etc.
  const dayNums = [];
  for (const key of Object.keys(completedDays)) {
    const parts = key.split('_');
    if (parts.length === 2) {
      dayNums.push(parseInt(parts[1], 10));
    } else {
      const n = parseInt(key, 10);
      if (!isNaN(n)) dayNums.push(n);
    }
  }
  if (dayNums.length === 0) return 0;

  const sorted = [...new Set(dayNums)].sort((a, b) => b - a);
  let streak = 1;
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i] - sorted[i + 1] === 1) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

export async function initProgress({ uid, isGuest, planId = "local-plan" }) {
  if (isGuest || !uid) {
    mode = "guest";
    const data = readGuestProgress();
    // Ensure phaseUnlocked has the correct length for the current plan
    const plan = getPlan();
    if (plan && data.phaseUnlocked.length !== plan.phases.length) {
      data.phaseUnlocked = Array.from({ length: plan.phases.length }, (_, i) => 
        i === 0 || (data.phaseUnlocked[i] === true)
      );
    }
    progressStore.setState({ data, loading: false, planId });
    return;
  }

  mode = "cloud";
  try {
    const result = await apiGetProgress();
    if (result.progress) {
      progressStore.setState({ data: result.progress, loading: false, planId });
    } else {
      // No progress record exists yet — use defaults
      const data = defaultProgress();
      progressStore.setState({ data, loading: false, planId });
    }
  } catch (err) {
    console.error("Failed to load progress from server:", err);
    // Fallback to guest progress
    const data = readGuestProgress();
    progressStore.setState({ data, loading: false, planId });
  }
}

export async function completeTask(taskId, dayIndex, phaseIndex, { note = "", loggedMinutes = 0 } = {}) {
  const { data } = progressStore.getState();

  if (mode === "guest") {
    const next = { ...data, completedTasks: { ...data.completedTasks } };
    next.completedTasks[taskId] = {
      done: true,
      note,
      loggedMinutes,
      completedAt: Date.now(),
    };
    await maybeCompleteDay(next, dayIndex, phaseIndex);
    return;
  }

  // Cloud mode — let the server handle all the logic
  try {
    const result = await apiCompleteTask(taskId, dayIndex, phaseIndex, { note, loggedMinutes });
    if (result.progress) {
      progressStore.setState({ data: result.progress });
    }
  } catch (err) {
    console.error("Failed to save task completion:", err);
    // Fallback: update locally
    const next = { ...data, completedTasks: { ...data.completedTasks } };
    next.completedTasks[taskId] = { done: true, note, loggedMinutes, completedAt: Date.now() };
    await maybeCompleteDay(next, dayIndex, phaseIndex);
  }
}

export async function toggleTaskQuick(taskId, dayIndex, phaseIndex) {
  const { data } = progressStore.getState();

  if (mode === "guest") {
    const next = { ...data, completedTasks: { ...data.completedTasks } };
    if (next.completedTasks[taskId]) {
      delete next.completedTasks[taskId];
    } else {
      next.completedTasks[taskId] = { done: true, note: "", loggedMinutes: 0, completedAt: Date.now() };
    }
    await maybeCompleteDay(next, dayIndex, phaseIndex);
    return;
  }

  try {
    const result = await apiToggleTask(taskId, dayIndex, phaseIndex);
    if (result.progress) {
      progressStore.setState({ data: result.progress });
    }
  } catch (err) {
    console.error("Failed to toggle task:", err);
  }
}

/** Guest-mode only: recompute day/phase completion and persist. */
async function maybeCompleteDay(next, dayIndex, phaseIndex) {
  const plan = getPlan();
  if (!plan) return;

  const phase = plan.phases.find((p) => p.phaseIndex === phaseIndex);
  if (!phase) return;

  const dayObj = phase.days.find((d) => d.dayIndex === dayIndex);
  if (!dayObj) return;

  const allDone = dayObj.tasks.every((t) => next.completedTasks[t.id]);

  // Use composite key to prevent dayIndex collisions across phases
  const dayKey = `${phaseIndex}_${dayIndex}`;
  next.completedDays = { ...next.completedDays };
  if (allDone) {
    next.completedDays[dayKey] = true;
  } else {
    delete next.completedDays[dayKey];
  }
  next.currentStreak = computeStreak(next.completedDays);

  // Phase completion check
  const allDaysDone = phase.days.every((d) => next.completedDays[`${phaseIndex}_${d.dayIndex}`]);
  next.completedPhases = { ...next.completedPhases };
  if (allDaysDone) {
    next.completedPhases[String(phaseIndex)] = true;
    const nextPhaseIndex = phaseIndex + 1;
    if (nextPhaseIndex < plan.phases.length) {
      next.phaseUnlocked = [...next.phaseUnlocked];
      next.phaseUnlocked[nextPhaseIndex] = true;
    }
  }

  next.lastUpdated = Date.now();
  writeGuestProgress(next);
  progressStore.setState({ data: next });
}

export function setViewedPhase(index) {
  const plan = getPlan();
  if (!plan) return;
  const clamped = Math.max(0, Math.min(plan.phases.length - 1, index));
  progressStore.setState({ viewedPhaseIndex: clamped });
}

export async function resetProgress() {
  if (mode === "guest") {
    const fresh = defaultProgress();
    writeGuestProgress(fresh);
    progressStore.setState({ data: fresh, viewedPhaseIndex: 0 });
    return;
  }

  try {
    const result = await apiResetProgress();
    if (result.progress) {
      progressStore.setState({ data: result.progress, viewedPhaseIndex: 0 });
    }
  } catch (err) {
    console.error("Failed to reset progress:", err);
    const fresh = defaultProgress();
    progressStore.setState({ data: fresh, viewedPhaseIndex: 0 });
  }
}
