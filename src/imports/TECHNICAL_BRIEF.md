# Technical Brief: Jackery Solar Trip Planner
## Hooking `jackery-planner.js` into a Figma-Generated UI

---

### 1. Architecture Overview

```
Figma Design → Export HTML/CSS → Wire to jackery-planner.js
     ↓
window.JackeryPlanner.state (PlannerState)
     ↓
document.dispatchEvent("planner:updated")
     ↓
Your render functions read state.results and update the DOM
```

The engine is deliberately **UI-agnostic**: it owns zero DOM queries.
All rendering responsibility belongs to your hand-off layer.

---

### 2. The One Event You Must Listen To

```javascript
document.addEventListener("planner:updated", (e) => {
  const { state } = e.detail;
  renderStage(state.currentStage, state.results);
});
```

Every call to `PlannerState.compute()` fires this event. Your render
function receives the full state snapshot — diff it against the DOM
however you prefer (vanilla, morphdom, Alpine.js, etc.).

---

### 3. Figma → HTML Mapping Guide

When exporting from Figma (or using a Figma-to-code plugin like
Anima, Builder.io, or Figma Dev Mode), map component names to
the following data attributes and IDs:

#### Stage 1 — Gear Selection

| Figma Component         | Required HTML attribute              | JS hook                              |
|-------------------------|--------------------------------------|--------------------------------------|
| ApplianceCard           | `data-appliance-id="{id}"`           | Click → `state.addAppliance(id)`     |
| ApplianceCard (active)  | `data-selected="true"`               | Toggled by render function           |
| UsesCounter input       | `data-override-key="uses"`           | Change → `state.updateApplianceOverride(id, {uses})` |
| HoursSlider input       | `data-override-key="hours"`          | Change → `state.updateApplianceOverride(id, {hours})` |
| TripDaysPicker          | `id="trip-days-input"`               | Change → `state.setTripDays(value)`  |
| DemandSummaryPanel      | `id="demand-summary"`                | Written by render on each update     |
| NextStageButton         | `id="stage-1-next"`                  | Click → `state.goToStage(2)`; disable if totalWhNeeded === 0 |

#### Stage 2 — Station Picker

| Figma Component         | Required HTML attribute              | JS hook                              |
|-------------------------|--------------------------------------|--------------------------------------|
| StationCard             | `data-station-id="{id}"`             | Click → `state.selectStation(id)`    |
| StationCard (disabled)  | `data-viable="false"` + `aria-disabled="true"` | Set when capacity < totalWhNeeded |
| RecommendedBadge        | `data-station-id="{id}"`             | Show when id === bestFit.id          |
| CapacityBar (fill)      | `data-station-capacity-bar`          | Width % = station.capacityWh / 5040  |
| NextStageButton         | `id="stage-2-next"`                  | Disable until selectedStation !== null |

#### Stage 3 — Solar Recovery

| Figma Component         | Required HTML attribute              | JS hook                              |
|-------------------------|--------------------------------------|--------------------------------------|
| PanelSelector           | `data-panel-id="{id}"`               | Click → `state.setSolarConfig({panelId})` |
| PanelCountStepper       | `id="panel-count-input"`             | Change → `state.setSolarConfig({panelCount})` |
| WeatherToggle button    | `data-weather="{sunny|partial|overcast}"` | Click → `state.setSolarConfig({weatherCondition})` |
| PeakSunHoursInput       | `id="peak-sun-hours-input"`          | Change → `state.setSolarConfig({peakSunHours})` |
| RecoveryDonut / Bar     | `id="solar-recovery-display"`        | Render dailyRecoveryWh               |
| NetBalancePill          | `id="net-balance-pill"`              | Class + text driven by status: "surplus" | "balanced" | "deficit" |
| CappedWarningBanner     | `id="capped-warning"`                | Show/hide based on solar.cappedByStation |

---

### 4. Required ARIA Markup (copy into your HTML shell)

```html
<!-- Invisible live regions — place directly inside <body> -->
<div
  id="aria-polite-live"
  role="status"
  aria-live="polite"
  aria-atomic="true"
  class="sr-only"
></div>
<div
  id="aria-assertive-live"
  role="alert"
  aria-live="assertive"
  aria-atomic="true"
  class="sr-only"
></div>

<!-- Screen-reader-only utility class -->
<style>
.sr-only {
  position: absolute;
  width: 1px; height: 1px;
  padding: 0; margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
```

