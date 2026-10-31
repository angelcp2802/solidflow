import { assemblyDefinitionKey, validateAssemblyDocument, type AssemblyComponentReference,
  type AssemblyDefinition, type AssemblyDefinitionReference, type AssemblyDocument,
  type AssemblyOccurrence } from './assemblyDocument'
import { validateAssemblyMoveIntent } from './assemblyMovement'
import { composeRigidPoses, identityRigidPose, inverseRigidPose, validateRigidPose, type RigidPose } from './rigidPose'

export interface AssemblyWorldComponentMove {
  /** Complete path from the document root and exact selected definition tuple. */
  component: AssemblyComponentReference
  /** Absolute world placement of the selected component, not its root owner. */
  pose: RigidPose
}
export interface AssemblyWorldComponentMovePlan {
  component: AssemblyComponentReference
  /** Root rigid occurrence that carries the selection as a unit. */
  drivenComponent: AssemblyComponentReference
  scope: AssemblyDefinitionReference
  occurrenceId: string
  targetPose: RigidPose
  /** Detached original source, before a native solve derives the owner target. */
  document: AssemblyDocument
  affectedPaths: string[][]
}
export interface AssemblyDragFrame {
  readonly component: AssemblyComponentReference
  readonly drivenComponent: AssemblyComponentReference
  readonly worldPose: RigidPose
  readonly ownerPose: RigidPose
  readonly relativePose: RigidPose
  readonly visible: boolean
  readonly affectedPaths: string[][]
}
interface ResolvedComponent {
  document: AssemblyDocument
  component: AssemblyComponentReference
  owner: AssemblyOccurrence
  worldPose: RigidPose
  visible: boolean
}
function fail(message: string): never { throw new Error('Arrastre de componente: ' + message) }
function checkedComponent(component: AssemblyComponentReference): AssemblyComponentReference {
  return validateAssemblyMoveIntent({ component, pose: identityRigidPose() }).component
}
function resolve(current: AssemblyDocument, component: AssemblyComponentReference): ResolvedComponent {
  const document = validateAssemblyDocument(current), selected = checkedComponent(component)
  const definitions = new Map([document, ...document.definitions].map(value => [assemblyDefinitionKey(value), value]))
  let node: AssemblyDefinition = document, owner: AssemblyOccurrence | undefined
  let worldPose = identityRigidPose(), visible = true
  for (const id of selected.occurrencePath) {
    if (node.kind !== 'assembly') fail('la ruta atraviesa una pieza y no puede contener más ocurrencias.')
    const occurrence = node.occurrences.find(value => value.id === id)
    if (!occurrence) fail('la ocurrencia seleccionada ya no existe en la ruta indicada.')
    if (occurrence.suppressed) fail('no se puede arrastrar una ocurrencia suprimida ni un descendiente suyo.')
    owner ??= occurrence
    worldPose = composeRigidPoses(worldPose, occurrence.pose); visible &&= occurrence.visible
    const child = definitions.get(assemblyDefinitionKey(occurrence.definition))
    if (!child) fail('la revisión de definición de la ruta ya no existe.')
    node = child
  }
  if (!owner || assemblyDefinitionKey(node) !== assemblyDefinitionKey(selected.definition)) {
    fail('la revisión de definición seleccionada ya no coincide con la ruta actual.')
  }
  return { document, component: selected, owner, worldPose, visible }
}
function driven(owner: AssemblyOccurrence): AssemblyComponentReference {
  return { occurrencePath: [owner.id], definition: { ...owner.definition } }
}
function movable(owner: AssemblyOccurrence): void {
  if (owner.fixed) fail('la ocurrencia raíz que contiene la selección está fijada.')
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value) }
  return value
}

/** Exact declared graph placement only; fixed state does not forbid a query. */
export function assemblyComponentWorldPose(current: AssemblyDocument, component: AssemblyComponentReference): RigidPose {
  return validateRigidPose(resolve(current, component).worldPose)
}

/** Frozen detached intent frame. It supplies no native geometry or Apply proof. */
export function prepareAssemblyDragFrame(current: AssemblyDocument, component: AssemblyComponentReference): AssemblyDragFrame {
  const resolved = resolve(current, component); movable(resolved.owner)
  const ownerPose = validateRigidPose(resolved.owner.pose), worldPose = validateRigidPose(resolved.worldPose)
  return freeze({ component: resolved.component, drivenComponent: driven(resolved.owner), worldPose, ownerPose,
    relativePose: composeRigidPoses(inverseRigidPose(ownerPose), worldPose), visible: resolved.visible,
    affectedPaths: [[resolved.owner.id]] })
}

/**
 * A world target drives one root rigid occurrence. Child declarations and shared
 * definitions are not edited here; native preparation must solve child scopes
 * before deriving the owner target from the fresh selected relative placement.
 */
export function planAssemblyWorldComponentMove(current: AssemblyDocument, move: AssemblyWorldComponentMove): AssemblyWorldComponentMovePlan {
  const checked = validateAssemblyMoveIntent(move), resolved = resolve(current, checked.component)
  movable(resolved.owner)
  return { component: resolved.component, drivenComponent: driven(resolved.owner),
    scope: { id: resolved.document.id, revision: resolved.document.revision }, occurrenceId: resolved.owner.id,
    targetPose: checked.pose, document: resolved.document, affectedPaths: [[resolved.owner.id]] }
}
