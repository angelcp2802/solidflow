import type { Shape3D } from 'replicad';
import { copyBodyShape } from './kernel.bodies';
import type { PatternTransform } from './kernel.patterns';

/** Owns the returned topology; the exact current/historical seed remains borrowed. */
export function bodyPatternCopy(seed: Shape3D, transform: PatternTransform): Shape3D {
  const copy = copyBodyShape(seed);
  try {
    if ('translation' in transform) return copy.translate(transform.translation);
    if ('angle' in transform) return copy.rotate(transform.angle, transform.origin, transform.direction);
    return copy.mirror(transform.mirror.normal, transform.mirror.origin);
  } catch (error) {
    try { copy.delete(); } catch (releaseError) { throw new AggregateError([error, releaseError], 'Body copy transform and release failed.'); }
    throw error;
  }
}
