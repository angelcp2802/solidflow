import type { AssemblySourceLink } from '../model/assemblyDocument'

export default function AssemblyLinkedSourcePanel(props: { sourceLink?: AssemblySourceLink; sourceKind?: 'part' | 'assembly'; connected: boolean; available: boolean; disabled: boolean;
  onChoose: () => void; onReload: () => void; onDetach: () => void }) {
  return <section className="assembly-section" aria-label="Archivo de origen enlazado">
    <h3>Archivo de origen</h3>
    <p role="status">{props.sourceLink ? props.connected ? `Archivo vinculado: ${props.sourceLink.displayName}` : `Copia incorporada disponible: ${props.sourceLink.displayName}. Selecciona el archivo para volver a vincularlo.` : 'Origen incorporado. Puedes vincular su archivo para revisar futuras actualizaciones.'}</p>
    <button aria-label={props.sourceLink ? 'Re-vincular archivo de origen' : 'Vincular archivo de origen'} disabled={props.disabled || !props.available} onClick={props.onChoose}>{props.sourceLink ? 'Re-vincular archivo…' : 'Vincular archivo…'}</button>
    {props.sourceLink && <><button aria-label="Recargar origen enlazado" disabled={props.disabled || !props.available || !props.connected} onClick={props.onReload}>Recargar</button>
      <button aria-label="Desvincular archivo de origen" disabled={props.disabled} onClick={props.onDetach}>Desvincular</button></>}
    <p>La copia incorporada permanece disponible sin el archivo. Cada recarga se revisa antes de Aplicar. El archivo de origen no se modifica.</p>
    {props.sourceKind === 'assembly' && <p>Un subensamblaje modificado necesita que su archivo declare una revisión distinta. La revisión no se cambia automáticamente.</p>}
    {!props.available && <p>La selección de archivos enlazados requiere la aplicación de escritorio.</p>}
  </section>
}
