import { expect, it, vi } from 'vitest';
import { solveRigidMates, type RigidMateSolveResult } from './assemblySolver';
import { evaluateRigidMates } from './assemblyMateEquations';
import { composeRigidPoses, identityRigidPose, rigidRotationMatrix, transformRigidDirection, type RigidPose } from './rigidPose';
import type { RigidBinaryMateConstraint as RigidMateConstraint, RigidMateEndpoint, RigidMateProblem, RigidMateSupport, RigidSolverBody } from './assemblySolveTypes';
type BinaryMateProblem = Omit<RigidMateProblem, 'constraints'> & { constraints: RigidMateConstraint[] }
import type { Vec3 } from '../cad/kernel.types';
import { rotationExp } from './assemblyKinematics';
import type { AssemblyCylinderTangentBranch, AssemblyCylinderTangentMateType } from './assemblyCylinderTangentMates';
import type { AssemblySphereTangentBranch, AssemblySphereTangentMateType } from './assemblySphereTangentMates';
import * as leastSquares from './assemblyLeastSquares';
import * as mateEquations from './assemblyMateEquations';

// Original mathematical planes/cylinders and Cartesian pose oracles. These
// tests supply no native face authority and import no CAD model or solver pose.
const H = Math.SQRT1_2;
const plane = (point: Vec3 = [0, 0, 0], normal: Vec3 = [0, 0, 1], xDirection: Vec3 = [1, 0, 0], tolerance = 0): RigidMateSupport => ({ kind: 'plane', point, normal, xDirection, tolerance });
const cylinder = (point: Vec3 = [0, 0, 0]): RigidMateSupport => ({ kind: 'cylinder', point, axis: [0, 0, 1], xDirection: [1, 0, 0], radius: 2, tolerance: 0 });
const endpoint = (bodyId: string | null, support?: RigidMateSupport, frame = identityRigidPose()): RigidMateEndpoint => ({ bodyId, frame, ...(support ? { support } : {}) });
const body = (id: string, translation: Vec3 = [0, 0, 0], fixed = false, rotation: RigidPose['rotation'] = [0, 0, 0, 1]): RigidSolverBody => ({ id, fixed, pose: { translation, rotation } });
function problem(bodies: RigidSolverBody[], constraints: RigidMateConstraint[] = []): BinaryMateProblem {
  return { bodies, constraints, origin: [0, 0, 0], lengthScale: 10, lengthTolerance: 1e-6, angleTolerance: 1e-8 };
}
function close(actual: readonly number[], expected: readonly number[], tolerance = 2e-6): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, i) => { expect(Number.isFinite(value)).toBe(true); expect(Math.abs(value - expected[i])).toBeLessThanOrEqual(tolerance); });
}
function accepted(result: RigidMateSolveResult): Map<string, RigidPose> {
  expect(['underdefined', 'fullyDefined']).toContain(result.status); expect(result.poses).not.toBeNull(); expect(result.localDOF).not.toBeNull(); expect(result.rank).not.toBeNull();
  expect(result.certificates).toEqual([]);
  for (const group of result.evidence.groups) {
    expect(group.checks.every(check => check.satisfied)).toBe(true);
    group.rowResiduals.forEach(row => expect(Math.abs(row.residual)).toBeLessThanOrEqual(row.tolerance));
    group.nullspace.forEach(mode => { expect(Math.abs(Math.hypot(...mode.vector) - 1)).toBeLessThan(1e-9); expect(mode.residualNorm).toBeLessThan(1e-7); });
  }
  return result.poses!;
}
function commonRigidGauge(input: RigidMateProblem): void {
  // Two free owners share the same left increment in the fixed normalized
  // frame: three translations and three rotations must leave relative mates.
  const evaluated = evaluateRigidMates(input); expect(evaluated.diagnostics).toEqual([]);
  for (let coordinate = 0; coordinate < 6; coordinate++) for (const row of evaluated.rows) {
    expect(Math.abs(row.jacobian[coordinate] + row.jacobian[6 + coordinate])).toBeLessThan(1e-12);
  }
}
function concentric(id: string, pin: string, x = 0, rotationLock: RigidPose['rotation'] | null = null): RigidMateConstraint {
  return { id, type: 'concentric', first: endpoint('plate', cylinder([x, 0, 0])), second: endpoint(pin, cylinder()), alignment: 'aligned', rotationLock };
}
function cap(id: string, pin: string): RigidMateConstraint {
  return { id, type: 'coincident', first: endpoint('plate', plane([0, 0, 4])), second: endpoint(pin, plane([0, 0, 12])), alignment: 'aligned' };
}
function platePins(locks = 0, planes = true): BinaryMateProblem {
  const constraints = [concentric('left-axis', 'left', -10, locks >= 1 ? [0, 0, 0, 1] : null), concentric('right-axis', 'right', 10, locks >= 2 ? [0, 0, 0, 1] : null)];
  if (planes) constraints.push(cap('left-cap', 'left'), cap('right-cap', 'right'));
  return problem([body('plate', [0, 0, 0], true), body('left', [-7, 2, -6], false, [Math.sin(.15), 0, 0, Math.cos(.15)]),
    body('right', [7, -3, -5], false, [0, Math.sin(-.2), 0, Math.cos(-.2)])], constraints);
}

