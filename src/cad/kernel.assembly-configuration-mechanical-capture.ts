import { validateAssemblyConfiguredDocument, assemblyConfiguredGeometryInput, type AssemblyConfiguredDocument } from '../model/assemblyConfiguredDocument'
import { inspectAssemblyConfiguredMechanicalEdit, configuredMechanicalMateDeclaration,
  type AssemblyConfiguredMechanicalEdit, type AssemblyConfiguredMechanicalSpec, type AssemblyConfiguredMechanicalCapture } from '../model/assemblyConfiguredMechanicalEditing'
import { applyAssemblyConfiguredMateEdit } from '../model/assemblyConfiguredMateEditing'
import { planAssemblyConfigurationSolve } from '../model/assemblyConfigurationSolveGraph'
import { validateAssemblyMate, type AssemblyMate } from '../model/assemblyDocument'
import { composeRigidPoses, identityRigidPose, inverseRigidPose, validateRigidPose, type RigidPose } from '../model/rigidPose'
import { rigidScrewCoordinates } from '../model/assemblyScrew'
import { rigidRackPinionCoordinates } from '../model/assemblyRackPinion'
import type { RigidMateEndpoint, RigidScrewConstraint, RigidRackPinionConstraint } from '../model/assemblySolveTypes'
import { AssemblyConfigurationGeometrySnapshot, assemblyConfigurationPlacementArithmetic,
  type AssemblyConfigurationGeometryInput, type AssemblyConfigurationWitness } from './kernel.assembly-configuration-snapshot'
import { createConfiguredAssemblyNumericalScope, assertConfiguredAssemblyNumericalScope, type ConfiguredAssemblyNumericalScope } from './kernel.assembly-configuration-scope'
import { configuredAssemblyEndpoint } from './kernel.assembly-configuration-endpoints'
import { configuredMeasurementBands } from './kernel.assembly-configuration-measurement'
import { prepareConfiguredAssemblySolve, applyPreparedConfiguredAssemblySolve, validateConfiguredAssemblySolvePolicy, type ConfiguredAssemblySolveOptions } from './kernel.assembly-configuration-solve'
import { NativeCleanupError } from './kernel.native-ownership'
import { captureConfiguredAssemblyWorkerContext } from './kernel.assembly-configuration-context'

