import { cast, getOC, type Shape3D } from 'replicad'
import { assemblyDefinitionKey, expandAssemblyParts, validateAssemblyDocument, type AssemblyDocument } from '../model/assemblyDocument'
import { CadEngine } from './kernel.engine'
import { placeAssemblyShape } from './kernel.assembly-placements'
import { withNativeOwners, type NativeOwners } from './kernel.native-ownership'
import type { BodyReference, CadExportFormat } from './kernel.types'

export const MAX_ASSEMBLY_EXPORT_BODY_ENTRIES = 4096
export const MAX_ASSEMBLY_EXPORT_SOLIDS = 4096
export const MAX_ASSEMBLY_EXPORT_BYTES = 256 * 1024 * 1024
const STL_TOLERANCE = .01, STL_ANGULAR_TOLERANCE = .08
let nextFile = 0

interface PrototypeBody { shape: Shape3D; solidCount: number }
interface Prototype { engine: CadEngine; references: (BodyReference | null)[]; bodies: PrototypeBody[] }

/** Count native occurrences, including coincident solids, without a unique-topology iterator. */
function countSolids(shape: Shape3D, maximum: number): number {
  return withNativeOwners(owners => {
    const oc = getOC(), explorer = owners.own(new oc.TopExp_Explorer(shape.wrapped, oc.TopAbs_ShapeEnum.TopAbs_SOLID, oc.TopAbs_ShapeEnum.TopAbs_SHAPE))
    let count = 0
    while (explorer.More()) {
      if (count >= maximum) throw new Error('La exportación supera 4096 sólidos expandidos.')
      withNativeOwners(local => {
        const raw = local.own(explorer.Current())
        if (raw.IsNull()) throw new Error('La exportación contiene un sólido nativo nulo.')
      }, undefined, 'Assembly export solid occurrence query or release failed.')
      count++; explorer.Next()
    }
    if (!count) throw new Error('La exportación necesita cuerpos con sólidos cerrados.')
    return count
  }, undefined, 'Assembly export solid count or release failed.')
}

/** Borrow every occurrence; unlike SDK makeCompound, this never consumes its wrappers. */
function compound(shapes: readonly Shape3D[], owners: NativeOwners): Shape3D {
  const oc = getOC(), builder = owners.own(new oc.TopoDS_Builder()), raw = owners.own(new oc.TopoDS_Compound())
  builder.MakeCompound(raw)
  for (const shape of shapes) builder.Add(raw, shape.wrapped)
  const result = owners.own(cast(raw)).asShape3D(), analyzer = owners.own(new oc.BRepCheck_Analyzer(result.wrapped, true, false, false))
  if (!analyzer.IsValid()) throw new Error('El agregado de exportación no es un BRep válido.')
  return result
}

function step(shape: Shape3D, path: string): void {
  withNativeOwners(owners => {
    const oc = getOC(), writer = owners.own(new oc.STEPControl_Writer())
    // The writer initializes the STEP statics. Restore each setting even if a
    // native transfer/query fails; millimetres must not depend on another export.
    for (const [name, value] of [['xstep.cascade.unit', 'MM'], ['write.step.unit', 'MM']] as const) {
      const previous = oc.Interface_Static.CVal(name)
      owners.own({ delete: () => { if (!oc.Interface_Static.SetCVal(name, previous)) throw new Error('No se pudo restaurar la unidad del escritor STEP.') } })
      if (!oc.Interface_Static.SetCVal(name, value) || oc.Interface_Static.CVal(name).toUpperCase() !== value) throw new Error('No se pudo fijar STEP en milímetros.')
    }
    for (const [name, value] of [['write.step.schema', 5], ['write.step.assembly', 0]] as const) {
      const previous = oc.Interface_Static.IVal(name)
      owners.own({ delete: () => { if (!oc.Interface_Static.SetIVal(name, previous)) throw new Error('No se pudo restaurar el modo del escritor STEP.') } })
      if (!oc.Interface_Static.SetIVal(name, value) || oc.Interface_Static.IVal(name) !== value) throw new Error('No se pudo fijar el modo STEP plano.')
    }
    const model = owners.own(writer.Model()), progress = owners.own(new oc.Message_ProgressRange())
    model.SetLocalLengthUnit(1); model.SetWriteLengthUnit(1)
    if (model.LocalLengthUnit() !== 1 || model.WriteLengthUnit() !== 1) throw new Error('El escritor STEP no confirmó milímetros.')
    if (writer.Transfer(shape.wrapped, oc.STEPControl_StepModelType.STEPControl_AsIs, true, progress) !== oc.IFSelect_ReturnStatus.IFSelect_RetDone) {
      throw new Error('La transferencia STEP de todos los sólidos no terminó.')
    }
    if (writer.Write(path) !== oc.IFSelect_ReturnStatus.IFSelect_RetDone) throw new Error('La escritura STEP no terminó.')
  }, undefined, 'Assembly STEP export or release failed.')
}

