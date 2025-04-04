import React, { useState } from 'react';
import './App.css';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

// Constants
const SUNRISE = 6.0; // 6:00 AM
const SUNSET = 18.0; // 6:00 PM
const PEAK_TIME = 12.5; // 12:30 PM
const SIGMA = 2.5; // width of the bell curve

const BASE_LOAD = 1.0;     // kW base house load
const FRIDGE_LOAD = 0.1;   // kW, always on
const APPLIANCE_LOADS = {
  TV: 0.1,
  Oven: 2.0,
  Aircon: 1.5,
};

// Solar production function (in kW) using a bell curve that only produces power between sunrise and sunset.
function solarProduction(t, inverterCapacity) {
  if (t < SUNRISE || t > SUNSET) return 0;
  const production = inverterCapacity * Math.exp(-Math.pow(t - PEAK_TIME, 2) / (2 * Math.pow(SIGMA, 2)));
  return production;
}

// Simulation function which integrates the day from midnight to the current time.
// It returns the final simulation results and also arrays for plotting.
function simulateDay(timeOfDay, inverterCapacity, batteryCapacity, appliancesState) {
  const dt = 0.1; // time step in hours (~6 minutes)
  let batteryEnergy = batteryCapacity; // Battery energy in kWh (starts full)
  let cumulativeGridImport = 0; // kWh imported from grid
  let cumulativeGridExport = 0; // kWh exported to grid
  let cumulativeHouseConsumption = 0; // kWh consumed by the house
  
  // Arrays for graphing
  const times = [];
  const socArr = [];
  const gridImportArr = [];
  const consumptionArr = [];
  const solarArr = []; // NEW: Array to record solar production
  
  // Integrate over time from 0 to timeOfDay
  for (let t = 0; t <= timeOfDay; t += dt) {
    // Calculate house load (base load + fridge + any toggled appliances)
    let load = BASE_LOAD + FRIDGE_LOAD;
    if (appliancesState.TV) load += APPLIANCE_LOADS.TV;
    if (appliancesState.Oven) load += APPLIANCE_LOADS.Oven;
    if (appliancesState.Aircon) load += APPLIANCE_LOADS.Aircon;
    
    // Integrate house consumption
    cumulativeHouseConsumption += load * dt; // kWh

    // Solar production at time t
    const solar = solarProduction(t, inverterCapacity);
    solarArr.push(solar); // RECORD SOLAR PRODUCTION for graphing
    
    const netPower = solar - load; // kW (positive means excess solar)
    
    if (netPower >= 0) {
      // Excess solar: charge battery (limited by remaining capacity) and export any extra to grid
      const energyExcess = netPower * dt; // kWh available for charging
      const availableCapacity = batteryCapacity - batteryEnergy;
      const energyToBattery = Math.min(energyExcess, availableCapacity);
      batteryEnergy += energyToBattery;
      const energyExported = energyExcess - energyToBattery;
      cumulativeGridExport += energyExported;
    } else {
      // Deficit: discharge battery to cover load (limited by a 5 kW rate)
      const deficitEnergy = (-netPower) * dt; // kWh needed
      const maxDischargeEnergy = 5 * dt; // maximum energy that can be discharged in this time step (5 kW cap)
      const energyFromBattery = Math.min(deficitEnergy, batteryEnergy, maxDischargeEnergy);
      batteryEnergy -= energyFromBattery;
      const energyShortfall = deficitEnergy - energyFromBattery;
      cumulativeGridImport += energyShortfall;
    }
    
    // Battery State of Charge (SoC)
    const batterySoC = (batteryEnergy / batteryCapacity) * 100;
    
    // Record values for graphing
    times.push(t);
    socArr.push(batterySoC);
    gridImportArr.push(cumulativeGridImport);
    consumptionArr.push(cumulativeHouseConsumption);
  }
  
  // Final instantaneous values at timeOfDay
  let finalLoad = BASE_LOAD + FRIDGE_LOAD;
  if (appliancesState.TV) finalLoad += APPLIANCE_LOADS.TV;
  if (appliancesState.Oven) finalLoad += APPLIANCE_LOADS.Oven;
  if (appliancesState.Aircon) finalLoad += APPLIANCE_LOADS.Aircon;
  const finalSolar = solarProduction(timeOfDay, inverterCapacity);
  
  return {
    batterySoC: (batteryEnergy / batteryCapacity) * 100,
    batteryEnergy,
    cumulativeGridImport,
    cumulativeGridExport,
    currentLoad: finalLoad,
    currentSolar: finalSolar,
    cumulativeHouseConsumption,
    times,
    socArr,
    gridImportArr,
    consumptionArr,
    solarArr, // NEW: Return solar production data
  };
}

