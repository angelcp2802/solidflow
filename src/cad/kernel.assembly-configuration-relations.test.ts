import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { setOC } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import lineOriginal from './fixtures/assembly-line-path-original.json'
import profileOriginal from './fixtures/assembly-profile-center-original.json'
import arcOriginal from './fixtures/assembly-material-arc-original.json'
import sphereOriginal from './fixtures/assembly-plane-sphere-tangent-original.json'
import hingeOriginal from './fixtures/assembly-hinge-original.json'
import { serializeAssemblyDocument, validateAssemblyDocument, type AssemblyDocument, type AssemblyMate, type AssemblyComponentReference, type EmbeddedAssemblyDefinition, type EmbeddedPartDefinition } from '../model/assemblyDocument'
import { identityRigidPose } from '../model/rigidPose'
import * as inventories from '../model/assemblyConfigurationReferences'
import { AssemblyConfigurationGeometrySnapshot, type AssemblyConfigurationGeometryInput } from './kernel.assembly-configuration-snapshot'
import { AssemblyGeometrySnapshot } from './kernel.assembly-snapshot'
import * as observations from './kernel.assembly-configuration-relations'
import { buildAssemblyScene } from './kernel.assembly-scene'
import { CadEngine } from './kernel.engine'
import type { AssemblySceneBody } from './kernel.assembly-types'

// All feature recipes are the unchanged tracked GPL-3.0-only originals:
// box4x6x4, R2x3 cylinder, R3 sphere, R2 quarter-sector depth4, drilled H4.
// New declarations below exercise reference resolution only. Their explicit
// mechanical neutral data are syntax/intent, not an authenticated capture or
// a claim that these deliberately different placements satisfy the equations.
// S is reused at left=I and right=Rz90+[10,20,30]. Right selects a variant
// placing box-b at Rx90+[2,0,0], so its material (x,y,z) maps literally to
// (10+z,22+x,30+y), with full rigid owner right, never box-b.
const stamp = '2026-10-23T00:00:00.000Z'
const innerId = 'configured-relation-S'
const near = (actual: readonly number[], wanted: readonly number[], band = 1e-10) => {
  expect(actual).toHaveLength(wanted.length)
  actual.forEach((x, i) => { expect(Number.isFinite(x)).toBe(true); expect(Math.abs(x - wanted[i])).toBeLessThanOrEqual(band) })
}
const errors = (e: unknown): unknown[] => [e, ...(e instanceof AggregateError ? e.errors.flatMap(errors) : [])]
let probe: AssemblyDocument
let parts: EmbeddedPartDefinition[]
let bodies: Map<string, AssemblySceneBody>
let declarations: AssemblyMate[]