function write(shape: Shape3D, format: CadExportFormat): Uint8Array<ArrayBuffer> {
  return withNativeOwners(owners => {
    if (nextFile >= Number.MAX_SAFE_INTEGER) throw new Error('Se agotaron las identidades temporales de exportación.')
    const oc = getOC(), path = `/solidflow-assembly-export-${++nextFile}.${format}`
    // Register cleanup before the producer runs, including partial writes and
    // failed reads. A directory-query or unlink failure withholds the Blob.
    owners.own({ delete: () => { if (oc.FS.readdir('/').includes(path.slice(1))) oc.FS.unlink(path) } })
    if (format === 'step') step(shape, path)
    else {
      const mesh = owners.own(new oc.BRepMesh_IncrementalMesh(shape.wrapped, STL_TOLERANCE, false, STL_ANGULAR_TOLERANCE, false))
      if (!mesh.IsDone() || mesh.GetStatusFlags() !== 0) throw new Error('La triangulación STL del ensamblaje no terminó correctamente.')
      if (!oc.StlAPI.Write(shape.wrapped, path, false)) throw new Error('La escritura STL binaria no terminó.')
    }
    const size: unknown = oc.FS.stat(path).size
    if (typeof size !== 'number' || !Number.isSafeInteger(size) || size <= 0 || size > MAX_ASSEMBLY_EXPORT_BYTES) throw new Error('La exportación está vacía o supera 256 MiB.')
    const bytes = oc.FS.readFile(path)
    if (!bytes.byteLength || bytes.byteLength !== size || bytes.byteLength > MAX_ASSEMBLY_EXPORT_BYTES) throw new Error('Los bytes de exportación están incompletos o superan 256 MiB.')
    // Own an exact JavaScript byte snapshot before any native/file cleanup.
    return new Uint8Array(bytes)
  }, undefined, 'Assembly export file production or release failed.')
}

/**
 * Geometry-only flat export in millimetres. ALL active occurrences, including
 * hidden ones, retain every closed solid at its committed R*p+t placement.
 * No solve, fusion, mate validation, hierarchy or Apply authority is produced.
 */
export function exportAssemblyCadNative(input: AssemblyDocument, format: CadExportFormat): Blob {
  if (format !== 'step' && format !== 'stl') throw new Error('Formato de exportación de ensamblaje desconocido.')
  const document = validateAssemblyDocument(input)
  const bytes = withNativeOwners(owners => {
    const prototypes = new Map<string, Prototype>(), placed: Shape3D[] = [], occurrences = expandAssemblyParts(document)
    let prototypeEntries = 0, expandedEntries = 0, prototypeSolids = 0, expandedSolids = 0
    // Admit complete inventories before allocating occurrence copies. A late
    // invalid/empty part or exceeded body count rejects the whole document.
    for (const occurrence of occurrences) {
      const key = assemblyDefinitionKey(occurrence.definition)
      let prototype = prototypes.get(key)
      if (!prototype) {
        const engine = new CadEngine(); owners.own({ delete: () => engine.dispose() })
        const inventory = engine.rebuildForAssemblyReferences(occurrence.definition.document.features)
        if (inventory.featureErrors.length) throw new Error('No se pudo reconstruir la pieza para exportar: ' + inventory.featureErrors.map(error => error.message).join('; '))
        const references = inventory.kind === 'explicit' ? inventory.bodies.map(body => ({ ...body.ref })) : inventory.kind === 'legacy' ? [null] : []
        if (!references.length) throw new Error('Una pieza activa del ensamblaje no contiene cuerpos para exportar.')
        prototypeEntries += references.length
        if (prototypeEntries > MAX_ASSEMBLY_EXPORT_BODY_ENTRIES) throw new Error('La exportación supera 4096 entradas de cuerpo de prototipos.')
        prototype = { engine, references, bodies: [] }; prototypes.set(key, prototype)
      }
      expandedEntries += prototype.references.length
      if (expandedEntries > MAX_ASSEMBLY_EXPORT_BODY_ENTRIES) throw new Error('La exportación supera 4096 entradas de cuerpo expandidas.')
    }
    for (const prototype of prototypes.values()) {
      prototype.bodies = prototype.references.map(reference => {
        const shape = owners.own(prototype.engine.copyCurrentBodyShape(reference))
        const solidCount = countSolids(shape, MAX_ASSEMBLY_EXPORT_SOLIDS - prototypeSolids)
        prototypeSolids += solidCount
        return { shape, solidCount }
      })
    }
    for (const occurrence of occurrences) {
      const prototype = prototypes.get(assemblyDefinitionKey(occurrence.definition))!
      for (const body of prototype.bodies) {
        expandedSolids += body.solidCount
        if (expandedSolids > MAX_ASSEMBLY_EXPORT_SOLIDS) throw new Error('La exportación supera 4096 sólidos expandidos.')
      }
    }
    for (const occurrence of occurrences) {
      const prototype = prototypes.get(assemblyDefinitionKey(occurrence.definition))!
      for (const body of prototype.bodies) {
        placed.push(owners.own(placeAssemblyShape(body.shape, occurrence.worldPose)))
      }
    }
    if (!placed.length) throw new Error('El ensamblaje no contiene cuerpos activos para exportar.')
    const shape = compound(placed, owners)
    if (countSolids(shape, MAX_ASSEMBLY_EXPORT_SOLIDS) !== expandedSolids) throw new Error('El agregado de exportación no conserva todos los sólidos expandidos.')
    return write(shape, format)
  }, undefined, 'Assembly flat export or release failed.')
  // No bytes escape until prototypes, copies, placements, writers and files
  // have all completed cleanup. Native handles never enter the returned Blob.
  return new Blob([bytes], { type: format === 'step' ? 'application/step' : 'application/sla' })
}
