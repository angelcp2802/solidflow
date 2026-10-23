import { assemblyDefinitionKey, assemblyOccurrencePathKey, validateAssemblyDocument,
  type AssemblyComponentReference, type AssemblyDefinition, type AssemblyDefinitionReference,
  type AssemblyDocument } from './assemblyDocument'
import { applyAssemblyEdit } from './assemblyEditing'
import { assemblySourceScopePaths } from './assemblySourceUpdates'
import { validateRigidPose, type RigidPose } from './rigidPose'

export interface AssemblyComponentMove {
  /** Complete occurrence path from the document root, not a display name. */
  component: AssemblyComponentReference
  /** Absolute local placement relative to the selected declaration's container. */
  pose: RigidPose
}
export interface AssemblyComponentMovePlan {
  component: AssemblyComponentReference
  scope: AssemblyDefinitionReference
  occurrenceId: string
  pose: RigidPose
  document: AssemblyDocument
  /** All actual expansions of this declaration, including suppressed ones. */
  affectedPaths: string[][]
}

function fail(message: string): never { throw new Error('Movimiento de componente: ' + message) }
function record(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('se esperaba un objeto de datos.')
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) fail('prototipo no válido.')
  const result: Record<string, unknown> = Object.create(null)
  for (const field of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, field)!
    if (typeof field !== 'string' || !fields.includes(field) || !descriptor.enumerable || !('value' in descriptor)) {
      fail('solo se admiten los campos de datos enumerables declarados.')
    }
    result[field] = descriptor.value
  }
  if (fields.some(field => !Object.hasOwn(result, field))) fail('faltan campos obligatorios.')
  return result
}
function identifier(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 128 || /[\x00-\x1f\x7f]/.test(value)) fail('identificador no válido.')
  return value
}
/** Strict detached syntax only; the pose's reference frame is supplied by its caller. */
export function validateAssemblyMoveIntent(value: unknown): AssemblyComponentMove {
  const move = record(value, ['component', 'pose']), component = record(move.component, ['occurrencePath', 'definition'])
  // The shared path boundary checks dense plain arrays, descriptors, identifiers
  // and the graph depth cap without invoking user accessors or serializers.
  const path = assemblyOccurrencePathKey(component.occurrencePath as readonly string[])
  if (path === '[]') fail('la ruta completa de ocurrencia no puede estar vacía.')
  const definition = record(component.definition, ['id', 'revision']), pose = record(move.pose, ['translation', 'rotation'])
  for (const field of ['translation', 'rotation']) {
    if (!Array.isArray(pose[field]) || Object.getPrototypeOf(pose[field]) !== Array.prototype) fail('las coordenadas deben ser listas de datos sin otro prototipo.')
  }
  return { component: { occurrencePath: JSON.parse(path) as string[],
    definition: { id: identifier(definition.id), revision: identifier(definition.revision) } },
  pose: validateRigidPose(pose, 'Movimiento.pose') }
}

/**
 * Detached declaration edit only. It does not solve relations or authorize a
 * native Apply. A shared containing definition edits all its actual expansions;
 * fixed ancestors do not make their independently movable children fixed.
 */
export function planAssemblyComponentMove(current: AssemblyDocument, move: AssemblyComponentMove): AssemblyComponentMovePlan {
  const document = validateAssemblyDocument(current), checked = validateAssemblyMoveIntent(move)
  const definitions = new Map([document, ...document.definitions].map(value => [assemblyDefinitionKey(value), value]))
  let node: AssemblyDefinition = document
  for (let index = 0; index < checked.component.occurrencePath.length; index++) {
    if (node.kind !== 'assembly') fail('la ruta atraviesa una pieza y no puede contener más ocurrencias.')
    const occurrenceId = checked.component.occurrencePath[index], occurrence = node.occurrences.find(value => value.id === occurrenceId)
    if (!occurrence) fail('la ocurrencia seleccionada ya no existe en la ruta indicada.')
    if (occurrence.suppressed) fail('no se puede mover una ocurrencia suprimida ni un descendiente suyo.')
    if (index === checked.component.occurrencePath.length - 1) {
      if (assemblyDefinitionKey(occurrence.definition) !== assemblyDefinitionKey(checked.component.definition)) {
        fail('la revisión de definición seleccionada ya no coincide con la ruta actual.')
      }
      if (occurrence.fixed) fail('la ocurrencia seleccionada está fijada en su ensamblaje.')
      const scope = { id: node.id, revision: node.revision }
      const affectedPaths = assemblySourceScopePaths(document, scope).map(prefix => [...prefix, occurrenceId])
      const next = applyAssemblyEdit(document, { type: 'set-occurrence-pose', scope, occurrenceId, pose: checked.pose })
      return { component: checked.component, scope, occurrenceId, pose: checked.pose, document: next, affectedPaths }
    }
    const child = definitions.get(assemblyDefinitionKey(occurrence.definition))
    if (!child) fail('la revisión de definición de la ruta ya no existe.')
    node = child
  }
  return fail('la ruta completa de ocurrencia no puede estar vacía.')
}
