import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { createEmptyAssembly } from '../examples/assembly'
import { serializeAssemblyDocument } from '../model/assemblyDocument'
import { createAssemblyRootRevision } from '../model/assemblyRevisions'
import type { AssemblyPreviewReply } from '../cad/kernel.assembly-types'
import AssemblyRootRevisionDialog from './AssemblyRootRevisionDialog'
import { assemblyRootRevisionTicket, assemblyRootRevisionTicketIsCurrent, assemblyRootRevisionReplyMatches } from './assemblyRootRevisionUi'

// Original symbolic UI-boundary data. These DTOs confer no native capability.
function original() { const doc = createEmptyAssembly('Original source revision UI'); doc.id = 'original-source'; doc.revision = 'r0'; return doc }
function reply(doc = original()): Extract<AssemblyPreviewReply, { status: 'ready' }> {
  return { kind: 'assembly-preview', status: 'ready', token: 'symbolic-display-only', document: createAssemblyRootRevision(doc, 'authored-next'),
    scene: { kind: 'assembly-scene', sceneId: 'symbolic', bodies: [], bounds: null, visibleBounds: null, volume: 0, area: 0, solidCount: 0, prototypeCount: 0, warnings: [] }, scopes: [], checks: [] }
}
it('binds root revision intent to the complete committed document and operation generation', () => {
  const doc = original(), before = serializeAssemblyDocument(doc), ticket = assemblyRootRevisionTicket(doc, 7, 'authored-next')
  expect(assemblyRootRevisionTicketIsCurrent(ticket, doc, 7, true)).toBe(true)
  expect(assemblyRootRevisionTicketIsCurrent(ticket, doc, 8, true)).toBe(false)
  expect(assemblyRootRevisionTicketIsCurrent(ticket, doc, 7, false)).toBe(false)
  const changed = structuredClone(doc); changed.name = 'Changed behind the modal'
  expect(assemblyRootRevisionTicketIsCurrent(ticket, changed, 7, true)).toBe(false)
  expect(serializeAssemblyDocument(doc)).toBe(before)
})
it('preflights invalid, existing and colliding revision labels without changing the document', () => {
  const doc = original(), before = serializeAssemblyDocument(doc)
  for (const revision of ['', ' ', 'r0', 'bad\nlabel', 'a'.repeat(129)]) expect(() => assemblyRootRevisionTicket(doc, 1, revision)).toThrow()
  expect(serializeAssemblyDocument(doc)).toBe(before)
})
it('accepts only the requested normalized root proposal and a later worker-owned timestamp', () => {
  const doc = original(), ticket = assemblyRootRevisionTicket(doc, 1, 'authored-next'), value = reply(doc)
  expect(assemblyRootRevisionReplyMatches(value, ticket, doc)).toBe(true)
  const later = structuredClone(value); later.document.updatedAt = new Date(Date.parse(value.document.updatedAt) + 100).toISOString()
  expect(assemblyRootRevisionReplyMatches(later, ticket, doc)).toBe(true)
  for (const mutate of [
    (v: typeof value) => { v.document.revision = 'other' },
    (v: typeof value) => { v.document.id = 'another-source' },
    (v: typeof value) => { v.document.name = 'Unreviewed change' },
    (v: typeof value) => { v.document.updatedAt = doc.updatedAt },
  ]) { const changed = structuredClone(value); mutate(changed); expect(assemblyRootRevisionReplyMatches(changed, ticket, doc)).toBe(false) }
})
it('does not mistake rejection, changed base or executable document properties for a matching candidate', () => {
  const doc = original(), ticket = assemblyRootRevisionTicket(doc, 1, 'authored-next'), value = reply(doc)
  const changed = structuredClone(doc); changed.name = 'New committed base'
  expect(assemblyRootRevisionReplyMatches(value, ticket, changed)).toBe(false)
  let reads = 0; Object.defineProperty(value.document, 'revision', { enumerable: true, get() { reads++; return 'authored-next' } })
  expect(assemblyRootRevisionReplyMatches(value, ticket, doc)).toBe(false); expect(reads).toBe(0)
})
it('renders explicit root identity and revision authoring separately from saving and Apply', () => {
  const html = renderToStaticMarkup(<AssemblyRootRevisionDialog id="original-source" currentRevision="r0" revision="authored-next" error="" onRevision={() => undefined} onPreview={() => undefined} onCancel={() => undefined} />)
  expect(html).toContain('role="dialog"'); expect(html).toContain('aria-modal="true"'); expect(html).toContain('original-source'); expect(html).toContain('r0')
  expect(html).toContain('aria-label="Nueva revisión del ensamblaje"'); expect(html).toContain('value="authored-next"')
  expect(html).toContain('aria-label="Vista previa de nueva revisión"'); expect(html).toContain('aria-label="Cancelar creación de revisión"')
  expect(html).toContain('Después guarda el archivo'); expect(html).not.toContain('onClick='); expect(html).not.toContain('Guardar nueva revisión')
})
it('blocks an empty proposal and retains a visible validation error in the dialog', () => {
  const html = renderToStaticMarkup(<AssemblyRootRevisionDialog id="original-source" currentRevision="r0" revision="" error="La revisión ya existe." onRevision={() => undefined} onPreview={() => undefined} onCancel={() => undefined} />)
  expect(html).toMatch(/<button(?=[^>]*aria-label="Vista previa de nueva revisión")(?=[^>]*disabled="")[^>]*>/)
  expect(html).toContain('role="alert">La revisión ya existe.'); expect(html).toContain('Cancelar creación de revisión')
})
