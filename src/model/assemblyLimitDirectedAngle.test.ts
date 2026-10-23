import { expect, it } from 'vitest'
import type { Vec3 } from '../cad/kernel.types'
import { assemblyDirectedAngleArcRadians, evaluateAssemblyDirectedAngleArc, validateAssemblyDirectedAngleArc, type AssemblyDirectedAngleArc } from './assemblyLimitDirectedAngle'
import { parseAssemblyDocument, serializeAssemblyDocument, validateAssemblyDocument, type AssemblyDocument, type AssemblyGeometryReference, type AssemblyLimitDirectedAngleMate, type EmbeddedAssemblyDefinition } from './assemblyDocument'
import { AssemblyDocumentHistory } from './assemblyEditing'
import { inspectBinaryAssemblyMateReferences as inspectAssemblyMateReferences } from './assemblyBinaryFixtures.test-utils'
import { prepareAssemblyPartUpdate, repairAssemblyEndpoint } from './assemblySourceUpdates'
import { prepareAssemblyPartReplacement } from './assemblyReplacement'
import { evaluateRigidMates } from './assemblyMateEquations'
import { solveRigidMates } from './assemblySolver'
import { projectRigidMateTarget } from './assemblyProjection'
import { planAssemblyComponentMotion } from './assemblyMotion'
import { composeRigidPoses, identityRigidPose, transformRigidDirection, type RigidPose } from './rigidPose'
import { retractRigidBodyPose, rotationExp, RotationChartError } from './assemblyKinematics'
import type { RigidGearConstraint, RigidMateConstraint, RigidMateEndpoint, RigidMateProblem, RigidMateSupport, RigidRackPinionConstraint, RigidScrewConstraint } from './assemblySolveTypes'

// Original Cartesian direction triples and a small original prism declaration.
// Expectations below use literal rays, analytical rotations and independent
// finite differences; these numeric declarations are not native authority.
const radians = (degrees: number) => degrees * Math.PI / 180
const near = (actual: number, expected: number, tolerance = 1e-8) => {
  expect(Number.isFinite(actual)).toBe(true); expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance)
}
const line = (axis: Vec3): RigidMateSupport => ({ kind: 'line', point: [0, 0, 0], axis, tolerance: 0 })
const end = (bodyId: string | null, axis: Vec3, frame = identityRigidPose()): RigidMateEndpoint => ({ bodyId, support: line(axis), frame })
const limit = (arc: AssemblyDirectedAngleArc = { start: 330, sweep: 60 }): Extract<RigidMateConstraint, { type: 'limit-directed-angle' }> => ({
  id: 'stop', type: 'limit-directed-angle', coordinate: 'directed-about-axis', first: end(null, [1, 0, 0]),
  second: end('moving', [1, 0, 0]), guide: end(null, [0, 0, 1]), arc,
})
function problem(degrees = 350, arc: AssemblyDirectedAngleArc = { start: 330, sweep: 60 }): RigidMateProblem {
  return { bodies: [{ id: 'moving', fixed: false, pose: { translation: [2, -3, 5], rotation: rotationExp([0, 0, radians(degrees)]) } }],
    constraints: [limit(arc)], origin: [0, 0, 0], lengthScale: 10, lengthTolerance: 1e-6, angleTolerance: 1e-8 }
}
const stamp = '2026-10-21T00:00:00.000Z', partRef = { id: 'circular-part', revision: 'r1' }
const principal = (name: string | null, plane: 'XY' | 'XZ' | 'YZ' = 'YZ'): AssemblyGeometryReference => ({
  kind: 'principal-plane', component: name === null ? null : { occurrencePath: [name], definition: { ...partRef } }, plane,
})
function declaration(): AssemblyDocument {
  return { version: 2, kind: 'assembly', id: 'circular-original', revision: 'a1', name: 'Original circular stops', units: 'mm', createdAt: stamp, updatedAt: stamp,
    definitions: [{ kind: 'part', ...partRef, document: { version: 1, id: partRef.id, name: 'Original prism', units: 'mm', createdAt: stamp, updatedAt: stamp,
      features: [{ id: 'profile', name: 'Rectangle', type: 'sketch', suppressed: false, plane: 'XY', offset: 0, profile: { kind: 'rectangle', center: [0, 0], width: 4, height: 6 } },
        { id: 'solid', name: 'Prism', type: 'extrude', suppressed: false, sketchId: 'profile', depth: 2, symmetric: false, bodyOperation: { mode: 'new', bodyId: 'circular-body' } }] } }],
    occurrences: ['moving', 'fixed', 'guide'].map(id => ({ id, name: id, definition: { ...partRef }, pose: identityRigidPose(), fixed: id !== 'moving', visible: true, suppressed: false })),
    mates: [{ id: 'stop', name: 'Circular stop', suppressed: false, type: 'limit-directed-angle', coordinate: 'directed-about-axis',
      first: principal('fixed'), second: principal('moving'), guide: principal('guide', 'XY'), arc: { start: 330, sweep: 60 } }] }
}