it('keeps six degrees for every unconstrained free owner and clones fixed poses', () => {
  const input = problem([body('fixed', [3, 4, 5], true), body('a'), body('b', [2, 3, 4])]), before = JSON.stringify(input);
  const result = solveRigidMates(input), poses = accepted(result);
  expect(result.status).toBe('underdefined'); expect(result.rank).toBe(0); expect(result.localDOF).toBe(12); expect(result.evidence.groups).toHaveLength(2);
  expect(poses.get('fixed')).toEqual(input.bodies[0].pose); expect(poses.get('fixed')).not.toBe(input.bodies[0].pose);
  poses.get('fixed')!.translation[0] = 999; expect(JSON.stringify(input)).toBe(before);
});
it('accepts an empty numerical problem without inventing a constraint or pose', () => {
  const result = solveRigidMates(problem([])); expect(result.status).toBe('fullyDefined'); expect(result.rank).toBe(0); expect(result.localDOF).toBe(0); expect(result.poses?.size).toBe(0);
});
it.each([{ locks: 0, rank: 10, dof: 2 }, { locks: 1, rank: 11, dof: 1 }, { locks: 2, rank: 12, dof: 0 }])('jointly solves original plate/two-pin constraints with $locks rotation locks', ({ locks, rank, dof }) => {
  const input = platePins(locks), before = JSON.stringify(input), result = solveRigidMates(input), poses = accepted(result);
  expect(result.rank).toBe(rank); expect(result.localDOF).toBe(dof); expect(result.evidence.groups).toHaveLength(2);
  close(poses.get('left')!.translation, [-10, 0, -8]); close(poses.get('right')!.translation, [10, 0, -8]);
  for (const id of ['left', 'right']) close(transformRigidDirection(poses.get(id)!, [0, 0, 1]), [0, 0, 1], 2e-8);
  if (locks >= 1) close(rigidRotationMatrix(poses.get('left')!.rotation), [1, 0, 0, 0, 1, 0, 0, 0, 1], 2e-8);
  expect(poses.get('plate')).toEqual(input.bodies[0].pose); expect(JSON.stringify(input)).toBe(before);
});
it('leaves both axial translations and spins free before the cap-plane relations', () => {
  const result = solveRigidMates(platePins(0, false)); accepted(result); expect(result.rank).toBe(8); expect(result.localDOF).toBe(4);
});
it('removes the concentric lock together with its owner relation while retaining the plane', () => {
  const input = platePins(1); input.constraints = input.constraints.filter(c => c.id !== 'left-axis');
  const result = solveRigidMates(input); accepted(result); expect(result.rank).toBe(8); expect(result.localDOF).toBe(4);
});
it('preserves unlocked physical spin while a fresh relative rotation lock selects a quarter-turn', () => {
  const input = platePins(1);
  const left = input.constraints.find(c => c.id === 'left-axis'); if (!left || left.type !== 'concentric') throw new Error('Original axis missing');
  left.rotationLock = [0, 0, H, H];
  const result = solveRigidMates(input), poses = accepted(result); expect(result.localDOF).toBe(1);
  close(transformRigidDirection(poses.get('left')!, [1, 0, 0]), [0, 1, 0], 2e-8);
});
it('solves moving owners together and retains the six common rigid gauge directions', () => {
  const a = endpoint('a', cylinder()), b = endpoint('b', cylinder());
  const input = problem([body('a', [2, -3, 4], false, [Math.sin(.1), 0, 0, Math.cos(.1)]), body('b', [-4, 5, -2])], [
    { id: 'axis', type: 'concentric', first: a, second: b, alignment: 'aligned', rotationLock: null },
    { id: 'plane', type: 'coincident', first: endpoint('a', plane()), second: endpoint('b', plane([0, 0, 12])), alignment: 'aligned' },
  ]);
  const result = solveRigidMates(input); accepted(result); expect(result.rank).toBe(5); expect(result.localDOF).toBe(7);
  expect(result.evidence.groups).toHaveLength(1); expect(result.evidence.groups[0].unanchored).toBe(true);
});
it('measures rank four at an already accepted nonzero floating concentric gap', () => {
  const input = problem([body('a', [8e-7, 0, 0]), body('b')], [
    { id: 'axis', type: 'concentric', first: endpoint('a', cylinder()), second: endpoint('b', cylinder()), alignment: 'aligned', rotationLock: null },
  ]);
  commonRigidGauge(input);
  const result = solveRigidMates(input); accepted(result); expect(result.iterations).toBe(0);
  expect(result.rank).toBe(4); expect(result.localDOF).toBe(8); expect(result.evidence.groups[0].unanchored).toBe(true);
  expect(result.evidence.groups[0].nullspace).toHaveLength(8);
  expect(result.evidence.groups[0].checks[0].lengthResidual).toBeGreaterThan(0);
  expect(result.evidence.groups[0].checks[0].lengthResidual).toBeLessThan(input.lengthTolerance);
});
it('measures plane rank three inside nonzero distance and angular tolerances', () => {
  const angle = 8e-9, input = problem([body('a', [0, 0, 8e-7], false, [0, Math.sin(angle / 2), 0, Math.cos(angle / 2)]), body('b')], [
    { id: 'plane', type: 'coincident', first: endpoint('a', plane()), second: endpoint('b', plane()), alignment: 'aligned' },
  ]);
  commonRigidGauge(input);
  const result = solveRigidMates(input); accepted(result); expect(result.iterations).toBe(0); expect(result.rank).toBe(3); expect(result.localDOF).toBe(9);
  expect(result.evidence.groups[0].checks[0].lengthResidual).toBeGreaterThan(0); expect(result.evidence.groups[0].checks[0].angleResidual).toBeGreaterThan(0);
});
it.each([0, 180])('measures floating $0-degree angle rank two inside a nonzero angular tolerance', angle => {
  const initial = angle === 0 ? 8e-9 : Math.PI - 8e-9;
  const input = problem([body('a', [2, 3, 4], false, [0, Math.sin(initial / 2), 0, Math.cos(initial / 2)]), body('b', [-3, 4, 2])], [
    { id: 'angle', type: 'angle', first: endpoint('a', plane()), second: endpoint('b', plane()), angle },
  ]);
  commonRigidGauge(input);
  const result = solveRigidMates(input); accepted(result); expect(result.iterations).toBe(0); expect(result.rank).toBe(2); expect(result.localDOF).toBe(10);
  expect(result.evidence.groups[0].checks[0].angleResidual).toBeGreaterThan(0);
});
it('keeps the same combined rank when a satisfied mate is duplicated', () => {
  const input = platePins(1), original = input.constraints[0]; input.constraints.push({ ...structuredClone(original), id: 'axis-copy' });
  const result = solveRigidMates(input); accepted(result); expect(result.rank).toBe(11); expect(result.localDOF).toBe(1);
});
it('is invariant to body and mate ordering rather than solving the last mate alone', () => {
  const input = platePins(1), reversed = structuredClone(input); reversed.bodies.reverse(); reversed.constraints.reverse();
  const a = solveRigidMates(input), b = solveRigidMates(reversed), first = accepted(a), second = accepted(b);
  expect(a.rank).toBe(b.rank); expect(a.localDOF).toBe(b.localDOF);
  for (const id of ['plate', 'left', 'right']) { close(first.get(id)!.translation, second.get(id)!.translation); close(rigidRotationMatrix(first.get(id)!.rotation), rigidRotationMatrix(second.get(id)!.rotation), 2e-8); }
});
it.each([1, 10, 100])('uses a constant conditioning scale %s with the same physical plate/pin result', lengthScale => {
  const input = platePins(1); input.lengthScale = lengthScale;
  const result = solveRigidMates(input, { maxIterations: 120 }), poses = accepted(result);
  expect(result.rank).toBe(11); close(poses.get('left')!.translation, [-10, 0, -8]); close(poses.get('right')!.translation, [10, 0, -8]);
});
it('commutes with a common declared proper world-frame change', () => {
  const input = platePins(1), world: RigidPose = { translation: [10, 20, 30], rotation: [0, 0, H, H] };
  input.bodies.forEach(b => b.pose = composeRigidPoses(world, b.pose)); input.origin = [10, 20, 30];
  const result = solveRigidMates(input), poses = accepted(result); expect(result.rank).toBe(11);
  // Independent Z90 Cartesian map of (-10,0,-8) and (10,0,-8).
  close(poses.get('left')!.translation, [10, 10, 22]); close(poses.get('right')!.translation, [10, 30, 22]);
});
it('solves a relative full lock with noncommuting local endpoint frames', () => {
  const input = problem([body('fixed', [0, 0, 0], true), body('moving', [1, 3, 5])], [{ id: 'frames', type: 'lock',
    first: endpoint('fixed', undefined, { translation: [5, 0, 0], rotation: [0, 0, H, H] }),
    second: endpoint('moving', undefined, { translation: [0, 0, 2], rotation: [H, 0, 0, H] }), relativePose: identityRigidPose() }]);
  const result = solveRigidMates(input), poses = accepted(result); expect(result.localDOF).toBe(0); expect(result.rank).toBe(6);
  // Rz90*Rx(-90): (x,y,z)->(-z,x,-y); t=(5,0,0)-R*(0,0,2)=(7,0,0).
  close(poses.get('moving')!.translation, [7, 0, 0]); close(rigidRotationMatrix(poses.get('moving')!.rotation), [0, 0, -1, 1, 0, 0, 0, -1, 0], 2e-8);
});
it.each(['aligned', 'opposed'] as const)('seeds an antipodal $0 cylinder chart using real support frames and saved alignment', alignment => {
  const initial: RigidPose['rotation'] = alignment === 'aligned' ? [1, 0, 0, 0] : [0, 0, 0, 1];
  const input = problem([body('plate', [0, 0, 0], true), body('pin', [2, 3, 7], false, initial)], [
    { id: 'axis', type: 'concentric', first: endpoint('plate', cylinder()), second: endpoint('pin', cylinder()), alignment, rotationLock: null },
  ]);
  const result = solveRigidMates(input), poses = accepted(result); expect(result.localDOF).toBe(2);
  expect(result.evidence.groups[0].seededConstraintIds).toContain('axis'); close(poses.get('pin')!.translation.slice(0, 2), [0, 0]);
  close(transformRigidDirection(poses.get('pin')!, [0, 0, 1]), [0, 0, alignment === 'aligned' ? 1 : -1], 2e-8);
});
it('seeds a full-lock Log pi chart from the actual relative orientation target', () => {
  const input = problem([body('fixed', [0, 0, 0], true), body('moving', [4, 2, -3], false, [0, 0, -H, H])], [
    { id: 'lock', type: 'lock', first: endpoint('fixed'), second: endpoint('moving'), relativePose: { translation: [3, -2, 4], rotation: [0, 0, H, H] } },
  ]);
  const result = solveRigidMates(input), poses = accepted(result); expect(result.localDOF).toBe(0); expect(result.evidence.groups[0].seededConstraintIds).toContain('lock');
  close(poses.get('moving')!.translation, [3, -2, 4]); close(transformRigidDirection(poses.get('moving')!, [1, 0, 0]), [0, 1, 0], 2e-8);
});
it.each([{ angle: 0, dof: 4, rotation: [1, 0, 0, 0] as RigidPose['rotation'] }, { angle: 90, dof: 5, rotation: [0, 0, 0, 1] as RigidPose['rotation'] },
  { angle: 180, dof: 4, rotation: [0, 0, 0, 1] as RigidPose['rotation'] }])('solves the $angle-degree branch with measured Jacobian rank', ({ angle, dof, rotation }) => {
  const input = problem([body('fixed', [0, 0, 0], true), body('moving', [2, 3, 4], false, rotation)], [
    { id: 'angle', type: 'angle', first: endpoint('fixed', plane()), second: endpoint('moving', plane()), angle },
  ]);
  const result = solveRigidMates(input); accepted(result); expect(result.localDOF).toBe(dof); expect(result.rank).toBe(6 - dof);
});
it('certifies unequal offsets of exactly the same ordered plane endpoints', () => {
  const first = endpoint(null, plane()), second = endpoint('moving', plane()), input = problem([body('moving')], [
    { id: 'zero', type: 'coincident', first, second, alignment: 'aligned' },
    { id: 'two', type: 'distance', first: structuredClone(first), second: structuredClone(second), alignment: 'aligned', distance: 2 },
  ]);
  const result = solveRigidMates(input); expect(result.status).toBe('inconsistent'); expect(result.poses).toBeNull(); expect(result.localDOF).toBeNull();
  expect(result.certificates).toHaveLength(1); const certificate = result.certificates[0];
  if (certificate.kind !== 'duplicateOffset') throw new Error('Expected direct offset certificate'); expect(certificate.gap).toBe(2); expect(certificate.toleranceSum).toBe(2e-6);
});
it('does not certify an offset gap within the sum of its physical tolerances', () => {
  const first = endpoint(null, plane()), second = endpoint('moving', plane()), input = problem([body('moving')], [
    { id: 'zero', type: 'coincident', first, second, alignment: 'aligned' },
    { id: 'near', type: 'distance', first, second, alignment: 'aligned', distance: 5e-7 },
  ]);
  const result = solveRigidMates(input); accepted(result); expect(result.certificates).toEqual([]); expect(result.localDOF).toBe(3);
});
it('never merges equal-looking endpoints belonging to distinct free occurrence IDs', () => {
  const first = endpoint(null, plane()), input = problem([body('a', [3, 4, 2]), body('b', [3, 4, 2])], [
    { id: 'zero', type: 'coincident', first, second: endpoint('a', plane()), alignment: 'aligned' },
    { id: 'two', type: 'distance', first, second: endpoint('b', plane()), alignment: 'aligned', distance: 2 },
  ]);
  const result = solveRigidMates(input), poses = accepted(result); close(poses.get('a')!.translation, [3, 4, 0]); close(poses.get('b')!.translation, [3, 4, -2]);
  expect(result.localDOF).toBe(6); expect(result.evidence.groups).toHaveLength(2);
});
it('certifies a violated fixed-only constraint without trying to move a fixed owner', () => {
  const input = problem([body('a', [0, 0, 0], true), body('b', [0, 0, 5], true)], [
    { id: 'fixed-plane', type: 'coincident', first: endpoint('a', plane()), second: endpoint('b', plane()), alignment: 'aligned' },
  ]), before = JSON.stringify(input), result = solveRigidMates(input);
  expect(result.status).toBe('inconsistent'); expect(result.poses).toBeNull(); expect(result.certificates[0].kind).toBe('fixedConstraint'); expect(result.iterations).toBe(0); expect(JSON.stringify(input)).toBe(before);
});
it('reports a local numerical stall without asserting a global conflict from nearby declarations', () => {
  const input = problem([body('moving')], [
    { id: 'zero', type: 'coincident', first: endpoint(null, plane()), second: endpoint('moving', plane()), alignment: 'aligned' },
    { id: 'two', type: 'distance', first: endpoint(null, plane([0, 0, 0], [0, 0, 1], [0, 1, 0])), second: endpoint('moving', plane()), alignment: 'aligned', distance: 2 },
  ]);
  const result = solveRigidMates(input, { maxIterations: 8 }); expect(result.status).toBe('nonConverged'); expect(result.poses).toBeNull(); expect(result.certificates).toEqual([]);
});
it('withholds every pose when the explicit iteration budget is exhausted', () => {
  const input = platePins(1), before = JSON.stringify(input), result = solveRigidMates(input, { maxIterations: 0 });
  expect(result.status).toBe('nonConverged'); expect(result.poses).toBeNull(); expect(result.certificates).toEqual([]); expect(JSON.stringify(input)).toBe(before);
});
it('withholds chart seeds too when seeding is disabled and no regular step exists', () => {
  const input = problem([body('plate', [0, 0, 0], true), body('pin', [0, 0, 0], false, [1, 0, 0, 0])], [concentric('axis', 'pin')]);
  const result = solveRigidMates(input, { maxSeedPasses: 0 }); expect(result.status).toBe('nonConverged'); expect(result.poses).toBeNull();
});
it('returns uncertain rank without a DOF integer or poses at a configured threshold boundary', () => {
  const input = problem([body('moving')], [{ id: 'plane', type: 'coincident', first: endpoint(null, plane()), second: endpoint('moving', plane()), alignment: 'aligned' }]);
  const result = solveRigidMates(input, { svd: { rankAbsoluteTolerance: 1, rankRelativeTolerance: 0 } });
  expect(result.status).toBe('rankUncertain'); expect(result.rank).toBeNull(); expect(result.localDOF).toBeNull(); expect(result.poses).toBeNull(); expect(result.evidence.groups[0].rank).toBeNull();
});
it('does not let a shared fixed owner merge independent unknown groups past the SVD capacity', () => {
  const bodies = [body('fixed', [0, 0, 0], true), ...Array.from({ length: 30 }, (_, i) => body('free-' + i, [i, 0, 0]))];
  const constraints: RigidMateConstraint[] = bodies.slice(1).map((b, i) => ({ id: 'lock-' + i, type: 'lock', first: endpoint('fixed'), second: endpoint(b.id), relativePose: { translation: [i, 0, 0], rotation: [0, 0, 0, 1] } }));
  const result = solveRigidMates(problem(bodies, constraints)); accepted(result); expect(result.rank).toBe(180); expect(result.localDOF).toBe(0); expect(result.evidence.groups).toHaveLength(30);
});
it('rejects an oversized connected free-owner component without clipping variables', () => {
  const bodies = Array.from({ length: 22 }, (_, i) => body('b' + i));
  const constraints: RigidMateConstraint[] = bodies.slice(1).map((b, i) => ({ id: 'lock-' + i, type: 'lock', first: endpoint(bodies[i].id), second: endpoint(b.id), relativePose: identityRigidPose() }));
  const result = solveRigidMates(problem(bodies, constraints)); expect(result.status).toBe('capacityLimit'); expect(result.poses).toBeNull();
});
it('rejects a connected row budget beyond 256 without dropping repeated mates', () => {
  const constraints: RigidMateConstraint[] = Array.from({ length: 65 }, (_, i) => ({ id: 'plane-' + i, type: 'coincident', first: endpoint(null, plane()), second: endpoint('moving', plane()), alignment: 'aligned' }));
  const result = solveRigidMates(problem([body('moving')], constraints)); expect(result.status).toBe('capacityLimit'); expect(result.poses).toBeNull();
});
it('retains a free owner in incidence even when a self relation has zero derivatives', () => {
  const input = problem([body('moving')], [{ id: 'self', type: 'lock', first: endpoint('moving'), second: endpoint('moving'), relativePose: identityRigidPose() }]);
  const result = solveRigidMates(input); accepted(result); expect(result.rank).toBe(0); expect(result.localDOF).toBe(6); expect(result.evidence.groups[0].bodyIds).toEqual(['moving']);
});
it('reports the native tolerance floor actually used instead of claiming the requested smaller tolerance', () => {
  const input = problem([body('moving', [0, 0, .005])], [{ id: 'plane', type: 'coincident', first: endpoint(null, plane([0, 0, 0], [0, 0, 1], [1, 0, 0], .01)),
    second: endpoint('moving', plane([0, 0, 0], [0, 0, 1], [1, 0, 0], .01)), alignment: 'aligned' }]);
  const result = solveRigidMates(input); accepted(result); expect(result.evidence.groups[0].checks[0].lengthTolerance).toBe(.02);
});
it('rejects invalid supports before they could produce a false direct conflict certificate', () => {
  const first = endpoint(null, plane([0, 0, 0], [0, 0, 0])), second = endpoint('moving', plane());
  const result = solveRigidMates(problem([body('moving')], [
    { id: 'a', type: 'coincident', first, second, alignment: 'aligned' }, { id: 'b', type: 'distance', first, second, alignment: 'aligned', distance: 2 },
  ])); expect(result.status).toBe('invalidInput'); expect(result.certificates).toEqual([]); expect(result.poses).toBeNull();
});
it.each([{ maxIterations: -1 }, { maxTrials: 0 }, { maxSeedPasses: 17 }, { maxStepNorm: 0 }, { initialDamping: NaN }])('rejects invalid numerical budgets %#', options => {
  const result = solveRigidMates(problem([body('moving')]), options); expect(result.status).toBe('invalidInput'); expect(result.poses).toBeNull();
});