function part(raw: unknown, id: string): EmbeddedPartDefinition {
  const selected = validateAssemblyDocument(raw).definitions.find(value => value.id === id)
  if (selected?.kind !== 'part') throw Error('Tracked original part missing: ' + id)
  return selected
}
function component(owner: string): AssemblyComponentReference {
  const current = bodies.get(owner)!
  if (!current) throw Error('Original current source body missing')
  return structuredClone(current.component)
}
function plane(owner: string, axis: number, coordinate: number, sign = 1) {
  const rows = bodies.get(owner)!.faces.filter(row => row.support?.kind === 'plane'
    && row.support.normal[axis] * sign > .99 && Math.abs(row.support.point[axis] - coordinate) < 1e-10)
  expect(rows).toHaveLength(1)
  return { kind: 'face' as const, ...structuredClone(rows[0].selection), support: 'plane' as const }
}
function cylinder(owner: string) {
  const rows = bodies.get(owner)!.faces.filter(row => row.support?.kind === 'cylinder')
  expect(rows).toHaveLength(1)
  return { kind: 'face' as const, ...structuredClone(rows[0].selection), support: 'cylinder-surface' as const }
}
function axis(owner: string) { return { ...cylinder(owner), support: 'axis' as const } }
function sphere(owner: string) {
  const rows = bodies.get(owner)!.faces.filter(row => row.sphereSurface?.kind === 'sphere-surface')
  expect(rows).toHaveLength(1)
  return { kind: 'face' as const, ...structuredClone(rows[0].selection), support: 'sphere-surface' as const }
}
function edge(owner: string, bottom = false) {
  const rows = bodies.get(owner)!.edges!.filter(row => row.support?.kind === 'line'
    && Math.abs(row.support.axis[0]) > .99 && Math.abs(row.support.point[1] + 3) < 1e-10 && Math.abs(row.support.point[2] - (bottom ? 0 : 4)) < 1e-10)
  expect(rows).toHaveLength(1)
  return { kind: 'edge' as const, ...structuredClone(rows[0].selection), support: 'line' as const }
}
function vertex(owner: string, wanted = [-2, -3, 4]) {
  const rows = bodies.get(owner)!.vertexPoints!.filter(row => row.point.every((x, i) => Math.abs(x - wanted[i]) < 1e-10))
  expect(rows).toHaveLength(1)
  return { kind: 'vertex' as const, ...structuredClone(rows[0].selection), support: 'point' as const }
}
function line(owner: string) {
  const e = edge(owner)
  return { component: e.component, body: e.body, edge: e.edge, startVertex: vertex(owner).vertex }
}
function arc(owner: string) {
  const rows = bodies.get(owner)!.edges!.filter(row => row.circularPathOrigins?.length === 2 && row.lines.length > 0
    && row.lines.filter((_, i) => i % 3 === 2).every(z => Math.abs(z - 4) < 1e-10))
  expect(rows).toHaveLength(1)
  return { ...structuredClone(rows[0].selection), startVertex: vertex(owner, [5, -2, 4]).vertex }
}
function profile(owner: string, rectangle: boolean) {
  const face = plane(owner, 2, rectangle ? 4 : 3)
  return { face: { component: face.component, body: face.body, face: face.face }, axis: rectangle ? { edge: edge(owner).edge, sense: 1 as const } : null }
}
function makeDeclarations(): AssemblyMate[] {
  const base = (id: string, type: string) => ({ id, name: 'Original ' + id, type, suppressed: false })
  const pA = plane('box-a', 2, 4), pB = plane('box-b', 2, 4), cA = axis('circle-a'), cB = axis('circle-b')
  const q = [0, 0, 0, 1]
  const raw: unknown[] = [
    { ...base('concentric', 'concentric'), first: cA, second: cB, alignment: 'aligned', rotationLock: null },
    { ...base('coincident', 'coincident'), first: pA, second: pB, alignment: 'aligned' },
    { ...base('distance', 'distance'), first: pA, second: pB, alignment: 'aligned', distance: 2 },
    { ...base('limit-distance', 'limit-distance'), first: pA, second: pB, alignment: 'aligned', limits: { minimum: -2, maximum: 5 } },
    { ...base('limit-angle', 'limit-angle'), first: pA, second: edge('box-b'), coordinate: 'principal-direction', limits: { minimum: 10, maximum: 170 } },
    { ...base('limit-directed-angle', 'limit-directed-angle'), first: plane('box-a', 0, 2), second: plane('box-b', 0, 2), guide: cA, coordinate: 'directed-about-axis', arc: { start: 330, sweep: 60 } },
    { ...base('angle', 'angle'), first: pA, second: pB, angle: 40 },
    { ...base('parallel', 'parallel'), first: edge('box-a'), second: edge('box-b'), alignment: 'aligned' },
    { ...base('perpendicular', 'perpendicular'), first: pA, second: cB, alignment: 'aligned' },
    { ...base('tangent', 'tangent'), first: pA, second: cylinder('circle-b'), side: 'positive' },
    { ...base('skew-cylinder-tangent', 'skew-cylinder-tangent'), first: cylinder('circle-a'), second: cylinder('circle-b'), branch: { kind: 'external' } },
    { ...base('parallel-cylinder-tangent', 'parallel-cylinder-tangent'), first: cylinder('circle-a'), second: cylinder('circle-b'), branch: { kind: 'external' } },
    { ...base('plane-sphere-tangent', 'plane-sphere-tangent'), first: pA, second: sphere('sphere-b'), side: 'positive' },
    { ...base('sphere-sphere-tangent', 'sphere-sphere-tangent'), first: sphere('sphere-a'), second: sphere('sphere-b'), branch: { kind: 'external' } },
    { ...base('cylinder-sphere-tangent', 'cylinder-sphere-tangent'), first: cylinder('circle-a'), second: sphere('sphere-b'), branch: { kind: 'external' } },
    { ...base('lock', 'lock'), first: component('box-a'), second: component('box-b'), relativePose: identityRigidPose() },
    { ...base('gear', 'gear'), first: cA, second: cB, carrier: null, ratio: { numerator: 1, denominator: 2 }, direction: 'opposed', neutralRotations: { first: q, second: q }, angles: { first: 0, second: 0 }, phase: 0 },
    { ...base('screw', 'screw'), first: cA, second: cB, lead: 5, reverse: false, alignment: 'aligned', neutralRotation: q, angle: 0, neutralTravel: 0 },
    { ...base('rack-pinion', 'rack-pinion'), first: cA, second: edge('box-b'), conversion: { mode: 'diameter', override: null }, reverse: false, neutralRotation: q, angle: 0, neutralTravel: 0 },
    { ...base('width', 'width'), mode: 'centered', width: [plane('box-a', 0, -2, -1), plane('box-a', 0, 2)], tab: [plane('box-b', 0, -2, -1), plane('box-b', 0, 2)], widthBranch: 'sum', tabBranch: 'sum', alignment: 'aligned' },
    { ...base('symmetry-point', 'symmetry'), entityKind: 'point', source: vertex('box-a'), target: vertex('box-b'), mirror: plane('box-a', 0, 2), alignment: null },
    { ...base('symmetry-line', 'symmetry'), entityKind: 'line', source: edge('box-a'), target: edge('box-b'), mirror: plane('box-a', 0, 2), alignment: 'aligned' },
    { ...base('symmetry-plane', 'symmetry'), entityKind: 'plane', source: pA, target: pB, mirror: plane('box-a', 0, 2), alignment: 'aligned' },
    { ...base('symmetry-sphere', 'symmetry'), entityKind: 'sphere', source: sphere('sphere-a'), target: sphere('sphere-b'), mirror: plane('box-a', 0, 2), alignment: null },
    { ...base('symmetry-cylinder', 'symmetry'), entityKind: 'cylinder', source: cylinder('circle-a'), target: cylinder('circle-b'), mirror: plane('box-a', 0, 2), alignment: 'aligned' },
    { ...base('profile-circle', 'profile-center'), first: profile('circle-a', false), second: profile('circle-b', false), alignment: 'aligned', offsetMm: 2, orientation: { mode: 'free' } },
    { ...base('profile-rectangle', 'profile-center'), first: profile('box-a', true), second: profile('box-b', true), alignment: 'opposed', offsetMm: 0, orientation: { mode: 'rectangle', quarterTurns: 3 } },
    { ...base('line-up', 'line-path'), point: vertex('box-b'), path: line('box-a'), position: { mode: 'distance', distanceMm: 1, reverse: false }, orientation: { pitchYaw: { mode: 'follow', axis: 'x', reverse: false }, roll: { mode: 'up', axis: 'y', reverse: true, guide: pA } } },
    { ...base('circular-up', 'circular-path'), point: vertex('sector-b', [3, -2, 4]), path: arc('sector-a'), position: { mode: 'free', domain: 'trim' }, orientation: { pitchYaw: { mode: 'follow', axis: 'x', reverse: false }, roll: { mode: 'up', axis: 'z', reverse: false, guide: pA } } },
    { ...base('hinge', 'hinge'), axis: [axis('hinge-a'), axis('hinge-b')], axial: [plane('hinge-a', 2, 4), plane('hinge-b', 2, 0, -1)], alignment: 'aligned' },
    { ...base('limited-hinge', 'hinge'), axis: [axis('hinge-a'), axis('hinge-b')], axial: [plane('hinge-a', 2, 4), plane('hinge-b', 2, 0, -1)], alignment: 'aligned', stops: { coordinate: 'directed-about-axis', angular: [plane('hinge-a', 0, 10), plane('hinge-b', 0, 10)], arc: { start: 330, sweep: 60 } } },
  ]
  return validateAssemblyDocument({ ...probe, mates: raw }).mates
}
beforeAll(async () => {
  setOC(await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')), print: () => undefined, printErr: () => undefined }))
  parts = [part(lineOriginal, 'original-line-prism'), part(profileOriginal, 'original-profile-circle'), part(sphereOriginal, 'sphere-source-r3'), part(arcOriginal, 'original-quarter-sector'), part(hingeOriginal, 'original-hinge-leaf')]
  const occurrences = parts.flatMap((definition, i) => ['a', 'b'].map(suffix => ({ id: ['box', 'circle', 'sphere', 'sector', 'hinge'][i] + '-' + suffix, name: 'Original ' + suffix,
    definition: { id: definition.id, revision: definition.revision }, pose: identityRigidPose(), fixed: false, suppressed: false, visible: true })))
  probe = validateAssemblyDocument({ version: 2, kind: 'assembly', id: 'configured-relation-root', revision: 'r1', name: 'Original configured relation metadata', units: 'mm', createdAt: stamp, updatedAt: stamp, definitions: parts, occurrences, mates: [] })
  const scene = buildAssemblyScene(probe)
  expect(scene.warnings).toEqual([]); expect(scene.solidCount).toBe(10); expect(scene.prototypeCount).toBe(5)
  bodies = new Map(scene.bodies.map(body => [body.component.occurrencePath[0], body]))
  declarations = makeDeclarations()
}, 60_000)

function selected(ids: readonly string[]) { return declarations.filter(mate => ids.includes(mate.id)) }
function fixture(mates: readonly AssemblyMate[] = declarations): AssemblyConfigurationGeometryInput {
  const inner: EmbeddedAssemblyDefinition = { kind: 'assembly', id: innerId, revision: 'r1', name: 'Original relation namespace', createdAt: stamp, updatedAt: stamp, occurrences: structuredClone(probe.occurrences), mates: structuredClone(mates) as AssemblyMate[] }
  const occurrence = (id: string) => ({ id, name: id, definition: { id: inner.id, revision: inner.revision }, pose: identityRigidPose(), fixed: false, suppressed: false, visible: true })
  const left = occurrence('left'), right = occurrence('right')
  right.pose = { translation: [10, 20, 30], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] }
  const document = validateAssemblyDocument({ ...probe, definitions: [...parts, inner], occurrences: [left, right], mates: [] })
  const placed = { occurrenceId: 'box-b', pose: { translation: [2, 0, 0] as [number, number, number], rotation: [Math.SQRT1_2, 0, 0, Math.SQRT1_2] as [number, number, number, number] } }
  return { document, rootConfiguration: 'posed', generation: 23, catalog: [
    { definition: { id: document.id, revision: document.revision }, configurations: [
      { id: 'posed', name: 'Right selected variant', occurrences: [{ occurrenceId: 'right', configuration: 'tilt' }], mates: [] },
      { id: 'paused', name: 'Right passive equations', occurrences: [{ occurrenceId: 'right', configuration: 'paused' }], mates: [] },
      { id: 'hidden', name: 'Right hidden', occurrences: [{ occurrenceId: 'right', configuration: 'tilt', visible: false }], mates: [] },
      { id: 'scope-off', name: 'Right namespace suppressed', occurrences: [{ occurrenceId: 'right', configuration: 'paused', suppressed: true }], mates: [] },
    ] },
    { definition: { id: inner.id, revision: inner.revision }, configurations: [
      { id: 'tilt', name: 'Effective material pose', occurrences: [placed], mates: [] },
      { id: 'paused', name: 'Suppressed equations, active scope', occurrences: [placed], mates: mates.filter(m => m.type === 'gear' || m.type === 'screw' || m.type === 'rack-pinion').map(m => ({ mateId: m.id, suppressed: true })) },
    ] },
  ] }
}
function inner(input: AssemblyConfigurationGeometryInput) {
  const current = input.document.definitions.find(d => d.id === innerId)
  if (current?.kind !== 'assembly') throw Error('Original current relation scope missing')
  return current
}
function context(row: observations.ConfiguredResolvedMate, side: 'left' | 'right') {
  expect(row.kind).toBe('configured-relation'); expect(row.scopePath).toEqual([side]); expect(row.scope).toEqual({ id: innerId, revision: 'r1' })
  expect(row.configuration).toBe(side === 'left' ? null : 'tilt'); expect(row.configurationAncestry.map(x => x.configuration)).toEqual(['posed', side === 'left' ? null : 'tilt'])
  near(row.scopePose.translation, side === 'left' ? [0, 0, 0] : [10, 20, 30]); expect(row.scopeSuppressed).toBe(false); expect(row.suppressed).toBe(false)
  expect('satisfied' in row).toBe(false); expect('token' in row).toBe(false); expect('rank' in row).toBe(false); expect(Object.isFrozen(row)).toBe(true)
}
const binary = ['concentric', 'coincident', 'distance', 'limit-distance', 'limit-angle', 'limit-directed-angle', 'angle', 'parallel', 'perpendicular', 'tangent', 'skew-cylinder-tangent', 'parallel-cylinder-tangent', 'plane-sphere-tangent', 'sphere-sphere-tangent', 'cylinder-sphere-tangent', 'lock', 'gear', 'screw', 'rack-pinion'] as const
const binaryKinds = [
  ['configured-support', 'configured-support'], ['configured-support', 'configured-support'], ['configured-support', 'configured-support'], ['configured-support', 'configured-support'],
  ['configured-direction', 'configured-direction'], ['configured-direction', 'configured-direction'], ['configured-support', 'configured-support'], ['configured-support', 'configured-support'], ['configured-support', 'configured-support'],
  ['configured-support', 'configured-cylinder-surface'], ['configured-cylinder-surface', 'configured-cylinder-surface'], ['configured-cylinder-surface', 'configured-cylinder-surface'],
  ['configured-support', 'configured-sphere-surface'], ['configured-sphere-surface', 'configured-sphere-surface'], ['configured-cylinder-surface', 'configured-sphere-surface'],
  ['configured-component', 'configured-component'], ['configured-support', 'configured-support'], ['configured-support', 'configured-support'], ['configured-support', 'configured-support'],
] as const

