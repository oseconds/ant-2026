export const RECRUITMENT_ORIGIN = Object.freeze({ x: 0.5, y: 0.72 });
export const PHEROMONE_RADII = Object.freeze([0.06, 0.09, 0.12]);
export const DESCRIPTOR_SECTOR_COUNT = 16;
export const DESCRIPTOR_HALF_SATURATION = 0.04;

const TAU = 2 * Math.PI;

/** Pure, descriptive frame metrics. dx/dy are observed displacements over dtSeconds. */
export function describeSnapshot(agentsOrSnapshot, {
  pheromone = agentsOrSnapshot?.pheromone,
  dtSeconds = 1,
  origin = RECRUITMENT_ORIGIN
} = {}) {
  const agents = Array.isArray(agentsOrSnapshot) ? agentsOrSnapshot : agentsOrSnapshot?.agents || [];
  const points = agents.filter(agent => Number.isFinite(agent.x) && Number.isFinite(agent.y));
  const ants = describeAnts(points, origin, dtSeconds);
  return { ants, pheromone: describePheromone(pheromone, origin), flow: describeFlow(points, origin, dtSeconds) };
}

function describeAnts(agents, origin, dtSeconds) {
  const count = agents.length;
  const centroid = weightedCenter(agents.map(({ x, y }) => ({ x, y, weight: 1 })));
  const offsets = agents.map(agent => ({ x: agent.x - origin.x, y: agent.y - origin.y }));
  const covariance = covarianceOf(offsets);
  const eigen = covarianceEigenvalues(covariance);
  const near = offsets.filter(point => Math.hypot(point.x, point.y) <= PHEROMONE_RADII[0]).length;
  const sectors = sectorHistogram(offsets);
  const moving = agents.filter(agent => Number.isFinite(agent.dx) && Number.isFinite(agent.dy));
  const travel = moving.map(agent => ({ dx: agent.dx, dy: agent.dy, speed: Math.hypot(agent.dx, agent.dy) / validDt(dtSeconds) }));
  const nonstationary = travel.filter(item => item.speed > 0);
  let px = 0, py = 0, cross = 0, angularDenominator = 0, absoluteCross = 0, totalSpeed = 0;
  for (const agent of moving) {
    const { dx, dy } = agent;
    const speed = Math.hypot(dx, dy) / validDt(dtSeconds);
    totalSpeed += speed;
    if (!speed) continue;
    px += dx / Math.hypot(dx, dy);
    py += dy / Math.hypot(dx, dy);
    const { x, y } = { x: agent.x - origin.x, y: agent.y - origin.y };
    const moment = x * dy - y * dx;
    const scale = Math.hypot(x, y) * Math.hypot(dx, dy);
    cross += moment;
    absoluteCross += Math.abs(moment);
    angularDenominator += scale;
  }
  const pol = nonstationary.length ? { x: px / nonstationary.length, y: py / nonstationary.length } : null;
  return {
    count,
    centroid: centroid ? { x: centroid.x, y: centroid.y, relativeToNest: { x: centroid.x - origin.x, y: centroid.y - origin.y } } : null,
    gyrationRadius: covariance ? Math.sqrt(covariance.xx + covariance.yy) : null,
    rmsRadiusFromNest: count ? Math.sqrt(offsets.reduce((sum, p) => sum + p.x * p.x + p.y * p.y, 0) / count) : null,
    covariance,
    covarianceEigenvalues: eigen,
    majorAxisAngle: eigen && eigen.major - eigen.minor > 1e-12 ? 0.5 * Math.atan2(2 * covariance.xy, covariance.xx - covariance.yy) : null,
    nestNearFraction: count ? near / count : null,
    angularOccupancy: { sectors, north: halfPlaneFraction(offsets, 'north'), south: halfPlaneFraction(offsets, 'south'), left: halfPlaneFraction(offsets, 'left'), right: halfPlaneFraction(offsets, 'right') },
    movementSampleCount: moving.length,
    meanSpeed: moving.length ? totalSpeed / moving.length : null,
    velocityPolarization: pol ? { ...pol, magnitude: Math.hypot(pol.x, pol.y), angle: Math.hypot(pol.x, pol.y) > 1e-12 ? Math.atan2(pol.y, pol.x) : null } : null,
    angularMomentum: angularDenominator > 0 ? { signed: cross / angularDenominator, absolute: absoluteCross / angularDenominator } : null
  };
}

function describeFlow(agents, origin, dtSeconds) {
  const boundaries = [0, ...PHEROMONE_RADII, Infinity];
  return boundaries.slice(0, -1).map((inner, index) => {
    const outer = boundaries[index + 1];
    const records = agents.filter(agent => {
      const r = Math.hypot(agent.x - origin.x, agent.y - origin.y);
      return r >= inner && r < outer && Number.isFinite(agent.dx) && Number.isFinite(agent.dy);
    });
    let outward = 0, radialRate = 0;
    for (const agent of records) {
      const x = agent.x - origin.x, y = agent.y - origin.y, r = Math.hypot(x, y);
      if (!r) continue;
      const rate = (x * agent.dx + y * agent.dy) / r / validDt(dtSeconds);
      radialRate += rate;
      if (rate > 0) outward += 1;
    }
    return { innerRadius: inner, outerRadius: Number.isFinite(outer) ? outer : null,
      sampleCount: records.length, outwardFraction: records.length ? outward / records.length : null,
      meanRadialSpeed: records.length ? radialRate / records.length : null };
  });
}

