/** Convert wall-clock frames to UI-only simulation timestamps without changing fixed tick semantics. */
export function advanceAntClock(clock, wallTimeMs, speed, paused) {
  if (clock.wallTimeMs === null) {
    clock.wallTimeMs = wallTimeMs;
    clock.simulationTimeMs = wallTimeMs;
    return paused ? [] : [wallTimeMs];
  }

  let elapsed = Math.max(0, wallTimeMs - clock.wallTimeMs);
  clock.wallTimeMs = wallTimeMs;
  if (paused) return [];
  if (speed !== 1) elapsed = Math.min(elapsed, 100); // shortcut: cap non-1x gaps at the controller frame limit; revisit if that limit changes.

  let remaining = elapsed * speed;
  if (speed === 1 || remaining <= 100) {
    clock.simulationTimeMs += remaining;
    return [clock.simulationTimeMs];
  }

  const timestamps = [];
  while (remaining > 100) {
    clock.simulationTimeMs += 100;
    timestamps.push(clock.simulationTimeMs);
    remaining -= 100;
  }
  clock.simulationTimeMs += remaining;
  timestamps.push(clock.simulationTimeMs);
  return timestamps;
}
