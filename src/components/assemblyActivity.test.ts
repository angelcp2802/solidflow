import { expect, it } from 'vitest'
import { createAssemblyActivity } from './assemblyActivity'
import type { AssemblyExportOperation } from './assemblyExport'

function deferred() {
  let resolve!: () => void
  let reject!: (reason: Error) => void
  const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}

// Exercise ownership across actual promise boundaries. These are activity-unit
// tests, not worker, scene-signature, React event or native-export integration.
it('starts with reconstruction owned and no command, through a stable mutable ref', () => {
  const activity = createAssemblyActivity(), operation = activity.operation
  expect(activity.commandActive).toBe(false)
  expect(operation.current).toBe(true)
  operation.current = false
  expect(operation.current).toBe(true)
  activity.setRebuilding(false)
  expect(operation.current).toBe(false)
  expect(activity.operation).toBe(operation)
})

it.each(['command', 'reconstruction'] as const)('retains the other owner when %s completes first', async first => {
  const activity = createAssemblyActivity(), command = deferred(), reconstruction = deferred()
  const runCommand = async () => {
    activity.operation.current = true
    try { await command.promise } finally { activity.operation.current = false }
  }
  const runReconstruction = async () => {
    activity.setRebuilding(true)
    try { await reconstruction.promise } finally { activity.setRebuilding(false) }
  }
  const commandDone = runCommand(), reconstructionDone = runReconstruction()
  expect(activity.commandActive).toBe(true)
  if (first === 'command') {
    command.resolve(); await commandDone
    expect(activity.commandActive).toBe(false)
    expect(activity.operation.current).toBe(true)
    reconstruction.resolve(); await reconstructionDone
  } else {
    reconstruction.resolve(); await reconstructionDone
    expect(activity.commandActive).toBe(true)
    expect(activity.operation.current).toBe(true)
    command.resolve(); await commandDone
  }
  expect(activity.commandActive).toBe(false)
  expect(activity.operation.current).toBe(false)
})

it.each(['command', 'reconstruction'] as const)('a failed %s releases only its own activity and preserves the error', async failed => {
  const activity = createAssemblyActivity(), pending = deferred(), failure = new Error('Original activity failure')
  activity.operation.current = true
  const result = (async () => {
    try { await pending.promise }
    finally {
      if (failed === 'command') activity.operation.current = false
      else activity.setRebuilding(false)
    }
  })()
  const rejected = expect(result).rejects.toBe(failure)
  pending.reject(failure)
  await rejected
  expect(activity.operation.current).toBe(true)
  expect(activity.commandActive).toBe(failed === 'reconstruction')
  if (failed === 'command') activity.setRebuilding(false)
  else activity.operation.current = false
  expect(activity.operation.current).toBe(false)
})

it('an external export-compatible ref can release its command without clearing reconstruction', async () => {
  const activity = createAssemblyActivity(), pending = deferred()
  activity.setRebuilding(false)
  // The export helper accepts this structural mutable-ref contract. Retaining
  // that reference must preserve the accessor rather than copy its value.
  const external: AssemblyExportOperation['operation'] = activity.operation
  const consumer = (async () => {
    external.current = true
    try { await pending.promise } finally { external.current = false }
  })()
  expect(activity.commandActive).toBe(true)
  activity.setRebuilding(true)
  pending.resolve(); await consumer
  expect(activity.commandActive).toBe(false)
  expect(external.current).toBe(true)
  expect(activity.operation).toBe(external)
  activity.setRebuilding(false)
  expect(external.current).toBe(false)
})
