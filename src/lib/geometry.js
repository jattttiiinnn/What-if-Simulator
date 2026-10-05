/**
 * Pure geometry helpers for the constellation.
 * Distance from the hero star encodes typical transition time; star size
 * and connector thickness both encode observed transition share.
 */

// Bracket the validated demo range (1.63–3.50 yrs) rather than the older
// synthetic 1.5–4 yrs, so the three real destinations use the full span of
// rings instead of crowding the inner edge.
export const TIME_MIN_YEARS = 1.6;
export const TIME_MAX_YEARS = 3.6;

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const lerp = (a, b, t) => a + (b - a) * t;

/** Evenly spaced angles in degrees, first one pointing straight up. */
export function satelliteAngles(count) {
  if (count <= 0) return [];
  const step = 360 / count;
  return Array.from({ length: count }, (_, i) => -90 + i * step);
}

/**
 * Angles for destination stars: evenly spread inside a sector aimed at the
 * satellite's direction from centre, so branches read as "that way".
 */
export function destinationAngles(baseAngle, count) {
  if (count <= 0) return [];
  if (count === 1) return [baseAngle];
  const spread = Math.min(70, 22 * count);
  return Array.from({ length: count }, (_, i) =>
    baseAngle - spread / 2 + (spread * i) / (count - 1)
  );
}

export function polarToXY(cx, cy, radius, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
}

/**
 * Polar placement on an ellipse: `aspectY` stretches the sky vertically on
 * portrait phones so the rings use the tall axis instead of piling up.
 */
export function project(cx, cy, radius, angleDeg, aspectY = 1) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(rad),
    y: cy + radius * Math.sin(rad) * aspectY,
  };
}

/** Responsive radii: the whole sky has to stay on screen at 375px wide. */
export function computeLayout(width, height) {
  const usable = Math.min(width, height * 0.9);
  const compact = width < 520;
  const factor = compact ? 0.46 : 0.42;
  const radiusMax = clamp(usable * factor, 132, 380);
  const radiusMin = radiusMax * (compact ? 0.46 : 0.42);
  return {
    radiusMin,
    radiusMax,
    // Satellites hug the hero star, but never so close that their labels
    // collide with the role label sitting under the star.
    satelliteRadius: clamp(
      Math.min(radiusMax * 0.34, radiusMin * 0.68),
      Math.min(66, radiusMin * 0.88),
      118
    ),
    heroSize: clamp(radiusMax * 0.17, 44, 76),
    sizeScale: clamp(radiusMax / 320, 0.62, 1.1),
    aspectY: clamp(height / Math.max(width, 1), 1, 1.6),
  };
}

/** TIME_MIN_YEARS -> near ring, TIME_MAX_YEARS -> far ring, linear between. */
export function yearsToRadius(years, layout) {
  const { radiusMin, radiusMax } = layout;
  if (!Number.isFinite(years)) return radiusMin;
  const t = clamp((years - TIME_MIN_YEARS) / (TIME_MAX_YEARS - TIME_MIN_YEARS), 0, 1);
  return lerp(radiusMin, radiusMax, t);
}

/** Star diameter in px from observed transition share (0-100-ish). */
export function shareToSize(share, sizeScale = 1) {
  const value = Number.isFinite(share) ? clamp(share, 0, 60) : 0;
  return (17 + (value / 60) * 27) * sizeScale;
}

/** Connector thickness scaled against the biggest share currently on screen. */
export function shareToStroke(share, maxShare) {
  if (!Number.isFinite(share) || share <= 0 || !maxShare) return 1;
  return 1 + 3.2 * (share / maxShare);
}
