/**
 * ============================================================
 * JACKERY SOLAR TRIP PLANNER — CORE ENGINE
 * ============================================================
 * Architecture: Stage-based state manager with dual-logic
 * demand model, solar recovery calculator, and ARIA-live
 * region integration hooks.
 *
 * Stages:
 *   1 → Gear Selection  (appliance library + demand calc)
 *   2 → Station Picker  (Jackery lineup matching)
 *   3 → Solar Recovery  (panel + weather simulation)
 * ============================================================
 */

"use strict";

// ─────────────────────────────────────────────────────────────
// § 1. DATA LAYER — Jackery Lineup
// ─────────────────────────────────────────────────────────────

/**
 * @typedef {Object} JackeryStation
 * @property {string}   id             - Unique slug
 * @property {string}   name           - Display name
 * @property {number}   capacityWh     - Usable capacity in Watt-hours
 * @property {number}   acOutputW      - Max continuous AC output (W)
 * @property {number}   maxSolarInputW - Max solar charge input (W)
 * @property {number}   weightKg       - Unit weight in kg
 * @property {string[]} compatiblePanels - SolarSaga model IDs
 * @property {number}   priceUSD       - Approx. retail price
 */

/** @type {JackeryStation[]} */
const JACKERY_LINEUP = [
  {
    id: "explorer-300-plus",
    name: "Explorer 300 Plus",
    capacityWh: 288,
    acOutputW: 300,
    maxSolarInputW: 100,
    weightKg: 3.75,
    compatiblePanels: ["solarsaga-40", "solarsaga-80", "solarsaga-100"],
    priceUSD: 299,
  },
  {
    id: "explorer-1000-v2",
    name: "Explorer 1000 v2",
    capacityWh: 1070,
    acOutputW: 1500,
    maxSolarInputW: 400,
    weightKg: 10.8,
    compatiblePanels: ["solarsaga-80", "solarsaga-100", "solarsaga-200"],
    priceUSD: 999,
  },
  {
    id: "explorer-2000-v2",
    name: "Explorer 2000 v2",
    capacityWh: 2042,
    acOutputW: 2200,
    maxSolarInputW: 1000,
    weightKg: 23.8,
    compatiblePanels: ["solarsaga-100", "solarsaga-200"],
    priceUSD: 1999,
  },
  {
    id: "explorer-3000-pro",
    name: "Explorer 3000 Pro",
    capacityWh: 3024,
    acOutputW: 3000,
    maxSolarInputW: 1200,
    weightKg: 32,
    compatiblePanels: ["solarsaga-100", "solarsaga-200"],
    priceUSD: 2999,
  },
  {
    id: "explorer-5000-plus",
    name: "Explorer 5000 Plus",
    capacityWh: 5040,
    acOutputW: 3000,
    maxSolarInputW: 2400,
    weightKg: 61.2,
    compatiblePanels: ["solarsaga-200"],
    priceUSD: 4999,
  },
];

// ─────────────────────────────────────────────────────────────
// § 2. DATA LAYER — Solar Panels
// ─────────────────────────────────────────────────────────────

/**
 * @typedef {Object} SolarPanel
 * @property {string} id        - Unique slug
 * @property {string} name      - Display name
 * @property {number} wattage   - Peak output in Watts
 * @property {number} weightKg
 */

/** @type {SolarPanel[]} */
const SOLARSAGA_PANELS = [
  { id: "solarsaga-40",  name: "SolarSaga 40W",  wattage: 40,  weightKg: 1.2, priceUSD: 99  },
  { id: "solarsaga-80",  name: "SolarSaga 80W",  wattage: 80,  weightKg: 5.0, priceUSD: 199 },
  { id: "solarsaga-100", name: "SolarSaga 100W", wattage: 100, weightKg: 3.6, priceUSD: 229 },
  { id: "solarsaga-200", name: "SolarSaga 200W", wattage: 200, weightKg: 6.8, priceUSD: 399 },
];

// ─────────────────────────────────────────────────────────────
// § 3. DATA LAYER — Appliance Library (Dual-Logic Model)
// ─────────────────────────────────────────────────────────────

