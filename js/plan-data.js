function task(id, title, tags, estMinutes, opts = {}) {
  return {
    id,
    title,
    tags,
    estMinutes,
    systemsInit: opts.systemsInit || "",
    description: opts.description || "",
    resourceLinks: opts.resourceLinks || [],
    observed: Boolean(opts.observed),
  };
}

function day(dayIndex, tasks) {
  return { dayIndex, date: null, tasks };
}

export let PLAN = null;

export function setPlan(newPlan) {
  PLAN = newPlan;
}

export function getPlan() {
  return PLAN;
}

export const DEFAULT_PLAN = {
  topic: "Build an Interactive Canvas Application",
  status: "confirmed",
  phases: [
    {
      phaseIndex: 0,
      planet: "mercury",
      title: "Foundations",
      summary: "Project setup and the core render loop.",
      days: [
        day(1, [task("t1-1", "Kickoff: define scope and success criteria", ["PLANNING"], 60)]),
        day(2, [
          task("t2-1", "Set up Vite + React + Tailwind project", ["TOOLING", "JSX", "STRUCTURE"], 120, {
            observed: true,
            systemsInit: "REACT + TOOLING",
            description: "Scaffold the project with Vite, wire up React, and configure Tailwind.",
          }),
        ]),
        day(3, [task("t3-1", "Build the canvas render loop", ["CANVAS", "RAF"], 90, { systemsInit: "REACT + CANVAS" })]),
        day(4, [task("t4-1", "Draw basic shape primitives", ["SHAPES", "GEOMETRY"], 90)]),
        day(5, [task("t5-1", "Model shape state and re-render on change", ["STATE"], 120)]),
        day(6, [task("t6-1", "Implement click-based hit testing / selection", ["HIT TESTING"], 120)]),
        day(7, [
          task("t7-1", "Implement panning via mouse drag", ["COORDINATE TRANSFORMS"], 180, {
            observed: true,
            systemsInit: "REACT + CANVAS",
            description: "Track mouse drag deltas and translate the canvas's world-space origin accordingly.",
          }),
        ]),
        day(8, [
          task("t8-1", "Implement zoom via scroll wheel", ["SCALING MATH", "EVENTS"], 120, {
            observed: true,
            systemsInit: "REACT + CANVAS",
            description:
              "Listen to `onWheel`. Update a `zoom` scale factor. Complex: Ensure it zooms towards the mouse cursor by converting screen to world coords.",
          }),
        ]),
      ],
    },
    {
      phaseIndex: 1,
      planet: "venus",
      title: "Core Interactions",
      summary: "Multi-select, undo/redo, and manipulation handles.",
      days: [
        day(9, [task("t9-1", "Multi-select with a rubber-band box", ["SELECTION"], 120)]),
        day(10, [task("t10-1", "Undo/redo command stack", ["HISTORY"], 150)]),
        day(11, [task("t11-1", "Keyboard shortcuts (delete, duplicate, arrows)", ["A11Y", "EVENTS"], 90)]),
        day(12, [task("t12-1", "Resize handles on selected shapes", ["GEOMETRY"], 120)]),
        day(13, [task("t13-1", "Rotate handle + rotation math", ["TRANSFORMS"], 120)]),
        day(14, [task("t14-1", "Snapping to grid and to other shapes", ["SNAPPING"], 150)]),
        day(15, [task("t15-1", "Layers panel: reorder and visibility toggle", ["UI", "STATE"], 120)]),
      ],
    },
    {
      phaseIndex: 2,
      planet: "earth",
      title: "Core Features",
      summary: "Content tools, styling, and persistence.",
      days: [
        day(16, [task("t16-1", "Text tool with inline editing", ["TEXT", "DOM OVERLAY"], 150)]),
        day(17, [task("t17-1", "Styling panel: fill, stroke, opacity", ["UI"], 120)]),
        day(18, [task("t18-1", "Color picker component", ["UI", "COLOR"], 90)]),
        day(19, [task("t19-1", "Export canvas to PNG", ["EXPORT"], 90)]),
        day(20, [task("t20-1", "Export canvas to SVG", ["EXPORT"], 120)]),
        day(21, [task("t21-1", "Save/load project as JSON", ["PERSISTENCE"], 120)]),
        day(22, [task("t22-1", "Persist last session to localStorage", ["PERSISTENCE"], 90)]),
      ],
    },
    {
      phaseIndex: 3,
      planet: "mars",
      title: "Applying & Hardening",
      summary: "Performance, accessibility, and mobile support.",
      days: [
        day(23, [task("t23-1", "Virtualize offscreen shapes for performance", ["PERFORMANCE"], 150)]),
        day(24, [task("t24-1", "Compress undo history for large documents", ["PERFORMANCE"], 120)]),
        day(25, [task("t25-1", "Accessibility pass: focus order, ARIA labels", ["A11Y"], 120)]),
        day(26, [task("t26-1", "Touch support: pinch-to-zoom, drag on mobile", ["MOBILE", "EVENTS"], 150)]),
        day(27, [task("t27-1", "Write unit tests for transform math", ["TESTING"], 120)]),
        day(28, [task("t28-1", "Write integration tests for core flows", ["TESTING"], 150)]),
        day(29, [task("t29-1", "Bug bash and triage", ["QA"], 120)]),
      ],
    },
    {
      phaseIndex: 4,
      planet: "jupiter",
      title: "Heavy & Complex",
      summary: "Real-time collaboration and sharing.",
      days: [
        day(30, [task("t30-1", "Design the real-time sync data model", ["ARCHITECTURE"], 120)]),
        day(31, [task("t31-1", "Wire up Firestore realtime listeners", ["FIRESTORE"], 150)]),
        day(32, [task("t32-1", "Conflict resolution for concurrent edits", ["CRDT", "ARCHITECTURE"], 180)]),
        day(33, [task("t33-1", "Presence: show collaborators' live cursors", ["REALTIME"], 150)]),
        day(34, [task("t34-1", "Auth integration for shared documents", ["AUTH"], 120)]),
        day(35, [task("t35-1", "Shareable links with view/edit permissions", ["PERMISSIONS"], 150)]),
        day(36, [task("t36-1", "Rate limiting and abuse prevention", ["SECURITY"], 120)]),
      ],
    },
    {
      phaseIndex: 5,
      planet: "saturn",
      title: "Systems & Launch",
      summary: "CI/CD, testing on prod, and shipping.",
      days: [
        day(37, [task("t37-1", "Set up CI pipeline (lint, test, build)", ["CI/CD"], 120)]),
        day(38, [task("t38-1", "Set up CD pipeline and staging environment", ["CI/CD"], 120)]),
        day(39, [
          task("t39-1", "End-to-End Testing on Prod", ["MIXED CONTENT"], 120, {
            observed: true,
            description: "Run the full E2E suite against the production deployment before launch.",
          }),
        ]),
        day(40, [task("t40-1", "Performance audit (Lighthouse, bundle size)", ["PERFORMANCE"], 120)]),
        day(41, [task("t41-1", "Security review and dependency audit", ["SECURITY"], 90)]),
        day(42, [task("t42-1", "Launch checklist and monitoring setup", ["OPS"], 90)]),
        day(43, [
          task("t43-1", "Mission Complete & Portfolio prep", ["WRAP-UP"], 120, {
            observed: true,
            description: "Write up the project for your portfolio: problem, approach, and what you'd do differently.",
          }),
        ]),
      ],
    },
  ],
};

export function findTaskContext(taskId) {
  if (!PLAN) return null;
  for (const phase of PLAN.phases) {
    for (const d of phase.days) {
      const t = d.tasks.find((x) => x.id === taskId);
      if (t) return { phase, day: d, task: t };
    }
  }
  return null;
}

export function totalDaysInPhase(phase) {
  return phase.days.length;
}

export function totalTasksInPhase(phase) {
  return phase.days.reduce((sum, d) => sum + d.tasks.length, 0);
}
