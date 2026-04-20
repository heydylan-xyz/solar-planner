import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { motion, AnimatePresence } from 'motion/react';
import { Battery, Sun, Zap, ChevronRight, CheckCircle2, Droplets, CloudRain, CloudSun, ShoppingCart, Award, TrendingUp, AlertCircle, UtensilsCrossed, Heart, Smartphone, Gamepad2, BatteryCharging, Bike } from 'lucide-react';

// Type definitions based on jackery-planner.js
interface JackeryStation {
  id: string;
  name: string;
  capacityWh: number;
  acOutputW: number;
  maxSolarInputW: number;
  weightKg: number;
  compatiblePanels: string[];
  priceUSD: number;
}

interface Appliance {
  id: string;
  name: string;
  category: string;
  logic: 'event' | 'duration';
  wattage: number;
  hoursPerUse?: number;
  defaultUses?: number;
  defaultHours?: number;
  efficiencyFactor: number;
}

interface PlannerResults {
  demand: {
    totalWhPerDay: number;
    totalWhNeeded: number;
    peakSimultaneousW: number;
    breakdown: any[];
  } | null;
  stationRecs: {
    recommended: JackeryStation[];
    bestFit: JackeryStation | null;
    all: JackeryStation[];
  } | null;
  solar: {
    panelName: string;
    dailyRecoveryWh: number;
    cappedByStation: boolean;
    daysToFullCharge: number | null;
    weatherLabel: string;
    effectiveWatts: number;
  } | null;
  netBalance: {
    netWhPerDay: number;
    status: 'surplus' | 'balanced' | 'deficit';
    coveragePercent: number;
  } | null;
}

declare global {
  interface Window {
    JackeryPlanner: {
      state: any;
      data: {
        appliances: Appliance[];
        lineup: JackeryStation[];
        panels: any[];
      };
    };
  }
}