/**
 * @typedef {"event" | "duration"} ApplianceLogic
 *
 * "event"    → High-draw item: wattage × hoursPerUse × usesPerDay
 *              e.g. Kettle: 1500W boils for ~6 min (0.1 h), used 3×/day
 *
 * "duration" → Continuous/low-draw item: wattage × hoursPerDay
 *              e.g. Fridge: 40W running 24 h/day
 *
 * @typedef {Object} Appliance
 * @property {string}         id
 * @property {string}         name
 * @property {string}         category     - "Kitchen" | "Comfort & Health" | "Tech" | "Recreation"
 * @property {ApplianceLogic} logic
 * @property {number}         wattage      - Rated draw in Watts
 * @property {number}         [hoursPerUse]  - (event) Active duration per use (h)
 * @property {number}         [defaultUses]  - (event) Default uses per day
 * @property {number}         [defaultHours] - (duration) Default hours on per day
 * @property {number}         efficiencyFactor - Inverter/conversion loss (0–1, typically 0.85–0.95)
 */

/** @type {Appliance[]} */
const APPLIANCE_LIBRARY = [
  // ── Kitchen ──────────────────────────────────────────────
  {
    id: "kettle",
    name: "Electric Kettle",
    category: "Kitchen",
    logic: "event",
    wattage: 1500,
    hoursPerUse: 0.1,       // ~6 minutes per boil
    defaultUses: 3,
    efficiencyFactor: 0.90,
  },
  {
    id: "coffee-maker",
    name: "Coffee Maker",
    category: "Kitchen",
    logic: "event",
    wattage: 1000,
    hoursPerUse: 0.17,      // ~10 minutes brew
    defaultUses: 2,
    efficiencyFactor: 0.90,
  },
  {
    id: "mini-fridge",
    name: "Mini Fridge (40L)",
    category: "Kitchen",
    logic: "duration",
    wattage: 40,
    defaultHours: 24,
    efficiencyFactor: 0.92,
  },
  {
    id: "induction-cooktop",
    name: "Induction Cooktop",
    category: "Kitchen",
    logic: "event",
    wattage: 1800,
    hoursPerUse: 0.5,
    defaultUses: 2,
    efficiencyFactor: 0.88,
  },
  {
    id: "toaster",
    name: "Toaster",
    category: "Kitchen",
    logic: "event",
    wattage: 900,
    hoursPerUse: 0.05,      // ~3 minutes
    defaultUses: 2,
    efficiencyFactor: 0.90,
  },

  // ── Comfort ──────────────────────────────────────────────
  {
    id: "cpap",
    name: "CPAP Machine",
    category: "Comfort & Health",
    logic: "duration",
    wattage: 50,
    defaultHours: 8,
    efficiencyFactor: 0.95,
  },
  {
    id: "fan",
    name: "Portable Fan",
    category: "Comfort & Health",
    logic: "duration",
    wattage: 20,
    defaultHours: 8,
    efficiencyFactor: 0.92,
  },
  {
    id: "heater",
    name: "Space Heater",
    category: "Comfort & Health",
    logic: "duration",
    wattage: 1500,
    defaultHours: 4,
    efficiencyFactor: 0.88,
  },
  {
    id: "ac-portable",
    name: "Portable AC (8000 BTU)",
    category: "Comfort & Health",
    logic: "duration",
    wattage: 900,
    defaultHours: 8,
    efficiencyFactor: 0.85,
  },

  // ── Devices ──────────────────────────────────────────────
  {
    id: "laptop",
    name: "Laptop",
    category: "Tech",
    logic: "duration",
    wattage: 65,
    defaultHours: 6,
    efficiencyFactor: 0.93,
  },
  {
    id: "smartphone",
    name: "Smartphone Charging",
    category: "Tech",
    logic: "event",
    wattage: 20,
    hoursPerUse: 1.5,
    defaultUses: 2,
    efficiencyFactor: 0.95,
  },
  {
    id: "drone",
    name: "Drone Battery Charging",
    category: "Tech",
    logic: "event",
    wattage: 60,
    hoursPerUse: 1.0,
    defaultUses: 2,
    efficiencyFactor: 0.90,
  },
  {
    id: "camera-charging",
    name: "Camera / Action Cam",
    category: "Tech",
    logic: "event",
    wattage: 15,
    hoursPerUse: 1.5,
    defaultUses: 2,
    efficiencyFactor: 0.95,
  },
  {
    id: "projector",
    name: "Mini Projector",
    category: "Tech",
    logic: "duration",
    wattage: 100,
    defaultHours: 3,
    efficiencyFactor: 0.90,
  },

  // ── Comfort & Health (was Essentials/Lighting) ──────────
  {
    id: "led-lantern",
    name: "LED Lantern",
    category: "Comfort & Health",
    logic: "duration",
    wattage: 5,
    defaultHours: 6,
    efficiencyFactor: 0.95,
  },
  {
    id: "electric-blanket",
    name: "Electric Blanket",
    category: "Comfort & Health",
    logic: "duration",
    wattage: 100,
    defaultHours: 8,
    efficiencyFactor: 0.92,
  },
  {
    id: "air-purifier",
    name: "Air Purifier",
    category: "Comfort & Health",
    logic: "duration",
    wattage: 50,
    defaultHours: 8,
    efficiencyFactor: 0.93,
  },
  {
    id: "hearing-aid-charger",
    name: "Hearing Aid Charger",
    category: "Comfort & Health",
    logic: "duration",
    wattage: 5,
    defaultHours: 4,
    efficiencyFactor: 0.95,
  },

  // ── Kitchen (additions) ───────────────────────────────
  {
    id: "electric-griddle",
    name: "Electric Griddle",
    category: "Kitchen",
    logic: "event",
    wattage: 1500,
    hoursPerUse: 0.33,
    defaultUses: 2,
    efficiencyFactor: 0.90,
  },
  {
    id: "blender",
    name: "Blender",
    category: "Kitchen",
    logic: "event",
    wattage: 300,
    hoursPerUse: 0.05,
    defaultUses: 2,
    efficiencyFactor: 0.92,
  },
  {
    id: "rice-cooker",
    name: "Rice Cooker",
    category: "Kitchen",
    logic: "event",
    wattage: 700,
    hoursPerUse: 0.5,
    defaultUses: 1,
    efficiencyFactor: 0.90,
  },

  // ── Tech (additions) ──────────────────────────────────
  {
    id: "tablet-charging",
    name: "Tablet Charging",
    category: "Tech",
    logic: "event",
    wattage: 30,
    hoursPerUse: 2.0,
    defaultUses: 1,
    efficiencyFactor: 0.95,
  },
  {
    id: "walkie-talkie",
    name: "Walkie Talkie Charging",
    category: "Tech",
    logic: "event",
    wattage: 20,
    hoursPerUse: 2.0,
    defaultUses: 1,
    efficiencyFactor: 0.95,
  },

  // ── Recreation ────────────────────────────────────────
  {
    id: "led-strip",
    name: "LED Strip Lights",
    category: "Recreation",
    logic: "duration",
    wattage: 24,
    defaultHours: 5,
    efficiencyFactor: 0.95,
  },
  {
    id: "portable-speaker",
    name: "Portable Speaker",
    category: "Recreation",
    logic: "duration",
    wattage: 30,
    defaultHours: 4,
    efficiencyFactor: 0.92,
  },
  {
    id: "electric-cooler",
    name: "Electric Cooler (12V)",
    category: "Recreation",
    logic: "duration",
    wattage: 60,
    defaultHours: 24,
    efficiencyFactor: 0.92,
  },
  {
    id: "gaming-console",
    name: "Handheld Gaming Console",
    category: "Recreation",
    logic: "duration",
    wattage: 25,
    defaultHours: 3,
    efficiencyFactor: 0.93,
  },
  {
    id: "outdoor-projector",
    name: "Outdoor Movie Projector",
    category: "Recreation",
    logic: "duration",
    wattage: 150,
    defaultHours: 3,
    efficiencyFactor: 0.90,
  },
  {
    id: "party-lights",
    name: "Party / Disco Lights",
    category: "Recreation",
    logic: "duration",
    wattage: 50,
    defaultHours: 4,
    efficiencyFactor: 0.93,
  },
  {
    id: "ebike-charging",
    name: "E-Bike Battery Charging",
    category: "Recreation",
    logic: "event",
    wattage: 250,
    hoursPerUse: 3.0,
    defaultUses: 1,
    efficiencyFactor: 0.88,
  },
  {
    id: "escooter-charging",
    name: "Electric Scooter / Skateboard",
    category: "Recreation",
    logic: "event",
    wattage: 100,
    hoursPerUse: 2.0,
    defaultUses: 1,
    efficiencyFactor: 0.90,
  },
  {
    id: "inflatable-pump",
    name: "Inflatable Pump",
    category: "Recreation",
    logic: "event",
    wattage: 400,
    hoursPerUse: 0.1,
    defaultUses: 1,
    efficiencyFactor: 0.90,
  },
  {
    id: "power-tool-charging",
    name: "Power Tool Charging",
    category: "Recreation",
    logic: "event",
    wattage: 80,
    hoursPerUse: 1.0,
    defaultUses: 1,
    efficiencyFactor: 0.90,
  },
  {
    id: "karaoke-machine",
    name: "Karaoke Machine",
    category: "Recreation",
    logic: "duration",
    wattage: 100,
    defaultHours: 3,
    efficiencyFactor: 0.90,
  },
];

