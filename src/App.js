import React, { useState } from "react";
import { Sun, BatteryFull, Zap } from "lucide-react";
import "./App.css"; // optional, if you want to add styling later

const solarGeneration = [
  0, 0, 0, 0, 0, 1, 3, 6, 8, 10, 11, 12,
  11, 9, 6, 3, 1, 0, 0, 0, 0, 0, 0, 0,
];

const homeUsage = [
  1, 1, 1, 1, 1, 2, 3, 3, 4, 5, 5, 4,
  4, 5, 6, 5, 4, 4, 4, 4, 3, 2, 2, 1,
];

function App() {
  const [hour, setHour] = useState(12);
  const [withBattery, setWithBattery] = useState(true);

  const solar = solarGeneration[hour];
  const usage = homeUsage[hour];

  let battery = 0;
  let grid = 0;

  if (withBattery) {
    if (solar >= usage) {
      battery = Math.min(100, (solar - usage) * 10);
    } else {
      battery = Math.max(0, 100 - (usage - solar) * 5);
    }
  } else {
    grid = usage - solar;
    if (grid < 0) grid = 0;
  }

  return (
    <div className="p-6 max-w-2xl mx-auto font-sans">
      <h1 className="text-3xl font-bold mb-4">A Day in the Life: Solar Simulator</h1>
      <p className="mb-4 text-gray-600">
        Slide through the day to see how your solar system performs with and without a battery.
      </p>

      <div className="flex items-center gap-4 mb-4">
        <span className="text-sm">0:00</span>
        <input
          type="range"
          min="0"
          max="23"
          step="1"
          value={hour}
          onChange={(e) => setHour(Number(e.target.value))}
          className="w-full"
        />
        <span className="text-sm">23:00</span>
      </div>

      <div className="mb-4">
        <button
          onClick={() => setWithBattery(!withBattery)}
          className="px-4 py-2 border rounded-md bg-gray-100 hover:bg-gray-200"
        >
          {withBattery ? "With Battery" : "Without Battery"}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 border rounded-md text-center">
          <Sun className="mx-auto mb-2" />
          <p className="text-sm text-gray-500">Solar Output</p>
          <p className="text-lg font-semibold">{solar} kWh</p>
        </div>

        <div className="p-4 border rounded-md text-center">
          <BatteryFull className="mx-auto mb-2" />
          <p className="text-sm text-gray-500">Battery Level</p>
          <p className="text-lg font-semibold">
            {withBattery ? `${battery}%` : "N/A"}
          </p>
        </div>

        <div className="p-4 border rounded-md text-center">
          <Zap className="mx-auto mb-2" />
          <p className="text-sm text-gray-500">Grid Usage</p>
          <p className="text-lg font-semibold">
            {withBattery ? (usage > solar ? `${usage - solar} kWh` : "0 kWh") : `${grid} kWh`}
          </p>
        </div>
      </div>
    </div>
  );
}

export default App;

