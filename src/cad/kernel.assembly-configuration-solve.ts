import { MAX_ASSEMBLY_BYTES } from '../model/assemblyDocument'
import { validateAssemblyConfigurationDeclarations } from '../model/assemblyConfigurationCore'
import { planAssemblyConfigurationSolve } from '../model/assemblyConfigurationSolveGraph'
import { stageAssemblyConfigurationSolveState } from '../model/assemblyConfigurationWriteback'
import { solveRigidMates, type RigidMateSolverOptions, type RigidMateSolveResult } from '../model/assemblySolver'
import { deriveRigidGearAngles } from '../model/assemblyGear'
import { deriveRigidScrewAngles } from '../model/assemblyScrew'
import { deriveRigidRackPinionAngles } from '../model/assemblyRackPinion'
import type { RigidMateProblem, RigidMateConstraint } from '../model/assemblySolveTypes'
import { AssemblyConfigurationGeometrySnapshot, type AssemblyConfigurationGeometryInput } from './kernel.assembly-configuration-snapshot'
import { createConfiguredAssemblyNumericalScope, assertConfiguredAssemblyNumericalScope } from './kernel.assembly-configuration-scope'
import { authenticateConfiguredMeasurement, configuredMeasurementBands, type ConfiguredMeasurementOptions } from './kernel.assembly-configuration-measurement'
import { conditionConfiguredAssemblyScope } from './kernel.assembly-configuration-conditioning'
import { verifyConfiguredAssemblyGeometry } from './kernel.assembly-configuration-verification'
import type { ConfiguredResolvedMate } from './kernel.assembly-configuration-relations'
import { NativeCleanupError } from './kernel.native-ownership'