// ─────────────────────────────────────────────────────────────
// § 4. WEATHER COEFFICIENTS
// ─────────────────────────────────────────────────────────────

/**
 * Maps a plain-language weather condition to a solar efficiency
 * multiplier. Applied to peak-watt output × peak sun hours.
 *
 * @type {Object.<string, number>}
 */
const WEATHER_COEFFICIENTS = {
  sunny:    1.0,   // Clear sky, full irradiance
  partial:  0.5,   // Patchy cloud / haze
  overcast: 0.2,   // Heavy cloud / rain
};

// Default peak sun hours for a typical mid-latitude camping day
const DEFAULT_PEAK_SUN_HOURS = 5;

// ─────────────────────────────────────────────────────────────
// § 5. DUAL-LOGIC DEMAND CALCULATOR
// ─────────────────────────────────────────────────────────────

/**
 * Calculates daily Wh demand for a single selected appliance.
 *
 * Dual-logic:
 *  • "event"    → Wh = (wattage × hoursPerUse × uses) / efficiencyFactor
 *  • "duration" → Wh = (wattage × hours) / efficiencyFactor
 *
 * @param {Appliance} appliance
 * @param {Object}    overrides  - User-adjusted quantities from UI
 * @param {number}    [overrides.uses]   - For event-based items
 * @param {number}    [overrides.hours]  - For duration-based items
 * @returns {{ whPerDay: number, peakW: number, logicUsed: ApplianceLogic }}
 */
