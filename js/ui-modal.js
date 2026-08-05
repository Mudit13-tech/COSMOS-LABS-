// js/ui-modal.js
let activeModal = null;
let lastFocused = null;

function trapFocus(event, root) {
  if (event.key !== "Tab") return;
  const focusable = root.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export function closeMissionModal() {
  if (!activeModal) return;
  activeModal.overlay.remove();
  document.removeEventListener("keydown", activeModal.onKeydown);
  if (lastFocused) lastFocused.focus();
  activeModal = null;
}

/**
 * Opens the "Mission Briefing" day/task detail modal.
 * @param {object} params
 * @param {object} params.day - Day object (from plan-data.js)
 * @param {object} params.task - Task object (from plan-data.js)
 * @param {{note?: string, loggedMinutes?: number}} params.existing
 * @param {(payload: {note: string, loggedMinutes: number}) => void} params.onSave
 */
export function openMissionModal({ day, task, existing = {}, onSave }) {
  closeMissionModal();
  lastFocused = document.activeElement;

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal-panel glass-panel corner-brackets" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <button type="button" class="modal-close btn-quiet" aria-label="Close mission briefing">&times;</button>
      <div class="modal-eyebrow">
        <span class="modal-day-tag">DAY ${String(day.dayIndex).padStart(2, "0")}</span>
        <span class="modal-systems">${task.systemsInit ? `SYSTEMS INIT: ${task.systemsInit}` : ""}</span>
      </div>
      <h2 id="modal-title" class="modal-title">${task.title}</h2>
      <div class="modal-tags">${(task.tags || []).join(", ")}</div>
      <div class="modal-briefing">
        <div class="modal-briefing-head">&#9432; Mission Briefing</div>
        <p>${task.description || "No additional briefing for this task."}</p>
      </div>
      <div class="modal-footer">
        <div class="modal-field">
          <label for="modal-notes">Telemetry Notes</label>
          <textarea id="modal-notes" rows="3" placeholder="Log anomalies, findings, or blockers...">${existing.note || ""}</textarea>
        </div>
        <div class="modal-field modal-field-hours">
          <label for="modal-hours">Flight Hours</label>
          <input id="modal-hours" type="number" min="0" step="0.5" placeholder="0.0"
            value="${existing.loggedMinutes ? (existing.loggedMinutes / 60).toFixed(1) : ""}" />
          <button type="button" class="btn btn-primary modal-save">Save Log</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const onKeydown = (event) => {
    if (event.key === "Escape") closeMissionModal();
    trapFocus(event, overlay);
  };
  document.addEventListener("keydown", onKeydown);
  activeModal = { overlay, onKeydown };

  // 3D Tilt / Stitch effect on mousemove
  const panel = overlay.querySelector(".modal-panel");
  panel.addEventListener("mousemove", (e) => {
    const rect = panel.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    
    const rotateX = ((y - centerY) / centerY) * -4; // Max 4 deg
    const rotateY = ((x - centerX) / centerX) * 4;
    
    panel.style.transform = `perspective(1200px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateZ(10px)`;
    panel.style.transition = "none";
  });
  
  panel.addEventListener("mouseleave", () => {
    panel.style.transform = `perspective(1200px) rotateX(0deg) rotateY(0deg) translateZ(0px)`;
    panel.style.transition = "transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)";
  });

  overlay.querySelector(".modal-close").addEventListener("click", closeMissionModal);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeMissionModal();
  });
  overlay.querySelector(".modal-save").addEventListener("click", () => {
    const note = overlay.querySelector("#modal-notes").value.trim();
    const hours = parseFloat(overlay.querySelector("#modal-hours").value) || 0;
    onSave({ note, loggedMinutes: Math.round(hours * 60) });
    closeMissionModal();
  });

  overlay.querySelector("#modal-notes").focus();
}
