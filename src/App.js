import React, { useState } from 'react';
import { Container, Typography, Box, TextField, Slider, RadioGroup, FormControlLabel, Radio, FormLabel, FormControl, Checkbox, Grid, Paper, TableContainer, Table, TableHead, TableBody, TableRow, TableCell } from '@mui/material';
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

// Add new type for appliance schedule
const DEFAULT_SCHEDULE = {
  on1: '',
  off1: '',
  on2: '',
  off2: '',
};

// Helper function to convert time string to decimal hours
function timeToDecimal(timeStr) {
  if (!timeStr) return null;
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours + minutes / 60;
}

// Helper function to check if current time is within schedule
function isApplianceRunning(timeOfDay, schedule) {
  // Debug logging for schedule state
  console.log('Checking schedule:', schedule);
  
  // If both schedules are empty, return false
  if ((!schedule.on1 || !schedule.off1) && (!schedule.on2 || !schedule.off2)) {
    console.log('Both schedules are empty');
    return false;
  }

  const currentTime = timeOfDay;
  const on1 = timeToDecimal(schedule.on1);
  const off1 = timeToDecimal(schedule.off1);
  const on2 = timeToDecimal(schedule.on2);
  const off2 = timeToDecimal(schedule.off2);

  // Debug logging for time conversion
  console.log(`Time conversion for ${timeOfDay}:`, {
    on1: schedule.on1,
    off1: schedule.off1,
    on2: schedule.on2,
    off2: schedule.off2,
    currentTime,
    on1Decimal: on1,
    off1Decimal: off1,
    on2Decimal: on2,
    off2Decimal: off2
  });
  
  // Check first time slot if both times are set
  if (schedule.on1 && schedule.off1) {
    if (off1 < on1) {
      // Schedule spans midnight (e.g., 22:00 to 02:00)
      if (currentTime >= on1 || currentTime <= off1) {
        console.log('Appliance running in first slot (spans midnight)');
        return true;
      }
    } else if (currentTime >= on1 && currentTime <= off1) {
      // Normal schedule (e.g., 09:00 to 17:00)
      console.log('Appliance running in first slot (normal)');
      return true;
    }
  }
  
  // Check second time slot if both times are set
  if (schedule.on2 && schedule.off2) {
    if (off2 < on2) {
      // Schedule spans midnight
      if (currentTime >= on2 || currentTime <= off2) {
        console.log('Appliance running in second slot (spans midnight)');
        return true;
      }
    } else if (currentTime >= on2 && currentTime <= off2) {
      // Normal schedule
      console.log('Appliance running in second slot (normal)');
      return true;
    }
  }
  
  console.log('Appliance not running');
  return false;
}