function calculateApplianceDemand(appliance, overrides = {}) {
  const { wattage, efficiencyFactor, logic } = appliance;

  if (logic === "event") {
    const uses = overrides.uses ?? appliance.defaultUses;
    const hoursPerUse = overrides.hoursPerUse ?? appliance.hoursPerUse;
    const rawWh = wattage * hoursPerUse * uses;
    return {
      whPerDay: rawWh / efficiencyFactor,
      peakW: wattage,
      logicUsed: "event",
    };
  }

  if (logic === "duration") {
    const hours = overrides.hours ?? appliance.defaultHours;
    const rawWh = wattage * hours;
    return {
      whPerDay: rawWh / efficiencyFactor,
      peakW: wattage,
      logicUsed: "duration",
    };
  }

  throw new Error(`Unknown logic type "${logic}" on appliance "${appliance.id}"`);
}

/**
 * Aggregates demand across all selected appliances.
 * Multiplies by trip duration (days) for total-trip Wh.
 *
 * @param {Array<{ appliance: Appliance, overrides: Object }>} selections
 * @param {number} tripDays
 * @returns {{
 *   totalWhPerDay: number,
 *   totalWhNeeded: number,
 *   peakSimultaneousW: number,
 *   breakdown: Array
 * }}
 */
function calculateTotalDemand(selections, tripDays = 1) {
  let totalWhPerDay = 0;
  let peakSimultaneousW = 0;
  const breakdown = [];

  for (const { appliance, overrides } of selections) {
    const result = calculateApplianceDemand(appliance, overrides);

    totalWhPerDay += result.whPerDay;

    // Peak draw assumes all duration items run simultaneously
    // Event items are not summed into simultaneous peak (handled separately)
    if (appliance.logic === "duration") {
      peakSimultaneousW += result.peakW;
    }

    breakdown.push({
      id: appliance.id,
      name: appliance.name,
      logic: result.logicUsed,
      whPerDay: Math.round(result.whPerDay),
      peakW: result.peakW,
    });
  }

  // Add safety buffer: 20% overhead for real-world losses
  const SAFETY_BUFFER = 1.2;
  const totalWhNeeded = Math.round(totalWhPerDay * tripDays * SAFETY_BUFFER);

  return {
    totalWhPerDay: Math.round(totalWhPerDay),
    totalWhNeeded,
    peakSimultaneousW: Math.round(peakSimultaneousW),
    safetyBufferApplied: SAFETY_BUFFER,
    breakdown,
  };
}

