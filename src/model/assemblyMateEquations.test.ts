import { expect, it } from 'vitest';
import type { Vec3 } from '../cad/kernel.types';
import { evaluateRigidMates } from './assemblyMateEquations';
import { retractRigidBodyPose, rotationExp } from './assemblyKinematics';
import type { RigidBinaryMateConstraint as RigidMateConstraint, RigidMateEndpoint, RigidMateProblem, RigidMateSupport } from './assemblySolveTypes';
type BinaryMateProblem = Omit<RigidMateProblem, 'constraints'> & { constraints: RigidMateConstraint[] }
import { identityRigidPose, type Quaternion, type RigidPose } from './rigidPose';
import type { AssemblyCylinderTangentBranch, AssemblyCylinderTangentMateType } from './assemblyCylinderTangentMates';
import type { AssemblySphereTangentBranch, AssemblySphereTangentMateType } from './assemblySphereTangentMates';
import type { AssemblyTangentSide } from './assemblyTangentMates';

// Original Cartesian supports and rational oracles, numerical input only.
// No fixtures imply native-reference freshness, accepted assembly poses or DOF.
function close(actual: readonly number[], expected: readonly number[], tolerance = 1e-10): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((v, i) => { expect(Number.isFinite(v)).toBe(true); expect(Math.abs(v - expected[i])).toBeLessThanOrEqual(tolerance); });
}
function plane(point: Vec3 = [0, 0, 0], normal: Vec3 = [0, 0, 1], xDirection: Vec3 = [1, 0, 0], tolerance = 0): RigidMateSupport {
  return { kind: 'plane', point, normal, xDirection, tolerance };
}
function cylinder(point: Vec3 = [0, 0, 0], axis: Vec3 = [0, 0, 1], radius = 2): RigidMateSupport {
  return { kind: 'cylinder', point, axis, xDirection: [1, 0, 0], radius, tolerance: 0 };
}
function endpoint(bodyId: string | null, support?: RigidMateSupport, frame = identityRigidPose()): RigidMateEndpoint {
  return { bodyId, frame, ...(support ? { support } : {}) };
}
function problem(constraints: RigidMateConstraint[], bodies: RigidMateProblem['bodies'] = [{ id: 'A', pose: identityRigidPose(), fixed: false }]): BinaryMateProblem {
  return { bodies, constraints, origin: [0, 0, 0], lengthScale: 1, lengthTolerance: 1e-6, angleTolerance: 1e-8 };
}
function regular(type: 'concentric' | 'coincident' | 'distance' | 'angle' | 'lock', lock = false): BinaryMateProblem {
  const frameA: RigidPose = { translation: [1, 2, -1], rotation: rotationExp([.1, .2, -.1]) };
  const frameB: RigidPose = { translation: [-2, 1, 3], rotation: rotationExp([-.2, .1, .15]) };
  const supportA = type === 'concentric' ? cylinder([.5, -1, 2]) : plane([.5, -1, 2]);
  const supportB = type === 'concentric' ? cylinder([-1, .25, 1], [0, 0, 1], 3) : plane([-1, .25, 1]);
  const first = endpoint('A', type === 'lock' ? undefined : supportA, frameA), second = endpoint('B', type === 'lock' ? undefined : supportB, frameB);
  let mate: RigidMateConstraint;
  if (type === 'concentric') mate = { id: 'M', type, first, second, alignment: 'aligned', rotationLock: lock ? rotationExp([.15, -.1, .08]) : null };
  else if (type === 'coincident') mate = { id: 'M', type, first, second, alignment: 'aligned' };
  else if (type === 'distance') mate = { id: 'M', type, first, second, alignment: 'opposed', distance: -2.25 };
  else if (type === 'angle') mate = { id: 'M', type, first, second, angle: 37 };
  else mate = { id: 'M', type, first, second, relativePose: { translation: [.3, -.2, .1], rotation: rotationExp([.15, -.1, .08]) } };
  return problem([mate], [{ id: 'A', fixed: false, pose: { translation: [3, -2, 1], rotation: rotationExp([.2, -.1, .3]) } },
    { id: 'B', fixed: false, pose: { translation: [-1, 4, 2], rotation: rotationExp([-.1, .3, -.2]) } }]);
}
function finiteDifferences(input: RigidMateProblem): void {
  const base = evaluateRigidMates(input); expect(base.diagnostics).toEqual([]);
  const free = input.bodies.filter(body => !body.fixed);
  for (const h of [2e-6, 7e-7]) for (let column = 0; column < free.length * 6; column++) {
    const body = free[Math.floor(column / 6)], delta = Array(6).fill(0) as number[]; delta[column % 6] = h;
    const plus = evaluateRigidMates(input, new Map([[body.id, retractRigidBodyPose(body.pose, delta, input.origin, input.lengthScale)]]));
    delta[column % 6] = -h;
    const minus = evaluateRigidMates(input, new Map([[body.id, retractRigidBodyPose(body.pose, delta, input.origin, input.lengthScale)]]));
    expect(plus.diagnostics).toEqual([]); expect(minus.diagnostics).toEqual([]);
    expect(plus.rows).toHaveLength(base.rows.length); expect(minus.rows).toHaveLength(base.rows.length);
    base.rows.forEach((row, i) => {
      const expected = (plus.rows[i].residual - minus.rows[i].residual) / (2 * h);
      expect(Math.abs(row.jacobian[column] - expected)).toBeLessThanOrEqual(2e-7 * Math.max(1, Math.abs(expected)));
    });
  }
}

