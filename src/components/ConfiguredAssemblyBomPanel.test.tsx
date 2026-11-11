import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { assemblyConfigurationCoreFixture } from '../model/assemblyConfigurationCore.test-utils'
import { createAssemblyConfiguredDocument, serializeAssemblyConfiguredDocument } from '../model/assemblyConfiguredDocument'
import { buildConfiguredAssemblyBom, type ConfiguredAssemblyBomOptions } from '../model/assemblyConfiguredBom'
import { serializeConfiguredAssemblyBomCsv } from '../model/assemblyConfiguredBomCsv'
import ConfiguredAssemblyBomPanel, { configuredBomMemberLabel, type ConfiguredAssemblyBomPanelProps } from './ConfiguredAssemblyBomPanel'
import { configuredBomUiSelectedPath, configuredBomUiTicket, configuredBomUiTicketMatches, configuredUiTicket, downloadConfiguredBomCsv, runConfiguredBomCsvExport } from './configuredAssemblyUi'

// Public original A/B prisms and reused rigid S states. These are declaration,
// SSR and pure async-controller checks, not WebGL/events/native file evidence.
function fixture() { const { document, catalog } = assemblyConfigurationCoreFixture(); return createAssemblyConfiguredDocument(document, catalog, 'mixed') }
const options: ConfiguredAssemblyBomOptions = { mode: 'top-level', includeHidden: true, scopePath: [] }
function props(document = fixture(), supplied = options): ConfiguredAssemblyBomPanelProps {
  return { report: buildConfiguredAssemblyBom(document, supplied), options: supplied, scopes: [{ path: [], label: 'Todo el ensamblaje' }, { path: ['right'], label: 'right · compact' }],
    rootConfigurationLabel: 'Right compact · "mixed"', selectedPath: [], disabled: false, onOptionsChange: vi.fn(), onSelect: vi.fn(), onExport: vi.fn(), onClose: vi.fn() }
}

it('renders confirmed variant-specific assembly rows and an explicit independent scope range', () => {
  const input = props(), html = renderToStaticMarkup(<ConfiguredAssemblyBomPanel {...input} />)
  expect(input.report!.rows.map(row => [row.configuration, row.quantityTotal])).toEqual([[null, 1], ['compact', 1]])
  for (const text of ['Lista de materiales de la configuración', 'Documento confirmado', 'Right compact', 'Ámbito de lista de materiales configurada', 'Todo el ensamblaje', 'Compact']) expect(html).toContain(text)
  expect(html).toContain('data-bom-configuration="null"'); expect(html).toContain('data-bom-configuration="&quot;compact&quot;"')
  expect(html).toContain('data-bom-definition="[&quot;configuration-S&quot;,&quot;s-r1&quot;]"')
  expect(html).not.toContain('role="dialog"'); expect(html).not.toContain('aria-modal')
  for (const callback of [input.onOptionsChange, input.onSelect, input.onExport, input.onClose]) expect(callback).not.toHaveBeenCalled()
})

it('renders grouped identical states and literal suppressed-state leaf quantities without substituting Base', () => {
  const document = fixture(); document.rootConfiguration = 'both-compact'
  const grouped = props(document); expect(grouped.report!.rows.map(row => [row.configuration, row.quantityPerParent, row.quantityTotal])).toEqual([['compact', 2, 2]])
  expect(renderToStaticMarkup(<ConfiguredAssemblyBomPanel {...grouped} />)).toContain('data-bom-quantity-total="2"')
  document.rootConfiguration = 'single-right'
  const leaves = props(document, { ...options, mode: 'parts-only' })
  expect(leaves.report!.rows.map(row => [row.definition.id, row.quantityTotal])).toEqual([['configuration-A', 2], ['configuration-B', 1]])
})

it('distinguishes the inherited Base state from an explicitly named variant whose ID and name are Base', () => {
  const document = fixture()
  document.catalog[1].configurations.push({ id: 'Base', name: 'Base', occurrences: [], mates: [] })
  document.catalog[0].configurations[0].occurrences[0].configuration = 'Base'
  const input = props(document), html = renderToStaticMarkup(<ConfiguredAssemblyBomPanel {...input} />)
  expect(input.report!.rows.map(row => [row.configuration, row.quantityTotal])).toEqual([[null, 1], ['Base', 1]])
  expect(html).toContain('data-bom-configuration="null"'); expect(html).toContain('data-bom-configuration="&quot;Base&quot;"')
  expect(html).toContain('Base · &quot;Base&quot;')
})

