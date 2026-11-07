import { expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createEmptyAssembly } from '../examples/assembly'
import type { AssemblyLinePathMate, AssemblyVertexReference } from '../model/assemblyDocument'
import type { AssemblyLinePathSupportReport } from '../cad/kernel.assembly-types'
import Panel, { assemblyLinePathUiProposal, assemblyLinePathUiReports, assemblyLinePathUiChoices, linePathOrigins, sameLinePathGuide, type LinePathGuideReference } from './AssemblyLinePathMatePanel'
const point = (id = 'point'): AssemblyVertexReference => ({ kind: 'vertex', support: 'point', component: { occurrencePath: [id], definition: { id: 'original', revision: 'r1' } }, body: { bodyId: 'box', sourceFeatureId: 'solid' }, vertex: { sourceFeatureId: 'solid', key: 'vertex-v1|' + 'a'.repeat(64) } })
const path = () => ({ component: point('path').component, body: point().body, edge: { sourceFeatureId: 'solid', key: 'edge-v1|original' }, startVertex: point().vertex })
const mate = (): AssemblyLinePathMate => ({ id: 'line', ...assemblyLinePathUiProposal(point(), path(), ' Original LINE ', 'percent', '25', true) })
it('retains detached compound origin and explicit percent/reverse without saved numeric target', () => {
  const p = point(), q = path(), original = structuredClone([p, q]), value = assemblyLinePathUiProposal(p, q, ' LINE ', 'distance', '1', true)
  expect(value).toEqual({ type: 'line-path', name: 'LINE', suppressed: false, point: p, path: q, position: { mode: 'distance', distanceMm: 1, reverse: true }, orientation: { pitchYaw: 'free', roll: 'free' } })
  value.path.startVertex.key = 'changed'; expect([p, q]).toEqual(original); expect(value).not.toHaveProperty('coordinateMm')
})
it.each(['', 'NaN', 'Infinity'])('blocks absent/nonfinite scalar %s', n => expect(() => assemblyLinePathUiProposal(point(), path(), 'LINE', 'percent', n, false)).toThrow())
it('keeps free mode distinct and rejects missing compound selections', () => {
  expect(assemblyLinePathUiProposal(point(), path(), 'LINE', 'free', '', true).position).toEqual({ mode: 'free' })
  expect(() => assemblyLinePathUiProposal(null, path(), 'LINE', 'free', '', false)).toThrow()
  expect(() => assemblyLinePathUiProposal(point(), null, 'LINE', 'free', '', false)).toThrow()
  expect(() => assemblyLinePathUiProposal(point(), path(), 'LINE', 'percent', '125', false)).toThrow(RangeError)
  expect(() => assemblyLinePathUiProposal(point(), path(), 'LINE', 'distance', '-1', false)).toThrow(RangeError)
})
it('filters origin candidates by exact owner/body/source only, leaving incidence for native authentication', () => {
  const e = { kind: 'edge' as const, component: point('path').component, body: point().body, edge: path().edge, support: 'line' as const }
  const choices = [point('path'), point('point'), { ...point('path'), body: { bodyId: 'other', sourceFeatureId: 'solid' } }, { ...point('path'), vertex: { ...point().vertex, sourceFeatureId: 'other' } }].map((reference, i) => ({ key: String(i), label: 'unproven vertex', reference }))
  expect(linePathOrigins(choices, e).map(p => p.key)).toEqual(['0']); expect(linePathOrigins(choices, null)).toEqual([])
})
it('renders explicit material origin and mode controls; stale retained choices block preview', () => {
  const html = renderToStaticMarkup(<Panel mate={mate()} points={[]} edges={[]} disabled={false} onPreview={vi.fn()} onCancelEdit={vi.fn()} />)
  for (const label of ['Punto del trayecto LINE', 'Arista del trayecto LINE', 'Origen del trayecto LINE', 'Modo del trayecto LINE', 'Valor del trayecto LINE', 'Invertir trayecto LINE', 'Cancelar edición de trayecto LINE']) expect(html).toContain(label)
  expect(html).toContain('pendiente de elección actual'); expect(html).toContain('<button disabled="">Vista previa'); expect(html).not.toContain('Seleccionar en el modelo')
})
function reportFixture() {
  const document = createEmptyAssembly(), m = mate(); document.mates = [m]
  document.occurrences = ['point', 'path'].map(id => ({ id, name: id, definition: { id: 'original', revision: 'r1' }, pose: { translation: [0, 0, 0], rotation: [0, 0, 0, 1] }, fixed: false, visible: true, suppressed: false }))
  const report: AssemblyLinePathSupportReport = { kind: 'line-path', mateId: m.id, scopePath: [], componentPaths: { point: ['point'], path: ['path'] }, position: m.position, orientation: m.orientation, curveLengthMm: 6, coordinateMm: 4.5, targetCoordinateMm: 4.5, transverseResidualMm: 1e-10, coordinateResidualMm: 1e-10, positionResidualMm: 1e-10, lengthTolerance: 1e-6, orientationResidualRad: null, rollResidualRad: null, precision: { positionErrorMm: 1e-12, directionErrorRad: 1e-12, orientationErrorRad: null, rollErrorRad: null }, angleTolerance: 1e-8, satisfied: true, underlyingLine: true, materialOrigin: true, verificationOnly: true }
  return { document, report }
}
it('accepts only consistent current-intent reports and rejects copied display purposes or residual failures', () => {
  const { document, report } = reportFixture(); expect(assemblyLinePathUiReports(document, [report])).toEqual([report]); expect(assemblyLinePathUiReports(document, [report, report])).toEqual([])
  expect(assemblyLinePathUiReports(document, [{ ...report, coordinateResidualMm: -1e-10 }])).toHaveLength(1)
  for (const patch of [{ materialOrigin: false }, { underlyingLine: false }, { verificationOnly: false }, { position: { mode: 'free' } }, { componentPaths: { point: ['path'], path: ['point'] } }, { curveLengthMm: 0 }, { coordinateMm: NaN }, { transverseResidualMm: -1 }, { coordinateResidualMm: 2e-6 }, { coordinateResidualMm: -2e-6 }, { positionResidualMm: 2e-6 }, { lengthTolerance: 0 }, { targetCoordinateMm: null }, { targetCoordinateMm: 1 }, { coordinateMm: 1 }]) expect(assemblyLinePathUiReports(document, [{ ...report, ...patch } as AssemblyLinePathSupportReport])).toEqual([])
})
it('authors component-axis follow separately from position reverse and renders both controls', () => {
  const orientation = { pitchYaw: { mode: 'follow' as const, axis: 'y' as const, reverse: false }, roll: 'free' as const }, proposal = assemblyLinePathUiProposal(point(), path(), 'Follow original', 'distance', '1', true, orientation)
  expect(proposal.position).toEqual({ mode: 'distance', distanceMm: 1, reverse: true }); expect(proposal.orientation).toEqual(orientation)
  const html = renderToStaticMarkup(<Panel mate={{ id: 'follow', ...proposal }} points={[]} edges={[]} disabled={false} onPreview={vi.fn()} onCancelEdit={vi.fn()} />)
  for (const label of ['Orientación del trayecto LINE', 'Eje de orientación del trayecto LINE', 'Invertir orientación del trayecto LINE', 'Invertir trayecto LINE']) expect(html).toContain(label)
  expect(html).toContain('giro alrededor del trayecto permanece libre')
})
it('requires current angular evidence for follow while free orientation has no angular lock report', () => {
  const { document, report } = reportFixture(), m = document.mates[0]
  if (m.type !== 'line-path') throw Error('Expected original LINE mate')
  m.orientation = { pitchYaw: { mode: 'follow', axis: 'z', reverse: true }, roll: 'free' }
  const follow = { ...report, orientation: m.orientation, orientationResidualRad: 1e-10, precision: { ...report.precision, orientationErrorRad: 1e-12 } }
  expect(assemblyLinePathUiReports(document, [follow])).toEqual([follow])
  for (const patch of [{ orientationResidualRad: null }, { orientationResidualRad: -1 }, { orientationResidualRad: 1e-7 }, { angleTolerance: 0 }, { orientation: { pitchYaw: 'free', roll: 'free' } }]) expect(assemblyLinePathUiReports(document, [{ ...follow, ...patch } as AssemblyLinePathSupportReport])).toEqual([])
  m.orientation = { pitchYaw: 'free', roll: 'free' }
  expect(assemblyLinePathUiReports(document, [{ ...report, orientationResidualRad: 0 }])).toEqual([])
})