type ReadonlyData<T> = T extends object ? { readonly [K in keyof T]: ReadonlyData<T[K]> } : T
type Mutable<T> = T extends object ? { -readonly [K in keyof T]: Mutable<T[K]> } : T
export interface ConfiguredAssemblySolveOptions extends ConfiguredMeasurementOptions { solver?: RigidMateSolverOptions }
const intrinsicCurrent = AssemblyConfigurationGeometrySnapshot.prototype.assertCurrent
const intrinsicActive = AssemblyConfigurationGeometrySnapshot.prototype.resolveActiveMates
const intrinsicGears = AssemblyConfigurationGeometrySnapshot.prototype.inspectGearState
const intrinsicScrews = AssemblyConfigurationGeometrySnapshot.prototype.inspectScrewState
const intrinsicRacks = AssemblyConfigurationGeometrySnapshot.prototype.inspectRackPinionState
const intrinsicDispose = AssemblyConfigurationGeometrySnapshot.prototype.dispose
const preparations = new WeakMap<object, { baseline: string; candidate: AssemblyConfigurationGeometryInput }>()
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
function freeze<T>(value: T, seen = new WeakSet<object>()): ReadonlyData<T> {
  if (value && typeof value === 'object' && !seen.has(value)) {
    seen.add(value); for (const child of Object.values(value)) freeze(child, seen); Object.freeze(value)
  }
  return value as ReadonlyData<T>
}
function record(value: unknown, allowed: readonly string[], required: readonly string[] = []): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw Error('Configured solve requires plain own data.')
  const fields = Object.getOwnPropertyDescriptors(value), result: Record<string, unknown> = Object.create(null)
  for (const key of Reflect.ownKeys(fields)) {
    const field = fields[key as string]
    if (typeof key !== 'string' || !allowed.includes(key) || !field.enumerable || !('value' in field) || field.value === undefined) throw Error('Unknown or executable configured solve field.')
    result[key] = field.value
  }
  if (required.some(key => !Object.hasOwn(result, key))) throw Error('Configured solve context requires its complete fields.')
  return result
}
function capture(input: AssemblyConfigurationGeometryInput) {
  const raw = record(input, ['document', 'catalog', 'rootConfiguration', 'generation'], ['document', 'catalog', 'rootConfiguration', 'generation'])
  if (typeof raw.generation !== 'number' || !Number.isSafeInteger(raw.generation) || raw.generation < 0) throw Error('Configured solve generation must be a nonnegative safe integer.')
  const data = validateAssemblyConfigurationDeclarations(raw.document as AssemblyConfigurationGeometryInput['document'], raw.catalog, raw.rootConfiguration as string | null)
  const context: AssemblyConfigurationGeometryInput = { document: structuredClone(data.source) as Mutable<typeof data.source>, catalog: structuredClone(data.catalog) as Mutable<typeof data.catalog>, rootConfiguration: data.rootConfiguration, generation: raw.generation }
  const signature = JSON.stringify(context)
  if (new TextEncoder().encode(signature).byteLength > MAX_ASSEMBLY_BYTES) throw Error('Configured solve context exceeds its byte budget.')
  return { context, signature }
}
function policy(input: ConfiguredAssemblySolveOptions) {
  const raw = record(input, ['lengthToleranceMm', 'angleToleranceRad', 'solver'])
  const bands = configuredMeasurementBands({ ...(Object.hasOwn(raw, 'lengthToleranceMm') ? { lengthToleranceMm: raw.lengthToleranceMm as number } : {}),
    ...(Object.hasOwn(raw, 'angleToleranceRad') ? { angleToleranceRad: raw.angleToleranceRad as number } : {}) })
  const solver: RigidMateSolverOptions = {}
  if (Object.hasOwn(raw, 'solver')) {
    const fields = record(raw.solver, ['angleRefinementTolerance', 'lengthRefinementTolerance', 'maxIterations', 'maxTrials', 'maxSeedPasses', 'initialDamping', 'maxStepNorm', 'svd'])
    for (const [key, value] of Object.entries(fields)) {
      if (key === 'svd') {
        const svd = record(value, ['maxSweeps', 'orthogonalityTolerance', 'rankAbsoluteTolerance', 'rankRelativeTolerance', 'rankUncertaintyFactor'])
        if (Object.values(svd).some(n => typeof n !== 'number' || !Number.isFinite(n))) throw Error('Configured SVD options require finite numeric data.')
        solver.svd = svd
      } else {
        if (typeof value !== 'number' || !Number.isFinite(value)) throw Error('Configured solver options require finite numeric data.')
        Object.assign(solver, { [key]: value })
      }
    }
  }
  if (solver.lengthRefinementTolerance !== undefined && (solver.lengthRefinementTolerance <= 0 || solver.lengthRefinementTolerance > bands.lengthToleranceMm)
    || solver.angleRefinementTolerance !== undefined && (solver.angleRefinementTolerance <= 0 || solver.angleRefinementTolerance > bands.angleToleranceRad)) throw Error('Refinement cannot widen configured acceptance bands.')
  // The pure solver validates its complete bounded policy before native allocation.
  const probe = solveRigidMates({ bodies: [], constraints: [], origin: [0, 0, 0], lengthScale: 1, lengthTolerance: bands.lengthToleranceMm, angleTolerance: bands.angleToleranceRad }, solver)
  if (!probe.poses) throw Error('Invalid configured solver policy: ' + probe.evidence.diagnostics.join('; '))
  return { bands, solver }
}
function withSnapshot<T>(input: AssemblyConfigurationGeometryInput, run: (snapshot: AssemblyConfigurationGeometrySnapshot) => T): T {
  const snapshot = new AssemblyConfigurationGeometrySnapshot(input)
  let primary: { error: unknown } | undefined, result!: T
  try { result = run(snapshot); intrinsicCurrent.call(snapshot, input) } catch (error) { primary = { error } }
  try { intrinsicDispose.call(snapshot) } catch (cleanup) { throw new NativeCleanupError(primary, [cleanup], 'Configured solve stage or native release failed.') }
  if (primary) throw primary.error
  return result
}
function inventory(snapshot: AssemblyConfigurationGeometrySnapshot, input: AssemblyConfigurationGeometryInput) {
  const active = intrinsicActive.call(snapshot, input)
  const passive = [intrinsicGears.call(snapshot, input, true), intrinsicScrews.call(snapshot, input, true), intrinsicRacks.call(snapshot, input, true)]
  if (passive.some(state => state.unavailable.length)) throw Error('Repair unavailable passive configured winding before solving.')
  return [...active, ...passive.flatMap(state => state.resolved)]
}
function assertInitialWinding(problem: RigidMateProblem) {
  const poses = new Map(problem.bodies.map(body => [body.id, body.pose]))
  const gears = deriveRigidGearAngles(problem, poses), screws = deriveRigidScrewAngles(problem, poses), racks = deriveRigidRackPinionAngles(problem, poses)
  for (const value of [...problem.constraints, ...(problem.passiveGears ?? []), ...(problem.passiveScrews ?? []), ...(problem.passiveRackPinions ?? [])]) {
    const band = problem.angleTolerance
    if (value.type === 'gear') {
      const actual = gears.get(value.id)
      if (!actual || Math.abs(actual.first - value.angles.first) > band || Math.abs(actual.second - value.angles.second) > band) throw Error('Configured gear winding anchor changed without a verified angular trajectory.')
    } else if (value.type === 'screw' && Math.abs(screws.get(value.id)! - value.angle) > band || value.type === 'rack-pinion' && Math.abs(racks.get(value.id)! - value.angle) > band) throw Error('Configured mechanical winding anchor changed without a verified angular trajectory.')
  }
}
function detachedSolver(result: RigidMateSolveResult) {
  const { poses: _poses, gearAngles: _gears, screwAngles: _screws, rackPinionAngles: _racks, ...review } = result
  return structuredClone(review)
}
function assertFinite(value: unknown): void {
  if (typeof value === 'number' && !Number.isFinite(value)) throw Error('Configured solve cannot publish nonfinite review data.')
  if (value && typeof value === 'object') for (const child of Object.values(value)) assertFinite(child)
}