function solverDirectionSupport(kind: RigidMateSupport['kind'], direction: Vec3 = [0, 0, 1]): RigidMateSupport {
  const xDirection: Vec3 = Math.abs(direction[2]) > .9 ? [1, 0, 0] : [0, 0, 1];
  return kind === 'plane' ? plane([31, -17, 9], direction, xDirection)
    : kind === 'line' ? { kind, point: [-200, 300, 400], axis: direction, tolerance: 0 }
      : { kind, point: [-70, 120, 90], axis: direction, xDirection, radius: 8, tolerance: 0 };
}
const solverDirectionPairs: [RigidMateSupport['kind'], RigidMateSupport['kind'], 'parallel' | 'perpendicular'][] = [
  ['plane', 'plane', 'parallel'], ['plane', 'cylinder', 'perpendicular'], ['plane', 'line', 'perpendicular'],
  ['cylinder', 'plane', 'perpendicular'], ['cylinder', 'cylinder', 'parallel'], ['cylinder', 'line', 'parallel'],
  ['line', 'plane', 'perpendicular'], ['line', 'cylinder', 'parallel'], ['line', 'line', 'parallel'],
];
const solverDirectionCases = solverDirectionPairs.flatMap(([first, second, collinear]) => [
  { first, second, type: collinear, alignment: 'aligned' as const, target: [0, 0, 1] as Vec3, rank: 2 },
  { first, second, type: collinear, alignment: 'opposed' as const, target: [0, 0, -1] as Vec3, rank: 2 },
  { first, second, type: (collinear === 'parallel' ? 'perpendicular' : 'parallel') as 'parallel' | 'perpendicular',
    alignment: null, target: [1, 0, 0] as Vec3, rank: 1 },
]);
it.each(solverDirectionCases)('solves the declared $type $first/$second/$alignment branch and measures its rank', item => {
  const input = problem([body('moving', [100, -200, 300])], [{ id: 'direction', type: item.type, alignment: item.alignment,
    first: endpoint(null, solverDirectionSupport(item.first)), second: endpoint('moving', solverDirectionSupport(item.second)) }]);
  const before = JSON.stringify(input), result = solveRigidMates(input), poses = accepted(result);
  expect(result.rank).toBe(item.rank); expect(result.localDOF).toBe(6 - item.rank); expect(result.evidence.groups[0].rowCount).toBe(item.rank === 2 ? 3 : 1);
  expect(JSON.stringify(input)).toBe(before);
  const actual = transformRigidDirection(poses.get('moving')!, [0, 0, 1]);
  if (item.rank === 2) close(actual, item.target, 1e-8);
  else expect(Math.abs(actual[2])).toBeLessThanOrEqual(1e-8);
  if (item.alignment !== 'aligned') expect(result.evidence.groups[0].seededConstraintIds).toEqual(['direction']);
  expect(result.gearAngles.size + result.screwAngles.size + result.rackPinionAngles.size).toBe(0);
});
it.each(solverDirectionCases)('retains all six common rigid gauge DOFs for floating $type $first/$second/$alignment', item => {
  const input = problem([body('A', [10, -20, 30]), body('B', [-4, 7, 12])], [{ id: 'direction', type: item.type, alignment: item.alignment,
    first: endpoint('A', solverDirectionSupport(item.first)), second: endpoint('B', solverDirectionSupport(item.second, item.target)) }]);
  commonRigidGauge(input); const result = solveRigidMates(input); accepted(result);
  expect(result.rank).toBe(item.rank); expect(result.localDOF).toBe(12 - item.rank); expect(result.evidence.groups[0].unanchored).toBe(true);
});
it('flips a confirmed parallel plane pair from aligned to opposed without inventing a twist lock', () => {
  const input = problem([body('moving')], [{ id: 'direction', type: 'parallel', alignment: 'aligned', first: endpoint(null, plane()), second: endpoint('moving', plane()) }]);
  const first = solveRigidMates(input); accepted(first);
  input.bodies[0].pose = first.poses!.get('moving')!;
  const mate = input.constraints[0]; if (mate.type !== 'parallel') throw new Error('Original direction missing'); mate.alignment = 'opposed';
  const flipped = solveRigidMates(input); accepted(flipped); expect(flipped.localDOF).toBe(4);
  close(transformRigidDirection(flipped.poses!.get('moving')!, [0, 0, 1]), [0, 0, -1], 1e-8);
});
it.each(['parallel', 'perpendicular'] as const)('certifies a regular fixed %s contradiction without publishing placements', type => {
  const input = problem([body('A', [0, 0, 0], true), body('B', [10, 20, 30], true, rotationExp([0, Math.PI / 6, 0]))], [
    { id: 'fixed-direction', type, alignment: type === 'parallel' ? 'aligned' : null,
      first: endpoint('A', plane()), second: endpoint('B', plane()) },
  ]);
  const before = JSON.stringify(input), result = solveRigidMates(input);
  expect(result.status).toBe('inconsistent'); expect(result.poses).toBeNull(); expect(result.rank).toBeNull(); expect(result.localDOF).toBeNull();
  expect(result.certificates).toMatchObject([{ kind: 'fixedConstraint', constraintIds: ['fixed-direction'], checks: [{ satisfied: false }] }]);
  expect(JSON.stringify(input)).toBe(before);
});
it.each(['parallel', 'perpendicular'] as const)('accepts a satisfied fixed %s relation with zero variables', type => {
  const input = problem([], [{ id: 'fixed-direction', type, alignment: type === 'parallel' ? 'aligned' : null,
    first: endpoint(null, plane()), second: endpoint(null, solverDirectionSupport('plane', type === 'parallel' ? [0, 0, 1] : [1, 0, 0])) }]);
  const result = solveRigidMates(input); accepted(result); expect(result.status).toBe('fullyDefined'); expect(result.rank).toBe(0); expect(result.localDOF).toBe(0);
});
it('keeps a direction relation within one free rigid owner at rank zero', () => {
  const input = problem([body('same', [12, -13, 14])], [{ id: 'internal', type: 'parallel', alignment: null,
    first: endpoint('same', plane()), second: endpoint('same', solverDirectionSupport('line', [1, 0, 0])) }]);
  const evaluated = evaluateRigidMates(input); expect(evaluated.diagnostics).toEqual([]);
  evaluated.rows.forEach(row => close(row.jacobian, [0, 0, 0, 0, 0, 0], 1e-15));
  const result = solveRigidMates(input); accepted(result); expect(result.rank).toBe(0); expect(result.localDOF).toBe(6);
});
it('does not publish an unsatisfied invariant relation between references on one owner', () => {
  const input = problem([body('same')], [{ id: 'internal', type: 'parallel', alignment: 'aligned',
    first: endpoint('same', plane()), second: endpoint('same', solverDirectionSupport('plane', [1, 0, 0])) }]);
  const result = solveRigidMates(input); expect(result.status).toBe('nonConverged'); expect(result.poses).toBeNull(); expect(result.localDOF).toBeNull();
});
it('rejects a singular direction start when the explicit seed budget is zero', () => {
  const input = problem([body('moving')], [{ id: 'direction', type: 'perpendicular', alignment: null, first: endpoint(null, plane()), second: endpoint('moving', plane()) }]);
  const result = solveRigidMates(input, { maxSeedPasses: 0 }); expect(result.status).toBe('nonConverged'); expect(result.poses).toBeNull();
  expect(result.evidence.groups[0].seededConstraintIds).toEqual([]);
});
function directionGear(): Extract<RigidMateConstraint, { type: 'gear' }> {
  return { id: 'gear', type: 'gear', first: endpoint('A', cylinder()), second: endpoint('B', cylinder()), carrier: null,
    ratio: { numerator: 1, denominator: 1 }, direction: 'opposed', neutralRotations: { first: [0, 0, 0, 1], second: [0, 0, 0, 1] },
    angles: { first: 0, second: 0 }, phase: 0 };
}
it('solves compatible regular direction and gear rows without resetting the original angular anchors', () => {
  const input = problem([body('A', [0, 0, 0], false, rotationExp([.1, 0, 0])), body('B')], [directionGear(),
    { id: 'direction', type: 'parallel', alignment: 'aligned', first: endpoint('A', plane()), second: endpoint('B', plane()) }]);
  const before = JSON.stringify(input), result = solveRigidMates(input); accepted(result); expect(result.rank).toBe(3); expect(result.localDOF).toBe(9);
  expect(result.evidence.groups[0].seededConstraintIds).toEqual([]); expect(result.gearAngles.size).toBe(1);
  const angles = result.gearAngles.get('gear')!; expect(Math.abs(angles.first)).toBeLessThan(1e-8); expect(Math.abs(angles.second)).toBeLessThan(1e-8);
  expect(JSON.stringify(input)).toBe(before);
});
it.each([false, true])('preserves the no-reseed winding policy at an exact singular direction chart (passive=%s)', passive => {
  const gear = directionGear(), input = problem([body('A'), body('B')], [
    { id: 'direction', type: 'perpendicular', alignment: null, first: endpoint('A', plane()), second: endpoint('B', plane()) },
    ...(passive ? [] : [gear]),
  ]);
  if (passive) input.passiveGears = [gear];
  const before = JSON.stringify(input), result = solveRigidMates(input);
  expect(result.status).toBe('nonConverged'); expect(result.poses).toBeNull(); expect(result.gearAngles.size).toBe(0);
  expect(result.evidence.groups[0].seededConstraintIds).toEqual([]); expect(JSON.stringify(input)).toBe(before);
});
it('keeps thirty independent direction groups separate despite their shared fixed endpoint', () => {
  const bodies = Array.from({ length: 30 }, (_, index) => body('free-' + index, [index, -index, index + 2]));
  const constraints: RigidMateConstraint[] = bodies.map(value => ({ id: 'direction-' + value.id, type: 'parallel', alignment: 'aligned',
    first: endpoint(null, plane()), second: endpoint(value.id, solverDirectionSupport('plane')) }));
  const result = solveRigidMates(problem(bodies, constraints)); accepted(result); expect(result.rank).toBe(60); expect(result.localDOF).toBe(120);
  expect(result.evidence.groups).toHaveLength(30); expect(result.evidence.groups.every(group => group.variableCount === 6 && group.rowCount === 3)).toBe(true);
});
it.each([{ count: 85, orthogonal: false, admitted: true }, { count: 86, orthogonal: false, admitted: false },
  { count: 256, orthogonal: true, admitted: true }, { count: 257, orthogonal: true, admitted: false }])(
  'admits the existing row budget without clipping direction rows: $count/$orthogonal', ({ count, orthogonal, admitted }) => {
    const constraints: RigidMateConstraint[] = Array.from({ length: count }, (_, index) => ({ id: 'direction-' + index,
      type: orthogonal ? 'perpendicular' : 'parallel', alignment: orthogonal ? null : 'aligned', first: endpoint(null, plane()),
      second: endpoint('moving', solverDirectionSupport('plane', orthogonal ? [1, 0, 0] : [0, 0, 1])) }));
    const input = problem([body('moving')], constraints), result = solveRigidMates(input);
    if (admitted) { accepted(result); expect(result.evidence.groups[0].rowCount).toBe(count * (orthogonal ? 1 : 3)); }
    else { expect(result.status).toBe('capacityLimit'); expect(result.poses).toBeNull(); }
  });
it.each([null, 'either', true])('rejects invalid collinear alignment %s without publishing any numerical state', alignment => {
  const input = problem([body('moving')], [{ id: 'direction', type: 'parallel', alignment: alignment as never,
    first: endpoint(null, plane()), second: endpoint('moving', plane()) }]);
  const before = JSON.stringify(input), result = solveRigidMates(input); expect(result.status).toBe('invalidInput'); expect(result.poses).toBeNull();
  expect(result.gearAngles.size + result.screwAngles.size + result.rackPinionAngles.size).toBe(0); expect(JSON.stringify(input)).toBe(before);
});

