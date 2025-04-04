import React, { useState } from 'react';
import './App.css';

// Define constants
const SUNRISE = 6.0;       // 6:00 AM
const SUNSET = 18.0;       // 6:00 PM
const PEAK_TIME = 12.5;    // 12:30 PM
const SIGMA = 2.5;         // Controls width of bell curve (in hours)

const BASE_LOAD = 1.0;     // kW base house load
const FRIDGE_LOAD = 0.1;   // kW, always on
const APPLIANCE_LOADS = {
  TV: 0.1,
  Oven: 2.0,
  Aircon: 1.5,
};

// Solar production function (in kW) using a bell curve
function solarProduction(t, inverterCapacity) {
  // Solar production only between sunrise and sunset
  if (t < SUNRISE || t > SUNSET) {
    return 0;
  }
  const production = inverterCapacity * Math.exp(-Math.pow(t - PEAK_TIME, 2) / (2 * Math.pow(SIGMA, 2)));
  return production;
}

// Simulate the day from t=0 to t=timeOfDay using simple integration
// Battery starts full. We integrate energy (in kWh) in steps of dt.
function simulateDay(timeOfDay, inverterCapacity, batteryCapacity, appliancesState) {
  const dt = 0.1; // time step in hours (~6 minutes)
  let batteryEnergy = batteryCapacity; // kWh (starts full, i.e. 100% SoC)
  let cumulativeGridImport = 0; // kWh (if battery cannot cover deficit)
  let cumulativeGridExport = 0; // kWh (excess production when battery is full)

  // Step through time from 0 to current time
  for (let t = 0; t < timeOfDay; t += dt) {
    // Calculate load at time t:
    // Base load + always-on fridge + toggled appliances
    let load = BASE_LOAD + FRIDGE_LOAD;
    if (appliancesState.TV) load += APPLIANCE_LOADS.TV;
    if (appliancesState.Oven) load += APPLIANCE_LOADS.Oven;
    if (appliancesState.Aircon) load += APPLIANCE_LOADS.Aircon;
    
    // Get solar production at time t
    const solar = solarProduction(t, inverterCapacity);
    const netPower = solar - load; // kW (positive means excess solar)
    
    if (netPower >= 0) {
      // Excess solar: battery charges, and any extra is exported to the grid
      const energyExcess = netPower * dt; // kWh available for charging
      const availableCapacity = batteryCapacity - batteryEnergy;
      const energyToBattery = Math.min(energyExcess, availableCapacity);
      batteryEnergy += energyToBattery;
      const energyExported = energyExcess - energyToBattery;
      cumulativeGridExport += energyExported;
    } else {
      // Deficit: battery discharges to cover load
      const deficitEnergy = (-netPower) * dt; // kWh required
      const maxDischargeEnergy = 5 * dt; // kWh maximum that can be discharged in this dt (5 kW cap)
      const energyFromBattery = Math.min(deficitEnergy, batteryEnergy, maxDischargeEnergy);
      batteryEnergy -= energyFromBattery;
      const energyShortfall = deficitEnergy - energyFromBattery;
      cumulativeGridImport += energyShortfall;
    }
  }
  
  // Calculate battery State of Charge (SoC) as a percentage
  const batterySoC = (batteryEnergy / batteryCapacity) * 100;
  
  // Calculate instantaneous values at the selected time-of-day:
  let currentLoad = BASE_LOAD + FRIDGE_LOAD;
  if (appliancesState.TV) currentLoad += APPLIANCE_LOADS.TV;
  if (appliancesState.Oven) currentLoad += APPLIANCE_LOADS.Oven;
  if (appliancesState.Aircon) currentLoad += APPLIANCE_LOADS.Aircon;
  
  const currentSolar = solarProduction(timeOfDay, inverterCapacity);
  
  return {
    batterySoC,
    batteryEnergy,
    cumulativeGridImport,
    cumulativeGridExport,
    currentLoad,
    currentSolar
  };
}

function App() {
  // State variables for inverter capacity (kW) and battery capacity (kWh)
  const [inverterCapacity, setInverterCapacity] = useState(3.0);
  const [batteryCapacity, setBatteryCapacity] = useState(10);
  const [timeOfDay, setTimeOfDay] = useState(12); // default noon (12:00)
  const [appliances, setAppliances] = useState({
    TV: false,
    Oven: false,
    Aircon: false,
  });
  
  // Handlers for input changes
  const handleInverterCapacityChange = (e) => {
    const value = parseFloat(e.target.value);
    if (!isNaN(value)) {
      setInverterCapacity(value);
    }
  };
  
  const handleBatteryCapacityChange = (capacity) => {
    setBatteryCapacity(capacity);
  };
  
  const handleApplianceToggle = (name) => {
    setAppliances(prev => ({ ...prev, [name]: !prev[name] }));
  };
  
  const handleTimeChange = (e) => {
    setTimeOfDay(parseFloat(e.target.value));
  };
  
  // Run the simulation from midnight to the selected time-of-day
  const simulation = simulateDay(timeOfDay, inverterCapacity, batteryCapacity, appliances);
  
  const formatTime = (t) => {
    const hours = Math.floor(t);
    const minutes = Math.floor((t - hours) * 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  };
  
  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1>Solar + Battery House Simulation</h1>
      
      {/* Inverter Capacity Input */}
      <div>
        <label>
          Inverter Capacity (kW):{' '}
          <input 
            type="number" 
            value={inverterCapacity} 
            onChange={handleInverterCapacityChange} 
            step="0.1" 
            min="0" 
          />
        </label>
      </div>
      
      {/* Battery Capacity Selection */}
      <div>
        <p>Battery Capacity (kWh):</p>
        {[5, 10, 15, 20, 25].map((cap) => (
          <label key={cap} style={{ marginRight: '10px' }}>
            <input 
              type="radio" 
              name="batteryCapacity" 
              value={cap} 
              checked={batteryCapacity === cap} 
              onChange={() => handleBatteryCapacityChange(cap)} 
            />
            {cap} kWh
          </label>
        ))}
      </div>
      
      {/* Time-of-Day Slider */}
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
      
      {/* Appliance Controls */}
      <h2>Appliance Control</h2>
      <p>Fridge is always on (0.1 kW)</p>
      {Object.keys(appliances).map((name) => (
        <div key={name}>
          <label>
            <input 
              type="checkbox" 
              checked={appliances[name]} 
              onChange={() => handleApplianceToggle(name)}
            />
            {name} ({APPLIANCE_LOADS[name]} kW)
          </label>
        </div>
      ))}
      
      {/* Simulation Results */}
      <h2>Simulation Results</h2>
      <p>Time: {formatTime(timeOfDay)}</p>
      <p>Solar Production (instantaneous): {simulation.currentSolar.toFixed(2)} kW</p>
      <p>House Load (instantaneous): {simulation.currentLoad.toFixed(2)} kW</p>
      <p>Battery SoC: {simulation.batterySoC.toFixed(1)}%</p>
      <p>Battery Energy: {simulation.batteryEnergy.toFixed(2)} kWh</p>
      <p>Cumulative Grid Import: {simulation.cumulativeGridImport.toFixed(2)} kWh</p>
      <p>Cumulative Grid Export: {simulation.cumulativeGridExport.toFixed(2)} kWh</p>
      
     <></> {/* SVG System Diagram */}
      <h2>System Diagram</h2>
    </div>
  );
}

export default App;
