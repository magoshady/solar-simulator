import React, { useState } from 'react';
import { Container, Typography, Box, TextField, Slider, RadioGroup, FormControlLabel, Radio, FormLabel, FormControl, Checkbox, Grid, Paper } from '@mui/material';
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
import './App.css';

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
  const solarArr = []; // Array to record solar production
  
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
    solarArr.push(solar); // Record solar production
    
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
      const maxDischargeEnergy = 5 * dt; // maximum energy that can be discharged in this dt (5 kW cap)
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
    solarArr,
  };
}

function App() {
  // Component state
  const [inverterCapacity, setInverterCapacity] = useState(3.0);
  const [batteryCapacity, setBatteryCapacity] = useState(10);
  const [timeOfDay, setTimeOfDay] = useState(12); // default: 12:00 (noon)
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
  
  const handleBatteryCapacityChange = (event) => {
    setBatteryCapacity(parseInt(event.target.value, 10));
  };
  
  const handleApplianceToggle = (name) => {
    setAppliances(prev => ({ ...prev, [name]: !prev[name] }));
  };
  
  const handleTimeChange = (event, newValue) => {
    setTimeOfDay(newValue);
  };
  
  // Run the simulation from midnight to the selected time-of-day
  const simulation = simulateDay(timeOfDay, inverterCapacity, batteryCapacity, appliances);
  
  // Format time as HH:MM from a decimal hour value
  const formatTime = (t) => {
    const hours = Math.floor(t);
    const minutes = Math.floor((t - hours) * 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  };
  
  // Prepare chart data if timeOfDay > 0 (graph resets at midnight)
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
          label: 'Solar Production (kW)',
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
      title: { display: true, text: 'SoC, Grid Import & Solar Production Over Time' },
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
      y3: {
        type: 'linear',
        position: 'right',
        title: { display: true, text: 'Solar Production (kW)' },
        grid: { drawOnChartArea: false },
        offset: true,
      },
    },
  };
  
  return (
    <Container maxWidth="md" sx={{ paddingTop: 4 }}>
      <Typography variant="h4" align="center" gutterBottom>
        Solar + Battery House Simulation
      </Typography>
      
      {/* Inverter Capacity Input */}
      <Box sx={{ marginBottom: 3 }}>
        <TextField
          label="Inverter Capacity (kW)"
          type="number"
          value={inverterCapacity}
          onChange={handleInverterCapacityChange}
          inputProps={{ step: "0.1", min: "0" }}
          sx={{ width: '200px' }}
        />
      </Box>
      
      {/* Battery Capacity Selection */}
      <Box sx={{ marginBottom: 3 }}>
        <FormControl component="fieldset">
          <FormLabel component="legend">Battery Capacity (kWh)</FormLabel>
          <RadioGroup
            row
            name="batteryCapacity"
            value={batteryCapacity.toString()}
            onChange={handleBatteryCapacityChange}
          >
            {['5', '10', '15', '20', '25'].map(cap => (
              <FormControlLabel
                key={cap}
                value={cap}
                control={<Radio />}
                label={`${cap} kWh`}
              />
            ))}
          </RadioGroup>
        </FormControl>
      </Box>
      
      {/* Time-of-Day Slider */}
      <Box sx={{ marginBottom: 3 }}>
        <Typography gutterBottom>
          Time of Day: {formatTime(timeOfDay)}
        </Typography>
        <Slider
          value={timeOfDay}
          onChange={handleTimeChange}
          min={0}
          max={24}
          step={0.1}
          valueLabelDisplay="auto"
        />
      </Box>
      
      {/* Appliance Controls */}
      <Box sx={{ marginBottom: 3 }}>
        <Typography variant="h6">Appliance Control</Typography>
        <Typography variant="body1">Fridge is always on (0.1 kW)</Typography>
        {Object.keys(APPLIANCE_LOADS).map((name) => (
          <Box key={name}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={appliances[name]}
                  onChange={() => handleApplianceToggle(name)}
                />
              }
              label={`${name} (${APPLIANCE_LOADS[name]} kW)`}
            />
          </Box>
        ))}
      </Box>
      
      {/* Simulation Results */}
      <Paper sx={{ padding: 2, marginBottom: 3 }}>
        <Typography variant="h6">Simulation Results</Typography>
        <Typography variant="body2">Time: {formatTime(timeOfDay)}</Typography>
        <Typography variant="body2">Solar Production (instantaneous): {simulation.currentSolar.toFixed(2)} kW</Typography>
        <Typography variant="body2">House Load (instantaneous): {simulation.currentLoad.toFixed(2)} kW</Typography>
        <Typography variant="body2">Battery SoC: {simulation.batterySoC.toFixed(1)}%</Typography>
        <Typography variant="body2">Battery Energy: {simulation.batteryEnergy.toFixed(2)} kWh</Typography>
        <Typography variant="body2">Cumulative Grid Import: {simulation.cumulativeGridImport.toFixed(2)} kWh</Typography>
        <Typography variant="body2">Cumulative Grid Export: {simulation.cumulativeGridExport.toFixed(2)} kWh</Typography>
        <Typography variant="body2">Cumulative House Consumption: {simulation.cumulativeHouseConsumption.toFixed(2)} kWh</Typography>
      </Paper>
      
      {/* SVG System Diagram */}
      <Box sx={{ marginBottom: 3 }}>
        <Typography variant="h6">System Diagram</Typography>

      </Box>
      
      {/* Graph Section: Only display if timeOfDay > 0 (graph resets at midnight) */}
      {timeOfDay > 0 && chartData && (
        <Box sx={{ width: '700px', height: '700px', marginBottom: 3 }}>
          <Typography variant="h6" align="center">SoC, Grid Import & Solar Production Over Time</Typography>
          <Line data={chartData} options={chartOptions} />
        </Box>
      )}
    </Container>
  );
}

export default App;
