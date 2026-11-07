import type { CadResult, Feature } from '../cad/kernel.types'
import { validateDocument, type Document } from './document'
import { captureOwnDataRecord } from './ownDataRecord'

/** One uniform material and opaque colour per saved part, shared by its uses. */
export interface PartMaterial { name: string; densityKgPerM3: number }
export interface PartAppearance { color: string }
export interface PartProperties { material?: PartMaterial; appearance?: PartAppearance }

export const MAX_PART_MATERIAL_NAME_LENGTH = 80
export const MAX_PART_DENSITY_KG_PER_M3 = 1_000_000
const controls = /[\x00-\x1f\x7f-\x9f]/

/** Creation may normalize a name; persisted declarations must be canonical. */
export function normalizePartMaterialName(value: unknown): string {
  if (typeof value !== 'string') throw Error('Material.name: se esperaba texto.')
  const name = value.trim().normalize('NFC')
  if (!name || name.length > MAX_PART_MATERIAL_NAME_LENGTH || controls.test(name)) {
    throw Error('Material.name: nombre no válido (máximo 80 caracteres y sin controles).')
  }
  return name
}

export function validatePartMaterial(value: unknown): PartMaterial {
  const fields = captureOwnDataRecord(value, ['name', 'densityKgPerM3'], undefined, 'Material')
  const rawName = fields.get('name'), name = normalizePartMaterialName(rawName)
  if (rawName !== name) throw Error('Material.name: el nombre debe estar normalizado y sin espacios exteriores.')
  const density = fields.get('densityKgPerM3')
  if (typeof density !== 'number' || !Number.isFinite(density) || density <= 0 || density > MAX_PART_DENSITY_KG_PER_M3) {
    throw Error('Material.densityKgPerM3: se esperaba una densidad finita mayor que cero y no superior a 1000000 kg/m³.')
  }
  return { name, densityKgPerM3: density }
}

export function validatePartAppearance(value: unknown): PartAppearance {
  const fields = captureOwnDataRecord(value, ['color'], undefined, 'Apariencia'), color = fields.get('color')
  if (typeof color !== 'string' || color.length !== 7 || !/^#[0-9a-fA-F]{6}$/.test(color)) {
    throw Error('Apariencia.color: se esperaba un color opaco #RRGGBB.')
  }
  return { color }
}

/** Absence means unassigned material / the existing default blue. */
export function validatePartProperties(value: unknown): PartProperties {
  const fields = captureOwnDataRecord(value, ['material', 'appearance'], [], 'Propiedades de pieza')
  const properties: PartProperties = {}
  if (fields.has('material')) properties.material = validatePartMaterial(fields.get('material'))
  if (fields.has('appearance')) properties.appearance = validatePartAppearance(fields.get('appearance'))
  return properties
}

/** Return a validated, detached candidate for one DocumentHistory.apply call.
 * Cloning features intentionally invalidates native-build identity: an embedded
 * editor must produce a fresh ready witness before committing this document. */
export function setPartProperties(document: Document, properties: PartProperties): Document {
  const current = validateDocument(document), next = validatePartProperties(properties)
  const previous: PartProperties = {}
  if (current.material) previous.material = current.material
  if (current.appearance) previous.appearance = current.appearance
  if (JSON.stringify(previous) === JSON.stringify(next)) return current
  delete current.material
  delete current.appearance
  const now = new Date().toISOString()
  return validateDocument({ ...current, ...next, updatedAt: now < current.updatedAt ? current.updatedAt : now })
}

export interface PartMassNativeState {
  model: CadResult | null
  builtFeatures: readonly Feature[] | null
  busy: boolean
  sourceLoading: boolean
  editing: boolean
  staged: boolean
}

/** Display-only mass, never saved geometry or reference authority. The caller
 * supplies the full committed model, not an editor's rollback/prefix scene. */
export function partMassKg(document: Document, native: PartMassNativeState): number | null {
  if (!document.material || !native.model || native.busy || native.sourceLoading || native.editing || native.staged
    || native.builtFeatures !== document.features || native.model.featureErrors.length) return null
  const material = validatePartMaterial(document.material), volume = native.model.volume
  if (!Number.isFinite(volume) || volume < 0) return null
  const mass = volume / 1_000_000_000 * material.densityKgPerM3
  return Number.isFinite(mass) && (volume === 0 || mass > 0) ? mass : null
}
