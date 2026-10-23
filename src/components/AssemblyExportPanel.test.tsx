import { expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import AssemblyExportPanel from './AssemblyExportPanel'

// SSR establishes labels/eligibility only, not interaction or exported geometry.
it.each([true, false])('renders both flat export controls with disabled=%s', disabled => {
  const onExport = vi.fn(), html = renderToStaticMarkup(<AssemblyExportPanel disabled={disabled} onExport={onExport} />)
  for (const label of ['Exportar STEP plano del ensamblaje', 'Exportar STEP estructurado del ensamblaje', 'Exportar STL del ensamblaje']) {
    const button = html.match(new RegExp(`<button(?=[^>]*aria-label="${label}")[^>]*>`))?.[0]
    expect(button).toBeDefined(); expect(button?.includes('disabled=""')).toBe(disabled)
  }
  expect(onExport).not.toHaveBeenCalled()
})
it('explains flat geometry, units, hidden/suppressed membership and pending edits in user language', () => {
  const html = renderToStaticMarkup(<AssemblyExportPanel disabled={false} onExport={() => undefined} />)
  expect(html).toContain('STEP plano: geometría sin jerarquía ni relaciones. STL: malla; coordenadas en mm.')
  expect(html).toContain('Incluye componentes ocultos; excluye suprimidos.')
  expect(html).toContain('STEP estructurado conserva productos, instancias y posiciones; no conserva relaciones ni historial de diseño.')
  expect(html).toContain('Aplica o cancela los cambios pendientes antes de exportar.')
  expect(html).not.toMatch(/IPC|token|worker/)
})
