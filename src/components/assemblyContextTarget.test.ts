import { describe, expect, it } from 'vitest'
import { assemblyConfigurationCoreFixture } from '../model/assemblyConfigurationCore.test-utils'
import { evaluateAssemblyConfiguration } from '../model/assemblyConfigurationCore'
import type { AssemblyDocument, EmbeddedAssemblyDefinition } from '../model/assemblyDocument'
import { assemblyTreeRows, createAssemblyComponentContextTarget, resolveAssemblyComponentContextTarget, resolveAssemblyOriginContextEntry } from './assemblyContextTarget'
import { buildAssemblyOriginTree } from './assemblyOriginTree'

// Original configuration prisms reused for declaration identity only; no native claim.
const fixture = () => assemblyConfigurationCoreFixture().document

describe('component context destination', () => {
  it('retains the absolute reused instance and returns declarations from the current document', () => {
    const document = fixture(), before = JSON.stringify(document), scope = ['right'], path = ['right', 'a']
    const ticket = createAssemblyComponentContextTarget(document, scope, path)!
    scope[0] = 'left'; path[0] = 'left'
    expect(ticket.component).toEqual({ occurrencePath: ['right', 'a'], definition: { id: 'configuration-A', revision: 'r1' } })
    expect(resolveAssemblyComponentContextTarget(ticket, document, ['right'], ['left', 'a'])).toBeNull()
    const current = structuredClone(document), row = resolveAssemblyComponentContextTarget(ticket, current, ['right'], ['right', 'a'])!
    const shared = current.definitions.find(value => value.id === 'configuration-S') as EmbeddedAssemblyDefinition
    expect(row.occurrence).toBe(shared.occurrences[0])
    expect(row.path).toEqual(['right', 'a'])
    expect(row.parent).toEqual({ id: 'configuration-S', revision: 's-r1' })
    expect(JSON.stringify(document)).toBe(before)
  })

  it('invalidates changed scope or selection rather than choosing another same-named instance', () => {
    const document = fixture(), ticket = createAssemblyComponentContextTarget(document, [], ['right', 'a'])
    expect(resolveAssemblyComponentContextTarget(ticket, document, [], ['right', 'a'])).not.toBeNull()
    expect(resolveAssemblyComponentContextTarget(ticket, document, ['right'], ['right', 'a'])).toBeNull()
    expect(resolveAssemblyComponentContextTarget(ticket, document, [], ['left', 'a'])).toBeNull()
    expect(resolveAssemblyComponentContextTarget(ticket, document, [], [])).toBeNull()
    expect(resolveAssemblyComponentContextTarget(null, document, [], ['right', 'a'])).toBeNull()
    const outside = createAssemblyComponentContextTarget(document, ['left'], ['right', 'a'])
    expect(resolveAssemblyComponentContextTarget(outside, document, ['left'], ['right', 'a'])?.path).toEqual(['right', 'a'])
    expect(resolveAssemblyComponentContextTarget(outside, document, ['right'], ['right', 'a'])).toBeNull()
    const scopeOwner = createAssemblyComponentContextTarget(document, ['left'], ['left'])
    expect(resolveAssemblyComponentContextTarget(scopeOwner, document, ['left'], ['left'])?.parent.id).toBe(document.id)
    expect(createAssemblyComponentContextTarget(document, ['right', 'a'], ['right', 'a'])).toBeNull()
    expect(createAssemblyComponentContextTarget(document, [], [])).toBeNull()
    expect(createAssemblyComponentContextTarget(document, [], ['missing'])).toBeNull()
  })

  it.each<[string, (document: AssemblyDocument) => void]>([
    ['root revision', document => { document.revision = 'new-revision' }],
    ['pose', document => { document.occurrences[1].pose.translation[0] += 1 }],
    ['name', document => { document.name = 'Renamed assembly' }],
    ['another occurrence', document => { document.occurrences[0].fixed = true }],
    ['visibility', document => { document.occurrences[1].visible = false }],
    ['suppression', document => { document.occurrences[1].suppressed = true }],
    ['removal', document => { document.occurrences.pop() }],
    ['in-place definition revision', document => {
      document.definitions[0].revision = 'r2'
      const shared = document.definitions.find(value => value.kind === 'assembly') as EmbeddedAssemblyDefinition
      shared.occurrences[0].definition.revision = 'r2'
    }],
  ])('invalidates any document edit: %s', (_name, edit) => {
    const document = fixture(), ticket = createAssemblyComponentContextTarget(document, [], ['right', 'a'])
    edit(document)
    expect(resolveAssemblyComponentContextTarget(ticket, document, [], ['right', 'a'])).toBeNull()
  })

  it('rejects ambiguous paths, duplicate definition keys, missing definitions and recursive declarations', () => {
    for (const corrupt of [
      (document: AssemblyDocument) => { document.occurrences.push(structuredClone(document.occurrences[1])) },
      (document: AssemblyDocument) => { document.definitions.push(structuredClone(document.definitions[0])) },
      (document: AssemblyDocument) => { document.definitions.shift() },
      (document: AssemblyDocument) => {
        const shared = document.definitions.find(value => value.kind === 'assembly') as EmbeddedAssemblyDefinition
        shared.occurrences[0].definition = { id: shared.id, revision: shared.revision }
      },
    ]) {
      const document = fixture(); corrupt(document)
      expect(createAssemblyComponentContextTarget(document, [], ['right', 'a'])).toBeNull()
    }
  })

  it('checks the ticket definition instead of treating its path or signature as authority', () => {
    const document = fixture(), ticket = createAssemblyComponentContextTarget(document, [], ['right', 'a'])!
    ticket.component.definition.revision = 'another-revision'
    expect(resolveAssemblyComponentContextTarget(ticket, document, [], ['right', 'a'])).toBeNull()
  })

  it('preserves inherited row flags and allows a current hidden declaration to offer restoration actions', () => {
    const document = fixture(); document.occurrences[1].visible = false; document.occurrences[0].suppressed = true
    const rows = assemblyTreeRows(document)
    expect(rows).toHaveLength(6)
    expect(rows.find(row => row.path.join('/') === 'right/a')).toMatchObject({ visible: false, suppressed: false })
    expect(rows.find(row => row.path.join('/') === 'left/a')).toMatchObject({ visible: true, suppressed: true })
    const ticket = createAssemblyComponentContextTarget(document, [], ['right', 'a'])
    expect(resolveAssemblyComponentContextTarget(ticket, document, [], ['right', 'a'])?.visible).toBe(false)
  })
})