it.each([{ start: 0, sweep: 0 }, { start: 0, sweep: 360 }, { start: 330, sweep: 60 }, { start: 270, sweep: 0 }, { start: 359.999, sweep: 300 }])('preserves circular arc %j without a saved lift', arc => {
  expect(validateAssemblyDirectedAngleArc(arc)).toEqual(arc); expect(validateAssemblyDirectedAngleArc(arc)).not.toBe(arc)
})
it.each([{ start: -1, sweep: 60 }, { start: 360, sweep: 60 }, { start: 0, sweep: -1 }, { start: 0, sweep: 361 },
  { start: NaN, sweep: 60 }, { start: 0, sweep: Infinity }, { start: 0 }, { start: 0, sweep: 60, turns: 1 }, [0, 60], null])('rejects malformed circular arc %j', arc => {
  expect(() => validateAssemblyDirectedAngleArc(arc)).toThrow()
})
it('rejects accessors, hidden fields and inherited arc values without executing them', () => {
  let reads = 0; const getter = { start: 0, sweep: 60 }; Object.defineProperty(getter, 'start', { get() { reads++; return 0 } })
  expect(() => validateAssemblyDirectedAngleArc(getter)).toThrow(); expect(reads).toBe(0)
  expect(() => validateAssemblyDirectedAngleArc(Object.create({ start: 0, sweep: 60 }))).toThrow()
  const hidden = { start: 0, sweep: 60 }; Object.defineProperty(hidden, 'sweep', { value: 60, enumerable: false })
  expect(() => validateAssemblyDirectedAngleArc(hidden)).toThrow()
})
it('rejects radian underflow and intervals lost at a distant circular start', () => {
  expect(() => assemblyDirectedAngleArcRadians({ start: Number.MIN_VALUE, sweep: 60 })).toThrow(RangeError)
  expect(() => assemblyDirectedAngleArcRadians({ start: 0, sweep: Number.MIN_VALUE })).toThrow(RangeError)
  expect(() => assemblyDirectedAngleArcRadians({ start: 300, sweep: 1e-16 })).toThrow(RangeError)
})
it.each([{ angle: 330, low: 0, high: 60, activity: 'minimum' }, { angle: 350, low: 20, high: 40, activity: 'interior' },
  { angle: 0, low: 30, high: 30, activity: 'interior' }, { angle: 30, low: 60, high: 0, activity: 'maximum' },
  { angle: 40, low: 70, high: -10, activity: 'interior' }, { angle: 320, low: -10, high: 70, activity: 'interior' }])('checks circular membership and margins at $angle degrees', ({ angle, low, high, activity }) => {
  const value = evaluateAssemblyDirectedAngleArc(radians(angle), { start: 330, sweep: 60 }, 1e-8)
  near(value.marginsRadians.minimum, radians(low), 2e-15); near(value.marginsRadians.maximum, radians(high), 2e-15); expect(value.activity).toBe(activity)
})
it('distinguishes equal zero from a full circle and rejects an ambiguous opposite-centre restoration', () => {
  expect(evaluateAssemblyDirectedAngleArc(0, { start: 0, sweep: 0 }, 1e-8).activity).toBe('both')
  const full = evaluateAssemblyDirectedAngleArc(Math.PI, { start: 0, sweep: 360 }, 1e-8)
  expect(full.fullCircle).toBe(true); expect(full.activity).toBe('interior')
  expect(() => evaluateAssemblyDirectedAngleArc(Math.PI, { start: 330, sweep: 60 }, 1e-8)).toThrow(RotationChartError)
  expect(() => evaluateAssemblyDirectedAngleArc(Math.PI - 1e-14, { start: 330, sweep: 60 }, 1e-8)).toThrow(RotationChartError)
  expect(() => evaluateAssemblyDirectedAngleArc(2 * Math.PI, { start: 0, sweep: 360 }, 1e-8)).toThrow()
})
it('admits resolvable near-full arc endpoints without widening the branch cut to physical tolerance', () => {
  const arc = { start: 0, sweep: 359.999999 }, lower = evaluateAssemblyDirectedAngleArc(0, arc, 1e-8), upper = evaluateAssemblyDirectedAngleArc(radians(arc.sweep), arc, 1e-8)
  expect(lower.activity).toBe('minimum'); expect(upper.activity).toBe('maximum')
  expect(() => evaluateAssemblyDirectedAngleArc(0, { start: 0, sweep: 360 - 1e-12 }, 1e-8)).toThrow(RangeError)
  expect(evaluateAssemblyDirectedAngleArc(0, { start: 0, sweep: 360 }, 1e-8).fullCircle).toBe(true)
})
it('round-trips exactly three directional references and explicit arc without changing principal files', () => {
  const document = declaration(), circular = document.mates[0] as AssemblyLimitDirectedAngleMate
  document.mates.push({ id: 'principal', name: 'Principal', suppressed: false, type: 'limit-angle', coordinate: 'principal-direction',
    first: circular.first, second: circular.second, limits: { minimum: 0, maximum: 180 } })
  expect(parseAssemblyDocument(serializeAssemblyDocument(document))).toEqual(document)
  expect(Object.keys(circular).sort()).toEqual(['arc', 'coordinate', 'first', 'guide', 'id', 'name', 'second', 'suppressed', 'type'])
})
it.each(['alignment', 'phase', 'angles', 'limits', 'activity', 'winding'])('rejects derived or incompatible saved %s', field => {
  const document = declaration(); expect(() => validateAssemblyDocument({ ...document, mates: [{ ...document.mates[0], [field]: 0 }] })).toThrow()
})
it.each([undefined, 'principal-direction', 'directed', 'lifted-about-axis'])('requires the exact saved circular discriminator %s', coordinate => {
  const document = declaration(); expect(() => validateAssemblyDocument({ ...document, mates: [{ ...document.mates[0], coordinate }] })).toThrow()
})
it.each(['cylinder-surface', 'sphere-surface'])('rejects %s as a guide direction', support => {
  const document = declaration(), guide = { kind: 'face', component: { occurrencePath: ['guide'], definition: partRef }, body: null,
    face: { sourceFeatureId: 'solid', key: 'face-v1|original-unattested' }, support }
  expect(() => validateAssemblyDocument({ ...document, mates: [{ ...document.mates[0], guide }] })).toThrow()
})
it('retains ID, all three refs, suppression and arc through history and reopening', () => {
  const document = declaration(), history = new AssemblyDocumentHistory(document), { id, ...mate } = document.mates[0] as AssemblyLimitDirectedAngleMate
  history.commit({ type: 'update-mate', mateId: id, mate: { ...mate, suppressed: true, arc: { start: 350, sweep: 40 } } })
  expect(history.current.mates[0]).toMatchObject({ id, suppressed: true, arc: { start: 350, sweep: 40 } })
  expect(history.undo()).toEqual(document)
  const redo = history.redo(); expect(parseAssemblyDocument(serializeAssemblyDocument(redo))).toEqual(redo)
  history.commit({ type: 'update-mate', mateId: id, mate: { ...mate, suppressed: false } }); expect(history.current.mates[0]).toEqual(document.mates[0])
})
it('inventories and repairs the guide through source revisions without inferred rebinding', () => {
  const document = declaration(), definition = document.definitions[0]; if (definition.kind !== 'part') throw Error('Part missing')
  const plan = prepareAssemblyPartUpdate(document, partRef, definition.document, 'r2')
  expect(plan.endpoints.map(value => value.locator.side)).toEqual(['first', 'second', 'guide'])
  expect(inspectAssemblyMateReferences(plan.document)[0].guide!.diagnostics.map(value => value.code)).toContain('STALE_DEFINITION')
  const repaired = repairAssemblyEndpoint(plan.document, { scope: { id: document.id, revision: document.revision }, mateId: 'stop', side: 'guide' },
    { kind: 'principal-plane', plane: 'XY', component: { occurrencePath: ['guide'], definition: { ...partRef, revision: 'r2' } } })
  expect(inspectAssemblyMateReferences(repaired)[0].guide!.diagnostics).toEqual([])
  expect(repaired.mates[0]).toMatchObject({ arc: { start: 330, sweep: 60 }, coordinate: 'directed-about-axis' })
  document.occurrences[2].suppressed = true
  expect(inspectAssemblyMateReferences(document)[0].guide!.diagnostics.map(value => value.code)).toContain('SUPPRESSED_COMPONENT')
})
it('tracks selected guide replacement and retains an explicit datum only in that occurrence', () => {
  const document = declaration(), definition = document.definitions[0]; if (definition.kind !== 'part') throw Error('Part missing')
  const replacement = { ...structuredClone(definition.document), id: 'replacement-prism' }
  const plan = prepareAssemblyPartReplacement(document, { mode: 'selected', component: { occurrencePath: ['guide'], definition: partRef },
    part: replacement, revision: 'r-new', ancestorRevisions: [] })
  expect(plan.endpoints).toHaveLength(1); expect(plan.endpoints[0].locator.side).toBe('guide'); expect(plan.endpoints[0].retainFrame).toBe(true)
  expect((plan.document.mates[0] as AssemblyLimitDirectedAngleMate).guide).toMatchObject({ component: { occurrencePath: ['guide'], definition: { id: 'replacement-prism', revision: 'r-new' } } })
  expect((plan.document.mates[0] as AssemblyLimitDirectedAngleMate).second).toEqual((document.mates[0] as AssemblyLimitDirectedAngleMate).second)
})
it('inventories unique guide declarations in reused, suppressed and dormant scopes and repairs each explicitly', () => {
  const document = declaration(), leaf = document.definitions[0]; if (leaf.kind !== 'part') throw Error('Part missing')
  const nested: EmbeddedAssemblyDefinition = { kind: 'assembly', id: 'shared', revision: 's1', name: 'Shared original', createdAt: stamp, updatedAt: stamp,
    occurrences: structuredClone(document.occurrences), mates: structuredClone(document.mates) }
  const dormant: EmbeddedAssemblyDefinition = { ...structuredClone(nested), id: 'dormant' }; dormant.mates[0].suppressed = true
  document.definitions.push(nested, dormant)
  document.occurrences.push(...['use-A', 'use-B'].map(id => ({ id, name: id, definition: { id: nested.id, revision: nested.revision }, pose: identityRigidPose(), fixed: false, visible: true, suppressed: id === 'use-B' })))
  const plan = prepareAssemblyPartUpdate(document, partRef, leaf.document, 'r2'), guides = plan.endpoints.filter(value => value.locator.side === 'guide')
  expect(guides.map(value => value.locator.scope.id)).toEqual(['circular-original', 'shared', 'dormant'])
  let repaired = plan.document
  for (const value of plan.endpoints) {
    if (!('kind' in value.endpoint) || value.endpoint.kind !== 'principal-plane' || !value.endpoint.component) throw Error('Original datum expected')
    repaired = repairAssemblyEndpoint(repaired, value.locator, { ...value.endpoint, component: { ...value.endpoint.component, definition: { ...partRef, revision: 'r2' } } })
  }
  const inspections = inspectAssemblyMateReferences(repaired)
  expect(inspections.map(value => value.scopePath)).toEqual([[], ['use-A'], ['use-B']])
  expect(inspections[0].guide!.diagnostics).toEqual([]); expect(inspections[1].guide!.diagnostics).toEqual([])
  expect(inspections[2].guide!.diagnostics.map(value => value.code)).toEqual(['SUPPRESSED_COMPONENT'])
  const saved = parseAssemblyDocument(serializeAssemblyDocument(repaired)); expect(saved).toEqual(repaired)
  const savedDormant = saved.definitions.find(value => value.id === 'dormant') as EmbeddedAssemblyDefinition
  expect(savedDormant.mates[0]).toMatchObject({ suppressed: true, arc: { start: 330, sweep: 60 }, guide: { component: { definition: { revision: 'r2' } } } })
})