function describePheromone(field, origin) {
  const values = field?.values;
  const width = field?.width, height = field?.height;
  let mass = 0, xTotal = 0, yTotal = 0;
  if (values && Number.isInteger(width) && Number.isInteger(height) && values.length >= width * height) {
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
      const weight = Number.isFinite(values[y * width + x]) ? Math.max(0, values[y * width + x]) : 0;
      mass += weight; xTotal += weight * x / (width - 1); yTotal += weight * y / (height - 1);
    }
  }
  const center = mass ? { x: xTotal / mass, y: yTotal / mass } : null;
  let xx = 0, xy = 0, yy = 0;
  if (center) for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const weight = Number.isFinite(values[y * width + x]) ? Math.max(0, values[y * width + x]) : 0;
    const dx = x / (width - 1) - center.x, dy = y / (height - 1) - center.y;
    xx += weight * dx * dx; xy += weight * dx * dy; yy += weight * dy * dy;
  }
  const sectors = Array(DESCRIPTOR_SECTOR_COUNT).fill(0);
  for (let sector = 0; sector < sectors.length; sector += 1) {
    const angle = TAU * sector / sectors.length;
    for (const radius of PHEROMONE_RADII) {
      const value = sample(field, origin.x + Math.cos(angle) * radius, origin.y + Math.sin(angle) * radius);
      sectors[sector] += value / (value + DESCRIPTOR_HALF_SATURATION) / PHEROMONE_RADII.length;
    }
  }
  const sx = sectors.reduce((sum, value, i) => sum + value * Math.cos(TAU * i / sectors.length), 0);
  const sy = sectors.reduce((sum, value, i) => sum + value * Math.sin(TAU * i / sectors.length), 0);
  const sectorWeight = sectors.reduce((a, b) => a + b, 0);
  const activation = [...sectors].sort((a, b) => b - a).slice(0, 4).reduce((sum, value) => sum + value, 0) / 4;
  const cov = center ? { xx: xx / mass, xy: xy / mass, yy: yy / mass } : null;
  return { mass: mass || 0, centroid: center, covariance: cov,
    activation: sectorWeight ? activation : null, sectors,
    orientation: sectorWeight && Math.hypot(sx, sy) > sectorWeight * 1e-12
      ? { angle: Math.atan2(sy, sx), concentration: Math.hypot(sx, sy) / sectorWeight } : null };
}

function sample(field, x, y) {
  if (!field?.values || !Number.isInteger(field.width) || !Number.isInteger(field.height) || x < 0 || x > 1 || y < 0 || y > 1) return 0;
  const gx = x * (field.width - 1), gy = y * (field.height - 1), x0 = Math.floor(gx), y0 = Math.floor(gy);
  const x1 = Math.min(field.width - 1, x0 + 1), y1 = Math.min(field.height - 1, y0 + 1), tx = gx - x0, ty = gy - y0;
  const at = (cx, cy) => Number.isFinite(field.values[cy * field.width + cx]) ? Math.max(0, field.values[cy * field.width + cx]) : 0;
  const top = at(x0, y0) * (1 - tx) + at(x1, y0) * tx;
  const bottom = at(x0, y1) * (1 - tx) + at(x1, y1) * tx;
  return top * (1 - ty) + bottom * ty;
}

function weightedCenter(points) {
  if (!points.length) return null;
  const sum = points.reduce((center, p) => ({ x: center.x + p.x, y: center.y + p.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
}
function covarianceOf(points) {
  if (!points.length) return null;
  const mx = points.reduce((s, p) => s + p.x, 0) / points.length, my = points.reduce((s, p) => s + p.y, 0) / points.length;
  return points.reduce((c, p) => ({ xx: c.xx + (p.x - mx) ** 2 / points.length, xy: c.xy + (p.x - mx) * (p.y - my) / points.length, yy: c.yy + (p.y - my) ** 2 / points.length }), { xx: 0, xy: 0, yy: 0 });
}
function covarianceEigenvalues(c) {
  if (!c) return null;
  const d = Math.hypot(c.xx - c.yy, 2 * c.xy);
  return { major: Math.max(0, (c.xx + c.yy + d) / 2), minor: Math.max(0, (c.xx + c.yy - d) / 2) };
}
function sectorHistogram(points) {
  const sectors = Array(DESCRIPTOR_SECTOR_COUNT).fill(0);
  if (!points.length) return sectors;
  for (const { x, y } of points) {
    let sector = Math.floor((((Math.atan2(y, x) + TAU) % TAU) / TAU) * sectors.length);
    sectors[sector] += 1 / points.length;
  }
  return sectors;
}
function halfPlaneFraction(points, side) {
  if (!points.length) return null;
  return points.filter(p => side === 'north' ? p.y < 0 : side === 'south' ? p.y >= 0 : side === 'left' ? p.x < 0 : p.x >= 0).length / points.length;
}
function validDt(value) { return Number.isFinite(value) && value > 0 ? value : 1; }