describe('origin context reference frames', () => {
  function catalogs() {
    const { document, catalog } = assemblyConfigurationCoreFixture()
    const evaluation = evaluateAssemblyConfiguration(document, catalog, 'mixed')
    return { global: buildAssemblyOriginTree(evaluation, []), nested: buildAssemblyOriginTree(evaluation, ['right']) }
  }

  it('maps a root reference and scoped root reference to their different absolute owners', () => {
    const { global, nested } = catalogs()
    const root = global.find(entry => !entry.ownerPath.length)!, scoped = nested.find(entry => entry.ownerPath.length === 1)!
    expect(root.display.reference.component).toBeNull()
    expect(scoped.display.reference.component).toBeNull()
    expect(resolveAssemblyOriginContextEntry(root.display.reference, [], global, null)).toBe(root)
    expect(resolveAssemblyOriginContextEntry(scoped.display.reference, ['right'], global, null)?.ownerPath).toEqual(['right'])
  })

  it('maps a nested relative child to the right reused instance with its exact revision', () => {
    const { global, nested } = catalogs(), child = nested.find(entry => entry.ownerPath.join('/') === 'right/a')!
    expect(child.display.reference.component?.occurrencePath).toEqual(['a'])
    const result = resolveAssemblyOriginContextEntry(child.display.reference, ['right'], global, null)!
    expect(result.ownerPath).toEqual(['right', 'a'])
    expect(global).toContain(result)
    const stale = structuredClone(child.display.reference); stale.component!.definition.revision = 'missing-revision'
    expect(resolveAssemblyOriginContextEntry(stale, ['right'], global, null)).toBeNull()
  })

  it('keeps selected global root and child references global under a nested edit scope', () => {
    const { global } = catalogs()
    for (const owner of ['', 'right/a']) {
      const selected = global.find(entry => entry.ownerPath.join('/') === owner)!
      const current = structuredClone(global)
      const result = resolveAssemblyOriginContextEntry(selected.display.reference, ['right'], current, selected)
      expect(result?.ownerPath).toEqual(selected.ownerPath)
      expect(result).toBe(current.find(entry => entry.treeKey === selected.treeKey))
      expect(result).not.toBe(selected)
    }
  })

  it('does not reinterpret mismatched or stale selected overlays as scope-relative references', () => {
    const { global } = catalogs(), selected = global.find(entry => entry.ownerPath.join('/') === 'right/a')!
    const other = global.find(entry => entry.ownerPath.join('/') === 'left/a')!
    expect(resolveAssemblyOriginContextEntry(other.display.reference, ['right'], global, selected)).toBeNull()
    expect(resolveAssemblyOriginContextEntry(selected.display.reference, ['right'], global.filter(entry => entry !== selected), selected)).toBeNull()
  const stale = { ...structuredClone(selected), binding: selected.binding + '-stale' }
    expect(resolveAssemblyOriginContextEntry(selected.display.reference, ['right'], global, stale)).toBeNull()
    expect(resolveAssemblyOriginContextEntry(selected.display.reference, ['right'], [...global, selected], selected)).toBeNull()
  })

  it('rejects ambiguous and missing owners without selecting another plane or axis', () => {
    const { global } = catalogs(), root = global.find(entry => !entry.ownerPath.length)!
    expect(resolveAssemblyOriginContextEntry(root.display.reference, [], [...global, root], null)).toBeNull()
    expect(resolveAssemblyOriginContextEntry(root.display.reference, ['missing'], global, null)).toBeNull()
    expect(resolveAssemblyOriginContextEntry(root.display.reference, [], global.filter(entry => entry !== root), null)).toBeNull()
  })
})