export default function App() {
  const [currentStage, setCurrentStage] = useState(1);
  const [selectedCategory, setSelectedCategory] = useState<string>('Kitchen');
  const [selectedAppliances, setSelectedAppliances] = useState<Record<string, number>>({});
  const [selectedStation, setSelectedStation] = useState<string | null>(null);
  const [stationQuantity, setStationQuantity] = useState(1);
  const [panelQuantities, setPanelQuantities] = useState<Record<string, number>>({});
  const [sunIntensity, setSunIntensity] = useState(100);
  const [plannerLoaded, setPlannerLoaded] = useState(false);
  // Gate: suppress all aria-live announcements until user has interacted
  const hasInteracted = useRef(false);
  // Respect user's reduced motion OS preference
  const prefersReducedMotion = useReducedMotion();
  // Stage heading ref — receives focus on every stage transition so TalkBack
  // announces the heading then lets the user swipe through page content naturally
  const stageHeadingRef = useRef<HTMLHeadingElement>(null);
  const [results, setResults] = useState<PlannerResults>({
    demand: null,
    stationRecs: null,
    solar: null,
    netBalance: null
  });

  // Load the planner engine
  useEffect(() => {
    // Set up event listener first
    const handleUpdate = (e: any) => {
      const { state } = e.detail;
      setResults(state.results);
    };

    document.addEventListener('planner:updated', handleUpdate);

    // Check if already loaded
    if (window.JackeryPlanner) {
      // Make sure ARIA is initialized with our elements
      if (window.JackeryPlanner.aria && !window.JackeryPlanner.aria._politeEl) {
        window.JackeryPlanner.aria.init();
      }
      // Get initial state
      setResults(window.JackeryPlanner.state.results);
      setPlannerLoaded(true);
      return;
    }

    // Load and execute planner script
    const loadPlanner = async () => {
      try {
        // Import as raw text using Vite's ?raw suffix
        // @ts-ignore - Vite handles ?raw imports
        const plannerCode = await import('../imports/jackery-planner.js?raw');

        // Execute the code in global scope
        const script = document.createElement('script');
        script.textContent = plannerCode.default;
        script.type = 'text/javascript';
        document.head.appendChild(script);

        // Wait a moment for execution
        await new Promise(resolve => setTimeout(resolve, 100));

        if (window.JackeryPlanner) {
          // Initialize ARIA regions now that DOM elements exist
          if (window.JackeryPlanner.aria) {
            window.JackeryPlanner.aria.init();
          }
          if (window.JackeryPlanner.state) {
            window.JackeryPlanner.state.compute();
            // Manually set initial results since event might not fire
            setResults(window.JackeryPlanner.state.results);
          }
          setPlannerLoaded(true);
        } else {
          console.error('Planner failed to initialize');
        }

        return script;
      } catch (error) {
        console.error('Failed to load planner:', error);
        return null;
      }
    };

    let scriptElement: HTMLScriptElement | null = null;
    loadPlanner().then(script => { scriptElement = script; });

    return () => {
      document.removeEventListener('planner:updated', handleUpdate);
      if (scriptElement && document.head.contains(scriptElement)) {
        document.head.removeChild(scriptElement);
      }
    };
  }, []);

  // Initialize ARIA after planner loads
  useEffect(() => {
    if (plannerLoaded && window.JackeryPlanner && window.JackeryPlanner.aria) {
      // Ensure ARIA is initialized with the DOM elements
      const politeEl = document.getElementById('aria-polite-live');
      const assertiveEl = document.getElementById('aria-assertive-live');

      if (politeEl && assertiveEl && !window.JackeryPlanner.aria._politeEl) {
        window.JackeryPlanner.aria.init();
      }
    }
  }, [plannerLoaded]);

  // Move focus to stage heading on every navigation — critical for TalkBack/VoiceOver
  // Without this, screen readers go silent after stage transitions
  useEffect(() => {
    if (!plannerLoaded) return;
    // Small delay allows AnimatePresence to mount the new stage DOM before focus
    const timer = setTimeout(() => {
      stageHeadingRef.current?.focus();
    }, 450);
    return () => clearTimeout(timer);
  }, [currentStage, plannerLoaded]);

  // Sync with planner state
  useEffect(() => {
    if (!plannerLoaded || !window.JackeryPlanner) return;

    // Clear and re-add appliances
    window.JackeryPlanner.state.selectedAppliances = [];
    Object.entries(selectedAppliances).forEach(([id, qty]) => {
      if (qty > 0) {
        const appliance = window.JackeryPlanner.data.appliances.find((a: Appliance) => a.id === id);
        if (appliance) {
          window.JackeryPlanner.state.selectedAppliances.push({
            appliance,
            overrides: appliance.logic === 'event' ? { uses: qty } : { hours: qty }
          });
        }
      }
    });

    // Mark that the user has interacted — enables ARIA live announcements
    if (Object.keys(selectedAppliances).length > 0) {
      hasInteracted.current = true;
    }

    // Compute and manually update results
    if (selectedStation) {
      window.JackeryPlanner.state.selectStation(selectedStation);
    }
    window.JackeryPlanner.state.compute();
    setResults({ ...window.JackeryPlanner.state.results });
  }, [selectedAppliances, plannerLoaded]);

  useEffect(() => {
    if (!plannerLoaded || !window.JackeryPlanner || !selectedStation) return;
    window.JackeryPlanner.state.selectStation(selectedStation);
    setResults({ ...window.JackeryPlanner.state.results });
  }, [selectedStation, plannerLoaded]);

  // Data from planner - must be declared early
  const appliances = plannerLoaded && window.JackeryPlanner ? window.JackeryPlanner.data.appliances : [];
  const stations = plannerLoaded && window.JackeryPlanner ? window.JackeryPlanner.data.lineup : [];
  const panels = plannerLoaded && window.JackeryPlanner ? window.JackeryPlanner.data.panels : [];

  useEffect(() => {
    if (!plannerLoaded || !window.JackeryPlanner) return;

    const panelEntries = Object.entries(panelQuantities).filter(([_, qty]) => qty > 0);

    // When all panels removed, reset solar config and recompute so balance clears
    if (panelEntries.length === 0) {
      window.JackeryPlanner.state.setSolarConfig({
        panelId: 'solarsaga-100',
        panelCount: 0,
        weatherCondition: 'sunny'
      });
      setResults({ ...window.JackeryPlanner.state.results });
      return;
    }

    // Sort by wattage descending to find dominant panel model
    const sortedPanels = panelEntries
      .map(([id, qty]) => ({
        id,
        qty,
        wattage: panels.find((p: any) => p.id === id)?.wattage || 0
      }))
      .sort((a, b) => b.wattage - a.wattage);

    const dominantPanel = sortedPanels[0];

    const weatherMap: Record<number, 'sunny' | 'partial' | 'overcast'> = {
      100: 'sunny',
      50: 'partial',
      20: 'overcast'
    };
    const closest = [100, 50, 20].reduce((prev, curr) =>
      Math.abs(curr - sunIntensity) < Math.abs(prev - sunIntensity) ? curr : prev
    );

    // Sum watts across all panel types, express as virtual count of dominant panel
    const totalArrayWatts = panelEntries.reduce((sum, { id, qty }) => {
      const p = panels.find((panel: any) => panel.id === id);
      return sum + (p ? p.wattage * qty : 0);
    }, 0);
    const virtualPanelCount = dominantPanel.wattage > 0
      ? Math.round(totalArrayWatts / dominantPanel.wattage)
      : panelEntries.reduce((sum, [_, qty]) => sum + qty, 0);

    window.JackeryPlanner.state.setSolarConfig({
      panelId: dominantPanel.id,
      panelCount: virtualPanelCount,
      weatherCondition: weatherMap[closest]
    });
    setResults({ ...window.JackeryPlanner.state.results });
  }, [panelQuantities, sunIntensity, plannerLoaded, panels]);

  // Auto-select Explorer 5000 Plus for high-demand scenarios (>5kWh)
  useEffect(() => {
    if (!plannerLoaded || !window.JackeryPlanner || currentStage !== 2) return;
    if (stations.length === 0) return;

    const demand = results.demand?.totalWhNeeded || 0;
    const needsExplorer5000Plus = demand > 5000; // Hero for demand > 5kWh

    if (needsExplorer5000Plus && !selectedStation) {
      // Auto-select Explorer 5000 Plus as the hero recommendation
      const explorer5000Plus = stations.find((s: JackeryStation) => s.id === 'explorer-5000-plus');
      if (explorer5000Plus) {
        setSelectedStation('explorer-5000-plus');
        const qtyNeeded = Math.ceil(demand / explorer5000Plus.capacityWh);
        setStationQuantity(qtyNeeded);
      }
    }
  }, [currentStage, plannerLoaded, results.demand?.totalWhNeeded, stations, selectedStation]);

  const totalDemand = results.demand?.totalWhPerDay || 0;
  const totalDemandNeeded = results.demand?.totalWhNeeded || 0;
  const canProceedStage1 = totalDemand > 0;
  const canProceedStage2 = selectedStation !== null;

  // Canonical solar calc derived directly in component — never stale
  // Formula: (PanelWatts * Qty) * SunIntensity% * 5h * 0.85 efficiency
  const realTimeSolarInput = Object.entries(panelQuantities).reduce((total, [panelId, qty]) => {
    if (qty === 0) return total;
    const panel = panels.find((p: any) => p.id === panelId);
    if (!panel) return total;
    return total + (panel.wattage * qty * (sunIntensity / 100));
  }, 0);

  const totalPanelCount = Object.values(panelQuantities).reduce((sum, qty) => sum + qty, 0);

  // Derived solar values — computed fresh every render, no engine dependency
  const selectedStationObj = stations.find((s: JackeryStation) => s.id === selectedStation) || null;
  const solarDailyRecoveryWh = Math.round(
    Math.min(realTimeSolarInput, selectedStationObj?.maxSolarInputW ?? Infinity) * 5 * 0.85
  );
  const solarCappedByStation = selectedStationObj
    ? realTimeSolarInput > selectedStationObj.maxSolarInputW
    : false;
  const solarDaysToFullCharge = selectedStationObj && solarDailyRecoveryWh > 0
    ? Math.ceil((selectedStationObj.capacityWh * stationQuantity) / solarDailyRecoveryWh)
    : null;
  const netWhPerDay = solarDailyRecoveryWh - totalDemand;
  const coveragePercent = totalDemand > 0 ? Math.round((solarDailyRecoveryWh / totalDemand) * 100) : 0;
  const netStatus: 'surplus' | 'balanced' | 'deficit' =
    netWhPerDay > 20 ? 'surplus' : netWhPerDay >= -20 ? 'balanced' : 'deficit';

  // Capacity warning thresholds
  const getCapacityWarning = () => {
    if (totalDemandNeeded < 5000) return { level: 'single', text: 'Single Station', color: 'green' };
    if (totalDemandNeeded < 30000) return { level: 'expansion', text: 'Expansion Required', color: 'amber' };
    return { level: 'industrial', text: 'Industrial Scale', color: 'red' };
  };
  const capacityWarning = getCapacityWarning();

  // Category mapping
  const categoryMap: Record<string, { icon: any; appliances: string[] }> = {
    Kitchen: {
      icon: UtensilsCrossed,
      appliances: ['kettle', 'coffee-maker', 'mini-fridge', 'induction-cooktop', 'toaster', 'electric-griddle', 'blender', 'rice-cooker']
    },
    'Comfort & Health': {
      icon: Heart,
      appliances: ['cpap', 'fan', 'heater', 'ac-portable', 'led-lantern', 'electric-blanket', 'air-purifier', 'hearing-aid-charger']
    },
    Tech: {
      icon: Smartphone,
      appliances: ['laptop', 'smartphone', 'drone', 'camera-charging', 'projector', 'tablet-charging', 'walkie-talkie']
    },
    Recreation: {
      icon: Gamepad2,
      appliances: ['led-strip', 'portable-speaker', 'electric-cooler', 'gaming-console', 'outdoor-projector', 'party-lights', 'ebike-charging', 'escooter-charging', 'inflatable-pump', 'power-tool-charging', 'karaoke-machine']
    }
  };

  const categories = Object.keys(categoryMap);
  const currentCategoryAppliances = appliances.filter((a: Appliance) =>
    categoryMap[selectedCategory]?.appliances.includes(a.id)
  );

  const getWeatherIcon = () => {
    if (sunIntensity >= 75) return <Sun className="w-8 h-8" aria-hidden="true" />;
    if (sunIntensity >= 40) return <CloudSun className="w-8 h-8" aria-hidden="true" />;
    return <CloudRain className="w-8 h-8" aria-hidden="true" />;
  };

  const getWeatherLabel = () => {
    if (sunIntensity >= 75) return 'Sunny';
    if (sunIntensity >= 40) return 'Partly Cloudy';
    return 'Overcast';
  };

  return (
    <div className="min-h-screen bg-white">
      {/* ARIA Live Regions - Must be present before planner loads */}
      <div id="aria-polite-live" role="status" aria-live="polite" aria-atomic="true" className="sr-only" />
      <div id="aria-assertive-live" role="alert" aria-live="assertive" aria-atomic="true" className="sr-only" />

      {!plannerLoaded ? (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 bg-[#FF5000] rounded-2xl flex items-center justify-center mb-4 mx-auto animate-pulse">
              <Battery className="w-10 h-10 text-white" aria-hidden="true" />
            </div>
            <div className="text-xl font-semibold text-gray-600">Loading Planner...</div>
          </div>
        </div>
      ) : (
        <>

      {/* Header */}
      <header className="border-b border-[#F5F5F7] bg-white sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
          <a href="/" aria-label="Jackery Solar Planner — click to restart" className="flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-[#FF5000] rounded-lg flex items-center justify-center">
              <Battery className="w-5 h-5 sm:w-6 sm:h-6 text-white" aria-hidden="true" />
            </div>
            <h1 className="text-lg sm:text-2xl">
              Jackery Solar Planner
            </h1>
          </a>

          {/* Stage Progress */}
          <nav aria-label="Planner stages" className="flex items-center gap-1 sm:gap-2">
            {[
              { num: 1, label: 'Gear', icon: Zap },
              { num: 2, label: 'Station', icon: Battery },
              { num: 3, label: 'Solar', icon: Sun },
              { num: 4, label: 'Review', icon: ShoppingCart }
            ].map(({ num, label, icon: Icon }) => (
              <button
                key={num}
                onClick={() => setCurrentStage(num)}
                aria-current={currentStage === num ? 'step' : undefined}
                aria-label={`Stage ${num}: ${label}`}
                className={`
                  flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 rounded-lg transition-all duration-300
                  ${currentStage === num
                    ? 'bg-[#FF5000] text-white shadow-lg shadow-[#FF5000]/25'
                    : 'bg-[#F5F5F7] text-gray-700 hover:bg-gray-200'
                  }
                `}
              >
                <Icon className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline text-sm sm:text-base">{label}</span>
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Mobile Sticky Stats Bars */}
      {currentStage === 1 && (
        <div className="lg:hidden sticky top-[57px] sm:top-[65px] z-40 bg-gradient-to-r from-[#FF5000] to-[#FF8040] px-4 sm:px-6 py-3 shadow-lg border-b border-[#FF8040]">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-white" aria-hidden="true" />
              <div>
                <div className="text-xs font-medium text-white">Total Demand</div>
                <div className="text-lg font-bold text-white">
                  {totalDemand.toLocaleString()} Wh
                </div>
              </div>
            </div>
            <button
              onClick={() => canProceedStage1 && setCurrentStage(2)}
              disabled={!canProceedStage1}
              className={`px-4 py-2 rounded-lg font-semibold text-sm flex items-center gap-1 ${
                canProceedStage1
                  ? 'bg-white text-[#FF5000] shadow-md'
                  : 'bg-white/50 text-gray-600 cursor-not-allowed'
              }`}
            >
              Next
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {currentStage === 2 && (
        <>
          <div className="lg:hidden sticky top-[57px] sm:top-[65px] z-40 bg-gradient-to-r from-[#FF5000] to-[#FF8040] px-4 sm:px-6 py-3 shadow-lg border-b border-[#FF8040]">
            <div className="max-w-7xl mx-auto space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Battery className="w-5 h-5 text-white" aria-hidden="true" />
                  <div className="text-sm font-semibold text-white">
                    {selectedStation ? stations.find((s: JackeryStation) => s.id === selectedStation)?.name : 'Select Station'}
                  </div>
                </div>
                <button
                  onClick={() => canProceedStage2 && setCurrentStage(3)}
                  disabled={!canProceedStage2}
                  className={`px-4 py-2 rounded-lg font-semibold text-sm flex items-center gap-1 ${
                    canProceedStage2
                      ? 'bg-white text-[#FF5000] shadow-md'
                      : 'bg-white/50 text-gray-600 cursor-not-allowed'
                  }`}
                >
                  Next
                  <ChevronRight className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
              {selectedStation && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-medium text-white">
                    <span>Capacity Used</span>
                    <span>
                      {(Math.min(100, (results.demand?.totalWhNeeded || 0) / Math.max(1, (stations.find((s: JackeryStation) => s.id === selectedStation)?.capacityWh || 1) * stationQuantity) * 100) || 0).toFixed(0)}%
                    </span>
                  </div>
                  <div
                    className="h-2 bg-white/30 rounded-full overflow-hidden"
                    role="progressbar"
                    aria-valuenow={Math.min(100, Math.round(((results.demand?.totalWhNeeded || 0) / Math.max(1, (stations.find((s: JackeryStation) => s.id === selectedStation)?.capacityWh || 1) * stationQuantity)) * 100))}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Battery capacity used"
                  >
                    <div
                      className="h-full bg-white rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(100, ((results.demand?.totalWhNeeded || 0) / Math.max(1, (stations.find((s: JackeryStation) => s.id === selectedStation)?.capacityWh || 1) * stationQuantity)) * 100)}%`
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Capacity Warning Bar */}
          {totalDemandNeeded > 0 && (
            <div className="sticky top-[120px] sm:top-[128px] lg:top-[65px] z-40">
              <div
                className={`
                  max-w-7xl mx-auto px-4 sm:px-6 py-2.5 sm:py-3 border-b-2
                  ${capacityWarning.level === 'single'
                    ? 'bg-green-50 border-green-200'
                    : capacityWarning.level === 'expansion'
                      ? 'bg-amber-50 border-amber-200'
                      : 'bg-red-50 border-red-200'
                  }
                `}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className={`
                      w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center flex-shrink-0
                      ${capacityWarning.level === 'single'
                        ? 'bg-green-100'
                        : capacityWarning.level === 'expansion'
                          ? 'bg-amber-100'
                          : 'bg-red-100'
                      }
                    `}>
                      <BatteryCharging className={`w-4 h-4 sm:w-5 sm:h-5 ${
                        capacityWarning.level === 'single'
                          ? 'text-green-700'
                          : capacityWarning.level === 'expansion'
                            ? 'text-amber-700'
                            : 'text-red-700'
                      }`} />
                    </div>
                    <div>
                      <div className={`
                        font-bold text-sm sm:text-base
                        ${capacityWarning.level === 'single'
                          ? 'text-green-900'
                          : capacityWarning.level === 'expansion'
                            ? 'text-amber-900'
                            : 'text-red-900'
                        }
                      `}>
                        {capacityWarning.text}
                      </div>
                      <div className={`
                        text-xs sm:text-sm
                        ${capacityWarning.level === 'single'
                          ? 'text-green-800'
                          : capacityWarning.level === 'expansion'
                            ? 'text-amber-800'
                            : 'text-red-800'
                        }
                      `}>
                        {totalDemandNeeded.toLocaleString()} Wh needed
                        <span className="hidden sm:inline">
                          {capacityWarning.level === 'expansion' && ' • Multiple units recommended'}
                          {capacityWarning.level === 'industrial' && ' • Contact for industrial solutions'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className={`
                    px-2 sm:px-3 py-1 sm:py-1.5 rounded-md text-xs sm:text-sm font-semibold whitespace-nowrap
                    ${capacityWarning.level === 'single'
                      ? 'bg-green-100 text-green-800 border border-green-300'
                      : capacityWarning.level === 'expansion'
                        ? 'bg-amber-100 text-amber-800 border border-amber-300'
                        : 'bg-red-100 text-red-800 border border-red-300'
                    }
                  `}>
                    {capacityWarning.level === 'single' ? '✓ Optimal' : capacityWarning.level === 'expansion' ? '⚠ Scale Up' : '⚠ Industrial'}
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {currentStage === 3 && (
        <div className="lg:hidden sticky top-[57px] sm:top-[65px] z-40 bg-gradient-to-r from-[#FF5000] to-[#FF8040] px-4 sm:px-6 py-3 shadow-lg border-b border-[#FF8040]">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Sun className="w-5 h-5 text-white" aria-hidden="true" />
              <div>
                <div className="text-xs font-medium text-white">Net Daily Balance</div>
                <div className={`text-lg font-bold ${netWhPerDay >= 0 ? 'text-white' : 'text-red-100'}`}>
                  {netWhPerDay >= 0 ? '+' : ''}{netWhPerDay} Wh
                </div>
              </div>
            </div>
            <button
              onClick={() => setCurrentStage(4)}
              className="px-4 py-2 rounded-lg font-semibold text-sm flex items-center gap-1 bg-white text-[#FF5000] shadow-md"
            >
              Review
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 pb-6 sm:pb-12 gradient-mesh">
        <AnimatePresence mode="wait">
          {/* STAGE 1: Gear Selection */}
          {currentStage === 1 && (
            <motion.div
              key="stage-1"
              id="stage-1"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="mb-4 sm:mb-6 lg:mb-8">
                <h2
                  ref={stageHeadingRef}
                  tabIndex={-1}
                  className="text-xl sm:text-2xl lg:text-4xl mb-1 sm:mb-2 outline-none"
                  aria-label="Stage 1 of 4: Define Your Energy Needs. Select the devices you'll power."
                >
                  Define Your Energy Needs
                </h2>
                <p className="text-gray-700 text-sm sm:text-base lg:text-lg" aria-hidden="true">Select the devices you'll power</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 lg:gap-8 pb-20 lg:pb-0">
                <div className="space-y-4 lg:space-y-6">
                  {/* Category Navigation Pills */}
                  <div className="bg-white p-2 rounded-xl lg:rounded-2xl border-2 border-gray-200 shadow-sm">
                    <div className="flex gap-1.5 sm:gap-2 overflow-x-auto scrollbar-hide" role="tablist" aria-label="Appliance categories">
                      {categories.map((category) => {
                        const CategoryIcon = categoryMap[category].icon;
                        const isActive = selectedCategory === category;

                        return (
                          <button
                            key={category}
                            role="tab"
                            aria-selected={isActive}
                            aria-controls={`panel-${category}`}
                            onClick={() => setSelectedCategory(category)}
                            className={`
                              flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 lg:px-6 py-2 sm:py-2.5 lg:py-3 rounded-lg lg:rounded-xl font-semibold whitespace-nowrap transition-all duration-300 text-sm sm:text-base
                              ${isActive
                                ? 'bg-[#FF5000] text-white shadow-lg shadow-[#FF5000]/25'
                                : 'bg-transparent text-gray-700 hover:bg-gray-100'
                              }
                            `}
                          >
                            <CategoryIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                            <span className="hidden sm:inline">{category}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Device Cards Grid */}
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={selectedCategory}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      transition={{ duration: 0.3 }}
                      role="tabpanel"
                      id={`panel-${selectedCategory}`}
                      aria-label={`${selectedCategory} appliances`}
                      className="grid sm:grid-cols-2 gap-4"
                    >
                      {currentCategoryAppliances.map((appliance: Appliance, index: number) => {
                        const qty = selectedAppliances[appliance.id] || 0;
                        const isSelected = qty > 0;
                        const usageType = appliance.logic === 'event' ? 'Per Use' : 'Per Hour';
                        const isHighEnergy = appliance.wattage > 1000;

                        return (
                          <motion.div
                            key={appliance.id}
                            layout
                            role={!isSelected ? "button" : "article"}
                            tabIndex={!isSelected ? 0 : undefined}
                            aria-label={!isSelected
                              ? `Add ${appliance.name}, ${appliance.wattage} watts${isHighEnergy ? ", high energy device" : ""}`
                              : `${appliance.name} selected, ${qty} ${appliance.logic === 'event' ? 'uses' : 'hours'} per day`
                            }
                            onKeyDown={(e) => {
                              if (!isSelected && (e.key === 'Enter' || e.key === ' ')) {
                                e.preventDefault();
                                setSelectedAppliances((prev: Record<string, number>) => ({
                                  ...prev,
                                  [appliance.id]: appliance.logic === 'event' ? (appliance.defaultUses || 1) : (appliance.defaultHours || 1)
                                }));
                              }
                            }}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: index * 0.05, duration: 0.3 }}
                            whileHover={!isSelected ? { scale: 1.02, y: -4 } : {}}
                            className={`
                              relative p-4 sm:p-6 rounded-xl lg:rounded-2xl border-2 transition-all duration-300 cursor-pointer
                              ${isSelected
                                ? 'border-[#FF5000] bg-gradient-to-br from-[#FF5000]/5 to-white shadow-lg shadow-[#FF5000]/10'
                                : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-md'
                              }
                            `}
                            onClick={() => {
                              if (!isSelected) {
                                setSelectedAppliances(prev => ({
                                  ...prev,
                                  [appliance.id]: appliance.logic === 'event' ? (appliance.defaultUses || 1) : (appliance.defaultHours || 1)
                                }));
                              }
                            }}
                          >
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex-1 pr-2">
                                <h3 className="font-semibold text-base sm:text-lg mb-1">
                                  {appliance.name}
                                </h3>
                                <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm flex-wrap">
                                  <span className="text-gray-600">{appliance.wattage}W</span>
                                  <span className="text-gray-400">•</span>
                                  <span className={`px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-semibold ${isSelected ? 'bg-[#FF5000] text-white' : 'bg-gray-100 text-gray-600'}`}>
                                    {usageType}
                                  </span>
                                  {isHighEnergy && (
                                    <span className="px-1.5 sm:px-2 py-0.5 bg-red-700 text-white text-xs font-bold rounded-md">
                                      HIGH ENERGY
                                    </span>
                                  )}
                                </div>
                              </div>
                              {isSelected && (
                                <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6 text-[#FF5000] flex-shrink-0" aria-hidden="true" />
                              )}
                            </div>

                            {isSelected && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="flex items-center gap-2 sm:gap-3 pt-3 sm:pt-4 border-t-2 border-gray-100"
                              >
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const newQty = qty - 1;
                                    if (newQty === 0) {
                                      setSelectedAppliances(prev => {
                                        const next = { ...prev };
                                        delete next[appliance.id];
                                        return next;
                                      });
                                    } else {
                                      setSelectedAppliances(prev => ({ ...prev, [appliance.id]: newQty }));
                                    }
                                  }}
                                  className="w-11 h-11 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-white border-2 border-[#FF5000] text-[#FF5000] hover:bg-[#FF5000] hover:text-white flex items-center justify-center font-bold text-lg sm:text-xl transition-all"
                                  aria-label={`Decrease ${appliance.name} quantity, currently ${qty}`}
                                >
                                  −
                                </button>
                                <span
                                  className="flex-1 text-center font-bold text-sm sm:text-base lg:text-lg"
                                  id={`qty-${appliance.id}`}
                                >
                                  {qty} {appliance.logic === 'event' ? 'uses' : 'hrs'}/day
                                </span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedAppliances(prev => ({ ...prev, [appliance.id]: qty + 1 }));
                                  }}
                                  className="w-11 h-11 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-[#FF5000] text-white hover:bg-[#E64500] flex items-center justify-center font-bold text-lg sm:text-xl transition-all shadow-lg shadow-[#FF5000]/25"
                                  aria-label={`Increase ${appliance.name} quantity, currently ${qty}`}
                                >
                                  +
                                </button>
                              </motion.div>
                            )}
                          </motion.div>
                        );
                      })}
                    </motion.div>
                  </AnimatePresence>
                </div>

                {/* Demand Summary Sidebar - Hidden on Mobile */}
                <div className="hidden lg:block lg:sticky lg:top-24 h-fit">
                  <div className="bg-gradient-to-br from-gray-50 to-white p-6 lg:p-8 rounded-2xl border-2 border-gray-200 shadow-lg">
                    <h3 className="text-lg lg:text-xl font-bold mb-6 text-center">
                      Daily Demand
                    </h3>

                    <div className="mb-6 text-center">
                      <div
                        id="total-demand-wh"
                        aria-live={hasInteracted.current ? "polite" : "off"}
                        aria-atomic="true"
                        aria-label={hasInteracted.current ? `${totalDemand.toLocaleString()} watt-hours per day` : undefined}
                        className="text-4xl lg:text-5xl font-bold text-[#C93D00] mb-2"
                      >
                        {totalDemand.toLocaleString()}
                      </div>
                      <div className="text-sm lg:text-base text-gray-700">Watt-hours per day</div>
                    </div>

                    {results.demand && results.demand.breakdown.length > 0 && (
                      <div className="space-y-2 mb-6 max-h-64 overflow-y-auto">
                        {results.demand.breakdown.map((item: any) => (
                          <div key={item.id} className="flex justify-between text-sm">
                            <span className="text-gray-600">{item.name}</span>
                            <span className="font-semibold">{item.whPerDay} Wh</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <button
                      id="btn-to-stage-2"
                      onClick={() => canProceedStage1 && setCurrentStage(2)}
                      disabled={!canProceedStage1}
                      className={`
                        w-full py-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all duration-300
                        ${canProceedStage1
                          ? 'bg-[#FF5000] text-white hover:bg-[#E64500] shadow-lg shadow-[#FF5000]/25 hover:shadow-xl hover:shadow-[#FF5000]/30'
                          : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        }
                      `}
                    >
                      Next: Choose Station
                      <ChevronRight className="w-5 h-5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* STAGE 2: Power Station Selection */}
          {currentStage === 2 && (
            <motion.div
              key="stage-2"
              id="stage-2"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="mb-4 sm:mb-6 lg:mb-8">
                <h2
                  ref={stageHeadingRef}
                  tabIndex={-1}
                  className="text-xl sm:text-2xl lg:text-4xl mb-1 sm:mb-2 outline-none"
                  aria-label={`Stage 2 of 4: Choose Your Power Station. You need ${results.demand?.totalWhNeeded || 0} watt-hours of capacity.`}
                >
                  Choose Your Power Station
                </h2>
                <p className="text-gray-700 text-xs sm:text-sm lg:text-base" aria-hidden="true">
                  Need: {results.demand?.totalWhNeeded || 0} Wh capacity
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4 lg:gap-8">
                {/* Station Cards */}
                <div className="space-y-4 lg:space-y-6">
                  {(() => {
                    // Split stations into recommended and secondary
                    const demand = results.demand?.totalWhNeeded || 0;

                    // Custom logic: any station that can meet demand (single or multi-unit) is recommended
                    const recommendedStations = stations.filter((s: JackeryStation) => {
                      // Explorer 5000 Plus is always recommended for demand > 5kWh
                      if (demand > 5000 && s.id === 'explorer-5000-plus') return true;

                      // Otherwise, check if it's in the planner's recommended list
                      return (results.stationRecs?.recommended || []).some((rec: JackeryStation) => rec.id === s.id);
                    });

                    const secondaryStations = stations.filter((s: JackeryStation) =>
                      !recommendedStations.some((rec: JackeryStation) => rec.id === s.id)
                    );

                    const renderStation = (station: JackeryStation) => {
                      const isSelected = selectedStation === station.id;
                      const demand = results.demand?.totalWhNeeded || 0;

                      // A station is viable if it's in recommended list OR if it's Explorer 5000 Plus with demand > 5kWh
                      const isViable = (results.stationRecs?.recommended || []).some((s: JackeryStation) => s.id === station.id) ||
                                      (demand > 5000 && station.id === 'explorer-5000-plus');
                      const isBestFit = results.stationRecs?.bestFit?.id === station.id;

                      // Calculate quantity needed for this station
                      const qtyNeeded = Math.ceil((results.demand?.totalWhNeeded || 0) / station.capacityWh);
                      const effectiveQuantity = isSelected ? stationQuantity : qtyNeeded;
                      const combinedCapacity = station.capacityWh * effectiveQuantity;
                      const capacityPercent = Math.min(100, ((results.demand?.totalWhNeeded || 0) / combinedCapacity) * 100);

                      // Explorer 5000 Plus is hero for demand > 5kWh
                      const isHeroRecommendation = demand > 5000 && station.id === 'explorer-5000-plus';

                      return (
                      <motion.div
                        key={station.id}
                        layout
                        onClick={() => {
                          if (isViable) {
                            setSelectedStation(station.id);
                            // Set quantity to recommended amount if switching stations
                            if (selectedStation !== station.id) {
                              setStationQuantity(qtyNeeded);
                            }
                          }
                        }}
                        data-station-id={station.id}
                        data-viable={isViable}
                        aria-disabled={!isViable}
                        role="button"
                        aria-pressed={isSelected}
                        tabIndex={isViable ? 0 : -1}
                        onKeyDown={(e) => {
                          if ((e.key === 'Enter' || e.key === ' ') && isViable) {
                            e.preventDefault();
                            setSelectedStation(station.id);
                            if (selectedStation !== station.id) {
                              setStationQuantity(qtyNeeded);
                            }
                          }
                        }}
                        className={`
                          w-full p-4 sm:p-6 rounded-xl lg:rounded-2xl border-2 text-left transition-all duration-300
                          ${isSelected
                            ? 'border-[#FF5000] bg-[#FF5000]/5 shadow-xl shadow-[#FF5000]/20'
                            : isViable
                              ? 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-lg cursor-pointer'
                              : 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
                          }
                        `}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between mb-4 gap-3">
                          <div className="flex-1">
                            <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-1">
                              <h3 className="text-lg sm:text-xl lg:text-2xl font-bold">
                                {station.name}
                              </h3>
                              {/* Qty Needed Badge */}
                              {qtyNeeded > 1 && !isSelected && (
                                <span className="px-2 sm:px-3 py-1 bg-[#FF5000] text-white text-xs sm:text-sm rounded-full font-semibold w-fit">
                                  Qty: {qtyNeeded}
                                </span>
                              )}
                            </div>
                            <p className="text-sm sm:text-base text-gray-600">{station.capacityWh.toLocaleString()} Wh · {station.acOutputW}W</p>

                            {/* Quantity Display for Selected Station */}
                            {isSelected && station.id === 'explorer-5000-plus' && stationQuantity > 1 && (
                              <div className="mt-2 text-xs sm:text-sm font-semibold text-[#FF5000]">
                                1x Hub + {stationQuantity - 1}x Expansion Pack{stationQuantity > 2 ? 's' : ''}
                              </div>
                            )}
                            {isSelected && station.id !== 'explorer-5000-plus' && stationQuantity > 1 && (
                              <div className="mt-2 text-xs sm:text-sm font-semibold text-[#FF5000]">
                                Qty: {stationQuantity}
                              </div>
                            )}
                          </div>
                          <div className="flex sm:flex-col items-center sm:items-end gap-2">
                            <div className="text-xl sm:text-2xl font-bold">
                              ${station.priceUSD.toLocaleString()}
                            </div>
                            {(isBestFit || isHeroRecommendation) && (
                              <span className="px-2 sm:px-3 py-1 bg-[#FF5000] text-white text-xs sm:text-sm rounded-full font-semibold whitespace-nowrap">
                                {isHeroRecommendation ? 'Rec. Hub' : 'Best Fit'}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Capacity Bar */}
                        <div className="mb-3">
                          <div className="flex justify-between text-sm text-gray-600 mb-2">
                            <span>Your Demand: {(results.demand?.totalWhNeeded || 0).toLocaleString()} Wh</span>
                            <span>
                              {effectiveQuantity > 1 ? `${effectiveQuantity} units: ` : ''}
                              {combinedCapacity.toLocaleString()} Wh
                            </span>
                          </div>
                          <div
                            className="h-3 bg-gray-100 rounded-full overflow-hidden"
                            role="progressbar"
                            aria-valuenow={capacityPercent}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-label={`${station.name} capacity usage: ${capacityPercent}%`}
                          >
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${capacityPercent}%` }}
                              transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 }}
                              className={`h-full rounded-full ${isViable ? 'bg-[#FF5000]' : 'bg-gray-300'}`}
                            />
                          </div>
                        </div>

                        <div className="flex gap-4 text-sm text-gray-600 mb-4">
                          <span>{station.weightKg} kg</span>
                          <span>•</span>
                          <span>Max {station.maxSolarInputW}W solar input</span>
                        </div>

                        {/* Quantity Stepper for Selected Station */}
                        {isSelected && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center gap-3 pt-4 border-t-2 border-gray-100"
                          >
                            <button
                              onClick={() => setStationQuantity(Math.max(qtyNeeded, stationQuantity - 1))}
                              disabled={stationQuantity <= qtyNeeded}
                              className={`min-w-[44px] min-h-[44px] w-11 h-11 rounded-xl flex items-center justify-center font-bold text-xl transition-all ${
                                stationQuantity <= qtyNeeded
                                  ? 'bg-gray-100 border-2 border-gray-300 text-gray-400 cursor-not-allowed'
                                  : 'bg-white border-2 border-[#FF5000] text-[#FF5000] hover:bg-[#FF5000] hover:text-white'
                              }`}
                              aria-label="Decrease station quantity"
                            >
                              −
                            </button>
                            <div className="flex-1 text-center px-2">
                              {station.id === 'explorer-5000-plus' ? (
                                <div className="text-xs sm:text-sm font-semibold text-[#FF5000]">
                                  Current Setup:
                                  <div className="text-sm sm:text-base mt-1">
                                    1x Hub + {stationQuantity - 1}x Expansion Pack{stationQuantity > 2 ? 's' : ''}
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <div className="text-xl sm:text-2xl font-bold text-[#FF5000]">
                                    {stationQuantity}
                                  </div>
                                  <div className="text-xs text-gray-500">stations</div>
                                </>
                              )}
                            </div>
                            <button
                              onClick={() => setStationQuantity(stationQuantity + 1)}
                              className="min-w-[44px] min-h-[44px] w-11 h-11 rounded-xl bg-[#FF5000] text-white hover:bg-[#E64500] flex items-center justify-center font-bold text-xl transition-all shadow-lg shadow-[#FF5000]/25"
                              aria-label="Increase station quantity"
                            >
                              +
                            </button>
                          </div>
                        )}
                      </motion.div>
                      );
                    };

                    return (
                      <>
                        {/* Recommended Systems */}
                        {recommendedStations.length > 0 && (
                          <div className="space-y-4">
                            <div className="mb-6">
                              <h3 className="text-lg font-bold text-gray-900 mb-1">
                                Recommended Systems
                              </h3>
                              <p className="text-sm text-gray-600">
                                These configurations meet your {(results.demand?.totalWhNeeded || 0).toLocaleString()} Wh demand
                              </p>
                            </div>
                            {recommendedStations.map(renderStation)}
                          </div>
                        )}

                        {/* Secondary Options */}
                        {secondaryStations.length > 0 && (
                          <div className="space-y-4">
                            <div className="flex items-center gap-3 mt-8">
                              <div className="h-px flex-1 bg-gray-200" />
                              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                                Secondary Options
                              </h3>
                              <div className="h-px flex-1 bg-gray-200" />
                            </div>
                            {secondaryStations.map(renderStation)}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>

                {/* Battery Visualizer - Hidden on Mobile */}
                <div className="hidden lg:block lg:sticky lg:top-24 h-fit">
                  <div className="bg-gradient-to-br from-gray-50 to-white p-6 lg:p-8 rounded-2xl border-2 border-gray-200 shadow-lg">
                    <h3 className="text-lg lg:text-xl font-bold mb-6 text-center">
                      {selectedStation && stationQuantity > 1 ? 'Combined System Capacity' : 'Battery Capacity'}
                    </h3>

                    <div
                      id="battery-container"
                      className={`relative w-40 h-80 mx-auto mb-6 border-4 border-gray-800 rounded-2xl overflow-hidden bg-white transition-all duration-500 ${selectedStation ? 'battery-glow' : ''}`}
                      style={{ borderTopLeftRadius: '1rem', borderTopRightRadius: '1rem' }}
                    >
                      {/* Battery Terminal */}
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-16 h-3 bg-gray-800 rounded-t-lg" />

                      {/* Battery Fill */}
                      <motion.div
                        id="battery-fill"
                        initial={{ height: '0%' }}
                        animate={{
                          height: selectedStation
                            ? `${Math.min(100, ((results.demand?.totalWhNeeded || 0) / Math.max(1, (stations.find((s: JackeryStation) => s.id === selectedStation)?.capacityWh || 1) * stationQuantity)) * 100)}%`
                            : '0%'
                        }}
                        transition={{ duration: 1, ease: 'easeOut' }}
                        className="absolute bottom-0 w-full bg-gradient-to-t from-[#FF5000] to-[#FF8040]"
                        style={{ animation: selectedStation ? 'batteryPulse 2s ease-in-out infinite' : 'none' }}
                      />

                      {/* Capacity Labels */}
                      {selectedStation && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-center z-10 pointer-events-none">
                          <div className="bg-white/95 backdrop-blur-sm px-4 py-3 rounded-xl shadow-lg">
                            <div className="text-3xl font-bold text-[#FF5000]">
                              {(Math.min(100, (results.demand?.totalWhNeeded || 0) / Math.max(1, (stations.find((s: JackeryStation) => s.id === selectedStation)?.capacityWh || 1) * stationQuantity) * 100) || 0).toFixed(0)}%
                            </div>
                            <div className="text-sm text-gray-600">used</div>
                          </div>
                        </div>
                      )}
                    </div>

                    {selectedStation && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-center space-y-2 mb-6"
                      >
                        <div className="text-sm text-gray-600">Selected Station</div>
                        <div className="text-xl font-bold">
                          {stations.find((s: JackeryStation) => s.id === selectedStation)?.name}
                        </div>
                        {stationQuantity > 1 && (
                          <div className="text-sm font-semibold text-[#FF5000]">
                            {selectedStation === 'explorer-5000-plus'
                              ? `1x Hub + ${stationQuantity - 1}x Expansion Pack${stationQuantity > 2 ? 's' : ''}`
                              : `${stationQuantity}x Units`
                            }
                          </div>
                        )}
                      </motion.div>
                    )}

                    <button
                      id="btn-to-stage-3"
                      onClick={() => canProceedStage2 && setCurrentStage(3)}
                      disabled={!canProceedStage2}
                      className={`
                        w-full py-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all duration-300
                        ${canProceedStage2
                          ? 'bg-[#FF5000] text-white hover:bg-[#E64500] shadow-lg shadow-[#FF5000]/25 hover:shadow-xl hover:shadow-[#FF5000]/30'
                          : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        }
                      `}
                    >
                      Next: Configure Solar
                      <ChevronRight className="w-5 h-5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* STAGE 3: Solar Recovery */}
          {currentStage === 3 && (
            <motion.div
              key="stage-3"
              id="stage-3"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="mb-4 sm:mb-6 lg:mb-8">
                <h2
                  ref={stageHeadingRef}
                  tabIndex={-1}
                  className="text-xl sm:text-2xl lg:text-4xl mb-1 sm:mb-2 outline-none"
                  aria-label="Stage 3 of 4: Plan Your Solar Recovery. Select your SolarSaga panels and configure your setup."
                >
                  Plan Your Solar Recovery
                </h2>
                <p className="text-gray-700 text-xs sm:text-sm lg:text-base" aria-hidden="true">Select your SolarSaga panels and configure your setup</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4 lg:gap-8">
                {/* Left Column: Sun Intensity + Panel Grid */}
                <div className="space-y-4 lg:space-y-6">
                  {/* Sun Intensity Slider */}
                  <div className="bg-gradient-to-br from-amber-50 to-orange-50 p-4 sm:p-6 lg:p-8 rounded-xl lg:rounded-2xl border-2 border-amber-200 shadow-lg">
                    <div className="flex items-center justify-between mb-3 sm:mb-4">
                      <h3 className="text-lg sm:text-xl lg:text-2xl font-bold">
                        Sun Intensity
                      </h3>
                      <motion.div
                        id="weather-icon"
                        animate={{ rotate: sunIntensity >= 75 ? 360 : 0, scale: sunIntensity >= 75 ? 1.1 : 1 }}
                        transition={{ duration: 0.8 }}
                        className="text-amber-500"
                      >
                        {getWeatherIcon()}
                      </motion.div>
                    </div>

                    <div className="flex justify-between mb-3 text-xs lg:text-sm">
                      <span className="font-semibold text-gray-600">Overcast</span>
                      <span className="font-semibold text-gray-600">Partial</span>
                      <span className="font-semibold text-gray-600">Full Sun</span>
                    </div>

                    <input
                      id="sun-intensity"
                      type="range"
                      min="0"
                      max="100"
                      value={sunIntensity}
                      aria-label="Sun intensity"
                      aria-valuetext={`${sunIntensity}% — ${getWeatherLabel()}`}
                      onChange={(e) => setSunIntensity(parseInt(e.target.value))}
                      className="w-full h-4 rounded-full appearance-none cursor-pointer"
                      style={{
                        background: `linear-gradient(to right, #FF5000 0%, #FF5000 ${sunIntensity}%, #e5e7eb ${sunIntensity}%, #e5e7eb 100%)`
                      }}
                    />

                    <div className="mt-3 text-center">
                      <span className="text-2xl font-bold text-[#FF5000]">
                        {sunIntensity}%
                      </span>
                      <span className="text-sm text-gray-600 ml-2">· {getWeatherLabel()}</span>
                    </div>
                  </div>

                  {/* Panel Selection Grid */}
                  <div className="bg-white p-4 sm:p-6 lg:p-8 rounded-xl lg:rounded-2xl border-2 border-gray-200 shadow-lg">
                    <h3 className="text-lg sm:text-xl lg:text-2xl font-bold mb-3 sm:mb-4">
                      SolarSaga Panel Selection
                    </h3>
                    <p className="text-sm text-gray-600 mb-4 sm:mb-6">Choose the panels that fit your portable power needs</p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    {panels.map((panel: any) => {
                      const qty = panelQuantities[panel.id] || 0;
                      const isSelected = qty > 0;
                      const cardId = `panel-card-${panel.wattage}`;

                      return (
                        <motion.div
                          key={panel.id}
                          id={cardId}
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className={`
                            p-4 sm:p-6 rounded-2xl border-2 transition-all duration-300
                            ${isSelected
                              ? 'border-[#FF5000] bg-gradient-to-br from-[#FF5000]/10 to-white shadow-lg shadow-[#FF5000]/20'
                              : 'border-gray-200 bg-white'
                            }
                          `}
                        >
                          <div className="flex items-start justify-between mb-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 sm:gap-3 mb-2">
                                <Sun className={`w-8 h-8 sm:w-10 sm:h-10 ${isSelected ? 'text-[#FF5000]' : 'text-gray-400'}`} />
                                <div className="text-2xl sm:text-3xl font-bold" style={{ color: isSelected ? '#FF5000' : '#1a1a1a' }}>
                                  {panel.wattage}W
                                </div>
                              </div>
                              <div className="text-sm text-gray-600 mb-1">{panel.name}</div>
                              <div className="flex items-center gap-2 text-xs text-gray-500">
                                <span>{panel.weightKg} kg per panel</span>
                                <span className="text-gray-300">•</span>
                                <span className="font-semibold text-gray-700">${(panel.priceUSD || 0).toLocaleString()} each</span>
                              </div>
                            </div>
                            {isSelected && (
                              <CheckCircle2 className="w-6 h-6 text-[#FF5000] flex-shrink-0" aria-hidden="true" />
                            )}
                          </div>

                          {/* Individual Quantity Stepper */}
                          <div className="flex items-center gap-3 pt-4 border-t-2 border-gray-100">
                            <button
                              onClick={() => {
                                const newQty = Math.max(0, qty - 1);
                                setPanelQuantities(prev => ({ ...prev, [panel.id]: newQty }));
                              }}
                              className="min-w-[44px] min-h-[44px] w-11 h-11 rounded-xl bg-white border-2 border-gray-300 hover:border-[#FF5000] hover:bg-[#FF5000]/5 flex items-center justify-center font-bold text-xl transition-all"
                              aria-label={`Decrease ${panel.name} quantity`}
                            >
                              −
                            </button>
                            <div className="flex-1 text-center">
                              <div className="text-2xl sm:text-3xl font-bold text-[#FF5000]">
                                {qty}
                              </div>
                              <div className="text-xs text-gray-500">panels</div>
                            </div>
                            <button
                              onClick={() => {
                                setPanelQuantities(prev => ({ ...prev, [panel.id]: qty + 1 }));
                              }}
                              className="min-w-[44px] min-h-[44px] w-11 h-11 rounded-xl bg-[#FF5000] text-white hover:bg-[#E64500] flex items-center justify-center font-bold text-xl transition-all shadow-lg shadow-[#FF5000]/25"
                              aria-label={`Increase ${panel.name} quantity`}
                            >
                              +
                            </button>
                          </div>

                          {/* Total wattage + price for this panel type */}
                          {isSelected && (
                            <div className="mt-3 pt-3 border-t border-gray-200 flex justify-between items-center text-sm">
                              <span className="text-gray-600">{qty * panel.wattage}W total</span>
                              <span className="font-bold text-[#FF5000]">
                                ${((panel.priceUSD || 0) * qty).toLocaleString()}
                              </span>
                            </div>
                          )}
                        </motion.div>
                      );
                    })}
                  </div>

                    {/* Total Panel Summary */}
                    {totalPanelCount > 0 && (
                      <div className="mt-6 p-4 bg-gray-50 rounded-xl flex items-center justify-between">
                        <div className="font-semibold text-gray-700">Total Panels Selected:</div>
                        <div className="text-2xl font-bold text-[#FF5000]" id="panel-qty">
                          {totalPanelCount}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Sidebar: Solar Generation & Energy Balance - Hidden on Mobile */}
                <div className="hidden lg:block lg:sticky lg:top-24 h-fit space-y-3 sm:space-y-4">
                  <div className="bg-gradient-to-br from-gray-50 to-white p-4 sm:p-6 lg:p-8 rounded-xl lg:rounded-2xl border-2 border-gray-200 shadow-lg">
                    <h3 className="text-base sm:text-lg lg:text-xl font-bold mb-4 sm:mb-6 text-center">
                      Solar Generation
                    </h3>

                    <div className="text-center mb-4 sm:mb-6">
                      <div className="text-xs sm:text-sm text-gray-600 mb-2">Current Output</div>
                      <div
                        id="solar-input-watts"
                        className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#FF5000]"
                      >
                        {Math.round(realTimeSolarInput)}W
                      </div>
                      <div className="text-xs text-gray-500 mt-1">at {sunIntensity}% sun intensity</div>
                    </div>

                    <div className="space-y-2 sm:space-y-3 p-3 sm:p-4 bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg sm:rounded-xl border border-green-200">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Daily Recovery</span>
                        <span className="text-lg font-bold text-green-700">
                          {solarDailyRecoveryWh} Wh
                        </span>
                      </div>
                      {solarDaysToFullCharge && (
                        <div className="flex justify-between items-center pt-3 border-t border-green-200">
                          <span className="text-sm text-gray-600">Full Charge Time</span>
                          <span className="text-lg font-bold text-[#FF5000]">
                            {solarDaysToFullCharge} days
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Energy Balance */}
                  {totalPanelCount > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`
                        p-4 sm:p-6 lg:p-8 rounded-xl lg:rounded-2xl border-2 shadow-lg
                        ${netStatus === 'surplus'
                          ? 'bg-gradient-to-br from-green-50 to-emerald-50 border-green-300'
                          : netStatus === 'balanced'
                            ? 'bg-gradient-to-br from-blue-50 to-sky-50 border-blue-300'
                            : 'bg-gradient-to-br from-red-50 to-rose-50 border-red-300'
                        }
                      `}
                    >
                      <h3 className="text-base sm:text-lg lg:text-xl font-bold mb-3 sm:mb-4 text-center">
                        Energy Balance
                      </h3>

                      <div className="space-y-2 sm:space-y-3">
                        <div className="flex items-center justify-between p-2 sm:p-3 bg-white/70 rounded-lg text-sm sm:text-base">
                          <span className="text-xs sm:text-sm text-gray-600">Status</span>
                          <span className="text-base sm:text-lg font-bold capitalize">
                            {netStatus}
                          </span>
                        </div>
                        <div className="flex items-center justify-between p-2 sm:p-3 bg-white/70 rounded-lg text-sm sm:text-base">
                          <span className="text-xs sm:text-sm text-gray-600">Coverage</span>
                          <span className="text-base sm:text-lg font-bold">
                            {coveragePercent}%
                          </span>
                        </div>
                        <div className="flex items-center justify-between p-2 sm:p-3 bg-white/70 rounded-lg text-sm sm:text-base">
                          <span className="text-xs sm:text-sm text-gray-600">Net Daily Balance</span>
                          <span
                            className={`text-lg font-bold ${netWhPerDay >= 0 ? 'text-green-600' : 'text-red-600'}`}
                          >
                            {netWhPerDay >= 0 ? '+' : ''}{netWhPerDay} Wh
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* Next to Review Button */}
                  <motion.button
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    onClick={() => setCurrentStage(4)}
                    className="w-full mt-6 py-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all duration-300 bg-[#FF5000] text-white hover:bg-[#E64500] shadow-lg shadow-[#FF5000]/25 hover:shadow-xl hover:shadow-[#FF5000]/30"
                  >
                    Review System
                    <ChevronRight className="w-5 h-5" aria-hidden="true" />
                  </motion.button>
                </div>
              </div>
            </motion.div>
          )}

          {/* STAGE 4: System Review & Checkout */}
          {currentStage === 4 && (
            <motion.div
              key="stage-4"
              id="stage-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="mb-6 sm:mb-8">
                <h2
                  ref={stageHeadingRef}
                  tabIndex={-1}
                  className="text-2xl sm:text-3xl lg:text-4xl mb-2 outline-none"
                  aria-label="Stage 4 of 4: System Review and Checkout. Your complete solar power solution."
                >
                  System Review & Checkout
                </h2>
                <p className="text-gray-700 text-base sm:text-lg" aria-hidden="true">Your complete solar power solution</p>
              </div>

              <div className="max-w-4xl mx-auto">
                {/* Digital Receipt Container */}
                <div className="bg-white rounded-2xl border-2 border-gray-200 shadow-xl overflow-hidden">

                  {/* Header Badge */}
                  <div className="bg-gradient-to-r from-[#FF5000] to-[#FF8040] px-4 sm:px-8 py-4 sm:py-6 text-white">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-xl sm:text-2xl font-bold mb-1">
                          Complete System
                        </h3>
                        <p className="text-sm sm:text-base text-white/90">Ready to power your adventure</p>
                      </div>
                      <Award className="w-10 h-10 sm:w-12 sm:h-12 text-white/90" aria-hidden="true" />
                    </div>
                  </div>

                  {/* Hardware Summary */}
                  <div className="p-4 sm:p-8 border-b-2 border-gray-100">
                    <h4 className="text-xl font-bold mb-4 flex items-center gap-2">
                      <Battery className="w-5 h-5 text-[#FF5000]" />
                      Hardware Summary
                    </h4>

                    <div id="review-manifest" className="space-y-4">
                      {/* Selected Appliances */}
                      {results.demand && results.demand.breakdown.length > 0 && (
                        <div className="bg-gray-50 rounded-xl p-4">
                          <div className="text-sm font-semibold text-gray-600 mb-3">Selected Gear ({results.demand.breakdown.length} items)</div>
                          <div className="space-y-2">
                            {results.demand.breakdown.map((item: any) => (
                              <div key={item.id} className="flex justify-between items-center text-sm">
                                <span className="text-gray-700">{item.name}</span>
                                <span className="font-semibold text-gray-900">{item.whPerDay} Wh/day</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Power Station */}
                      {selectedStation && (
                        <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-xl p-4 border-2 border-[#FF5000]/20">
                          <div className="text-sm font-semibold text-[#FF5000] mb-3">Power Station</div>
                          {selectedStation === 'explorer-5000-plus' && stationQuantity > 1 ? (
                            <div className="space-y-2">
                              {/* Hub */}
                              <div className="flex justify-between items-center">
                                <div className="flex items-center gap-2">
                                  <Battery className="w-5 h-5 text-[#FF5000]" />
                                  <span className="font-semibold">1x {stations.find((s: JackeryStation) => s.id === selectedStation)?.name} (Hub)</span>
                                </div>
                                <span className="text-sm text-gray-600">
                                  {(stations.find((s: JackeryStation) => s.id === selectedStation)?.capacityWh || 0).toLocaleString()} Wh
                                </span>
                              </div>
                              {/* Expansion Packs */}
                              <div className="flex justify-between items-center">
                                <div className="flex items-center gap-2">
                                  <Battery className="w-5 h-5 text-amber-500" />
                                  <span className="font-semibold">{stationQuantity - 1}x Expansion Pack{stationQuantity > 2 ? 's' : ''}</span>
                                </div>
                                <span className="text-sm text-gray-600">
                                  {((stations.find((s: JackeryStation) => s.id === selectedStation)?.capacityWh || 0) * (stationQuantity - 1)).toLocaleString()} Wh
                                </span>
                              </div>
                              {/* Total */}
                              <div className="pt-2 border-t border-[#FF5000]/20 flex justify-between items-center">
                                <span className="text-sm font-semibold">Total Capacity:</span>
                                <span className="text-lg font-bold text-[#FF5000]">
                                  {((stations.find((s: JackeryStation) => s.id === selectedStation)?.capacityWh || 0) * stationQuantity).toLocaleString()} Wh
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <div className="font-bold text-lg mb-1">
                                  {stationQuantity}x {stations.find((s: JackeryStation) => s.id === selectedStation)?.name}
                                </div>
                                <div className="text-sm text-gray-600">
                                  {((stations.find((s: JackeryStation) => s.id === selectedStation)?.capacityWh || 0) * stationQuantity).toLocaleString()} Wh Total Capacity
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-2xl font-bold text-[#FF5000]">
                                  ${(selectedStation === 'explorer-5000-plus' && stationQuantity > 1
                            ? (stations.find((s: JackeryStation) => s.id === selectedStation)?.priceUSD || 0) + ((stationQuantity - 1) * 2999)
                            : ((stations.find((s: JackeryStation) => s.id === selectedStation)?.priceUSD || 0) * stationQuantity)
                          ).toLocaleString()}
                                </div>
                                <div className="text-xs text-gray-500">
                                  ${(stations.find((s: JackeryStation) => s.id === selectedStation)?.priceUSD || 0).toLocaleString()} each
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Solar Panels */}
                      {totalPanelCount > 0 && (
                        <div className="bg-gradient-to-br from-blue-50 to-sky-50 rounded-xl p-4 border-2 border-blue-200">
                          <div className="text-sm font-semibold text-blue-700 mb-2">Solar Array ({totalPanelCount} panels)</div>
                          <div className="space-y-2">
                            {Object.entries(panelQuantities)
                              .filter(([_, qty]) => qty > 0)
                              .map(([panelId, qty]) => {
                                const panel = panels.find((p: any) => p.id === panelId);
                                if (!panel) return null;
                                return (
                                  <div key={panelId} className="flex justify-between items-center">
                                    <div className="flex items-center gap-2">
                                      <Sun className="w-5 h-5 text-amber-500" />
                                      <span className="font-semibold">{qty}x {panel.name}</span>
                                    </div>
                                    <div className="flex items-center gap-3 text-sm">
                                      <span className="text-gray-500">{qty * panel.wattage}W</span>
                                      <span className="font-semibold text-gray-900">${((panel.priceUSD || 0) * qty).toLocaleString()}</span>
                                    </div>
                                  </div>
                                );
                              })}
                            <div className="pt-2 border-t border-blue-200 flex justify-between items-center">
                              <span className="text-sm font-semibold">Total Generation:</span>
                              <span className="text-sm font-bold text-blue-700">{Math.round(realTimeSolarInput)}W</span>
                            </div>
                            <div className="pt-1 flex justify-between items-center">
                              <span className="text-sm font-semibold">Panel Subtotal:</span>
                              <span className="text-sm font-bold text-gray-900">
                                ${Object.entries(panelQuantities).reduce((sum, [pid, pqty]) => {
                                  const p = panels.find((pl: any) => pl.id === pid);
                                  return sum + (p?.priceUSD || 0) * pqty;
                                }, 0).toLocaleString()}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Energy Capability */}
                  <div className="p-4 sm:p-8 border-b-2 border-gray-100">
                    <h4 className="text-lg sm:text-xl font-bold mb-4 flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-[#FF5000]" />
                      Energy Capability
                    </h4>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="bg-gradient-to-br from-gray-50 to-white p-4 rounded-xl border border-gray-200">
                        <div className="text-sm text-gray-600 mb-1">Daily Demand</div>
                        <div className="text-2xl sm:text-3xl font-bold text-gray-900">
                          {results.demand?.totalWhPerDay || 0}
                        </div>
                        <div className="text-xs text-gray-500">Wh/day</div>
                      </div>

                      <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-4 rounded-xl border border-green-200">
                        <div className="text-sm text-gray-600 mb-1">Solar Recovery</div>
                        <div className="text-2xl sm:text-3xl font-bold text-green-700">
                          {solarDailyRecoveryWh}
                        </div>
                        <div className="text-xs text-gray-500">Wh/day</div>
                      </div>

                      <div className="bg-gradient-to-br from-blue-50 to-sky-50 p-4 rounded-xl border border-blue-200">
                        <div className="text-sm text-gray-600 mb-1">Net Balance</div>
                        <div className={`text-2xl sm:text-3xl font-bold ${netWhPerDay >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {netWhPerDay >= 0 ? '+' : ''}{netWhPerDay}
                        </div>
                        <div className="text-xs text-gray-500">Wh/day</div>
                      </div>
                    </div>
                  </div>

                  {/* System Health */}
                  <div className="p-4 sm:p-8">
                    <h4 className="text-lg sm:text-xl font-bold mb-4 flex items-center gap-2">
                      <Award className="w-5 h-5 text-[#FF5000]" />
                      System Health
                    </h4>

                    <div className="space-y-3">
                      {/* Compatibility Badge */}
                      <div id="compatibility-badge" className="flex items-center justify-between p-4 bg-green-50 rounded-xl border-2 border-green-200">
                        <div className="flex items-center gap-3">
                          <CheckCircle2 className="w-6 h-6 text-green-600" />
                          <div>
                            <div className="font-semibold text-green-900">Fully Compatible</div>
                            <div className="text-sm text-green-700">All components verified for optimal performance</div>
                          </div>
                        </div>
                      </div>

                      {/* Coverage Status */}
                      {totalPanelCount > 0 && (
                        <div className={`flex items-center justify-between p-4 rounded-xl border-2 ${
                          netStatus === 'surplus'
                            ? 'bg-green-50 border-green-200'
                            : netStatus === 'balanced'
                              ? 'bg-blue-50 border-blue-200'
                              : 'bg-amber-50 border-amber-200'
                        }`}>
                          <div className="flex items-center gap-3">
                            {netStatus === 'surplus' ? (
                              <CheckCircle2 className="w-6 h-6 text-green-600" />
                            ) : netStatus === 'balanced' ? (
                              <CheckCircle2 className="w-6 h-6 text-blue-600" />
                            ) : (
                              <AlertCircle className="w-6 h-6 text-amber-600" />
                            )}
                            <div>
                              <div className={`font-semibold capitalize ${
                                netStatus === 'surplus'
                                  ? 'text-green-900'
                                  : netStatus === 'balanced'
                                    ? 'text-blue-900'
                                    : 'text-amber-900'
                              }`}>
                                {netStatus} Energy
                              </div>
                              <div className={`text-sm ${
                                netStatus === 'surplus'
                                  ? 'text-green-700'
                                  : netStatus === 'balanced'
                                    ? 'text-blue-700'
                                    : 'text-amber-700'
                              }`}>
                                {coveragePercent}% solar coverage of daily needs
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Capacity Utilization */}
                      {selectedStation && results.demand && (
                        <div className="flex items-center justify-between p-4 bg-blue-50 rounded-xl border-2 border-blue-200">
                          <div className="flex items-center gap-3">
                            <Battery className="w-6 h-6 text-blue-600" />
                            <div>
                              <div className="font-semibold text-blue-900">Optimal Capacity Match</div>
                              <div className="text-sm text-blue-700">
                                Using {(Math.min(100, (results.demand.totalWhNeeded / Math.max(1, (stations.find((s: JackeryStation) => s.id === selectedStation)?.capacityWh || 1))) * 100) || 0).toFixed(0)}% of battery capacity
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Checkout Section */}
                  <div className="bg-gradient-to-br from-gray-50 to-white p-8 border-t-2 border-gray-100">
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <div className="text-sm text-gray-600 mb-1">Estimated System Total</div>
                        <div className="text-4xl font-bold text-gray-900">
                          ${(() => {
                            const stationTotal = selectedStation
                              ? (selectedStation === 'explorer-5000-plus' && stationQuantity > 1
                                ? (stations.find((s: JackeryStation) => s.id === selectedStation)?.priceUSD || 0) + ((stationQuantity - 1) * 2999)
                                : ((stations.find((s: JackeryStation) => s.id === selectedStation)?.priceUSD || 0) * stationQuantity))
                              : 0;
                            const panelTotal = Object.entries(panelQuantities).reduce((sum, [pid, pqty]) => {
                              const p = panels.find((pl: any) => pl.id === pid);
                              return sum + (p?.priceUSD || 0) * pqty;
                            }, 0);
                            return (stationTotal + panelTotal).toLocaleString();
                          })()}
                        </div>
                        <div className="text-sm text-gray-500 mt-1">
                          Station{stationQuantity > 1 ? 's' : ''} + {totalPanelCount > 0 ? `${totalPanelCount} panel${totalPanelCount > 1 ? 's' : ''}` : 'no panels'}
                        </div>
                      </div>
                    </div>

                    <button
                      id="checkout-button"
                      className="w-full py-5 rounded-xl font-bold text-lg flex items-center justify-center gap-3 transition-all duration-300 bg-[#FF5000] text-white hover:bg-[#E64500] shadow-lg shadow-[#FF5000]/25 hover:shadow-xl hover:shadow-[#FF5000]/30 hover:scale-[1.02]"
                      onClick={() => {
                        // Announce via ARIA live region instead of inaccessible alert()
                        const liveEl = document.getElementById('aria-assertive-live');
                        if (liveEl) {
                          liveEl.textContent = '';
                          requestAnimationFrame(() => {
                            liveEl.textContent = 'System added to cart successfully.';
                          });
                        }
                      }}
                    >
                      <ShoppingCart className="w-6 h-6" />
                      Add Full System to Cart
                    </button>

                    <div className="mt-4 text-center text-sm text-gray-500">
                      Free shipping on orders over $500 • 30-day returns
                    </div>
                  </div>
                </div>

                {/* Back Button */}
                <div className="mt-6 text-center">
                  <button
                    onClick={() => setCurrentStage(3)}
                    className="text-gray-600 hover:text-[#FF5000] font-semibold transition-colors"
                  >
                    ← Back to Solar Configuration
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="text-center py-6 text-xs text-gray-500">
        A concept by{' '}
        <a
          href="https://heydylan.xyz"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-gray-700 transition-colors"
        >
          heydylan.xyz
        </a>
        , not affiliated with the actual Jackery brand.
      </footer>
      </>
      )}
    </div>
  );
}