function App() {
  // Component state
  const [inverterCapacity, setInverterCapacity] = useState(5.0);
  const [batteryCapacity, setBatteryCapacity] = useState(15);
  const [timeOfDay, setTimeOfDay] = useState(0); // default: 12:00 (noon)
  const [appliances, setAppliances] = useState({
    TV: false,
    Oven: false,
    Aircon: false,
  });
  
  // Handlers for inputs
  const handleInverterCapacityChange = (e) => {
    const value = parseFloat(e.target.value);
    if (!isNaN(value)) setInverterCapacity(value);
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
  
  // Format time as HH:MM from a decimal hour value
  const formatTime = (t) => {
    const hours = Math.floor(t);
    const minutes = Math.floor((t - hours) * 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  };
  
  // Prepare chart data if timeOfDay > 0 (if timeOfDay resets to 0, the graph is cleared)
  let chartData = null;
  if (timeOfDay > 0) {
    chartData = {
      labels: simulation.times.map(t => formatTime(t)),
      datasets: [
        {
          label: 'Battery SoC (%)',
          data: simulation.socArr,
          borderColor: 'blue',
          backgroundColor: 'blue',
          yAxisID: 'y1',
          fill: false,
        },
        {
          label: 'Cumulative Grid Import (kWh)',
          data: simulation.gridImportArr,
          borderColor: 'red',
          backgroundColor: 'red',
          yAxisID: 'y2',
          fill: false,
        },
        {
          label: 'Solar Production (kW)',  // NEW DATASET
          data: simulation.solarArr,
          borderColor: 'green',
          backgroundColor: 'green',
          yAxisID: 'y3',
          fill: false,
        },
      ]
    };
  }
  
  // Chart options with three y-axes
  const chartOptions = {
    responsive: true,
    plugins: {
      legend: { position: 'top' },
      title: { display: true, text: 'SoC, Cumulative Grid Import & Solar Production Over Time' },
    },
    scales: {
      y1: {
        type: 'linear',
        position: 'left',
        title: { display: true, text: 'Battery SoC (%)' },
        min: 0,
        max: 100,
      },
      y2: {
        type: 'linear',
        position: 'right',
        title: { display: true, text: 'Grid Import (kWh)' },
        grid: { drawOnChartArea: false },
      },
      y3: {  // NEW: Axis for Solar Production
        type: 'linear',
        position: 'right',
        title: { display: true, text: 'Solar Production (kW)' },
        grid: { drawOnChartArea: false },
        offset: true,
      },
    },
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
            step="1" 
            min=" "
            style={{ padding: '5px', fontSize: '16px', width: '40px' }}
          />
        </label>
      </div>
      
      {/* Battery Capacity Selection */}
      <div>
        <p>Battery Capacity (kWh):</p>
        {[5, 10, 15, 20, 25].map(cap => (
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
      {Object.keys(appliances).map(name => (
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
      <p>Cumulative House Consumption: {simulation.cumulativeHouseConsumption.toFixed(2)} kWh</p>
      
      
      {/* Graph Section: Only display if timeOfDay > 0 (graph resets at midnight) */}
      {timeOfDay > 0 && chartData && (
        <div style={{ width: '700px', height: '700px', marginTop: '20px' }}>
          <h2>SoC, Cumulative Grid Import & Solar Production Over Time</h2>
          <Line data={chartData} options={chartOptions} />
        </div>
      )}
    </div>
  );
}

export default App;