it('exposes six concentric rows with four independent Cartesian pivots and axial/spin null columns', () => {
  const input = problem([{ id: 'C', type: 'concentric', first: endpoint('A', cylinder()), second: endpoint(null, cylinder([0, 0, 9], [0, 0, 1], 3)), alignment: 'aligned', rotationLock: null }]);
  const result = evaluateRigidMates(input); expect(result.diagnostics).toEqual([]); expect(result.rows).toHaveLength(6);
  close(result.rows.map(row => row.residual), Array(6).fill(0));
  close(result.rows[0].jacobian, [1, 0, 0, 0, 0, 0]); close(result.rows[1].jacobian, [0, 1, 0, 0, 0, 0]);
  close(result.rows[3].jacobian, [0, 0, 0, 0, 1, 0]); close(result.rows[4].jacobian, [0, 0, 0, -1, 0, 0]);
  result.rows.forEach(row => { expect(row.jacobian[2]).toBe(0); expect(row.jacobian[5]).toBe(0); });
});
it('measures a cylinder-line offset without requiring equal radii or equal axis origins', () => {
  const input = problem([{ id: 'C', type: 'concentric', first: endpoint('A', cylinder([2, 3, 7], [0, 0, 1], .25)), second: endpoint(null, cylinder([0, 0, -5], [0, 0, 1], 8)), alignment: 'aligned', rotationLock: null }]);
  const result = evaluateRigidMates(input); close(result.rows.map(row => row.residual), [2, 3, 0, 0, 0, 0]);
  expect(Math.abs(result.maxLengthResidual - Math.sqrt(13))).toBeLessThan(1e-10); expect(result.maxAngleResidual).toBe(0);
});
it('differentiates the moving second cylinder axis rather than only its point', () => {
  const input = problem([{ id: 'C', type: 'concentric', first: endpoint('A', cylinder([2, 3, 7])), second: endpoint('B', cylinder()), alignment: 'aligned', rotationLock: null }],
    [{ id: 'A', pose: identityRigidPose(), fixed: false }, { id: 'B', pose: identityRigidPose(), fixed: false }]);
  const rows = evaluateRigidMates(input).rows;
  // The rotating target-frame coordinates remove omegaB cross the line error.
  close(rows.slice(0, 3).map(row => row.jacobian[9]), [0, 7, 0]); close(rows.slice(3).map(row => row.jacobian[9]), [0, 1, 0]);
});
it('retains an explicitly opposed cylinder branch', () => {
  const input = problem([{ id: 'C', type: 'concentric', first: endpoint('A', cylinder()), second: endpoint(null, cylinder([0, 0, 4], [0, 0, -1])), alignment: 'opposed', rotationLock: null }]);
  const result = evaluateRigidMates(input); expect(result.diagnostics).toEqual([]); close(result.rows.map(row => row.residual), Array(6).fill(0));
});
it('uses signed plane distance and its normalized physical tolerance', () => {
  const input = problem([{ id: 'D', type: 'distance', first: endpoint('A', plane([0, 0, 5])), second: endpoint(null, plane()), alignment: 'aligned', distance: 3 }]); input.lengthScale = 2;
  const result = evaluateRigidMates(input); close(result.rows.map(row => row.residual), [1, 0, 0, 0]); close(result.rows[0].jacobian, [0, 0, 1, 0, 0, 0]);
  expect(result.maxLengthResidual).toBe(2); expect(result.rows[0].tolerance).toBe(5e-7); expect(result.rows[1].tolerance).toBe(1e-8);
});
it('keeps native support uncertainty in the length-row tolerance', () => {
  const input = problem([{ id: 'P', type: 'coincident', first: endpoint('A', plane([0, 0, 0], [0, 0, 1], [1, 0, 0], 2e-6)), second: endpoint(null, plane([0, 0, 0], [0, 0, 1], [1, 0, 0], 3e-6)), alignment: 'aligned' }]);
  input.lengthScale = 10; expect(evaluateRigidMates(input).rows[0].tolerance).toBeCloseTo(5e-7, 18);
  expect(evaluateRigidMates(input).checks[0].lengthTolerance).toBeCloseTo(5e-6, 18);
  input.lengthTolerance = 1e-4; expect(evaluateRigidMates(input).rows[0].tolerance).toBeCloseTo(1e-5, 18);
});
it('includes the moving second plane normal in signed-distance derivatives', () => {
  const input = problem([{ id: 'P', type: 'coincident', first: endpoint('A', plane([2, 3, 5])), second: endpoint('B', plane()), alignment: 'aligned' }],
    [{ id: 'A', pose: identityRigidPose(), fixed: false }, { id: 'B', pose: identityRigidPose(), fixed: false }]);
  const result = evaluateRigidMates(input); expect(result.rows).toHaveLength(4); expect(result.rows[0].jacobian[9]).toBe(-3);
  close(result.rows.slice(1).map(row => row.jacobian[9]), [0, 1, 0]);
});
it('expresses a regular directed support angle in radians from a saved degree target', () => {
  const input = problem([{ id: 'A90', type: 'angle', first: endpoint('A', plane([0, 0, 0], [1, 0, 0], [0, 1, 0])),
    second: endpoint('B', cylinder([0, 0, 0], [0, 1, 0])), angle: 60 }],
  [{ id: 'A', pose: identityRigidPose(), fixed: false }, { id: 'B', pose: identityRigidPose(), fixed: false }]);
  const result = evaluateRigidMates(input); expect(result.diagnostics).toEqual([]); expect(result.rows).toHaveLength(1);
  close(result.rows.map(row => row.residual), [Math.PI / 6]); expect(result.rows[0].jacobian[5]).toBe(-1); expect(result.rows[0].jacobian[11]).toBe(1);
  expect(result.maxAngleResidual).toBeCloseTo(Math.PI / 6, 13);
});
it('adds only orientation rows for a concentric rotation lock and preserves axial translation', () => {
  const input = problem([{ id: 'C', type: 'concentric', first: endpoint(null, cylinder()), second: endpoint('A', cylinder()), alignment: 'aligned', rotationLock: rotationExp([0, 0, .1]) }],
    [{ id: 'A', fixed: false, pose: { translation: [0, 0, 8], rotation: rotationExp([0, 0, .4]) } }]);
  const result = evaluateRigidMates(input); expect(result.diagnostics).toEqual([]); expect(result.rows).toHaveLength(9);
  close(result.rows.map(row => row.residual), [0, 0, 0, 0, 0, 0, 0, 0, .3]);
  result.rows.forEach(row => expect(row.jacobian[2]).toBe(0)); expect(result.rows[8].jacobian[5]).toBeCloseTo(1, 13);
});
it('evaluates a noncommuting full relative lock from independently known Cartesian placements', () => {
  const input = problem([{ id: 'L', type: 'lock', first: endpoint('A'), second: endpoint('B'), relativePose: { translation: [4, 5, 6], rotation: [Math.SQRT1_2, 0, 0, Math.SQRT1_2] } }],
    [{ id: 'A', fixed: false, pose: { translation: [1, 2, 3], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] } },
      { id: 'B', fixed: false, pose: { translation: [-4, 6, 9], rotation: [.5, .5, .5, .5] } }]);
  const result = evaluateRigidMates(input); expect(result.diagnostics).toEqual([]); expect(result.rows).toHaveLength(6); close(result.rows.map(row => row.residual), Array(6).fill(0));
});
it.each([
  { type: 'concentric', locked: false }, { type: 'concentric', locked: true }, { type: 'coincident', locked: false },
  { type: 'distance', locked: false }, { type: 'angle', locked: false }, { type: 'lock', locked: false },
] as const)('matches every analytic Jacobian block for two floating owners: $type/$locked', ({ type, locked }) => finiteDifferences(regular(type, locked)));
it.each([
  { type: 'concentric', locked: false }, { type: 'concentric', locked: true }, { type: 'coincident', locked: false },
  { type: 'distance', locked: false }, { type: 'angle', locked: false, angle: 0 }, { type: 'angle', locked: false, angle: 180 },
] as const)('preserves all six common rigid gauge directions off the solution manifold: $type/$locked/$angle', fixture => {
  const input = regular(fixture.type, fixture.locked); input.origin = [2, -3, 4]; input.lengthScale = 7;
  if (input.constraints[0].type === 'angle' && 'angle' in fixture && typeof fixture.angle === 'number') input.constraints[0].angle = fixture.angle;
  const result = evaluateRigidMates(input); expect(result.diagnostics).toEqual([]); expect(result.checks[0].satisfied).toBe(false);
  for (const row of result.rows) for (let coordinate = 0; coordinate < 6; coordinate++) {
    expect(Math.abs(row.jacobian[coordinate] + row.jacobian[6 + coordinate])).toBeLessThan(2e-11);
  }
  // A finite common left transform also leaves the target-frame row values,
  // rather than only their squared objective, unchanged.
  const delta = [.25, -.1, .2, .1, -.2, .15];
  const poses = new Map(input.bodies.map(body => [body.id, retractRigidBodyPose(body.pose, delta, input.origin, input.lengthScale)]));
  const transformed = evaluateRigidMates(input, poses); expect(transformed.diagnostics).toEqual([]);
  close(transformed.rows.map(row => row.residual), result.rows.map(row => row.residual), 2e-11);
});
it('retains four concentric Cartesian pivots at an accepted nonzero separation without a spurious gauge row', () => {
  const input = problem([{ id: 'C', type: 'concentric', first: endpoint('A', cylinder()), second: endpoint('B', cylinder()), alignment: 'aligned', rotationLock: null }],
    [{ id: 'A', fixed: false, pose: { translation: [8e-7, 0, 0], rotation: [0, 0, 0, 1] } }, { id: 'B', fixed: false, pose: identityRigidPose() }]);
  input.lengthScale = 10;
  const result = evaluateRigidMates(input); expect(result.diagnostics).toEqual([]); expect(result.checks[0].satisfied).toBe(true);
  expect(result.rows[0].residual).toBeCloseTo(8e-8, 18);
  // Two identically zero representation rows, and four independent pivots,
  // establish the numerical target without a production rank lookup.
  close(result.rows[2].jacobian, Array(12).fill(0), 1e-16); close(result.rows[5].jacobian, Array(12).fill(0), 1e-16);
  close([result.rows[0].jacobian[0], result.rows[1].jacobian[1], result.rows[3].jacobian[4], result.rows[4].jacobian[3]], [1, 1, 1, -1]);
  result.rows.forEach(row => { for (let coordinate = 0; coordinate < 6; coordinate++) expect(Math.abs(row.jacobian[coordinate] + row.jacobian[6 + coordinate])).toBeLessThan(1e-16); });
});
it.each([.2, 7, 500])('differentiates a fixed conditioning frame at scale %s', scale => {
  const input = regular('concentric', true); input.lengthScale = scale; input.origin = [100, -200, 300]; finiteDifferences(input);
});
it('keeps free columns in input order and fixed-body columns absent', () => {
  const input = regular('distance'); input.bodies.reverse(); input.bodies.push({ id: 'fixed', fixed: true, pose: identityRigidPose() });
  finiteDifferences(input); expect(evaluateRigidMates(input).rows[0].jacobian).toHaveLength(12);
});
it('allows both endpoints on one body while retaining its external incidence', () => {
  const input = problem([{ id: 'L', type: 'lock', first: endpoint('A'), second: endpoint('A'), relativePose: identityRigidPose() }]);
  const result = evaluateRigidMates(input); expect(result.diagnostics).toEqual([]); expect(result.rows).toHaveLength(6);
  result.rows.forEach(row => { expect(row.constraintId).toBe('L'); close(row.jacobian, Array(6).fill(0)); });
});
it('evaluates fixed scopes with zero Jacobian columns rather than inventing free variables', () => {
  const input = problem([{ id: 'P', type: 'coincident', first: endpoint(null, plane([0, 0, 2])), second: endpoint(null, plane()), alignment: 'aligned' }], []);
  const result = evaluateRigidMates(input); close(result.rows.map(row => row.residual), [2, 0, 0, 0]); result.rows.forEach(row => expect(row.jacobian).toEqual([]));
});
it('uses body*frame composition and the exact fixed-frame datum', () => {
  const input = problem([{ id: 'P', type: 'coincident', first: endpoint('A', plane(), { translation: [1, 2, 3], rotation: [Math.SQRT1_2, 0, 0, Math.SQRT1_2] }),
    second: endpoint(null, plane([0, 0, 0], [1, 0, 0], [0, 1, 0]), { translation: [8, 21, 33], rotation: [0, 0, 0, 1] }), alignment: 'aligned' }],
    [{ id: 'A', fixed: false, pose: { translation: [10, 20, 30], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] } }]);
  const result = evaluateRigidMates(input); expect(result.diagnostics).toEqual([]); close(result.rows.map(row => row.residual), [0, 0, 0, 0]);
});
it('preserves residuals and derivatives when every quaternion sign is reversed', () => {
  const input = regular('concentric', true), original = evaluateRigidMates(input), copy = structuredClone(input);
  const negate = (pose: RigidPose): void => { pose.rotation = pose.rotation.map(value => -value) as Quaternion; };
  copy.bodies.forEach(body => negate(body.pose)); copy.constraints.forEach(mate => {
    negate(mate.first.frame); negate(mate.second.frame); if (mate.type === 'concentric' && mate.rotationLock) mate.rotationLock = mate.rotationLock.map(value => -value) as Quaternion;
  });
  const result = evaluateRigidMates(copy); expect(result.diagnostics).toEqual([]); close(result.rows.map(row => row.residual), original.rows.map(row => row.residual));
  result.rows.forEach((row, i) => close(row.jacobian, original.rows[i].jacobian));
});
it('does not mutate declarations or pose overrides', () => {
  const input = regular('lock'), before = JSON.stringify(input), overrides = new Map(input.bodies.map(body => [body.id, structuredClone(body.pose)]));
  const posesBefore = JSON.stringify([...overrides]); evaluateRigidMates(input, overrides); expect(JSON.stringify(input)).toBe(before); expect(JSON.stringify([...overrides])).toBe(posesBefore);
});
it('absorbs large common world origins for both body and null-body endpoints', () => {
  const input = problem([{ id: 'P', type: 'distance', first: endpoint('A', plane()), second: endpoint(null, plane(), { translation: [1e12, -2e12, 3e12], rotation: [0, 0, 0, 1] }), alignment: 'aligned', distance: 4 }],
    [{ id: 'A', fixed: false, pose: { translation: [1e12, -2e12, 3e12 + 5], rotation: [0, 0, 0, 1] } }]);
  input.origin = [1e12, -2e12, 3e12]; input.lengthScale = 2;
  close(evaluateRigidMates(input).rows.map(row => row.residual), [.5, 0, 0, 0]);
});
it.each(['concentric', 'coincident'] as const)('diagnoses antipodal signed %s alignment without claiming conflict', type => {
  const first = endpoint('A', type === 'concentric' ? cylinder() : plane()), second = endpoint(null, type === 'concentric' ? cylinder([0, 0, 0], [0, 0, -1]) : plane([0, 0, 0], [0, 0, -1]));
  const mate: RigidMateConstraint = type === 'concentric' ? { id: 'M', type, first, second, alignment: 'aligned', rotationLock: null } : { id: 'M', type, first, second, alignment: 'aligned' };
  const result = evaluateRigidMates(problem([mate])); expect(result.rows).toEqual([]); expect(result.diagnostics).toMatchObject([{ constraintId: 'M', code: 'orientationChart' }]);
});
it.each([0, 180])('uses signed-vector rows for an exact polar angle target %s degrees', angle => {
  const input = problem([{ id: 'A', type: 'angle', first: endpoint('A', plane()), second: endpoint(null, plane([0, 0, 0], [0, 0, angle === 0 ? 1 : -1])), angle }]);
  const result = evaluateRigidMates(input); expect(result.diagnostics).toEqual([]); expect(result.rows).toHaveLength(3);
  close(result.rows.map(row => row.residual), [0, 0, 0]); expect(result.checks[0].satisfied).toBe(true);
});
it.each([0, 180])('differentiates an exact polar angle target away from its solution: %s', angle => {
  const input = regular('angle'); const mate = input.constraints[0]; if (mate.type !== 'angle') throw new Error('Fixture requires angle.');
  mate.angle = angle; finiteDifferences(input);
});
it.each([1, 90, 179])('diagnoses polar current geometry for an interior angle target %s', angle => {
  const input = problem([{ id: 'A', type: 'angle', first: endpoint('A', plane()), second: endpoint(null, plane()), angle }]);
  const result = evaluateRigidMates(input); expect(result.rows).toEqual([]); expect(result.checks).toEqual([]); expect(result.diagnostics[0].code).toBe('orientationChart');
});
it('rejects a physical norm beyond tolerance even when each Cartesian row is below it', () => {
  const input = problem([{ id: 'C', type: 'concentric', first: endpoint('A', cylinder([.8e-6, .8e-6, 0])), second: endpoint(null, cylinder()), alignment: 'aligned', rotationLock: null }]);
  const result = evaluateRigidMates(input); expect(result.rows.every(row => Math.abs(row.residual) <= row.tolerance)).toBe(true);
  expect(result.checks[0].lengthResidual).toBeCloseTo(Math.SQRT2 * .8e-6, 18); expect(result.checks[0].satisfied).toBe(false);
});
it('checks the real alignment angle rather than three individually acceptable components', () => {
  const input = problem([{ id: 'C', type: 'concentric', first: endpoint('A', cylinder()), second: endpoint(null, cylinder()), alignment: 'aligned', rotationLock: null }],
    [{ id: 'A', fixed: false, pose: { translation: [0, 0, 0], rotation: rotationExp([.8e-8, .8e-8, 0]) } }]);
  const result = evaluateRigidMates(input); expect(result.rows.every(row => Math.abs(row.residual) <= row.tolerance)).toBe(true);
  expect(result.checks[0].angleResidual).toBeCloseTo(Math.SQRT2 * .8e-8, 18); expect(result.checks[0].satisfied).toBe(false);
});
it('returns an empty numerical evaluation without inventing a mate or a variable', () => {
  expect(evaluateRigidMates(problem([], []))).toEqual({ rows: [], diagnostics: [], checks: [], maxLengthResidual: 0, maxAngleResidual: 0, gearAngles: new Map(), screwAngles: new Map(), rackPinionAngles: new Map() });
});
it.each(['concentric', 'lock'] as const)('rejects the relative rotation logarithm cut atomically for %s', type => {
  const mate: RigidMateConstraint = type === 'concentric' ? { id: 'M', type, first: endpoint(null, cylinder()), second: endpoint('A', cylinder()), alignment: 'aligned', rotationLock: [0, 0, 0, 1] }
    : { id: 'M', type, first: endpoint(null), second: endpoint('A'), relativePose: identityRigidPose() };
  const input = problem([mate], [{ id: 'A', fixed: false, pose: { translation: [0, 0, 7], rotation: [0, 0, 1, 0] } }]);
  const result = evaluateRigidMates(input); expect(result.rows).toEqual([]); expect(result.diagnostics).toMatchObject([{ constraintId: 'M', code: 'orientationChart' }]);
});
it.each([
  { support: plane([NaN, 0, 0]) }, { support: plane([0, 0, 0], [0, 0, 0]) },
  { support: plane([0, 0, 0], [0, 0, 2]) }, { support: plane([0, 0, 0], [0, 0, 1], [0, 0, 1]) },
  { support: plane([0, 0, 0], [0, 0, 1], [1, 0, 0], -1) }, { support: cylinder([0, 0, 0], [0, 0, 1], 0) },
])('rejects invalid measured support without publishing partial rows %#', ({ support }) => {
  const input = problem([{ id: 'M', type: 'coincident', first: endpoint('A', support), second: endpoint(null, plane()), alignment: 'aligned' }]);
  const result = evaluateRigidMates(input); expect(result.rows).toEqual([]); expect(result.diagnostics[0].code).toBe('invalidGeometry');
});
it('reports a missing body and wrong support family as geometry diagnostics', () => {
  const input = problem([{ id: 'missing', type: 'coincident', first: endpoint('absent', plane()), second: endpoint(null, plane()), alignment: 'aligned' },
    { id: 'kind', type: 'concentric', first: endpoint('A', plane()), second: endpoint(null, cylinder()), alignment: 'aligned', rotationLock: null }]);
  const result = evaluateRigidMates(input); expect(result.rows).toEqual([]); expect(result.diagnostics.map(d => d.code)).toEqual(['invalidGeometry', 'invalidGeometry']);
});
it('reports finite-input arithmetic overflow without contaminating another mate', () => {
  const input = problem([{ id: 'bad', type: 'coincident', first: endpoint('A', plane([Number.MAX_VALUE, 0, 0])), second: endpoint(null, plane()), alignment: 'aligned' },
    { id: 'good', type: 'coincident', first: endpoint(null, plane()), second: endpoint(null, plane()), alignment: 'aligned' }]); input.lengthScale = 1e-300;
  const result = evaluateRigidMates(input); expect(result.diagnostics).toMatchObject([{ constraintId: 'bad', code: 'precisionLimit' }]); expect(result.rows).toHaveLength(4);
  expect(result.rows.every(row => row.constraintId === 'good')).toBe(true);
});
it('rejects malformed conditioning and duplicate body/mate identities', () => {
  const input = regular('lock'); input.lengthScale = 0; expect(() => evaluateRigidMates(input)).toThrow();
  input.lengthScale = 1; input.bodies.push(structuredClone(input.bodies[0])); expect(() => evaluateRigidMates(input)).toThrow();
  input.bodies.pop(); input.constraints.push(structuredClone(input.constraints[0])); expect(() => evaluateRigidMates(input)).toThrow();
});

