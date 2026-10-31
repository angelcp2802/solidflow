import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { createEmptyAssembly } from '../examples/assembly'
import { validateAssemblyDocument, serializeAssemblyDocument, type AssemblyDocument, type AssemblySourceLink } from '../model/assemblyDocument'
import { validateDocument } from '../model/document'
import { setAssemblySourceLink } from '../model/assemblySourceLinks'
import { identityRigidPose } from '../model/rigidPose'
import { AssemblyLinkedSourceBindings, linkedSourceBindingKey, linkedSourceContentsEqual, linkedSourceDescriptor, linkedSourceTicketIsCurrent, linkedSourceFailureDisposition, releaseUnstagedLinkedRead, requireLinkedSourceUpdateRevision, type LinkedSourceTicket } from './assemblyLinkedSources'
import AssemblyLinkedSourcePanel from './AssemblyLinkedSourcePanel'

const stamp = '2026-10-22T00:00:00.000Z'
// Original GPL-3.0-only rectangle recipe. No file paths or native authority.
const part = () => validateDocument({ version: 1, id: 'original-linked-part', name: 'Original linked rectangle', units: 'mm', createdAt: stamp, updatedAt: stamp,
  features: [{ id: 'profile', name: 'Original rectangle', type: 'sketch', plane: 'XY', offset: 0, suppressed: false, profile: { kind: 'rectangle', center: [1, 1.5], width: 2, height: 3 } },
    { id: 'solid', name: 'Original extrusion', type: 'extrude', sketchId: 'profile', depth: 4, symmetric: false, suppressed: false, bodyOperation: { mode: 'new', bodyId: 'original-linked-body' } }] })
const ref = (d: {id:string;revision:string}) => ({id:d.id,revision:d.revision})
const link = (digest = 'a'.repeat(64)): AssemblySourceLink => ({ kind: 'local-file', displayName: 'original-source.solidflow', contentSha256: digest })
function original(): AssemblyDocument {
  const root = createEmptyAssembly('Original link host'), document = part()
  return validateAssemblyDocument({ ...root, definitions: [{ kind: 'part', id: document.id, revision: 'r0', document }], occurrences: ['left', 'right'].map(id => ({
    id, name: id, definition: { id: document.id, revision: 'r0' }, pose: identityRigidPose(), fixed: true, visible: true, suppressed: false })) })
}
const reordered = (value: unknown): unknown => Array.isArray(value) ? value.map(reordered) : value && typeof value === 'object'
  ? Object.fromEntries(Object.entries(value).reverse().map(([k, v]) => [k, reordered(v)])) : value

it('compares complete validated v1 cache data independent of key order and never equates a digest label with content', () => {
  const d = original(), source = d.definitions[0], before = serializeAssemblyDocument(d)
  expect(linkedSourceContentsEqual(d, source, reordered(part()))).toBe(true)
  const changed = part(); if (changed.features[1].type !== 'extrude') throw Error('Original extrusion required'); changed.features[1].depth = 5
  expect(linkedSourceContentsEqual(d, source, changed)).toBe(false)
  const linked = setAssemblySourceLink(d, ref(source), link())
  expect(linkedSourceContentsEqual(linked, source, changed)).toBe(false); expect(serializeAssemblyDocument(d)).toBe(before)
})

it('requires exact source kind and identity before either metadata attachment or unchanged-file status', () => {
  const d = original(), source = d.definitions[0]
  expect(() => linkedSourceContentsEqual(d, source, { ...part(), id: 'wrong-source' })).toThrow(/identidad/)
  expect(() => linkedSourceContentsEqual(d, source, createEmptyAssembly('Wrong kind'))).toThrow(/identidad/)
  let reads = 0; const executable = part(); Object.defineProperty(executable, 'features', { enumerable: true, get() { reads++; throw Error('Executable source') } })
  expect(() => linkedSourceContentsEqual(d, source, executable)).toThrow(); expect(reads).toBe(0)
})

function subassembly() {
  const child = original(), { version: _v, units: _u, definitions, ...root } = child
  const host = validateAssemblyDocument({ ...createEmptyAssembly('Original nested link host'), definitions: [...definitions, root], occurrences: [
    { id: 'sub', name: 'Original reused source', definition: { id: child.id, revision: child.revision }, pose: identityRigidPose(), fixed: false, visible: true, suppressed: false },
  ] })
  return { child, host, source: { id: child.id, revision: child.revision } }
}
it('compares v2 root and every source dependency while allowing unrelated host definitions', () => {
  const { child, host, source } = subassembly(), unrelated = part(); unrelated.id = 'unrelated-original'
  host.definitions.push({ kind: 'part', id: unrelated.id, revision: 'r0', document: unrelated })
  const linked = setAssemblySourceLink(host, source, link())
  expect(linkedSourceContentsEqual(linked, source, reordered(child))).toBe(true)
  const changed = validateAssemblyDocument(child); changed.occurrences[0].name = 'Changed exact root declaration'
  expect(linkedSourceContentsEqual(linked, source, changed)).toBe(false)
  const dependency = validateAssemblyDocument(child); dependency.definitions.push({ kind: 'part', id: unrelated.id, revision: 'r1', document: unrelated })
  expect(linkedSourceContentsEqual(linked, source, dependency)).toBe(false)
})

