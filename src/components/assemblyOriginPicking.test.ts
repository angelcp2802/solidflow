import { expect, it } from 'vitest'
import * as THREE from 'three'
import { assemblyConfigurationCoreFixture } from '../model/assemblyConfigurationCore.test-utils'
import { evaluateAssemblyConfiguration } from '../model/assemblyConfigurationCore'
import { identityRigidPose } from '../model/rigidPose'
import { assemblyOriginDisplayBinding, assemblyOriginDisplayPoints, assemblyOriginLabels, assemblyOriginReferenceKey, buildAssemblyOriginDisplay, createAssemblyOriginOverlay, pickAssemblyOrigin, type AssemblyOriginDisplay } from './assemblyOriginPicking'
import { assemblyReferencePickMode } from './assemblyVertexPicking'

// Existing original prism fixture; literal transforms/projection below are display oracles.
const kinds = { axes: true, planes: true }, size = { width: 1000, height: 1000 }
function camera(perspective = false) {
  const c = perspective ? new THREE.PerspectiveCamera(90, 1, .1, 100) : new THREE.OrthographicCamera(-5, 5, 5, -5, .1, 100)
  c.position.set(0, 0, 10); c.lookAt(0, 0, 0); c.updateProjectionMatrix(); c.updateMatrixWorld(); return c
}
function display(axis: 'X' | 'Y' | 'Z' = 'X'): AssemblyOriginDisplay {
  const reference = { kind: 'principal-axis' as const, component: null, axis }
  return { reference, key: assemblyOriginReferenceKey(reference), label: `Eje ${axis}`, worldPose: identityRigidPose() }
}
it('keeps root and nested scoped identity separate from global displayed placement', () => {
  const { document, catalog } = assemblyConfigurationCoreFixture(), evaluation = evaluateAssemblyConfiguration(document, catalog, 'mixed')
  const root = buildAssemblyOriginDisplay(evaluation, [], null, kinds), scope = buildAssemblyOriginDisplay(evaluation, ['right'], null, kinds)
  expect(root).toHaveLength(6); expect(root.every(row => row.reference.component === null)).toBe(true)
  expect(scope[0].worldPose.translation).toEqual([30, 0, 0])
  const child = buildAssemblyOriginDisplay(evaluation, ['right'], ['right', 'b'], kinds)
  expect(child[0].reference.component).toEqual({ occurrencePath: ['b'], definition: { id: 'configuration-B', revision: 'r1' } })
  expect(child[0].worldPose.translation[0]).toBeCloseTo(30, 12); expect(child[0].worldPose.translation[1]).toBeCloseTo(4, 12)
  const ends = assemblyOriginDisplayPoints(child[0], 2)
  expect(ends[0].x).toBeCloseTo(30, 12); expect(ends[0].y).toBeCloseTo(2, 12)
  expect(ends[1].x).toBeCloseTo(30, 12); expect(ends[1].y).toBeCloseTo(6, 12)
})
it('excludes hidden, suppressed, missing and out-of-scope owners', () => {
  const { document, catalog } = assemblyConfigurationCoreFixture()
  document.occurrences[0].visible = false
  const evaluation = evaluateAssemblyConfiguration(document, catalog, 'single-right')
  for (const [scope, owner] of [[[], ['left']], [[], ['left', 'a']], [[], ['right', 'b']], [['right'], ['left', 'a']], [[], ['missing']]] as [string[], string[]][])
    expect(buildAssemblyOriginDisplay(evaluation, scope, owner, kinds)).toEqual([])
  expect(buildAssemblyOriginDisplay(evaluation, ['left'], null, kinds)).toEqual([])
})
it('selects kinds explicitly and does not mutate the evaluated declarations', () => {
  const { document, catalog } = assemblyConfigurationCoreFixture(), evaluation = evaluateAssemblyConfiguration(document, catalog), before = JSON.stringify(evaluation)
  expect(buildAssemblyOriginDisplay(evaluation, [], null, { axes: false, planes: false })).toEqual([])
  const only = buildAssemblyOriginDisplay(evaluation, [], ['right'], { axes: false, planes: true })
  expect(only.map(row => row.reference.kind === 'principal-plane' && row.reference.plane)).toEqual(['XY', 'XZ', 'YZ'])
  only[0].worldPose.translation[0] = 999
  expect(JSON.stringify(evaluation)).toBe(before)
})
it('does not pick ambiguous duplicate identities even when one duplicate has invalid placement', () => {
  const a = display(), b = structuredClone(a); b.worldPose.translation[0] = NaN
  expect(pickAssemblyOrigin(camera(), [a, b], 2, { x: 650, y: 500 }, size)).toBeNull()
  expect(createAssemblyOriginOverlay([a, b], 2).children).toHaveLength(0)
})
it('picks only the displayed axis with a CSS pixel threshold and literal zoom projection', () => {
  const a = display(), c = camera()
  expect(pickAssemblyOrigin(c, [a], 2, { x: 650, y: 506 }, size)).toEqual(a.reference)
  expect(pickAssemblyOrigin(c, [a], 2, { x: 650, y: 508 }, size)).toBeNull()
  c.zoom = 2; c.updateProjectionMatrix()
  expect(pickAssemblyOrigin(c, [a], 2, { x: 890, y: 500 }, size)).toEqual(a.reference)
  expect(pickAssemblyOrigin(c, [a], 2, { x: 910, y: 500 }, size)).toBeNull()
})
it('rejects crossing or overlapping axes instead of choosing one by array order', () => {
  const x = display('X'), y = display('Y'), second = display('X')
  second.reference.component = { occurrencePath: ['part'], definition: { id: 'part', revision: 'r1' } }; second.key = assemblyOriginReferenceKey(second.reference)
  expect(pickAssemblyOrigin(camera(), [x, y], 2, { x: 500, y: 500 }, size)).toBeNull()
  expect(pickAssemblyOrigin(camera(), [x, second], 2, { x: 650, y: 500 }, size)).toBeNull()
  expect(pickAssemblyOrigin(camera(), [second, x], 2, { x: 650, y: 500 }, size)).toBeNull()
})
it('selects finite displayed plane area without inventing a face or body identity', () => {
  const { document, catalog } = assemblyConfigurationCoreFixture(), e = evaluateAssemblyConfiguration(document, catalog)
  const plane = buildAssemblyOriginDisplay(e, [], null, { axes: false, planes: true })[0]
  expect(pickAssemblyOrigin(camera(), [plane], 2, { x: 600, y: 400 }, size)).toEqual({ kind: 'principal-plane', component: null, plane: 'XY' })
  expect(pickAssemblyOrigin(camera(), [plane], 2, { x: 750, y: 500 }, size)).toBeNull()
  const overlay = createAssemblyOriginOverlay([plane], 2)
  expect(overlay.children).toHaveLength(1); expect(overlay.children[0].children).toHaveLength(2)
  overlay.traverse(object => { if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) { object.geometry.dispose(); (Array.isArray(object.material) ? object.material : [object.material]).forEach(m => m.dispose()) } })
})
it('rejects behind-camera and out-of-viewport reference projection', () => {
  const a = display(); a.worldPose.translation[2] = 11
  expect(pickAssemblyOrigin(camera(true), [a], 2, { x: 500, y: 500 }, size)).toBeNull()
  expect(assemblyOriginLabels(camera(true), [a], 2, size)).toEqual([])
  for (const p of [{ x: -1, y: 0 }, { x: 0, y: 1001 }, { x: NaN, y: 0 }]) expect(pickAssemblyOrigin(camera(), [display()], 2, p, size)).toBeNull()
})
it('projects a label at the actual transformed axis endpoint and filters stale display keys', () => {
  const a = display(); a.worldPose.translation = [1, 1, 0]
  expect(assemblyOriginLabels(camera(), [a], 2, size)).toEqual([{ key: a.key, label: a.label, binding: JSON.stringify([a.key, a.label, a.worldPose]), x: 800, y: 400 }])
  a.key = 'stale'
  expect(assemblyOriginLabels(camera(), [a], 2, size)).toEqual([])
  expect(pickAssemblyOrigin(camera(), [a], 2, { x: 700, y: 400 }, size)).toBeNull()
})
it('omits offscreen endpoint labels while retaining visible-axis picking and reference identity', () => {
  const entry = display(), view = camera(), before = structuredClone(entry)
  expect(assemblyOriginLabels(view, [entry], 2, size).map(label => [label.key, label.x, label.y])).toEqual([[entry.key, 700, 500]])
  // A parallel camera shift places the positive endpoint at x=1100; the axis
  // still crosses the viewport from x=700 to its clipped right boundary.
  view.position.x = -4; view.lookAt(-4, 0, 0); view.updateMatrixWorld()
  expect(assemblyOriginLabels(view, [entry], 2, size)).toEqual([])
  expect(pickAssemblyOrigin(view, [entry], 2, { x: 950, y: 500 }, size)).toEqual(entry.reference)
  view.position.x = 0; view.lookAt(0, 0, 0); view.updateMatrixWorld()
  expect(assemblyOriginLabels(view, [entry], 2, size).map(label => [label.key, label.x, label.y])).toEqual([[entry.key, 700, 500]])
  expect(entry).toEqual(before)
})
it('origin intent cannot coexist with material face, edge or vertex picking', () => {
  expect(assemblyReferencePickMode({ pickingOrigins: true })).toBe('origin')
  for (const other of [{ pickingFaces: true }, { pickingEdges: true }, { pickingVertices: true }])
    expect(assemblyReferencePickMode({ pickingOrigins: true, ...other })).toBe('conflict')
})

