import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { getOC, makeVertex, setOC, type Vertex } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import { extractAssemblyVertexSupport } from './kernel.assembly-supports'
import { NativeCleanupError, withNativeOwners } from './kernel.native-ownership'

beforeAll(async()=>setOC(await initOpenCascade({wasmBinary:await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm'))})),60_000)
it('queries the actual borrowed native vertex point and tolerance afresh',()=>withNativeOwners(owners=>{
  const vertex=owners.own(makeVertex([2,-3,4])),first=extractAssemblyVertexSupport(vertex)
  expect(first).toMatchObject({kind:'point',point:[2,-3,4]});expect(Number.isFinite(first.tolerance)).toBe(true);expect(first.tolerance).toBeGreaterThanOrEqual(0)
  first.point[0]=123;expect(extractAssemblyVertexSupport(vertex).point).toEqual([2,-3,4])
  expect(vertex.wrapped.IsNull()).toBe(false)
}),60_000)
it.each([NaN,Infinity,-1])('rejects invalid native vertex tolerance %s',tolerance=>withNativeOwners(owners=>{
  const vertex=owners.own(makeVertex([2,-3,4])),spy=vi.spyOn(getOC().BRep_Tool,'Tolerance').mockReturnValue(tolerance)
  try{expect(()=>extractAssemblyVertexSupport(vertex)).toThrow(/tolerancia/)}finally{spy.mockRestore()}
  expect(extractAssemblyVertexSupport(vertex).point).toEqual([2,-3,4])
}),60_000)
it('rejects unavailable or wrong-type raw topology without a point query',()=>{
  const shape={wrapped:{IsNull:()=>true}} as unknown as Vertex
  expect(()=>extractAssemblyVertexSupport(shape)).toThrow(/disponible/)
  const wrong={wrapped:{IsNull:()=>false,ShapeType:()=>getOC().TopAbs_ShapeEnum.TopAbs_EDGE}} as unknown as Vertex
  expect(()=>extractAssemblyVertexSupport(wrong)).toThrow(/disponible/)
})
it('preserves invalid-point and release errors while releasing the received Pnt once',()=>withNativeOwners(owners=>{
  const vertex=owners.own(makeVertex([2,-3,4])),oc=getOC(),read=oc.BRep_Tool.Pnt,releaseFailure=new Error('Original native point release fault');let releases=0
  const spy=vi.spyOn(oc.BRep_Tool,'Pnt').mockImplementation(v=>{
    const point=read(v),release=point.delete.bind(point)
    point.X=()=>NaN;point.delete=()=>{releases++;release();throw releaseFailure};return point
  })
  let caught:unknown;try{extractAssemblyVertexSupport(vertex)}catch(e){caught=e}finally{spy.mockRestore()}
  expect(caught).toBeInstanceOf(NativeCleanupError);expect((caught as AggregateError).errors).toContain(releaseFailure);expect(releases).toBe(1)
  expect(extractAssemblyVertexSupport(vertex).point).toEqual([2,-3,4])
}),60_000)
