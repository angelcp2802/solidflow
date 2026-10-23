import { expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { identityRigidPose } from '../model/rigidPose'
import type { AssemblyGeometryReference } from '../model/assemblyDocument'
import type { AssemblyScene, AssemblySceneBody, AssemblySceneFace } from '../cad/kernel.assembly-types'
import type { AssemblyDirectedAngleReport, AssemblyDirectedAngleRequest } from '../model/assemblyDirectedAngle'
import AssemblyDirectedAnglePanel, { assemblyDirectedAngleChoices, assemblyDirectedAngleReferenceKey, assemblyDirectedAngleUiReport, assemblyDirectedAngleUiRequest,
  assemblyDirectedAngleReplyIsCurrent, type AssemblyDirectedAnglePanelProps } from './AssemblyDirectedAnglePanel'

// Original symbolic display choices and Cartesian direction data. These tests
// check UI consistency/SSR, not native BRep, worker execution or real pointer input.
const component = { occurrencePath: ['group', 'moving'], definition: { id: 'original-part', revision: 'r1' } }
const bodyRef = { bodyId: 'original-body', sourceFeatureId: 'solid' }
function face(axis = false): AssemblySceneFace {
  const support = axis ? { kind: 'cylinder' as const, point: [0, 0, 0] as [number, number, number], axis: [0, 0, 1] as [number, number, number], xDirection: [1, 0, 0] as [number, number, number], radius: 2, tolerance: 1e-7 }
    : { kind: 'plane' as const, point: [0, 0, 0] as [number, number, number], normal: [1, 0, 0] as [number, number, number], xDirection: [0, 1, 0] as [number, number, number], tolerance: 1e-7 }
  return { selection: { component: structuredClone(component), body: bodyRef, face: { sourceFeatureId: 'solid', key: `face-v1|${(axis ? 'b' : 'a').repeat(64)}` } }, support, worldSupport: structuredClone(support), vertices: [], triangles: [] }
}
function scene(): AssemblyScene {
  const body: AssemblySceneBody = { component: structuredClone(component), body: bodyRef, name: 'Original part', visible: true, worldPose: identityRigidPose(),
    vertices: [], normals: [], triangles: [], edgeLines: [], faces: [face(), face(true), { ...face(), support: null, worldSupport: null }],
    edges: [{ selection: { component: structuredClone(component), body: bodyRef, edge: { sourceFeatureId: 'solid', key: `edge-v1|${'c'.repeat(64)}` } }, support: { kind: 'line', point: [0, 0, 0], axis: [1, 0, 0], tolerance: 1e-7 }, worldSupport: { kind: 'line', point: [0, 0, 0], axis: [1, 0, 0], tolerance: 1e-7 }, lines: [] }],
    volume: 24, area: 52, solidCount: 1, bounds: { min: [0, 0, 0], max: [2, 3, 4] } }
  return { kind: 'assembly-scene', sceneId: 'original-display', bodies: [body], volume: 24, area: 52, solidCount: 1, prototypeCount: 1, bounds: body.bounds, visibleBounds: body.bounds, warnings: [] }
}
const components = () => [{ path: ['group', 'moving'], occurrence: { name: 'Moving', definition: { ...component.definition } }, visible: true, suppressed: false }]
const principal = (plane: 'XY' | 'YZ', moving = false): AssemblyGeometryReference => ({ kind: 'principal-plane', component: moving ? { ...structuredClone(component), occurrencePath: ['moving'] } : null, plane })
function request(): AssemblyDirectedAngleRequest { return { scopePath: ['group'], first: principal('YZ'), second: principal('YZ', true), guide: principal('XY') } }
function report(): AssemblyDirectedAngleReport {
  return { ...request(), coordinate: 'directed-about-axis', angleDegrees: 240, angleToleranceRadians: 1e-8, firstKind: 'plane', secondKind: 'plane', guideKind: 'plane',
    firstDirection: [1, 0, 0], secondDirection: [-.5, -Math.sqrt(3) / 2, 0], guideDirection: [0, 0, 1], projectionLengths: { first: 1, second: 1 }, supportOnly: true }
}
function props(): AssemblyDirectedAnglePanelProps {
  const value = request()
  return { choices: assemblyDirectedAngleChoices(scene(), ['group'], components()), selection: [value.first, value.second, value.guide].map(assemblyDirectedAngleReferenceKey) as [string, string, string],
    scopePath: ['group'], scopeName: 'Original group', report: report(), disabled: false, pending: false, onSelect: vi.fn(), onMeasure: vi.fn(), onClear: vi.fn() }
}
it('offers scope/component datums and only current supported visible face/LINE choices with relative identities', () => {
  const input = scene(), before = JSON.stringify(input), rows = components(), choices = assemblyDirectedAngleChoices(input, ['group'], rows)
  expect(choices).toHaveLength(15)
  expect(choices.filter(choice => choice.reference.kind === 'principal-plane')).toHaveLength(6)
  expect(choices.filter(choice => choice.reference.kind === 'face')).toHaveLength(2)
  expect(choices.filter(choice => choice.reference.kind === 'edge')).toHaveLength(1)
  for (const choice of choices) if (choice.reference.component) expect(choice.reference.component.occurrencePath).toEqual(['moving'])
  choices.find(choice => choice.reference.component)!.reference.component!.definition.revision = 'changed'; expect(rows[0].occurrence.definition.revision).toBe('r1'); expect(JSON.stringify(input)).toBe(before)
})
it('excludes hidden, suppressed and out-of-scope components while retaining scope datums', () => {
  const input = scene(); input.bodies[0].visible = false
  expect(assemblyDirectedAngleChoices(input, ['group'], [{ ...components()[0], visible: false }])).toHaveLength(6)
  expect(assemblyDirectedAngleChoices(null, ['group'], [{ ...components()[0], suppressed: true }])).toHaveLength(6)
  expect(assemblyDirectedAngleChoices(scene(), ['other'], components())).toHaveLength(6)
})
it('deduplicates exact references and never identifies choices by their labels', () => {
  const input = scene(); input.bodies.push(structuredClone(input.bodies[0])); const choices = assemblyDirectedAngleChoices(input, ['group'], [...components(), ...components()])
  expect(choices).toHaveLength(15); expect(new Set(choices.map(value => value.key)).size).toBe(15)
  const p = props(), value = assemblyDirectedAngleUiRequest(p.scopePath, p.selection, p.choices)
  expect(value).toEqual(request()); value!.second.component!.definition.revision = 'other'; expect(p.choices.some(choice => choice.reference.component?.definition.revision === 'other')).toBe(false)
  expect(assemblyDirectedAngleUiRequest(p.scopePath, ['', ...p.selection.slice(1)] as [string, string, string], p.choices)).toBeNull()
  expect(assemblyDirectedAngleUiRequest(p.scopePath, ['stale', ...p.selection.slice(1)] as [string, string, string], p.choices)).toBeNull()
})
it('distinguishes same-named bodies within one component without changing reference identities', () => {
  const input = scene(), second = structuredClone(input.bodies[0]), secondBody = { bodyId: 'second-body', sourceFeatureId: 'second-solid' }
  second.body = secondBody
  second.faces.forEach(face => { face.selection.body = secondBody })
  second.edges!.forEach(edge => { edge.selection.body = secondBody })
  input.bodies.push(second)
  const choices = assemblyDirectedAngleChoices(input, ['group'], components()).filter(choice => choice.reference.kind !== 'principal-plane' && choice.reference.kind !== 'principal-axis')
  expect(choices).toHaveLength(6); expect(new Set(choices.map(choice => choice.label)).size).toBe(6)
  expect(choices.slice(0, 3).every(choice => choice.label.includes('cuerpo 1 · Original part'))).toBe(true)
  expect(choices.slice(3).every(choice => choice.label.includes('cuerpo 2 · Original part'))).toBe(true)
  expect(choices[0].label.startsWith('Cara 1 · normal del plano')).toBe(true)
  expect(choices[1].label.startsWith('Cara 2 · eje cilíndrico')).toBe(true)
  expect(choices[2].label.startsWith('Arista 1 · línea')).toBe(true)
  expect(choices[0].key).not.toBe(choices[3].key)
  expect(choices[3].reference.kind === 'face' && choices[3].reference.body).toEqual(secondBody)
})
it('accepts a coherent 240-degree report without creating or retaining mutation authority', () => {
  const value = report(), result = assemblyDirectedAngleUiReport(request(), value)
  expect(result).toEqual(value); expect(result).not.toBe(value); result!.firstDirection[0] = 0; expect(value.firstDirection).toEqual([1, 0, 0])
  const html = renderToStaticMarkup(<AssemblyDirectedAnglePanel {...props()} />)
  expect(html).toContain('<output aria-label="Ángulo dirigido en grados">240</output>°</strong>'); expect(html).toContain('mano derecha'); expect(html).toContain('No cuenta vueltas ni crea una relación')
  expect(html).not.toContain('Aplicar'); expect(html).not.toContain('120°')
})
it.each(['angle', 'scope', 'reference', 'kind', 'guide', 'projection', 'tolerance', 'full-turn', 'invalid-direction'] as const)('hides inconsistent %s evidence', fault => {
  const value = report()
  if (fault === 'angle') value.angleDegrees = 120
  if (fault === 'scope') value.scopePath = []
  if (fault === 'reference') value.second = principal('XY', true)
  if (fault === 'kind') value.secondKind = 'line'
  if (fault === 'guide') value.guideDirection = [0, 0, -1]
  if (fault === 'projection') value.projectionLengths.first = .5
  if (fault === 'tolerance') value.angleToleranceRadians = .1
  if (fault === 'full-turn') value.angleDegrees = 360
  if (fault === 'invalid-direction') value.firstDirection = [0, 0, 0]
  expect(assemblyDirectedAngleUiReport(request(), value)).toBeNull()
  expect(renderToStaticMarkup(<AssemblyDirectedAnglePanel {...props()} report={value} />)).not.toContain('Ángulo dirigido medido')
})
it.each([false, true])('disables selections and measurement while blocked, pending=%s', pending => {
  const p = { ...props(), disabled: true, pending }, html = renderToStaticMarkup(<AssemblyDirectedAnglePanel {...p} />)
  expect(html.match(/<select[^>]*disabled=""/g)).toHaveLength(3)
  expect(html).toMatch(/<button(?=[^>]*aria-label="Medir ángulo dirigido")(?=[^>]*disabled="")[^>]*>/)
  expect(p.onMeasure).not.toHaveBeenCalled()
  if (pending) expect(html).toMatch(/<button aria-label="Cancelar medición angular">Cancelar<\/button>/)
})
it('retains unavailable choices visibly and prevents their measurement', () => {
  const p = props(); p.selection[0] = 'retired-reference'; const html = renderToStaticMarkup(<AssemblyDirectedAnglePanel {...p} />)
  expect(html).toContain('Referencia no actual · vuelve a seleccionar'); expect(html).not.toContain('Ángulo dirigido medido')
  expect(html).toMatch(/<button(?=[^>]*aria-label="Medir ángulo dirigido")(?=[^>]*disabled="")[^>]*>/)
})
it('drops late completions after cancel, document/ref/scope changes, unmount and a newer request', () => {
  const ticket = { generation: 3, documentSignature: 'original-document', requestSignature: 'scope-and-three-refs' }, current = { ...ticket, mounted: true }
  expect(assemblyDirectedAngleReplyIsCurrent(ticket, current)).toBe(true)
  for (const changed of [{ generation: 4 }, { documentSignature: 'new-document' }, { requestSignature: 'new-refs' }, { requestSignature: 'new-scope' }, { mounted: false }]) {
    expect(assemblyDirectedAngleReplyIsCurrent(ticket, { ...current, ...changed })).toBe(false)
  }
})
