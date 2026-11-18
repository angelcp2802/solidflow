import { describe, expect, it } from 'vitest'
import type { AssemblyGeometryReference } from '../model/assemblyDocument'
import { assemblyRelationDefault, isAssemblyOrdinaryCreationType } from './assemblyRelationDefaults'

// Original declarations, not native-surface or solver evidence.
const plane: AssemblyGeometryReference = { kind: 'principal-plane', component: null, plane: 'XY' }
const axis: AssemblyGeometryReference = { kind: 'principal-axis', component: null, axis: 'X' }
const component = { occurrencePath: ['original'], definition: { id: 'original-prism', revision: 'r1' } }
const line: AssemblyGeometryReference = { kind: 'edge', component, body: null,
  edge: { sourceFeatureId: 'original-extrusion', key: 'edge-v1|' + 'a'.repeat(64) }, support: 'line' }
const cylinder: AssemblyGeometryReference = { kind: 'face', component, body: null,
  face: { sourceFeatureId: 'original-extrusion', key: 'face-v1|' + 'b'.repeat(64) }, support: 'axis' }

describe('ordinary relation preselection defaults', () => {
  it('suggests coincidence for planes and concentricity for declared axes', () => {
    expect(assemblyRelationDefault([plane], 'concentric')).toBe('coincident')
    expect(assemblyRelationDefault([plane, plane], 'concentric')).toBe('coincident')
    expect(assemblyRelationDefault([axis], 'coincident')).toBe('concentric')
    expect(assemblyRelationDefault([cylinder, axis], 'distance')).toBe('concentric')
  })
  it('keeps LINE distinct from cylindrical or origin axes, in either endpoint order', () => {
    expect(assemblyRelationDefault([line], 'concentric')).toBe('parallel')
    expect(assemblyRelationDefault([line, axis], 'concentric')).toBe('parallel')
    expect(assemblyRelationDefault([axis, line], 'concentric')).toBe('parallel')
    expect(assemblyRelationDefault([plane, line], 'coincident')).toBe('parallel')
    expect(assemblyRelationDefault([line, plane], 'coincident')).toBe('parallel')
  })
  it('retains a compatible chosen ordinary family without estimating a geometric value', () => {
    expect(assemblyRelationDefault([plane, plane], 'distance')).toBe('distance')
    expect(assemblyRelationDefault([axis, cylinder], 'angle')).toBe('angle')
    expect(assemblyRelationDefault([plane, axis], 'perpendicular')).toBe('perpendicular')
    expect(assemblyRelationDefault([line, plane], 'parallel')).toBe('parallel')
  })
  it('declines missing/excess endpoints and specialized surface intent', () => {
    expect(assemblyRelationDefault([], 'coincident')).toBeNull()
    expect(assemblyRelationDefault([plane, plane, plane], 'coincident')).toBeNull()
    const surfaceIntent = { ...cylinder, support: 'cylinder-surface' } as unknown as AssemblyGeometryReference
    expect(assemblyRelationDefault([surfaceIntent], 'parallel')).toBeNull()
    expect(isAssemblyOrdinaryCreationType('hinge')).toBe(false)
    expect(isAssemblyOrdinaryCreationType('tangent')).toBe(false)
    expect(isAssemblyOrdinaryCreationType('distance')).toBe(true)
  })
})