it('does not hide changed dormant or nested-link metadata in an otherwise matching v2 source', () => {
  const { child, host, source } = subassembly(), changed = validateAssemblyDocument(child)
  changed.definitions[0].sourceLink = link('b'.repeat(64))
  expect(linkedSourceContentsEqual(host, source, changed)).toBe(false)
  delete changed.definitions[0].sourceLink; changed.revision = 'new-source-revision'
  expect(linkedSourceContentsEqual(host, source, changed)).toBe(false)
})

it('rejects changed same-revision v2 source with an explicit message, preserving cache and revoking its current borrowed read', () => {
  const { child, host, source } = subassembly(), linked = setAssemblySourceLink(host, source, link()), changed = validateAssemblyDocument(child), before = serializeAssemblyDocument(linked), released: string[] = [], bindings = new AssemblyLinkedSourceBindings(id => released.push(id)), definition = linked.definitions.find(d => d.id === source.id)!
  bindings.bind(1, definition, 'current-read'); changed.occurrences[0].name = 'Changed without revision authoring'
  expect(linkedSourceContentsEqual(linked, source, changed)).toBe(false)
  expect(() => requireLinkedSourceUpdateRevision(source, changed)).toThrow(/revisión distinta/)
  releaseUnstagedLinkedRead('current-read', true, true, id => bindings.releaseGrant(id))
  expect(bindings.get(1, definition)).toBeUndefined(); expect(released).toEqual(['current-read']); expect(serializeAssemblyDocument(linked)).toBe(before)
  changed.revision = 'authored-r1'; expect(() => requireLinkedSourceUpdateRevision(source, changed)).not.toThrow()
})

it('retains main-process raw-byte digest including BOM independently from the delivered JSON content', () => {
  const read = { grantId: 'opaque-runtime-only', name: 'original-source.solidflow', content: JSON.stringify(part()), sha256: 'c'.repeat(64) }
  expect(linkedSourceDescriptor(read)).toEqual(link('c'.repeat(64)))
  expect(linkedSourceDescriptor(read)).not.toHaveProperty('grantId'); expect(linkedSourceDescriptor(read)).not.toHaveProperty('content')
  expect(() => linkedSourceDescriptor({ ...read, sha256: 'wrong' })).toThrow()
})

const ticket = (): LinkedSourceTicket => ({ epoch: 2, generation: 5, signature: 'exact-host', scopePath: '["sub"]', selectionPath: '["sub","left"]', definition: 'exact-part-r0', descriptor: 'exact-descriptor' })
it('rejects a delayed response after document, selection, scope, revision, descriptor or workspace-epoch drift', () => {
  const start = ticket(), now = { ...start, mounted: true }
  expect(linkedSourceTicketIsCurrent(start, now)).toBe(true)
  for (const change of [{ epoch: 3 }, { generation: 6 }, { signature: 'other-host' }, { scopePath: '[]' }, { selectionPath: '["sub","right"]' },
    { definition: 'same-id-r1' }, { descriptor: 'new-content-digest' }, { mounted: false }]) expect(linkedSourceTicketIsCurrent(start, { ...now, ...change })).toBe(false)
  expect(linkedSourceTicketIsCurrent(start, { ...now, generation: 7 })).toBe(false) // scope away and back cannot revive it
})

it('a saved descriptor alone cannot grant read permission or carry a runtime grant through serialization', () => {
  const d = original(), linked = setAssemblySourceLink(d, ref(d.definitions[0]), link()), released: string[] = [], bindings = new AssemblyLinkedSourceBindings(id => released.push(id))
  expect(bindings.get(1, linked.definitions[0])).toBeUndefined()
  bindings.bind(1, linked.definitions[0], 'read-grant-A'); expect(bindings.get(1, linked.definitions[0])).toBe('read-grant-A')
  expect(bindings.get(2, linked.definitions[0])).toBeUndefined(); expect(serializeAssemblyDocument(linked)).not.toContain('read-grant-A')
  bindings.clear(); expect(released).toEqual(['read-grant-A']); expect(bindings.get(1, linked.definitions[0])).toBeUndefined()
})

it('promotes a permission only to the exact accepted tuple/descriptor and revokes history drift without reviving it on Redo', () => {
  const d = original(), linked = setAssemblySourceLink(d, ref(d.definitions[0]), link()), next = validateAssemblyDocument(linked), released: string[] = [], bindings = new AssemblyLinkedSourceBindings(id => released.push(id))
  next.definitions[0].revision = 'r1'; next.definitions[0].sourceLink = link('b'.repeat(64)); next.occurrences.forEach(o => { o.definition.revision = 'r1' })
  bindings.bind(1, linked.definitions[0], 'read-grant-A'); expect(bindings.get(1, next.definitions[0])).toBeUndefined()
  bindings.bind(1, next.definitions[0], 'read-grant-A'); bindings.retain(1, next); expect(released).toEqual([])
  expect(bindings.get(1, linked.definitions[0])).toBeUndefined()
  bindings.retain(1, linked); expect(released).toEqual(['read-grant-A']); bindings.retain(1, next); expect(bindings.get(1, next.definitions[0])).toBeUndefined()
})