it('resolves all nineteen saved binary families with exact configured purposes in both effective namespaces', () => {
  const input = fixture(selected(binary)), before = serializeAssemblyDocument(input.document), catalog = JSON.stringify(input.catalog), s = new AssemblyConfigurationGeometrySnapshot(input)
  try {
    const rows = s.resolveActiveMates(input)
    expect(rows).toHaveLength(38)
    expect(rows.map(row => row.scopePath[0] + '/' + row.mate.id)).toEqual(['left', 'right'].flatMap(side => binary.map(id => side + '/' + id)))
    for (const side of ['left', 'right'] as const) for (let i = 0; i < binary.length; i++) {
      const row = rows.find(r => r.scopePath[0] === side && r.mate.id === binary[i])!
      context(row, side); expect(s.assertResolvedMate(row, input)).toBe(row)
      if (!('first' in row)) throw Error('Actual binary result required')
      expect([row.first.kind, row.second.kind]).toEqual(binaryKinds[i]); expect(row.first.topLevelOwner).toBe(side); expect(row.second.topLevelOwner).toBe(side)
      expect(row.first.componentPath[0]).toBe(side); expect(row.second.componentPath[0]).toBe(side)
      if (binary[i] === 'gear') {
        if (!('carrier' in row) || !row.carrier) throw Error('Current null-carrier frame required')
        expect(row.mate.type).toBe('gear'); expect(row.carrier.kind).toBe('configured-component'); expect(row.carrier.componentPath).toEqual([side]); expect(row.carrier.topLevelOwner).toBe(side)
        near(row.carrier.declaredWorldPose.translation, side === 'left' ? [0, 0, 0] : [10, 20, 30])
      }
      if (binary[i] === 'limit-directed-angle') {
        if (!('guide' in row) || !row.guide) throw Error('Independent third guide required')
        expect(row.guide.kind).toBe('configured-direction'); expect(row.guide.componentPath).toEqual([side, 'circle-a'])
      }
    }
    const distance = rows.find(row => row.scopePath[0] === 'right' && row.mate.id === 'distance')!
    if (!('first' in distance) || distance.first.kind !== 'configured-support' || distance.second.kind !== 'configured-support' || distance.first.worldSupport.kind !== 'plane' || distance.second.worldSupport.kind !== 'plane') throw Error('Native plane roles required')
    near(distance.first.worldSupport.normal, [0, 0, 1]); near(distance.second.worldSupport.normal, [1, 0, 0]); near(distance.second.declaredWorldPose.translation, [10, 22, 30])
    const sphereRow = rows.find(row => row.scopePath[0] === 'right' && row.mate.id === 'sphere-sphere-tangent')!
    if (!('first' in sphereRow) || sphereRow.first.kind !== 'configured-sphere-surface') throw Error('Native sphere required')
    near(sphereRow.first.worldSupport.center, [10, 20, 30]); expect(sphereRow.first.worldSupport.radius).toBeCloseTo(3, 12)
    expect(serializeAssemblyDocument(input.document)).toBe(before); expect(JSON.stringify(input.catalog)).toBe(catalog)
  } finally { s.dispose() }
})

