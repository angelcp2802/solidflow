import { AssemblyConfigurationGeometrySnapshot, type AssemblyConfigurationGeometryInput } from './kernel.assembly-configuration-snapshot'
import { isConfiguredResolvedBinaryMate, isConfiguredResolvedWidthMate, isConfiguredResolvedSymmetryMate,
  isConfiguredResolvedHingeMate, isConfiguredResolvedProfileCenterMate, isConfiguredResolvedLinePathMate,
  isConfiguredResolvedCircularPathMate, type ConfiguredResolvedMate, type ConfiguredUnavailableMate } from './kernel.assembly-configuration-relations'
import { authenticateConfiguredMeasurement, configuredMeasurementBands, type ConfiguredMeasurementOptions } from './kernel.assembly-configuration-measurement'
import { measureConfiguredAssemblyBinary } from './kernel.assembly-configuration-binary-measurement'
import { measureConfiguredAssemblyWidth } from './kernel.assembly-configuration-width'
import { measureConfiguredAssemblySymmetry } from './kernel.assembly-configuration-symmetry'
import { measureConfiguredAssemblyAdvanced } from './kernel.assembly-configuration-advanced'
import { measureConfiguredAssemblyHinge } from './kernel.assembly-configuration-hinge'
import { NativeCleanupError } from './kernel.native-ownership'

const intrinsicCurrent = AssemblyConfigurationGeometrySnapshot.prototype.assertCurrent
const intrinsicActive = AssemblyConfigurationGeometrySnapshot.prototype.resolveActiveMates
const intrinsicGears = AssemblyConfigurationGeometrySnapshot.prototype.inspectGearState
const intrinsicScrews = AssemblyConfigurationGeometrySnapshot.prototype.inspectScrewState
const intrinsicRacks = AssemblyConfigurationGeometrySnapshot.prototype.inspectRackPinionState
const intrinsicDispose = AssemblyConfigurationGeometrySnapshot.prototype.dispose

type ReadonlyData<T> = T extends object ? { readonly [K in keyof T]: ReadonlyData<T[K]> } : T
function freeze<T>(value: T, seen = new WeakSet<object>()): ReadonlyData<T> {
  if (value && typeof value === 'object' && !seen.has(value)) {
    seen.add(value); for (const child of Object.values(value)) freeze(child, seen); Object.freeze(value)
  }
  return value as ReadonlyData<T>
}
function assertFiniteReport(value: unknown): void {
  if (typeof value === 'number' && !Number.isFinite(value)) throw Error('Configured verification cannot publish a nonfinite measurement.')
  if (value && typeof value === 'object') for (const child of Object.values(value)) assertFiniteReport(child)
}
function key(value: Pick<ConfiguredResolvedMate, 'scopePath' | 'scope' | 'configuration' | 'mate'>): string {
  return JSON.stringify([value.scopePath, value.scope.id, value.scope.revision, value.configuration, value.mate.id])
}
function unavailable(value: ConfiguredUnavailableMate) {
  return { key: key(value), mateId: value.mate.id, family: value.mate.type, scopePath: [...value.scopePath], scope: { ...value.scope },
    configuration: value.configuration, configurationAncestry: structuredClone(value.configurationAncestry),
    scopePose: structuredClone(value.scopePose), suppressed: value.suppressed,
    roles: value.roles.map(role => ({ side: role.side, componentPath: role.candidate ? [...role.candidate.path] : null, diagnostics: structuredClone(role.diagnostics) })) }
}
function measure(snapshot: AssemblyConfigurationGeometrySnapshot, input: AssemblyConfigurationGeometryInput,
  value: ConfiguredResolvedMate, bands: Required<ConfiguredMeasurementOptions>) {
  // This inventory was just issued by our owned native snapshot. Every family
  // implementation authenticates its own entry and exit; these guards merely
  // select that implementation and grant no authority on their own.
  if (isConfiguredResolvedBinaryMate(value)) return measureConfiguredAssemblyBinary(snapshot, input, value, bands)
  if (isConfiguredResolvedWidthMate(value)) return measureConfiguredAssemblyWidth(snapshot, input, value, bands)
  if (isConfiguredResolvedSymmetryMate(value)) return measureConfiguredAssemblySymmetry(snapshot, input, value, bands)
  if (isConfiguredResolvedHingeMate(value)) return { family: 'hinge' as const, ...measureConfiguredAssemblyHinge(snapshot, input, value, bands) }
  if (isConfiguredResolvedProfileCenterMate(value) || isConfiguredResolvedLinePathMate(value) || isConfiguredResolvedCircularPathMate(value)) return measureConfiguredAssemblyAdvanced(snapshot, input, value, bands)
  const unsupported: never = value
  throw Error('Unsupported configured physical relation: ' + String(unsupported))
}

/** Standalone final geometry gate for a complete candidate context. Owns a NEW
 * native snapshot, queries every placed active use (no intrinsic-state dedup),
 * and preserves unavailable passive winding as a rejecting diagnostic.
 * This does not solve, write back a configuration, or issue saved/Apply authority.
 * A native/currentness/release failure throws and withholds the whole report. */
export function verifyConfiguredAssemblyGeometry(input: AssemblyConfigurationGeometryInput, options: ConfiguredMeasurementOptions = {}) {
  const bands = configuredMeasurementBands(options)
  const snapshot = new AssemblyConfigurationGeometrySnapshot(input)
  let primary: { error: unknown } | undefined
  let result: ReturnType<typeof verified> | undefined
  function verified() {
    const active = intrinsicActive.call(snapshot, input)
    const passive = [intrinsicGears.call(snapshot, input, true), intrinsicScrews.call(snapshot, input, true), intrinsicRacks.call(snapshot, input, true)]
    const resolved = [...active, ...passive.flatMap(state => state.resolved)]
    const seen = new Set<string>()
    const reports = resolved.map(value => {
      const identity = key(value)
      if (seen.has(identity)) throw Error('A configured physical relation was selected twice in the same placed state.')
      seen.add(identity)
      return { key: identity, passive: value.suppressed, measurement: measure(snapshot, input, value, bands) }
    })
    const passiveUnavailable = passive.flatMap(state => state.unavailable).map(unavailable)
    // Earlier reports are provisional until the entire sequence has finished.
    // A later native call or reentrant context change invalidates every result.
    for (const value of resolved) authenticateConfiguredMeasurement(snapshot, input, value)
    intrinsicCurrent.call(snapshot, input)
    const status = passiveUnavailable.length ? 'references-unavailable' as const
      : reports.some(report => report.measurement.status === 'precisionLimit') ? 'precisionLimit' as const
        : reports.some(report => report.measurement.status === 'ok' && !report.measurement.satisfied) ? 'unsatisfied' as const : 'verified' as const
    const report = { status, accepted: status === 'verified', root: { id: input.document.id, revision: input.document.revision, configuration: input.rootConfiguration },
      generation: input.generation, bands: { ...bands }, reports, passiveUnavailable, verificationOnly: true as const }
    assertFiniteReport(report)
    intrinsicCurrent.call(snapshot, input)
    return freeze(report)
  }
  try { result = verified() } catch (error) { primary = { error } }
  try { intrinsicDispose.call(snapshot) } catch (cleanup) { throw new NativeCleanupError(primary, [cleanup], 'Configured verification or final native release failed.') }
  if (primary) throw primary.error
  return result!
}
export type ConfiguredAssemblyGeometryVerification = ReturnType<typeof verifyConfiguredAssemblyGeometry>
