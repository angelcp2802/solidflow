/** Document-owned presentation data. It grants no geometry or reference authority. */
export interface SavedCameraView {
  position: [number, number, number]
  target: [number, number, number]
  up: [number, number, number]
  top: number
  bottom: number
  zoom: number
  near: number
  far: number
}
export interface NamedView { id: string; name: string; view: SavedCameraView }

export const MAX_NAMED_VIEWS = 64
export const MAX_NAMED_VIEW_NAME_LENGTH = 80
export const MAX_SAVED_VIEW_COORDINATE = 1_000_000_000
const controls = /[\x00-\x1f\x7f-\x9f]/
const FLOAT32_MAX = 3.4028234663852886e38
// Leave room for four matrix terms and bounded world coordinates in GPU math.
const MAX_PROJECTION_COEFFICIENT = FLOAT32_MAX / (32 * 4 * MAX_SAVED_VIEW_COORDINATE)

/** Also used for the horizontal coefficient at the renderer's current aspect. */
export function isSavedViewProjectionCoefficient(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value) <= MAX_PROJECTION_COEFFICIENT && (value === 0 || Math.fround(value) !== 0)
}

function fail(path: string, message: string): never { throw Error(`${path}: ${message}`) }

function fields(value: unknown, required: string[], path: string): Record<string, PropertyDescriptor> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'se esperaba un objeto de datos')
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) fail(path, 'prototipo no válido')
  const descriptors = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(descriptors)
  if (keys.length !== required.length || required.some(key => !Object.hasOwn(descriptors, key))) fail(path, 'campos incompletos o desconocidos')
  for (const key of keys) {
    if (typeof key !== 'string' || !required.includes(key) || !('value' in descriptors[key]) || !descriptors[key].enumerable) fail(path, 'se esperaban campos de datos conocidos')
  }
  return descriptors
}

function arrayValues(value: unknown, maximum: number, path: string): unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum) fail(path, 'lista fuera de límites')
  const descriptors = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(descriptors)
  if (keys.length !== value.length + 1) fail(path, 'la lista debe ser densa y sin campos adicionales')
  const result: unknown[] = []
  for (let index = 0; index < value.length; index++) {
    const field = descriptors[String(index)]
    if (!field || !('value' in field) || !field.enumerable) fail(path, 'elemento de datos obligatorio')
    result.push(field.value)
  }
  return result
}

function coordinate(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > MAX_SAVED_VIEW_COORDINATE) fail(path, 'número finito fuera de límites')
  return value
}

function vector(value: unknown, path: string): [number, number, number] {
  const values = arrayValues(value, 3, path)
  if (values.length !== 3) fail(path, 'se esperaban tres coordenadas')
  return [coordinate(values[0], path), coordinate(values[1], path), coordinate(values[2], path)]
}

/** Creation normalizes names; imported declarations must already be canonical. */
export function normalizeNamedViewName(value: unknown): string {
  if (typeof value !== 'string') fail('Vista.name', 'se esperaba texto')
  const name = value.trim().normalize('NFC')
  if (!name || name.length > MAX_NAMED_VIEW_NAME_LENGTH || controls.test(name)) fail('Vista.name', 'nombre no válido (máximo 80 caracteres)')
  return name
}
/** Locale-independent simple lowercasing, shared by creation and persistence. */
export function namedViewNameKey(name: string): string { return normalizeNamedViewName(name).toLowerCase() }

export function validateSavedCameraView(value: unknown): SavedCameraView {
  const source = fields(value, ['position', 'target', 'up', 'top', 'bottom', 'zoom', 'near', 'far'], 'Vista.view')
  const position = vector(source.position.value, 'Vista.view.position'), target = vector(source.target.value, 'Vista.view.target'), up = vector(source.up.value, 'Vista.view.up')
  const top = coordinate(source.top.value, 'Vista.view.top'), bottom = coordinate(source.bottom.value, 'Vista.view.bottom')
  const near = coordinate(source.near.value, 'Vista.view.near'), far = coordinate(source.far.value, 'Vista.view.far'), zoom: unknown = source.zoom.value
  if (typeof zoom !== 'number' || !Number.isFinite(zoom) || zoom <= 0 || top <= bottom || near <= 0 || far <= near) fail('Vista.view', 'frustum o zoom no válido')
  // Reject overflow/underflow in projection and its inverse without imposing a
  // new arbitrary zoom ceiling on captures from the current orbit controls.
  const height = (top - bottom) / zoom, depth = far - near
  if (![height, 2 / height, depth, 2 / depth].every(number => Number.isFinite(number) && number > 0)) fail('Vista.view', 'proyección no representable')
  const center = (top + bottom) / 2, effectiveTop = center + height / 2, effectiveBottom = center - height / 2
  const effectiveHeight = effectiveTop - effectiveBottom
  const coefficients = [2 / effectiveHeight, -(effectiveTop + effectiveBottom) / effectiveHeight, -2 / depth, -(far + near) / depth]
  if (effectiveHeight <= 0 || !Number.isFinite(Math.fround(height)) || Math.fround(height) === 0 ||
      coefficients.some(number => !isSavedViewProjectionCoefficient(number))) fail('Vista.view', 'proyección fuera del rango gráfico')
  const direction = position.map((number, index) => number - target[index]), distance = Math.hypot(...direction), upLength = Math.hypot(...up)
  if (Math.fround(distance) === 0 || Math.abs(upLength - 1) > 1e-10) fail('Vista.view', 'dirección degenerada o vertical no unitaria')
  const [x, y, z] = direction.map(number => number / distance), [ux, uy, uz] = up.map(number => number / upLength)
  // A nonzero double can still underflow in the consumer's squared-length
  // normalization. Require a representable basis rather than accepting its
  // fallback orientation as if it were the saved pose.
  if (Math.fround(Math.hypot(y * uz - z * uy, z * ux - x * uz, x * uy - y * ux)) === 0) fail('Vista.view', 'dirección y vertical paralelas o base no representable')
  return { position, target, up, top, bottom, zoom, near, far }
}

export function validateNamedViews(value: unknown): NamedView[] {
  const entries = arrayValues(value, MAX_NAMED_VIEWS, 'Vistas'), ids = new Set<string>(), names = new Set<string>()
  return entries.map(entry => {
    const source = fields(entry, ['id', 'name', 'view'], 'Vista'), id: unknown = source.id.value, rawName: unknown = source.name.value
    if (typeof id !== 'string' || !id || id.length > 128 || id.trim() !== id || controls.test(id)) fail('Vista.id', 'identificador no válido')
    if (typeof rawName !== 'string' || rawName.length > MAX_NAMED_VIEW_NAME_LENGTH) fail('Vista.name', 'nombre no válido')
    const name = normalizeNamedViewName(rawName), key = namedViewNameKey(name)
    if (name !== rawName) fail('Vista.name', 'el nombre debe estar normalizado')
    if (ids.has(id) || names.has(key)) fail('Vistas', 'identificador o nombre duplicado')
    ids.add(id); names.add(key)
    return { id, name, view: validateSavedCameraView(source.view.value) }
  })
}