function directionSupport(kind: RigidMateSupport['kind'], direction: Vec3 = [0, 0, 1], point: Vec3 = [2, -3, 5]): RigidMateSupport {
  const xDirection: Vec3 = Math.abs(direction[2]) > .9 ? [1, 0, 0] : [0, 0, 1];
  return kind === 'plane' ? plane(point, direction, xDirection) : kind === 'line' ? { kind, point, axis: direction, tolerance: 0 }
    : { kind, point, axis: direction, xDirection, radius: 3, tolerance: 0 };
}
const equationDirectionPairs: [RigidMateSupport['kind'], RigidMateSupport['kind'], 'parallel' | 'perpendicular'][] = [
  ['plane', 'plane', 'parallel'], ['plane', 'cylinder', 'perpendicular'], ['plane', 'line', 'perpendicular'],
  ['cylinder', 'plane', 'perpendicular'], ['cylinder', 'cylinder', 'parallel'], ['cylinder', 'line', 'parallel'],
  ['line', 'plane', 'perpendicular'], ['line', 'cylinder', 'parallel'], ['line', 'line', 'parallel'],
];
const equationDirectionCases = equationDirectionPairs.flatMap(([first, second, collinear]) => [
  { first, second, type: collinear, alignment: 'aligned' as const, axis: [0, 0, 1] as Vec3, rows: 3 },
  { first, second, type: collinear, alignment: 'opposed' as const, axis: [0, 0, -1] as Vec3, rows: 3 },
  { first, second, type: (collinear === 'parallel' ? 'perpendicular' : 'parallel') as 'parallel' | 'perpendicular',
    alignment: null, axis: [1, 0, 0] as Vec3, rows: 1 },
]);
it.each(equationDirectionCases)('uses only the independent orientation rows for $type $first/$second/$alignment', item => {
  const input = problem([{ id: 'direction', type: item.type, alignment: item.alignment,
    first: endpoint('A', directionSupport(item.first)), second: endpoint('B', directionSupport(item.second, item.axis, [800, -700, 600])) }],
  [{ id: 'A', pose: identityRigidPose(), fixed: false }, { id: 'B', pose: identityRigidPose(), fixed: false }]);
  const result = evaluateRigidMates(input); expect(result.diagnostics).toEqual([]); expect(result.rows).toHaveLength(item.rows);
  expect(result.checks).toMatchObject([{ satisfied: true, lengthResidual: 0 }]);
  result.rows.forEach(row => {
    expect(row.kind).toBe('angle'); expect(Math.abs(row.residual)).toBeLessThan(1e-14);
    close(row.jacobian.slice(0, 3), [0, 0, 0]); close(row.jacobian.slice(6, 9), [0, 0, 0]);
  });
  // Cartesian pivots establish rank independently from production SVD.
  if (item.rows === 3) { expect(Math.abs(result.rows[0].jacobian[4])).toBe(1); expect(Math.abs(result.rows[1].jacobian[3])).toBe(1); }
  else expect(Math.abs(result.rows[0].jacobian[4])).toBe(1);
});
it.each(equationDirectionPairs.flatMap(([first, second, collinear]) => [
  { first, second, type: collinear, alignment: 'opposed' as const },
  { first, second, type: (collinear === 'parallel' ? 'perpendicular' : 'parallel') as 'parallel' | 'perpendicular', alignment: null },
]))('matches finite differences and common rigid gauge off manifold for $type $first/$second', item => {
  const input = regular('angle'), previous = input.constraints[0];
  input.constraints = [{ id: 'direction', type: item.type, alignment: item.alignment,
    first: { ...previous.first, support: directionSupport(item.first) }, second: { ...previous.second, support: directionSupport(item.second) } }];
  input.origin = [2, -3, 4]; input.lengthScale = 7; finiteDifferences(input);
  const result = evaluateRigidMates(input); expect(result.diagnostics).toEqual([]); expect(result.checks[0].satisfied).toBe(false);
  result.rows.forEach(row => { for (let coordinate = 0; coordinate < 6; coordinate++) expect(Math.abs(row.jacobian[coordinate] + row.jacobian[6 + coordinate])).toBeLessThan(2e-11); });
  const delta = [.25, -.1, .2, .1, -.2, .15], poses = new Map(input.bodies.map(body => [body.id, retractRigidBodyPose(body.pose, delta, input.origin, input.lengthScale)]));
  const transformed = evaluateRigidMates(input, poses); expect(transformed.diagnostics).toEqual([]);
  close(transformed.rows.map(row => row.residual), result.rows.map(row => row.residual), 2e-11);
});
it.each(['parallel', 'perpendicular'] as const)('ignores irrelevant support points, origins, radii and length normalization for %s', type => {
  const input = problem([{ id: 'direction', type, alignment: type === 'parallel' ? 'aligned' : null,
    first: endpoint('A', directionSupport('line')), second: endpoint(null, directionSupport('cylinder', type === 'parallel' ? [0, 0, 1] : [1, 0, 0])) }]);
  const baseline = evaluateRigidMates(input);
  input.lengthScale = Number.MIN_VALUE; input.origin = [Number.MAX_VALUE, -Number.MAX_VALUE, Number.MAX_VALUE];
  input.bodies[0].pose.translation = [-Number.MAX_VALUE, Number.MAX_VALUE, -Number.MAX_VALUE];
  input.constraints[0].first.frame.translation = [Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE];
  for (const end of [input.constraints[0].first, input.constraints[0].second]) end.support!.point = [Number.MAX_VALUE, -Number.MAX_VALUE, Number.MAX_VALUE];
  if (input.constraints[0].second.support?.kind === 'cylinder') input.constraints[0].second.support.radius = Number.MAX_VALUE;
  const result = evaluateRigidMates(input); expect(result.diagnostics).toEqual([]); expect(result.rows).toEqual(baseline.rows); expect(result.checks[0].satisfied).toBe(true);
});
it('checks the physical collinear angle norm beyond componentwise row acceptance', () => {
  const input = problem([{ id: 'direction', type: 'parallel', alignment: 'aligned', first: endpoint('A', plane()), second: endpoint(null, plane()) }]);
  input.bodies[0].pose.rotation = rotationExp([.8e-8, .8e-8, 0]);
  const result = evaluateRigidMates(input); expect(result.diagnostics).toEqual([]);
  expect(result.rows.every(row => Math.abs(row.residual) < row.tolerance)).toBe(true);
  expect(result.checks[0].angleResidual).toBeGreaterThan(1e-8); expect(result.checks[0].satisfied).toBe(false);
});
it.each([.8e-8, 1.2e-8])('checks orthogonal physical radians at error %s', error => {
  const input = problem([{ id: 'direction', type: 'parallel', alignment: null,
    first: endpoint('A', plane()), second: endpoint(null, directionSupport('line', [1, 0, 0])) }]);
  input.bodies[0].pose.rotation = rotationExp([0, error, 0]); const result = evaluateRigidMates(input);
  expect(result.diagnostics).toEqual([]); expect(result.checks[0].satisfied).toBe(error < 1e-8);
  expect(Math.abs(result.checks[0].angleResidual - error)).toBeLessThan(1e-15);
});
it.each([
  { type: 'parallel' as const, first: 'plane' as const, second: 'plane' as const, alignment: 'opposed' as const },
  { type: 'perpendicular' as const, first: 'plane' as const, second: 'plane' as const, alignment: null },
  { type: 'parallel' as const, first: 'cylinder' as const, second: 'plane' as const, alignment: null },
])('reports a stationary direction chart without publishing partial rows: $type/$first/$second', item => {
  const result = evaluateRigidMates(problem([{ id: 'direction', type: item.type, alignment: item.alignment,
    first: endpoint('A', directionSupport(item.first)), second: endpoint(null, directionSupport(item.second)) }]));
  expect(result.rows).toEqual([]); expect(result.diagnostics).toMatchObject([{ constraintId: 'direction', code: 'orientationChart' }]);
});
it('isolates invalid direction alignment from a valid independent constraint', () => {
  const first = endpoint(null, plane()), second = endpoint('A', plane());
  const input = problem([{ id: 'bad', type: 'perpendicular', first, second, alignment: 'aligned' }, { id: 'good', type: 'parallel', first, second, alignment: 'aligned' }]);
  const result = evaluateRigidMates(input); expect(result.diagnostics).toMatchObject([{ constraintId: 'bad', code: 'invalidGeometry' }]);
  expect(result.rows).toHaveLength(3); expect(result.rows.every(row => row.constraintId === 'good')).toBe(true);
});
it('keeps the legacy zero normal-axis angle distinct from a geometric mixed parallel mate', () => {
  const first = endpoint(null, plane()), second = endpoint('A', cylinder());
  const result = evaluateRigidMates(problem([
    { id: 'legacy', type: 'angle', first, second, angle: 0 },
    { id: 'perpendicular', type: 'perpendicular', first, second, alignment: 'aligned' },
    { id: 'parallel', type: 'parallel', first, second, alignment: null },
  ]));
  expect(result.checks.map(check => [check.constraintId, check.satisfied])).toEqual([['legacy', true], ['perpendicular', true]]);
  expect(result.diagnostics).toMatchObject([{ constraintId: 'parallel', code: 'orientationChart' }]);
  expect(result.rows).toHaveLength(6);
});