it('picks visible axis portions clipped by near and far planes without picking their hidden extensions', () => {
  // With RotY(45), world z = z0 - world x. This orthographic camera maps
  // world x to 500 + 100*x px. Near=.1 clips z>9.9; far=100 clips z<-90.
  const a = display(), c = camera()
  a.worldPose.rotation = [0, Math.sin(Math.PI / 8), 0, Math.cos(Math.PI / 8)]
  a.worldPose.translation = [0, 0, 9]
  expect(pickAssemblyOrigin(c, [a], 2, { x: 600, y: 500 }, size)).toEqual(a.reference)
  expect(pickAssemblyOrigin(c, [a], 2, { x: 380, y: 500 }, size)).toBeNull() // x=-1.2, z=10.2
  a.worldPose.translation = [0, 0, -89]
  expect(pickAssemblyOrigin(c, [a], 2, { x: 400, y: 500 }, size)).toEqual(a.reference)
  expect(pickAssemblyOrigin(c, [a], 2, { x: 630, y: 500 }, size)).toBeNull() // x=1.3, z=-90.3
})

it('clips both axis ends before perspective division, including an end behind the camera', () => {
  const a = display(), c = camera(true)
  c.near = 1; c.far = 3; c.updateProjectionMatrix()
  a.worldPose.rotation = [0, Math.sin(Math.PI / 8), 0, Math.cos(Math.PI / 8)]
  a.worldPose.translation = [0, 0, 8]
  // z=8-x gives camera depth=2+x and visible x in [-1,1]. For fov90,
  // screen x=500+500*x/(2+x): x=.5 projects to600, x=2 to750.
  // Extent3 puts original endpoints at x=+-3/sqrt(2), one behind the camera.
  expect(pickAssemblyOrigin(c, [a], 3, { x: 600, y: 500 }, size)).toEqual(a.reference)
  expect(pickAssemblyOrigin(c, [a], 3, { x: 750, y: 500 }, size)).toBeNull()
  // Coincident visible projections remain ambiguous after clipping.
  const duplicate = structuredClone(a)
  duplicate.reference.component = { occurrencePath: ['other'], definition: { id: 'original-other', revision: 'r1' } }
  duplicate.key = assemblyOriginReferenceKey(duplicate.reference)
  expect(pickAssemblyOrigin(c, [a, duplicate], 3, { x: 600, y: 500 }, size)).toBeNull()
})

