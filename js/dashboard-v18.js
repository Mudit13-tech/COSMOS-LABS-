// js/dashboard.js
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
import { db, GEMINI_API_KEY } from "./firebase-config.js";
import { doc, getDoc, setDoc, collection } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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
initAuthListener();

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
    const savedPlan = localStorage.getItem("cosmoslab_guest_plan_data");
    if (savedPlan) {
      try {
        setPlan(JSON.parse(savedPlan));
        finalizeBoot(user, isGuest, "local-plan");
      } catch (err) {
        showNewMissionUI();
      }
    } else {
      showNewMissionUI();
    }
  } else {
    // Check for active plan
    try {
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);
      const activePlanId = userSnap.data()?.activePlanId;

      if (activePlanId) {
        const planSnap = await getDoc(doc(db, "plans", activePlanId));
        if (planSnap.exists()) {
          setPlan(planSnap.data());
          finalizeBoot(user, isGuest, activePlanId);
        } else {
          showNewMissionUI();
        }
      } else {
        showNewMissionUI();
      }
    } catch (err) {
      // Fallback if offline or rules deny access
      const savedPlan = localStorage.getItem("cosmoslab_guest_plan_data");
      if (savedPlan) {
        try {
          setPlan(JSON.parse(savedPlan));
          finalizeBoot(user, isGuest, "local-plan");
          return;
        } catch (e) {}
      }
      showNewMissionUI();
    }
  }
}

