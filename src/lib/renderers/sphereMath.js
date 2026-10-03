const normalize = (v) => {
  const n = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / n, y: v.y / n, z: v.z / n };
};

export function sphereDisplayScale(diameter = 2) {
  return .55 + .45 * Math.max(.25, Math.min(5, Number(diameter) || 2)) / 5;
}

/** Convert normalized device coordinates into the visible sphere's local unit coordinates. */
export function spherePointFromNdc(ndcX, ndcY, { aspect = 1, diameter = 2, yaw = .38, pitch = -.24 } = {}) {
  const halfFov = Math.tan(Math.PI / 8);
  const ray = [ndcX * aspect * halfFov, ndcY * halfFov, -1];
  const rayLength = Math.hypot(...ray) || 1;
  for (let i = 0; i < 3; i++) ray[i] /= rayLength;
  const origin = [0, 0, 3.8];
  const dot = origin[2] * ray[2];
  const radius = sphereDisplayScale(diameter);
  const c = 3.8 ** 2 - radius ** 2;
  const discriminant = dot * dot - c;
  if (discriminant < 0) return null;
  const distance = -dot - Math.sqrt(discriminant);
  if (distance < 0) return null;
  const world = { x: ray[0] * distance / radius, y: ray[1] * distance / radius, z: (origin[2] + ray[2] * distance) / radius };
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const xAfterY = cy * world.x - sy * world.z;
  const zAfterY = sy * world.x + cy * world.z;
  return normalize({ x: xAfterY, y: cp * world.y + sp * zAfterY, z: -sp * world.y + cp * zAfterY });
}
