import type { BodyPatternInstance, RepetitionFeature } from '../cad/kernel.types'

export const MAX_BODY_PATTERN_SLOTS = 8192
export const MAX_CREATED_BODY_IDS = 65536
const MAX_APPLICATIONS = 512
const identifier = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
  && value.length <= 128 && !/[\x00-\x1f\x7f]/.test(value)
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const exact = (value: Record<string, unknown>, fields: readonly string[]) => Object.keys(value).length === fields.length
  && fields.every(field => Object.hasOwn(value, field))
const dense = (value: unknown, minimum: number, maximum: number): value is unknown[] => Array.isArray(value)
  && value.length >= minimum && value.length <= maximum && Array.from({ length: value.length }, (_, index) => Object.hasOwn(value, index)).every(Boolean)
const ref = (value: unknown): value is { bodyId: string; sourceFeatureId: string } => object(value)
  && exact(value, ['bodyId', 'sourceFeatureId']) && identifier(value.bodyId) && identifier(value.sourceFeatureId)
const slotKey = (slot: Pick<BodyPatternInstance, 'seedBodyId' | 'address'>) => JSON.stringify([slot.seedBodyId, slot.address])

/** Full logical copy domain, including omitted positions and excluding the seed. */
export function bodyPatternAddresses(feature: RepetitionFeature): string[] {
  if (feature.type === 'mirror') return ['mirror']
  const count = (value: unknown, minimum: number): number => {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum || value > 256) throw new Error('El número de instancias debe ser entero y no superar 256.')
    return value
  }
  if (feature.type === 'circularPattern') return Array.from({ length: count(feature.count, 2) - 1 }, (_, index) => String(index + 1))
  const n = count(feature.first?.count, 1), m = feature.second === null ? 1 : count(feature.second?.count, 1)
  if (typeof feature.secondSeedOnly !== 'boolean') throw new Error('La distribución de la segunda dirección no es válida.')
  const total = feature.secondSeedOnly ? n + m - 1 : n * m
  if (total < 2 || total > 256) throw new Error('La matriz debe contener entre 2 y 256 instancias incluida la semilla.')
  const addresses: string[] = []
  for (let j = 0; j < m; j++) for (let i = 0; i < n; i++) {
    if ((!i && !j) || (feature.secondSeedOnly && i > 0 && j > 0)) continue
    addresses.push(`${i},${j}`)
  }
  return addresses
}