it('retains all four ordered width roles without promoting its plane witnesses to binary purpose', () => {
  const input = fixture(selected(['width'])), s = new AssemblyConfigurationGeometrySnapshot(input)
  try {
    const rows = s.resolveActiveMates(input); expect(rows).toHaveLength(2)
    for (const row of rows) {
      if (!('width' in row)) throw Error('Actual width aggregate required')
      context(row, row.scopePath[0] as 'left' | 'right'); expect(row.width.map(w => w.kind)).toEqual(['configured-plane', 'configured-plane']); expect(row.tab.map(w => w.kind)).toEqual(['configured-plane', 'configured-plane'])
      expect(row.width.map(w => w.componentPath)).toEqual([[row.scopePath[0], 'box-a'], [row.scopePath[0], 'box-a']]); expect(row.tab.map(w => w.componentPath)).toEqual([[row.scopePath[0], 'box-b'], [row.scopePath[0], 'box-b']])
      expect(row.width[0]).not.toBe(row.width[1]); expect(s.assertResolvedMate(row, input)).toBe(row)
    }
    const right = rows[1]; if (!('width' in right)) throw Error('Width required')
    near(right.width[1].worldSupport.normal, [0, 1, 0]); near(right.tab[1].worldSupport.normal, [0, 1, 0]); near(right.tab[1].worldSupport.point, [10 + right.tab[1].localSupport.point[2], 24, 30 + right.tab[1].localSupport.point[1]])
  } finally { s.dispose() }
})