/** One bounded child-before-parent selected-state solve. All changes stay in a
 * private detached candidate until every placed relation passes fresh native
 * verification and all resources are released. Shared intrinsic states retain
 * normal propagation to every parent that selects them; this is not flexibility. */
export function prepareConfiguredAssemblySolve(input: AssemblyConfigurationGeometryInput, options: ConfiguredAssemblySolveOptions = {}) {
  const config = policy(options), baseline = capture(input)
  const assertBaseline = () => { if (capture(input).signature !== baseline.signature) throw Error('The complete configured solve baseline changed during preparation.') }
  const plan = planAssemblyConfigurationSolve(baseline.context.document, baseline.context.catalog, baseline.context.rootConfiguration)
  if (plan.status !== 'ready') throw Error('Repair active configured references before solving.')
  let candidate = baseline.context, reviewBytes = 0
  const states: { key: string; definition: { id: string; revision: string }; configuration: string | null; scopePaths: string[][]; solver: ReturnType<typeof detachedSolver>; changed: boolean }[] = []
  for (const planned of plan.states) {
    assertBaseline()
    const currentPlan = planAssemblyConfigurationSolve(candidate.document, candidate.catalog, candidate.rootConfiguration)
    const state = currentPlan.states.find(value => value.key === planned.key)
    if (!state || !equal(state.dependencies, planned.dependencies) || !equal(state.scopePaths, planned.scopePaths)) throw Error('Configured solve dependency closure changed while staging.')
    const staged = withSnapshot(candidate, snapshot => {
      const scope = createConfiguredAssemblyNumericalScope(snapshot, candidate, state.representativePath)
      const values = inventory(snapshot, candidate).filter(value => equal(value.scopePath, scope.scopePath))
      const conditioned = conditionConfiguredAssemblyScope(snapshot, candidate, scope, values, config.bands)
      const active: RigidMateConstraint[] = [], passiveGears: NonNullable<RigidMateProblem['passiveGears']> = [], passiveScrews: NonNullable<RigidMateProblem['passiveScrews']> = [], passiveRackPinions: NonNullable<RigidMateProblem['passiveRackPinions']> = []
      conditioned.constraints.forEach((value, index) => {
        if (!values[index].suppressed) active.push(value)
        else if (value.type === 'gear') passiveGears.push(value)
        else if (value.type === 'screw') passiveScrews.push(value)
        else if (value.type === 'rack-pinion') passiveRackPinions.push(value)
        else throw Error('Only configured mechanical winding may be passive.')
      })
      const problem: RigidMateProblem = { bodies: structuredClone(scope.bodies) as Mutable<typeof scope.bodies>, constraints: active, passiveGears, passiveScrews, passiveRackPinions,
        origin: conditioned.origin, lengthScale: conditioned.lengthScale, lengthTolerance: config.bands.lengthToleranceMm, angleTolerance: config.bands.angleToleranceRad }
      assertInitialWinding(problem)
      const result = solveRigidMates(problem, config.solver)
      if (!result.poses || !['fullyDefined', 'underdefined'].includes(result.status)) throw Error('Configured state solve refused: ' + result.status + '; ' + result.evidence.diagnostics.join('; '))
      const output = stageAssemblyConfigurationSolveState(candidate.document, candidate.catalog, candidate.rootConfiguration, { definition: { ...state.definition }, configuration: state.configuration,
        poses: [...result.poses].map(([id, pose]) => ({ id, pose })), gearAngles: [...result.gearAngles].map(([mateId, angles]) => ({ mateId, ...angles })),
        screwAngles: [...result.screwAngles].map(([mateId, angle]) => ({ mateId, angle })), rackPinionAngles: [...result.rackPinionAngles].map(([mateId, angle]) => ({ mateId, angle })) })
      for (const value of values) authenticateConfiguredMeasurement(snapshot, candidate, value)
      assertConfiguredAssemblyNumericalScope(snapshot, candidate, scope)
      assertBaseline()
      return { output, solver: detachedSolver(result) }
    })
    const changed = !equal(candidate.document, staged.output.document) || !equal(candidate.catalog, staged.output.catalog)
    if (changed && candidate.generation === Number.MAX_SAFE_INTEGER) throw Error('Configured solve generation cannot advance safely.')
    candidate = { document: structuredClone(staged.output.document) as Mutable<typeof staged.output.document>, catalog: structuredClone(staged.output.catalog) as Mutable<typeof staged.output.catalog>, rootConfiguration: staged.output.rootConfiguration, generation: candidate.generation + (changed ? 1 : 0) }
    const review = { key: state.key, definition: { ...state.definition }, configuration: state.configuration, scopePaths: state.scopePaths.map(path => [...path]), solver: staged.solver, changed }
    assertFinite(review); reviewBytes += new TextEncoder().encode(JSON.stringify(review)).byteLength
    if (reviewBytes > MAX_ASSEMBLY_BYTES) throw Error('Configured solve review exceeds its byte budget.')
    states.push(review)
  }
  const verification = verifyConfiguredAssemblyGeometry(candidate, config.bands)
  if (!verification.accepted) throw Error('Fresh configured geometry rejected the staged solve: ' + verification.status)
  assertBaseline(); capture(candidate)
  const result = { kind: 'configured-assembly-solve-preparation' as const, status: 'prepared' as const, candidate: structuredClone(candidate), states, verification,
    changed: !equal(candidate, baseline.context), propagation: 'shared-intrinsic-states' as const }
  assertFinite(result)
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > MAX_ASSEMBLY_BYTES) throw Error('Configured solve preparation exceeds its byte budget.')
  const handle = freeze(result)
  assertBaseline()
  preparations.set(handle, { baseline: baseline.signature, candidate: structuredClone(candidate) })
  return handle
}

/** Atomically publish only the privately retained candidate against the exact
 * complete baseline. Every attempt consumes the handle, including a stale or
 * invalid attempt; detached data and copied handles cannot authorize Apply. */
export function applyPreparedConfiguredAssemblySolve(current: AssemblyConfigurationGeometryInput, handle: unknown): ReadonlyData<AssemblyConfigurationGeometryInput> {
  const pending = handle && typeof handle === 'object' ? preparations.get(handle) : undefined
  if (!pending) throw Error('The configured solve preparation is missing, copied or already consumed.')
  preparations.delete(handle as object)
  if (capture(current).signature !== pending.baseline) throw Error('The configured solve preparation no longer matches its complete baseline.')
  return freeze(capture(pending.candidate).context)
}
export type ConfiguredAssemblySolvePreparation = ReturnType<typeof prepareConfiguredAssemblySolve>