// ─────────────────────────────────────────────────────────────
// § 6. STATION RECOMMENDER
// ─────────────────────────────────────────────────────────────

/**
 * Filters Jackery stations that can satisfy demand.
 * Returns stations sorted by capacity (ascending) so the
 * UI can highlight the best-fit (smallest sufficient) option.
 *
 * @param {number} totalWhNeeded
 * @param {number} peakSimultaneousW
 * @returns {{ recommended: JackeryStation[], all: JackeryStation[] }}
 */
function recommendStation(totalWhNeeded, peakSimultaneousW) {
  const viable = JACKERY_LINEUP.filter(
    (s) =>
      s.capacityWh >= totalWhNeeded &&
      s.acOutputW >= peakSimultaneousW
  ).sort((a, b) => a.capacityWh - b.capacityWh);

  return {
    recommended: viable,
    bestFit: viable[0] ?? null, // smallest sufficient unit
    all: JACKERY_LINEUP,
  };
}

// ─────────────────────────────────────────────────────────────
// § 7. SOLAR RECOVERY CALCULATOR
// ─────────────────────────────────────────────────────────────

/**
 * Calculates how many Wh of recovery the chosen panel setup
 * will generate per day, factoring weather and peak sun hours.
 *
 * Formula:
 *   dailyRecoveryWh = panelWattage × panelCount × peakSunHours
 *                     × weatherCoefficient × chargeEfficiency
 *
 * @param {Object} params
 * @param {string} params.panelId           - SolarSaga panel ID
 * @param {number} params.panelCount        - Number of panels in parallel
 * @param {string} params.weatherCondition  - "sunny" | "partial" | "overcast"
 * @param {number} [params.peakSunHours]    - Override default (5h)
 * @param {number} [params.chargeEfficiency]- AC charge efficiency (default 0.85)
 * @param {JackeryStation} params.station   - Selected station (for input cap check)
 * @returns {{
 *   panelName: string,
 *   dailyRecoveryWh: number,
 *   cappedByStation: boolean,
 *   daysToFullCharge: number | null,
 *   weatherLabel: string,
 *   effectiveWatts: number
 * }}
 */