const current = AssemblyConfigurationGeometrySnapshot.prototype.assertCurrent
const witness = AssemblyConfigurationGeometrySnapshot.prototype.assertWitness
const component = AssemblyConfigurationGeometrySnapshot.prototype.resolveComponentReference
const geometry = AssemblyConfigurationGeometrySnapshot.prototype.resolveReference
const dispose = AssemblyConfigurationGeometrySnapshot.prototype.dispose
const ROUND = 128 * Number.EPSILON
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
type Context = { document: AssemblyConfiguredDocument; generation: number }
function input(c: Context) { return assemblyConfiguredGeometryInput(c.document, c.generation) }
function target(edit: AssemblyConfiguredMechanicalEdit, change: Parameters<typeof applyAssemblyConfiguredMateEdit>[1]['change']) {
  return { scopePath: [...edit.scopePath], definition: { ...edit.definition }, configuration: edit.configuration, change }
}
function solved(c: Context, options: ConfiguredAssemblySolveOptions): Context {
  const actual = input(c), handle = prepareConfiguredAssemblySolve(actual, options), applied = applyPreparedConfiguredAssemblySolve(actual, handle)
  return { document: validateAssemblyConfiguredDocument({ version: 3, kind: 'configured-assembly', source: applied.document, catalog: applied.catalog, rootConfiguration: applied.rootConfiguration }), generation: applied.generation }
}
function rotation(p: RigidPose): RigidPose { return { translation: [0, 0, 0], rotation: [...p.rotation] } }
function relativeRotation(a: RigidPose, b: RigidPose) { return composeRigidPoses(inverseRigidPose(rotation(a)), rotation(b)).rotation }
function existingCapture(m: AssemblyMate): AssemblyConfiguredMechanicalCapture {
  switch (m.type) {
    case 'lock': return { type: m.type, relativePose: structuredClone(m.relativePose) }
    case 'concentric': return { type: m.type, rotationLock: m.rotationLock ? [...m.rotationLock] : null }
    case 'gear': return { type: m.type, neutralRotations: structuredClone(m.neutralRotations), angles: { ...m.angles } }
    case 'screw': case 'rack-pinion': return { type: m.type, neutralRotation: [...m.neutralRotation], neutralTravel: m.neutralTravel, angle: m.angle }
    default: throw Error('The existing relation has no mechanical capture.')
  }
}
function captureAt(snapshot: AssemblyConfigurationGeometrySnapshot, actual: AssemblyConfigurationGeometryInput,
  path: string[], spec: AssemblyConfiguredMechanicalSpec, bands: ReturnType<typeof configuredMeasurementBands>): AssemblyConfiguredMechanicalCapture {
  current.call(snapshot, actual)
  const scope = createConfiguredAssemblyNumericalScope(snapshot, actual, path), issued: AssemblyConfigurationWitness[] = []
  const observe = (reference: typeof spec.first | typeof spec.second) => {
    const w = spec.type === 'lock' ? component.call(snapshot, actual, reference as Extract<AssemblyConfiguredMechanicalSpec, {type:'lock'}>['first'], path)
      : geometry.call(snapshot, actual, reference as Parameters<typeof geometry>[1], path)
    witness.call(snapshot, w, actual); issued.push(w); return w
  }
  const first = observe(spec.first), second = observe(spec.second)
  if (equal(first.componentPath, second.componentPath)) throw Error('Mechanical capture requires two distinct current component occurrences.')
  const endpoint = (w: AssemblyConfigurationWitness) => configuredAssemblyEndpoint(snapshot, actual, w, scope)
  const pose = (e: RigidMateEndpoint): RigidPose => {
    if (e.bodyId === null) return validateRigidPose(e.frame)
    const b = scope.bodies.find(b => b.id === e.bodyId)
    if (!b) throw Error('Configured capture endpoint lost its local rigid owner.')
    return composeRigidPoses(validateRigidPose(b.pose), validateRigidPose(e.frame))
  }
  const a = endpoint(first), b = endpoint(second), pa = pose(a), pb = pose(b)
  if (spec.type === 'concentric') {
    const exactAxis = (w: AssemblyConfigurationWitness, reference: typeof spec.first) => w.kind === 'configured-support'
      && (reference.kind === 'principal-axis' ? w.origin === 'principal-axis' && w.localSupport.kind === 'line'
        : reference.kind === 'face' && reference.support === 'axis' && w.origin === 'native-face' && w.localSupport.kind === 'cylinder')
    if (!exactAxis(first, spec.first) || !exactAxis(second, spec.second)) throw Error('Concentric capture requires exact current principal axes or material cylinders.')
    if ((spec.first.kind === 'principal-axis' || spec.second.kind === 'principal-axis') && a.bodyId === b.bodyId) {
      throw Error('Origin rotation capture requires distinct local rigid owners, including the static declaring frame.')
    }
  } else if (spec.type !== 'lock' && (first.kind !== 'configured-support' || first.localSupport.kind !== 'cylinder'
    || second.kind !== 'configured-support' || (spec.type === 'rack-pinion' ? !['line', 'cylinder'].includes(second.localSupport.kind) : second.localSupport.kind !== 'cylinder'))) throw Error('Mechanical capture requires its exact current cylinder/LINE native purposes.')
  let carrier: RigidPose | undefined
  if (spec.type === 'gear') { const w = component.call(snapshot, actual, spec.carrier, path); issued.push(w); carrier = pose(endpoint(w)) }
  const positional = spec.type === 'lock' || spec.type === 'screw' || spec.type === 'rack-pinion'
  let angularError = 0, positionError = 0
  for (const w of issued) {
    const arithmetic = assemblyConfigurationPlacementArithmetic(w, actual), round = ROUND * (arithmetic.depth + 2)
    angularError += round
    if (positional) {
      const local = w.kind === 'configured-support' ? Math.hypot(...w.localSupport.point) : 0
      positionError += round * (arithmetic.placementSum + local + Math.hypot(...pa.translation) + Math.hypot(...pb.translation))
    }
  }
  if (!Number.isFinite(angularError) || angularError > bands.angleToleranceRad || !Number.isFinite(positionError) || positionError > bands.lengthToleranceMm) throw RangeError('Configured mechanical capture cannot retain its original-chain precision.')
  let capture: AssemblyConfiguredMechanicalCapture
  switch (spec.type) {
    case 'lock': capture = { type: spec.type, relativePose: composeRigidPoses(inverseRigidPose(pa), pb) }; break
    case 'concentric': capture = { type: spec.type, rotationLock: relativeRotation(pa, pb) }; break
    case 'gear': capture = { type: spec.type, neutralRotations: { first: relativeRotation(carrier!, pa), second: relativeRotation(carrier!, pb) }, angles: { first: 0, second: 0 } }; break
    case 'screw': {
      const neutralRotation = relativeRotation(pb, pa)
      const constraint: RigidScrewConstraint = { id: spec.id, type: spec.type, first: { ...a, bodyId: null, frame: pa }, second: { ...b, bodyId: null, frame: pb }, lead: spec.lead, reverse: spec.reverse, alignment: spec.alignment, neutralRotation, angle: 0, neutralTravel: 0 }
      const measured = rigidScrewCoordinates(constraint, new Map(), bands.angleToleranceRad, { origin: [...pa.translation], lengthScale: 1 })
      capture = { type: spec.type, neutralRotation, neutralTravel: measured.travel, angle: 0 }; break
    }
    case 'rack-pinion': {
      const neutralRotation = relativeRotation(pb, pa)
      const constraint: RigidRackPinionConstraint = { id: spec.id, type: spec.type, first: { ...a, bodyId: null, frame: pa }, second: { ...b, bodyId: null, frame: pb }, conversion: { ...spec.conversion }, reverse: spec.reverse, neutralRotation, angle: 0, neutralTravel: 0 }
      const measured = rigidRackPinionCoordinates(constraint, new Map(), bands.angleToleranceRad, { origin: [...pa.translation], lengthScale: 1 })
      capture = { type: spec.type, neutralRotation, neutralTravel: measured.travel, angle: 0 }; break
    }
  }
  for (const w of issued) witness.call(snapshot, w, actual)
  assertConfiguredAssemblyNumericalScope(snapshot, actual, scope); current.call(snapshot, actual)
  return capture
}
/** Native producer, not a public capture DTO admission point. Fresh snapshots
 * authenticate all placed uses; the caller must still solve/verify the final
 * captured proposal and publish only its private session capability. */