function tangentEquation(side: 'positive' | 'negative' = 'positive', reversed = false): BinaryMateProblem {
  const flat = endpoint(null, plane([0, 0, 4])), curved = endpoint('A', { kind: 'cylinder', point: [0, 17, 0], axis: [0, 1, 0], xDirection: [1, 0, 0], radius: 2, tolerance: 0 });
  return problem([{ id: 'tangent', type: 'tangent', side, first: reversed ? curved : flat, second: reversed ? flat : curved }],
    [{ id: 'A', fixed: false, pose: { translation: [3, 5, side === 'positive' ? 6 : 2], rotation: [0, 0, 0, 1] } }]);
}
const tangentEquationCases = [false, true].flatMap(reversed => (['positive', 'negative'] as const).map(side => ({ reversed, side })));
it.each(tangentEquationCases)('emits two independent tangent rows for $side/reversed=$reversed with Cartesian angular/length pivots', ({ side, reversed }) => {
  const input = tangentEquation(side, reversed), before = JSON.stringify(input), result = evaluateRigidMates(input);
  expect(result.diagnostics).toEqual([]); expect(result.rows.map(row => row.kind)).toEqual(['angle', 'length']);
  close(result.rows.map(row => row.residual), [0, 0]); close(result.rows[0].jacobian, [0, 0, 0, 1, 0, 0]); close(result.rows[1].jacobian, [0, 0, 1, 5, -3, 0]);
  expect(result.checks[0].satisfied).toBe(true); expect(JSON.stringify(input)).toBe(before);
  expect(result.gearAngles.size + result.screwAngles.size + result.rackPinionAngles.size).toBe(0);
});
it.each(tangentEquationCases)('matches independent finite differences and exact common gauge off-manifold for $side/$reversed', ({ side, reversed }) => {
  const first = endpoint('A', plane([7, -3, 4]), { translation: [1, 2, -.5], rotation: rotationExp([.1, -.2, .05]) });
  const second = endpoint('B', { kind: 'cylinder', point: [2, 5, 3], axis: [0, 1, 0], xDirection: [1, 0, 0], radius: 2, tolerance: 0 },
    { translation: [-1, .3, 2], rotation: rotationExp([.05, .12, -.08]) });
  const input = problem([{ id: 'T', type: 'tangent', side, first: reversed ? second : first, second: reversed ? first : second }],
    [{ id: 'A', fixed: false, pose: { translation: [4, -3, 2], rotation: rotationExp([.2, .1, -.3]) } },
      { id: 'B', fixed: false, pose: { translation: [-2, 1, 6], rotation: rotationExp([-.3, .2, .1]) } }]);
  input.origin = [2, -1, 3]; input.lengthScale = 7; finiteDifferences(input);
  const evaluated = evaluateRigidMates(input); expect(Math.hypot(...evaluated.rows.map(row => row.residual))).toBeGreaterThan(.1);
  for (const row of evaluated.rows) for (let i = 0; i < 6; i++) expect(Math.abs(row.jacobian[i] + row.jacobian[i + 6])).toBeLessThan(1e-12);
});
it.each([Math.PI / 3, -Math.PI / 3])('uses the eccentric cylinder axis rather than an orbiting component origin at spin %s', angle => {
  const input = tangentEquation(), curve = input.constraints[0].second.support!;
  curve.point = [3, 0, 0];
  input.constraints[0].first.support!.point = [0, 0, 0];
  input.bodies[0].pose = { translation: [-3 * Math.cos(angle), 0, 2 + 3 * Math.sin(angle)], rotation: [0, Math.sin(angle / 2), 0, Math.cos(angle / 2)] };
  const result = evaluateRigidMates(input); expect(result.diagnostics).toEqual([]); close(result.rows.map(row => row.residual), [0, 0]);
  expect(Math.abs(input.bodies[0].pose.translation[2] - 2)).toBeGreaterThan(2); expect(result.checks[0].satisfied).toBe(true);
});
it.each([false, true])('is invariant to arbitrary plane/axis parameter origins (reversed=%s)', reversed => {
  const input = tangentEquation('positive', reversed), original = evaluateRigidMates(input);
  const constraint = input.constraints[0], flat = reversed ? constraint.second : constraint.first, curved = reversed ? constraint.first : constraint.second;
  flat.support!.point = [1e15, -1e15, 4]; curved.support!.point = [0, 1e20, 0];
  expect(evaluateRigidMates(input)).toEqual(original);
});
it.each(['positive', 'negative'] as const)('keeps the %s side unchanged under native cylinder axis reversal', side => {
  const input = tangentEquation(side), original = evaluateRigidMates(input), support = input.constraints[0].second.support;
  if (support?.kind !== 'cylinder') throw new Error('Original cylinder required'); support.axis = [0, -1, 0];
  const result = evaluateRigidMates(input); expect(result.checks).toEqual(original.checks); close(result.rows.map(row => row.residual), [0, 0]);
  close(result.rows[0].jacobian, original.rows[0].jacobian.map(value => -value)); close(result.rows[1].jacobian, original.rows[1].jacobian);
});
it.each([-.8, .8, -1.2, 1.2])('checks the tangent signed physical length boundary independently at %s tolerance', factor => {
  const input = tangentEquation(); input.bodies[0].pose.translation[2] += factor * input.lengthTolerance;
  const result = evaluateRigidMates(input); expect(result.diagnostics).toEqual([]); expect(result.checks[0].satisfied).toBe(Math.abs(factor) < 1);
  expect(Math.abs(result.checks[0].lengthResidual - Math.abs(factor) * input.lengthTolerance)).toBeLessThan(1e-14);
});
it.each([-.8, .8, -1.2, 1.2])('checks the tangent physical angular boundary independently at %s tolerance', factor => {
  const input = tangentEquation(), angle = factor * input.angleTolerance; input.bodies[0].pose.rotation = [Math.sin(angle / 2), 0, 0, Math.cos(angle / 2)];
  const result = evaluateRigidMates(input); expect(result.diagnostics).toEqual([]); expect(result.checks[0].satisfied).toBe(Math.abs(factor) < 1);
  expect(Math.abs(result.checks[0].angleResidual - Math.abs(angle))).toBeLessThan(1e-15);
});
it.each([1, -1])('rejects the singular tangent axis/plane-normal chart %s without partial rows', sign => {
  const input = tangentEquation(), support = input.constraints[0].second.support;
  if (support?.kind !== 'cylinder') throw new Error('Original cylinder required'); support.axis = [0, 0, sign];
  const result = evaluateRigidMates(input); expect(result.rows).toEqual([]); expect(result.checks).toEqual([]); expect(result.diagnostics).toMatchObject([{ code: 'orientationChart' }]);
});
it('uses native uncertainty only for physical length, never to relax tangent angular acceptance', () => {
  const input = tangentEquation(); input.constraints[0].first.support!.tolerance = 1e-4; input.constraints[0].second.support!.tolerance = 3e-4;
  input.bodies[0].pose.translation[2] += 3e-4; let result = evaluateRigidMates(input); expect(Math.abs(result.checks[0].lengthTolerance - 4e-4)).toBeLessThan(1e-18); expect(result.checks[0].satisfied).toBe(true);
  input.bodies[0].pose.rotation = [Math.sin(1e-8), 0, 0, Math.cos(1e-8)]; result = evaluateRigidMates(input);
  expect(result.checks[0].angleTolerance).toBe(1e-8); expect(result.checks[0].satisfied).toBe(false);
});
it.each(['radius-underflow', 'oblique-cancellation', 'world-cancellation'] as const)('rejects tangent %s as precisionLimit with no partial evidence', fault => {
  const input = tangentEquation(), support = input.constraints[0].second.support;
  if (support?.kind !== 'cylinder') throw new Error('Original cylinder required');
  if (fault === 'radius-underflow') { support.radius = Number.MIN_VALUE; input.lengthScale = 2; }
  else if (fault === 'oblique-cancellation') { support.axis = [Math.SQRT1_2, Math.SQRT1_2, 0]; support.xDirection = [0, 0, 1]; support.point = [1e14, 1e14 + 2, 0]; }
  else { input.constraints[0].first.frame.translation = [0, 0, 1e9]; input.bodies[0].pose.translation = [3, 5, 1e9 + 6]; }
  const result = evaluateRigidMates(input); expect(result.diagnostics).toMatchObject([{ code: 'precisionLimit' }]); expect(result.rows).toEqual([]); expect(result.checks).toEqual([]);
});
it('conditions a distant common world frame before evaluating the small tangent offset', () => {
  const input = tangentEquation(); input.origin = [0, 0, 1e9]; input.constraints[0].first.frame.translation = [0, 0, 1e9]; input.bodies[0].pose.translation = [3, 5, 1e9 + 6];
  const result = evaluateRigidMates(input); expect(result.diagnostics).toEqual([]); close(result.rows.map(row => row.residual), [0, 0]);
});

