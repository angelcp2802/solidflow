import { cast, getOC, type Shape3D } from 'replicad'
import { MAX_ASSEMBLY_BYTES, serializeAssemblyDocument, validateAssemblyDocument, type AssemblyDefinition, type AssemblyDocument, type AssemblyOccurrence } from '../model/assemblyDocument'
import { createStepSource, decodeStepSource, MAX_STEP_BYTES, type StepSource } from '../model/stepSource'
import { sha256Bytes } from '../shared/sha256'
import { withNativeOwners } from './kernel.native-ownership'
import { importStepSolid } from './kernel.step'
import { readStepAssemblyStructure } from './kernel.step-structure'
import type { Feature } from './kernel.types'

let nextImport = 0

/** Produce an autonomous source-local base with explicit mm writer state. */
function partSource(shape: Shape3D): StepSource {
  return withNativeOwners(owners => {
    const oc = getOC(), writer = owners.own(new oc.STEPControl_Writer())
    for (const [key, value] of [['xstep.cascade.unit', 'MM'], ['write.step.unit', 'MM']] as const) {
      const previous = oc.Interface_Static.CVal(key)
      owners.own({ delete() { if (!oc.Interface_Static.SetCVal(key, previous)) throw Error('No se pudo restaurar la unidad STEP.') } })
      if (!oc.Interface_Static.SetCVal(key, value) || oc.Interface_Static.CVal(key).toUpperCase() !== value) throw Error('No se pudo fijar la unidad STEP.')
    }
    for (const [key, value] of [['write.step.schema', 5], ['write.step.assembly', 0]] as const) {
      const previous = oc.Interface_Static.IVal(key)
      owners.own({ delete() { if (!oc.Interface_Static.SetIVal(key, previous)) throw Error('No se pudo restaurar el modo STEP.') } })
      if (!oc.Interface_Static.SetIVal(key, value) || oc.Interface_Static.IVal(key) !== value) throw Error('No se pudo fijar el modo STEP de pieza.')
    }
    const model = owners.own(writer.Model()), progress = owners.own(new oc.Message_ProgressRange())
    model.SetLocalLengthUnit(1); model.SetWriteLengthUnit(1)
    if (model.LocalLengthUnit() !== 1 || model.WriteLengthUnit() !== 1) throw Error('El escritor no confirmó milímetros.')
    if (writer.Transfer(shape.wrapped, oc.STEPControl_StepModelType.STEPControl_AsIs, true, progress) !== oc.IFSelect_ReturnStatus.IFSelect_RetDone) throw Error('La transferencia de pieza STEP no terminó.')
    const path = `/solidflow-structure-part-${++nextImport}.step`
    if (oc.FS.readdir('/').includes(path.slice(1))) throw Error('La ruta temporal de pieza STEP ya existe.')
    owners.own({ delete() { if (oc.FS.readdir('/').includes(path.slice(1))) oc.FS.unlink(path) } })
    if (writer.Write(path) !== oc.IFSelect_ReturnStatus.IFSelect_RetDone) throw Error('La escritura de pieza STEP no terminó.')
    const size: unknown = oc.FS.stat(path).size
    if (typeof size !== 'number' || !Number.isSafeInteger(size) || size <= 0 || size > MAX_STEP_BYTES) throw Error('La pieza STEP importada supera 8 MiB.')
    const bytes = oc.FS.readFile(path)
    if (bytes.byteLength !== size) throw Error('Los bytes de pieza STEP están incompletos.')
    return createStepSource(new Uint8Array(bytes))
  }, undefined, 'Structural STEP part serialization or release failed.')
}

/**
 * Standalone native prerequisite: imports the explicitly admitted AP242 graph.
 * A product's separate closed solids stay in one part definition. Reuse,
 * names and local poses survive with autonomous explicit v1 body bases.
 * No external file, native handle, imported mate or original feature history is
 * retained. No workspace/worker capability is granted by this function.
 */