function calculateSolarRecovery({
  panelId,
  panelCount = 1,
  weatherCondition = "sunny",
  peakSunHours = DEFAULT_PEAK_SUN_HOURS,
  chargeEfficiency = 0.85,
  station,
}) {
  const panel = SOLARSAGA_PANELS.find((p) => p.id === panelId);
  // FIX: return safe zero result instead of throwing, prevents unhandled rejection
  if (!panel) {
    console.warn(`calculateSolarRecovery: unknown panel "${panelId}", returning zeros`);
    return { panelName: panelId, dailyRecoveryWh: 0, cappedByStation: false,
             daysToFullCharge: null, weatherLabel: weatherCondition,
             effectiveWatts: 0, rawEffectiveWatts: 0 };
  }

  const weatherCoefficient =
    WEATHER_COEFFICIENTS[weatherCondition] ?? WEATHER_COEFFICIENTS.sunny;

  // Raw output before station input cap
  const rawEffectiveWatts = panel.wattage * panelCount * weatherCoefficient;

  // Respect station's maximum solar input rating
  const effectiveWatts = station
    ? Math.min(rawEffectiveWatts, station.maxSolarInputW)
    : rawEffectiveWatts;

  const cappedByStation =
    station ? rawEffectiveWatts > station.maxSolarInputW : false;

  const dailyRecoveryWh = Math.round(
    effectiveWatts * peakSunHours * chargeEfficiency
  );

  // Days to charge an empty station from 0% (informational)
  const daysToFullCharge = station && dailyRecoveryWh > 0
    ? Math.ceil(station.capacityWh / dailyRecoveryWh)
    : null;

  return {
    panelName: panel.name,
    dailyRecoveryWh,
    cappedByStation,
    daysToFullCharge,
    weatherLabel: weatherCondition,
    effectiveWatts: Math.round(effectiveWatts),
    rawEffectiveWatts: Math.round(rawEffectiveWatts),
  };
}

// ─────────────────────────────────────────────────────────────
// § 8. NET BALANCE CALCULATOR
// ─────────────────────────────────────────────────────────────

/**
 * Computes whether the solar setup can sustain the trip's
 * daily load, returning a surplus/deficit figure.
 *
 * @param {number} totalWhPerDay   - From calculateTotalDemand
 * @param {number} dailyRecoveryWh - From calculateSolarRecovery
 * @param {number} stationCapacity - Selected station capacityWh
 * @returns {{ netWhPerDay: number, status: "surplus"|"balanced"|"deficit", coveragePercent: number }}
 */
function calculateNetBalance(totalWhPerDay, dailyRecoveryWh, stationCapacity) {
  const netWhPerDay = dailyRecoveryWh - totalWhPerDay;
  // FIX: guard division by zero when no appliances selected
  const coveragePercent = totalWhPerDay > 0
    ? Math.round((dailyRecoveryWh / totalWhPerDay) * 100)
    : 0;

  let status;
  if (netWhPerDay > 20) status = "surplus";
  else if (netWhPerDay >= -20) status = "balanced";
  else status = "deficit";

  return { netWhPerDay: Math.round(netWhPerDay), status, coveragePercent };
}

// ─────────────────────────────────────────────────────────────
// § 9. ARIA-LIVE REGION MANAGER
// ─────────────────────────────────────────────────────────────

/**
 * Thin wrapper around ARIA live regions.
 * Call announceToScreenReader() after any calculation update
 * to push a human-readable summary to assistive technologies.
 *
 * Expected HTML (place once in <body>):
 *   <div id="aria-polite-live"   aria-live="polite"   aria-atomic="true" class="sr-only"></div>
 *   <div id="aria-assertive-live" aria-live="assertive" aria-atomic="true" class="sr-only"></div>
 *
 * CSS for .sr-only:
 *   position: absolute; width: 1px; height: 1px;
 *   padding: 0; margin: -1px; overflow: hidden;
 *   clip: rect(0,0,0,0); white-space: nowrap; border: 0;
 */
const AriaLive = {
  _politeEl: null,
  _assertiveEl: null,

  /** Must be called after DOM is ready (DOMContentLoaded). */
  init() {
    this._politeEl    = document.getElementById("aria-polite-live");
    this._assertiveEl = document.getElementById("aria-assertive-live");
  },

  /**
   * @param {string} message
   * @param {"polite"|"assertive"} [urgency="polite"]
   */
  announce(message, urgency = "polite") {
    const el = urgency === "assertive" ? this._assertiveEl : this._politeEl;
    if (!el) {
      console.warn("AriaLive.init() has not been called or elements not found.");
      return;
    }
    // Wipe then re-set so screen readers re-announce identical messages
    el.textContent = "";
    requestAnimationFrame(() => { el.textContent = message; });
  },
};

