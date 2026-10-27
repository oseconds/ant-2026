export const CONTACT_REVEAL_DELAY_CANDIDATES = Object.freeze([
  Object.freeze({ seconds: 0.5, ticks: 30 }),
  Object.freeze({ seconds: 1, ticks: 60 }),
  Object.freeze({ seconds: 2, ticks: 120 }),
  Object.freeze({ seconds: 3, ticks: 180 })
]);

export function selectContactRevealDelay(measurements, minimumAwayFraction = 0.75) {
  if (!Array.isArray(measurements) || !(minimumAwayFraction > 0 && minimumAwayFraction <= 1)
    || measurements.length !== CONTACT_REVEAL_DELAY_CANDIDATES.length) {
    throw new TypeError('Invalid contact reveal delay measurements.');
  }
  for (const [index, row] of measurements.entries()) {
    const candidate = CONTACT_REVEAL_DELAY_CANDIDATES[index];
    if (row.seconds !== candidate.seconds || row.ticks !== candidate.ticks
      || !Number.isInteger(row.eligibleCount) || row.eligibleCount < 0
      || !Number.isInteger(row.availableCount) || row.availableCount < 0 || row.availableCount > row.eligibleCount
      || !Number.isInteger(row.atLeast12PxCount) || row.atLeast12PxCount < 0 || row.atLeast12PxCount > row.availableCount) {
      throw new TypeError('Delay measurements do not match the registered candidates.');
    }
  }
  return measurements.find(row => row.eligibleCount > 0
    && row.atLeast12PxCount / row.eligibleCount >= minimumAwayFraction) ?? null;
}

export function selectContactRevealEvents(events, endpointTick, delayTicks) {
  if (!Array.isArray(events) || !Number.isInteger(endpointTick) || !Number.isInteger(delayTicks) || delayTicks < 0) {
    throw new TypeError('Invalid contact reveal event selection.');
  }
  return events.filter(event => Number.isInteger(event.tick) && event.tick <= endpointTick - delayTicks);
}