it.each(['point', 'line', 'plane', 'sphere', 'cylinder'] as const)('resolves original %s symmetry with a separate mirror and full root owners', family => {
  const input = fixture(selected(['symmetry-' + family])), s = new AssemblyConfigurationGeometrySnapshot(input)
  const wanted = { point: 'configured-point', line: 'configured-support', plane: 'configured-support', sphere: 'configured-sphere-surface', cylinder: 'configured-cylinder-surface' }
  try {
    const rows = s.resolveActiveMates(input); expect(rows).toHaveLength(2)
    for (const row of rows) {
      if (!('source' in row)) throw Error('Actual symmetry aggregate required')
      const side = row.scopePath[0] as 'left' | 'right'; context(row, side)
      expect(row.source.kind).toBe(wanted[family]); expect(row.target.kind).toBe(wanted[family]); expect(row.mirror.kind).toBe('configured-plane')
      expect([row.source.topLevelOwner, row.target.topLevelOwner, row.mirror.topLevelOwner]).toEqual([side, side, side]); expect(s.assertResolvedMate(row, input)).toBe(row)
      if (side === 'right' && row.target.kind === 'configured-point') near(row.target.worldSupport.point, [14, 20, 27])
      if (side === 'right' && row.target.kind === 'configured-sphere-surface') { near(row.target.worldSupport.center, [10, 20, 30]); expect(row.target.worldSupport.radius).toBeCloseTo(3, 12) }
    }
  } finally { s.dispose() }
})

it.each(['circle', 'rectangle'] as const)('resolves the saved %s profile family with its exact bounded native purpose', family => {
  const input = fixture(selected(['profile-' + family])), s = new AssemblyConfigurationGeometrySnapshot(input)
  try {
    const rows = s.resolveActiveMates(input); expect(rows).toHaveLength(2)
    for (const row of rows) {
      if (!('first' in row) || (row.first.kind !== 'configured-profile' && row.first.kind !== 'configured-profile-axis') || (row.second.kind !== 'configured-profile' && row.second.kind !== 'configured-profile-axis')) throw Error('Actual profile pair required')
      const side = row.scopePath[0] as 'left' | 'right'; context(row, side)
      expect(row.first.kind).toBe(family === 'circle' ? 'configured-profile' : 'configured-profile-axis'); expect(row.second.kind).toBe(row.first.kind)
      const a = row.first.kind === 'configured-profile' ? row.first.worldSupport : row.first.worldSupport.profile
      const b = row.second.kind === 'configured-profile' ? row.second.worldSupport : row.second.worldSupport.profile
      if (side === 'right') { near(a.center, family === 'circle' ? [10, 20, 33] : [10, 20, 34]); near(b.center, family === 'circle' ? [10, 20, 33] : [14, 22, 30]) }
      expect(a.kind).toBe(family); expect(b.kind).toBe(family); expect(s.assertResolvedMate(row, input)).toBe(row)
    }
  } finally { s.dispose() }
})

it.each(['line-up', 'circular-up'] as const)('resolves %s point/path/UP roles jointly without aliasing material origin purposes', id => {
  const input = fixture(selected([id])), s = new AssemblyConfigurationGeometrySnapshot(input)
  try {
    const rows = s.resolveActiveMates(input); expect(rows).toHaveLength(2)
    const row = rows[1]
    if (!('first' in row) || row.first.kind !== 'configured-point' || (row.second.kind !== 'configured-line-path' && row.second.kind !== 'configured-arc-path') || !('up' in row) || !row.up) throw Error('Actual three-role path aggregate required')
    context(row, 'right'); expect(row.second.kind).toBe(id === 'line-up' ? 'configured-line-path' : 'configured-arc-path'); expect(row.up.kind).toBe('configured-direction'); expect(row.up.origin).toBe('native-face'); expect(row.up.localSupport.kind).toBe('plane')
    expect([row.first.topLevelOwner, row.second.topLevelOwner, row.up.topLevelOwner]).toEqual(['right', 'right', 'right'])
    expect(row.up.componentPath).toEqual(['right', 'box-a'])
    if (row.second.kind === 'configured-line-path') { near(row.second.worldCurve.startPoint, [13, 18, 34]); near(row.second.worldCurve.endPoint, [13, 22, 34]); expect(row.second.worldCurve.lengthMm).toBeCloseTo(4, 12); near(row.first.worldSupport.point, [14, 20, 27]) }
    else { near(row.second.worldCurve.center, [12, 23, 34]); near(row.second.worldCurve.startPoint, [12, 25, 34]); near(row.second.worldCurve.endPoint, [10, 23, 34]); expect(row.second.worldCurve.radiusMm).toBeCloseTo(2, 12); expect(row.second.worldCurve.lengthMm).toBeCloseTo(Math.PI, 12) }
    expect(s.assertResolvedMate(row, input)).toBe(row)
  } finally { s.dispose() }
})

it.each(['hinge', 'limited-hinge'] as const)('resolves %s four/six exact material roles without claiming a rotational DOF or stop satisfaction', id => {
  const input = fixture(selected([id])), s = new AssemblyConfigurationGeometrySnapshot(input)
  try {
    const rows = s.resolveActiveMates(input); expect(rows).toHaveLength(2)
    for (const row of rows) {
      if (!('axis' in row)) throw Error('Actual hinge aggregate required')
      const side = row.scopePath[0] as 'left' | 'right'; context(row, side)
      expect(row.axis.map(w => w.kind)).toEqual(['configured-support', 'configured-support']); expect(row.axial.map(w => w.kind)).toEqual(['configured-plane', 'configured-plane'])
      expect(row.axis.map(w => w.topLevelOwner)).toEqual([side, side]); expect(row.axial.map(w => w.topLevelOwner)).toEqual([side, side])
      expect(row.axis[0].componentPath).toEqual([side, 'hinge-a']); expect(row.axis[1].componentPath).toEqual([side, 'hinge-b'])
      if (id === 'limited-hinge') { expect(row.angular?.map(w => w.kind)).toEqual(['configured-plane', 'configured-plane']); expect(row.angular?.map(w => w.componentPath)).toEqual([[side, 'hinge-a'], [side, 'hinge-b']]) }
      else expect(row.angular).toBeUndefined()
      expect(s.assertResolvedMate(row, input)).toBe(row); expect('qualifiedRotation' in row).toBe(false)
    }
  } finally { s.dispose() }
})

