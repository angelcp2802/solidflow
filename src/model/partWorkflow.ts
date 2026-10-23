import type { BodyReference, PickableBody, SketchFeature } from '../cad/kernel.types';
import { createFaceSelectionIndex } from '../cad/selection.references';
import { sameBodyReference } from './bodyCommands';

/** Draft defaults only. Native preview and Apply still validate the operation. */
export function initialPartTargets(
  bodies: readonly PickableBody[],
  selected: readonly BodyReference[],
  sketch: SketchFeature,
): BodyReference[] {
  if (new Set(bodies.map(body => body.ref.bodyId)).size !== bodies.length) return [];
  if (selected.length) {
    if (new Set(selected.map(ref => ref.bodyId)).size !== selected.length ||
      selected.some(ref => bodies.filter(body => sameBodyReference(body.ref, ref)).length !== 1)) return [];
    return selected.map(ref => ({ ...ref }));
  }
  if (sketch.support?.kind === 'face') {
    const face = createFaceSelectionIndex(bodies.flatMap(body => body.faces)).find(sketch.support.face);
    if (!face) return [];
    const owners = bodies.filter(body => body.faces.includes(face));
    return owners.length === 1 ? [{ ...owners[0].ref }] : [];
  }
  return bodies.length === 1 ? [{ ...bodies[0].ref }] : [];
}