function tangentSolverProblem(side: 'positive' | 'negative' = 'positive', reversed = false, floatingPlane = false, tilt = .25): BinaryMateProblem {
  const flat = endpoint('plane', plane([0, 0, 4])), curved = endpoint('cylinder', { kind: 'cylinder', point: [0, 15, 0], axis: [0, 1, 0], xDirection: [1, 0, 0], radius: 2, tolerance: 0 });
  return problem([body('plane', [0, 0, 0], !floatingPlane), body('cylinder', [8, -3, side === 'positive' ? 7 : 1], false, [Math.sin(tilt / 2), 0, 0, Math.cos(tilt / 2)])],
    [{ id: 'tangent', type: 'tangent', side, first: reversed ? curved : flat, second: reversed ? flat : curved }]);
}
function tangentAnalytic(poses: ReadonlyMap<string, RigidPose>, side: 'positive' | 'negative', radius = 2): void {
  // Independent Hamilton formulas: plane local +Z and cylinder local +Y.
  // The canonical axis passes through the cylinder's own component origin.
  const p = poses.get('plane')!, c = poses.get('cylinder')!, [x, y, z, w] = p.rotation, [u, v, s, t] = c.rotation;
  const n = [2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y)];
  const a = [2 * (u * v - t * s), 1 - 2 * (u * u + s * s), 2 * (v * s + t * u)];
  const h = n.reduce((sum, value, i) => sum + value * a[i], 0);
  expect(Math.abs(Math.asin(Math.max(-1, Math.min(1, h))))).toBeLessThanOrEqual(1e-8);
  const d = n.reduce((sum, value, i) => sum + value * (c.translation[i] - p.translation[i] - 4 * n[i]), 0);
  expect(Math.abs(d - (side === 'positive' ? radius : -radius))).toBeLessThanOrEqual(1e-6);
}
const tangentSolverCases = [false, true].flatMap(reversed => (['positive', 'negative'] as const).flatMap(side => [false, true].map(floatingPlane => ({ reversed, side, floatingPlane }))));
it.each(tangentSolverCases)('solves independent tangent side=$side reversed=$reversed floatingPlane=$floatingPlane with rank2', ({ side, reversed, floatingPlane }) => {
  const input = tangentSolverProblem(side, reversed, floatingPlane), before = JSON.stringify(input), result = solveRigidMates(input), poses = accepted(result);
  expect(result.rank).toBe(2); expect(result.localDOF).toBe(floatingPlane ? 10 : 4); expect(result.evidence.groups[0].rowCount).toBe(2);
  tangentAnalytic(poses, side); if (!floatingPlane) expect(poses.get('plane')).toEqual(input.bodies[0].pose);
  if (floatingPlane) commonRigidGauge({ ...input, bodies: input.bodies.map(value => ({ ...value, pose: poses.get(value.id)! })) });
  expect(JSON.stringify(input)).toBe(before); poses.get('cylinder')!.translation[0] = 999; expect(JSON.stringify(input)).toBe(before);
});
it('edits the geometric tangent side without an alignment branch or saved capture zero', () => {
  const input = tangentSolverProblem(), result = solveRigidMates(input); accepted(result);
  input.bodies.forEach(value => value.pose = result.poses!.get(value.id)!); const constraint = input.constraints[0];
  if (constraint.type !== 'tangent') throw new Error('Original tangent required'); constraint.side = 'negative';
  const next = solveRigidMates(input); tangentAnalytic(accepted(next), 'negative'); expect(next.rank).toBe(2); expect(next.localDOF).toBe(4);
  expect(next.evidence.groups[0].seededConstraintIds).toEqual([]);
});
it.each(['positive', 'negative'] as const)('accepts satisfied fixed/fixed tangent %s with no variables', side => {
  const input = tangentSolverProblem(side, false, false, 0); input.bodies[1].fixed = true; input.bodies[1].pose.translation[2] = side === 'positive' ? 6 : 2;
  const result = solveRigidMates(input); accepted(result); expect(result.rank).toBe(0); expect(result.localDOF).toBe(0); expect(result.poses!.get('cylinder')).toEqual(input.bodies[1].pose);
});
it.each(['positive', 'negative'] as const)('certifies a regular fixed/fixed tangent %s conflict without output poses', side => {
  const input = tangentSolverProblem(side); input.bodies[1].fixed = true; const before = JSON.stringify(input), result = solveRigidMates(input);
  expect(result.status).toBe('inconsistent'); expect(result.poses).toBeNull(); expect(result.certificates).toMatchObject([{ kind: 'fixedConstraint', constraintIds: ['tangent'] }]);
  expect(JSON.stringify(input)).toBe(before);
});
it('retains all six common motions for a satisfied same-owner tangent and rejects an unsatisfied invariant', () => {
  const curved = endpoint('same', { kind: 'cylinder', point: [0, 15, 0], axis: [0, 1, 0], xDirection: [1, 0, 0], radius: 2, tolerance: 0 }, { translation: [0, 0, 6], rotation: [0, 0, 0, 1] });
  const input = problem([body('same', [12, -13, 14])], [{ id: 'internal', type: 'tangent', side: 'positive', first: endpoint('same', plane([0, 0, 4])), second: curved }]);
  const result = solveRigidMates(input); accepted(result); expect(result.rank).toBe(0); expect(result.localDOF).toBe(6);
  curved.frame.translation[2] = 9; const rejected = solveRigidMates(input); expect(rejected.status).toBe('nonConverged'); expect(rejected.poses).toBeNull();
});
it('leaves both in-plane translations and cylinder spin available under an explicit compatible target', () => {
  const input = tangentSolverProblem('positive', false, false, 0), desired: RigidPose = { translation: [19, -23, 6], rotation: [0, Math.sin(Math.PI / 6), 0, Math.cos(Math.PI / 6)] };
  input.constraints.push({ id: 'driver', type: 'lock', first: endpoint(null, undefined, desired), second: endpoint('cylinder'), relativePose: identityRigidPose() });
  const result = solveRigidMates(input), poses = accepted(result); close(poses.get('cylinder')!.translation, desired.translation); tangentAnalytic(poses, 'positive'); expect(result.rank).toBe(6); expect(result.localDOF).toBe(0);
});
it('re-evaluates the current cylinder radius instead of caching the previous tangent offset', () => {
  const input = tangentSolverProblem('positive', false, false, 0), first = solveRigidMates(input); accepted(first);
  input.bodies.forEach(value => value.pose = first.poses!.get(value.id)!); const support = input.constraints[0].second.support;
  if (support?.kind !== 'cylinder') throw new Error('Original cylinder required'); support.radius = 3;
  const second = solveRigidMates(input); tangentAnalytic(accepted(second), 'positive', 3); expect(second.rank).toBe(2); expect(second.localDOF).toBe(4);
});
it('does not double-count a duplicate tangent or its implied direction row', () => {
  const input = tangentSolverProblem(), tangent = input.constraints[0]; input.constraints.push({ ...structuredClone(tangent), id: 'duplicate' },
    { id: 'direction', type: 'parallel', alignment: null, first: tangent.first, second: tangent.second });
  const result = solveRigidMates(input); tangentAnalytic(accepted(result), 'positive'); expect(result.rank).toBe(2); expect(result.localDOF).toBe(4); expect(result.evidence.groups[0].rowCount).toBe(5);
});
it('does not invent extra mobility constraints for tangent already implied by a positioned coaxial cylinder', () => {
  const input = tangentSolverProblem('positive', false, false, 0), curved = input.constraints[0].second;
  input.constraints.push({ id: 'bearing', type: 'concentric', alignment: 'aligned', rotationLock: null, first: curved,
    second: endpoint(null, { kind: 'cylinder', point: [0, 0, 6], axis: [0, 1, 0], xDirection: [1, 0, 0], radius: 7, tolerance: 0 }) });
  const result = solveRigidMates(input); tangentAnalytic(accepted(result), 'positive'); expect(result.rank).toBe(4); expect(result.localDOF).toBe(2);
});
it.each(['opposite-side', 'lock'] as const)('rejects simultaneous tangent %s contradictions atomically', conflict => {
  const input = tangentSolverProblem('positive', false, false, 0), tangent = input.constraints[0];
  if (conflict === 'opposite-side') input.constraints.push({ ...tangent, id: 'opposite', type: 'tangent', side: 'negative' });
  else input.constraints.push({ id: 'lock', type: 'lock', first: endpoint(null, undefined, { translation: [8, -3, 10], rotation: [0, 0, 0, 1] }), second: endpoint('cylinder'), relativePose: identityRigidPose() });
  const before = JSON.stringify(input), result = solveRigidMates(input); expect(['inconsistent', 'nonConverged']).toContain(result.status); expect(result.poses).toBeNull(); expect(result.localDOF).toBeNull(); expect(JSON.stringify(input)).toBe(before);
});
it.each([1, -1])('seeds a singular tangent cylinder axis %s under the existing bounded policy only', sign => {
  const input = tangentSolverProblem('positive', false, false, 0), support = input.constraints[0].second.support;
  if (support?.kind !== 'cylinder') throw new Error('Original cylinder required'); support.axis = [0, 0, sign];
  const result = solveRigidMates(input); accepted(result); expect(result.rank).toBe(2); expect(result.localDOF).toBe(4); expect(result.evidence.groups[0].seededConstraintIds).toEqual(['tangent']);
  const direction = transformRigidDirection(result.poses!.get('cylinder')!, support.axis); expect(Math.abs(direction[2])).toBeLessThanOrEqual(1e-8);
});
it('rejects an exact tangent singularity when no seed budget was authorized', () => {
  const input = tangentSolverProblem(), support = input.constraints[0].second.support;
  if (support?.kind !== 'cylinder') throw new Error('Original cylinder required'); support.axis = [0, 0, 1]; input.bodies[1].pose.rotation = [0, 0, 0, 1];
  const result = solveRigidMates(input, { maxSeedPasses: 0 }); expect(result.status).toBe('nonConverged'); expect(result.poses).toBeNull(); expect(result.evidence.groups[0].seededConstraintIds).toEqual([]);
});
it('keeps independent tangent owner groups separate across one fixed plane', () => {
  const bodies = Array.from({ length: 24 }, (_, i) => body('roller-' + i, [i, -i, 2])), constraints: RigidMateConstraint[] = bodies.map(value => ({ id: value.id, type: 'tangent', side: 'positive',
    first: endpoint(null, plane()), second: endpoint(value.id, { kind: 'cylinder', point: [0, 0, 0], axis: [0, 1, 0], xDirection: [1, 0, 0], radius: 2, tolerance: 0 }) }));
  const result = solveRigidMates(problem(bodies, constraints)); accepted(result); expect(result.rank).toBe(48); expect(result.localDOF).toBe(96); expect(result.evidence.groups).toHaveLength(24);
});
it.each([128, 129])('counts exactly two tangent rows against the unchanged connected budget: %s declarations', count => {
  const input = tangentSolverProblem('positive', false, false, 0); input.bodies[1].pose.translation[2] = 6;
  input.constraints = Array.from({ length: count }, (_, i) => ({ ...structuredClone(input.constraints[0]), id: 'tangent-' + i }));
  const result = solveRigidMates(input);
  if (count === 128) { accepted(result); expect(result.evidence.groups[0].rowCount).toBe(256); expect(result.rank).toBe(2); }
  else { expect(result.status).toBe('capacityLimit'); expect(result.poses).toBeNull(); }
});
it.each([null, 'aligned', 1])('rejects invalid tangent side %s before publication', side => {
  const input = tangentSolverProblem(), constraint = input.constraints[0]; if (constraint.type !== 'tangent') throw new Error('Original tangent required'); constraint.side = side as never;
  const result = solveRigidMates(input); expect(result.status).toBe('invalidInput'); expect(result.poses).toBeNull(); expect(result.certificates).toEqual([]);
});
it.each(['plane', 'cylinder', 'line'] as const)('rejects invalid tangent support pair %s before solving', kind => {
  const input = tangentSolverProblem(); input.constraints[0].second.support = kind === 'plane' ? plane() : kind === 'line'
    ? { kind: 'line', point: [0, 0, 0], axis: [0, 1, 0], tolerance: 0 } : cylinder();
  if (kind === 'cylinder') input.constraints[0].first.support = cylinder();
  const result = solveRigidMates(input); expect(result.status).toBe('invalidInput'); expect(result.poses).toBeNull();
});
it.each(['gear', 'screw', 'rack-pinion'] as const)('retains an accepted regular tangent with %s tracking and unchanged saved chart', family => {
  const first = endpoint('A', cylinder()), second = endpoint('B', cylinder()), data = { neutralRotation: [0, 0, 0, 1] as RigidPose['rotation'], angle: 0, neutralTravel: 0 };
  const mechanical: RigidMateConstraint = family === 'gear' ? directionGear() : family === 'screw'
    ? { id: 'screw', type: family, first, second, ...data, lead: 5, reverse: false, alignment: 'aligned' }
    : { id: 'rack', type: family, first, second: endpoint('B', { kind: 'line', point: [0, 0, 0], axis: [1, 0, 0], tolerance: 0 }), ...data,
      neutralTravel: -2, conversion: { mode: 'diameter', override: null }, reverse: false };
  const input = problem([body('A', [2, 0, 0]), body('B', family === 'screw' ? [2, 0, 0] : [0, 0, 0])], [mechanical,
    { id: 'tangent', type: 'tangent', side: 'positive', first: endpoint(null, plane([0, 0, 0], [1, 0, 0], [0, 1, 0])), second: first }]);
  const before = JSON.stringify(input), result = solveRigidMates(input); accepted(result); expect(result.rank).toBe(family === 'screw' ? 7 : 3);
  expect(result.localDOF).toBe(family === 'screw' ? 5 : 9); expect(result.evidence.groups[0].seededConstraintIds).toEqual([]); expect(JSON.stringify(input)).toBe(before);
  expect(result.gearAngles.size + result.screwAngles.size + result.rackPinionAngles.size).toBe(1);
});
it.each([false, true])('continues actual tangent iterations without resetting lifted gear state (passive=%s)', passive => {
  const gear = directionGear(); gear.angles = { first: 4 * Math.PI, second: -4 * Math.PI };
  const input = problem([body('A', [3, 0, 0], false, rotationExp([0, .1, 0])), body('B')], [
    { id: 'tangent', type: 'tangent', side: 'positive', first: endpoint(null, plane([0, 0, 0], [1, 0, 0], [0, 1, 0])), second: endpoint('A', cylinder()) }, ...(passive ? [] : [gear])]);
  if (passive) input.passiveGears = [gear]; const before = JSON.stringify(input), result = solveRigidMates(input), poses = accepted(result);
  expect(result.iterations).toBeGreaterThan(0); expect(result.rank).toBe(passive ? 2 : 3); expect(result.localDOF).toBe(passive ? 10 : 9);
  expect(Math.abs(poses.get('A')!.translation[0] - 2)).toBeLessThanOrEqual(1e-6);
  const axis = transformRigidDirection(poses.get('A')!, [0, 0, 1]); expect(Math.abs(axis[0])).toBeLessThanOrEqual(1e-8);
  const lifted = result.gearAngles.get('gear')!; expect(Math.abs(lifted.first - 4 * Math.PI)).toBeLessThan(.01); expect(Math.abs(lifted.second + 4 * Math.PI)).toBeLessThan(.01);
  if (!passive) expect(Math.abs(lifted.first + lifted.second)).toBeLessThanOrEqual(1e-8);
  expect(result.evidence.groups.every(group => group.seededConstraintIds.length === 0)).toBe(true); expect(JSON.stringify(input)).toBe(before);
});
it.each(['radius-underflow', 'oblique-cancellation'] as const)('withholds every solve result/map on tangent %s', fault => {
  const input = tangentSolverProblem(), support = input.constraints[0].second.support;
  if (support?.kind !== 'cylinder') throw new Error('Original cylinder required');
  if (fault === 'radius-underflow') support.radius = Number.MIN_VALUE;
  else { support.axis = [Math.SQRT1_2, Math.SQRT1_2, 0]; support.xDirection = [0, 0, 1]; support.point = [1e14, 1e14 + 2, 0]; }
  const before = JSON.stringify(input), result = solveRigidMates(input); expect(result.status).toBe('precisionLimit'); expect(result.poses).toBeNull();
  expect(result.gearAngles.size + result.screwAngles.size + result.rackPinionAngles.size).toBe(0); expect(JSON.stringify(input)).toBe(before);
});
it.each([false, true])('rejects tangent singularity without reseeding active/passive gear history (passive=%s)', passive => {
  const gear = directionGear(), input = problem([body('A', [0, 0, 2]), body('B')], [
    { id: 'tangent', type: 'tangent', side: 'positive', first: endpoint(null, plane()), second: endpoint('A', cylinder()) }, ...(passive ? [] : [gear])]);
  if (passive) input.passiveGears = [gear]; const before = JSON.stringify(input), result = solveRigidMates(input);
  expect(result.status).toBe('nonConverged'); expect(result.poses).toBeNull(); expect(result.gearAngles.size).toBe(0); expect(result.evidence.groups[0].seededConstraintIds).toEqual([]); expect(JSON.stringify(input)).toBe(before);
});