it.each([330, 350, 0, 10, 30, 320, 40])('measures a right-handed coordinate and physical residual at %s degrees', degrees => {
  const evaluated = evaluateRigidMates(problem(degrees)); expect(evaluated.diagnostics).toEqual([]); expect(evaluated.rows).toEqual([])
  near(evaluated.limitDirectedAngles![0].angleRadians, radians(degrees), 2e-15)
  expect(evaluated.inequalities).toHaveLength(2); expect(evaluated.inequalities!.every(value => value.kind === 'angle')).toBe(true)
  near(evaluated.checks[0].angleResidual, radians(degrees === 320 || degrees === 40 ? 10 : 0), 2e-15)
  expect(evaluated.checks[0].lengthResidual).toBe(0)
})
it('reverses the coordinate by swapping endpoints or reversing the explicit guide', () => {
  const input = problem(30, { start: 0, sweep: 360 }), mate = input.constraints[0] as ReturnType<typeof limit>
  const swapped = evaluateRigidMates({ ...input, constraints: [{ ...mate, first: mate.second, second: mate.first }] })
  const reversed = evaluateRigidMates({ ...input, constraints: [{ ...mate, guide: end(null, [0, 0, -1]) }] })
  near(swapped.limitDirectedAngles![0].angleRadians, radians(330), 2e-15); near(reversed.limitDirectedAngles![0].angleRadians, radians(330), 2e-15)
})
it.each(['plane', 'cylinder', 'line'] as const)('accepts every ordered triple of direction purposes with first=%s', firstKind => {
  const support = (kind: 'plane' | 'cylinder' | 'line', axis: Vec3): RigidMateSupport => kind === 'line' ? line(axis)
    : kind === 'plane' ? { kind, point: [0, 0, 0], normal: axis, xDirection: axis[2] === 1 ? [1, 0, 0] : [0, 0, 1], tolerance: 0 }
      : { kind, point: [0, 0, 0], axis, xDirection: axis[2] === 1 ? [1, 0, 0] : [0, 0, 1], radius: 2, tolerance: 0 }
  for (const secondKind of ['plane', 'cylinder', 'line'] as const) for (const guideKind of ['plane', 'cylinder', 'line'] as const) {
    const input = problem(30), mate = input.constraints[0] as ReturnType<typeof limit>
    mate.first.support = support(firstKind, [1, 0, 0]); mate.second.support = support(secondKind, [1, 0, 0]); mate.guide.support = support(guideKind, [0, 0, 1])
    const measured = evaluateRigidMates(input); expect(measured.diagnostics).toEqual([]); near(measured.limitDirectedAngles![0].angleRadians, Math.PI / 6, 2e-15)
  }
})
it('checks the projected angle of oblique rays independently of the principal angle', () => {
  const input = problem(0, { start: 230, sweep: 20 }), mate = input.constraints[0] as ReturnType<typeof limit>
  mate.first = end(null, [.6, 0, .8]); mate.second = end('moving', [-.3, -.3 * Math.sqrt(3), .8])
  const evaluated = evaluateRigidMates(input); expect(evaluated.diagnostics).toEqual([]); near(evaluated.limitDirectedAngles![0].angleRadians, 4 * Math.PI / 3, 2e-15)
  expect(evaluated.checks[0].satisfied).toBe(true); expect(Math.acos(.46)).toBeLessThan(Math.PI / 2)
})
it('includes a movable guide in all Jacobian columns and retains the six common rigid gauge modes', () => {
  const input = problem(0, { start: 0, sweep: 300 })
  input.bodies = ['a', 'b', 'g'].map((id, index) => ({ id, fixed: false, pose: { translation: [index * 2, 3, -4], rotation: rotationExp([.1 * index, -.2 * index, .3 * index]) } }))
  input.constraints = [{ ...limit({ start: 0, sweep: 300 }), first: end('a', [.6, 0, .8]), second: end('b', [0, .8, .6]), guide: end('g', [0, 0, 1]) }]
  const base = evaluateRigidMates(input); expect(base.diagnostics).toEqual([])
  expect(Math.hypot(...base.inequalities![0].jacobian.slice(15))).toBeGreaterThan(.1)
  for (const h of [2e-6, 7e-7]) for (let column = 0; column < 18; column++) {
    const body = input.bodies[Math.floor(column / 6)], delta = Array<number>(6).fill(0); delta[column % 6] = h
    const plus = evaluateRigidMates(input, new Map([[body.id, retractRigidBodyPose(body.pose, delta, input.origin, input.lengthScale)]])); delta[column % 6] = -h
    const minus = evaluateRigidMates(input, new Map([[body.id, retractRigidBodyPose(body.pose, delta, input.origin, input.lengthScale)]]))
    for (let index = 0; index < 2; index++) near(base.inequalities![index].jacobian[column], (plus.inequalities![index].margin - minus.inequalities![index].margin) / (2 * h), 4e-7)
  }
  for (const row of base.inequalities!) for (let axis = 0; axis < 6; axis++) near(row.jacobian[axis] + row.jacobian[axis + 6] + row.jacobian[axis + 12], 0, 2e-14)
  const solved = solveRigidMates(input); expect(solved.poses).not.toBeNull(); expect(solved.evidence.groups).toHaveLength(1)
  expect(solved.evidence.groups[0].bodyIds).toEqual(['a', 'b', 'g']); expect(solved.evidence.groups[0].unanchored).toBe(true)
})
it('is invariant under a common independently composed rigid placement and huge unused lengths', () => {
  const input = problem(30), mate = input.constraints[0] as ReturnType<typeof limit>, common: RigidPose = { translation: [1e200, -1e200, 1e200], rotation: [.5, .5, .5, .5] }
  input.bodies[0].pose = composeRigidPoses(common, input.bodies[0].pose); mate.first.frame = common; mate.guide.frame = common
  input.origin = [-1e200, 1e200, -1e200]; input.lengthScale = Number.MIN_VALUE
  const value = evaluateRigidMates(input); expect(value.diagnostics).toEqual([]); near(value.limitDirectedAngles![0].angleRadians, Math.PI / 6, 2e-15)
})
it.each([{ degrees: 350, arc: { start: 330, sweep: 60 }, lineality: 6 }, { degrees: 330, arc: { start: 330, sweep: 60 }, lineality: 5 },
  { degrees: 30, arc: { start: 330, sweep: 60 }, lineality: 5 }, { degrees: 0, arc: { start: 0, sweep: 0 }, lineality: 5 },
  { degrees: 180, arc: { start: 180, sweep: 0 }, lineality: 5 }, { degrees: 180, arc: { start: 0, sweep: 360 }, lineality: 6 }])('separates bilateral rank from circular lineality $lineality at $degrees', ({ degrees, arc, lineality }) => {
  const result = solveRigidMates(problem(degrees, arc)); expect(result.poses).not.toBeNull(); expect(result.rank).toBe(0); expect(result.localDOF).toBe(6)
  expect(result.evidence.groups[0].limitCone?.linealityDimension ?? 6).toBe(lineality)
  expect(result.evidence.groups[0].limitDirectedAngles![0].fullCircle).toBe(arc.sweep === 360)
})
it.each([{ start: 320, target: 330 }, { start: 40, target: 30 }])('restores a circular violation from $start to $target without seeds or winding', ({ start, target }) => {
  const input = problem(start), before = structuredClone(input), result = solveRigidMates(input)
  expect(result.poses, result.evidence.diagnostics.join('\n')).not.toBeNull(); expect(result.evidence.groups[0].seededConstraintIds).toEqual([])
  const direction = transformRigidDirection(result.poses!.get('moving')!, [1, 0, 0])
  near(direction[0], Math.cos(radians(target))); near(direction[1], Math.sin(radians(target)))
  expect(result.gearAngles.size + result.screwAngles.size + result.rackPinionAngles.size).toBe(0); expect(input).toEqual(before)
})
it.each([{ degrees: 10, target: 0 }, { degrees: 170, target: 180 }, { degrees: 280, target: 270 }])('restores equal circular $target from $degrees with one angular kernel', ({ degrees, target }) => {
  const result = solveRigidMates(problem(degrees, { start: target, sweep: 0 })); expect(result.poses).not.toBeNull()
  const direction = transformRigidDirection(result.poses!.get('moving')!, [1, 0, 0]); near(direction[0], Math.cos(radians(target))); near(direction[1], Math.sin(radians(target)))
  expect(result.evidence.groups[0].limitCone?.linealityDimension).toBe(5)
})
it.each([{ start: 330, requested: 320, resolved: 330 }, { start: 330, requested: 350, resolved: 350 },
  { start: 30, requested: 40, resolved: 30 }, { start: 30, requested: 10, resolved: 10 },
  { start: 350, requested: 10, resolved: 10 }])('projects from $start toward $requested and resolves $resolved degrees', ({ start, requested, resolved }) => {
  const input = problem(start), before = structuredClone(input), result = projectRigidMateTarget(input, { bodyId: 'moving', frame: identityRigidPose(), mode: 'rotate',
    targetPose: { translation: [2, -3, 5], rotation: rotationExp([0, 0, radians(requested)]) } })
  expect(result.status, result.status === 'rejected' ? result.message : '').toBe('ready'); if (result.status !== 'ready') return
  const ray = transformRigidDirection(result.resolvedPose, [1, 0, 0]); near(ray[0], Math.cos(radians(resolved))); near(ray[1], Math.sin(radians(resolved)))
  expect(result.result.rank).toBe(0); expect(result.evidence.localOnly).toBe(true); expect(input).toEqual(before)
})
it('releases and returns to both stops in a sequence without persisting an active set', () => {
  const input = problem(330)
  for (const [requested, resolved] of [[350, 350], [40, 30], [10, 10], [320, 330]]) {
    const result = projectRigidMateTarget(input, { bodyId: 'moving', frame: identityRigidPose(), mode: 'rotate', targetPose: { translation: [2, -3, 5], rotation: rotationExp([0, 0, radians(requested)]) } })
    expect(result.status, result.status === 'rejected' ? result.message : '').toBe('ready'); if (result.status !== 'ready') return
    const ray = transformRigidDirection(result.resolvedPose, [1, 0, 0]); near(ray[0], Math.cos(radians(resolved))); near(ray[1], Math.sin(radians(resolved)))
    input.bodies[0].pose = result.resolvedPose
  }
  expect((input.constraints[0] as ReturnType<typeof limit>).arc).toEqual({ start: 330, sweep: 60 })
})
it('rejects the opposite-centre chart atomically without a global conflict certificate', () => {
  const input = problem(180), before = structuredClone(input), result = solveRigidMates(input)
  expect(result.status).toBe('nonConverged'); expect(result.poses).toBeNull(); expect(result.certificates).toEqual([]); expect(input).toEqual(before)
  expect(result.evidence.groups[0].seededConstraintIds).toEqual([])
})
it.each([0, 1e-8])('rejects an undefined or unresolvable projected direction at transverse length %s', transverse => {
  const input = problem(0), mate = input.constraints[0] as ReturnType<typeof limit>; mate.first = end(null, [transverse, 0, Math.sqrt(1 - transverse * transverse)])
  const before = structuredClone(input), result = solveRigidMates(input); expect(result.poses).toBeNull(); expect(result.status).toBe('precisionLimit'); expect(input).toEqual(before)
})
it('rejects contradictory circular arcs without manufacturing a global inconsistency certificate', () => {
  const input = problem(40, { start: 0, sweep: 30 }); input.constraints.push({ ...limit({ start: 60, sweep: 30 }), id: 'other' })
  const before = structuredClone(input), result = solveRigidMates(input); expect(result.poses).toBeNull(); expect(result.status).toBe('nonConverged'); expect(result.certificates).toEqual([]); expect(input).toEqual(before)
})
it('keeps a fixed infeasible stop distinct from a free-body restoration failure', () => {
  const input = problem(40); input.bodies[0].fixed = true
  const result = solveRigidMates(input); expect(result.status).toBe('inconsistent'); expect(result.poses).toBeNull(); expect(result.certificates[0]).toMatchObject({ kind: 'fixedConstraint', constraintIds: ['stop'] })
})
it('honors the zero-iteration restoration budget atomically', () => {
  const input = problem(320), before = structuredClone(input), result = solveRigidMates(input, { maxIterations: 0 })
  expect(result.status).toBe('nonConverged'); expect(result.poses).toBeNull(); expect(result.certificates).toEqual([]); expect(input).toEqual(before)
})
it('distinguishes circular destinations from explicit sampled motion winding', () => {
  const document = declaration(); document.occurrences[0].pose.rotation = rotationExp([0, 0, radians(350)])
  const make = (angle: number) => planAssemblyComponentMotion(document, { component: { occurrencePath: ['moving'], definition: partRef }, translation: [0, 0, 0], rotation: { axis: 2, angle: radians(angle) } })
  const short = make(20), long = make(380), rayA = transformRigidDirection(short.targetPose, [1, 0, 0]), rayB = transformRigidDirection(long.targetPose, [1, 0, 0])
  rayA.forEach((value, index) => near(value, rayB[index], 2e-15)); expect(long.stationCount).toBeGreaterThan(short.stationCount)
  const admitted = (plan: ReturnType<typeof make>) => Array.from({ length: plan.stationCount + 1 }, (_, station) => {
    const input = problem(); input.bodies[0].pose = plan.atStation(station).pose
    const value = evaluateRigidMates(input); return value.diagnostics.length === 0 && value.checks.length === 1 && value.checks.every(check => check.satisfied)
  })
  expect(admitted(short).every(Boolean)).toBe(true); expect(admitted(long).some(value => !value)).toBe(true)
})

