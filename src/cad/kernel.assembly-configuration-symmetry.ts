import type { Vec3 } from './kernel.types'
import type { AssemblyConfigurationGeometryInput, AssemblyConfigurationGeometrySnapshot, AssemblyConfigurationWitness } from './kernel.assembly-configuration-snapshot'
import type { ConfiguredResolvedSymmetryMate } from './kernel.assembly-configuration-relations'
import { measureSymmetrySupports, type SymmetryMeasuredSupport } from '../model/assemblySymmetryMeasurement'
import {
  authenticateConfiguredMeasurement, configuredMeasurementBands, measureConfiguredSupport,
  metadataConfiguredMeasurement, ConfiguredMeasurementPrecisionError,
  type ConfiguredMeasurementOptions,
} from './kernel.assembly-configuration-measurement'

export type ConfiguredAssemblySymmetryOptions = ConfiguredMeasurementOptions
function measured(snapshot: AssemblyConfigurationGeometrySnapshot, input: AssemblyConfigurationGeometryInput,
  witness: AssemblyConfigurationWitness, kind: ConfiguredResolvedSymmetryMate['mate']['entityKind'], origin: Vec3): SymmetryMeasuredSupport {
  // Compound shape or shared analytic values cannot substitute for a positional
  // purpose. In particular a direction witness never supplies a line location.
  const purpose = kind === 'point' ? witness.kind === 'configured-point'
    : kind === 'sphere' ? witness.kind === 'configured-sphere-surface'
      : kind === 'cylinder' ? witness.kind === 'configured-cylinder-surface'
        : kind === 'plane' ? witness.kind === 'configured-plane' || witness.kind === 'configured-support' && witness.localSupport.kind === 'plane'
          : witness.kind === 'configured-support' && (witness.localSupport.kind === 'line' || witness.localSupport.kind === 'cylinder')
  if (!purpose) throw Error('The configured Symmetry role has a foreign native purpose.')
  const value = measureConfiguredSupport(snapshot, input, witness, origin)
  const base = { pointMm: value.pointMm, positionErrorMm: value.positionErrorMm }
  if (kind === 'point' && value.kind === 'point') return { ...base, kind }
  if (kind === 'sphere' && value.kind === 'sphere-surface' && value.radiusMm !== null && value.radiusErrorMm !== null)
    return { ...base, kind, radiusMm: value.radiusMm, radiusErrorMm: value.radiusErrorMm }
  if (kind === 'plane' && value.kind === 'plane' && value.direction && value.directionErrorRad !== null)
    return { ...base, kind, normal: value.direction, directionErrorRad: value.directionErrorRad }
  if (kind === 'line' && (value.kind === 'line' || value.kind === 'cylinder') && value.direction && value.directionErrorRad !== null)
    return { ...base, kind, axis: value.direction, directionErrorRad: value.directionErrorRad }
  if (kind === 'cylinder' && value.kind === 'cylinder-surface' && value.direction && value.directionErrorRad !== null && value.radiusMm !== null && value.radiusErrorMm !== null)
    return { ...base, kind, axis: value.direction, directionErrorRad: value.directionErrorRad, radiusMm: value.radiusMm, radiusErrorMm: value.radiusErrorMm }
  throw Error('The configured Symmetry analytic support does not match its declared family.')
}
/** Three current positional purposes and independent physical reflection.
 * Pure support comparison supplies no solver/proof authority. Native topological
 * envelopes never widen the requested bands; the caller owns the snapshot. */
export function measureConfiguredAssemblySymmetry(snapshot: AssemblyConfigurationGeometrySnapshot, input: AssemblyConfigurationGeometryInput,
  value: ConfiguredResolvedSymmetryMate, options: ConfiguredAssemblySymmetryOptions = {}) {
  const bands = configuredMeasurementBands(options)
  authenticateConfiguredMeasurement(snapshot, input, value)
  if (value.mate.type !== 'symmetry') throw Error('An actual configured Symmetry aggregate is required.')
  const base = { ...metadataConfiguredMeasurement(value), family: 'symmetry' as const,
    entityKind: value.mate.entityKind, alignment: value.mate.alignment, bands,
    componentPaths: { source: [...value.source.componentPath], target: [...value.target.componentPath], mirror: [...value.mirror.componentPath] } }
  try {
    if (value.mirror.kind !== 'configured-plane' || value.mirror.localSupport.kind !== 'plane') throw Error('The configured Symmetry mirror requires its positional plane purpose.')
    const origin: Vec3 = [...value.mirror.declaredWorldPose.translation]
    const a = measured(snapshot, input, value.source, value.mate.entityKind, origin)
    const b = measured(snapshot, input, value.target, value.mate.entityKind, origin)
    const mirror = measured(snapshot, input, value.mirror, 'plane', origin)
    if (mirror.kind !== 'plane') throw Error('The configured Symmetry mirror is not planar.')
    const result = measureSymmetrySupports(a, b, mirror, value.mate.alignment, bands.lengthToleranceMm, bands.angleToleranceRad)
    if (result.status === 'precisionLimit') {
      authenticateConfiguredMeasurement(snapshot, input, value)
      return { ...base, status: 'precisionLimit' as const, satisfied: false, positionResidualMm: null, angleRadians: null, radiusDifferenceMm: null,
        uncertainty: { positionMm: null, angleRad: null, radiusMm: null }, message: result.message }
    }
    const outside = result.positionErrorMm - result.uncertainty.positionMm > bands.lengthToleranceMm
      || (result.angleRadians !== null && result.angleRadians - result.uncertainty.angleRad! > bands.angleToleranceRad)
      || (result.radiusDifferenceMm !== null && Math.abs(result.radiusDifferenceMm) - result.uncertainty.radiusMm! > bands.lengthToleranceMm)
    const retained = result.positionErrorMm + result.uncertainty.positionMm <= bands.lengthToleranceMm
      && (result.angleRadians === null || result.angleRadians + result.uncertainty.angleRad! <= bands.angleToleranceRad)
      && (result.radiusDifferenceMm === null || Math.abs(result.radiusDifferenceMm) + result.uncertainty.radiusMm! <= bands.lengthToleranceMm)
    // Both sides of the boundary use the retained envelope: nominally
    // outside but overlapping is indeterminate, not a definite failure.
    const precise = retained || outside
    authenticateConfiguredMeasurement(snapshot, input, value)
    return { ...base, status: precise ? 'ok' as const : 'precisionLimit' as const, satisfied: precise && retained,
      positionResidualMm: result.positionErrorMm, angleRadians: result.angleRadians, radiusDifferenceMm: result.radiusDifferenceMm,
      uncertainty: { ...result.uncertainty }, ...(!precise ? { message: 'Configured Symmetry uncertainty consumes the remaining requested band.' } : {}) }
  } catch (error) {
    if (!(error instanceof ConfiguredMeasurementPrecisionError)) throw error
    authenticateConfiguredMeasurement(snapshot, input, value)
    return { ...base, status: 'precisionLimit' as const, satisfied: false, positionResidualMm: null, angleRadians: null, radiusDifferenceMm: null,
      uncertainty: { positionMm: null, angleRad: null, radiusMm: null }, message: error.message }
  }
}
export type ConfiguredAssemblySymmetryMeasurement = ReturnType<typeof measureConfiguredAssemblySymmetry>