export function prepareConfiguredAssemblyMechanicalProposal(initial: Context, raw: AssemblyConfiguredMechanicalEdit,
  options: ConfiguredAssemblySolveOptions = {}): Context {
  const original = captureConfiguredAssemblyWorkerContext(initial)
  const originalSignature = JSON.stringify(original)
  const checkOriginal = () => { if (JSON.stringify(captureConfiguredAssemblyWorkerContext(initial)) !== originalSignature) throw Error('Configured mechanical context changed during native work.') }
  const { edit, existing } = inspectAssemblyConfiguredMechanicalEdit(original.document, raw)
  validateConfiguredAssemblySolvePolicy(options)
  if (!Number.isSafeInteger(original.generation) || original.generation < 0) throw Error('Configured mechanical generation is invalid.')
  const bands = configuredMeasurementBands(options.lengthToleranceMm === undefined && options.angleToleranceRad === undefined ? {} : {
    ...(options.lengthToleranceMm === undefined ? {} : { lengthToleranceMm: options.lengthToleranceMm }), ...(options.angleToleranceRad === undefined ? {} : { angleToleranceRad: options.angleToleranceRad }) })
  if (edit.change.kind === 'replace' && edit.change.capture === 'retain') {
    if (!existing) throw Error('Retained capture requires its exact existing declaration.')
    const mate = configuredMechanicalMateDeclaration(edit.change.spec, existingCapture(existing))
    return { document: applyAssemblyConfiguredMateEdit(original.document, target(edit, { kind: 'replace', mateId: edit.change.mateId, mate })), generation: original.generation }
  }
  let stage = original
  if (edit.change.kind === 'replace') stage = { ...stage, document: applyAssemblyConfiguredMateEdit(stage.document, target(edit, { kind: 'remove', mateId: edit.change.mateId })) }
  stage = solved(stage, options); checkOriginal()
  const spec = edit.change.spec
  if (spec.type === 'concentric' || spec.type === 'screw') {
    const alignment = validateAssemblyMate({ id: crypto.randomUUID(), type: 'concentric', name: 'Temporary native capture alignment', suppressed: false, first: spec.first, second: spec.second, alignment: spec.alignment, rotationLock: null })
    stage = { ...stage, document: applyAssemblyConfiguredMateEdit(stage.document, target(edit, { kind: 'add', mate: alignment })) }
    stage = solved(stage, options); checkOriginal()
    stage = { ...stage, document: applyAssemblyConfiguredMateEdit(stage.document, target(edit, { kind: 'remove', mateId: alignment.id })) }
  }
  const actual = input(stage), plan = planAssemblyConfigurationSolve(actual.document, actual.catalog, actual.rootConfiguration)
  const state = plan.states.find(s => s.definition.id === edit.definition.id && s.definition.revision === edit.definition.revision && s.configuration === edit.configuration)
  if (!state || !state.scopePaths.length) throw Error('The mechanical capture state has no active placed uses.')
  const snapshot = new AssemblyConfigurationGeometrySnapshot(actual)
  let primary: { error: unknown } | undefined, capture: AssemblyConfiguredMechanicalCapture | undefined
  try {
    for (const path of state.scopePaths) {
      const observed = captureAt(snapshot, actual, [...path], spec, bands)
      if (capture && !equal(capture, observed)) throw Error('Shared configured uses do not have one identical intrinsic capture.')
      capture = observed; checkOriginal()
    }
    current.call(snapshot, actual)
  } catch (error) { primary = { error } }
  try { dispose.call(snapshot) } catch (error) { throw new NativeCleanupError(primary, [error], 'Configured mechanical capture or release failed.') }
  if (primary) throw primary.error
  checkOriginal()
  if (!capture) throw Error('No configured native capture was produced.')
  const mate = configuredMechanicalMateDeclaration(spec, capture)
  const proposal = applyAssemblyConfiguredMateEdit(stage.document, target(edit, { kind: 'add', mate }))
  checkOriginal()
  return { document: proposal, generation: stage.generation }
}