const ccSolverTypes: AssemblyCylinderTangentMateType[] = ['skew-cylinder-tangent', 'parallel-cylinder-tangent'];
const ccSolverBranches: { branch: AssemblyCylinderTangentBranch; first: number; second: number; target: number }[] = [
  { branch: { kind: 'external' }, first: 2, second: 3, target: 5 },
  { branch: { kind: 'internal', larger: 'first' }, first: 5, second: 2, target: 3 },
  { branch: { kind: 'internal', larger: 'second' }, first: 2, second: 5, target: 3 },
];
function ccSolverProblem(type: AssemblyCylinderTangentMateType, item = ccSolverBranches[0], floating = false, offset = 0, tilt = 0): BinaryMateProblem {
  const first = { ...cylinder([0, 0, 17]), radius: item.first }, second = { ...cylinder([0, 0, -29]), radius: item.second };
  return problem([body('first', [0, 0, 0], !floating), body('second', [item.target + offset, 0, 0], false,
    rotationExp([type === 'skew-cylinder-tangent' ? Math.PI / 2 + tilt : tilt, 0, 0]))],
    [{ id: 'CC', type, branch: item.branch, first: endpoint('first', first), second: endpoint('second', second) }]);
}
function ccIndependentDistance(type: AssemblyCylinderTangentMateType, poses: ReadonlyMap<string, RigidPose>): { distance: number; cross: number } {
  // Independent Hamilton expansion of local Z; these supports have their
  // canonical axis centers exactly at their component origins.
  const axis = (pose: RigidPose): Vec3 => { const [x, y, z, w] = pose.rotation; return [2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y)]; };
  const first = poses.get('first')!, second = poses.get('second')!, a = axis(first), b = axis(second), d = second.translation.map((v, i) => v - first.translation[i]);
  const cross: Vec3 = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], g = Math.hypot(...cross);
  const axial = a.reduce((sum, v, i) => sum + v * d[i], 0);
  return { distance: type === 'skew-cylinder-tangent' ? Math.abs(cross.reduce((sum, v, i) => sum + v * d[i], 0)) / g
    : Math.hypot(...d.map((v, i) => v - a[i] * axial)), cross: g };
}
const ccSolverCases = ccSolverTypes.flatMap(type => ccSolverBranches.flatMap(item => [false, true].map(floating => ({ type, item, floating }))));
it.each(ccSolverCases)('reports the physical rank/DOF for $type/$item.branch.kind/$item.branch.larger floating=$floating', ({ type, item, floating }) => {
  const input = ccSolverProblem(type, item, floating), before = JSON.stringify(input), result = solveRigidMates(input), poses = accepted(result);
  const rank = type === 'skew-cylinder-tangent' ? 1 : 3; expect(result.rank).toBe(rank); expect(result.localDOF).toBe((floating ? 12 : 6) - rank);
  expect(result.evidence.groups[0].unanchored).toBe(floating); expect(result.evidence.groups[0].rowCount).toBe(type === 'skew-cylinder-tangent' ? 1 : 4);
  expect(result.evidence.groups[0].seededConstraintIds).toEqual([]); expect(Math.abs(ccIndependentDistance(type, poses).distance - item.target)).toBeLessThanOrEqual(1e-6);
  if (floating) commonRigidGauge(input); else expect(poses.get('first')).toEqual(input.bodies[0].pose);
  expect(JSON.stringify(input)).toBe(before); poses.get('second')!.translation[0] = 99; expect(JSON.stringify(input)).toBe(before);
});
it.each(ccSolverTypes)('converges regular %s residuals without changing the initial intent or inventing a seed', type => {
  const input = ccSolverProblem(type, ccSolverBranches[0], false, 1, .15), before = JSON.stringify(input), result = solveRigidMates(input), poses = accepted(result);
  expect(result.iterations).toBeGreaterThan(0); expect(result.rank).toBe(type === 'skew-cylinder-tangent' ? 1 : 3);
  expect(Math.abs(ccIndependentDistance(type, poses).distance - 5)).toBeLessThanOrEqual(1e-6);
  if (type === 'parallel-cylinder-tangent') expect(ccIndependentDistance(type, poses).cross).toBeLessThanOrEqual(1e-8);
  expect(result.evidence.groups[0].seededConstraintIds).toEqual([]); expect(JSON.stringify(input)).toBe(before);
});
it.each(ccSolverTypes)('accepts equal external radii on regular %s supports', type => {
  const input = ccSolverProblem(type, { branch: { kind: 'external' }, first: 2, second: 2, target: 4 });
  const result = solveRigidMates(input); accepted(result); expect(result.rank).toBe(type === 'skew-cylinder-tangent' ? 1 : 3);
});
it.each(ccSolverTypes)('certifies fixed %s contradictions using physical checks and no trial poses', type => {
  const input = ccSolverProblem(type, ccSolverBranches[0], false, 1); input.bodies[1].fixed = true;
  const before = JSON.stringify(input), result = solveRigidMates(input); expect(result.status).toBe('inconsistent'); expect(result.poses).toBeNull();
  expect(result.certificates).toMatchObject([{ kind: 'fixedConstraint', constraintIds: ['CC'], checks: [{ satisfied: false }] }]);
  expect(result.iterations).toBe(0); expect(JSON.stringify(input)).toBe(before);
});
it.each(ccSolverTypes)('accepts satisfied both-fixed %s geometry with zero variable DOF', type => {
  const input = ccSolverProblem(type); input.bodies[1].fixed = true; const result = solveRigidMates(input); accepted(result); expect(result.rank).toBe(0); expect(result.localDOF).toBe(0);
});
it.each(ccSolverTypes)('retains all six same-owner gauge motions for %s', type => {
  const input = ccSolverProblem(type), c = input.constraints[0]; c.first.bodyId = 'second'; c.first.frame = { translation: [-5, 0, 0], rotation: type === 'skew-cylinder-tangent' ? rotationExp([-Math.PI / 2, 0, 0]) : [0, 0, 0, 1] };
  const result = solveRigidMates(input); accepted(result); expect(result.rank).toBe(0); expect(result.localDOF).toBe(6);
});
it.each(ccSolverTypes)('does not double-count duplicate %s rows', type => {
  const input = ccSolverProblem(type); input.constraints.push({ ...structuredClone(input.constraints[0]), id: 'duplicate' });
  const result = solveRigidMates(input); accepted(result); expect(result.rank).toBe(type === 'skew-cylinder-tangent' ? 1 : 3);
});
it('admits the antiparallel cylinder-axis orientation without saving an alignment field', () => {
  const input = ccSolverProblem('parallel-cylinder-tangent'); input.bodies[1].pose.rotation = rotationExp([Math.PI, 0, 0]);
  const result = solveRigidMates(input); accepted(result); expect(result.rank).toBe(3); expect(result.localDOF).toBe(3); expect(result.evidence.groups[0].seededConstraintIds).toEqual([]);
});
it('uses the physical parallel angle to certify a fixed contradiction beyond componentwise cross tolerance', () => {
  const input = ccSolverProblem('parallel-cylinder-tangent'); input.bodies[1].fixed = true; input.bodies[1].pose.rotation = rotationExp([.8e-8, .8e-8, 0]);
  const result = solveRigidMates(input); expect(result.status).toBe('inconsistent'); expect(result.poses).toBeNull(); expect(result.certificates).toHaveLength(1);
  const certificate = result.certificates[0]; if (certificate.kind !== 'fixedConstraint') throw new Error('Expected fixed cylinder contradiction');
  expect(certificate.rows.every(row => Math.abs(row.residual) < row.tolerance)).toBe(true); expect(certificate.checks[0].angleResidual).toBeGreaterThan(1e-8); expect(certificate.checks[0].satisfied).toBe(false);
});
it('does not double-count the parallel orientation already imposed by a direction mate', () => {
  const input = ccSolverProblem('parallel-cylinder-tangent'), c = input.constraints[0]; input.constraints.push({ id: 'direction', type: 'parallel', first: c.first, second: c.second, alignment: 'aligned' });
  const result = solveRigidMates(input); accepted(result); expect(result.rank).toBe(3); expect(result.localDOF).toBe(3);
});
it.each(ccSolverTypes)('keeps independent %s groups separate across one fixed owner', type => {
  const original = ccSolverProblem(type), count = 20, fixed = original.bodies[0], moving = original.bodies[1], constraint = original.constraints[0];
  const input = problem([fixed, ...Array.from({ length: count }, (_, i) => ({ ...structuredClone(moving), id: 'moving-' + i }))],
    Array.from({ length: count }, (_, i) => ({ ...structuredClone(constraint), id: 'CC-' + i, second: { ...structuredClone(constraint.second), bodyId: 'moving-' + i } })));
  const result = solveRigidMates(input); accepted(result); expect(result.evidence.groups).toHaveLength(count); expect(result.rank).toBe(count * (type === 'skew-cylinder-tangent' ? 1 : 3));
});
it.each([{ type: 'skew-cylinder-tangent' as const, count: 256, allowed: true }, { type: 'skew-cylinder-tangent' as const, count: 257, allowed: false },
  { type: 'parallel-cylinder-tangent' as const, count: 64, allowed: true }, { type: 'parallel-cylinder-tangent' as const, count: 65, allowed: false }])(
  'counts actual $type rows against the unchanged connected budget ($count)', ({ type, count, allowed }) => {
    const input = ccSolverProblem(type); input.constraints = Array.from({ length: count }, (_, i) => ({ ...structuredClone(input.constraints[0]), id: 'CC-' + i }));
    const result = solveRigidMates(input);
    if (allowed) { accepted(result); expect(result.evidence.groups[0].rowCount).toBe(256); expect(result.rank).toBe(type === 'skew-cylinder-tangent' ? 1 : 3); }
    else { expect(result.status).toBe('capacityLimit'); expect(result.poses).toBeNull(); }
  });
it.each(ccSolverTypes.flatMap(type => ['zero-distance', 'wrong-order', 'equal-internal', 'precision', 'bad-support'].map(fault => ({ type, fault }))))(
  'withholds all solve maps and input mutations on $type/$fault', ({ type, fault }) => {
    const input = ccSolverProblem(type), c = input.constraints[0]; if (c.type !== 'skew-cylinder-tangent' && c.type !== 'parallel-cylinder-tangent') throw new Error('Original cylinder tangent required');
    if (fault === 'zero-distance') input.bodies[1].pose.translation[0] = 0;
    else if (fault === 'wrong-order') c.branch = { kind: 'internal', larger: 'first' };
    else if (fault === 'equal-internal') { c.branch = { kind: 'internal', larger: 'first' }; const s = c.first.support; if (s?.kind !== 'cylinder') throw new Error('Original cylinder required'); s.radius = 3; }
    else if (fault === 'precision') { const s = c.first.support; if (s?.kind !== 'cylinder') throw new Error('Original cylinder required'); s.radius = 1e12; }
    else c.second.support = plane();
    const before = JSON.stringify(input), result = solveRigidMates(input); expect(result.poses).toBeNull(); expect(result.gearAngles.size + result.screwAngles.size + result.rackPinionAngles.size).toBe(0);
    expect(result.status).toBe(fault === 'zero-distance' ? 'nonConverged' : fault === 'precision' ? 'precisionLimit' : 'invalidInput'); expect(JSON.stringify(input)).toBe(before);
  });