const ccEquationTypes: AssemblyCylinderTangentMateType[] = ['skew-cylinder-tangent', 'parallel-cylinder-tangent'];
const ccEquationBranches: { branch: AssemblyCylinderTangentBranch; first: number; second: number; target: number }[] = [
  { branch: { kind: 'external' }, first: 2, second: 3, target: 5 },
  { branch: { kind: 'internal', larger: 'first' }, first: 5, second: 2, target: 3 },
  { branch: { kind: 'internal', larger: 'second' }, first: 2, second: 5, target: 3 },
];
function ccEquation(type: AssemblyCylinderTangentMateType, item = ccEquationBranches[0]): BinaryMateProblem {
  const first = endpoint('A', cylinder([0, 0, 13], [0, 0, 1], item.first));
  const second = endpoint(null, cylinder([0, type === 'skew-cylinder-tangent' ? -19 : 0, type === 'skew-cylinder-tangent' ? 0 : -19],
    type === 'skew-cylinder-tangent' ? [0, 1, 0] : [0, 0, 1], item.second), { translation: [item.target, 0, 0], rotation: [0, 0, 0, 1] });
  return problem([{ id: 'CC', type, first, second, branch: item.branch }]);
}
const ccEquationCases = ccEquationTypes.flatMap(type => ccEquationBranches.map(item => ({ type, item })));
it.each(ccEquationCases)('emits independent Cartesian pivots for $type/$item.branch.kind/$item.branch.larger', ({ type, item }) => {
  const input = ccEquation(type, item), before = JSON.stringify(input), result = evaluateRigidMates(input);
  expect(result.diagnostics).toEqual([]); expect(result.rows.map(row => row.kind)).toEqual(type === 'skew-cylinder-tangent' ? ['length'] : ['angle', 'angle', 'angle', 'length']);
  close(result.rows.map(row => row.residual), Array(result.rows.length).fill(0)); close(result.rows.at(-1)!.jacobian, [-1, 0, 0, 0, 0, 0]);
  if (type === 'parallel-cylinder-tangent') { close(result.rows[0].jacobian, [0, 0, 0, -1, 0, 0]); close(result.rows[1].jacobian, [0, 0, 0, 0, -1, 0]); close(result.rows[2].jacobian, Array(6).fill(0)); }
  expect(result.checks[0].satisfied).toBe(true); expect(JSON.stringify(input)).toBe(before);
  expect(result.gearAngles.size + result.screwAngles.size + result.rackPinionAngles.size).toBe(0);
});
it.each(ccEquationCases)('matches finite differences and common rigid gauge off manifold for $type/$item.branch.kind/$item.branch.larger', ({ type, item }) => {
  const first = endpoint('A', cylinder([2, -1, 13], [0, 0, 1], item.first), { translation: [1, -.5, 2], rotation: rotationExp([.1, .15, -.1]) });
  const second = endpoint('B', cylinder([-.5, 3, 2], [0, 0, 1], item.second), { translation: [-.3, 2, 1], rotation: rotationExp([-.15, .05, .1]) });
  const input = problem([{ id: 'CC', type, first, second, branch: item.branch }], [
    { id: 'A', fixed: false, pose: { translation: [3, -2, 1], rotation: rotationExp([.2, -.1, .3]) } },
    { id: 'B', fixed: false, pose: { translation: [-2, 5, 4], rotation: rotationExp(type === 'skew-cylinder-tangent' ? [-.6, .1, -.2] : [.15, -.05, -.1]) } },
  ]); input.origin = [1, -1, 2]; input.lengthScale = 7;
  finiteDifferences(input); const base = evaluateRigidMates(input); expect(base.diagnostics).toEqual([]);
  base.rows.forEach(row => { for (let i = 0; i < 6; i++) expect(Math.abs(row.jacobian[i] + row.jacobian[i + 6])).toBeLessThan(2e-12); });
  const delta = [.1, -.2, .15, .12, -.08, .05], poses = new Map(input.bodies.map(body => [body.id, retractRigidBodyPose(body.pose, delta, input.origin, input.lengthScale)]));
  const changed = evaluateRigidMates(input, poses); expect(changed.diagnostics).toEqual([]); close(changed.rows.map(row => row.residual), base.rows.map(row => row.residual), 3e-12);
});
it.each(ccEquationTypes)('canonicalizes both local axis parameter origins before conditioning for %s', type => {
  const input = ccEquation(type), baseline = evaluateRigidMates(input);
  input.constraints[0].first.support!.point = [0, 0, Number.MAX_VALUE];
  input.constraints[0].second.support!.point = type === 'skew-cylinder-tangent' ? [0, -Number.MAX_VALUE, 0] : [0, 0, -Number.MAX_VALUE];
  expect(evaluateRigidMates(input)).toEqual(baseline);
});
it.each(ccEquationTypes.flatMap(type => ['first', 'second'].map(side => ({ type, side: side as 'first' | 'second' }))))(
  'preserves geometry when raw $side axis reverses for $type', ({ type, side }) => {
    const input = ccEquation(type), baseline = evaluateRigidMates(input), support = input.constraints[0][side].support;
    if (support?.kind !== 'cylinder') throw new Error('Original cylinder required'); support.axis = support.axis.map(value => -value) as Vec3;
    const result = evaluateRigidMates(input); expect(result.diagnostics).toEqual([]); expect(result.checks).toEqual(baseline.checks);
    close(result.rows.at(-1)!.jacobian, baseline.rows.at(-1)!.jacobian);
    if (type === 'parallel-cylinder-tangent') result.rows.slice(0, 3).forEach((row, i) => close(row.jacobian, baseline.rows[i].jacobian.map(value => -value)));
  });