it('releasing an older captured grant leaves a newer bound choice intact', async () => {
  const d = original(), linked = setAssemblySourceLink(d, ref(d.definitions[0]), link()), released: string[] = [], bindings = new AssemblyLinkedSourceBindings(id => released.push(id))
  bindings.bind(1, linked.definitions[0], 'read-A')
  let finish!: () => void; const old = new Promise<void>(resolve => { finish = resolve }).then(() => bindings.releaseGrant('read-A'))
  bindings.bind(1, linked.definitions[0], 'read-B'); finish(); await old
  expect(bindings.get(1, linked.definitions[0])).toBe('read-B'); expect(released).not.toContain('read-B')
  const detached = setAssemblySourceLink(linked, ref(linked.definitions[0]), null); bindings.retain(1, detached); expect(released).toContain('read-B')
})

it('late reload A cannot revoke the borrowed binding used by reload B after cancellation before A read returns', async () => {
  const d = original(), linked = setAssemblySourceLink(d, ref(d.definitions[0]), link()), released: string[] = [], bindings = new AssemblyLinkedSourceBindings(id => released.push(id))
  bindings.bind(1, linked.definitions[0], 'shared-read')
  let finish!: () => void; const readA = new Promise<void>(resolve => { finish = resolve }).then(() => releaseUnstagedLinkedRead('shared-read', true, false, id => bindings.releaseGrant(id)))
  // Cancel A invalidates its ticket before it owns any pending source lease.
  // B can still borrow that exact already-bound grant.
  expect(bindings.get(1, linked.definitions[0])).toBe('shared-read'); finish(); await readA
  expect(bindings.get(1, linked.definitions[0])).toBe('shared-read'); expect(released).toEqual([])
  releaseUnstagedLinkedRead('new-chooser-A', false, false, id => bindings.releaseGrant(id))
  expect(released).toEqual(['new-chooser-A']); expect(bindings.get(1, linked.definitions[0])).toBe('shared-read')
  releaseUnstagedLinkedRead('shared-read', true, true, id => bindings.releaseGrant(id)) // current read failure can revoke its own binding
  expect(bindings.get(1, linked.definitions[0])).toBeUndefined()
})

it('retains a source-review lease after rejected solve for retry/Apply, while refusing a failed metadata-only attachment', () => {
  const d = original(), linked = setAssemblySourceLink(d, ref(d.definitions[0]), link()), released: string[] = [], bindings = new AssemblyLinkedSourceBindings(id => released.push(id)),
    pending = { grantId: 'reviewed-read', target: { id: d.definitions[0].id, revision: d.definitions[0].revision } }
  const discard = (value: typeof pending) => bindings.releaseGrant(value.grantId)
  linkedSourceFailureDisposition(pending, true, discard)
  expect(released).toEqual([]); expect(bindings.get(1, linked.definitions[0])).toBeUndefined() // rejected preview publishes nothing
  bindings.bind(1, linked.definitions[0], pending.grantId) // exact accepted retry, not the rejected report
  expect(bindings.get(1, linked.definitions[0])).toBe('reviewed-read')
  linkedSourceFailureDisposition({ ...pending, grantId: 'failed-metadata-only' }, false, discard)
  expect(released).toEqual(['failed-metadata-only']); expect(bindings.get(1, linked.definitions[0])).toBe('reviewed-read')
})

it('keys include all accepted source metadata and keep source type distinct', () => {
  const d = original(), linked = setAssemblySourceLink(d, ref(d.definitions[0]), link()), a = linked.definitions[0], changed = structuredClone(a)
  changed.sourceLink!.displayName = 'another-original.solidflow'; expect(linkedSourceBindingKey(1, a)).not.toBe(linkedSourceBindingKey(1, changed))
  changed.sourceLink = link('b'.repeat(64)); expect(linkedSourceBindingKey(1, a)).not.toBe(linkedSourceBindingKey(1, changed))
})

it('renders cached offline state and explicit controls without claiming a saved descriptor is connected', () => {
  const html = renderToStaticMarkup(<AssemblyLinkedSourcePanel sourceLink={link()} connected={false} available disabled={false} onChoose={() => {}} onReload={() => {}} onDetach={() => {}} />)
  expect(html).toContain('Copia incorporada disponible'); expect(html).toContain('Re-vincular archivo')
  expect(html).toMatch(/aria-label="Recargar origen enlazado" disabled/); expect(html).toContain('El archivo de origen no se modifica.')
  const ready = renderToStaticMarkup(<AssemblyLinkedSourcePanel sourceLink={link()} connected available disabled onChoose={() => {}} onReload={() => {}} onDetach={() => {}} />)
  expect(ready).toContain('Archivo vinculado:'); expect((ready.match(/disabled=""/g) ?? []).length).toBe(3)
})
