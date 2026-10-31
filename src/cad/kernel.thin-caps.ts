import type { Shape3D } from 'replicad';
import { bodyBoolean } from './kernel.bodies';
import { offsetPlaneFrame } from './kernel.frames';
import { withNativeOwners } from './kernel.native-ownership';
import { entityProfileSolid, JOIN_TOLERANCE } from './kernel.profiles';
import type { PreparedThinSection } from './kernel.thin-wall';
import type { PlaneFrame, Plane, ThinWallDefinition } from './kernel.types';

/**
 * Internal caps within the caller's signed axial envelope. Profiles are borrowed
 * from the already-solved section; only the successfully returned solid is owned.
 * Context eligibility is checked before entering any automatic-end factory.
 */
export function buildThinWallEndCaps(section: PreparedThinSection, definition: ThinWallDefinition,
  plane: Plane, offset: number, depth: number, frame?: PlaneFrame): Shape3D {
  const caps = definition.endCaps;
  if (!caps?.enabled) throw new Error('Las tapas requieren una declaración activa.');
  if (section.openComponents !== 0 || section.closedRegions.length !== 1) {
    throw new Error('Tapas de pared delgada: requieren una única región cerrada simple.');
  }
  const thickness = caps.thickness, coreLength = Math.abs(depth) - 2 * thickness;
  if (!Number.isFinite(depth) || !Number.isFinite(thickness) || thickness <= 0 || !Number.isFinite(offset)
    || !Number.isFinite(coreLength) || coreLength <= JOIN_TOLERANCE) {
    throw new Error('Tapas de pared delgada: debe quedar un núcleo axial mayor que la tolerancia de unión.');
  }
  const shift = Math.sign(depth) * thickness, region = section.closedRegions[0];
  const coreFrame = frame ? offsetPlaneFrame(frame, shift) : undefined;
  const derivedArcs = !!definition.autoCorners?.enabled;
  return withNativeOwners(owners => {
    const outer = owners.own(entityProfileSolid(region.outer, plane, offset,
      { type: 'extrude', depth }, frame, derivedArcs));
    const core = owners.own(entityProfileSolid(region.inner, plane, offset + shift,
      { type: 'extrude', depth: Math.sign(depth) * coreLength }, coreFrame, derivedArcs));
    return owners.own(bodyBoolean('subtract', outer, core));
  }, result => [result], 'Thin-wall axial caps construction or release failed.');
}
