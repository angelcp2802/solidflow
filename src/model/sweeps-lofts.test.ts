import { describe, expect, it } from 'vitest'
import type { Feature, LoftFeature, SketchFeature, SweepFeature } from '../cad/kernel.types'
import { addFeature, createDemoDocument, createDocument, DocumentHistory, parseDocument, removeFeature, serializeDocument, updateFeature, validateDocument } from './document'

function sketch(id: string): SketchFeature {
  return { id, name: id, type: 'sketch', plane: 'XY', offset: 0, suppressed: false, profile: { kind: 'circle', center: [0, 0], radius: 5 } }
}
function sweep(): SweepFeature {
  return {
    id: 'sweep', name: 'Barrido', type: 'sweep', suppressed: false,
    profileSketchId: 'profile', pathSketchId: 'path',
    path: [{ entityId: 'segment-b', reversed: true }, { entityId: 'segment-a', reversed: false }], orientation: 'followPath', merge: true,
  }
}
function loft(): LoftFeature {
  return {
    id: 'loft', name: 'Recubrimiento', type: 'loft', suppressed: false, ruled: false, merge: false,
    sections: [{ sketchId: 'end', startEntityId: 'lost-entity', reversed: true }, { sketchId: 'profile', startEntityId: null, reversed: false }],
  }
}
function documentWith(...features: unknown[]) {
  return validateDocument({ ...createDocument(), features: [sketch('profile'), sketch('path'), sketch('end'), ...features] })
}