it('keeps the visible part of a clipped plane selectable while rejecting near/far-clipped area', () => {
  const reference = { kind: 'principal-plane' as const, component: null, plane: 'XY' as const }
  const a: AssemblyOriginDisplay = { key: assemblyOriginReferenceKey(reference), reference, label: 'Original clipped plane', worldPose: {
    translation: [0, 0, 9], rotation: [0, Math.sin(Math.PI / 8), 0, Math.cos(Math.PI / 8)],
  } }
  const c = camera()
  // Same literal z=z0-x relation as the axis; y=1 maps to screen y400.
  expect(pickAssemblyOrigin(c, [a], 2, { x: 600, y: 400 }, size)).toEqual(reference)
  expect(pickAssemblyOrigin(c, [a], 2, { x: 380, y: 400 }, size)).toBeNull()
  a.worldPose.translation[2] = -89
  expect(pickAssemblyOrigin(c, [a], 2, { x: 400, y: 400 }, size)).toEqual(reference)
  expect(pickAssemblyOrigin(c, [a], 2, { x: 630, y: 400 }, size)).toBeNull()
  const p = camera(true); p.near = 1; p.far = 3; p.updateProjectionMatrix(); a.worldPose.translation[2] = 8
  // x=.5,y=.5,depth2.5 -> (600,400). x=2,y=.8,depth4 -> (750,400), outside far.
  expect(pickAssemblyOrigin(p, [a], 3, { x: 600, y: 400 }, size)).toEqual(reference)
  expect(pickAssemblyOrigin(p, [a], 3, { x: 750, y: 400 }, size)).toBeNull()
})

it('binds projected labels to display identity, name and exact global pose', () => {
  const a = display(), original = assemblyOriginDisplayBinding(a)
  expect(original).toBe(JSON.stringify([a.key, 'Eje X', { translation: [0, 0, 0], rotation: [0, 0, 0, 1] }]))
  expect(assemblyOriginLabels(camera(), [a], 2, size)[0].binding).toBe(original)
  const changed = structuredClone(a); changed.label = 'Another scope'
  expect(assemblyOriginDisplayBinding(changed)).not.toBe(original)
  changed.label = a.label; changed.worldPose.translation[0] = .01
  expect(assemblyOriginDisplayBinding(changed)).not.toBe(original)
  changed.worldPose = identityRigidPose(); changed.worldPose.rotation = [0, 0, Math.SQRT1_2, Math.SQRT1_2]
  expect(assemblyOriginDisplayBinding(changed)).not.toBe(original)
})
