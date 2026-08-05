// js/ui-toast.js
let container = null;

function ensureContainer() {
  if (container) return container;
  container = document.createElement("div");
  container.id = "toast-container";
  container.setAttribute("aria-live", "polite");
  Object.assign(container.style, {
    position: "fixed",
    right: "24px",
    bottom: "24px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    zIndex: "1000",
  });
  document.body.appendChild(container);
  return container;
}

export function showToast(message, { duration = 2500 } = {}) {
  const root = ensureContainer();
  const toast = document.createElement("div");
  toast.className = "glass-panel";
  toast.textContent = message;
  Object.assign(toast.style, {
    padding: "10px 16px",
    fontSize: "11px",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--accent)",
    opacity: "0",
    transform: "translateY(8px)",
    transition: "opacity 0.2s ease, transform 0.2s ease",
  });
  root.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";
  });

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(8px)";
    setTimeout(() => toast.remove(), 200);
  }, duration);
}