describe('sweep and loft document persistence', () => {
  it('round trips order, orientation, connectors and legacy documents without a format bump', () => {
    const document = documentWith(sweep(), loft())
    expect(document.version).toBe(1)
    expect(parseDocument(serializeDocument(document))).toEqual(document)
    expect(parseDocument(serializeDocument(createDemoDocument())).features).toHaveLength(10)
    expect(document.features[4]).toMatchObject({ sections: [{ sketchId: 'end' }, { sketchId: 'profile' }] })
  })

  it('allows stale entity references so a changed sketch can be saved and repaired', () => {
    const document = documentWith(sweep(), loft())
    const edited = updateFeature(document, 'path', { profile: { kind: 'entities', points: [], entities: [], constraints: [] } })
    expect(parseDocument(serializeDocument(edited)).features[3]).toMatchObject({ path: sweep().path })
    expect(edited.features[4]).toMatchObject({ sections: loft().sections })
  })

  it.each([
    [{ ...sweep(), orientation: 'keepNormal' }, 'orientation'],
    [{ ...sweep(), merge: 1 }, 'merge'],
    [{ ...sweep(), path: [] }, 'path'],
    [{ ...sweep(), path: [{ entityId: 'a', reversed: false }, { entityId: 'a', reversed: true }] }, 'duplicada'],
    [{ ...sweep(), path: [{ entityId: 'a', reversed: false, index: 1 }] }, 'desconocido'],
    [{ ...sweep(), path: [{ entityId: '', reversed: false }] }, 'entityId'],
    [{ ...sweep(), path: [{ entityId: 'bad\nID', reversed: false }] }, 'entityId'],
    [{ ...sweep(), path: [{ entityId: 'a', reversed: 'false' }] }, 'reversed'],
    [{ ...sweep(), path: new Array(1) }, 'obligatorio'],
    [{ ...sweep(), obsoletePathEntityId: 'a' }, 'desconocido'],
    [{ ...loft(), ruled: 0 }, 'ruled'],
    [{ ...loft(), sections: [loft().sections[0]] }, 'sections'],
    [{ ...loft(), sections: [loft().sections[0], loft().sections[0]] }, 'duplicado'],
    [{ ...loft(), sections: [{ sketchId: 'profile', reversed: false }, loft().sections[0]] }, 'startEntityId'],
    [{ ...loft(), sections: [{ sketchId: 'profile', startEntityId: '', reversed: false }, loft().sections[0]] }, 'startEntityId'],
    [{ ...loft(), sections: [{ sketchId: 'profile', startEntityId: null, reversed: false, seam: 0 }, loft().sections[0]] }, 'desconocido'],
    [{ ...loft(), sections: new Array(2) }, 'obligatorio'],
  ])('rejects malformed feature %j', (feature, message) => {
    expect(() => documentWith(feature)).toThrow(message as string)
  })

  it('enforces segment and section limits while allowing the specified boundaries', () => {
    const path = Array.from({ length: 128 }, (_, index) => ({ entityId: `edge-${index}`, reversed: false }))
    expect(() => documentWith({ ...sweep(), path })).not.toThrow()
    expect(() => documentWith({ ...sweep(), path: [...path, { entityId: 'overflow', reversed: false }] })).toThrow('128')
    const sketches = Array.from({ length: 32 }, (_, index) => sketch(`section-${index}`))
    const sections = sketches.map((sketch) => ({ sketchId: sketch.id, startEntityId: null, reversed: false }))
    expect(() => validateDocument({ ...createDocument(), features: [...sketches, { ...loft(), sections }] })).not.toThrow()
    expect(() => validateDocument({ ...createDocument(), features: [...sketches, sketch('overflow'), { ...loft(), sections: [...sections, { sketchId: 'overflow', startEntityId: null, reversed: false }] }] })).toThrow('32')
  })

  it('requires earlier sketches for every input, including suppressed operations', () => {
    const solid: Feature = { id: 'solid', name: 'Sólido', type: 'extrude', sketchId: 'profile', depth: 10, symmetric: false, suppressed: false }
    const plane: Feature = { id: 'plane', name: 'Plano', type: 'plane', support: { kind: 'principal', plane: 'XY' }, offset: 10, reversed: false, suppressed: false }
    for (const id of ['missing', 'solid', 'plane', 'sweep', 'later']) {
      for (const field of ['profileSketchId', 'pathSketchId']) {
        expect(() => documentWith(solid, plane, { ...sweep(), [field]: id, suppressed: true }, sketch('later'))).toThrow(`${field}: debe referenciar un croquis anterior`)
      }
      expect(() => documentWith(solid, plane, { ...loft(), sections: [{ sketchId: id, startEntityId: null, reversed: false }, loft().sections[1]] }, sketch('later'))).toThrow('sections[0].sketchId')
    }
  })

  it('keeps suppressed sketch dependencies and detached nested arrays through history', () => {
    const initial = documentWith(sweep(), loft())
    const history = new DocumentHistory(initial)
    const reversed = sweep().path.reverse().map((segment) => ({ ...segment, reversed: !segment.reversed }))
    history.apply(updateFeature(initial, 'sweep', { path: reversed, merge: false }))
    history.apply(updateFeature(history.current, 'loft', { sections: [...loft().sections].reverse(), ruled: true }))
    history.apply(updateFeature(history.current, 'path', { suppressed: true }))
    expect(history.current.features[3]).toMatchObject({ suppressed: false })
    history.undo()
    const changed = history.current
    const detached = changed.features[3] as SweepFeature
    detached.path[0].entityId = 'mutated'
    const detachedLoft = changed.features[4] as LoftFeature
    detachedLoft.sections[0].sketchId = 'mutated'
    expect(history.current.features[3]).toMatchObject({ path: reversed })
    expect(history.undo().features[4]).toEqual(loft())
    expect(history.undo()).toEqual(initial)
    expect(history.redo().features[3]).toMatchObject({ path: reversed, merge: false })
    expect(parseDocument(serializeDocument(history.redo())).features[4]).toMatchObject({ ruled: true, sections: [...loft().sections].reverse() })
  })

  it.each(['profile', 'path'])('deletes a sweep and transitive face/plane/loft dependents when removing %s', (input) => {
    let document = documentWith(sweep())
    document = addFeature(document, {
      id: 'support', name: 'Plano en barrido', type: 'plane', offset: 0, reversed: false, suppressed: false,
      support: { kind: 'face', face: { sourceFeatureId: 'sweep', key: 'face-v1|stored-key' } },
    })
    document = addFeature(document, { ...sketch('on-support'), support: { kind: 'plane', planeId: 'support' } })
    document = addFeature(document, { ...loft(), sections: [{ sketchId: 'end', startEntityId: null, reversed: false }, { sketchId: 'on-support', startEntityId: null, reversed: false }] })
    document = addFeature(document, { id: 'finish', name: 'Redondeo', type: 'fillet', size: 1, selection: { mode: 'all' }, baseFeatureId: 'loft', suppressed: false })
    expect(removeFeature(document, input).features.map((feature) => feature.id)).toEqual(input === 'profile' ? ['path', 'end'] : ['profile', 'end'])
    expect(document.features).toHaveLength(8)
    expect(removeFeature(document, 'sweep').features.map((feature) => feature.id)).toEqual(['profile', 'path', 'end'])
  })

  it('deletes a loft from any section but retains unrelated sweeps and source sketches', () => {
    const document = documentWith(sweep(), loft())
    expect(removeFeature(document, 'end').features.map((feature) => feature.id)).toEqual(['profile', 'path', 'sweep'])
    expect(removeFeature(document, 'loft').features.map((feature) => feature.id)).toEqual(['profile', 'path', 'end', 'sweep'])
  })
})