// Solar production function (in kW) using a bell curve
function solarProduction(t, inverterCapacity) {
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
  
  // Always simulate the full day (0 to 24)
  for (let t = 0; t <= 24; t += dt) {
    // Calculate house load (fridge + any scheduled appliances)
    let load = FRIDGE_LOAD; // Start with just the fridge load
    Object.entries(appliancesState).forEach(([name, { enabled, schedule }]) => {
      if (enabled && isApplianceRunning(t, schedule)) {
        load += APPLIANCE_LOADS[name];
      }
    });
    
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
  
  // Find the index for the current time
  const currentIndex = Math.round(timeOfDay / dt);
  
  // Final instantaneous values at timeOfDay
  let finalLoad = FRIDGE_LOAD; // Start with just the fridge load
  Object.entries(appliancesState).forEach(([name, { enabled, schedule }]) => {
    if (enabled && isApplianceRunning(timeOfDay, schedule)) {
      finalLoad += APPLIANCE_LOADS[name];
    }
  });
  const finalSolar = solarProduction(timeOfDay, inverterCapacity);
  
  return {
    batterySoC: socArr[currentIndex],
    batteryEnergy,
    cumulativeGridImport: gridImportArr[currentIndex],
    cumulativeGridExport,
    currentLoad: finalLoad,
    currentSolar: finalSolar,
    cumulativeHouseConsumption: consumptionArr[currentIndex],
    times,
    socArr,
    gridImportArr,
    consumptionArr,
    solarArr,
    currentIndex,
  };
}

function App() {
  // Component state
  const [inverterCapacity, setInverterCapacity] = useState(5.0);
  const [batteryCapacity, setBatteryCapacity] = useState(10);
  const [timeOfDay, setTimeOfDay] = useState(0); // default: 00:00 (midnight)
  const [appliances, setAppliances] = useState({
    TV: { enabled: false, schedule: { ...DEFAULT_SCHEDULE } },
    Oven: { enabled: false, schedule: { ...DEFAULT_SCHEDULE } },
    Aircon: { enabled: false, schedule: { ...DEFAULT_SCHEDULE } },
  });
  
  // Handlers for inputs
  const handleInverterCapacityChange = (e) => {
    const value = parseFloat(e.target.value);
    if (!isNaN(value) && value >= 0) setInverterCapacity(value);
  };
  
  const handleBatteryCapacityChange = (event) => {
    setBatteryCapacity(parseInt(event.target.value, 10));
  };
  
  const handleApplianceToggle = (name) => {
    setAppliances(prev => ({
      ...prev,
      [name]: { ...prev[name], enabled: !prev[name].enabled }
    }));
  };
  
  const handleScheduleChange = (name, scheduleType, value) => {
    setAppliances(prev => ({
      ...prev,
      [name]: {
        ...prev[name],
        schedule: {
          ...prev[name].schedule,
          [scheduleType]: value
        }
      }
    }));
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
  
  // Prepare chart data
  let chartData = null;
  if (simulation.times.length > 0) {
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
          borderWidth: 1,
          pointRadius: 0,
          pointHoverRadius: 0,
        },
        {
          label: 'Cumulative Grid Import (kWh)',
          data: simulation.gridImportArr,
          borderColor: 'red',
          backgroundColor: 'red',
          yAxisID: 'y2',
          fill: false,
          borderWidth: 1,
          pointRadius: 0,
          pointHoverRadius: 0,
        },
        {
          label: 'Solar Production (kW)',
          data: simulation.solarArr,
          borderColor: 'green',
          backgroundColor: 'green',
          yAxisID: 'y3',
          fill: false,
          borderWidth: 1,
          pointRadius: 0,
          pointHoverRadius: 0,
        },
        // Current time indicators
        {
          label: '',  // Empty label to hide from legend
          data: simulation.times.map((t, i) => i === simulation.currentIndex ? simulation.socArr[i] : null),
          borderColor: 'blue',
          backgroundColor: 'blue',
          yAxisID: 'y1',
          pointRadius: 5,
          pointHoverRadius: 7,
          showLine: false,
        },
        {
          label: '',  // Empty label to hide from legend
          data: simulation.times.map((t, i) => i === simulation.currentIndex ? simulation.gridImportArr[i] : null),
          borderColor: 'red',
          backgroundColor: 'red',
          yAxisID: 'y2',
          pointRadius: 5,
          pointHoverRadius: 7,
          showLine: false,
        },
        {
          label: '',  // Empty label to hide from legend
          data: simulation.times.map((t, i) => i === simulation.currentIndex ? simulation.solarArr[i] : null),
          borderColor: 'green',
          backgroundColor: 'green',
          yAxisID: 'y3',
          pointRadius: 5,
          pointHoverRadius: 7,
          showLine: false,
        },
      ]
    };
  }
  
  // Chart options with three y-axes
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: true,
    aspectRatio: 1,
    plugins: {
      legend: { 
        display: true,
        position: 'top',
        align: 'center',
        labels: {
          boxWidth: 12,
          padding: 8,
          font: {
            size: 11
          },
          filter: function(legendItem, data) {
            // Only show legend for the first three datasets (main data series)
            return legendItem.datasetIndex < 3;
          }
        }
      },
      title: { 
        display: true, 
        text: 'SoC, Grid Import & Solar Production Over Time',
        font: {
          size: 14
        },
        padding: {
          bottom: 10
        }
      },
    },
    scales: {
      x: {
        grid: {
          display: false
        },
        ticks: {
          font: {
            size: 11
          }
        }
      },
      y1: {
        type: 'linear',
        position: 'left',
        title: { 
          display: true, 
          text: 'Battery SoC (%)',
          font: {
            size: 11
          }
        },
        min: 0,
        max: 100,
        ticks: {
          font: {
            size: 11
          }
        }
      },
      y2: {
        type: 'linear',
        position: 'right',
        title: { 
          display: true, 
          text: 'Grid Import (kWh)',
          font: {
            size: 11
          }
        },
        grid: { drawOnChartArea: false },
        ticks: {
          font: {
            size: 11
          }
        }
      },
      y3: {
        type: 'linear',
        position: 'right',
        title: { 
          display: true, 
          text: 'Solar Production (kW)',
          font: {
            size: 11
          }
        },
        grid: { drawOnChartArea: false },
        offset: true,
        ticks: {
          font: {
            size: 11
          }
        }
      },
    },
  };
  
  // Calculate current load including scheduled appliances
  const calculateCurrentLoad = () => {
    let load = FRIDGE_LOAD; // Start with just the fridge load
    console.log('Initial load (fridge):', load);
    
    Object.entries(appliances).forEach(([name, { enabled, schedule }]) => {
      console.log(`Checking ${name}:`, { enabled, schedule });
      if (enabled && isApplianceRunning(timeOfDay, schedule)) {
        load += APPLIANCE_LOADS[name];
        console.log(`Adding load for ${name}: ${APPLIANCE_LOADS[name]}kW. Total load: ${load}kW`);
      }
    });
    return load;
  };
  
  return (
    <Container maxWidth="lg" sx={{ paddingTop: 4 }}>
      <Typography variant="h4" align="center" gutterBottom sx={{ 
        color: '#1976d2',
        fontWeight: 'bold',
        mb: 4
      }}>
        Solar + Battery House Simulation
      </Typography>
      
      <Grid container spacing={3}>
        {/* Left Column - Controls */}
        <Grid item xs={12} md={4}>
          {/* System Configuration */}
          <Paper sx={{ p: 2, mb: 3, border: '1px solid #e0e0e0', width: '100%' }}>
            <Typography variant="h6" gutterBottom sx={{ color: '#1976d2' }}>
              System Configuration
            </Typography>
            
            {/* Inverter Capacity */}
            <Box sx={{ mb: 3 }}>
              <TextField
                label="Inverter Capacity (kW)"
                type="number"
                value={inverterCapacity}
                onChange={handleInverterCapacityChange}
                fullWidth
                inputProps={{ min: 0, step: 1 }}
                sx={{ width: { xs: '100%', md: '120px' } }}
              />
            </Box>

            {/* Battery Capacity Selection - Desktop */}
            <Box sx={{ mb: 3, display: { xs: 'none', md: 'block' } }}>
              <FormControl component="fieldset" fullWidth>
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
                      sx={{ 
                        margin: 0,
                        alignItems: 'center',
                        '& .MuiFormControlLabel-label': {
                          marginTop: 2.5,
                          marginLeft: '8px'
                        }
                      }}
                    />
                  ))}
                </RadioGroup>
              </FormControl>
            </Box>

            {/* Battery Capacity Selection - Mobile */}
            <Box sx={{ mb: 3, display: { xs: 'block', md: 'none' } }}>
              <FormLabel component="legend">Battery Capacity (kWh)</FormLabel>
              <RadioGroup
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
                    sx={{ 
                      margin: 0,
                      padding: '8px 0',
                      width: '100%',
                      '& .MuiFormControlLabel-label': {
                        marginTop: 0,
                        marginLeft: '8px'
                      }
                    }}
                  />
                ))}
              </RadioGroup>
            </Box>

            {/* Time-of-Day Slider */}
            <Box>
              <Typography gutterBottom>
                Time of Day: {formatTime(timeOfDay)}
              </Typography>
              <Slider
                value={timeOfDay}
                onChange={handleTimeChange}
                min={0}
                max={23.9167}
                step={0.1}
                valueLabelDisplay="auto"
                sx={{ color: '#1976d2' }}
              />
            </Box>
          </Paper>

          {/* Appliance Controls - Desktop */}
          <Paper sx={{ p: 2, border: '1px solid #e0e0e0', width: '100%', display: { xs: 'none', md: 'block' } }}>
            <Typography variant="h6" gutterBottom sx={{ color: '#1976d2' }}>
              Appliance Control
            </Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Appliance</TableCell>
                    <TableCell>Power</TableCell>
                    <TableCell colSpan={2} sx={{ textAlign: 'center', borderLeft: '2px solid #e0e0e0' }}>Time Slot 1</TableCell>
                    <TableCell colSpan={2} sx={{ textAlign: 'center', borderLeft: '2px solid #e0e0e0' }}>Time Slot 2</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell></TableCell>
                    <TableCell></TableCell>
                    <TableCell sx={{ textAlign: 'center' }}>ON</TableCell>
                    <TableCell sx={{ textAlign: 'center' }}>OFF</TableCell>
                    <TableCell sx={{ textAlign: 'center', borderLeft: '2px solid #e0e0e0' }}>ON</TableCell>
                    <TableCell sx={{ textAlign: 'center', borderLeft: '2px solid #e0e0e0' }}>OFF</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {Object.entries(appliances).map(([name, { enabled, schedule }]) => (
                    <TableRow key={name}>
                      <TableCell>
                        <FormControlLabel
                          control={
                            <Checkbox
                              checked={enabled}
                              onChange={() => handleApplianceToggle(name)}
                              color="primary"
                              sx={{ marginTop: 0 }}
                            />
                          }
                          label={name}
                          sx={{ 
                            margin: 0,
                            alignItems: 'center',
                            '& .MuiFormControlLabel-label': {
                              marginTop: 0,
                              marginLeft: '2px'
                            },
                            '& .MuiCheckbox-root': {
                              marginTop: 0
                            }
                          }}
                        />
                      </TableCell>
                      <TableCell>{APPLIANCE_LOADS[name]} kW</TableCell>
                      <TableCell sx={{ textAlign: 'center' }}>
                        <TextField
                          type="time"
                          value={schedule.on1}
                          onChange={(e) => handleScheduleChange(name, 'on1', e.target.value)}
                          size="small"
                          sx={{ width: '100px' }}
                        />
                      </TableCell>
                      <TableCell sx={{ textAlign: 'center' }}>
                        <TextField
                          type="time"
                          value={schedule.off1}
                          onChange={(e) => handleScheduleChange(name, 'off1', e.target.value)}
                          size="small"
                          sx={{ width: '100px' }}
                        />
                      </TableCell>
                      <TableCell sx={{ textAlign: 'center', borderLeft: '2px solid #e0e0e0' }}>
                        <TextField
                          type="time"
                          value={schedule.on2}
                          onChange={(e) => handleScheduleChange(name, 'on2', e.target.value)}
                          size="small"
                          sx={{ width: '100px' }}
                        />
                      </TableCell>
                      <TableCell sx={{ textAlign: 'center', borderLeft: '2px solid #e0e0e0' }}>
                        <TextField
                          type="time"
                          value={schedule.off2}
                          onChange={(e) => handleScheduleChange(name, 'off2', e.target.value)}
                          size="small"
                          sx={{ width: '100px' }}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>

          {/* Appliance Controls - Mobile */}
          <Box sx={{ display: { xs: 'block', md: 'none' } }}>
            {Object.entries(appliances).map(([name, { enabled, schedule }]) => (
              <Paper key={name} sx={{ p: 2, mb: 2, border: '1px solid #e0e0e0' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={enabled}
                        onChange={() => handleApplianceToggle(name)}
                        color="primary"
                        sx={{ marginTop: 0 }}
                      />
                    }
                    label={name}
                    sx={{ 
                      margin: 0,
                      alignItems: 'center',
                      '& .MuiFormControlLabel-label': {
                        marginTop: 0,
                        marginLeft: '2px'
                      },
                      '& .MuiCheckbox-root': {
                        marginTop: 0
                      }
                    }}
                  />
                  <Typography sx={{ ml: 2 }}>{APPLIANCE_LOADS[name]} kW</Typography>
                </Box>

                {/* Time Slot 1 */}
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>Time Slot 1</Typography>
                  <Box sx={{ display: 'flex', gap: 2 }}>
                    <TextField
                      label="ON"
                      type="time"
                      value={schedule.on1}
                      onChange={(e) => handleScheduleChange(name, 'on1', e.target.value)}
                      fullWidth
                      size="small"
                    />
                    <TextField
                      label="OFF"
                      type="time"
                      value={schedule.off1}
                      onChange={(e) => handleScheduleChange(name, 'off1', e.target.value)}
                      fullWidth
                      size="small"
                    />
                  </Box>
                </Box>

                {/* Time Slot 2 */}
                <Box>
                  <Typography variant="subtitle2" gutterBottom>Time Slot 2</Typography>
                  <Box sx={{ display: 'flex', gap: 2 }}>
                    <TextField
                      label="ON"
                      type="time"
                      value={schedule.on2}
                      onChange={(e) => handleScheduleChange(name, 'on2', e.target.value)}
                      fullWidth
                      size="small"
                    />
                    <TextField
                      label="OFF"
                      type="time"
                      value={schedule.off2}
                      onChange={(e) => handleScheduleChange(name, 'off2', e.target.value)}
                      fullWidth
                      size="small"
                    />
                  </Box>
                </Box>
              </Paper>
            ))}
          </Box>
        </Grid>

        {/* Right Column - Results and Visualization */}
        <Grid item xs={12} md={8}>
          {/* Simulation Results */}
          <Box sx={{ display: 'flex', justifyContent: 'center' }}>
            <Paper sx={{ p: 2, mb: 3, border: '1px solid #e0e0e0', width: '100%' }}>
              <Typography variant="h6" gutterBottom sx={{ color: '#1976d2' }}>
                Simulation Results
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <Typography variant="body2" color="text.secondary">Time</Typography>
                  <Typography variant="h6">{formatTime(timeOfDay)}</Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="body2" color="text.secondary">Solar Production</Typography>
                  <Typography variant="h6" color="success.main">{simulation.currentSolar.toFixed(2)} kW</Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="body2" color="text.secondary">House Load</Typography>
                  <Typography variant="h6" color="error.main">{calculateCurrentLoad().toFixed(2)} kW</Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="body2" color="text.secondary">Battery SoC</Typography>
                  <Typography variant="h6" color="primary.main">{simulation.batterySoC.toFixed(1)}%</Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="body2" color="text.secondary">Battery Energy</Typography>
                  <Typography variant="h6">{simulation.batteryEnergy.toFixed(2)} kWh</Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="body2" color="text.secondary">Grid Import</Typography>
                  <Typography variant="h6" color="error.main">{simulation.cumulativeGridImport.toFixed(2)} kWh</Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="body2" color="text.secondary">Grid Export</Typography>
                  <Typography variant="h6" color="success.main">{simulation.cumulativeGridExport.toFixed(2)} kWh</Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="body2" color="text.secondary">House Consumption</Typography>
                  <Typography variant="h6">{simulation.cumulativeHouseConsumption.toFixed(2)} kWh</Typography>
                </Grid>
              </Grid>
            </Paper>
          </Box>
          
          {/* Graph Section */}
          {chartData && (
            <Box sx={{ display: 'flex', justifyContent: 'center' }}>
              <Paper sx={{ p: 2, border: '1px solid #e0e0e0', width: '100%' }}>
                <Typography variant="h6" gutterBottom sx={{ color: '#1976d2' }}>
                  System Performance Over Time
                </Typography>
                <Box sx={{ 
                  width: '100%', 
                  height: { xs: '500px', md: '400px' },
                  '& canvas': {
                    width: '100% !important',
                    height: '100% !important'
                  }
                }}>
                  <Line data={chartData} options={chartOptions} />
                </Box>
              </Paper>
            </Box>
          )}
        </Grid>
      </Grid>
    </Container>
  );
}

export default App;