async function finalizeBoot(user, isGuest, planId) {
  document.querySelector(".dashboard-hud").style.display = "flex";
  scene.setPlanet(getPlan().phases[0].planet);
  updateZoomDisplay(scene.getZoom());

  await initProgress({ uid: user ? user.uid : null, isGuest, planId });

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

    const withTimeout = (promise, ms, name) => {
      let timeoutId;
      const timeout = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`${name} timed out after ${ms/1000}s`)), ms);
      });
      return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
    };

    try {
      const prompt = `You are a master technical planner and architect. The user wants to learn or build: "${topic}".
Create a detailed, day-by-day curriculum or roadmap divided into exactly 8 phases.
The phases must map to these 8 planets in order: mercury, venus, earth, mars, jupiter, saturn, uranus, neptune.
Each phase should have a title, a short summary, and an array of days.
Each day should have a list of tasks.
Return ONLY valid JSON matching this schema:
{
  "topic": "String",
  "status": "confirmed",
  "phases": [
    {
      "phaseIndex": 0,
      "planet": "mercury",
      "title": "String",
      "summary": "String",
      "days": [
        {
          "dayIndex": 1,
          "tasks": [
            {
              "id": "t1-1",
              "title": "String",
              "tags": ["String"],
              "estMinutes": Number,
              "description": "String"
            }
          ]
        }
      ]
    }
  ]
}
Return ONLY valid JSON. Make the roadmap comprehensive and realistic, with multiple days per phase as appropriate.`;

      const models = [
        "gemini-3.6-flash",
        "gemini-3.5-flash",
        "gemini-2.5-flash",
        "gemini-2.0-flash"
      ];
      
      let response = null;
      let lastError = null;
      
      for (const model of models) {
        try {
          const res = await withTimeout(fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { responseMimeType: "application/json" }
            })
          }), 45000, "AI Generation API");

          if (res.ok) {
            response = res;
            break;
          } else {
            let errMsg = "HTTP Error " + res.status;
            try {
              const errJson = await res.json();
              if (errJson.error && errJson.error.message) {
                errMsg = errJson.error.message;
              }
            } catch(e) {}
            console.warn(`Model ${model} failed: ${errMsg}`);
            lastError = new Error(errMsg);
          }
        } catch (err) {
          console.warn(`Model ${model} error:`, err);
          lastError = err;
        }
      }

      if (!response) {
        throw lastError || new Error("All AI models failed to generate.");
      }

      const data = await response.json();
      if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
        throw new Error("AI returned an empty response.");
      }
      
      let rawText = data.candidates[0].content.parts[0].text;
      rawText = rawText.replace(/^```(json)?/, '').replace(/```$/, '').trim();
      
      let planData;
      try {
        planData = JSON.parse(rawText);
      } catch (e) {
        throw new Error("AI returned invalid JSON format.");
      }

      if (!planData || !Array.isArray(planData.phases) || planData.phases.length === 0) {
        throw new Error("AI failed to generate a valid phase map. Please try a different topic.");
      }

      const { user, isGuest } = await withTimeout(waitForAuthResolved(), 5000, "Auth Resolution");

      let planId = null;
      
      // We ALWAYS save to localStorage so the app is immune to offline/adblocker issues
      localStorage.setItem("cosmoslab_guest_plan_data", JSON.stringify(planData));

      // We do not await Firestore writes. We perform them optimistically in the background 
      // so the user gets an instant experience and doesn't get blocked by slow WebSockets.
      
      if (user && !isGuest) {
        const uid = user.uid;
        planId = "plan_" + Date.now();
        
        setDoc(doc(db, "plans", planId), {
          ...planData,
          uid,
          createdAt: Date.now()
        }).catch(e => console.warn("Background save failed:", e));

        setDoc(doc(db, "users", uid), { activePlanId: planId }, { merge: true }).catch(e => console.warn(e));

        const progressRef = doc(db, "progress", `${uid}_${planId}`);
        setDoc(progressRef, {
          currentPhaseIndex: 0,
          currentDayIndex: 1,
          completedTasks: {},
          completedDays: {},
          completedPhases: {},
          phaseUnlocked: Array.from({ length: 8 }, (_, i) => i === 0),
          lastUpdated: Date.now(),
          currentStreak: 0,
        }).catch(e => console.warn(e));
      }

      clearInterval(progressInterval);
      loadingBar.style.width = "100%";

      setTimeout(async () => {
        // Cleanup UI and boot dashboard
        document.body.removeChild(overlay);
        document.querySelector(".dashboard-hud").style.display = "flex";

        setPlan(planData);
        await finalizeBoot(user, isGuest, planId);
      }, 1000);

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
    window.location.reload();
  } else {
    const user = authStore.getState().user;
    if (user) {
      await setDoc(doc(db, "users", user.uid), { activePlanId: null }, { merge: true });
      window.location.reload();
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
  const totalTasks = getPlan().phases.reduce((sum, p) => sum + totalTasksInPhase(p), 0);
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
  const phase = getPlan().phases[viewedPhaseIndex];

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
  els.nextBtn.disabled = viewedPhaseIndex === getPlan().phases.length - 1;

  // Global stats strip (matches the reference: identical across phases).
  const stats = overallStats(data);
  els.statCompletion.textContent = `${stats.pct}%`;
  els.statBurns.textContent = stats.burns;
  els.statHours.textContent = stats.hours;
  els.statStreak.textContent = stats.streak;

  renderTimeline(phase, data);
}

function renderTimeline(phase, data) {
  const isLocked = !data.phaseUnlocked[phase.phaseIndex];
  els.timeline.innerHTML = "";

  if (isLocked) {
    const prevPlanet = getPlan().phases[phase.phaseIndex - 1]?.planet || "the previous phase";
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
    dot.className = "day-dot" + (data.completedDays[day.dayIndex] ? " done" : "");
    dotCol.appendChild(dot);
    if (i < phase.days.length - 1) {
      const connector = document.createElement("div");
      connector.className = "day-connector";
      dotCol.appendChild(connector);
    }
    row.appendChild(dotCol);

    const task = day.tasks[0];
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

    // Removing the checkbox logic since we just render a checkmark now
    // The click handler on the card itself will open the modal

    card.addEventListener("click", () => {
      const existing = data.completedTasks[task.id] || {};
      openMissionModal({
        day,
        task,
        existing,
        onSave: async ({ note, loggedMinutes }) => {
          await completeTask(task.id, day.dayIndex, { note, loggedMinutes });
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
  const firstIncomplete = phase.days.find((d) => !data.completedDays[d.dayIndex]);
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