it('keeps a radial hinge plane as resolved inventory without misrepresenting it as a qualified revolute constraint', () => {
  const input = fixture(selected(['hinge'])), mate = inner(input).mates[0]
  if (mate.type !== 'hinge') throw Error('Original hinge declaration required')
  mate.axial[1] = plane('hinge-b', 0, 10)
  const s = new AssemblyConfigurationGeometrySnapshot(input)
  try {
    const rows = s.resolveActiveMates(input); expect(rows).toHaveLength(2)
    const row = rows[1]; if (!('axis' in row) || row.axis[1].worldSupport.kind !== 'cylinder') throw Error('Actual cylinder axis required')
    near(row.axial[1].localSupport.normal, [1, 0, 0])
    const axis = row.axis[1].worldSupport.axis, normal = row.axial[1].worldSupport.normal
    expect(Math.abs(axis.reduce((sum, x, i) => sum + x * normal[i], 0))).toBeLessThanOrEqual(1e-10)
    expect(s.assertResolvedMate(row, input)).toBe(row); expect('qualifiedRotation' in row).toBe(false); expect('satisfied' in row).toBe(false)
  } finally { s.dispose() }
})

it.each(['axial', 'angular'] as const)('withholds a root-declared hinge whose %s role belongs to another full root owner', wrong => {
  const mate = structuredClone(selected([wrong === 'axial' ? 'hinge' : 'limited-hinge'])[0])
  if (mate.type !== 'hinge') throw Error('Original hinge declaration required')
  const scoped = <T extends { component: AssemblyComponentReference | null }>(reference: T, root: string): T => {
    if (reference.component === null) throw Error('Original material role required')
    return { ...reference, component: { ...reference.component, occurrencePath: [root, ...reference.component.occurrencePath] } }
  }
  mate.axis = [scoped(mate.axis[0], 'left'), scoped(mate.axis[1], 'right')]
  mate.axial = [scoped(mate.axial[0], 'left'), scoped(mate.axial[1], wrong === 'axial' ? 'left' : 'right')]
  if (mate.stops) mate.stops.angular = [scoped(mate.stops.angular[0], 'left'), scoped(mate.stops.angular[1], 'left')]
  const input = fixture([])
  input.document = validateAssemblyDocument({ ...input.document, mates: [mate] })
  const s = new AssemblyConfigurationGeometrySnapshot(input), native = vi.spyOn(CadEngine.prototype, 'inspectCurrentFaceSupport'), release = vi.spyOn(CadEngine.prototype, 'dispose')
  try {
    let published: unknown
    expect(() => { published = s.resolveActiveMates(input) }).toThrow(/owner|propietario/i)
    expect(native).toHaveBeenCalledTimes(wrong === 'axial' ? 4 : 6)
    expect(published).toBeUndefined(); expect(release).toHaveBeenCalledTimes(5)
    expect(() => s.resolveActiveMates(input)).toThrow(); expect(() => s.listFaces(input, ['right', 'hinge-b'])).toThrow()
  } finally { native.mockRestore(); release.mockRestore(); s.dispose() }
})

it('retains repeated roles as distinct issued observations and resolves null principal planes in the declaring scope', () => {
  const repeats = structuredClone(selected(['coincident', 'gear']))
  const coincident = repeats.find(m => m.type === 'coincident')!; if (coincident.type !== 'coincident') throw Error('Original coincidence required')
  coincident.first = { kind: 'principal-plane', component: null, plane: 'XY' }; coincident.second = { kind: 'principal-plane', component: null, plane: 'XY' }
  const input = fixture(repeats), s = new AssemblyConfigurationGeometrySnapshot(input)
  try {
    const rows = s.resolveActiveMates(input), row = rows.find(r => r.scopePath[0] === 'right' && r.mate.type === 'coincident')!
    if (!('first' in row) || row.first.kind !== 'configured-support' || row.second.kind !== 'configured-support' || row.first.worldSupport.kind !== 'plane') throw Error('Two configured principal frames required')
    expect(row.first).not.toBe(row.second); expect(row.first.componentPath).toEqual(['right']); expect(row.second.componentPath).toEqual(['right']); near(row.first.worldSupport.point, [10, 20, 30]); expect(row.first.topLevelOwner).toBe('right')
  } finally { s.dispose() }
})

it.each(['gear', 'screw', 'rack-pinion'] as const)('includes suppressed %s equations in an active selected scope and excludes a suppressed namespace', type => {
  const input = fixture(selected([type])); input.rootConfiguration = 'paused'
  const s = new AssemblyConfigurationGeometrySnapshot(input)
  try {
    const state = type === 'gear' ? s.inspectGearState(input) : type === 'screw' ? s.inspectScrewState(input) : s.inspectRackPinionState(input)
    expect(state.unavailable).toEqual([]); expect(state.resolved.map(r => [r.scopePath[0], r.suppressed, r.mate.suppressed])).toEqual([['left', false, false], ['right', true, true]])
    const passive = type === 'gear' ? s.resolvePassiveGears(input) : type === 'screw' ? s.resolvePassiveScrews(input) : s.resolvePassiveRackPinions(input)
    expect(passive).toHaveLength(1); expect(passive[0].scopePath).toEqual(['right']); expect(passive[0].configuration).toBe('paused'); expect(s.assertResolvedMate(passive[0], input)).toBe(passive[0])
    expect(s.resolveActiveMates(input).map(r => r.scopePath)).toEqual([['left']])
  } finally { s.dispose() }
  input.rootConfiguration = 'scope-off'; input.generation++
  const suppressed = new AssemblyConfigurationGeometrySnapshot(input)
  try {
    const state = type === 'gear' ? suppressed.inspectGearState(input) : type === 'screw' ? suppressed.inspectScrewState(input) : suppressed.inspectRackPinionState(input)
    expect(state.unavailable).toEqual([]); expect(state.resolved.map(r => r.scopePath)).toEqual([['left']])
    const passive = type === 'gear' ? suppressed.resolvePassiveGears(input) : type === 'screw' ? suppressed.resolvePassiveScrews(input) : suppressed.resolvePassiveRackPinions(input)
    expect(passive).toEqual([])
  } finally { suppressed.dispose() }
})