export function importAssemblyStepStructureNative(source: StepSource): AssemblyDocument {
  const bytes = decodeStepSource(source), graph = readStepAssemblyStructure(bytes)
  const root = graph.definitions.find(definition => definition.id === graph.root)
  if (!root || root.kind !== 'assembly') throw Error('STEP: se requiere una raíz de ensamblaje estructural.')
  for (const definition of graph.definitions) {
    const names = [definition.name, ...definition.occurrences.map(occurrence => occurrence.name)]
    if (names.some(name => !name.trim() || name.length > 200)) throw Error('STEP: los nombres de producto e instancia deben contener entre 1 y 200 caracteres.')
  }
  const baseCount = graph.definitions.reduce((sum, definition) => sum + definition.solids.length, 0)
  if (nextImport >= Number.MAX_SAFE_INTEGER - baseCount - 1) throw Error('Se agotaron las identidades temporales de importación.')
  const digest = sha256Bytes(bytes)
  // Rewriting autonomous bases and creation metadata can change their bytes.
  // A fresh import revision prevents different content aliasing the same tuple
  // when an unchanged source file is imported more than once.
  const prefix = `step-${digest.slice(0, 24)}`, revision = `step-${digest}-${crypto.randomUUID()}`, stamp = new Date().toISOString()
  const identity = (id: string) => `${prefix}-pd-${id}`
  const metadata = (definition: typeof root) => ({ id: identity(definition.id), revision, name: definition.name, createdAt: stamp, updatedAt: stamp })
  const occurrences = (definition: typeof root): AssemblyOccurrence[] => definition.occurrences.map(occurrence => ({
    id: `step-use-${occurrence.id}`, name: occurrence.name,
    definition: { id: identity(occurrence.definition), revision }, pose: occurrence.pose,
    fixed: false, suppressed: false, visible: true,
  }))
  return withNativeOwners(owners => {
    const oc = getOC(), path = `/solidflow-structure-import-${++nextImport}.step`
    if (oc.FS.readdir('/').includes(path.slice(1))) throw Error('La ruta temporal de ensamblaje STEP ya existe.')
    owners.own({ delete() { if (oc.FS.readdir('/').includes(path.slice(1))) oc.FS.unlink(path) } })
    oc.FS.writeFile(path, bytes)
    const reader = owners.own(new oc.STEPControl_Reader())
    if (reader.ReadFile(path) !== oc.IFSelect_ReturnStatus.IFSelect_RetDone) throw Error('STEP: el lector no pudo leer el ensamblaje completo.')
    reader.SetSystemLengthUnit(1)
    if (reader.SystemLengthUnit() !== 1) throw Error('STEP: no se pudo fijar la unidad de destino.')
    const model = owners.own(reader.StepModel()), indices = new Map<string, number>()
    const transferLabels = (definition: typeof root) => definition.solids.length > 1 ? definition.solids : [definition.representation]
    const wanted = new Set(graph.definitions.filter(definition => definition.kind === 'part').flatMap(transferLabels))
    const count = model.NbEntities()
    if (!Number.isSafeInteger(count) || count < 1 || count > 100_000) throw Error('STEP: inventario nativo fuera de límites.')
    for (let index = 1; index <= count; index++) withNativeOwners(local => {
      const entity = local.own(model.Entity(index)), label = String(model.IdentLabel(entity))
      if (!wanted.has(label)) return
      if (indices.has(label)) throw Error('STEP: identidad nativa de representación ambigua.')
      indices.set(label, index)
    })
    if (indices.size !== wanted.size) throw Error('STEP: faltan representaciones o sólidos de pieza en el lector nativo.')
    let sourceBytes = 0
    const definitions: AssemblyDefinition[] = []
    for (const definition of graph.definitions) {
      if (definition.id === root.id) continue
      if (definition.kind === 'assembly') {
        definitions.push({ kind: 'assembly', ...metadata(definition), occurrences: occurrences(definition), mates: [] })
        continue
      }
      const bodies = transferLabels(definition).map(label => withNativeOwners(local => {
        const entity = local.own(model.Entity(indices.get(label)!))
        reader.ClearShapes()
        if (!reader.TransferEntity(entity) || reader.NbShapes() !== 1) throw Error('STEP: transferencia incompleta de una definición local.')
        const raw = local.own(reader.Shape(1))
        if (raw.IsNull()) throw Error('STEP: una definición local no contiene geometría.')
        const shape = local.own(cast(raw)).asShape3D(), autonomous = partSource(shape)
        // A separate fresh reader applies the existing single-closed-solid,
        // no-loose-topology and positive-valid-BRep gates to the persisted base.
        local.own(importStepSolid(autonomous))
        sourceBytes += autonomous.data.length
        if (sourceBytes > MAX_ASSEMBLY_BYTES) throw Error('STEP: las bases importadas superan el límite de documento de 20 MiB.')
        // A Part 21 entity label identifies the admitted body assignment. It is
        // not a position in native topology enumeration or a geometric match.
        return { bodyId: `step-solid-${label}`, source: autonomous }
      }, undefined, 'Structural STEP local body transfer or release failed.'))
      const feature: Feature = bodies.length === 1
        ? { id: 'step-base', name: 'Base STEP importada', type: 'importedSolid', suppressed: false, source: bodies[0].source }
        : { id: 'step-base', name: 'Base STEP multicuerpo importada', type: 'importedBodies', suppressed: false, bodies }
      const id = identity(definition.id)
      definitions.push({ kind: 'part', id, revision, document: {
        version: 1, id, name: definition.name, units: 'mm', createdAt: stamp, updatedAt: stamp,
        features: [feature],
      } })
    }
    const document = validateAssemblyDocument({ version: 2, kind: 'assembly', units: 'mm', ...metadata(root), definitions, occurrences: occurrences(root), mates: [] })
    serializeAssemblyDocument(document) // Exact final UTF-8 JSON budget, including every autonomous base.
    return document
  }, undefined, 'Structural STEP assembly import or release failed.')
}
