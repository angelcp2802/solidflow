import { expect, it, vi } from 'vitest'
import { createAssemblyExample, createEmptyAssembly } from '../examples/assembly'
import { insertAssemblyDocument } from './assemblyImport'
import { expandAssemblyParts, serializeAssemblyDocument, type AssemblyDefinitionReference, type AssemblyDocument } from './assemblyDocument'
import { AssemblyDocumentHistory } from './assemblyEditing'
import { identityRigidPose } from './rigidPose'
import { decodeStepSource, type StepSource } from './stepSource'
import type { StepFile } from './stepImport'
import { insertAssemblyStepFile } from './assemblyStepInsertion'

// These original graph/byte fixtures test transaction boundaries only. The
// injected prepare callback is not evidence of native STEP or scene admission.
function fixture() {
  const current = createEmptyAssembly('Original parent'), incoming = createAssemblyExample(), bytes = new Uint8Array([1, 2, 3])
  let generation = 4, scopePath = '[]'
  const io = { current, fresh: () => generation === 4 && scopePath === '[]',
    read: vi.fn(async (): Promise<StepFile | null> => ({ name: 'Original.step', data: bytes })),
    prepare: vi.fn(async (parent: AssemblyDocument, _source: StepSource, scope?: AssemblyDefinitionReference) => insertAssemblyDocument(parent, incoming, scope)),
    commit: vi.fn((_document: AssemblyDocument) => undefined) }
  return { io, current, incoming, bytes, stale: () => { generation++ }, awayAndBack: () => { scopePath='["sub"]'; generation++; scopePath='[]' } }
}
it('owns parent and bytes before asynchronous preparation and commits one ordinary history edit', async () => {
  const h = fixture(), before = serializeAssemblyDocument(h.current), history = new AssemblyDocumentHistory(h.current)
  const prepare = h.io.prepare.getMockImplementation()!
  h.io.prepare.mockImplementation(async (parent, source, scope) => {
    expect(parent).not.toBe(h.current); h.bytes.fill(9)
    expect(decodeStepSource(source)).toEqual(new Uint8Array([1, 2, 3]))
    return prepare(parent, source, scope)
  })
  h.io.commit.mockImplementation(document => { history.commitDocument(document) })
  expect(await insertAssemblyStepFile(h.io)).toBe('inserted')
  expect(h.io.commit).toHaveBeenCalledTimes(1)
  expect(history.current.id).toBe(h.current.id); expect(history.current.revision).toBe(h.current.revision)
  expect(expandAssemblyParts(history.current)).toHaveLength(3)
  const accepted = serializeAssemblyDocument(history.current)
  history.undo(); expect(serializeAssemblyDocument(history.current)).toBe(before)
  history.redo(); expect(serializeAssemblyDocument(history.current)).toBe(accepted)
  expect(serializeAssemblyDocument(h.current)).toBe(before)
})
it('captures an existing shared scope before reading and edits every reused occurrence of that definition', async () => {
  const h = fixture(), stamp = h.current.createdAt
  h.current.definitions.push({ kind:'assembly',id:'sub',revision:'r1',name:'Original shared scope',createdAt:stamp,updatedAt:stamp,occurrences:[],mates:[] })
  h.current.occurrences = ['left','right'].map(id=>({id,name:id,definition:{id:'sub',revision:'r1'},pose:identityRigidPose(),fixed:false,suppressed:false,visible:true}))
  const scope = {id:'sub',revision:'r1'}, oldRead=h.io.read.getMockImplementation()!
  h.io.read.mockImplementation(async()=>{scope.id='changed-after-picker';return oldRead()})
  expect(await insertAssemblyStepFile({...h.io,scope})).toBe('inserted')
  expect(h.io.prepare.mock.calls[0][2]).toEqual({id:'sub',revision:'r1'})
  const result=h.io.commit.mock.calls[0][0]
  expect(result.occurrences).toEqual(h.current.occurrences)
  expect(expandAssemblyParts(result)).toHaveLength(6)
})
it('cancels a file dialog without preparing or committing any parent state', async () => {
  const h=fixture();h.io.read.mockResolvedValue(null)
  expect(await insertAssemblyStepFile(h.io)).toBe('cancelled')
  expect(h.io.prepare).not.toHaveBeenCalled();expect(h.io.commit).not.toHaveBeenCalled()
})
it.each(['read','prepare','away-and-back'] as const)('refuses stale completion at %s', async boundary => {
  const h=fixture()
  if(boundary==='read')h.io.read.mockImplementation(async()=>{h.stale();return {name:'Original.step',data:h.bytes}})
  else {const prepare=h.io.prepare.getMockImplementation()!;h.io.prepare.mockImplementation(async(...args)=>{const result=await prepare(...args);boundary==='away-and-back'?h.awayAndBack():h.stale();return result})}
  expect(await insertAssemblyStepFile(h.io)).toBe('stale');expect(h.io.commit).not.toHaveBeenCalled()
  if(boundary==='read')expect(h.io.prepare).not.toHaveBeenCalled()
})
it('rejects malformed scope data and foreign scope before file access, without invoking getters', async () => {
  let calls=0
  const accessor={get id(){calls++;return 'sub'},revision:'r1'}
  for(const scope of [accessor,{id:'foreign',revision:'r1'},{id:'root',revision:'r1',extra:true}]) {
    const h=fixture();await expect(insertAssemblyStepFile({...h.io,scope})).rejects.toThrow()
    expect(h.io.read).not.toHaveBeenCalled();expect(h.io.commit).not.toHaveBeenCalled()
  }
  expect(calls).toBe(0)
})
it('withholds worker refusal and a response that replaces the parent identity', async () => {
  const failed=fixture();failed.io.prepare.mockRejectedValue(Error('Independent native scene refusal'))
  await expect(insertAssemblyStepFile(failed.io)).rejects.toThrow('Independent native scene refusal');expect(failed.io.commit).not.toHaveBeenCalled()
  const wrong=fixture();wrong.io.prepare.mockResolvedValue(wrong.incoming)
  await expect(insertAssemblyStepFile(wrong.io)).rejects.toThrow(/identidad/);expect(wrong.io.commit).not.toHaveBeenCalled()
})
it('rejects non-STEP input without a worker request', async () => {
  const h=fixture();h.io.read.mockResolvedValue({name:'Original.solidflow',data:h.bytes})
  await expect(insertAssemblyStepFile(h.io)).rejects.toThrow(/step/);expect(h.io.prepare).not.toHaveBeenCalled()
})