it('keeps full root member paths and ancestry in a selected reused scope and highlights only that member', () => {
  const document = fixture(), input = props(document, { ...options, scopePath: ['right'], mode: 'parts-only' }), member = input.report!.rows[0].members[0]
  expect(member.component.occurrencePath).toEqual(['right', 'a'])
  expect(configuredBomMemberLabel(member)).toContain('right: "compact"')
  const serialized = serializeAssemblyConfiguredDocument(document), selection = { serialized, member: structuredClone(member) }
  expect(configuredBomUiSelectedPath(input.report, serialized, selection)).toEqual(['right', 'a'])
  input.selectedPath = ['right', 'a']; const html = renderToStaticMarkup(<ConfiguredAssemblyBomPanel {...input} />)
  expect(html.match(/data-selected-member=/g)).toHaveLength(1); expect(html).toContain('data-selected-member="[&quot;right&quot;,&quot;a&quot;]"')
  expect(html).not.toContain('left / a')
})

it.each(['namespace', 'tuple', 'ancestry', 'context'] as const)('rejects a stale or changed %s highlight without changing source/history', kind => {
  const document = fixture(), before = serializeAssemblyConfiguredDocument(document), report = buildConfiguredAssemblyBom(document), member = structuredClone(report.rows[0].members[0])
  if (kind === 'namespace') member.component.occurrencePath[0] = 'right'
  if (kind === 'tuple') member.component.definition.revision += '-changed'
  if (kind === 'ancestry') member.configurationAncestry[0].configuration = null
  expect(configuredBomUiSelectedPath(report, before, { serialized: kind === 'context' ? before + ' ' : before, member })).toEqual([])
  expect(serializeAssemblyConfiguredDocument(document)).toBe(before)
})

it('shows saved provenance as escaped descriptive data and states its lack of file/geometry authority', () => {
  const document = fixture(); document.source.definitions.find(row => row.id === 'configuration-S')!.sourceLink = { kind: 'local-file', displayName: 'original-source.solidflow', contentSha256: 'a'.repeat(64) }
  const input = props(document); input.report!.rows[0].name = '=Source <name>'
  const html = renderToStaticMarkup(<ConfiguredAssemblyBomPanel {...input} />)
  expect(html).toContain('original-source.solidflow'); expect(html).toContain('SHA-256: ' + 'a'.repeat(64))
  expect(html).toContain('no verifica su contenido actual ni concede acceso'); expect(html).toContain('no certifica material, masa ni geometría')
  expect(html).toContain('=Source &lt;name&gt;'); expect(html).not.toContain('<name>')
})

it('disables options, member selection and export for pending operations while close remains available', () => {
  const input = { ...props(), disabled: true }, html = renderToStaticMarkup(<ConfiguredAssemblyBomPanel {...input} />)
  for (const label of ['Ámbito de lista de materiales configurada', 'Modo de lista de materiales configurada', 'Incluir ocultos en lista de materiales configurada', 'Exportar lista de materiales configurada CSV']) {
    expect(html).toMatch(new RegExp(`<(?:select|input|button)(?=[^>]*aria-label="${label}")(?=[^>]*disabled="")[^>]*>`))
  }
  expect(html).toMatch(/<select(?=[^>]*aria-label="Ocurrencia configurada de 1: Original S")(?=[^>]*disabled="")[^>]*>/)
  expect(html).toMatch(/<button(?=[^>]*aria-label="Cerrar lista de materiales configurada")(?![^>]*disabled=)[^>]*>/)
  expect(html).toContain('aplicar o cancelar la vista previa')
})

it('distinguishes unavailable, suppressed empty and repairable inventory from solved geometry', () => {
  const input = props(); input.report!.rows = []; input.report!.scope.suppressed = true
  expect(renderToStaticMarkup(<ConfiguredAssemblyBomPanel {...input} />)).toContain('No hay ocurrencias activas')
  expect(renderToStaticMarkup(<ConfiguredAssemblyBomPanel {...input} report={null} error="Ámbito no disponible" />)).not.toContain('No hay ocurrencias activas')
  input.report!.referenceDiagnostics.push({ scopePath: [], mateId: 'original', side: 'first', path: ['absent'], problem: 'missing-occurrence' })
  expect(renderToStaticMarkup(<ConfiguredAssemblyBomPanel {...input} />)).toContain('no acredita que sus relaciones estén resueltas')
})