it.each(ccSolverTypes)('rejects the singular %s chart without introducing a seed or switching family', type => {
  const input = ccSolverProblem(type); input.bodies[1].pose.rotation = type === 'skew-cylinder-tangent' ? [0, 0, 0, 1] : rotationExp([Math.PI / 2, 0, 0]);
  const before = JSON.stringify(input), result = solveRigidMates(input); expect(result.status).toBe('nonConverged'); expect(result.poses).toBeNull(); expect(result.certificates).toEqual([]);
  expect(result.evidence.groups[0].seededConstraintIds).toEqual([]); expect(JSON.stringify(input)).toBe(before);
});
it.each(ccSolverTypes.flatMap(type => [false, true].map(passive => ({ type, passive }))))('preserves actual active/passive lifted gear state alongside $type (passive=$passive)', ({ type, passive }) => {
  const gear = directionGear(); gear.first.bodyId = 'second'; gear.second.bodyId = 'rotor'; gear.angles = { first: 4 * Math.PI, second: -4 * Math.PI };
  // Swinging a local Z axis about X has zero measured twist; both accepted
  // branches must retain their pre-existing whole turns during radial solve.
  const input = ccSolverProblem(type, ccSolverBranches[0], false, .5, .1); input.bodies.push(body('rotor'));
  if (passive) input.passiveGears = [gear]; else input.constraints.push(gear);
  const before = JSON.stringify(input), result = solveRigidMates(input); accepted(result); expect(result.iterations).toBeGreaterThan(0);
  const saved = result.gearAngles.get('gear')!; expect(Math.abs(saved.first - 4 * Math.PI)).toBeLessThan(.01); expect(Math.abs(saved.second + 4 * Math.PI)).toBeLessThan(.01);
  if (!passive) expect(Math.abs(saved.first + saved.second)).toBeLessThanOrEqual(1e-8);
  expect(result.evidence.groups.every(group => group.seededConstraintIds.length === 0)).toBe(true); expect(JSON.stringify(input)).toBe(before);
});
it.each(ccSolverTypes.flatMap(type => [false, true].map(passive => ({ type, passive }))))('rejects singular $type atomically with active/passive gear tracking ($passive)', ({ type, passive }) => {
  const input = ccSolverProblem(type), gear = directionGear(); gear.first.bodyId = 'second'; gear.second.bodyId = 'rotor'; input.bodies.push(body('rotor'));
  input.bodies[1].pose.rotation = type === 'skew-cylinder-tangent' ? [0, 0, 0, 1] : rotationExp([Math.PI / 2, 0, 0]);
  if (passive) input.passiveGears = [gear]; else input.constraints.push(gear);
  const before = JSON.stringify(input), result = solveRigidMates(input); expect(result.status).toBe('nonConverged'); expect(result.poses).toBeNull(); expect(result.gearAngles.size).toBe(0);
  expect(result.evidence.groups[0].seededConstraintIds).toEqual([]); expect(JSON.stringify(input)).toBe(before);
});
it.each(ccSolverTypes.flatMap(type => (['screw', 'rack-pinion'] as const).map(family => ({ type, family }))))(
  'retains compatible $family state and independent rank beside $type in the same owner group', ({ type, family }) => {
    const input = ccSolverProblem(type), cc = input.constraints[0], first = cc.second;
    input.bodies.push({ ...structuredClone(input.bodies[1]), id: 'rotor' });
    const data = { neutralRotation: [0, 0, 0, 1] as RigidPose['rotation'], angle: 0, neutralTravel: 0 };
    const mechanical: RigidMateConstraint = family === 'screw'
      ? { id: 'mechanical', type: family, first, second: endpoint('rotor', cylinder()), ...data, alignment: 'aligned', lead: 5, reverse: false }
      : { id: 'mechanical', type: family, first, second: endpoint('rotor', { kind: 'line', point: [0, 0, 0], axis: [1, 0, 0], tolerance: 0 }), ...data, conversion: { mode: 'travel', override: 12 }, reverse: false };
    input.constraints.push(mechanical); const before = JSON.stringify(input), result = solveRigidMates(input); accepted(result);
    const rank = (type === 'skew-cylinder-tangent' ? 1 : 3) + (family === 'screw' ? 5 : 1);
    expect(result.rank).toBe(rank); expect(result.localDOF).toBe(12 - rank); expect(result.evidence.groups).toHaveLength(1);
    expect((family === 'screw' ? result.screwAngles : result.rackPinionAngles).get('mechanical')).toBe(0);
    expect(result.evidence.groups[0].seededConstraintIds).toEqual([]); expect(JSON.stringify(input)).toBe(before);
  });
it.each(ccSolverTypes)('rolls back an accepted independent %s group and its passive chart when a later group fails', type => {
  const input = ccSolverProblem(type), good = input.constraints[0], bad = structuredClone(good);
  input.bodies[1].id = 'a-good'; good.second.bodyId = 'a-good';
  const broken = structuredClone(input.bodies[1]); broken.id = 'z-bad'; broken.pose.translation[0] = 0; input.bodies.push(broken, body('rotor'));
  bad.id = 'bad'; bad.second.bodyId = 'z-bad'; input.constraints.push(bad);
  const gear = directionGear(); gear.first.bodyId = 'a-good'; gear.second.bodyId = 'rotor'; gear.angles = { first: 4 * Math.PI, second: -4 * Math.PI }; input.passiveGears = [gear];
  const before = JSON.stringify(input), result = solveRigidMates(input); expect(result.status).toBe('nonConverged'); expect(result.poses).toBeNull();
  expect(result.evidence.groups.find(group => group.constraintIds.includes('CC'))?.checks.every(check => check.satisfied)).toBe(true);
  expect(result.gearAngles.size + result.screwAngles.size + result.rackPinionAngles.size).toBe(0); expect(JSON.stringify(input)).toBe(before);
});

function acceptedResidualRedundancy(ccMovingFirst = true, reverseDirection = true, reverseAxis = false): BinaryMateProblem {
  // Original near-solution supports: directed errors are physically accepted,
  // but opposite residual frames have a real nonzero O(9e-10) singular mode.
  const input = ccSolverProblem('parallel-cylinder-tangent', { branch: { kind: 'internal', larger: 'second' }, first: 2, second: 3, target: 1 });
  input.bodies[0].pose.translation = [0, 0, -6]; input.bodies[1].pose = { translation: [1 + 9e-9, 0, -5], rotation: rotationExp([0, -9e-10, 0]) };
  const cc = input.constraints[0]; if (cc.type !== 'parallel-cylinder-tangent') throw new Error('Original parallel cylinder relation required');
  if (reverseAxis) { const support = cc.second.support; if (support?.kind !== 'cylinder') throw new Error('Original cylinder required'); support.axis = [0, 0, -1]; }
  if (ccMovingFirst) { const first = cc.first; cc.first = cc.second; cc.second = first; cc.branch = { kind: 'internal', larger: 'first' }; }
  input.constraints.push({ id: 'direction', type: 'parallel', alignment: reverseAxis ? 'opposed' : 'aligned',
    first: structuredClone(reverseDirection ? cc.second : cc.first), second: structuredClone(reverseDirection ? cc.first : cc.second) });
  return input;
}
function initialRedundancyFactor(input: RigidMateProblem) {
  const evaluated = evaluateRigidMates(input); expect(evaluated.diagnostics).toEqual([]); expect(evaluated.checks.every(check => check.satisfied)).toBe(true);
  expect(evaluated.rows.every(row => Math.abs(row.residual) <= row.tolerance)).toBe(true);
  return { evaluated, factor: leastSquares.oneSidedJacobiSvd(evaluated.rows.map(row => row.jacobian)) };
}
const residualRedundancyCases = [false, true].flatMap(ccMovingFirst => [false, true].flatMap(reverseDirection => [false, true].map(reverseAxis => ({ ccMovingFirst, reverseDirection, reverseAxis }))));
it.each(residualRedundancyCases)('certifies the full physical rank after accepted-residual refinement CCmoving=$ccMovingFirst/opposite=$reverseDirection/axisflip=$reverseAxis', ({ ccMovingFirst, reverseDirection, reverseAxis }) => {
  const input = acceptedResidualRedundancy(ccMovingFirst, reverseDirection, reverseAxis), before = JSON.stringify(input), initial = initialRedundancyFactor(input);
  expect(initial.factor.evidence.certified).toBe(true); expect(initial.factor.rankRange).toEqual(reverseDirection ? [3, 4] : [3, 3]);
  const result = solveRigidMates(input), poses = accepted(result); expect(result.rank).toBe(3); expect(result.rankRange).toEqual([3, 3]); expect(result.localDOF).toBe(3);
  expect(result.iterations > 0).toBe(reverseDirection); expect(result.evidence.groups[0].seededConstraintIds).toEqual([]);
  const final = evaluateRigidMates(input, poses), fresh = leastSquares.oneSidedJacobiSvd(final.rows.map(row => row.jacobian));
  expect(fresh.evidence.certified).toBe(true); expect(fresh.rank).toBe(3); expect(result.evidence.groups[0].singularValues).toEqual(fresh.singularValues);
  if (reverseDirection) expect(Math.hypot(...final.rows.map(row => row.residual))).toBeLessThan(Math.hypot(...initial.evaluated.rows.map(row => row.residual)));
  expect(Math.abs(ccIndependentDistance('parallel-cylinder-tangent', poses).distance - 1)).toBeLessThanOrEqual(1e-6);
  expect(poses.get('first')).toEqual(input.bodies[0].pose); expect(JSON.stringify(input)).toBe(before);
});
it.each([false, true])('retains six common gauge motions through opposite-frame residual refinement (axisflip=%s)', reverseAxis => {
  const input = acceptedResidualRedundancy(true, true, reverseAxis); input.bodies[0].fixed = false; commonRigidGauge(input);
  const initial = initialRedundancyFactor(input); expect(initial.factor.rankRange).toEqual([3, 4]);
  const result = solveRigidMates(input); accepted(result); expect(result.rank).toBe(3); expect(result.localDOF).toBe(9); expect(result.iterations).toBeGreaterThan(0);
  expect(result.evidence.groups[0].unanchored).toBe(true); expect(result.evidence.groups[0].seededConstraintIds).toEqual([]);
});
it.each([{ maxIterations: 0, status: 'rankUncertain' }, { maxTrials: 0, status: 'invalidInput' }] as const)(
  'honors an explicit exhausted/invalid refinement budget %# without exposing poses', item => {
    const input = acceptedResidualRedundancy(), before = JSON.stringify(input), { status, ...options } = item, result = solveRigidMates(input, options);
    expect(result.status).toBe(status); expect(result.poses).toBeNull(); expect(result.iterations).toBe(0);
    expect(result.evidence.groups.every(group => group.trials === 0 && group.seededConstraintIds.length === 0)).toBe(true);
    if (status === 'rankUncertain') { expect(result.rankRange).toEqual([3, 4]); expect(result.evidence.groups[0].checks.every(check => check.satisfied)).toBe(true); }
    expect(result.gearAngles.size + result.screwAngles.size + result.rackPinionAngles.size).toBe(0); expect(JSON.stringify(input)).toBe(before);
  });
it('does not turn zero residual and deliberately uncertain rank into a fabricated integer', () => {
  const input = acceptedResidualRedundancy(); input.bodies[1].pose = { translation: [1, 0, -5], rotation: [0, 0, 0, 1] };
  expect(evaluateRigidMates(input).rows.every(row => row.residual === 0)).toBe(true);
  const result = solveRigidMates(input, { svd: { rankAbsoluteTolerance: 1, rankRelativeTolerance: 0 } });
  expect(result.status).toBe('rankUncertain'); expect(result.poses).toBeNull(); expect(result.rank).toBeNull(); expect(result.localDOF).toBeNull();
  expect(result.iterations).toBe(0); expect(result.evidence.groups[0].trials).toBe(0);
});
it('rejects nonzero accepted residuals when the configured rank band certifies no usable mode', () => {
  const input = acceptedResidualRedundancy(), before = JSON.stringify(input), result = solveRigidMates(input, { svd: { rankAbsoluteTolerance: 1, rankRelativeTolerance: 0 } });
  expect(result.status).toBe('rankUncertain'); expect(result.poses).toBeNull(); expect(result.rank).toBeNull(); expect(result.iterations).toBe(0);
  expect(result.evidence.groups[0].rankRange[0]).toBe(0); expect(result.evidence.groups[0].trials).toBe(0); expect(JSON.stringify(input)).toBe(before);
});
it('can certify the complete Jacobian within one existing iteration/trial budget on the original near-solution pair', () => {
  const input = acceptedResidualRedundancy(), result = solveRigidMates(input, { maxIterations: 1, maxTrials: 1 }); accepted(result);
  expect(result.rankRange).toEqual([3, 3]); expect(result.localDOF).toBe(3); expect(result.iterations).toBe(1); expect(result.evidence.groups[0].trials).toBe(1);
});
it('refuses an uncertified full factor before any provisional residual step', () => {
  const input = acceptedResidualRedundancy(), before = JSON.stringify(input), nativeFactor = leastSquares.oneSidedJacobiSvd;
  const fault = vi.spyOn(leastSquares, 'oneSidedJacobiSvd').mockImplementation((matrix, options) => {
    const result = nativeFactor(matrix, options); return { ...result, evidence: { ...result.evidence, certified: false } };
  });
  try {
    const result = solveRigidMates(input); expect(result.status).toBe('nonConverged'); expect(result.poses).toBeNull(); expect(result.rank).toBeNull();
    expect(result.iterations).toBe(0); expect(result.evidence.groups[0].trials).toBe(0); expect(result.evidence.groups[0].factorEvidence?.certified).toBe(false);
    expect(result.gearAngles.size + result.screwAngles.size + result.rackPinionAngles.size).toBe(0); expect(JSON.stringify(input)).toBe(before);
  } finally { fault.mockRestore(); }
});
it.each([false, true])('continues accepted active/passive lifts while refining only certified modes (passive=%s)', passive => {
  const input = acceptedResidualRedundancy(), gear = directionGear(); gear.first.bodyId = 'second'; gear.second.bodyId = 'rotor'; gear.angles = { first: 4 * Math.PI, second: -4 * Math.PI }; input.bodies.push(body('rotor'));
  if (passive) input.passiveGears = [gear]; else input.constraints.push(gear);
  const before = JSON.stringify(input), initial = initialRedundancyFactor(input); expect(initial.factor.rank).toBeNull();
  const result = solveRigidMates(input); accepted(result); expect(result.rank).toBe(passive ? 3 : 4); expect(result.localDOF).toBe(passive ? 9 : 8);
  expect(result.iterations).toBeGreaterThan(0); expect(result.evidence.groups.every(group => group.seededConstraintIds.length === 0)).toBe(true);
  const lifted = result.gearAngles.get('gear')!; expect(Math.abs(lifted.first - 4 * Math.PI)).toBeLessThan(1e-8); expect(Math.abs(lifted.second + 4 * Math.PI)).toBeLessThan(1e-8);
  expect(JSON.stringify(input)).toBe(before);
});
it.each([false, true])('rolls back lifts and poses when a residual-reducing refinement fails a physical check (passive=%s)', passive => {
  const input = acceptedResidualRedundancy(), gear = directionGear(); gear.first.bodyId = 'second'; gear.second.bodyId = 'rotor'; gear.angles = { first: 4 * Math.PI, second: -4 * Math.PI }; input.bodies.push(body('rotor'));
  if (passive) input.passiveGears = [gear]; else input.constraints.push(gear);
  const before = JSON.stringify(input), initial = initialRedundancyFactor(input), evaluate = mateEquations.evaluateRigidMates; let rejectedCandidates = 0;
  const fault = vi.spyOn(mateEquations, 'evaluateRigidMates').mockImplementation((problem, poses) => {
    const result = evaluate(problem, poses), moved = poses && JSON.stringify(poses.get('second')) !== JSON.stringify(input.bodies[1].pose);
    if (moved) {
      // Deliberate independent-check fault after a REAL candidate evaluation;
      // this only tests rollback, not the candidate's geometric validity.
      expect(result.diagnostics).toEqual([]); expect(Math.hypot(...result.rows.map(row => row.residual))).toBeLessThan(Math.hypot(...initial.evaluated.rows.map(row => row.residual)));
      rejectedCandidates++; return { ...result, checks: result.checks.map((check, i) => i === 0 ? { ...check, satisfied: false } : check) };
    }
    return result;
  });
  try {
    const result = solveRigidMates(input, { maxTrials: 1 }); expect(rejectedCandidates).toBe(1); expect(result.status).toBe('rankUncertain'); expect(result.poses).toBeNull();
    const group = result.evidence.groups.find(value => value.constraintIds.includes('CC'))!;
    expect(result.iterations).toBe(0); expect(group.trials).toBe(1); expect(group.checks.every(check => check.satisfied)).toBe(true);
    expect(result.gearAngles.size + result.screwAngles.size + result.rackPinionAngles.size).toBe(0); expect(group.seededConstraintIds).toEqual([]); expect(JSON.stringify(input)).toBe(before);
  } finally { fault.mockRestore(); }
});