// ─────────────────────────────────────────────────────────────
// § 10. STATE MANAGER — 3-Stage Planner
// ─────────────────────────────────────────────────────────────

/**
 * Central state object. All UI events read from and write to
 * this object, then call PlannerState.compute() to recalculate.
 */
const PlannerState = {
  // ── Stage tracking ─────────────────────────────────────
  currentStage: 1, // 1 | 2 | 3

  // ── Stage 1: Gear ──────────────────────────────────────
  /** @type {Array<{ appliance: Appliance, overrides: Object }>} */
  selectedAppliances: [],
  tripDays: 1,

  // ── Stage 2: Station ───────────────────────────────────
  /** @type {JackeryStation|null} */
  selectedStation: null,

  // ── Stage 3: Solar ─────────────────────────────────────
  selectedPanelId: "solarsaga-100",
  panelCount: 1,
  weatherCondition: "sunny", // "sunny" | "partial" | "overcast"
  peakSunHours: DEFAULT_PEAK_SUN_HOURS,

  // ── Computed results (populated by compute()) ──────────
  results: {
    demand: null,       // Output of calculateTotalDemand
    stationRecs: null,  // Output of recommendStation
    solar: null,        // Output of calculateSolarRecovery
    netBalance: null,   // Output of calculateNetBalance
  },

  // ── Lifecycle ──────────────────────────────────────────

  /**
   * Run all calculations from current state.
   * Call this every time the user changes any input.
   * After computing, triggers UI render + ARIA announcement.
   */
  compute() {
    // Stage 1 calc — always runs
    this.results.demand = calculateTotalDemand(
      this.selectedAppliances,
      this.tripDays
    );

    // Stage 2 calc — only when demand is known
    if (this.results.demand) {
      this.results.stationRecs = recommendStation(
        this.results.demand.totalWhNeeded,
        this.results.demand.peakSimultaneousW
      );
    }

    // Stage 3 calc — only when station is selected
    if (this.selectedStation && this.results.demand) {
      this.results.solar = calculateSolarRecovery({
        panelId: this.selectedPanelId,
        panelCount: this.panelCount,
        weatherCondition: this.weatherCondition,
        peakSunHours: this.peakSunHours,
        station: this.selectedStation,
      });

      this.results.netBalance = calculateNetBalance(
        this.results.demand.totalWhPerDay,
        this.results.solar.dailyRecoveryWh,
        this.selectedStation.capacityWh
      );
    }

    this._notifyUI();
    this._announceResults();
  },

  /**
   * Dispatches a custom DOM event that your UI layer listens to.
   * This keeps the engine fully decoupled from rendering logic.
   */
  _notifyUI() {
    const event = new CustomEvent("planner:updated", {
      detail: { state: this },
    });
    document.dispatchEvent(event);
  },

  /**
   * Pushes a context-appropriate summary to the ARIA live region.
   * Triggered automatically at the end of compute().
   */
  _announceResults() {
    if (!this.results.demand) return;

    const { totalWhNeeded, totalWhPerDay } = this.results.demand;

    // Never announce when demand is zero — user hasn't interacted yet
    if (totalWhPerDay === 0) return;

    if (this.currentStage === 1) {
      AriaLive.announce(
        `Updated total: your gear now uses ${totalWhPerDay} watt-hours per day. ` +
        `Total needed for ${this.tripDays} day trip: ${totalWhNeeded} watt-hours.`
      );
      return;
    }

    if (this.currentStage === 2 && this.selectedStation) {
      const stationCap = this.selectedStation.capacityWh;
      const demand = totalWhNeeded;
      const remaining = stationCap - demand;
      const pct = Math.round((demand / stationCap) * 100);
      AriaLive.announce(
        `${this.selectedStation.name} selected. ` +
        `${pct}% capacity used: ${demand.toLocaleString()} watt-hours demand of ${stationCap.toLocaleString()} total. ` +
        `${remaining > 0 ? remaining.toLocaleString() + " watt-hours remaining." : "Demand meets capacity."}`
      );
      return;
    }

    if (this.currentStage === 3 && this.results.solar && this.results.netBalance) {
      const { dailyRecoveryWh } = this.results.solar;
      const { netWhPerDay, status, coveragePercent } = this.results.netBalance;
      const sign = netWhPerDay >= 0 ? "plus" : "minus";
      const absNet = Math.abs(netWhPerDay);
      const statusLabel = { surplus: "surplus", balanced: "balanced", deficit: "deficit" }[status];
      AriaLive.announce(
        `Net daily balance: ${sign} ${absNet.toLocaleString()} watt-hours. ` +
        `Solar covers ${coveragePercent}% of daily demand. Status: ${statusLabel}.`,
        status === "deficit" ? "assertive" : "polite"
      );
    }
  },

  // ── Public Mutation API (called by UI event handlers) ──

  /** Stage 1: Add an appliance to the selection */
  addAppliance(applianceId, overrides = {}) {
    const appliance = APPLIANCE_LIBRARY.find((a) => a.id === applianceId);
    if (!appliance) throw new Error(`Unknown appliance: "${applianceId}"`);
    // Prevent duplicates
    if (this.selectedAppliances.some((s) => s.appliance.id === applianceId)) return;
    this.selectedAppliances.push({ appliance, overrides });
    this.compute();
  },

  /** Stage 1: Remove an appliance */
  removeAppliance(applianceId) {
    this.selectedAppliances = this.selectedAppliances.filter(
      (s) => s.appliance.id !== applianceId
    );
    this.compute();
  },

  /** Stage 1: Update quantity/hours for an appliance */
  updateApplianceOverride(applianceId, overrides) {
    const sel = this.selectedAppliances.find((s) => s.appliance.id === applianceId);
    if (sel) {
      sel.overrides = { ...sel.overrides, ...overrides };
      this.compute();
    }
  },

  /** Stage 1: Set trip duration */
  setTripDays(days) {
    this.tripDays = Math.max(1, parseInt(days, 10));
    this.compute();
  },

  /** Stage 2: Choose a power station */
  selectStation(stationId) {
    this.selectedStation = JACKERY_LINEUP.find((s) => s.id === stationId) ?? null;
    this.compute();
  },

  /** Stage 3: Configure solar panel */
  setSolarConfig({ panelId, panelCount, weatherCondition, peakSunHours }) {
    if (panelId !== undefined) this.selectedPanelId = panelId;
    if (panelCount !== undefined) this.panelCount = Math.max(1, parseInt(panelCount, 10));
    if (weatherCondition !== undefined) this.weatherCondition = weatherCondition;
    if (peakSunHours !== undefined) this.peakSunHours = parseFloat(peakSunHours);
    this.compute();
  },

  /** Navigate between stages */
  goToStage(n) {
    if (n < 1 || n > 3) return;
    this.currentStage = n;
    this._notifyUI();
  },
};

// ─────────────────────────────────────────────────────────────
// § 11. BOOTSTRAP
// ─────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  AriaLive.init();
  PlannerState.compute(); // Seed initial (empty) state
});

// ─────────────────────────────────────────────────────────────
// § 12. PUBLIC EXPORTS (ES Module or window global)
// ─────────────────────────────────────────────────────────────

// If bundling with ESM:
// export { PlannerState, JACKERY_LINEUP, SOLARSAGA_PANELS,
//          APPLIANCE_LIBRARY, WEATHER_COEFFICIENTS,
//          calculateTotalDemand, calculateSolarRecovery,
//          calculateNetBalance, recommendStation, AriaLive };

// If using as a plain <script> tag:
window.JackeryPlanner = {
  state: PlannerState,
  data: {
    lineup: JACKERY_LINEUP,
    panels: SOLARSAGA_PANELS,
    appliances: APPLIANCE_LIBRARY,
    weatherCoefficients: WEATHER_COEFFICIENTS,
  },
  calc: {
    calculateTotalDemand,
    calculateSolarRecovery,
    calculateNetBalance,
    recommendStation,
  },
  aria: AriaLive,
};
