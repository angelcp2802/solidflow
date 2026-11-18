import type { Shape3D } from 'replicad';
import { bodyBoolean } from './kernel.bodies';
import { withNativeOwners } from './kernel.native-ownership';
import type { UntilNextCutResolution } from './kernel.until-next-resolution';

export interface NativeDirectionTool {
  /** Each closure borrows the same pre-operation owner and returns a fresh owned tool. */
  build(): Shape3D;
  /** Only the existing exact-owner native forward classifier can prove an absent ray. */
  observeForward?: () => UntilNextCutResolution;
  untilNext?: boolean;
}
export type DirectionToolResolution = { kind: 'complete'; tool: Shape3D }
  | { kind: 'empty-forward'; topologyFreeCompound: true; distanceMm: number };

/** Atomic union; an error in either branch publishes neither result. */
export function resolveDirectionTools(branches: readonly NativeDirectionTool[], allowSeparatedMiss: boolean,
  validateTool: (shape: Shape3D) => void): DirectionToolResolution {
  if (branches.length !== 2) throw Error('La resolución bilateral requiere exactamente dos ramas.');
  return withNativeOwners<DirectionToolResolution>(owners => {
    const tools: Shape3D[] = [], distances: number[] = [];
    for (const branch of branches) {
      if (allowSeparatedMiss && branch.observeForward) {
        const observation = branch.observeForward();
        if (observation.kind === 'empty-forward') { distances.push(observation.distanceMm); continue; }
        if (observation.kind === 'contact-or-near') throw Error('El perfil toca o está demasiado cerca de un cuerpo en una de las direcciones.');
        if (observation.kind === 'incomplete-limit' && branch.untilNext) throw observation.error;
        if (observation.kind === 'complete') {
          const probe = owners.own(observation.tool);
          if (branch.untilNext) { validateTool(probe); tools.push(probe); continue; }
          owners.release(probe);
        }
      }
      const tool = owners.own(branch.build()); validateTool(tool); tools.push(tool);
    }
    if (!tools.length) {
      if (distances.length !== branches.length || !distances.every(value => Number.isFinite(value) && value > 0)) {
        throw Error('La ausencia de ambas direcciones requiere pruebas nativas completas.');
      }
      return { kind: 'empty-forward', topologyFreeCompound: true, distanceMm: Math.min(...distances) };
    }
    let result = tools[0];
    for (const next of tools.slice(1)) result = owners.own(bodyBoolean('add', result, next));
    validateTool(result); return { kind: 'complete', tool: result };
  }, result => result.kind === 'complete' ? [result.tool] : [], 'Independent direction construction or release failed.');
}
