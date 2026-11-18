import { expect, it } from 'vitest';
import { solveRigidMates } from './assemblySolver';
import { evaluateRigidMates } from './assemblyMateEquations';
import { identityRigidPose, rigidRotationMatrix, type Quaternion } from './rigidPose';
import type { RigidMateEndpoint, RigidMateProblem, RigidMateSupport } from './assemblySolveTypes';

// Pure numerical supports, not native witness authority. Literal Rz30 oracles.
const sine = Math.sin(Math.PI / 12), cosine = Math.cos(Math.PI / 12);
const line = (axis: [number, number, number] = [0, 0, 1]): RigidMateSupport => ({ kind: 'line', point: [0, 0, 0], axis, tolerance: 0 });
const endpoint = (bodyId: string | null, support = line()): RigidMateEndpoint => ({ bodyId, frame: identityRigidPose(), support });
function problem(reverse = false, sign = 1): RigidMateProblem {
  const capture = [0, 0, (reverse ? 1 : -1) * sine * sign, cosine * sign] as Quaternion;
  return { bodies: [{ id: 'moving', fixed: false, pose: { translation: [0, 0, 12], rotation: [0, 0, .5, Math.sqrt(3) / 2] } }],
    constraints: [{ id: 'axis', type: 'concentric', first: endpoint(reverse ? null : 'moving'), second: endpoint(reverse ? 'moving' : null), alignment: 'aligned', rotationLock: capture }],
    origin: [0, 0, 0], lengthScale: 10, lengthTolerance: 1e-6, angleTolerance: 1e-8 };
}

it.each([false, true].flatMap(reverse => [1, -1].map(sign => ({ reverse, sign }))))(
  'locks only relative spin with ordered roles reverse=$reverse quaternion sign=$sign', ({ reverse, sign }) => {
    const input = problem(reverse, sign), before = JSON.stringify(input);
    const free = structuredClone(input); if (free.constraints[0].type !== 'concentric') throw Error('concentric'); free.constraints[0].rotationLock = null;
    expect(solveRigidMates(free).localDOF).toBe(2);
    const equations = evaluateRigidMates(input);
    expect(equations.diagnostics).toEqual([]); expect(equations.rows).toHaveLength(9);
    for (const row of equations.rows) expect(row.jacobian[2]).toBe(0);
    const result = solveRigidMates(input);
    expect(result.status).toBe('underdefined'); expect(result.localDOF).toBe(1); expect(result.rank).toBe(5);
    const pose = result.poses!.get('moving')!;
    expect(pose.translation[2]).toBeCloseTo(12, 8);
    const expected = [Math.sqrt(3) / 2, -.5, 0, .5, Math.sqrt(3) / 2, 0, 0, 0, 1];
    rigidRotationMatrix(pose.rotation).forEach((value, index) => expect(value).toBeCloseTo(expected[index], 8));
    expect(JSON.stringify(input)).toBe(before);
  });

it.each(['aligned', 'opposed'] as const)('locks different local axes on the %s branch', alignment => {
  const input = problem(), direction = alignment === 'aligned' ? -1 : 1;
  input.bodies[0].pose.rotation = [0, direction * Math.SQRT1_2, 0, Math.SQRT1_2];
  input.constraints = [{ id: 'different-axes', type: 'concentric', first: endpoint('moving', line([1, 0, 0])), second: endpoint(null),
    alignment, rotationLock: [0, -direction * Math.SQRT1_2, 0, Math.SQRT1_2] }];
  const result = solveRigidMates(input);
  expect(result.status).toBe('underdefined'); expect(result.localDOF).toBe(1);
  expect(result.poses!.get('moving')!.translation).toEqual([0, 0, 12]);
});

it('keeps six common rigid gauge freedoms for two floating locked line owners', () => {
  const input = problem();
  input.bodies[0].pose.rotation = [0, 0, sine, cosine];
  input.bodies.push({ id: 'other', fixed: false, pose: identityRigidPose() });
  if (input.constraints[0].type !== 'concentric') throw Error('concentric');
  input.constraints[0].second = endpoint('other');
  const result = solveRigidMates(input);
  expect(result.status).toBe('underdefined'); expect(result.rank).toBe(5); expect(result.localDOF).toBe(7);
});
