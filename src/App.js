import React, { useState } from 'react';
import './App.css'; // Make sure to add the CSS below in App.css

// System parameters
const BASE_LOAD = 1.0; // kW – base house load
const BATTERY_MAX_SUPPLY = 2.0; // kW – max battery discharge for simulation

// Appliance loads in kW
const APPLIANCE_LOADS = {
  Fridge: 0.1,
  TV: 0.1,
  Oven: 2.0,
  Aircon: 1.5,
};

// Solar production as a function of time (in hours).
// Uses a bell-curve (Gaussian) with a peak at 12.5 (12:30 PM)
function solarProduction(time) {
  const peakProduction = 3.0; // kW maximum solar production
  const peakTime = 12.5; // Peak at 12:30 PM
  const sigma = 2; // controls the width of the bell curve
  return peakProduction * Math.exp(-Math.pow(time - peakTime, 2) / (2 * Math.pow(sigma, 2)));
}

// Battery SoC (in percent) as a simple function of time-of-day:
// - Before 6 AM: low (20%)
// - From 6 AM to 12:30 PM: charges linearly from 20% to 100%
// - 12:30 PM to 6 PM: remains fully charged (100%)
// - From 6 PM to Midnight: discharges linearly from 100% to 20%
function getBatterySoC(time) {
  if (time < 6) {
    return 20;
  } else if (time >= 6 && time <= 12.5) {
    return 20 + (time - 6) * (80 / (12.5 - 6));
  } else if (time > 12.5 && time < 18) {
    return 100;
  } else if (time >= 18 && time <= 24) {
    return 100 - (time - 18) * (80 / (24 - 18));
  } else {
    return 20;
  }
}

function App() {
  const [batteryOn, setBatteryOn] = useState(true);
  const [appliances, setAppliances] = useState({
    Fridge: false,
    TV: false,
    Oven: false,
    Aircon: false,
  });
  const [timeOfDay, setTimeOfDay] = useState(12.5); // default to noon

  // Toggle battery on/off
  const handleBatteryChange = () => {
    setBatteryOn(prev => !prev);
  };

  // Toggle each appliance on/off
  const handleApplianceChange = (applianceName) => {
    setAppliances(prevState => ({
      ...prevState,
      [applianceName]: !prevState[applianceName],
    }));
  };

  // Update time-of-day when slider changes
  const handleTimeChange = (e) => {
    setTimeOfDay(parseFloat(e.target.value));
  };

  // Calculate total load from base load plus any selected appliances
  const totalApplianceLoad = Object.keys(APPLIANCE_LOADS).reduce((sum, appliance) => {
    return appliances[appliance] ? sum + APPLIANCE_LOADS[appliance] : sum;
  }, 0);
  const totalLoad = BASE_LOAD + totalApplianceLoad;

  // Compute current solar production based on time-of-day slider
  const currentSolarProduction = solarProduction(timeOfDay);

  // Compute grid consumption based on whether the battery is used.
  // (If battery is on, it covers up to its maximum supply.)
  let gridConsumption = 0;
  if (batteryOn) {
    const deficit = totalLoad - currentSolarProduction;
    if (deficit > 0) {
      const batteryCover = Math.min(deficit, BATTERY_MAX_SUPPLY);
      gridConsumption = deficit - batteryCover;
    }
  } else {
    gridConsumption = Math.max(0, totalLoad - currentSolarProduction);
  }

  // Compute battery SoC from time-of-day (our simplified function)
  const batterySoC = getBatterySoC(timeOfDay);

  // Format time-of-day (e.g., "12:30") from the slider value
  const formatTime = (time) => {
    const hours = Math.floor(time);
    const minutes = Math.floor((time - hours) * 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1>Solar + Battery House Simulation</h1>
      <div>
        <label>
          <input type="checkbox" checked={batteryOn} onChange={handleBatteryChange} />
          With Battery
        </label>
      </div>

      {/* Time-of-day slider */}
      <div style={{ margin: '20px 0' }}>
        <label>
          Time of Day: {formatTime(timeOfDay)}
          <br />
          <input
            type="range"
            min="0"
            max="24"
            step="0.1"
            value={timeOfDay}
            onChange={handleTimeChange}
          />
        </label>
      </div>

      {/* Appliance toggles */}
      <h2>Appliance Control</h2>
      {Object.keys(APPLIANCE_LOADS).map(applianceName => (
        <div key={applianceName}>
          <label>
            <input
              type="checkbox"
              checked={appliances[applianceName]}
              onChange={() => handleApplianceChange(applianceName)}
            />
            {applianceName} ({APPLIANCE_LOADS[applianceName]} kW)
          </label>
        </div>
      ))}

      {/* Display simulation results */}
      <h2>Simulation Results</h2>
      <p>Total Load: {totalLoad.toFixed(2)} kW</p>
      <p>Solar Production: {currentSolarProduction.toFixed(2)} kW</p>
      <p>Battery SoC: {batterySoC.toFixed(0)}%</p>
      <p>Grid Consumption: {gridConsumption.toFixed(2)} kW</p>

      {/* Simple SVG system diagram */}
      <h2>System Diagram</h2>
      <svg width="300" height="100">
        {/* Battery */}
        <rect x="10" y="30" width="50" height="40" fill="#ccc" stroke="#000" />
        <text x="35" y="25" textAnchor="middle" fontSize="12">Battery</text>
        {/* House */}
        <rect x="240" y="30" width="50" height="40" fill="#ccc" stroke="#000" />
        <text x="265" y="25" textAnchor="middle" fontSize="12">House</text>
        {/* Wire */}
        <line x1="60" y1="50" x2="240" y2="50" stroke="#000" strokeWidth="2" />
        {/* Electricity flow:
            The yellow circle animates along the wire when it’s after sunset (time >= 18) */}
        <circle
          cx="60"
          cy="50"
          r="5"
          fill="yellow"
          className={timeOfDay >= 18 ? "electricity" : ""}
        />
      </svg>
    </div>
  );
}

export default App;