const sphereSolveTypes: AssemblySphereTangentMateType[] = ['plane-sphere-tangent', 'sphere-sphere-tangent', 'cylinder-sphere-tangent'];
const sphereSolveSupport = (radius = 3, point: Vec3 = [0, 0, 0]): RigidMateSupport => ({ kind: 'sphere', point, radius, tolerance: 0 });
function sphereSolveProblem(type: AssemblySphereTangentMateType, item = ccSolverBranches[0], floating = false, offset = 0, reversed = false): BinaryMateProblem {
  const firstSupport = type === 'plane-sphere-tangent' ? plane() : type === 'sphere-sphere-tangent' ? sphereSolveSupport(item.first) : { ...cylinder([0, 0, 17]), radius: item.first };
  const first = endpoint('first', firstSupport), second = endpoint('second', sphereSolveSupport(item.second));
  const pair = { first: reversed ? second : first, second: reversed ? first : second }, branch: AssemblySphereTangentBranch = reversed && item.branch.kind === 'internal'
    ? { kind: 'internal', larger: item.branch.larger === 'first' ? 'second' : 'first' } : item.branch;
  const c: RigidMateConstraint = type === 'plane-sphere-tangent' ? { id: 'S', type, ...pair, side: 'positive' } : { id: 'S', type, ...pair, branch };
  return problem([body('first', [0, 0, 0], !floating), body('second', type === 'plane-sphere-tangent' ? [0, 0, item.second + offset] : [item.target + offset, 0, type === 'cylinder-sphere-tangent' ? 3 : 0])], [c]);
}
function independentSphereSolveResidual(input: RigidMateProblem, poses: ReadonlyMap<string, RigidPose>, item = ccSolverBranches[0]): number {
  // These local sphere centers and canonical fixed support origins are zero.
  // Expand the fixed native plane/cylinder direction independently from Q.
  const a = poses.get('first')!, b = poses.get('second')!, d = b.translation.map((v, i) => v - a.translation[i]), [x, y, z, w] = a.rotation;
  const axis = [2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y)], along = axis.reduce((sum, v, i) => sum + v * d[i], 0), type = input.constraints[0].type;
  return type === 'plane-sphere-tangent' ? along - item.second : type === 'sphere-sphere-tangent' ? Math.hypot(...d) - item.target : Math.hypot(...d.map((v, i) => v - axis[i] * along)) - item.target;
}
const sphereSolveCases = sphereSolveTypes.flatMap(type => (type === 'plane-sphere-tangent' ? [ccSolverBranches[0]] : ccSolverBranches)
  .flatMap(item => [false, true].flatMap(floating => [false, true].map(reversed => ({ type, item, floating, reversed })))));
it.each(sphereSolveCases)('reports regular scalar rank/DOF for $type/$item.branch.kind/$item.branch.larger floating=$floating reversed=$reversed', ({ type, item, floating, reversed }) => {
  const input = sphereSolveProblem(type, item, floating, 0, reversed), before = JSON.stringify(input), result = solveRigidMates(input), poses = accepted(result);
  expect(result.rank).toBe(1); expect(result.localDOF).toBe(floating ? 11 : 5); expect(result.evidence.groups[0]).toMatchObject({ rowCount: 1, unanchored: floating, seededConstraintIds: [] });
  expect(Math.abs(independentSphereSolveResidual(input, poses, item))).toBeLessThanOrEqual(1e-6); if (floating) commonRigidGauge(input); else expect(poses.get('first')).toEqual(input.bodies[0].pose);
  expect(JSON.stringify(input)).toBe(before); poses.get('second')!.translation[0] = 99; expect(JSON.stringify(input)).toBe(before);
});
it.each(sphereSolveTypes.flatMap(type => [false, true].map(reversed => ({ type, reversed }))))('solves regular $type off-solution without a seed (reversed=$reversed)', ({ type, reversed }) => {
  const input = sphereSolveProblem(type, ccSolverBranches[0], false, 1, reversed), before = JSON.stringify(input), result = solveRigidMates(input), poses = accepted(result);
  expect(result.iterations).toBeGreaterThan(0); expect(result.rank).toBe(1); expect(Math.abs(independentSphereSolveResidual(input, poses))).toBeLessThanOrEqual(1e-6);
  expect(result.evidence.groups[0].seededConstraintIds).toEqual([]); expect(JSON.stringify(input)).toBe(before);
});
it.each(sphereSolveTypes)('certifies a fixed %s contradiction and accepts the satisfied fixed case at rank zero', type => {
  const input = sphereSolveProblem(type), before = JSON.stringify(input); input.bodies[1].fixed = true;
  let result = solveRigidMates(input); accepted(result); expect(result.rank).toBe(0); expect(result.localDOF).toBe(0);
  input.bodies[1].pose.translation[type === 'plane-sphere-tangent' ? 2 : 0] += 1; result = solveRigidMates(input);
  expect(result.status).toBe('inconsistent'); expect(result.poses).toBeNull(); expect(result.certificates).toMatchObject([{ kind: 'fixedConstraint', constraintIds: ['S'], checks: [{ satisfied: false }] }]); expect(result.iterations).toBe(0); expect(before).not.toBe(JSON.stringify(input));
});
it.each(sphereSolveTypes)('retains six same-owner gauge motions for %s with rank zero', type => {
  const input = sphereSolveProblem(type), c = input.constraints[0]; c.first.bodyId = 'second'; c.first.frame.translation = input.bodies[1].pose.translation.map(v => -v) as Vec3;
  const result = solveRigidMates(input); accepted(result); expect(result.rank).toBe(0); expect(result.localDOF).toBe(6);
});
it.each(sphereSolveTypes)('rejects an unsatisfied same-owner %s relation despite its zero Jacobian', type => {
  const input = sphereSolveProblem(type), c = input.constraints[0]; c.first.bodyId = 'second'; c.first.frame.translation = input.bodies[1].pose.translation.map(v => -v) as Vec3;
  c.first.frame.translation[type === 'plane-sphere-tangent' ? 2 : 0] += 1;
  const before = JSON.stringify(input), result = solveRigidMates(input); expect(result.status).toBe('nonConverged'); expect(result.poses).toBeNull(); expect(result.evidence.groups[0].checks[0].satisfied).toBe(false); expect(JSON.stringify(input)).toBe(before);
});
it.each(sphereSolveTypes)('does not double-count duplicate %s rows', type => {
  const input = sphereSolveProblem(type); input.constraints.push({ ...structuredClone(input.constraints[0]), id: 'duplicate' });
  const result = solveRigidMates(input); accepted(result); expect(result.rank).toBe(1); expect(result.localDOF).toBe(5);
});
it.each(sphereSolveTypes)('withholds publication for incompatible %s side/radius branches on a free owner', type => {
  const input = sphereSolveProblem(type), c = input.constraints[0];
  if (c.type === 'plane-sphere-tangent') input.constraints.push({ ...structuredClone(c), id: 'conflict', side: 'negative' });
  else if (c.type === 'sphere-sphere-tangent' || c.type === 'cylinder-sphere-tangent') input.constraints.push({ ...structuredClone(c), id: 'conflict', branch: { kind: 'internal', larger: 'second' } });
  const before = JSON.stringify(input), result = solveRigidMates(input); expect(result.poses).toBeNull(); expect(['nonConverged', 'inconsistent']).toContain(result.status); expect(result.evidence.groups[0].checks.some(value => !value.satisfied)).toBe(true); expect(JSON.stringify(input)).toBe(before);
});
it.each(sphereSolveTypes)('keeps independent %s scalar groups separate across a fixed owner', type => {
  const original = sphereSolveProblem(type), constraint = original.constraints[0], moving = original.bodies[1], count = 20;
  const input = problem([original.bodies[0], ...Array.from({ length: count }, (_, i) => ({ ...structuredClone(moving), id: 'moving-' + i }))],
    Array.from({ length: count }, (_, i) => ({ ...structuredClone(constraint), id: 'S-' + i, second: { ...structuredClone(constraint.second), bodyId: 'moving-' + i } })));
  const result = solveRigidMates(input); accepted(result); expect(result.rank).toBe(count); expect(result.localDOF).toBe(5 * count); expect(result.evidence.groups).toHaveLength(count);
});
it.each(sphereSolveTypes.flatMap(type => [256, 257].map(count => ({ type, count }))))('counts $count scalar $type rows against the unchanged budget', ({ type, count }) => {
  const input = sphereSolveProblem(type); input.constraints = Array.from({ length: count }, (_, i) => ({ ...structuredClone(input.constraints[0]), id: 'S-' + i }));
  const result = solveRigidMates(input); if (count === 256) { accepted(result); expect(result.rank).toBe(1); expect(result.evidence.groups[0].rowCount).toBe(256); }
  else { expect(result.status).toBe('capacityLimit'); expect(result.poses).toBeNull(); }
});
it.each(sphereSolveTypes)('honors zero iterations for unsatisfied %s without publication or seed', type => {
  const input = sphereSolveProblem(type, ccSolverBranches[0], false, .5), before = JSON.stringify(input), result = solveRigidMates(input, { maxIterations: 0 });
  expect(result.status).toBe('nonConverged'); expect(result.poses).toBeNull(); expect(result.iterations).toBe(0); expect(result.evidence.groups[0]).toMatchObject({ trials: 0, seededConstraintIds: [] }); expect(JSON.stringify(input)).toBe(before);
});
it.each(['sphere-sphere-tangent', 'cylinder-sphere-tangent'] as const)('rejects singular %s at D0 without seed, fallback or lifted-state publication', type => {
  const input = sphereSolveProblem(type); input.bodies[1].pose.translation = [0, 0, 0]; const before = JSON.stringify(input), result = solveRigidMates(input);
  expect(result.status).toBe('nonConverged'); expect(result.poses).toBeNull(); expect(result.evidence.groups[0].seededConstraintIds).toEqual([]); expect(result.gearAngles.size + result.screwAngles.size + result.rackPinionAngles.size).toBe(0); expect(JSON.stringify(input)).toBe(before);
});
it('solves a PS center initially on the plane and preserves explicit negative side', () => {
  for (const side of ['positive', 'negative'] as const) { const input = sphereSolveProblem('plane-sphere-tangent'), c = input.constraints[0]; if (c.type !== 'plane-sphere-tangent') throw new Error('PS required'); c.side = side; input.bodies[1].pose.translation = [0, 0, 0];
    const result = solveRigidMates(input), poses = accepted(result); expect(result.rank).toBe(1); close(poses.get('second')!.translation, [0, 0, side === 'positive' ? 3 : -3]); }
});
it.each(sphereSolveTypes.flatMap(type => ['invalid-radius', 'precision', 'bad-pair'].map(fault => ({ type, fault }))))('rejects $type/$fault atomically', ({ type, fault }) => {
  const input = sphereSolveProblem(type), c = input.constraints[0], s = c.second.support; if (s?.kind !== 'sphere') throw new Error('Sphere required');
  if (fault === 'invalid-radius') s.radius = 0; else if (fault === 'precision') s.radius = 1e12; else c.second.support = plane();
  const before = JSON.stringify(input), result = solveRigidMates(input); expect(result.status).toBe(fault === 'precision' ? 'precisionLimit' : 'invalidInput'); expect(result.poses).toBeNull(); expect(result.gearAngles.size + result.screwAngles.size + result.rackPinionAngles.size).toBe(0); expect(JSON.stringify(input)).toBe(before);
});
it.each(['sphere-sphere-tangent', 'cylinder-sphere-tangent'] as const)('rejects fresh internal radius role inversion/equality for %s instead of flipping endpoints', type => {
  for (const firstRadius of [2, 3]) { const input = sphereSolveProblem(type), c = input.constraints[0]; if (c.type !== type || c.type !== 'sphere-sphere-tangent' && c.type !== 'cylinder-sphere-tangent') throw new Error('Radial mate required'); c.branch = { kind: 'internal', larger: 'first' };
    const s = c.first.support; if (s?.kind !== 'sphere' && s?.kind !== 'cylinder') throw new Error('Radial support required'); s.radius = firstRadius;
    const result = solveRigidMates(input); expect(result.status).toBe('invalidInput'); expect(result.poses).toBeNull(); }
});
it.each(sphereSolveTypes.flatMap(type => [false, true].map(passive => ({ type, passive }))))('preserves active/passive lifted gear state during $type convergence (passive=$passive)', ({ type, passive }) => {
  const input = sphereSolveProblem(type, ccSolverBranches[0], false, .5), gear = directionGear(); gear.first.bodyId = 'second'; gear.second.bodyId = 'rotor'; gear.angles = { first: 4 * Math.PI, second: -4 * Math.PI }; input.bodies.push(body('rotor'));
  if (passive) input.passiveGears = [gear]; else input.constraints.push(gear);
  const before = JSON.stringify(input), result = solveRigidMates(input); accepted(result); expect(result.iterations).toBeGreaterThan(0);
  const angles = result.gearAngles.get('gear')!; expect(Math.abs(angles.first - 4 * Math.PI)).toBeLessThan(1e-8); expect(Math.abs(angles.second + 4 * Math.PI)).toBeLessThan(1e-8);
  expect(result.evidence.groups.every(group => group.seededConstraintIds.length === 0)).toBe(true); expect(JSON.stringify(input)).toBe(before); angles.first = 99; expect(gear.angles.first).toBe(4 * Math.PI);
});
it.each(sphereSolveTypes.flatMap(type => (['screw', 'rack-pinion'] as const).map(family => ({ type, family }))))('preserves compatible $family charts and rank beside $type in one group', ({ type, family }) => {
  const input = sphereSolveProblem(type); input.bodies.push({ ...structuredClone(input.bodies[1]), id: 'rotor' });
  const first = endpoint('second', cylinder()), second = endpoint('rotor', family === 'screw' ? cylinder() : { kind: 'line', point: [0, 0, 0], axis: [1, 0, 0], tolerance: 0 });
  const data = { neutralRotation: [0, 0, 0, 1] as RigidPose['rotation'], angle: 4 * Math.PI, neutralTravel: family === 'screw' ? -10 : -24 };
  const mechanical: RigidMateConstraint = family === 'screw' ? { id: 'mechanical', type: family, first, second, ...data, alignment: 'aligned', lead: 5, reverse: false }
    : { id: 'mechanical', type: family, first, second, ...data, conversion: { mode: 'travel', override: 12 }, reverse: false };
  input.constraints.push(mechanical); const result = solveRigidMates(input); accepted(result); expect(result.rank).toBe(family === 'screw' ? 6 : 2); expect(result.localDOF).toBe(family === 'screw' ? 6 : 10);
  expect((family === 'screw' ? result.screwAngles : result.rackPinionAngles).get('mechanical')).toBe(4 * Math.PI); expect(result.evidence.groups[0].seededConstraintIds).toEqual([]);
});
it.each(sphereSolveTypes.flatMap(type => (['screw', 'rack-pinion'] as const).map(family => ({ type, family }))))('continues passive $family whole turns while solving $type without mechanical rows', ({ type, family }) => {
  const input = sphereSolveProblem(type, ccSolverBranches[0], false, .5); input.bodies.push({ ...structuredClone(input.bodies[1]), id: 'rotor' });
  const first = endpoint('second', cylinder()), second = endpoint('rotor', family === 'screw' ? cylinder() : { kind: 'line', point: [0, 0, 0], axis: [1, 0, 0], tolerance: 0 });
  const data = { neutralRotation: [0, 0, 0, 1] as RigidPose['rotation'], angle: -4 * Math.PI, neutralTravel: family === 'screw' ? 10 : 24 };
  if (family === 'screw') input.passiveScrews = [{ id: 'mechanical', type: family, first, second, ...data, alignment: 'aligned', lead: 5, reverse: false }];
  else input.passiveRackPinions = [{ id: 'mechanical', type: family, first, second, ...data, conversion: { mode: 'travel', override: 12 }, reverse: false }];
  const before = JSON.stringify(input), result = solveRigidMates(input); accepted(result); expect(result.iterations).toBeGreaterThan(0); expect(result.rank).toBe(1); expect(result.localDOF).toBe(11);
  expect(Math.abs((family === 'screw' ? result.screwAngles : result.rackPinionAngles).get('mechanical')! + 4 * Math.PI)).toBeLessThan(1e-8);
  expect(result.evidence.groups.every(group => group.seededConstraintIds.length === 0)).toBe(true); expect(JSON.stringify(input)).toBe(before);
});
it.each(sphereSolveTypes.flatMap(type => [false, true].map(passive => ({ type, passive }))))('rolls back solved $type and its active/passive chart if a later independent group fails ($passive)', ({ type, passive }) => {
  const input = sphereSolveProblem(type, ccSolverBranches[0], false, .5), gear = directionGear(); gear.first.bodyId = 'second'; gear.second.bodyId = 'rotor'; gear.angles = { first: 4 * Math.PI, second: -4 * Math.PI }; input.bodies.push(body('rotor'));
  if (passive) input.passiveGears = [gear]; else input.constraints.push(gear);
  input.bodies.push(body('zz-bad')); input.constraints.push({ id: 'zz-fail', type: 'sphere-sphere-tangent', first: endpoint('zz-bad', sphereSolveSupport()), second: endpoint(null, sphereSolveSupport()), branch: { kind: 'external' } });
  const before = JSON.stringify(input), result = solveRigidMates(input); expect(result.status).toBe('nonConverged'); expect(result.poses).toBeNull(); expect(result.gearAngles.size + result.screwAngles.size + result.rackPinionAngles.size).toBe(0); expect(JSON.stringify(input)).toBe(before);
});
it.each(['angle', 'parallel', 'perpendicular', 'coincident', 'distance', 'concentric', 'tangent', 'skew-cylinder-tangent', 'parallel-cylinder-tangent', 'lock', 'gear', 'screw', 'rack-pinion'] as const)(
  'rejects numeric sphere support explicitly in the old %s family', type => {
    const input = ccSolverProblem('parallel-cylinder-tangent'), first = endpoint('first', cylinder()), second = endpoint('second', cylinder());
    const data = { neutralRotation: [0, 0, 0, 1] as RigidPose['rotation'], angle: 0, neutralTravel: 0 };
    const reference: RigidMateConstraint = type === 'gear' ? directionGear() : type === 'lock' ? { id: 'old', type, first, second, relativePose: identityRigidPose() }
      : type === 'angle' ? { id: 'old', type, first, second, angle: 0 }
        : type === 'parallel' || type === 'perpendicular' ? { id: 'old', type, first, second, alignment: type === 'parallel' ? 'aligned' : null }
          : type === 'coincident' ? { id: 'old', type, first, second, alignment: 'aligned' }
            : type === 'distance' ? { id: 'old', type, first, second, alignment: 'aligned', distance: 0 }
              : type === 'concentric' ? { id: 'old', type, first, second, alignment: 'aligned', rotationLock: null }
                : type === 'tangent' ? { id: 'old', type, first, second, side: 'positive' }
                  : type === 'screw' ? { id: 'old', type, first, second, ...data, alignment: 'aligned', lead: 5, reverse: false }
                    : type === 'rack-pinion' ? { id: 'old', type, first, second, ...data, conversion: { mode: 'travel', override: 12 }, reverse: false }
                      : { id: 'old', type, first, second, branch: { kind: 'external' } };
    reference.first = endpoint('first', sphereSolveSupport()); reference.second = endpoint('second', cylinder()); input.constraints = [reference];
    const result = solveRigidMates(input); expect(result.status).toBe('invalidInput'); expect(result.poses).toBeNull();
  });
