import { cast, getOC, type Shape3D } from 'replicad'
import { assemblyDefinitionKey, expandAssemblyParts, validateAssemblyDocument, type AssemblyDocument, type AssemblyDefinition } from '../model/assemblyDocument'
import { rigidRotationMatrix, validateRigidPose } from '../model/rigidPose'
import { CadEngine } from './kernel.engine'
import { validateAssemblyShape } from './kernel.assembly-placements'
import { withNativeOwners } from './kernel.native-ownership'
import type { BodyReference } from './kernel.types'

export const MAX_ASSEMBLY_STEP_STRUCTURE_ENTRIES = 4096
export const MAX_ASSEMBLY_STEP_STRUCTURE_BYTES = 256 * 1024 * 1024
let nextFile = 0

/** AP242 definition/instance geometry only. Names and local proper placements
 * are exported, not mates, parametric history or persistent material/body IDs.
 * Hidden active occurrences participate; suppressed occurrences do not.
 */
export function exportAssemblyStepStructureNative(input: AssemblyDocument): Blob {
  const document = validateAssemblyDocument(input)
  const table = new Map<string, AssemblyDefinition>([document, ...document.definitions].map(d => [assemblyDefinitionKey(d), d]))
  const expanded = expandAssemblyParts(document)
  if (!expanded.length) throw Error('La exportación estructural necesita geometría activa.')
  const active = new Set<string>(), visiting = new Set<string>()
  let edges = 0
  const visit = (node: AssemblyDefinition): void => {
    const key = assemblyDefinitionKey(node)
    if (visiting.has(key)) throw Error('El grafo estructural contiene un ciclo.')
    if (active.has(key)) return
    if (active.size >= MAX_ASSEMBLY_STEP_STRUCTURE_ENTRIES) throw Error('La exportación estructural supera 4096 definiciones.')
    active.add(key); visiting.add(key)
    if (node.kind === 'assembly') {
      const children = node.occurrences.filter(o => !o.suppressed)
      if (!children.length) throw Error('Un subensamblaje activo no contiene geometría activa.')
      for (const occurrence of children) {
        if (++edges > MAX_ASSEMBLY_STEP_STRUCTURE_ENTRIES) throw Error('La exportación estructural supera 4096 instancias declaradas.')
        const child = table.get(assemblyDefinitionKey(occurrence.definition))
        if (!child) throw Error('Una definición estructural no está disponible.')
        visit(child)
      }
    }
    visiting.delete(key)
  }
  visit(document)
  const bytes = withNativeOwners(owners => {
    const oc = getOC()
    // The shipped constructor owns an intrusive document handle. All labels,
    // tools and writer wrappers are registered later and released before it.
    const format = owners.own(new oc.TCollection_ExtendedString('XmlXCAF', true))
    const native = owners.own(new oc.TDocStd_Document(format)), main = owners.own(native.Main())
    const tool = owners.own(oc.XCAFDoc_DocumentTool.ShapeTool(main))
    oc.XCAFDoc_DocumentTool.SetLengthUnit(native, .001)
    const naming = oc.XCAFDoc_ShapeTool.AutoNaming()
    owners.own({ delete: () => {
      oc.XCAFDoc_ShapeTool.SetAutoNaming(naming)
      if (oc.XCAFDoc_ShapeTool.AutoNaming() !== naming) throw Error('No se pudo restaurar el modo de nombres STEP.')
    } })
    oc.XCAFDoc_ShapeTool.SetAutoNaming(false)
    if (oc.XCAFDoc_ShapeTool.AutoNaming()) throw Error('No se pudo fijar el modo de nombres STEP.')
    const name = (label: ReturnType<typeof tool.NewShape>, text: string): void => {
      const value = owners.own(new oc.TCollection_ExtendedString(text, true))
      owners.own(oc.TDataStd_Name.Set(label, value))
    }
    const labels = new Map<string, ReturnType<typeof tool.NewShape>>()
    const prototypes = new Map<string, { engine: CadEngine; refs: (BodyReference | null)[]; solids: number }>()
    let prototypeEntries = 0, expandedEntries = 0, prototypeSolids = 0, expandedSolids = 0
    // Admit complete body inventories before copying any occurrence geometry.
    for (const occurrence of expanded) {
      const key = assemblyDefinitionKey(occurrence.definition)
      let prototype = prototypes.get(key)
      if (!prototype) {
        const engine = new CadEngine(); owners.own({ delete: () => engine.dispose() })
        const inventory = engine.rebuildForAssemblyReferences(occurrence.definition.document.features)
        if (inventory.featureErrors.length) throw Error('No se pudo reconstruir una pieza estructural.')
        const refs = inventory.kind === 'explicit' ? inventory.bodies.map(b => ({ ...b.ref })) : inventory.kind === 'legacy' ? [null] : []
        if (!refs.length) throw Error('Una pieza estructural activa no contiene sólidos.')
        prototypeEntries += refs.length
        if (prototypeEntries > MAX_ASSEMBLY_STEP_STRUCTURE_ENTRIES) throw Error('La exportación estructural supera 4096 cuerpos de prototipos.')
        prototype = { engine, refs, solids: 0 }; prototypes.set(key, prototype)
      }
      expandedEntries += prototype.refs.length
      if (expandedEntries > MAX_ASSEMBLY_STEP_STRUCTURE_ENTRIES) throw Error('La exportación estructural supera 4096 cuerpos expandidos.')
    }
    for (const [key, prototype] of prototypes) {
      const shapes = prototype.refs.map(ref => owners.own(prototype.engine.copyCurrentBodyShape(ref)))
      for (const shape of shapes) {
        const count = validateAssemblyShape(shape)
        prototype.solids += count; prototypeSolids += count
        if (prototypeSolids > MAX_ASSEMBLY_STEP_STRUCTURE_ENTRIES) throw Error('La exportación estructural supera 4096 sólidos de prototipos.')
      }
      let shape: Shape3D = shapes[0]
      if (shapes.length > 1) {
        const builder = owners.own(new oc.TopoDS_Builder()), raw = owners.own(new oc.TopoDS_Compound())
        builder.MakeCompound(raw)
        for (const body of shapes) builder.Add(raw, body.wrapped)
        shape = owners.own(cast(raw)).asShape3D()
        if (validateAssemblyShape(shape) !== prototype.solids) throw Error('El prototipo estructural perdió multiplicidad de sólidos.')
      }
      const label = owners.own(tool.AddShape(shape.wrapped, false, false))
      if (label.IsNull()) throw Error('No se pudo crear una definición STEP de pieza.')
      const definition = table.get(key)!
      name(label, definition.kind === 'part' ? definition.document.name : definition.name)
      labels.set(key, label)
    }
    for (const occurrence of expanded) {
      expandedSolids += prototypes.get(assemblyDefinitionKey(occurrence.definition))!.solids
      if (expandedSolids > MAX_ASSEMBLY_STEP_STRUCTURE_ENTRIES) throw Error('La exportación estructural supera 4096 sólidos expandidos.')
    }
    for (const key of active) {
      const node = table.get(key)!
      if (node.kind !== 'assembly') continue
      const label = owners.own(tool.NewShape())
      if (label.IsNull()) throw Error('No se pudo crear una definición STEP de ensamblaje.')
      name(label, node.name); labels.set(key, label)
    }
    for (const key of active) {
      const node = table.get(key)!
      if (node.kind !== 'assembly') continue
      const parent = labels.get(key)!
      for (const occurrence of node.occurrences) {
        if (occurrence.suppressed) continue
        const pose = validateRigidPose(occurrence.pose), r = rigidRotationMatrix(pose.rotation), t = pose.translation
        const transform = owners.own(new oc.gp_Trsf())
        transform.SetValues(r[0], r[1], r[2], t[0], r[3], r[4], r[5], t[1], r[6], r[7], r[8], t[2])
        if (transform.IsNegative() || !Number.isFinite(transform.ScaleFactor()) || Math.abs(transform.ScaleFactor() - 1) > 1e-10) throw Error('Una instancia estructural no es una isometría directa.')
        const location = owners.own(new oc.TopLoc_Location(transform))
        const instance = owners.own(tool.AddComponent(parent, labels.get(assemblyDefinitionKey(occurrence.definition))!, location))
        if (instance.IsNull()) throw Error('No se pudo crear una instancia STEP.')
        name(instance, occurrence.name)
      }
    }
    tool.UpdateAssemblies()
    const root = labels.get(assemblyDefinitionKey(document))!
    for (const [key, label] of labels) {
      if (oc.XCAFDoc_ShapeTool.IsFree(label) !== (label === root)) throw Error('El grafo STEP contiene una raíz libre adicional.')
      const node = table.get(key)!
      if (node.kind === 'assembly' && oc.XCAFDoc_ShapeTool.NbComponents(label, false) !== node.occurrences.filter(o => !o.suppressed).length) throw Error('El grafo STEP perdió instancias declaradas.')
    }
    const writer = owners.own(new oc.STEPCAFControl_Writer()); writer.SetNameMode(true)
    if (!writer.GetNameMode()) throw Error('El escritor STEP no confirmó nombres de producto.')
    for (const [key, value] of [['xstep.cascade.unit', 'MM'], ['write.step.unit', 'MM']] as const) {
      const previous = oc.Interface_Static.CVal(key)
      owners.own({ delete: () => { if (!oc.Interface_Static.SetCVal(key, previous)) throw Error('No se pudo restaurar una unidad STEP.') } })
      if (!oc.Interface_Static.SetCVal(key, value) || oc.Interface_Static.CVal(key).toUpperCase() !== value) throw Error('No se pudo fijar STEP en milímetros.')
    }
    for (const [key, value] of [['write.step.schema', 5], ['write.step.assembly', 1]] as const) {
      const previous = oc.Interface_Static.IVal(key)
      owners.own({ delete: () => { if (!oc.Interface_Static.SetIVal(key, previous)) throw Error('No se pudo restaurar una política STEP.') } })
      if (!oc.Interface_Static.SetIVal(key, value) || oc.Interface_Static.IVal(key) !== value) throw Error('No se pudo fijar la política STEP estructural.')
    }
    if (nextFile >= Number.MAX_SAFE_INTEGER) throw Error('Se agotaron las identidades temporales STEP.')
    const path = `/solidflow-structure-${++nextFile}.step`, baseline = new Set(oc.FS.readdir('/'))
    if (baseline.has(path.slice(1))) throw Error('La ruta temporal STEP ya está ocupada.')
    // The synchronous writer owns all files newly created during this call.
    // Unexpected external files reject the result and are still released.
    owners.own({ delete: () => {
      const failures: unknown[] = []
      for (const entry of oc.FS.readdir('/')) if (!baseline.has(entry)) {
        try { oc.FS.unlink('/' + entry) } catch (error) { failures.push(error) }
      }
      if (failures.length) throw new AggregateError(failures, 'No se pudieron liberar los archivos STEP.')
    } })
    const progress = owners.own(new oc.Message_ProgressRange())
    if (!writer.Perform(native, path, progress)) throw Error('La escritura STEP estructural no terminó.')
    const produced = oc.FS.readdir('/').filter((entry: string) => !baseline.has(entry))
    if (produced.length !== 1 || produced[0] !== path.slice(1)) throw Error('La exportación STEP requiere un solo archivo autónomo.')
    const size: unknown = oc.FS.stat(path).size
    if (typeof size !== 'number' || !Number.isSafeInteger(size) || size <= 0 || size > MAX_ASSEMBLY_STEP_STRUCTURE_BYTES) throw Error('La exportación STEP está vacía o supera 256 MiB.')
    const raw = oc.FS.readFile(path)
    if (raw.byteLength !== size) throw Error('Los bytes STEP están incompletos.')
    return new Uint8Array(raw)
  }, undefined, 'Assembly structural STEP export or release failed.')
  return new Blob([bytes], { type: 'application/step' })
}