it('rejects non-boolean suppressedOnly without querying native roles or revoking the live session', () => {
  const input = fixture(selected(['gear', 'screw', 'rack-pinion'])), s = new AssemblyConfigurationGeometrySnapshot(input)
  const prior = s.resolveComponentReference(input, null), native = vi.spyOn(CadEngine.prototype, 'inspectCurrentFaceSupport'), release = vi.spyOn(CadEngine.prototype, 'dispose')
  try {
    for (const invalid of [null, 0, 1, 'true', {}, [], new Boolean(true)]) {
      expect(() => s.inspectGearState(input, invalid as never)).toThrow(/boolean/i)
      expect(() => s.inspectScrewState(input, invalid as never)).toThrow(/boolean/i)
      expect(() => s.inspectRackPinionState(input, invalid as never)).toThrow(/boolean/i)
    }
    expect(native).not.toHaveBeenCalled(); expect(release).not.toHaveBeenCalled(); expect(s.assertWitness(prior, input)).toBe(prior)
    expect(s.inspectGearState(input, true).resolved).toEqual([])
    expect(s.inspectScrewState(input, true).resolved).toEqual([])
    expect(s.inspectRackPinionState(input, true).resolved).toEqual([])
    expect(native).not.toHaveBeenCalled(); expect(s.inspectGearState(input, false).resolved).toHaveLength(2)
    expect(native).toHaveBeenCalledTimes(4); expect(s.assertWitness(prior, input)).toBe(prior)
  } finally { native.mockRestore(); release.mockRestore(); s.dispose() }
})

it('keeps hidden material references available in actual effective relation scopes', () => {
  const input = fixture(selected(['profile-rectangle', 'line-up', 'circular-up', 'limited-hinge'])); input.rootConfiguration = 'hidden'
  const s = new AssemblyConfigurationGeometrySnapshot(input)
  try { const rows = s.resolveActiveMates(input); expect(rows).toHaveLength(8); expect(rows.filter(r => r.scopePath[0] === 'right')).toHaveLength(4); rows.forEach(row => expect(s.assertResolvedMate(row, input)).toBe(row)) }
  finally { s.dispose() }
})

it.each(['gear', 'screw', 'rack-pinion'] as const)('reports declaratively unavailable %s roles without issuing a native aggregate', type => {
  const input = fixture(selected([type])), mate = inner(input).mates[0]
  if (mate.type !== type) throw Error('Original mechanical declaration missing')
  mate.first.component.occurrencePath = ['removed-source-use']
  const s = new AssemblyConfigurationGeometrySnapshot(input), query = vi.spyOn(CadEngine.prototype, 'inspectCurrentFaceSupport')
  try {
    const state = type === 'gear' ? s.inspectGearState(input) : type === 'screw' ? s.inspectScrewState(input) : s.inspectRackPinionState(input)
    expect(state.resolved).toEqual([]); expect(state.unavailable).toHaveLength(2); expect(query).not.toHaveBeenCalled()
    for (const row of state.unavailable) { expect(row.nativeVerificationRequired).toBe(true); expect(row.roles[0].diagnostics.map(d => d.code)).toContain('MISSING_OCCURRENCE'); expect(() => s.assertResolvedMate(row, input)).toThrow() }
    expect(s.listFaces(input, ['right', 'circle-a']).length).toBeGreaterThan(0)
  } finally { query.mockRestore(); s.dispose() }
})

it('preflights every active declaration before the first native role query, preserving the session on repair diagnostics', () => {
  const input = fixture(selected(['coincident', 'gear'])), mate = inner(input).mates.find(m => m.type === 'gear')!
  if (mate.type !== 'gear') throw Error('Original gear declaration required')
  mate.second.component.occurrencePath = ['missing-later-role']
  const s = new AssemblyConfigurationGeometrySnapshot(input), query = vi.spyOn(CadEngine.prototype, 'inspectCurrentFaceSupport')
  try { expect(() => s.resolveActiveMates(input)).toThrow(/reference|repair|referencia/i); expect(query).not.toHaveBeenCalled(); expect(s.listFaces(input, ['left', 'box-a'])).toHaveLength(6) }
  finally { query.mockRestore(); s.dispose() }
})

it.each(['gear', 'screw', 'rack-pinion'] as const)('treats a current native-purpose failure as fatal rather than unavailable %s metadata', type => {
  const input = fixture(selected([type])), mate = inner(input).mates[0]
  if (mate.type !== type) throw Error('Original mechanical declaration required')
  mate.first = { ...plane('box-a', 2, 4), support: 'axis' }
  const s = new AssemblyConfigurationGeometrySnapshot(input), release = vi.spyOn(CadEngine.prototype, 'dispose')
  try {
    expect(() => type === 'gear' ? s.inspectGearState(input) : type === 'screw' ? s.inspectScrewState(input) : s.inspectRackPinionState(input)).toThrow()
    expect(release).toHaveBeenCalledTimes(5); expect(() => s.resolveActiveMates(input)).toThrow()
  } finally { release.mockRestore(); s.dispose() }
})