it.each(ccEquationTypes)('uses an eccentric cylinder axis rather than its orbiting component origin for %s', type => {
  const input = ccEquation(type), first = input.constraints[0].first.support!; first.point = [3, 0, 17];
  const angle = Math.PI / 3; input.bodies[0].pose = { translation: [-3 * Math.cos(angle), -3 * Math.sin(angle), 0], rotation: [0, 0, Math.sin(angle / 2), Math.cos(angle / 2)] };
  const result = evaluateRigidMates(input); expect(result.diagnostics).toEqual([]); close(result.rows.map(row => row.residual), Array(result.rows.length).fill(0)); expect(result.checks[0].satisfied).toBe(true);
});
it.each(ccEquationTypes.flatMap(type => [-1.2, -.8, .8, 1.2].map(factor => ({ type, factor }))))('checks physical radial tolerance $factor for $type', ({ type, factor }) => {
  const input = ccEquation(type); input.constraints[0].second.frame.translation[0] += factor * input.lengthTolerance;
  const result = evaluateRigidMates(input); expect(result.diagnostics).toEqual([]); expect(result.checks[0].satisfied).toBe(Math.abs(factor) < 1);
  expect(Math.abs(result.checks[0].lengthResidual - Math.abs(factor) * input.lengthTolerance)).toBeLessThan(1e-14);
});
it('checks parallel physical angular norm when every cross component is inside the row tolerance', () => {
  const input = ccEquation('parallel-cylinder-tangent'); input.bodies[0].pose.rotation = rotationExp([.8e-8, .8e-8, 0]);
  const result = evaluateRigidMates(input); expect(result.diagnostics).toEqual([]); expect(result.rows.every(row => Math.abs(row.residual) < row.tolerance)).toBe(true);
  expect(result.checks[0].angleResidual).toBeGreaterThan(1e-8); expect(result.checks[0].satisfied).toBe(false);
});
it.each(ccEquationTypes.flatMap(type => [5e-8, 2e-7].map(margin => ({ type, margin }))))('enforces the declared chart boundary for $type at $margin', ({ type, margin }) => {
  const input = ccEquation(type), support = input.constraints[0].second.support;
  if (support?.kind !== 'cylinder') throw new Error('Original cylinder required');
  support.axis = type === 'skew-cylinder-tangent' ? [0, Math.sin(margin), Math.cos(margin)] : [0, Math.cos(margin), Math.sin(margin)];
  const result = evaluateRigidMates(input);
  if (margin < 1e-7) { expect(result.diagnostics).toMatchObject([{ code: 'orientationChart' }]); expect(result.rows).toEqual([]); expect(result.checks).toEqual([]); }
  else { expect(result.diagnostics).toEqual([]); expect(result.rows).toHaveLength(type === 'skew-cylinder-tangent' ? 1 : 4); }
});
it.each(ccEquationTypes)('rejects zero separation without partial evidence for %s', type => {
  const input = ccEquation(type); input.constraints[0].second.frame.translation[0] = 0;
  const result = evaluateRigidMates(input); expect(result.diagnostics).toMatchObject([{ code: 'orientationChart' }]); expect(result.rows).toEqual([]); expect(result.checks).toEqual([]);
});
it.each(ccEquationTypes.flatMap(type => ['overflow', 'underflow', 'gap', 'world-cancellation', 'oblique-parameter'].map(fault => ({ type, fault }))))(
  'rejects $type/$fault arithmetic before any row escapes', ({ type, fault }) => {
    const input = ccEquation(type), c = input.constraints[0], first = c.first.support, second = c.second.support;
    if (first?.kind !== 'cylinder' || second?.kind !== 'cylinder' || c.type !== type || c.type !== 'skew-cylinder-tangent' && c.type !== 'parallel-cylinder-tangent') throw new Error('Original cylinders required');
    if (fault === 'overflow') { first.radius = Number.MAX_VALUE; second.radius = Number.MAX_VALUE; }
    else if (fault === 'underflow') { first.radius = Number.MIN_VALUE; second.radius = Number.MIN_VALUE; input.lengthScale = 10; }
    else if (fault === 'gap') { c.branch = { kind: 'internal', larger: 'first' }; first.radius = 1 + Number.EPSILON; second.radius = 1; }
    else if (fault === 'world-cancellation') { input.bodies[0].pose.translation[0] = 1e12; c.second.frame.translation[0] += 1e12; }
    else { first.axis = [Math.SQRT1_2, 0, Math.SQRT1_2]; first.xDirection = [0, 1, 0]; first.point = [1e14, 0, 1e14 + 2]; }
    const result = evaluateRigidMates(input); expect(result.diagnostics).toMatchObject([{ code: 'precisionLimit' }]); expect(result.rows).toEqual([]); expect(result.checks).toEqual([]);
  });
it.each(ccEquationTypes)('preserves the conditioned distant common frame for %s', type => {
  const input = ccEquation(type); input.origin = [1e12, 0, 0]; input.bodies[0].pose.translation[0] = 1e12; input.constraints[0].second.frame.translation[0] += 1e12;
  const result = evaluateRigidMates(input); expect(result.diagnostics).toEqual([]); close(result.rows.map(row => row.residual), Array(result.rows.length).fill(0));
});
it.each(ccEquationTypes)('uses fresh radii rather than a retained target for %s', type => {
  const input = ccEquation(type), support = input.constraints[0].second.support; if (support?.kind !== 'cylinder') throw new Error('Original cylinder required');
  support.radius = 4; const result = evaluateRigidMates(input); expect(result.diagnostics).toEqual([]); expect(result.rows.at(-1)!.residual).toBe(-1); expect(result.checks[0].satisfied).toBe(false);
});
it.each(ccEquationTypes)('admits either geometric separation side without persisting a cross-axis sign for %s', type => {
  const input = ccEquation(type); input.constraints[0].second.frame.translation[0] *= -1;
  const result = evaluateRigidMates(input); expect(result.diagnostics).toEqual([]); expect(result.checks[0].satisfied).toBe(true);
  close(result.rows.at(-1)!.jacobian, [1, 0, 0, 0, 0, 0]);
});
it.each(ccEquationCases)('preserves physical geometry under endpoint permutation for $type/$item.branch.kind/$item.branch.larger', ({ type, item }) => {
  const input = ccEquation(type, item), c = input.constraints[0]; if (c.type !== 'skew-cylinder-tangent' && c.type !== 'parallel-cylinder-tangent') throw new Error('Original cylinder mate required');
  const before = evaluateRigidMates(input), first = c.first; c.first = c.second; c.second = first;
  if (c.branch.kind === 'internal') c.branch = { kind: 'internal', larger: c.branch.larger === 'first' ? 'second' : 'first' };
  const result = evaluateRigidMates(input); expect(result.diagnostics).toEqual([]); expect(result.checks).toEqual(before.checks); close(result.rows.at(-1)!.jacobian, before.rows.at(-1)!.jacobian);
});
it.each(ccEquationTypes)('isolates an invalid %s pair from unrelated valid PC tangency rows', type => {
  const input = tangentEquation(), invalid = ccEquation(type).constraints[0]; invalid.second.support = { kind: 'line', point: [0, 0, 0], axis: [0, 1, 0], tolerance: 0 };
  input.constraints.push(invalid); const result = evaluateRigidMates(input);
  expect(result.diagnostics).toMatchObject([{ constraintId: 'CC', code: 'invalidGeometry' }]); expect(result.rows).toHaveLength(2); expect(result.checks.map(value => value.constraintId)).toEqual(['tangent']);
});
it.each(['plane', 'cylinder', 'line'] as const)('rejects an invalid tangent pair with second kind %s while preserving unrelated valid rows', kind => {
  const input = tangentEquation(), invalid = { ...input.constraints[0], id: 'invalid' };
  invalid.second = kind === 'cylinder' ? endpoint('A', cylinder()) : endpoint('A', kind === 'plane' ? plane() : { kind: 'line', point: [0, 0, 0], axis: [0, 1, 0], tolerance: 0 });
  if (kind === 'cylinder') invalid.first = endpoint(null, cylinder());
  input.constraints.push(invalid); const result = evaluateRigidMates(input);
  expect(result.rows).toHaveLength(2); expect(result.checks.map(check => check.constraintId)).toEqual(['tangent']); expect(result.diagnostics).toMatchObject([{ constraintId: 'invalid', code: 'invalidGeometry' }]);
});