it('binds table options/range/open epoch as well as the complete workspace ticket', () => {
  const document = fixture(), context = configuredUiTicket(document, 4, '[]', 'original.solidflow', 'left')
  const captured = configuredBomUiTicket(context, true, 7, options)
  expect(configuredBomUiTicketMatches(captured, configuredBomUiTicket(context, true, 7, structuredClone(options)))).toBe(true)
  for (const candidate of [configuredBomUiTicket(context, false, 8, options), configuredBomUiTicket(context, true, 9, options),
    configuredBomUiTicket(context, true, 7, { ...options, scopePath: ['right'] }), configuredBomUiTicket(context, true, 7, { ...options, mode: 'parts-only' }),
    configuredBomUiTicket(context, true, 7, { ...options, includeHidden: false }), configuredBomUiTicket({ ...context, generation: 6 }, true, 7, options),
    configuredBomUiTicket({ ...context, path: 'other.solidflow' }, true, 7, options)]) expect(configuredBomUiTicketMatches(captured, candidate)).toBe(false)
})

it('exports exact rebuilt confirmed-context bytes and treats native cancellation and failure as read-only', async () => {
  const document = fixture(), before = serializeAssemblyConfiguredDocument(document), write = vi.fn(async () => null as string | null), download = vi.fn()
  expect(await runConfiguredBomCsvExport(document, options, { isCurrent: () => true, write, download })).toBe('cancelled')
  const [bytes, name] = write.mock.calls[0] as unknown as [Uint8Array, string]
  expect(bytes).toEqual(new TextEncoder().encode(serializeConfiguredAssemblyBomCsv(document, options))); expect([...bytes.slice(0, 3)]).toEqual([239, 187, 191]); expect(name).toBe(document.source.name + '-materiales-configurados')
  await expect(runConfiguredBomCsvExport(document, options, { isCurrent: () => true, write: async () => { throw Error('Original write failure') }, download })).rejects.toThrow('Original write failure')
  expect(await runConfiguredBomCsvExport(document, options, { isCurrent: () => true, write: async () => 'original.csv', download })).toBe('exported')
  expect(download).not.toHaveBeenCalled(); expect(serializeAssemblyConfiguredDocument(document)).toBe(before)
})

it('withholds a late completion after close/reopen or context changes and owns bytes before yielding', async () => {
  const document = fixture(), context = configuredUiTicket(document, 5, '[]', 'original.solidflow'), before = configuredBomUiTicket(context, true, 1, options)
  let now = before, complete!: (value: string | null) => void, bytes: Uint8Array | undefined
  const task = runConfiguredBomCsvExport(document, options, { isCurrent: () => configuredBomUiTicketMatches(before, now), write: async value => { bytes = value; return new Promise(resolve => { complete = resolve }) }, download: vi.fn() })
  const originalBytes = bytes!.slice(); document.rootConfiguration = 'single-right'
  now = configuredBomUiTicket(context, true, 3, options); complete('original.csv')
  expect(await task).toBe('stale'); expect(bytes).toEqual(originalBytes)
  const write = vi.fn(async () => 'never.csv')
  expect(await runConfiguredBomCsvExport(document, options, { isCurrent: () => false, write, download: vi.fn() })).toBe('stale'); expect(write).not.toHaveBeenCalled()
})

it('owns browser CSV bytes and releases its URL on success or failure without a file bridge', async () => {
  const bytes = new TextEncoder().encode('\ufefforiginal\r\n'), revoke = vi.fn(), click = vi.fn(), callbacks: (() => void)[] = [], link = { href: '', download: '', click }
  let blob: Blob | undefined
  const environment = { createObjectURL: (value: Blob) => { blob = value; return 'blob:original-owned' }, revokeObjectURL: revoke, createLink: () => link, schedule: (callback: () => void) => { callbacks.push(callback) } }
  downloadConfiguredBomCsv(bytes, 'original', environment); bytes.fill(0)
  expect(new Uint8Array(await blob!.arrayBuffer())).toEqual(new TextEncoder().encode('\ufefforiginal\r\n')); expect(link.download).toBe('original.csv'); expect(click).toHaveBeenCalledOnce(); expect(revoke).not.toHaveBeenCalled()
  callbacks[0](); expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:original-owned')
  expect(() => downloadConfiguredBomCsv(new Uint8Array([1]), 'original', { ...environment, createLink: () => { throw Error('Original download failure') } })).toThrow('Original download failure')
  expect(revoke).toHaveBeenCalledTimes(2)
})
