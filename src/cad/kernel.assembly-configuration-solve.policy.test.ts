import { expect, it } from 'vitest'
import { prepareConfiguredAssemblySolve, applyPreparedConfiguredAssemblySolve } from './kernel.assembly-configuration-solve'
import type { AssemblyConfigurationGeometryInput } from './kernel.assembly-configuration-snapshot'

// Authored empty assembly: exercises declaration/transaction policy without
// native shapes, solver equations or any claim of CAD geometry coverage.
function empty(): AssemblyConfigurationGeometryInput {
  return { document: { version: 2, kind: 'assembly', id: 'original-empty-configuration', revision: 'r1', name: 'Original empty assembly', units: 'mm', createdAt: '2026-10-23T00:00:00.000Z', updatedAt: '2026-10-23T00:00:00.000Z', definitions: [], occurrences: [], mates: [] }, catalog: [], rootConfiguration: null, generation: 7 }
}
it('prepares and applies an unchanged empty selected state with exact detached ownership', () => {
  const current = empty(), before = JSON.stringify(current), prepared = prepareConfiguredAssemblySolve(current)
  expect(prepared.changed).toBe(false); expect(prepared.status).toBe('prepared'); expect(prepared.states).toHaveLength(1)
  expect(prepared.verification.accepted).toBe(true); expect(prepared.verification.reports).toEqual([])
  const applied = applyPreparedConfiguredAssemblySolve(structuredClone(current), prepared)
  expect(applied).toEqual(current); expect(applied).not.toBe(current); expect(applied.document).not.toBe(current.document)
  expect(Object.isFrozen(applied.document)).toBe(true); expect(JSON.stringify(current)).toBe(before)
  expect(() => applyPreparedConfiguredAssemblySolve(current, prepared)).toThrow(/consumed/)
})
it('rejects copied and data-only preparation authority without consuming the actual handle', () => {
  const current = empty(), prepared = prepareConfiguredAssemblySolve(current)
  for (const fake of [structuredClone(prepared), prepared.candidate, prepared.verification, {}, null]) expect(() => applyPreparedConfiguredAssemblySolve(current, fake)).toThrow()
  expect(applyPreparedConfiguredAssemblySolve(current, prepared)).toEqual(current)
})
it('permanently consumes a stale preparation even after the previous generation is restored', () => {
  const current = empty(), prepared = prepareConfiguredAssemblySolve(current)
  current.generation++
  expect(() => applyPreparedConfiguredAssemblySolve(current, prepared)).toThrow(/baseline/)
  current.generation--
  expect(() => applyPreparedConfiguredAssemblySolve(current, prepared)).toThrow(/consumed/)
})
it('consumes a handle on invalid complete-context input without executing a getter', () => {
  const current = empty(), prepared = prepareConfiguredAssemblySolve(current); let reads = 0
  const invalid = Object.defineProperty({}, 'document', { enumerable: true, get() { reads++; return current.document } })
  expect(() => applyPreparedConfiguredAssemblySolve(invalid as never, prepared)).toThrow()
  expect(reads).toBe(0); expect(() => applyPreparedConfiguredAssemblySolve(current, prepared)).toThrow(/consumed/)
})
it('rejects executable nested options, fields and invalid bounded policies before preparation', () => {
  const current = empty(); let reads = 0
  const executable = Object.defineProperty({}, 'maxIterations', { enumerable: true, get() { reads++; return 1 } })
  const svd = Object.defineProperty({}, 'maxSweeps', { enumerable: true, get() { reads++; return 1 } })
  for (const options of [{ solver: executable }, { solver: { svd } }, { unknown: 1 }, { solver: { maxIterations: 201 } }, { solver: { maxTrials: Infinity } }, { solver: { lengthRefinementTolerance: 2e-6 } }, { solver: { angleRefinementTolerance: 2e-8 } }]) expect(() => prepareConfiguredAssemblySolve(current, options as never)).toThrow()
  expect(reads).toBe(0)
})
it.each([-1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects unsafe complete-context generation %s', generation => {
  expect(() => prepareConfiguredAssemblySolve({ ...empty(), generation })).toThrow(/generation/)
})
