// js/dashboard.js
// Main dashboard controller — uses Django API instead of Firebase.
// Bug fixes:
//   1. AI flow: properly asks "what do you want to learn" before showing phases
//   2. finalizeBoot race condition fixed — proper async/await
//   3. All Firestore calls removed, uses API client
//   4. Gemini API call moved server-side (no API key in browser)
import { authStore, initAuthListener, signOutUser } from "./auth.js";
import {
  progressStore,
  initProgress,
  completeTask,
  toggleTaskQuick,
  setViewedPhase,
  resetProgress,
} from "./progress.js";
import { getPlan, setPlan, DEFAULT_PLAN, totalTasksInPhase } from "./plan-data.js";
import { initPlanetScene } from "./scene.js";
import { openMissionModal } from "./ui-modal.js";
import { showToast } from "./ui-toast.js";
import { apiGetPlan, apiGeneratePlan, apiResetPlan } from "./api.js";

const els = {
  email: document.getElementById("hud-email"),
  guestBanner: document.getElementById("guest-banner"),
  newMissionBtn: document.getElementById("new-mission-btn"),
  resetBtn: document.getElementById("reset-data-btn"),
  terminateBtn: document.getElementById("terminate-link-btn"),
  breadcrumb: document.getElementById("phase-breadcrumb"),
  heading: document.getElementById("phase-heading"),
  prevBtn: document.getElementById("phase-prev"),
  nextBtn: document.getElementById("phase-next"),
  statCompletion: document.getElementById("stat-completion"),
  statBurns: document.getElementById("stat-burns"),
  statHours: document.getElementById("stat-hours"),
  statStreak: document.getElementById("stat-streak"),
  timeline: document.getElementById("day-timeline"),
  dayStatusLive: document.getElementById("day-status-live"),
  zoomValue: document.getElementById("zoom-value"),
  zoomIn: document.getElementById("zoom-in"),
  zoomOut: document.getElementById("zoom-out"),
  zoomReset: document.getElementById("zoom-reset"),
  canvas: document.getElementById("planet-canvas"),
};

let scene = null;

// ---- Auth guard --------------------------------------------------------
// initAuthListener is now async — it fetches /api/auth/me/ to check session
await initAuthListener();

function waitForAuthResolved() {
  return new Promise((resolve) => {
    const unsub = authStore.subscribe((state) => {
      if (!state.loading) {
        unsub();
        resolve(state);
      }
    });
    const state = authStore.getState();
    if (!state.loading) resolve(state);
  });
}

async function boot() {
  const { user, isGuest } = await waitForAuthResolved();

  if (!user && !isGuest) {
    window.location.href = "/";
    return;
  }

  els.email.textContent = user ? user.email : "";
  els.guestBanner.classList.toggle("visible", Boolean(isGuest));

  scene = initPlanetScene(els.canvas);

  if (isGuest) {
    // Guest mode: check localStorage for saved plan
    const savedPlan = localStorage.getItem("cosmoslab_guest_plan_data");
    if (savedPlan) {
      try {
        const parsed = JSON.parse(savedPlan);
        if (parsed && Array.isArray(parsed.phases) && parsed.phases.length > 0) {
          setPlan(parsed);
          await finalizeBoot(user, isGuest, "local-plan");
          return;
        }
      } catch (err) {
        console.warn("Failed to parse saved guest plan:", err);
      }
    }
    // No valid plan found — show the mission input UI
    showNewMissionUI();
  } else {
    // Authenticated user: check Django API for active plan
    try {
      const result = await apiGetPlan();
      if (result.plan && Array.isArray(result.plan.phases) && result.plan.phases.length > 0) {
        setPlan(result.plan);
        await finalizeBoot(user, isGuest, result.plan.id);
      } else {
        showNewMissionUI();
      }
    } catch (err) {
      console.error("Failed to load plan from server:", err);
      // Fallback to localStorage
      const savedPlan = localStorage.getItem("cosmoslab_guest_plan_data");
      if (savedPlan) {
        try {
          const parsed = JSON.parse(savedPlan);
          if (parsed && Array.isArray(parsed.phases) && parsed.phases.length > 0) {
            setPlan(parsed);
            await finalizeBoot(user, isGuest, "local-plan");
            return;
          }
        } catch (e) { /* ignore */ }
      }
      showNewMissionUI();
    }
  }
}

async function finalizeBoot(user, isGuest, planId) {
  const plan = getPlan();
  if (!plan || !plan.phases || plan.phases.length === 0) {
    showNewMissionUI();
    return;
  }

  document.querySelector(".dashboard-hud").style.display = "flex";
  scene.setPlanet(plan.phases[0].planet);
  updateZoomDisplay(scene.getZoom());

  await initProgress({ uid: user ? user.id : null, isGuest, planId });

  progressStore.subscribe(render);
  render(progressStore.getState());
}

