import { createEmptyAssembly } from '../examples/assembly'
import { AssemblyWidthSupportSummary, assemblyWidthUiReports } from './AssemblyWidthMatePanel'
import type { AssemblyWidthCenteredSupportReport } from '../cad/kernel.assembly-types'
import { expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Children, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from 'react'
import { AssemblyWidthMatePanel, assemblyWidthUiProposal, type WidthUiReferences, type WidthUiSlot, WIDTH_ROLE_LABELS } from './AssemblyWidthMatePanel'
const refs: WidthUiReferences = ['XY','XZ','YZ','XY'].map(plane=>({kind:'principal-plane',component:null,plane})) as WidthUiReferences
it('preserves four ordered original plane declarations without inventing binary endpoints',()=>{
  const before=JSON.stringify(refs), value=assemblyWidthUiProposal(refs,'Centrada','sum','difference','opposed')
  expect(value).toMatchObject({type:'width',mode:'centered',width:refs.slice(0,2),tab:refs.slice(2),widthBranch:'sum',tabBranch:'difference',alignment:'opposed'})
  expect('first' in value).toBe(false);expect('second' in value).toBe(false)
  expect(value.width[0]).not.toBe(refs[0]);expect(JSON.stringify(refs)).toBe(before)
})
it('requires all four planes and explicit branches and orientation',()=>{
  expect(()=>assemblyWidthUiProposal([refs[0],refs[1],refs[2],null],'Centrada','sum','difference','aligned')).toThrow()
  expect(()=>assemblyWidthUiProposal(refs,'Centrada','','difference','aligned')).toThrow()
  expect(()=>assemblyWidthUiProposal(refs,'Centrada','sum','difference','')).toThrow()
  expect(()=>assemblyWidthUiProposal([refs[0],refs[1],refs[2],{kind:'principal-axis',component:null,axis:'X'} as never],'Centrada','sum','difference','aligned')).toThrow()
})
it('renders four named plane roles and neutral branch choices in a blocked preview',()=>{
 const html=renderToStaticMarkup(<AssemblyWidthMatePanel references={refs} choices={[]} name="Centrada" widthBranch="sum" tabBranch="difference" alignment="aligned" editing disabled pickingIndex={null} onPick={vi.fn()} onReference={vi.fn()} onName={vi.fn()} onWidthBranch={vi.fn()} onTabBranch={vi.fn()} onAlignment={vi.fn()} onPreview={vi.fn()} onCancelEdit={vi.fn()} />)
 for(const label of WIDTH_ROLE_LABELS)expect(html).toContain(label)
 expect(html).toContain('Bisectriz 1');expect(html).toContain('Bisectriz 2');expect(html).toContain('Cancelar edición de anchura');expect(html).toContain('disabled=""')
})

function panelProps(): ComponentProps<typeof AssemblyWidthMatePanel> {
 return { references: structuredClone(refs), choices: [], name: 'Centrada', widthBranch: 'sum', tabBranch: 'difference', alignment: 'opposed', editing: false,
  disabled: false, pickingIndex: null, onPick: vi.fn(), onReference: vi.fn(), onName: vi.fn(), onWidthBranch: vi.fn(), onTabBranch: vi.fn(), onAlignment: vi.fn(), onPreview: vi.fn(), onCancelEdit: vi.fn() }
}
type ControlProps = { children?: ReactNode; 'aria-label'?: string; 'aria-pressed'?: boolean; disabled?: boolean; onClick?: () => void }
function elements(node: ReactNode): ReactElement<ControlProps>[] {
 return Children.toArray(node).flatMap(child => isValidElement<ControlProps>(child) ? [child, ...elements(child.props.children)] : [])
}
// These checks inspect the controlled component's rendered elements/SSR, not
// pointer events, native face queries or accepted preview authority.
it.each([0, 1, 2, 3] as const)('renders a distinct controlled viewport pick button for slot %s without nesting it inside a label', slot => {
 const props = panelProps(); props.pickingIndex = slot
 const tree = AssemblyWidthMatePanel(props), controls = elements(tree), html = renderToStaticMarkup(tree)
 const picks = controls.filter(value => value.type === 'button' && value.props['aria-label']?.startsWith('Seleccionar '))
 expect(picks).toHaveLength(4)
 for (const [index, label] of WIDTH_ROLE_LABELS.entries()) {
  expect(picks[index].props['aria-label']).toBe(`Seleccionar ${label} en el modelo`)
  expect(picks[index].props['aria-pressed']).toBe(index === slot)
  expect(picks[index].props.disabled).toBe(false)
  expect(html).toContain(`aria-label="${label}"`)
 }
 expect(html).toContain(`Selecciona una cara plana para ${WIDTH_ROLE_LABELS[slot]}`)
 expect(html).toContain('role="status"')
 expect(controls.filter(value => value.type === 'select' && WIDTH_ROLE_LABELS.some(label => label === value.props['aria-label']))).toHaveLength(4)
 for (const label of controls.filter(value => value.type === 'label')) expect(elements(label.props.children).some(value => value.type === 'button')).toBe(false)
})
it('routes each role to the parent without changing references, branches or the controlled picking state', () => {
 const props = panelProps(), before = structuredClone({ references: props.references, widthBranch: props.widthBranch, tabBranch: props.tabBranch, alignment: props.alignment })
 const picks = elements(AssemblyWidthMatePanel(props)).filter(value => value.type === 'button' && value.props['aria-label']?.startsWith('Seleccionar '))
 for (const pick of picks) pick.props.onClick!()
 expect(props.onPick).toHaveBeenNthCalledWith(1, 0); expect(props.onPick).toHaveBeenNthCalledWith(2, 1)
 expect(props.onPick).toHaveBeenNthCalledWith(3, 2); expect(props.onPick).toHaveBeenNthCalledWith(4, 3)
 expect(props.onReference).not.toHaveBeenCalled(); expect(props.onWidthBranch).not.toHaveBeenCalled(); expect(props.onTabBranch).not.toHaveBeenCalled(); expect(props.onAlignment).not.toHaveBeenCalled(); expect(props.onPreview).not.toHaveBeenCalled()
 expect(props.pickingIndex).toBeNull()
 expect({ references: props.references, widthBranch: props.widthBranch, tabBranch: props.tabBranch, alignment: props.alignment }).toEqual(before)
 expect(renderToStaticMarkup(<AssemblyWidthMatePanel {...props} />)).not.toContain('Selecciona una cara plana para')
})
it.each([null, 0, 3] as (WidthUiSlot | null)[])('blocks all four viewport and dropdown choices during a disabled preview (active=%s)', slot => {
 const props = panelProps(); props.disabled = true; props.pickingIndex = slot
 const controls = elements(AssemblyWidthMatePanel(props)), html = renderToStaticMarkup(<AssemblyWidthMatePanel {...props} />)
 const picks = controls.filter(value => value.type === 'button' && value.props['aria-label']?.startsWith('Seleccionar '))
 expect(picks).toHaveLength(4); expect(picks.every(value => value.props.disabled === true)).toBe(true)
 expect(picks.filter(value => value.props['aria-pressed'] === true)).toHaveLength(slot === null ? 0 : 1)
 const dropdowns = controls.filter(value => value.type === 'select' && WIDTH_ROLE_LABELS.some(label => label === value.props['aria-label']))
 expect(dropdowns).toHaveLength(4); expect(dropdowns.every(value => value.props.disabled === true)).toBe(true)
 if (slot !== null) expect(html).toContain(`Selecciona una cara plana para ${WIDTH_ROLE_LABELS[slot]}`)
 expect(props.onPick).not.toHaveBeenCalled()
})

function reportFixture() {
 const document=createEmptyAssembly(), mate={id:'width',...assemblyWidthUiProposal(refs,'Anchura original','sum','difference','opposed')};document.mates=[mate]
 const report:AssemblyWidthCenteredSupportReport={kind:'width',mode:'centered',scopePath:[],mateId:mate.id,widthBranch:'sum',tabBranch:'difference',alignment:'opposed',angleRadians:Math.PI/180,offsetMm:-.25,lengthTolerance:1,angleTolerance:.1,branchLengths:{width:2,tab:1},supportOnly:true}
 return {document,report}
}
it('formats radians as degrees and signed millimeters with infinite-plane qualification',()=>{
 const {document,report}=reportFixture(), html=renderToStaticMarkup(<AssemblyWidthSupportSummary document={document} reports={[report]} />)
 expect(html).toContain('1°');expect(html).toContain('-0.25 mm');expect(html).toContain('cuatro planos');expect(html).toContain('planos infinitos');expect(html).toContain('bisectrices opuestas')
})
it('does not display suppressed, mismatched, nonfinite or duplicate support reports',()=>{
 const {document,report}=reportFixture()
 expect(assemblyWidthUiReports(document,[{...report,widthBranch:'difference'}])).toEqual([])
 expect(assemblyWidthUiReports(document,[{...report,angleRadians:NaN}])).toEqual([])
 expect(assemblyWidthUiReports(document,[report,report])).toEqual([])
 document.mates[0].suppressed=true
 expect(assemblyWidthUiReports(document,[report])).toEqual([])
})