it('does not accept clones, foreign/legacy aggregates or a closed observational helper as private issuance', () => {
  const input = fixture(selected(['gear'])), s = new AssemblyConfigurationGeometrySnapshot(input), foreign = new AssemblyConfigurationGeometrySnapshot(input), legacy = new AssemblyGeometrySnapshot(input.document)
  try {
    const row = s.resolveActiveMates(input)[0]; if (!('first' in row) || !('carrier' in row) || !row.carrier) throw Error('Actual binary gear required')
    expect(() => s.assertResolvedMate(structuredClone(row), input)).toThrow(); expect(() => foreign.assertResolvedMate(row, input)).toThrow()
    const old = legacy.resolveActiveMates(input.document)[0]
    expect(() => s.assertResolvedMate(old, input)).toThrow(); expect(() => legacy.assertWitness(row as never, input.document)).toThrow()
    const declared = inventories.inspectAssemblyConfigurationMateReferences(input.document, input.catalog, input.rootConfiguration)[0]
    const observed = observations.buildConfiguredRelationObservation(declared, [{ side: 'first', witness: row.first }, { side: 'second', witness: row.second }, { side: 'carrier', witness: row.carrier }])
    expect(observed).toEqual(row); expect(() => s.assertResolvedMate(observed, input)).toThrow(); expect(s.assertResolvedMate(row, input)).toBe(row)
    s.dispose(); expect(() => s.assertResolvedMate(row, input)).toThrow()
  } finally { s.dispose(); foreign.dispose(); legacy.dispose() }
})

it.each(['catalog', 'selector', 'generation', 'source'] as const)('revokes aggregate and every child after current %s changes, with no restored-JSON revival', change => {
  const input = fixture(selected(['limited-hinge', 'line-up'])), original = structuredClone(input), s = new AssemblyConfigurationGeometrySnapshot(input)
  try {
    const rows = s.resolveActiveMates(input), row = rows[0]; if (!('first' in row)) throw Error('Original path pair required')
    const child = row.first
    if (change === 'catalog') input.catalog[1].configurations[0].name = 'Changed selected state'
    if (change === 'selector') input.rootConfiguration = 'hidden'
    if (change === 'generation') input.generation++
    if (change === 'source') input.document.name = 'Changed source declaration'
    expect(() => s.assertResolvedMate(row, input)).toThrow(); expect(() => s.assertWitness(child, input)).toThrow(); expect(() => s.assertResolvedMate(row, original)).toThrow()
  } finally { s.dispose() }
})

it.each(['empty', 'unavailable'] as const)('postchecks a complete context even when %s inventory produces no native output', mode => {
  const input = fixture(mode === 'empty' ? [] : selected(['gear']))
  if (mode === 'unavailable') { const mate = inner(input).mates[0]; if (mate.type !== 'gear') throw Error('Gear required'); mate.first.component.occurrencePath = ['gone'] }
  const s = new AssemblyConfigurationGeometrySnapshot(input), actual = inventories.inspectAssemblyConfigurationMateReferences
  const inspect = vi.spyOn(inventories, 'inspectAssemblyConfigurationMateReferences').mockImplementation((...args) => { const rows = actual(...args); input.generation++; return rows })
  const release = vi.spyOn(CadEngine.prototype, 'dispose')
  try { expect(() => mode === 'empty' ? s.resolveActiveMates(input) : s.inspectGearState(input)).toThrow(); expect(release).toHaveBeenCalledTimes(5); expect(() => s.listFaces(input, ['left', 'box-a'])).toThrow() }
  finally { inspect.mockRestore(); release.mockRestore(); s.dispose() }
})

it('withholds all earlier resolved relations after the last real native role fails', () => {
  const input = fixture(selected(['coincident'])), s = new AssemblyConfigurationGeometrySnapshot(input), actual = CadEngine.prototype.inspectCurrentFaceSupport
  let queries = 0
  const query = vi.spyOn(CadEngine.prototype, 'inspectCurrentFaceSupport').mockImplementation(function(this: CadEngine, ...args) { const value = actual.apply(this, args); if (++queries === 4) throw Error('Original last native role failure'); return value })
  const release = vi.spyOn(CadEngine.prototype, 'dispose')
  try { expect(() => s.resolveActiveMates(input)).toThrow('Original last native role failure'); expect(queries).toBe(4); expect(release).toHaveBeenCalledTimes(5); expect(() => s.resolveActiveMates(input)).toThrow() }
  finally { query.mockRestore(); release.mockRestore(); s.dispose() }
})

it('withholds an observational aggregate after reentry between native children and private aggregate publication', () => {
  const input = fixture(selected(['line-up'])), s = new AssemblyConfigurationGeometrySnapshot(input), actual = observations.buildConfiguredRelationObservation
  const inspect = vi.spyOn(observations, 'buildConfiguredRelationObservation').mockImplementation((...args) => { const value = actual(...args); input.generation++; return value })
  try { expect(() => s.resolveActiveMates(input)).toThrow(); expect(() => s.resolveActiveMates(input)).toThrow() }
  finally { inspect.mockRestore(); s.dispose() }
})

it('preserves actual native and cleanup errors and attempts every owned prototype release exactly once', () => {
  const input = fixture(selected(['coincident'])), s = new AssemblyConfigurationGeometrySnapshot(input), actualQuery = CadEngine.prototype.inspectCurrentFaceSupport, actualRelease = CadEngine.prototype.dispose
  const primary = Error('Original configured relation native failure'), cleanup = Error('Original configured relation release failure'), counts = new Map<CadEngine, number>()
  const query = vi.spyOn(CadEngine.prototype, 'inspectCurrentFaceSupport').mockImplementation(function(this: CadEngine, ...args) { actualQuery.apply(this, args); throw primary })
  const release = vi.spyOn(CadEngine.prototype, 'dispose').mockImplementation(function(this: CadEngine) { counts.set(this, (counts.get(this) ?? 0) + 1); actualRelease.call(this); throw cleanup })
  try {
    let caught: unknown; try { s.resolveActiveMates(input) } catch (e) { caught = e }
    expect(errors(caught)).toContain(primary); expect(errors(caught)).toContain(cleanup); s.dispose()
    expect(counts.size).toBe(5); expect([...counts.values()]).toEqual([1, 1, 1, 1, 1]); expect(() => s.resolveActiveMates(input)).toThrow()
  } finally { query.mockRestore(); release.mockRestore(); s.dispose() }
})
