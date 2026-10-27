export const MIN_RELOCATED_SEPARATION_PX = 12;

const TRANSFORMS = Object.freeze([
  'rotate-180', 'reflect-x', 'reflect-y', 'rotate-90-cw', 'rotate-90-ccw',
  'reflect-diagonal', 'reflect-antidiagonal'
]);
export const RELOCATION_TRANSFORMS = TRANSFORMS;

export function plateMaskCentroid(plate) {
  const width = Number(plate?.grid?.width), height = Number(plate?.grid?.height), mask = plate?.mask;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2
    || !mask || mask.length !== width * height) throw new TypeError('Invalid Plate support mask.');
  let count = 0, xTotal = 0, yTotal = 0;
  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index] !== 1) continue;
    count += 1;
    xTotal += index % width;
    yTotal += Math.floor(index / width);
  }
  if (!count) throw new TypeError('Plate support mask is empty.');
  return { x: xTotal / count / (width - 1), y: yTotal / count / (height - 1) };
}

export function relocateContact(point, center, transform) {
  const dx = point.x - center.x, dy = point.y - center.y;
  let x, y;
  switch (transform) {
    case 'rotate-180': x = -dx; y = -dy; break;
    case 'reflect-x': x = -dx; y = dy; break;
    case 'reflect-y': x = dx; y = -dy; break;
    case 'rotate-90-cw': x = -dy; y = dx; break;
    case 'rotate-90-ccw': x = dy; y = -dx; break;
    case 'reflect-diagonal': x = dy; y = dx; break;
    case 'reflect-antidiagonal': x = -dy; y = -dx; break;
    default: throw new RangeError(`Unknown Plate-local relocation: ${transform}`);
  }
  return { x: center.x + x, y: center.y + y };
}

/** Select one deterministic Plate-local isometry using support and distance only. */
export function selectRelocationRule({ contacts, centers, isSupported, minSeparationPx = MIN_RELOCATED_SEPARATION_PX,
  width = 640, height = 640, minimumValidRatio = 0.9 }) {
  if (!Array.isArray(contacts) || typeof isSupported !== 'function' || contacts.length === 0
    || !(width > 0) || !(height > 0) || !(minSeparationPx > 0)) throw new TypeError('Invalid relocation audit.');
  const candidates = TRANSFORMS.map((transform, order) => {
    const placements = contacts.map((contact) => {
      const center = centers[contact.plateId];
      if (!center) throw new TypeError(`Missing centroid for ${contact.plateId}.`);
      const target = relocateContact(contact.position, center, transform);
      const inWorld = target.x >= 0 && target.x <= 1 && target.y >= 0 && target.y <= 1;
      const supported = inWorld && isSupported(target, contact.plateId, contact, transform);
      const separationPx = Math.hypot((target.x - contact.position.x) * width,
        (target.y - contact.position.y) * height);
      return { contactId: contact.id, target, sourcePixel: nativePixel(contact.position, width, height), supported, separationPx,
        valid: supported && separationPx >= minSeparationPx };
    });
    const valid = placements.filter((placement) => placement.valid);
    const targetPixels = new Set(valid.map(({ target }) => nativePixel(target, width, height)));
    const samePixels = valid.reduce((count, placement) => count
      + Number(nativePixel(placement.target, width, height) === placement.sourcePixel), 0);
    const distances = valid.map(({ separationPx }) => separationPx).sort((a, b) => a - b);
    return { transform, order, sourceCount: contacts.length, validCount: valid.length,
      supportCount: placements.filter(({ supported }) => supported).length,
      validRatio: valid.length / contacts.length, uniqueTargetPixels: targetPixels.size,
      sameNativePixelCount: samePixels,
      medianSeparationPx: distances.length ? distances[Math.floor((distances.length - 1) / 2)] : null,
      placements };
  });
  candidates.sort((a, b) => b.validCount - a.validCount || b.uniqueTargetPixels - a.uniqueTargetPixels
    || a.sameNativePixelCount - b.sameNativePixelCount || a.order - b.order);
  const best = candidates[0];
  return { ...best, accepted: best.validRatio >= minimumValidRatio
    && best.medianSeparationPx >= minSeparationPx,
  candidates: candidates.map(({ placements, ...candidate }) => candidate) };
}

function nativePixel(point, width, height) {
  const x = Math.min(width - 1, Math.max(0, Math.floor(point.x * width)));
  const y = Math.min(height - 1, Math.max(0, Math.floor(point.y * height)));
  return y * width + x;
}
