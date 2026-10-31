import type { AssemblyUiExportFormat } from './assemblyExport'

export interface AssemblyExportPanelProps {
  disabled: boolean
  onExport: (format: AssemblyUiExportFormat) => void
}
export default function AssemblyExportPanel({ disabled, onExport }: AssemblyExportPanelProps) {
  return <section className="assembly-section" role="region" aria-label="Exportar geometría del ensamblaje">
    <h2>Exportar geometría</h2>
    <p>STEP plano: geometría sin jerarquía ni relaciones. STL: malla; coordenadas en mm. Incluye componentes ocultos; excluye suprimidos.</p>
    <p>STEP estructurado conserva productos, instancias y posiciones; no conserva relaciones ni historial de diseño.</p>
    <p>Se exportan las posiciones confirmadas. Aplica o cancela los cambios pendientes antes de exportar.</p>
    <button aria-label="Exportar STEP plano del ensamblaje" disabled={disabled} onClick={() => onExport('step')}>STEP plano</button>
    <button aria-label="Exportar STEP estructurado del ensamblaje" disabled={disabled} onClick={() => onExport('step-assembly')}>STEP estructurado</button>
    <button aria-label="Exportar STL del ensamblaje" disabled={disabled} onClick={() => onExport('stl')}>STL</button>
  </section>
}