function showNewMissionUI() {
  // Hide main dashboard UI so only the 3D scene is visible
  document.querySelector(".dashboard-hud").style.display = "none";

  // Create glass polished overlay container
  const overlay = document.createElement("div");
  overlay.className = "mission-overlay";
  overlay.style.position = "absolute";
  overlay.style.inset = "0";
  overlay.style.zIndex = "2000";
  overlay.style.display = "flex";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.style.backgroundColor = "transparent";
  
  overlay.innerHTML = `
    <div class="mission-modal glass-panel" style="padding: 3rem; border-radius: 24px; text-align: center; width: 100%; max-width: 500px; box-shadow: 0 20px 40px rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.1);">
      <h2 style="font-size: 2rem; margin-bottom: 1rem; background: linear-gradient(90deg, #fff, #888); -webkit-background-clip: text; color: transparent;">What is your mission?</h2>
      <p style="color: #aaa; margin-bottom: 2rem;">Enter your goal, and the Cosmic AI will map out your roadmap across the solar system.</p>
      <input type="text" id="mission-input" placeholder="e.g. Learn Quantum Physics" style="width: 100%; padding: 1rem; border-radius: 12px; border: 1px solid rgba(255,255,255,0.2); background: rgba(0,0,0,0.3); color: #fff; font-size: 1.1rem; outline: none; margin-bottom: 1.5rem; transition: border-color 0.3s;" />
      <button id="mission-btn" style="background: var(--lime-crush); color: #000; padding: 1rem 2rem; border-radius: 12px; font-weight: bold; cursor: pointer; border: none; font-size: 1.1rem; width: 100%; transition: transform 0.2s;">Generate Roadmap</button>
      <div id="loading-container" style="display: none; margin-top: 1rem;">
        <p style="color: var(--lime-crush); margin-bottom: 1rem;">Mapping coordinates...</p>
        <div style="width: 100%; height: 8px; background: rgba(255,255,255,0.1); border-radius: 4px; overflow: hidden; position: relative;">
          <div id="loading-bar" style="width: 0%; height: 100%; background: var(--lime-crush); border-radius: 4px; transition: width 0.5s ease-out; box-shadow: 0 0 10px var(--lime-crush);"></div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const input = document.getElementById("mission-input");
  const btn = document.getElementById("mission-btn");
  const loadingContainer = document.getElementById("loading-container");
  const loadingBar = document.getElementById("loading-bar");

  input.addEventListener("focus", () => input.style.borderColor = "var(--lime-crush)");
  input.addEventListener("blur", () => input.style.borderColor = "rgba(255,255,255,0.2)");

  btn.addEventListener("click", async () => {
    const topic = input.value.trim();
    if (!topic) return;

    // Start loading state
    input.style.display = "none";
    btn.style.display = "none";
    loadingContainer.style.display = "block";

    // Set 3D scene to orbit
    scene.setZoom(20); // Zoom out to see the whole system

    // Simulate loading bar progress while waiting for AI
    let progress = 0;
    const progressInterval = setInterval(() => {
      progress += Math.random() * 5;
      if (progress > 90) progress = 90; // hold at 90% until done
      loadingBar.style.width = `${progress}%`;
    }, 500);

    const { user, isGuest } = authStore.getState();

    try {
      let planData = null;

      if (user && !isGuest) {
        // Authenticated user — generate plan server-side via Django
        const result = await apiGeneratePlan(topic);
        if (!result.plan || !Array.isArray(result.plan.phases) || result.plan.phases.length === 0) {
          throw new Error("AI failed to generate a valid plan. Please try a different topic.");
        }
        planData = result.plan;
      } else {
        // Guest mode — call Gemini directly from frontend (no server auth needed)
        // Actually, for guests we also go through the server if available,
        // but since guests aren't authenticated, we store to localStorage
        // For now, guests use the DEFAULT_PLAN as a fallback or we can try the API
        // Let's try the server first with a special guest endpoint
        try {
          // Try to use server-side generation even for guests
          // This will fail with 401 since guest isn't authenticated
          const result = await apiGeneratePlan(topic);
          planData = result.plan;
        } catch (authErr) {
          // Guest can't use authenticated endpoint — use DEFAULT_PLAN with topic
          console.warn("Guest cannot use server AI, using default plan template");
          planData = { ...DEFAULT_PLAN, topic: topic };
        }
      }

      // Validate plan data
      if (!planData || !Array.isArray(planData.phases) || planData.phases.length === 0) {
        throw new Error("Failed to generate a valid plan. Please try again.");
      }

      // Validate each phase has days and tasks
      for (const phase of planData.phases) {
        if (!Array.isArray(phase.days) || phase.days.length === 0) {
          throw new Error("Generated plan has phases with no days. Please try again.");
        }
        for (const day of phase.days) {
          if (!Array.isArray(day.tasks) || day.tasks.length === 0) {
            throw new Error("Generated plan has days with no tasks. Please try again.");
          }
        }
      }

      // Save to localStorage as backup (works for both guest and auth users)
      localStorage.setItem("cosmoslab_guest_plan_data", JSON.stringify(planData));

      clearInterval(progressInterval);
      loadingBar.style.width = "100%";

      // Wait for the loading bar animation to complete, then boot
      await new Promise(resolve => setTimeout(resolve, 800));

      // Cleanup UI and boot dashboard
      overlay.remove();
      document.querySelector(".dashboard-hud").style.display = "flex";

      setPlan(planData);
      await finalizeBoot(user, isGuest, planData.id || "local-plan");

    } catch (err) {
      clearInterval(progressInterval);
      loadingContainer.style.display = "none";
      input.style.display = "block";
      btn.style.display = "block";
      showToast("Generation failed: " + err.message);
      console.error(err);
    }
  });
}

// ---- Zoom control -------------------------------------------------------
function updateZoomDisplay(pct) {
  els.zoomValue.textContent = `${Math.round(pct)}%`;
}

els.zoomIn.addEventListener("click", () => {
  const pct = scene.getZoom() + 10;
  updateZoomDisplay(scene.setZoom(pct));
});
els.zoomOut.addEventListener("click", () => {
  const pct = scene.getZoom() - 10;
  updateZoomDisplay(scene.setZoom(pct));
});
els.zoomReset.addEventListener("click", () => {
  updateZoomDisplay(scene.resetZoom());
});

// ---- Header utility actions ---------------------------------------------
els.newMissionBtn.addEventListener("click", async () => {
  const confirmed = window.confirm("Start a new mission? This will clear your current plan. You cannot undo this.");
  if (!confirmed) return;
  
  if (authStore.getState().isGuest) {
    localStorage.removeItem("cosmoslab_guest_plan_data");
    localStorage.removeItem("cosmoslab_guest_progress");
    window.location.reload();
  } else {
    try {
      await apiResetPlan();
      localStorage.removeItem("cosmoslab_guest_plan_data");
      window.location.reload();
    } catch (err) {
      showToast("Failed to reset plan: " + err.message);
    }
  }
});

els.resetBtn.addEventListener("click", async () => {
  const confirmed = window.confirm(
    "Reset all progress on this plan? This cannot be undone."
  );
  if (!confirmed) return;
  await resetProgress();
  showToast("TELEMETRY LOG UPDATED");
});

els.terminateBtn.addEventListener("click", async () => {
  await signOutUser();
  window.location.href = "/";
});

// ---- Phase navigation (viewing state, independent of active progress) --
els.prevBtn.addEventListener("click", () => {
  const { viewedPhaseIndex } = progressStore.getState();
  setViewedPhase(viewedPhaseIndex - 1);
});
els.nextBtn.addEventListener("click", () => {
  const { viewedPhaseIndex } = progressStore.getState();
  setViewedPhase(viewedPhaseIndex + 1);
});

// ---- Rendering ------------------------------------------------------------
function overallStats(data) {
  const plan = getPlan();
  if (!plan) return { pct: 0, burns: '0/0', hours: '0.0', streak: 0 };
  const totalTasks = plan.phases.reduce((sum, p) => sum + totalTasksInPhase(p), 0);
  const doneTasks = Object.keys(data.completedTasks).length;
  const totalMinutes = Object.values(data.completedTasks).reduce(
    (sum, t) => sum + (t.loggedMinutes || 0),
    0
  );
  const pct = totalTasks === 0 ? 0 : Math.round((doneTasks / totalTasks) * 100);
  return {
    pct,
    burns: `${doneTasks}/${totalTasks}`,
    hours: (totalMinutes / 60).toFixed(1),
    streak: data.currentStreak || 0,
  };
}

let previousCompletedPhases = {};

function render(state) {
  const { data, viewedPhaseIndex } = state;
  const plan = getPlan();
  if (!plan || !plan.phases || !plan.phases[viewedPhaseIndex]) return;
  
  const phase = plan.phases[viewedPhaseIndex];

  // Announce newly-completed phases for assistive tech.
  Object.keys(data.completedPhases).forEach((idx) => {
    if (!previousCompletedPhases[idx]) {
      els.dayStatusLive.textContent = "Phase complete";
    }
  });
  previousCompletedPhases = data.completedPhases;

  // Planet + phase heading.
  scene.setPlanet(phase.planet);
  els.breadcrumb.textContent = `${phase.planet.toUpperCase()} -- PHASE ${viewedPhaseIndex + 1}`;
  els.heading.textContent = `Phase ${viewedPhaseIndex + 1}`;
  els.prevBtn.disabled = viewedPhaseIndex === 0;
  els.nextBtn.disabled = viewedPhaseIndex === plan.phases.length - 1;

  // Global stats strip (matches the reference: identical across phases).
  const stats = overallStats(data);
  els.statCompletion.textContent = `${stats.pct}%`;
  els.statBurns.textContent = stats.burns;
  els.statHours.textContent = stats.hours;
  els.statStreak.textContent = stats.streak;

  renderTimeline(phase, data);
}

function renderTimeline(phase, data) {
  const phaseIdx = phase.phaseIndex;
  const isLocked = !data.phaseUnlocked[phaseIdx];
  els.timeline.innerHTML = "";

  if (isLocked) {
    const plan = getPlan();
    const prevPlanet = plan.phases[phaseIdx - 1]?.planet || "the previous phase";
    const msg = document.createElement("div");
    msg.className = "locked-day-message";
    msg.setAttribute("aria-disabled", "true");
    msg.textContent = `Locked -- complete ${prevPlanet} first.`;
    els.timeline.appendChild(msg);
    return;
  }

  const activeDayIndex = findActiveDayIndex(phase, data);

  phase.days.forEach((day, i) => {
    const row = document.createElement("div");
    row.className = "day-row";

    const dotCol = document.createElement("div");
    dotCol.className = "day-dot-col";
    const dot = document.createElement("div");
    // Use composite key for day completion check
    const dayKey = `${phaseIdx}_${day.dayIndex}`;
    dot.className = "day-dot" + (data.completedDays[dayKey] ? " done" : "");
    dotCol.appendChild(dot);
    if (i < phase.days.length - 1) {
      const connector = document.createElement("div");
      connector.className = "day-connector";
      dotCol.appendChild(connector);
    }
    row.appendChild(dotCol);

    const task = day.tasks[0];
    if (!task) return; // Skip days with no tasks (shouldn't happen with validation)
    const done = Boolean(data.completedTasks[task.id]);
    const isActive = day.dayIndex === activeDayIndex;

    const card = document.createElement("div");
    card.className = "day-card" + (isActive ? " active" : "");
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.innerHTML = `
      <div class="day-card-head">
        <span class="day-check" aria-hidden="true">${done ? "&#10003;" : "&nbsp;"}</span>
        <span>DAY ${String(day.dayIndex).padStart(2, "0")}</span>
      </div>
      <div style="font-size: 1rem; color: #fff; margin-top: 0.5rem; text-transform: uppercase; font-family: 'Space Mono', monospace; font-weight: bold;">
        ${task ? task.title : "No task"}
      </div>
    `;

    card.addEventListener("click", () => {
      const existing = data.completedTasks[task.id] || {};
      openMissionModal({
        day,
        task,
        existing,
        onSave: async ({ note, loggedMinutes }) => {
          await completeTask(task.id, day.dayIndex, phaseIdx, { note, loggedMinutes });
          showToast("TELEMETRY LOG UPDATED");
        },
      });
    });
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        card.click();
      }
    });

    row.appendChild(card);
    els.timeline.appendChild(row);
  });
}

function findActiveDayIndex(phase, data) {
  const phaseIdx = phase.phaseIndex;
  const firstIncomplete = phase.days.find((d) => {
    const dayKey = `${phaseIdx}_${d.dayIndex}`;
    return !data.completedDays[dayKey];
  });
  return firstIncomplete ? firstIncomplete.dayIndex : phase.days[phase.days.length - 1].dayIndex;
}

boot();

// --- 3D Light Bending Animation for Phase Column ---
const phaseCol = document.querySelector('.phase-column');
if (phaseCol) {
  phaseCol.addEventListener('mousemove', (e) => {
    const rect = phaseCol.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Calculate rotation based on mouse position
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const rotateX = ((y - centerY) / centerY) * -2; // Subtle tilt, max 2 deg
    const rotateY = ((x - centerX) / centerX) * 2;

    phaseCol.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
    phaseCol.style.setProperty('--mouse-x', `${x}px`);
    phaseCol.style.setProperty('--mouse-y', `${y}px`);
  });

  phaseCol.addEventListener('mouseleave', () => {
    phaseCol.style.transform = `perspective(1000px) rotateX(0deg) rotateY(0deg)`;
    phaseCol.style.setProperty('--mouse-x', `-1000px`);
    phaseCol.style.setProperty('--mouse-y', `-1000px`);
  });
}
