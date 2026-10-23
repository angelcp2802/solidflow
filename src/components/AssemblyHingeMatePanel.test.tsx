import { expect, it, vi } from 'vitest'
import { Children, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import original from '../cad/fixtures/assembly-hinge-original.json'
import { validateAssemblyDocument } from '../model/assemblyDocument'
import type { AssemblyHingeSupportReport } from '../cad/kernel.assembly-types'
import { AssemblyHingeMatePanel, AssemblyHingeSupportSummary, assemblyHingeUiProposal, assemblyHingeUiReports,
  sameHingeReference, HINGE_ROLE_LABELS, type HingeUiReferences } from './AssemblyHingeMatePanel'

// Original declaration-only locators exercise UI identity, never native membership.
const d = validateAssemblyDocument(original), source = d.occurrences[0].definition
const ref = (owner: string, support: 'axis' | 'plane') => ({ kind: 'face' as const,
  component: { occurrencePath: [owner], definition: { ...source } }, body: { bodyId: 'original-hinge-body', sourceFeatureId: 'hole' },
  face: { sourceFeatureId: 'hole', key: 'face-v1|original-' + support }, support })
const refs = [ref('ground', 'axis'), ref('moving', 'axis'), ref('ground', 'plane'), ref('moving', 'plane')] as HingeUiReferences
function props(): ComponentProps<typeof AssemblyHingeMatePanel> {
  return { references: structuredClone(refs), axes: refs.slice(0, 2).map(r => ({ key: JSON.stringify(r), label: 'Original axis', reference: r! })),
    planes: refs.slice(2).map(r => ({ key: JSON.stringify(r), label: 'Original cap', reference: r! })), name: 'Original hinge', alignment: 'aligned',
    editing: false, disabled: false, picking: null, onReference: vi.fn(), onPick: vi.fn(), onName: vi.fn(), onAlignment: vi.fn(), onPreview: vi.fn(), onCancelEdit: vi.fn() }
}
interface Control { children?: ReactNode; 'aria-label'?: string; title?: string; disabled?: boolean; onClick?: () => void }
function controls(node: ReactNode): ReactElement<Control>[] {
  return Children.toArray(node).flatMap(c => isValidElement<Control>(c) ? [c, ...controls(c.props.children)] : [])
}
it('normalizes full four-role identities without depending on scene object field order', () => {
  const before = structuredClone(refs), p = assemblyHingeUiProposal(refs, ' Original hinge ', 'aligned')
  expect(p.name).toBe('Original hinge'); expect(p.axis).toHaveLength(2); expect(p.axial).toHaveLength(2)
  expect(JSON.stringify(p.axis[0])).not.toBe(JSON.stringify(refs[0]))
  expect(sameHingeReference(p.axis[0], refs[0])).toBe(true)
  expect(refs).toEqual(before); expect('first' in p).toBe(false); expect('second' in p).toBe(false)
  const changed = structuredClone(p.axis[0]); changed.component.definition.revision = 'other'
  expect(sameHingeReference(changed, refs[0])).toBe(false)
  expect(sameHingeReference({ ...p.axis[0], support: 'plane' }, refs[0])).toBe(false)
})
it('keeps a saved canonical axis selectable against reordered current scene data', () => {
  const p = props(), saved = assemblyHingeUiProposal(refs, p.name, p.alignment)
  p.axes[0].label = 'Ground cylindrical axis'; p.axes[1].label = 'Moving cylindrical axis'
  p.planes[0].label = 'Ground top cap at local z4'; p.planes[1].label = 'Moving bottom cap at local z0'
  p.references = [...saved.axis, ...saved.axial]
  const tree = AssemblyHingeMatePanel(p), add = controls(tree).find(c => c.type === 'button' && c.props.children === 'Añadir bisagra')!
  expect(add.props.disabled).toBe(false); add.props.onClick!(); expect(p.onPreview).toHaveBeenCalledOnce()
  expect(renderToStaticMarkup(tree)).not.toContain('Referencia guardada')
  const selected = controls(tree).filter(c => c.type === 'select' && HINGE_ROLE_LABELS.some(label => label === c.props['aria-label']))
  expect(selected.map(c => c.props.title)).toEqual(['Ground cylindrical axis', 'Moving cylindrical axis', 'Ground top cap at local z4', 'Moving bottom cap at local z0'])
})
it('requires all current roles, an explicit alignment and a nonempty name before submission', () => {
  const p = props(); p.references[3] = null
  expect(() => assemblyHingeUiProposal(p.references, p.name, 'aligned')).toThrow()
  expect(() => assemblyHingeUiProposal(refs, p.name, '')).toThrow()
  expect(() => assemblyHingeUiProposal(refs, ' ', 'aligned')).toThrow()
  p.references = structuredClone(refs); p.axes = []
  const add = controls(AssemblyHingeMatePanel(p)).find(c => c.type === 'button' && c.props.children === 'Añadir bisagra')!
  expect(add.props.disabled).toBe(true)
})
it('renders distinct face and LINE picking controls and blocks them during preview', () => {
  const p = props(); p.disabled = true; p.editing = true; p.picking = { slot: 1, producer: 'line-edge' }
  const tree = AssemblyHingeMatePanel(p), buttons = controls(tree).filter(c => c.type === 'button')
  expect(buttons.filter(c => c.props['aria-label']?.startsWith('Seleccionar '))).toHaveLength(6)
  expect(buttons.every(c => c.props.disabled)).toBe(true)
  const html = renderToStaticMarkup(tree)
  for (const label of HINGE_ROLE_LABELS.slice(0,4)) expect(html).toContain(label)
  expect(html).toContain('una arista recta'); expect(html).toContain('Cancelar edición de bisagra')
})
function reportFixture() {
  const doc = validateAssemblyDocument(d), proposal = assemblyHingeUiProposal(refs, 'Original hinge', 'aligned')
  doc.mates = [{ id: 'original', ...proposal }]
  const report: AssemblyHingeSupportReport = { status: 'ok', kind: 'hinge', mateId: 'original', scopePath: [], supportOnly: true,
    alignment: 'aligned', satisfied: true, qualifiedRotation: true, axisAngleRad: 0, transverseResidualMm: 0, axialOffsetMm: 0,
    axialityRad: [0, 0], lengthToleranceMm: 1e-6, angleToleranceRad: 1e-8, precision: { positionMm: 4e-7, directionRad: 1e-12 },
    componentPaths: { axis: [['ground'], ['moving']], axial: [['ground'], ['moving']] } }
  return { doc, report }
}
it('displays only current unsuppressed four-role reports whose residual and allowance fit', () => {
  const { doc, report } = reportFixture()
  expect(assemblyHingeUiReports(doc, [report])).toEqual([report])
  expect(renderToStaticMarkup(<AssemblyHingeSupportSummary document={doc} reports={[report]} />)).toContain('Bisagra verificada')
  const wrongRole = structuredClone(report); wrongRole.componentPaths.axial[1] = ['ground']
  expect(assemblyHingeUiReports(doc, [wrongRole])).toEqual([])
  expect(assemblyHingeUiReports(doc, [report, report])).toEqual([])
  expect(assemblyHingeUiReports(doc, [{ ...report, axialOffsetMm: 8e-7 }])).toEqual([])
  doc.mates[0].suppressed = true; expect(assemblyHingeUiReports(doc, [report])).toEqual([])
})
