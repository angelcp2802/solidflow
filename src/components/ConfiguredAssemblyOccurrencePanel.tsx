import { assemblyDefinitionKey } from '../model/assemblyDocument'
import type { AssemblyConfiguredDocument } from '../model/assemblyConfiguredDocument'
import { evaluateAssemblyConfiguration } from '../model/assemblyConfigurationCore'
import { validateAssemblyConfiguredOccurrenceEdit, type AssemblyConfiguredOccurrenceEdit } from '../model/assemblyConfiguredOccurrenceEditing'
import { parseCadDocument } from '../model/cadDocument'
import { identityRigidPose } from '../model/rigidPose'

export interface ConfiguredOccurrenceFields { name: string; fixed: boolean; definition: string; configuration: string; partRevision: string; position: [string, string, string] }
export const initialConfiguredOccurrenceFields = (): ConfiguredOccurrenceFields => ({ name: 'Componente', fixed: false, definition: '', configuration: '', partRevision: 'r1', position: ['0', '0', '0'] })
function insertionPose(fields: ConfiguredOccurrenceFields) {
  const position = fields.position.map(value => { if (!value.trim() || !Number.isFinite(Number(value))) throw Error('Escribe coordenadas de inserción finitas.'); return Number(value) })
  return { ...identityRigidPose(), translation: [position[0], position[1], position[2]] as [number, number, number] }
}
export function configuredOccurrenceUiIntent(document: AssemblyConfiguredDocument, scopePath: readonly string[], change: AssemblyConfiguredOccurrenceEdit['change']): AssemblyConfiguredOccurrenceEdit {
  const scope = evaluateAssemblyConfiguration(document.source, document.catalog, document.rootConfiguration).scopes.find(row => JSON.stringify(row.path) === JSON.stringify(scopePath))
  if (!scope || scope.suppressed) throw Error('Selecciona un ámbito activo para editar componentes.')
  return validateAssemblyConfiguredOccurrenceEdit({ scopePath: [...scopePath], definition: { ...scope.definition }, configuration: scope.configuration, change })
}
export function configuredOccurrenceImportIntent(document: AssemblyConfiguredDocument, scopePath: readonly string[], fields: ConfiguredOccurrenceFields, content: string): AssemblyConfiguredOccurrenceEdit {
  const source = parseCadDocument(content)
  return configuredOccurrenceUiIntent(document, scopePath, { kind: 'insert', source, partRevision: source.version === 1 ? fields.partRevision : null, name: fields.name, pose: insertionPose(fields), fixed: fields.fixed })
}
export function configuredOccurrenceReuseIntent(document: AssemblyConfiguredDocument, scopePath: readonly string[], fields: ConfiguredOccurrenceFields): AssemblyConfiguredOccurrenceEdit {
  const definition = document.source.definitions.find(row => assemblyDefinitionKey(row) === fields.definition)
  if (!definition) throw Error('Selecciona una definición registrada actual.')
  return configuredOccurrenceUiIntent(document, scopePath, { kind: 'reuse', definition: { id: definition.id, revision: definition.revision }, configuration: fields.configuration || null, name: fields.name, pose: insertionPose(fields), fixed: fields.fixed })
}
export default function ConfiguredAssemblyOccurrencePanel(props: {
  document: AssemblyConfiguredDocument; scopePath: readonly string[]; configuration: string | null; fields: ConfiguredOccurrenceFields; disabled: boolean
  onChange: (fields: ConfiguredOccurrenceFields) => void; onImport: () => void; onReuse: () => void
}) {
  const { document, fields, disabled } = props
  const definition = document.source.definitions.find(row => assemblyDefinitionKey(row) === fields.definition)
  const variants = definition?.kind === 'assembly' ? document.catalog.find(row => assemblyDefinitionKey(row.definition) === fields.definition)?.configurations ?? [] : []
  return <section aria-label="Componentes del estado configurado">
    <h2>Insertar componente</h2>
    <p>Ámbito: {props.scopePath.join(' / ') || 'Raíz'} · Estado: {props.configuration ?? 'Base'}. Los usos de esta misma definición y estado comparten el cambio.</p>
    <p>{props.configuration === null ? 'La inserción en Base se hereda por los estados nombrados.' : 'La nueva ocurrencia queda suprimida en Base y activa en este estado; otros estados conservan su supresión heredada.'} Las coordenadas de inserción son relativas al padre. Fijado significa inmóvil respecto al padre, no respecto al mundo.</p>
    <label>Nombre<input aria-label="Nombre del componente configurado" value={fields.name} disabled={disabled} onChange={e => props.onChange({ ...fields, name: e.target.value })} /></label>
    <label><input type="checkbox" aria-label="Insertar componente fijado" checked={fields.fixed} disabled={disabled} onChange={e => props.onChange({ ...fields, fixed: e.target.checked })} />Fijar respecto al padre</label>
    {(['X', 'Y', 'Z'] as const).map((axis, index) => <label key={axis}>Inserción {axis}<input type="number" step="any" aria-label={'Inserción ' + axis + ' en mm'} value={fields.position[index]} disabled={disabled} onChange={e => { const position: ConfiguredOccurrenceFields['position'] = [...fields.position]; position[index] = e.target.value; props.onChange({ ...fields, position }) }} /></label>)}
    <label>Revisión para piezas v1<input aria-label="Revisión de pieza importada" value={fields.partRevision} disabled={disabled} onChange={e => props.onChange({ ...fields, partRevision: e.target.value })} /></label>
    <button disabled={disabled || !fields.name.trim()} onClick={props.onImport}>Importar componente configurado</button>
    <p>Importa documentos de pieza, ensamblaje o ensamblaje configurado. Se conserva el catálogo completo y el estado raíz del archivo v3; un estado hijo nombrado requiere un padre nombrado.</p>
    <label>Definición registrada<select aria-label="Definición registrada configurada" value={fields.definition} disabled={disabled} onChange={e => props.onChange({ ...fields, definition: e.target.value, configuration: '' })}><option value="">Selecciona una definición</option>{document.source.definitions.map(row => <option key={assemblyDefinitionKey(row)} value={assemblyDefinitionKey(row)}>{row.kind === 'part' ? row.document.name : row.name} · {row.id} · {row.revision}</option>)}</select></label>
    <label>Estado del componente<select aria-label="Configuración del componente reutilizado" value={fields.configuration} disabled={disabled || definition?.kind !== 'assembly'} onChange={e => props.onChange({ ...fields, configuration: e.target.value })}><option value="">Base</option>{variants.map(row => <option key={row.id} value={row.id} disabled={props.configuration === null}>{row.name}</option>)}</select></label>
    <button disabled={disabled || !fields.name.trim() || !definition} onClick={props.onReuse}>Vista previa de inserción configurada</button>
    <p>La importación y la reutilización requieren vista previa verificada y Aplicar configuración. Cancelar conserva el documento confirmado.</p>
  </section>
}