const guide = (): LinePathGuideReference => ({ kind: 'face', support: 'plane', component: point('guide').component, body: point().body, face: { sourceFeatureId: 'solid', key: 'original-plane' } })
const upOrientation = (axis: 'y' | 'z' = 'y', reverse = false) => ({ pitchYaw: { mode: 'follow' as const, axis: 'x' as const, reverse: false }, roll: { mode: 'up' as const, axis, reverse, guide: guide() } })
it('matches the normalized proposal and saved UP guide to scene key order without losing locator identity', () => {
  const original = guide(), sceneGuide: LinePathGuideReference = { kind: 'face', component: original.component, body: original.body, face: original.face, support: 'plane' }
  const proposal = assemblyLinePathUiProposal(point(), path(), 'UP saved', 'distance', '1', false, { ...upOrientation(), roll: { ...upOrientation().roll, guide: sceneGuide } })
  if (proposal.orientation.roll === 'free') throw Error('Expected original UP')
  const savedGuide = proposal.orientation.roll.guide
  expect(JSON.stringify(sceneGuide)).not.toBe(JSON.stringify(savedGuide))
  expect(sameLinePathGuide(sceneGuide, savedGuide)).toBe(true)
  expect(sameLinePathGuide(structuredClone(savedGuide), sceneGuide)).toBe(true)
  for (const changed of [
    { ...sceneGuide, component: { ...sceneGuide.component, occurrencePath: ['outer', 'guide'] } },
    { ...sceneGuide, component: { ...sceneGuide.component, definition: { ...sceneGuide.component.definition, revision: 'r2' } } },
    { ...sceneGuide, body: { ...sceneGuide.body!, bodyId: 'other' } },
    { ...sceneGuide, face: { ...sceneGuide.face, key: 'other-plane' } },
    { ...sceneGuide, support: 'axis' },
    { kind: 'principal-plane', component: sceneGuide.component, plane: 'XY' },
  ]) expect(sameLinePathGuide(savedGuide, changed)).toBe(false)
  const key = JSON.stringify(sceneGuide)
  const html = renderToStaticMarkup(<Panel mate={{ id: 'up', ...proposal }} points={[]} edges={[]} guides={[{ key, label: 'Original current guide', reference: sceneGuide }]} disabled={false} onPreview={vi.fn()} onCancelEdit={vi.fn()} />)
  expect(html).toContain('selected="">Original current guide</option>')
  expect(html).not.toContain('Elige una cara plana material disponible como guía UP.')
  expect(JSON.stringify(sceneGuide)).toBe(key)
})
it('authors an explicit detached third planar UP role and keeps three reverse controls independent', () => {
  const orientation = upOrientation('z', true), original = structuredClone(orientation), proposal = assemblyLinePathUiProposal(point(), path(), 'UP original', 'percent', '25', true, orientation)
  expect(proposal.orientation).toEqual(original)
  expect(proposal.position).toEqual({ mode: 'percent', percent: 25, reverse: true })
  expect(proposal.orientation.pitchYaw).toEqual({ mode: 'follow', axis: 'x', reverse: false })
  if (proposal.orientation.roll === 'free') throw Error('Expected original UP')
  proposal.orientation.roll.guide.face.key = 'changed'
  expect(orientation).toEqual(original)
  expect(() => assemblyLinePathUiProposal(point(), path(), 'UP', 'free', '', false, { pitchYaw: 'free', roll: original.roll } as never)).toThrow()
  expect(() => assemblyLinePathUiProposal(point(), path(), 'UP', 'free', '', false, { ...original, pitchYaw: { mode: 'follow', axis: 'z', reverse: false } })).toThrow()
})
it('renders retained guide/UP axis/reverse explicitly, blocks stale or colliding drafts, and locks every control for ready preview', () => {
  const proposal = assemblyLinePathUiProposal(point(), path(), 'UP original', 'distance', '1', false, upOrientation()), saved = { id: 'up', ...proposal }
  const render = (mate: AssemblyLinePathMate, disabled = false) => renderToStaticMarkup(<Panel mate={mate} points={[]} edges={[]} guides={[]} disabled={disabled} onPreview={vi.fn()} onCancelEdit={vi.fn()} />)
  const html = render(saved)
  for (const label of ['Giro del trayecto LINE', 'Guía UP del trayecto LINE', 'Eje UP del trayecto LINE', 'Invertir UP del trayecto LINE']) expect(html).toContain(label)
  expect(html).toContain('cara plana material disponible'); expect(html).toContain('<button disabled="">Vista previa')
  const conflicting = { ...saved, orientation: { ...upOrientation(), pitchYaw: { mode: 'follow' as const, axis: 'y' as const, reverse: false } } }
  expect(render(conflicting)).toContain('El eje UP y el eje del trayecto deben ser diferentes')
  expect(render({ ...saved, orientation: { pitchYaw: 'free', roll: upOrientation().roll } } as never)).toContain('Vector UP necesita alinear primero')
  const locked = render(saved, true)
  expect([...locked.matchAll(/<(?:input|select|button)\b[^>]*>/g)].every(m => m[0].includes('disabled'))).toBe(true)
})
it('requires all three exact current paths and complete UP residual/precision evidence without accepting an extra UP role for legacy Free', () => {
  const { document, report } = reportFixture(), m = document.mates[0]
  if (m.type !== 'line-path') throw Error('Expected original LINE')
  m.orientation = upOrientation()
  document.occurrences.push({ ...structuredClone(document.occurrences[0]), id: 'guide', name: 'guide' })
  const up: AssemblyLinePathSupportReport = { ...report, orientation: m.orientation, componentPaths: { ...report.componentPaths, up: ['guide'] }, orientationResidualRad: 1e-10, rollResidualRad: 1e-10, precision: { ...report.precision, orientationErrorRad: 1e-12, rollErrorRad: 1e-12 } }
  expect(assemblyLinePathUiReports(document, [up])).toEqual([up])
  expect(assemblyLinePathUiReports(document, [{ ...up, rollResidualRad: 5e-9, precision: { ...up.precision, rollErrorRad: 5e-9 } }])).toHaveLength(1)
  expect(assemblyLinePathUiReports(document, [{ ...up, rollResidualRad: 6e-9, precision: { ...up.precision, rollErrorRad: 5e-9 } }])).toEqual([])
  for (const patch of [{ componentPaths: { point: ['point'], path: ['path'] } }, { componentPaths: { ...up.componentPaths, up: ['point'] } }, { componentPaths: { ...up.componentPaths, extra: ['guide'] } }, { rollResidualRad: null }, { rollResidualRad: -1 }, { rollResidualRad: 1e-7 }, { rollResidualRad: NaN }, { precision: { ...up.precision, rollErrorRad: null } }, { precision: { ...up.precision, rollErrorRad: -1 } }, { precision: { ...up.precision, rollErrorRad: Infinity } }, { orientation: upOrientation('z') }]) expect(assemblyLinePathUiReports(document, [{ ...up, ...patch } as AssemblyLinePathSupportReport])).toEqual([])
  m.orientation = { pitchYaw: 'free', roll: 'free' }
  expect(assemblyLinePathUiReports(document, [{ ...report, componentPaths: up.componentPaths }])).toEqual([])
  expect(assemblyLinePathUiReports(document, [{ ...report, rollResidualRad: 0 }])).toEqual([])
  expect(assemblyLinePathUiReports(document, [{ ...report, precision: { ...report.precision, rollErrorRad: 0 } }])).toEqual([])
  expect(assemblyLinePathUiReports(document, [{ ...report, precision: undefined } as never])).toEqual([])
})

it('offers only current visible material planes from the exact body and scope, detached from scene display data', () => {
  const component = { ...point('guide').component, occurrencePath: ['outer', 'guide'] }, selection = { component, body: point().body, face: guide().face }
  const plane = { selection, support: { kind: 'plane', point: [2, 0, 0], normal: [1, 0, 0], xDirection: [0, 1, 0], tolerance: 1e-8 } }
  const body = { visible: true, name: 'Original guide', component, body: point().body, faces: [plane, { ...plane, selection: { ...selection, component: point('foreign').component } }, { ...plane, support: { kind: 'cylinder' } }] }
  const scene = { bodies: [body, { ...body, visible: false }, { ...body, component: point('elsewhere').component }] } as never
  const choices = assemblyLinePathUiChoices(scene, ['outer'])
  expect(choices.guides).toHaveLength(1); expect(choices.guides[0].reference).toEqual({ kind: 'face', ...selection, component: { ...component, occurrencePath: ['guide'] }, support: 'plane' })
  choices.guides[0].reference.component.occurrencePath[0] = 'changed'
  expect(component.occurrencePath).toEqual(['outer', 'guide'])
  expect(assemblyLinePathUiChoices(scene, ['unrelated']).guides).toEqual([])
})
