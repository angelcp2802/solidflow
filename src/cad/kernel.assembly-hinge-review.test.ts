import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { setOC } from 'replicad'
import { beforeAll, expect, it } from 'vitest'
import type { AssemblyFaceReference, AssemblyPlaneReference } from '../model/assemblyDocument'
import { originalHingeDocument } from './kernel.assembly-hinge-fixture.test-utils'
import { buildAssemblyScene } from './kernel.assembly-scene'
import { AssemblyGeometrySnapshot } from './kernel.assembly-snapshot'
import { measureAssemblyHingeReferences } from './kernel.assembly-hinge'

beforeAll(async () => setOC(await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')) })), 60_000)

it('withholds a native hinge certificate when an axial cap defect fits the nominal band but not its retained support envelope', () => {
  const document = originalHingeDocument()
  // Independently specified physical gap: lower leaf cap Z4, upper leaf cap
  // Z(4 + 0.8e-6). The nominal gap is below the requested one micrometre band.
  document.occurrences[1].pose.translation[2] = 4 + 0.8e-6
  const scene = buildAssemblyScene(document)
  const axis = (owner: string): AssemblyFaceReference & { support: 'axis' } => {
    const body = scene.bodies.find(b => b.component.occurrencePath[0] === owner)!
    const faces = body.faces.filter(f => f.support?.kind === 'cylinder' && Math.abs(f.support.radius - 1) < 1e-10)
    expect(faces).toHaveLength(1)
    return { kind: 'face', ...structuredClone(faces[0].selection), support: 'axis' }
  }
  const cap = (owner: string, z: number): AssemblyPlaneReference => {
    const body = scene.bodies.find(b => b.component.occurrencePath[0] === owner)!
    const faces = body.faces.filter(f => f.support?.kind === 'plane' && Math.abs(f.support.point[2] - z) < 1e-10 && Math.abs(f.support.normal[2]) > .99)
    expect(faces).toHaveLength(1)
    return { kind: 'face', ...structuredClone(faces[0].selection), support: 'plane' }
  }
  const snapshot = new AssemblyGeometrySnapshot(document)
  try {
    const result = measureAssemblyHingeReferences(snapshot, document, {
      axis: [axis('ground'), axis('moving')], axial: [cap('ground', 4), cap('moving', 0)], alignment: 'aligned',
    })
    expect(result.status).toBe('precisionLimit')
    // A numerical precision result must leave the borrowed snapshot usable.
    snapshot.resolveReference(document, cap('ground', 4))
  } finally { snapshot.dispose() }
})