`AriaLive.announce()` is called automatically inside `_announceResults()`
after every `compute()`. No manual calls needed unless you want to push
custom messages (e.g., validation errors).

---

### 5. Stage Progress Indicator (Stepper Nav)

```html
<nav aria-label="Planner stages">
  <ol role="list">
    <li>
      <button
        id="nav-stage-1"
        aria-current="step"   <!-- set dynamically -->
        aria-label="Stage 1: Gear Selection"
        onclick="JackeryPlanner.state.goToStage(1)"
      >1</button>
    </li>
    <li>
      <button id="nav-stage-2" aria-label="Stage 2: Power Station"
              onclick="JackeryPlanner.state.goToStage(2)">2</button>
    </li>
    <li>
      <button id="nav-stage-3" aria-label="Stage 3: Solar Recovery"
              onclick="JackeryPlanner.state.goToStage(3)">3</button>
    </li>
  </ol>
</nav>
```

In your `planner:updated` handler, set `aria-current="step"` on the
active stage button and remove it from the others.

---

### 6. Minimal Render Wiring Example

```javascript
// render.js  — your thin presentation layer
import { APPLIANCE_LIBRARY, JACKERY_LINEUP, SOLARSAGA_PANELS } from './jackery-planner.js';

document.addEventListener("planner:updated", ({ detail: { state } }) => {
  const { results, currentStage } = state;

  // Show/hide stages
  document.querySelectorAll("[data-stage]").forEach((el) => {
    el.hidden = parseInt(el.dataset.stage, 10) !== currentStage;
  });

  // Update stepper aria-current
  document.querySelectorAll("[id^='nav-stage-']").forEach((btn, i) => {
    btn.ariaCurrent = (i + 1) === currentStage ? "step" : null;
  });

  if (!results.demand) return;

  // Stage 1 — demand summary
  const demandEl = document.getElementById("demand-summary");
  if (demandEl) {
    demandEl.textContent =
      `${results.demand.totalWhPerDay} Wh/day · ` +
      `${results.demand.totalWhNeeded} Wh total`;
  }

  // Stage 2 — station cards
  if (results.stationRecs) {
    document.querySelectorAll("[data-station-id]").forEach((card) => {
      const id = card.dataset.stationId;
      const viable = results.stationRecs.recommended.some((s) => s.id === id);
      const isBestFit = results.stationRecs.bestFit?.id === id;
      card.dataset.viable = viable;
      card.ariaDisabled = viable ? null : "true";
      card.querySelector("[data-recommended-badge]")?.toggleAttribute("hidden", !isBestFit);
    });
  }

  // Stage 3 — solar results
  if (results.solar && results.netBalance) {
    const pill = document.getElementById("net-balance-pill");
    if (pill) {
      pill.textContent = `${results.netBalance.status} (${results.netBalance.coveragePercent}%)`;
      pill.className = `pill pill--${results.netBalance.status}`;
    }
    const capped = document.getElementById("capped-warning");
    if (capped) capped.hidden = !results.solar.cappedByStation;
  }
});
```

---

### 7. Key Design Decisions

| Decision | Rationale |
|---|---|
| `CustomEvent("planner:updated")` over callbacks | Decouples engine from UI; any number of listeners (charts, summaries, exports) can subscribe independently |
| 20% safety buffer in `calculateTotalDemand` | Real-world losses from cable resistance, partial state-of-charge, and temperature variance |
| `efficiencyFactor` per appliance (not global) | Inverter losses differ: resistive heaters ~0.88, USB chargers ~0.95 |
| `cappedByStation` flag in solar calc | Prevents confusing results when users pair an underpowered station with a large panel array |
| Assertive ARIA for deficit status | Screen reader users need immediate interruption when the trip plan is unsustainable |
| Stage gate (disable Next until valid) | Prevents users from reaching Stage 3 with no data, reducing ARIA announcement noise |

---

### 8. Script Tag Order

```html
<!-- In your Figma-exported HTML, before </body> -->
<script src="jackery-planner.js"></script>
<script src="render.js"></script>
```

Or as ES modules:
```html
<script type="module" src="render.js"></script>
```
(jackery-planner.js exports via `window.JackeryPlanner` for script-tag
usage; switch the bottom of the file to named ESM exports for module usage.)