function sphereLostPlacement(type: AssemblySphereTangentMateType, reversed = false): BinaryMateProblem {
  const fixed = endpoint('first', type === 'plane-sphere-tangent' ? plane([-1, 0, 0], [1, 0, 0], [0, 1, 0])
    : type === 'sphere-sphere-tangent' ? sphereSolveSupport(1, [-2, 0, 0]) : { kind: 'cylinder', point: [-2, 0, 0], axis: [0, 0, 1], xDirection: [1, 0, 0], radius: 1, tolerance: 0 });
  const moving = endpoint('zz-bad', sphereSolveSupport(1, [1e16, 0, 0]), { translation: [1, 0, 0], rotation: [0, 0, 0, 1] }), pair = { first: reversed ? moving : fixed, second: reversed ? fixed : moving };
  const constraint: RigidMateConstraint = type === 'plane-sphere-tangent' ? { id: 'loss', type, ...pair, side: 'positive' } : { id: 'loss', type, ...pair, branch: { kind: 'external' } };
  const input = problem([body('first', [0, 0, 0], true), body('zz-bad', [-1e16, 0, 0])], [constraint]); input.lengthScale = 1; return input;
}
it.each(sphereSolveTypes.flatMap(type => [false, true].map(reversed => ({ type, reversed }))))('withholds all maps on $type local placement cancellation reversed=$reversed', ({ type, reversed }) => {
  const input = sphereLostPlacement(type, reversed), before = JSON.stringify(input), result = solveRigidMates(input);
  expect(result.status).toBe('precisionLimit'); expect(result.poses).toBeNull(); expect(result.gearAngles.size + result.screwAngles.size + result.rackPinionAngles.size).toBe(0);
  expect(result.evidence.groups[0]).toMatchObject({ iterations: 0, trials: 0, seededConstraintIds: [], rowCount: 0 }); expect(JSON.stringify(input)).toBe(before);
});
it.each(sphereSolveTypes.flatMap(type => [false, true].map(passive => ({ type, passive }))))('rolls back an accepted independent solve/lift before $type placement precision rejection (passive=$passive)', ({ type, passive }) => {
  const input = sphereLostPlacement(type), gear = directionGear(); gear.first.bodyId = 'a-good'; gear.second.bodyId = 'rotor'; gear.angles = { first: 4 * Math.PI, second: -4 * Math.PI };
  input.bodies.push(body('a-good', [6, 0, 0]), body('rotor')); input.constraints.push({ id: 'good', type: 'sphere-sphere-tangent', first: endpoint('a-good', sphereSolveSupport(3)), second: endpoint(null, sphereSolveSupport(2)), branch: { kind: 'external' } });
  if (passive) input.passiveGears = [gear]; else input.constraints.push(gear);
  const before = JSON.stringify(input), result = solveRigidMates(input); expect(result.status).toBe('precisionLimit'); expect(result.poses).toBeNull(); expect(result.iterations).toBeGreaterThan(0);
  expect(result.gearAngles.size + result.screwAngles.size + result.rackPinionAngles.size).toBe(0); expect(result.evidence.groups.find(group => group.constraintIds.includes('good'))!.checks.every(check => check.satisfied)).toBe(true); expect(JSON.stringify(input)).toBe(before);
});
it.each(sphereSolveTypes.flatMap(type => [false, true].map(reversed => ({ type, reversed }))))('withholds every map for dyadic subnormal $type normalization reversed=$reversed', ({ type, reversed }) => {
  const length = 2 ** -51, coordinate = type === 'plane-sphere-tangent' ? 2 : 0, translation: Vec3 = [0, 0, 0], center: Vec3 = [0, 0, 0]; translation[coordinate] = 3 * length / 8; center[coordinate] = 11 * length / 8;
  const first = endpoint('first', type === 'plane-sphere-tangent' ? plane() : type === 'sphere-sphere-tangent' ? sphereSolveSupport(length / 8) : { kind: 'cylinder', point: [0, 0, 0], axis: [0, 0, 1], xDirection: [1, 0, 0], radius: length / 8, tolerance: 0 });
  const second = endpoint('second', sphereSolveSupport(5 * length / 8, center), { translation: [...translation], rotation: [0, 0, 0, 1] }), pair = { first: reversed ? second : first, second: reversed ? first : second };
  const constraint: RigidMateConstraint = type === 'plane-sphere-tangent' ? { id: 'dyadic', type, ...pair, side: 'positive' } : { id: 'dyadic', type, ...pair, branch: { kind: 'external' } };
  const input = problem([body('first', [0, 0, 0], true), body('second', translation)], [constraint]); input.lengthScale = 2 ** 1023; input.lengthTolerance = length;
  expect((3n + 3n + 11n - (type === 'plane-sphere-tangent' ? 5n : 6n)) > 8n).toBe(true);
  const before = JSON.stringify(input), result = solveRigidMates(input); expect(result.status).toBe('precisionLimit'); expect(result.poses).toBeNull(); expect(result.iterations).toBe(0);
  expect(result.gearAngles.size + result.screwAngles.size + result.rackPinionAngles.size).toBe(0); expect(JSON.stringify(input)).toBe(before);
});
