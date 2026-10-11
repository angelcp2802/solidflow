/** Preserve the open angular interval: a valid sector must never read as 0° or 360°. */
export function angleText(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const rounded = Number(value.toFixed(3));
  return String(
    value > 0 && value < 360 && (rounded <= 0 || rounded >= 360)
      ? value
      : rounded,
  );
}

/** Keep small nonzero measurements visible without displaying solver noise. */
export function lengthText(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const rounded = Number(value.toFixed(3));
  return String(
    value !== 0 && rounded === 0 ? Number(value.toPrecision(12)) : rounded,
  );
}
