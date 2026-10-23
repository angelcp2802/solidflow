import { expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import AssemblyInterferencePanel, { assemblyInterferenceComponentKey, assemblyInterferenceStatus, assemblyInterferenceUiOptions } from './AssemblyInterferencePanel'
import type { AssemblyAnalysisBody, AssemblyInterferencePair, AssemblyInterferenceReport, AssemblyInterferenceScope } from '../model/assemblyInterference'

// Original symbolic report/selection fixtures. No BRep, native distances,
// worker execution, WebGL rendering or human interaction is claimed here.
const owner = (id: string): AssemblyAnalysisBody => ({ component: { occurrencePath: ['original-sub', id], definition: { id: 'original-part', revision: 'r2' } },
  body: { bodyId: 'original-body', sourceFeatureId: 'original-final' }, componentName: id === 'a' ? 'Placa original' : 'Pasador original', bodyName: 'Cuerpo original' })
function pair(status: AssemblyInterferencePair['status'] = 'clearance'): AssemblyInterferencePair {
  return { id: 'pair-original', first: owner('a'), second: owner('b'), status, intersectionVolume: status === 'overlap' ? 2 : status === 'small-overlap' ? 1e-8 : 0,
    solidCount: status === 'overlap' || status === 'small-overlap' ? 1 : 0, minimumDistance: status === 'clearance' ? .5 : 0,
    closestPoints: { first: [1, 2, 3], second: [1.5, 2, 3] }, lengthTolerance: 1e-6, volumeTolerance: 1e-6, intersectionMesh: null }
}
function report(): AssemblyInterferenceReport {
  return { kind: 'assembly-interference-report', analysisId: 'display-only-analysis', options: { clearance: 1, lengthTolerance: 1e-6, volumeTolerance: 1e-6, includeHidden: true },
    bodyCount: 3, componentCount: 3, potentialPairCount: 3, testedPairCount: 2, broadPhaseExcludedCount: 1,
    scopeSummary: { mode: 'all', selectedLeafCount: 0, excludedLeafCount: 0, eligibleLeafCount: 3, eligiblePairCount: 3 },
    pairs: [pair(), { ...pair(), id: 'pair-other', first: owner('c') }], warnings: [] }
}
function markup(value: AssemblyInterferenceReport | null = null, disabled = false, selectedPairId: string | null = null, showingHidden = false,
  scope: AssemblyInterferenceScope = { mode: 'all', selected: [], excluded: [] }, includeWithinComponent = false, grouped = false) {
  return renderToStaticMarkup(<AssemblyInterferencePanel report={value} disabled={disabled} selectedPairId={selectedPairId} clearance="1" includeHidden includeWithinComponent={includeWithinComponent} treatSubassembliesAsComponents={grouped}
    scope={scope} choices={[{ component: owner('a').component, label: 'Original subgroup / Original A' }, { component: owner('b').component, label: 'Original subgroup / Original B' }]}
    onScopeChange={() => undefined} onIncludeWithinComponentChange={() => undefined} onTreatSubassembliesAsComponentsChange={() => undefined}
    onClearanceChange={() => undefined} onIncludeHiddenChange={() => undefined} onInspect={() => undefined} onSelectPair={() => undefined} onClear={() => undefined} showingHidden={showingHidden} />)
}
it('uses millimeters and cubic millimeters without changing a zero or fractional clearance', () => {
  expect(assemblyInterferenceUiOptions('0.5', true)).toEqual({ clearance: .5, includeHidden: true, includeWithinComponent: false, treatSubassembliesAsComponents: false, lengthTolerance: 1e-6, volumeTolerance: 1e-6 })
  expect(assemblyInterferenceUiOptions('0', false).clearance).toBe(0); expect(assemblyInterferenceUiOptions('0', false).includeHidden).toBe(false)
})
it.each(['', ' ', '-0.001', 'Infinity', 'NaN', '1e309'])('rejects invalid clearance %j rather than supplying a default', value => {
  expect(() => assemblyInterferenceUiOptions(value, true)).toThrow('La holgura')
})
it('renders no result before analysis and keeps the user controls separate from Apply', () => {
  const html = markup(); expect(html).toContain('No hay un informe vigente'); expect(html).toContain('ensamblaje confirmado')
  expect(html).toContain('aria-label="Comprobar interferencias"'); expect(html).not.toContain('data-analysis-id='); expect(html).not.toContain('Aplicar ensamblaje')
})
it('keeps a positive intersection below volume tolerance classified as a collision', () => {
  const value = report(); value.pairs = [pair('small-overlap')]
  const html = markup(value); expect(html).toContain('Solape menor de tolerancia · colisión'); expect(html).toContain('1 pares con solape'); expect(html).toContain('Tolerancia de volumen')
  expect(value.pairs[0].intersectionVolume).toBe(1e-8)
})
it('labels contact by its native-expanded millimeter band without asserting exact touching', () => {
  const value = report(); value.pairs = [pair('contact')]; value.pairs[0].lengthTolerance = .001
  const html = markup(value); expect(html).toContain('Contacto dentro de tolerancia'); expect(html).toContain('Tolerancia:'); expect(html).not.toContain('Contacto exacto')
  expect(assemblyInterferenceStatus(value.pairs[0])).toBe('Contacto dentro de tolerancia')
})
it('reports per-body-pair values without a false total union volume or exact broad-phase distance', () => {
  const value = report(); value.pairs = [pair('overlap'), { ...pair('overlap'), id: 'second-overlap', intersectionVolume: 3 }]
  const html = markup(value); expect(html).toContain('2 pares con solape'); expect(html).toContain('no se suman como un volumen único'); expect(html).toContain('sus distancias exactas no se han consultado')
  expect(html.match(/data-analysis-pair=/g)).toHaveLength(2); expect(value.pairs.map(row => row.intersectionVolume)).toEqual([2, 3])
})
it('retains scoped pair identity while displaying friendly component/body names and selected state', () => {
  const value = report(), before = JSON.stringify(value), html = markup(value, false, 'pair-original')
  expect(html).toContain('Placa original'); expect(html).toContain('Pasador original'); expect(html).toContain('Cuerpo original')
  expect(html).toMatch(/<button(?=[^>]*aria-label="Resaltar Placa original, Cuerpo original, y Pasador original, Cuerpo original")(?=[^>]*aria-pressed="true")[^>]*>/)
  expect(html).toMatch(/<button(?=[^>]*aria-label="Resaltar Pasador original, Cuerpo original, y Pasador original, Cuerpo original")(?=[^>]*aria-pressed="false")[^>]*>/)
  expect(JSON.stringify(value)).toBe(before)
})
it('blocks options, recomputation and pair selection while a preview or operation owns the workspace', () => {
  const html = markup(report(), true)
  expect(html).toMatch(/<input(?=[^>]*aria-label="Holgura de comprobación")(?=[^>]*disabled="")[^>]*>/)
  expect(html).toMatch(/<button(?=[^>]*aria-label="Comprobar interferencias")(?=[^>]*disabled="")[^>]*>/)
  expect(html).toMatch(/<button(?=[^>]*aria-label="Resaltar Placa original, Cuerpo original, y Pasador original, Cuerpo original")(?=[^>]*disabled="")[^>]*>/)
})
it('explains temporary hidden-component display and preserves analysis warnings', () => {
  const value = report(); value.warnings = ['Original bounded analysis warning']
  const html = markup(value, false, 'pair-original', true)
  expect(html).toContain('Se muestran temporalmente los componentes ocultos'); expect(html).toContain('Original bounded analysis warning')
  expect(markup(value)).not.toContain('Se muestran temporalmente los componentes ocultos')
})
it('makes an empty report distinct from an unexecuted analysis', () => {
  const value = report(); value.pairs = []
  expect(markup(value)).toContain('No hay pares dentro de la holgura comprobada'); expect(markup(value)).not.toContain('No hay un informe vigente')
})
it('distinguishes selected-only and crossing scopes and requires an explicit selection', () => {
  const html = markup(null, false, null, false, { mode: 'selected-against-rest', selected: [], excluded: [] })
  expect(html).toContain('Entre seleccionados'); expect(html).toContain('Seleccionados contra el resto')
  expect(html).toContain('únicamente pares que cruzan'); expect(html).toContain('Selecciona al menos un componente')
  expect(html).toMatch(/<button(?=[^>]*aria-label="Comprobar interferencias")(?=[^>]*disabled="")[^>]*>/)
  expect(html).toContain('Las exclusiones tienen prioridad'); expect(html).toContain('piezas descendientes')
})
it('carries full instance and revision identities into the request without aliasing the UI state', () => {
  const scope: AssemblyInterferenceScope = { mode: 'among-selected', selected: [owner('a').component], excluded: [owner('b').component] }
  const before = JSON.stringify(scope), options = assemblyInterferenceUiOptions('1', true, scope)
  expect(options.scope).toEqual(scope); expect(options.scope).not.toBe(scope)
  options.scope!.selected[0].occurrencePath[0] = 'changed-output'
  expect(JSON.stringify(scope)).toBe(before)
  expect(assemblyInterferenceComponentKey(owner('a').component)).toBe('[["original-sub","a"],"original-part","r2"]')
  expect(assemblyInterferenceComponentKey({ ...owner('a').component, definition: { id: 'original-part', revision: 'r3' } }))
    .not.toBe(assemblyInterferenceComponentKey(owner('a').component))
})
it('keeps an obsolete scoped identity visible for explicit removal instead of silently selecting a current name', () => {
  const stale = { ...owner('a').component, definition: { id: 'original-part', revision: 'old-revision' } }
  const html = markup(null, false, null, false, { mode: 'among-selected', selected: [stale], excluded: [] })
  expect(html).toContain('Referencia no actual'); expect(html).toContain('old-revision')
  expect(html).toContain('Referencia no actual · [&quot;original-sub&quot;,&quot;a&quot;]')
  expect(html).toMatch(/<option(?=[^>]*value="[^\"]*old-revision)(?=[^>]*selected="")[^>]*>/)
  expect(html).toContain('Vaciar selección de interferencias')
})
it('labels the evaluated scope from the report and disables both lists during workspace operations', () => {
  const value = report(); value.scopeSummary = { mode: 'among-selected', selectedLeafCount: 2, excludedLeafCount: 1, eligibleLeafCount: 1, eligiblePairCount: 0 }
  const html = markup(value, true)
  expect(html).toContain('Ámbito comprobado: Entre seleccionados')
  expect(html).toContain('2 piezas seleccionadas · 1 piezas excluidas · 1 piezas participantes')
  for (const label of ['Ámbito de interferencias', 'Componentes seleccionados para interferencias', 'Componentes excluidos de interferencias']) {
    expect(html).toMatch(new RegExp(`<select(?=[^>]*aria-label="${label}")(?=[^>]*disabled="")[^>]*>`))
  }
})

it('keeps the internal-body option off by default and carries an explicit fourth argument into the request', () => {
  expect(assemblyInterferenceUiOptions('1',false).includeWithinComponent).toBe(false)
  const scope: AssemblyInterferenceScope={mode:'among-selected',selected:[owner('a').component],excluded:[]}
  const legacy=assemblyInterferenceUiOptions('1',false,scope), enabled=assemblyInterferenceUiOptions('1',false,scope,true)
  expect(legacy.includeWithinComponent).toBe(false);expect(enabled.includeWithinComponent).toBe(true)
  expect(enabled.scope).toEqual(scope);expect(enabled.scope).not.toBe(scope)
  expect(JSON.stringify(legacy)).not.toBe(JSON.stringify(enabled))
  expect(markup()).toMatch(/<input(?=[^>]*aria-label="Incluir cuerpos de una misma pieza")(?![^>]*checked="")[^>]*>/)
  expect(markup()).not.toContain('Opción «cuerpos de una misma pieza»:')
})
it('renders the checked policy and disables it while the workspace is busy', () => {
  const scope: AssemblyInterferenceScope={mode:'all',selected:[],excluded:[]}
  expect(markup(null,false,null,false,scope,true)).toMatch(/<input(?=[^>]*aria-label="Incluir cuerpos de una misma pieza")(?=[^>]*checked="")[^>]*>/)
  expect(markup(null,true,null,false,scope,true)).toMatch(/<input(?=[^>]*aria-label="Incluir cuerpos de una misma pieza")(?=[^>]*disabled="")[^>]*>/)
})
it('echoes the evaluated internal-body policy from the report rather than current controls or pair counts', () => {
  const value=report();value.pairs=[];value.options.includeWithinComponent=true
  expect(markup(value)).toContain('Opción «cuerpos de una misma pieza»: activada.')
  value.options.includeWithinComponent=false
  expect(markup(value,false,null,false,{mode:'all',selected:[],excluded:[]},true)).toContain('Opción «cuerpos de una misma pieza»: desactivada.')
  delete value.options.includeWithinComponent
  expect(markup(value)).toContain('Opción «cuerpos de una misma pieza»: desactivada.')
})
it('keeps the selected-against-rest crossing rule explicit even when internal-body inclusion was requested', () => {
  const value=report();value.options.includeWithinComponent=true;value.scopeSummary.mode='selected-against-rest'
  const html=markup(value)
  expect(html).toContain('Opción «cuerpos de una misma pieza»: activada.')
  expect(html).toContain('no comprueba pares dentro de una misma pieza.')
})

it('requests grouping explicitly and keeps legacy UI requests ungrouped', () => {
  const scope: AssemblyInterferenceScope = { mode: 'all', selected: [], excluded: [] }
  expect(assemblyInterferenceUiOptions('0', true).treatSubassembliesAsComponents).toBe(false)
  expect(assemblyInterferenceUiOptions('0', true, scope, false, true).treatSubassembliesAsComponents).toBe(true)
  expect(assemblyInterferenceUiOptions('0', true, scope, true, true)).toMatchObject({ includeWithinComponent: true, treatSubassembliesAsComponents: true })
  const excluded = { ...scope, excluded: [owner('a').component] }
  expect(assemblyInterferenceUiOptions('0', true, excluded, false, true)).toMatchObject({ scope: excluded, treatSubassembliesAsComponents: true })
})
it('makes grouping available across scopes while retaining either internal-body option', () => {
  const all: AssemblyInterferenceScope = { mode: 'all', selected: [], excluded: [] }
  expect(markup()).toMatch(/<input(?=[^>]*aria-label="Agrupar subensamblajes raíz")(?![^>]*disabled="")(?![^>]*checked="")[^>]*>/)
  expect(markup(null, true)).toMatch(/<input(?=[^>]*aria-label="Agrupar subensamblajes raíz")(?=[^>]*disabled="")[^>]*>/)
  for (const html of [
    markup(null, false, null, false, { ...all, excluded: [owner('a').component] }),
    markup(null, false, null, false, { ...all, mode: 'among-selected', selected: [owner('a').component] })]) {
    expect(html).toMatch(/<input(?=[^>]*aria-label="Agrupar subensamblajes raíz")(?![^>]*disabled="")[^>]*>/)
  }
  const grouped = markup(null, false, null, false, all, false, true)
  expect(grouped).toMatch(/<input(?=[^>]*aria-label="Agrupar subensamblajes raíz")(?=[^>]*checked="")(?![^>]*disabled="")[^>]*>/)
  expect(grouped).toMatch(/<input(?=[^>]*aria-label="Incluir cuerpos de una misma pieza")(?![^>]*disabled="")[^>]*>/)
  const both = markup(null, false, null, false, all, true, true)
  for (const label of ['Agrupar subensamblajes raíz', 'Incluir cuerpos de una misma pieza']) {
    expect(both).toMatch(new RegExp(`<input(?=[^>]*aria-label="${label}")(?=[^>]*checked="")(?![^>]*disabled="")[^>]*>`))
  }
  expect(both).toMatch(/<button(?=[^>]*aria-label="Comprobar interferencias")(?![^>]*disabled="")[^>]*>/)
  expect(markup(null, false, null, false, all, true)).toMatch(/<input(?=[^>]*aria-label="Agrupar subensamblajes raíz")(?![^>]*disabled="")[^>]*>/)
  for (const label of ['Ámbito de interferencias', 'Componentes excluidos de interferencias']) {
    expect(grouped).toMatch(new RegExp(`<select(?=[^>]*aria-label="${label}")(?![^>]*disabled="")[^>]*>`))
  }
  // In all mode there is no selected subset, independently of grouping.
  expect(grouped).toMatch(/<select(?=[^>]*aria-label="Componentes seleccionados para interferencias")(?=[^>]*disabled="")[^>]*>/)
  expect(grouped).toContain('omite pares internos de cada componente raíz')
})
it('echoes the evaluated grouping policy while allowing exclusions without implying a report', () => {
  const value = report(), all: AssemblyInterferenceScope = { mode: 'all', selected: [], excluded: [] }
  value.options.treatSubassembliesAsComponents = true
  expect(markup(value)).toContain('Opción «agrupar subensamblajes raíz»: activada.')
  delete value.options.treatSubassembliesAsComponents
  expect(markup(value, false, null, false, all, false, true)).toContain('Opción «agrupar subensamblajes raíz»: desactivada.')
  const excluded = markup(null, false, null, false, { ...all, excluded: [owner('a').component] }, true, true)
  expect(excluded).toMatch(/<button(?=[^>]*aria-label="Comprobar interferencias")(?![^>]*disabled="")[^>]*>/)
  expect(excluded).toMatch(/<input(?=[^>]*aria-label="Agrupar subensamblajes raíz")(?![^>]*disabled="")[^>]*>/)
  expect(excluded).toContain('No hay un informe vigente')
})

it.each(['among-selected', 'selected-against-rest'] as const)('retains grouped selected/excluded intent and enabled controls in %s', mode => {
  const scope: AssemblyInterferenceScope = { mode, selected: [owner('a').component, owner('b').component], excluded: [owner('b').component] }
  const before = JSON.stringify(scope), html = markup(null, false, null, false, scope, true, true)
  const controls = ['Ámbito de interferencias', 'Componentes seleccionados para interferencias', 'Componentes excluidos de interferencias']
  for (const label of controls) expect(html).toMatch(new RegExp(`<select(?=[^>]*aria-label="${label}")(?![^>]*disabled="")[^>]*>`))
  expect(html).toMatch(/<button(?=[^>]*aria-label="Comprobar interferencias")(?![^>]*disabled="")[^>]*>/)
  const lists = [...html.matchAll(/<select[^>]*aria-label="Componentes (seleccionados para|excluidos de) interferencias"[^>]*>([\s\S]*?)<\/select>/g)]
  expect(lists).toHaveLength(2)
  expect(lists[0][2].match(/selected=""/g)).toHaveLength(2)
  expect(lists[1][2].match(/selected=""/g)).toHaveLength(1)
  expect(lists[1][2]).toMatch(/<option(?=[^>]*selected="")(?=[^>]*value="[^\"]*original-sub[^\"]*b)[^>]*>/)
  expect(html).toContain('raíz original del documento')
  expect(html).toContain('no crea nuevas raíces ni amplía la selección')
  expect(html).toContain('no se amplían al componente raíz')
  expect(html).not.toContain('Desactiva la agrupación')
  expect(html).not.toContain('comportamiento nativo')
  expect(JSON.stringify(scope)).toBe(before)
})

it('keeps grouped controls and nonempty clear actions disabled while busy', () => {
  const scope: AssemblyInterferenceScope = { mode: 'among-selected', selected: [owner('a').component], excluded: [owner('b').component] }
  const html = markup(null, true, null, false, scope, true, true)
  for (const label of ['Agrupar subensamblajes raíz', 'Incluir cuerpos de una misma pieza']) {
    expect(html).toMatch(new RegExp(`<input(?=[^>]*aria-label="${label}")(?=[^>]*checked="")(?=[^>]*disabled="")[^>]*>`))
  }
  for (const label of ['Ámbito de interferencias', 'Componentes seleccionados para interferencias', 'Componentes excluidos de interferencias']) {
    expect(html).toMatch(new RegExp(`<select(?=[^>]*aria-label="${label}")(?=[^>]*disabled="")[^>]*>`))
  }
  expect(html).toMatch(/<button(?=[^>]*aria-label="Comprobar interferencias")(?=[^>]*disabled="")[^>]*>/)
  expect(html).toMatch(/<button(?=[^>]*disabled="")[^>]*>Vaciar selección de interferencias<\/button>/)
  expect(html).toMatch(/<button(?=[^>]*disabled="")[^>]*>Vaciar exclusiones de interferencias<\/button>/)
})

it.each(['among-selected', 'selected-against-rest'] as const)('still requires a selection in grouped %s without blocking scope correction', mode => {
  const html = markup(null, false, null, false, { mode, selected: [], excluded: [owner('b').component] }, true, true)
  expect(html).toContain('Selecciona al menos un componente')
  expect(html).toMatch(/<button(?=[^>]*aria-label="Comprobar interferencias")(?=[^>]*disabled="")[^>]*>/)
  expect(html).toMatch(/<select(?=[^>]*aria-label="Componentes seleccionados para interferencias")(?![^>]*disabled="")[^>]*>/)
  expect(html).toMatch(/<select(?=[^>]*aria-label="Componentes excluidos de interferencias")(?![^>]*disabled="")[^>]*>/)
})
it('explains grouping precedence from both accepted report flags without clearing the requested body option', () => {
  const value = report(), all: AssemblyInterferenceScope = { mode: 'all', selected: [], excluded: [] }
  value.options.includeWithinComponent = true; value.options.treatSubassembliesAsComponents = true
  const html = markup(value, false, null, false, all, true, true)
  expect(html).toContain('Opción «cuerpos de una misma pieza»: activada.')
  expect(html).toContain('Opción «agrupar subensamblajes raíz»: activada.')
  expect(html).toContain('La agrupación prevalece: no se comprueban pares internos de un mismo componente raíz.')
  value.options.treatSubassembliesAsComponents = false
  expect(markup(value, false, null, false, all, true, true)).not.toContain('La agrupación prevalece:')
})
