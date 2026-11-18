import { expect, it } from 'vitest'
import type { ImportedBodiesFeature, SketchFeature } from '../cad/kernel.types'
import { createDocument, serializeDocument, validateDocument } from './document'
import { createStepSource } from './stepSource'

it('counts final UTF-8 document bytes even when the complete body-source table fits its preflight limit', () => {
  // Original zero-byte integrity payload, deliberately not transferable CAD.
  // Each source is below 8 MiB; their base64 sum is 20,960,000 bytes, below
  // 20 MiB. Additional Unicode feature names must still count toward the file.
  const source = createStepSource(new Uint8Array(7_860_000))
  const base: ImportedBodiesFeature = { id: 'base', name: 'Original size boundary', type: 'importedBodies', suppressed: false,
    bodies: [{ bodyId: 'A', source }, { bodyId: 'B', source }] }
  const input = { ...createDocument(), features: [base] }
  expect(base.bodies.reduce((sum, body) => sum + body.source.data.length, 0)).toBeLessThan(20 * 1024 * 1024)
  const compact = validateDocument(input)
  expect(new TextEncoder().encode(serializeDocument(compact)).byteLength).toBeLessThanOrEqual(20 * 1024 * 1024)
  const sketches: SketchFeature[] = Array.from({ length: 64 }, (_, index) => ({
    id: 'sketch-' + index, name: 'Ω'.repeat(200), type: 'sketch', suppressed: false, plane: 'XY', offset: 0,
    profile: { kind: 'rectangle', center: [0, 0], width: 1, height: 1 },
  }))
  expect(() => validateDocument({ ...input, features: [base, ...sketches] })).toThrow(/documento serializado supera 20 MiB/)
})
