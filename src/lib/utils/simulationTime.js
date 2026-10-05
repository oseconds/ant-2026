/** Format elapsed simulation milliseconds as mm:ss, switching to hh:mm:ss at one hour. */
export function formatSimulationTime(simulationTimeMs) {
  const milliseconds = Number.isFinite(simulationTimeMs) ? Math.max(0, simulationTimeMs) : 0;
  const totalSeconds = Math.floor(milliseconds / 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60);
  const pad = value => String(value).padStart(2, '0');
  if (minutes >= 60) {
    return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
}