const sphereNumeric = (point: Vec3 = [0, 0, 0], radius = 2): RigidMateSupport => ({ kind: 'sphere', point, radius, tolerance: 0 });
interface SphericalCase { type: AssemblySphereTangentMateType; reversed: boolean; side: AssemblyTangentSide; branch: AssemblySphereTangentBranch; firstRadius: number; secondRadius: number; target: number }
const sphericalCases: SphericalCase[] = [false, true].flatMap(reversed => [
  ...(['positive', 'negative'] as const).map(side => ({ type: 'plane-sphere-tangent' as const, reversed, side, branch: { kind: 'external' as const }, firstRadius: 2, secondRadius: 2, target: 2 })),
  ...(['sphere-sphere-tangent', 'cylinder-sphere-tangent'] as const).flatMap(type => ccEquationBranches.map(item => ({ type, reversed, side: 'positive' as const, branch: item.branch, firstRadius: item.first, secondRadius: item.second, target: item.target }))),
]);
function sphericalEquation(item: SphericalCase): BinaryMateProblem {
  const firstSupport = item.type === 'plane-sphere-tangent' ? plane([0, 0, 4]) : item.type === 'sphere-sphere-tangent' ? sphereNumeric([0, 0, 0], item.firstRadius) : cylinder([0, 0, 17], [0, 0, 1], item.firstRadius);
  const secondSupport = sphereNumeric(item.type === 'plane-sphere-tangent' ? [3, 5, 4 + (item.side === 'positive' ? 2 : -2)] : [item.target, 0, 3], item.secondRadius);
  if (item.type === 'sphere-sphere-tangent') secondSupport.point[2] = 0;
  const first = endpoint('A', firstSupport), second = endpoint('B', secondSupport), pair = { first: item.reversed ? second : first, second: item.reversed ? first : second };
  const branch = item.reversed && item.branch.kind === 'internal' ? { kind: 'internal' as const, larger: item.branch.larger === 'first' ? 'second' as const : 'first' as const } : item.branch;
  const constraint: RigidMateConstraint = item.type === 'plane-sphere-tangent' ? { id: 'S', type: item.type, ...pair, side: item.side } : { id: 'S', type: item.type, ...pair, branch };
  return problem([constraint], [{ id: 'A', pose: identityRigidPose(), fixed: false }, { id: 'B', pose: identityRigidPose(), fixed: false }]);
}
it.each(sphericalCases)('emits one regular length row for $type/$side/$branch.kind/$branch.larger reversed=$reversed', item => {
  const input = sphericalEquation(item), before = JSON.stringify(input), result = evaluateRigidMates(input);
  expect(result.diagnostics).toEqual([]); expect(result.rows.map(row => row.kind)).toEqual(['length']); close(result.rows.map(row => row.residual), [0]);
  const expected = item.type === 'plane-sphere-tangent' ? [0, 0, -1, -5, 3, 0, 0, 0, 1, 5, -3, 0] : [-1, 0, 0, 0, item.type === 'cylinder-sphere-tangent' ? -3 : 0, 0, 1, 0, 0, 0, item.type === 'cylinder-sphere-tangent' ? 3 : 0, 0];
  close(result.rows[0].jacobian, expected); expect(result.checks[0]).toMatchObject({ satisfied: true, angleResidual: 0 });
  expect(result.gearAngles.size + result.screwAngles.size + result.rackPinionAngles.size).toBe(0); expect(JSON.stringify(input)).toBe(before);
});
it.each(sphericalCases)('matches independent FD and all common gauge columns off-solution for $type reversed=$reversed/$side/$branch.larger', item => {
  const input = sphericalEquation(item);
  input.bodies[0].pose = { translation: [3, -2, 1], rotation: rotationExp([.2, -.1, .3]) };
  input.bodies[1].pose = { translation: [-1, 4, 2], rotation: rotationExp([-.15, .25, -.1]) };
  input.constraints[0].first.frame = { translation: [.3, -.5, .7], rotation: rotationExp([.07, -.04, .09]) };
  input.constraints[0].second.frame = { translation: [-.2, .4, -.8], rotation: rotationExp([-.05, .08, -.06]) };
  input.origin = [1, -1, 2]; input.lengthScale = 7; finiteDifferences(input); const base = evaluateRigidMates(input);
  for (const row of base.rows) for (let i = 0; i < 6; i++) expect(Math.abs(row.jacobian[i] + row.jacobian[i + 6])).toBeLessThan(2e-12);
  const delta = [.2, -.3, .1, .15, -.08, .04], poses = new Map(input.bodies.map(body => [body.id, retractRigidBodyPose(body.pose, delta, input.origin, input.lengthScale)]));
  const moved = evaluateRigidMates(input, poses); expect(moved.diagnostics).toEqual([]); close(moved.rows.map(row => row.residual), base.rows.map(row => row.residual), 3e-12);
});
it.each(['plane-sphere-tangent', 'sphere-sphere-tangent', 'cylinder-sphere-tangent'] satisfies AssemblySphereTangentMateType[])('preserves the unique eccentric sphere center through a local spin for %s', type => {
  const item = sphericalCases.find(value => value.type === type && !value.reversed)!; const input = sphericalEquation(item), baseline = evaluateRigidMates(input), support = input.constraints[0].second.support!;
  const center = [...support.point] as Vec3; support.point = [3, 0, 0]; const angle = Math.PI / 3;
  input.bodies[1].pose = { translation: [center[0] - 3 * Math.cos(angle), center[1] - 3 * Math.sin(angle), center[2]], rotation: [0, 0, Math.sin(angle / 2), Math.cos(angle / 2)] };
  const result = evaluateRigidMates(input); expect(result.diagnostics).toEqual([]); close(result.rows.map(row => row.residual), baseline.rows.map(row => row.residual));
  expect(result.checks[0].satisfied).toBe(true); expect(input.bodies[1].pose.translation).not.toEqual(center);
});
it('keeps PS center-on-plane regular instead of requiring an artificial radial direction', () => {
  const input = sphericalEquation(sphericalCases[0]); input.constraints[0].second.support!.point[2] = 4;
  const result = evaluateRigidMates(input); expect(result.diagnostics).toEqual([]); expect(result.rows[0].residual).toBe(-2); expect(result.rows[0].jacobian[8]).toBe(1);
});
it.each(['sphere-sphere-tangent', 'cylinder-sphere-tangent'] as const)('rejects %s zero separation without partial rows/checks', type => {
  const input = sphericalEquation(sphericalCases.find(item => item.type === type && !item.reversed)!); input.constraints[0].second.support!.point = [0, 0, 0];
  const result = evaluateRigidMates(input); expect(result.diagnostics).toMatchObject([{ code: 'orientationChart' }]); expect(result.rows).toEqual([]); expect(result.checks).toEqual([]);
});
it.each([false, true])('canonicalizes plane/cylinder parameter origins, never the sphere center (reversed=%s)', reversed => {
  for (const type of ['plane-sphere-tangent', 'cylinder-sphere-tangent'] as const) {
    const input = sphericalEquation(sphericalCases.find(item => item.type === type && item.reversed === reversed)!), baseline = evaluateRigidMates(input);
    const support = input.constraints[0][reversed ? 'second' : 'first'].support!; support.point = type === 'plane-sphere-tangent' ? [Number.MAX_VALUE, -Number.MAX_VALUE, 4] : [0, 0, Number.MAX_VALUE];
    expect(evaluateRigidMates(input)).toEqual(baseline);
  }
});
it.each([-1.2, -.8, .8, 1.2])('checks physical spherical length tolerance independently at %s', factor => {
  for (const type of ['plane-sphere-tangent', 'sphere-sphere-tangent', 'cylinder-sphere-tangent'] as const) {
    const input = sphericalEquation(sphericalCases.find(item => item.type === type && !item.reversed)!); input.constraints[0].second.support!.point[type === 'plane-sphere-tangent' ? 2 : 0] += factor * input.lengthTolerance;
    const result = evaluateRigidMates(input); expect(result.diagnostics).toEqual([]); expect(result.checks[0].satisfied).toBe(Math.abs(factor) < 1);
    expect(Math.abs(result.checks[0].lengthResidual - Math.abs(factor) * input.lengthTolerance)).toBeLessThan(1e-14);
  }
});
it.each(['plane-sphere-tangent', 'sphere-sphere-tangent', 'cylinder-sphere-tangent'] satisfies AssemblySphereTangentMateType[])('uses current radius and native length uncertainty for %s, without angular rows', type => {
  const input = sphericalEquation(sphericalCases.find(item => item.type === type && !item.reversed)!), sphere = input.constraints[0].second.support!;
  if (sphere.kind !== 'sphere') throw new Error('Original sphere required'); sphere.radius += .1;
  let result = evaluateRigidMates(input); close(result.rows.map(row => row.residual), [-.1]); expect(result.checks[0].satisfied).toBe(false);
  sphere.tolerance = .2; result = evaluateRigidMates(input); expect(result.checks[0]).toMatchObject({ satisfied: true, lengthTolerance: .2, angleResidual: 0, angleTolerance: 1e-8 });
});
it.each(['underflow', 'world-cancellation', 'invalid-radius'] as const)('rejects spherical %s before rows or checks escape', fault => {
  for (const type of ['plane-sphere-tangent', 'sphere-sphere-tangent', 'cylinder-sphere-tangent'] as const) {
    const input = sphericalEquation(sphericalCases.find(item => item.type === type && !item.reversed)!), c = input.constraints[0];
    if (fault === 'world-cancellation') { input.bodies.forEach(body => { body.pose.translation[0] += 1e12; }); }
    else { const s = c.second.support; if (s?.kind !== 'sphere') throw new Error('Original sphere required'); s.radius = fault === 'invalid-radius' ? -1 : Number.MIN_VALUE; if (fault === 'underflow') { input.lengthScale = 10; if (c.first.support?.kind === 'sphere' || c.first.support?.kind === 'cylinder') c.first.support.radius = Number.MIN_VALUE; } }
    const result = evaluateRigidMates(input); expect(result.rows).toEqual([]); expect(result.checks).toEqual([]); expect(result.diagnostics).toMatchObject([{ code: fault === 'invalid-radius' ? 'invalidGeometry' : 'precisionLimit' }]);
  }
});
it.each(['plane-sphere-tangent', 'sphere-sphere-tangent', 'cylinder-sphere-tangent'] satisfies AssemblySphereTangentMateType[])('conditions a distant common world frame before %s arithmetic', type => {
  const input = sphericalEquation(sphericalCases.find(item => item.type === type && !item.reversed)!), baseline = evaluateRigidMates(input);
  input.origin = [1e12, -1e12, 1e12]; input.bodies.forEach(body => { body.pose.translation = [...input.origin]; });
  expect(evaluateRigidMates(input)).toEqual(baseline);
});
it('reverses a cylinder axis without changing CS distance and rejects every old sphere family explicitly', () => {
  const input = sphericalEquation(sphericalCases.find(item => item.type === 'cylinder-sphere-tangent' && !item.reversed)!), baseline = evaluateRigidMates(input), cylinder = input.constraints[0].first.support;
  if (cylinder?.kind !== 'cylinder') throw new Error('Original cylinder required'); cylinder.axis = [0, 0, -1]; expect(evaluateRigidMates(input)).toEqual(baseline);
  for (const type of ['concentric', 'coincident', 'distance', 'angle', 'lock'] as const) { const invalid = regular(type); invalid.constraints[0].first.support = sphereNumeric(); const result = evaluateRigidMates(invalid); expect(result.rows).toEqual([]); expect(result.diagnostics).toMatchObject([{ code: 'invalidGeometry' }]); }
});
it('isolates an invalid sphere family from unrelated valid PC evidence', () => {
  const input = tangentEquation(), invalid = sphericalEquation(sphericalCases[0]).constraints[0]; invalid.second = endpoint('A', cylinder()); input.constraints.push(invalid);
  const result = evaluateRigidMates(input); expect(result.rows).toHaveLength(2); expect(result.checks.map(value => value.constraintId)).toEqual(['tangent']); expect(result.diagnostics).toMatchObject([{ constraintId: 'S', code: 'invalidGeometry' }]);
});
it.each(sphereDeclarationCancellationCases())('rejects pre-cancellation local placement loss for $type reversed=$reversed', ({ type, reversed }) => {
  const fixed = type === 'plane-sphere-tangent' ? endpoint(null, plane([-1, 0, 0], [1, 0, 0], [0, 1, 0]))
    : endpoint(null, type === 'sphere-sphere-tangent' ? sphereNumeric([-2, 0, 0], 1) : cylinder([-2, 0, 0], [0, 0, 1], 1));
  const moving = endpoint('A', sphereNumeric([1e16, 0, 0], 1), { translation: [1, 0, 0], rotation: [0, 0, 0, 1] }), pair = { first: reversed ? moving : fixed, second: reversed ? fixed : moving };
  const constraint: RigidMateConstraint = type === 'plane-sphere-tangent' ? { id: 'loss', type, ...pair, side: 'positive' } : { id: 'loss', type, ...pair, branch: { kind: 'external' } };
  const input = problem([constraint], [{ id: 'A', fixed: false, pose: { translation: [-1e16, 0, 0], rotation: [0, 0, 0, 1] } }]), before = JSON.stringify(input);
  // Exact integer declaration arithmetic proves the lost millimetre without
  // deriving an oracle from our floating endpoint transform or residual code.
  const exactCenter = -10000000000000000n + 1n + 10000000000000000n;
  expect(exactCenter).toBe(1n); expect((-1e16 + 1) + 1e16).toBe(0);
  const exactResidual = type === 'plane-sphere-tangent' ? exactCenter - (-1n) - 1n : exactCenter - (-2n) - 2n;
  expect(exactResidual).toBe(1n);
  const result = evaluateRigidMates(input); expect(result.diagnostics).toMatchObject([{ code: 'precisionLimit' }]); expect(result.rows).toEqual([]); expect(result.checks).toEqual([]);
  expect(result.gearAngles.size + result.screwAngles.size + result.rackPinionAngles.size).toBe(0); expect(JSON.stringify(input)).toBe(before);
});
function sphereDeclarationCancellationCases(): { type: AssemblySphereTangentMateType; reversed: boolean }[] {
  return (['plane-sphere-tangent', 'sphere-sphere-tangent', 'cylinder-sphere-tangent'] as const).flatMap(type => [false, true].map(reversed => ({ type, reversed })));
}
it.each(sphereDeclarationCancellationCases().flatMap(item => ['subnormal-tolerance', 'zeroed-coordinate'].map(fault => ({ ...item, fault }))))(
  'rejects uncertifiable dyadic $type/$fault normalization reversed=$reversed', ({ type, reversed, fault }) => {
    const length = 2 ** -51, axis = type === 'plane-sphere-tangent' ? 2 : 0, center: Vec3 = [0, 0, 0], translation: Vec3 = [0, 0, 0];
    center[axis] = 11 * length / 8; translation[axis] = 3 * length / 8;
    const fixed = endpoint(null, type === 'plane-sphere-tangent' ? plane() : type === 'sphere-sphere-tangent' ? sphereNumeric([0, 0, 0], length / 8) : cylinder([0, 0, 0], [0, 0, 1], length / 8));
    const moving = endpoint('A', sphereNumeric(center, 5 * length / 8), { translation: [...translation], rotation: [0, 0, 0, 1] }), pair = { first: reversed ? moving : fixed, second: reversed ? fixed : moving };
    const constraint: RigidMateConstraint = type === 'plane-sphere-tangent' ? { id: 'dyadic', type, ...pair, side: 'positive' } : { id: 'dyadic', type, ...pair, branch: { kind: 'external' } };
    const input = problem([constraint], [{ id: 'A', fixed: false, pose: { translation, rotation: [0, 0, 0, 1] } }]); input.lengthScale = 2 ** 1023; input.lengthTolerance = fault === 'subnormal-tolerance' ? length : 2;
    // Coefficients in exact L/8 units: center=3+3+11=17;
    // PS radius=5, SS/CS external radius sum=1+5=6. No float oracle.
    const residualUnits = 3n + 3n + 11n - (type === 'plane-sphere-tangent' ? 5n : 6n);
    expect(residualUnits > 8n).toBe(true); expect((translation[axis] / input.lengthScale + translation[axis] / input.lengthScale) + center[axis] / input.lengthScale).toBe(Number.MIN_VALUE);
    expect((type === 'plane-sphere-tangent' ? 5 : 6) * length / 8 / input.lengthScale).toBe(Number.MIN_VALUE);
    const result = evaluateRigidMates(input); expect(result.rows).toEqual([]); expect(result.checks).toEqual([]); expect(result.diagnostics).toMatchObject([{ code: 'precisionLimit' }]);
  });
it.each(['plane-sphere-tangent', 'sphere-sphere-tangent', 'cylinder-sphere-tangent'] satisfies AssemblySphereTangentMateType[])('rejects positive nonzero subnormal radius normalization with normal tolerance for %s', type => {
  const input = sphericalEquation(sphericalCases.find(item => item.type === type && !item.reversed)!), c = input.constraints[0], length = 2 ** -51;
  c.first.support!.point = [0, 0, 0]; c.second.support!.point = [0, 0, 0];
  const second = c.second.support; if (second?.kind !== 'sphere') throw new Error('Sphere required'); second.radius = 5 * length / 8;
  const first = c.first.support; if (first?.kind === 'sphere' || first?.kind === 'cylinder') first.radius = length / 8;
  input.lengthScale = 2 ** 1023; input.lengthTolerance = 2;
  expect(input.lengthTolerance / input.lengthScale).toBe(2 ** -1022); expect(second.radius / input.lengthScale).toBe(Number.MIN_VALUE);
  const result = evaluateRigidMates(input); expect(result.rows).toEqual([]); expect(result.checks).toEqual([]); expect(result.diagnostics).toMatchObject([{ code: 'precisionLimit' }]);
});