function tracked(kind: 'gear' | 'screw' | 'rack-pinion', passive: boolean): RigidMateProblem {
  const input = problem(0), identity = identityRigidPose().rotation, turns = 4 * Math.PI,
    cylinder: RigidMateSupport = { kind: 'cylinder', point: [0, 0, 0], axis: [0, 0, 1], xDirection: [1, 0, 0], radius: 1, tolerance: 0 }
  input.bodies[0].pose = identityRigidPose()
  input.bodies.push({ id: 'follower', fixed: false, pose: { translation: [0, 0, kind === 'gear' ? 0 : kind === 'screw' ? 4 : turns], rotation: [...identity] } })
  const first = { ...end('moving', [0, 0, 1]), support: cylinder }, second = { ...end('follower', [0, 0, 1]), support: cylinder }
  let mechanical: RigidGearConstraint | RigidScrewConstraint | RigidRackPinionConstraint
  if (kind === 'gear') mechanical = { id: 'tracker', type: kind, first, second, carrier: null, ratio: { numerator: 2, denominator: 1 }, direction: 'opposed',
    neutralRotations: { first: [...identity], second: [...identity] }, angles: { first: turns, second: -2 * turns }, phase: 0 }
  else if (kind === 'screw') mechanical = { id: 'tracker', type: kind, first, second, lead: 2, reverse: false, alignment: 'aligned', neutralRotation: [...identity], angle: turns, neutralTravel: 0 }
  else mechanical = { id: 'tracker', type: kind, first, second, conversion: { mode: 'travel', override: 2 * Math.PI }, reverse: false, neutralRotation: [...identity], angle: turns, neutralTravel: 0 }
  if (passive) {
    if (mechanical.type === 'gear') input.passiveGears = [mechanical]
    else if (mechanical.type === 'screw') input.passiveScrews = [mechanical]
    else input.passiveRackPinions = [mechanical]
  } else {
    input.constraints.push(mechanical)
    if (kind !== 'gear') input.constraints.push({ id: 'follower-guide', type: 'concentric', first: second,
      second: { ...end(null, [0, 0, 1]), support: cylinder }, alignment: 'aligned', rotationLock: [...identity] })
  }
  return input
}
it.each((['gear', 'screw', 'rack-pinion'] as const).flatMap(kind => [false, true].map(passive => ({ kind, passive }))))('preserves $kind independent accumulated turns while a circular stop activates, passive=$passive', ({ kind, passive }) => {
  const input = tracked(kind, passive), before = structuredClone(input), result = projectRigidMateTarget(input, { bodyId: 'moving', frame: identityRigidPose(), mode: 'rotate',
    targetPose: { translation: [0, 0, 0], rotation: rotationExp([0, 0, radians(40)]) } })
  expect(result.status, result.status === 'rejected' ? result.message : '').toBe('ready'); if (result.status !== 'ready') return
  const ray = transformRigidDirection(result.resolvedPose, [1, 0, 0]); near(ray[0], Math.sqrt(3) / 2); near(ray[1], .5)
  if (kind === 'gear') {
    near(result.result.gearAngles.get('tracker')!.first, 4 * Math.PI + Math.PI / 6)
    near(result.result.gearAngles.get('tracker')!.second, -8 * Math.PI - (passive ? 0 : Math.PI / 3))
  } else {
    near((kind === 'screw' ? result.result.screwAngles : result.result.rackPinionAngles).get('tracker')!, 4 * Math.PI + Math.PI / 6)
    if (!passive) near(result.result.poses!.get('follower')!.translation[2] - result.resolvedPose.translation[2], kind === 'screw' ? 4 + 1 / 6 : 4 * Math.PI + Math.PI / 6, 1e-6)
  }
  expect(input).toEqual(before)
})
it.each((['gear', 'screw', 'rack-pinion'] as const).flatMap(kind => [false, true].map(passive => ({ kind, passive }))))('rolls back every $kind lift when a circular restoration budget fails, passive=$passive', ({ kind, passive }) => {
  const input = tracked(kind, passive); input.bodies[0].pose.rotation = rotationExp([0, 0, radians(40)])
  const before = structuredClone(input), result = solveRigidMates(input, { maxIterations: 0 })
  expect(result.poses).toBeNull(); expect(result.status).toBe('nonConverged'); expect(result.gearAngles.size + result.screwAngles.size + result.rackPinionAngles.size).toBe(0)
  expect(result.certificates).toEqual([]); expect(input).toEqual(before)
})