function canonicalAddress(feature: RepetitionFeature, value: unknown): value is string {
  if (feature.type === 'mirror') return value === 'mirror'
  if (typeof value !== 'string') return false
  const parts = feature.type === 'linearPattern' ? value.split(',') : [value]
  if (parts.length !== (feature.type === 'linearPattern' ? 2 : 1)) return false
  if (!parts.every(part => /^(0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255)) return false
  return feature.type === 'linearPattern' ? parts.some(part => Number(part) > 0) : Number(parts[0]) > 0
}

/** Validates raw declarations as well as parser-normalized saved features. Allocates nothing. */
export function validateBodyPatternDeclaration(feature: RepetitionFeature): void {
  const source = feature.source
  if (!object(source) || source.mode !== 'bodies') {
    if (Object.hasOwn(feature, 'bodyPattern') || feature.bodyPattern !== undefined) throw new Error('La operación explícita de repetición requiere fuentes de cuerpos explícitos.')
    return
  }
  if (!Object.hasOwn(feature, 'source') || !exact(source, ['mode', 'scope', 'bodies']) || (source.scope !== 'current' && source.scope !== 'historical')
    || !dense(source.bodies, 1, 32)) throw new Error('Selecciona entre 1 y 32 cuerpos explícitos con un ámbito válido.')
  const seeds = new Set<string>()
  for (const reference of source.bodies) {
    if (!ref(reference) || seeds.has(reference.bodyId)) throw new Error('Las semillas deben ser referencias exactas de cuerpos distintos.')
    seeds.add(reference.bodyId)
  }
  const addresses = bodyPatternAddresses(feature), domain = new Set(addresses)
  let omitted = 0
  if (feature.type !== 'mirror') {
    if (!dense(feature.skipped, 0, addresses.length)) throw new Error('La lista de instancias omitidas no es válida.')
    const seen = new Set<string>()
    for (const skip of feature.skipped) {
      const key = feature.type === 'linearPattern'
        ? Array.isArray(skip) && skip.length === 2 && Object.hasOwn(skip, 0) && Object.hasOwn(skip, 1)
          && skip.every(value => Number.isInteger(value)) ? `${skip[0]},${skip[1]}` : ''
        : typeof skip === 'number' && Number.isInteger(skip) ? String(skip) : ''
      if (!domain.has(key) || seen.has(key)) throw new Error('La lista de omisiones contiene una instancia inexistente o duplicada.')
      seen.add(key)
    }
    omitted = seen.size
  }
  if (!addresses.length || omitted === addresses.length) throw new Error('Debe quedar al menos una copia activa.')
  if ((addresses.length - omitted) * seeds.size > MAX_APPLICATIONS) throw new Error('La repetición supera el límite de 512 aplicaciones de semillas.')
  const operation = feature.bodyPattern
  if (!Object.hasOwn(feature, 'bodyPattern') || !object(operation)) throw new Error('Las fuentes explícitas requieren una operación de repetición explícita propia.')
  if (operation.mode === 'merge') {
    if (!exact(operation, ['mode', 'target']) || !ref(operation.target)) throw new Error('Selecciona un objetivo exacto para añadir las copias.')
  } else if (operation.mode === 'new') {
    if (!exact(operation, ['mode', 'instances']) || !dense(operation.instances, 1, MAX_BODY_PATTERN_SLOTS)) throw new Error('El registro de salidas de la repetición no es válido o supera 8192 posiciones.')
    const ids = new Set<string>(), active = new Set<string>()
    for (const value of operation.instances) {
      if (!object(value) || !exact(value, ['seedBodyId', 'address', 'bodyId', 'retired'])
        || !identifier(value.seedBodyId) || !identifier(value.bodyId) || !canonicalAddress(feature, value.address)
        || typeof value.retired !== 'boolean' || ids.has(value.bodyId)) throw new Error('El registro contiene una salida no válida o un identificador duplicado.')
      ids.add(value.bodyId)
      if (!value.retired) {
        const key = slotKey(value as unknown as BodyPatternInstance)
        if (!seeds.has(value.seedBodyId) || !domain.has(value.address) || active.has(key)) throw new Error('La salida activa no corresponde a una única semilla y posición.')
        active.add(key)
      }
    }
    for (const seedBodyId of seeds) for (const address of addresses) {
      if (!active.has(slotKey({ seedBodyId, address }))) throw new Error('Falta una salida persistida para una semilla y posición, incluso si está omitida.')
    }
  } else throw new Error('Modo de salida de repetición desconocido.')
  if (feature.type === 'mirror' && feature.mergeBodies !== (operation.mode === 'merge')) throw new Error('La fusión de simetría debe coincidir con su operación explícita.')
}

/**
 * Reconciles an editable proposal; only this command boundary may allocate IDs.
 * A committed baseline distinguishes durable retirement from a temporary draft
 * edit. Saved retired slots never revive; surviving saved slots keep their IDs.
 */
export function reconcileBodyPatternDraft(feature: RepetitionFeature, allocator: () => string = () => crypto.randomUUID(), committed?: RepetitionFeature): RepetitionFeature {
  const next = structuredClone(feature)
  if (next.source.mode !== 'bodies' || next.bodyPattern?.mode !== 'new') return next
  const seeds = new Set(next.source.bodies.map(reference => reference.bodyId)), addresses = bodyPatternAddresses(next), domain = new Set(addresses)
  let instances: BodyPatternInstance[]
  if (committed) {
    if (committed.id !== next.id || committed.type !== next.type || committed.source.mode !== 'bodies' || committed.bodyPattern?.mode !== 'new') {
      throw new Error('La base guardada no corresponde a esta repetición de cuerpos nuevos.')
    }
    const saved = committed.bodyPattern.instances, editable = next.bodyPattern.instances
    if (editable.length < saved.length || saved.some((slot, index) => {
      const current = editable[index]
      return !current || slot.bodyId !== current.bodyId || slot.seedBodyId !== current.seedBodyId || slot.address !== current.address
    })) throw new Error('El registro editable no conserva los identificadores y posiciones de su base guardada.')
    instances = saved.map(slot => ({ ...slot,
      retired: slot.retired || !seeds.has(slot.seedBodyId) || !domain.has(slot.address) }))
    const surviving = new Set(instances.filter(slot => !slot.retired).map(slotKey))
    // Only the saved prefix is durable. Uncommitted additions can disappear or
    // be deduplicated when correcting a draft, before any history entry exists.
    for (const slot of editable.slice(saved.length)) {
      const key = slotKey(slot)
      if (!seeds.has(slot.seedBodyId) || !domain.has(slot.address) || surviving.has(key)) continue
      instances.push({ ...slot, retired: false }); surviving.add(key)
    }
  } else {
    instances = next.bodyPattern.instances.map(slot => ({ ...slot,
      retired: slot.retired || !seeds.has(slot.seedBodyId) || !domain.has(slot.address) }))
  }
  const existing = new Set(instances.filter(slot => !slot.retired).map(slotKey)), ids = new Set(instances.map(slot => slot.bodyId))
  for (const reference of next.source.bodies) for (const address of addresses) {
    const key = slotKey({ seedBodyId: reference.bodyId, address })
    if (existing.has(key)) continue
    if (instances.length >= MAX_BODY_PATTERN_SLOTS) throw new Error('La repetición supera 8192 posiciones guardadas, incluidas las retiradas.')
    const bodyId = allocator()
    if (!identifier(bodyId) || ids.has(bodyId)) throw new Error('El asignador debe producir un identificador de cuerpo nuevo y válido.')
    ids.add(bodyId); existing.add(key)
    instances.push({ seedBodyId: reference.bodyId, address, bodyId, retired: false })
  }
  next.bodyPattern = { mode: 'new', instances }
  return next
}
