import { expect,it } from 'vitest'
import { measureSymmetrySupports as measure,type SymmetryMeasuredSupport as Support } from './assemblySymmetryMeasurement'
const mirror:Support&{kind:'plane'}={kind:'plane',pointMm:[7/3,14/3,14/3],normal:[1/3,2/3,2/3],positionErrorMm:0,directionErrorRad:0}
const kinds=['point','line','plane','sphere','cylinder'] as const
function support(kind:typeof kinds[number],target=false):Support {
  const base={pointMm:(target?[6,12,10]:[1,2,-1]) as [number,number,number],positionErrorMm:0}
  if(kind==='point')return{...base,kind}
  if(kind==='sphere')return{...base,kind,radiusMm:3,radiusErrorMm:0}
  if(kind==='plane')return{...base,kind,normal:target?[0,1,0]:[1,0,0],directionErrorRad:0}
  return{...base,kind,axis:target?[0,1,0]:[1,0,0],directionErrorRad:0,...(kind==='cylinder'?{radiusMm:3,radiusErrorMm:0}:{})} as Support
}
function result(a:Support,b:Support,m=mirror,alignment:'aligned'|'opposed'|null=a.kind==='point'||a.kind==='sphere'?null:'aligned'){
  const r=measure(a,b,m,alignment,1e-6,1e-8);expect(r.status).toBe('ok');if(r.status!=='ok')throw Error(r.message);return r
}
for(const kind of kinds)it('independent rational reflection measurement: '+kind,()=>{
  // H=[7,-4,-4;-4,1,-8;-4,-8,1]/9; reflection of A is (5,10,7).
  // delta=(1,2,3); target direction is Y and reflected X=(7,-4,-4)/9.
  const a=support(kind),b=support(kind,true),r=result(a,b)
  expect(r.positionErrorMm).toBeCloseTo(kind==='plane'?2:kind==='line'||kind==='cylinder'?Math.sqrt(10):Math.sqrt(14),12)
  expect(r.angleRadians).toEqual(kind==='point'||kind==='sphere'?null:expect.closeTo(Math.atan2(Math.sqrt(65),-4),12))
  expect(r.radiusDifferenceMm).toBe(kind==='sphere'||kind==='cylinder'?0:null)
  expect(r.satisfied).toBe(false)
  const shift=(s:Support):Support=>({...s,pointMm:[s.pointMm[0]+17,s.pointMm[1]-23,s.pointMm[2]+9]})
  const moved=result(shift(a),shift(b),shift(mirror) as typeof mirror)
  expect(moved.positionErrorMm).toBeCloseTo(r.positionErrorMm,12)
  expect(moved.angleRadians).toEqual(r.angleRadians)
})
for(const kind of kinds)it('zero set and opposite direction branch: '+kind,()=>{
  const a=support(kind),b={...support(kind,true),pointMm:[5,10,7]} as Support
  if(b.kind==='plane')b.normal=[7/9,-4/9,-4/9]
  if(b.kind==='line'||b.kind==='cylinder')b.axis=[7/9,-4/9,-4/9]
  expect(result(a,b).satisfied).toBe(true)
  if(b.kind==='plane'||b.kind==='line'||b.kind==='cylinder'){
    expect(result(a,b,mirror,'opposed').angleRadians).toBeCloseTo(Math.PI,14)
    expect(result(a,b,mirror,'opposed').satisfied).toBe(false)
  }
})
it('radius mismatch is physical failure; uncertainty never widens its band',()=>{
  const a=support('sphere'),b={...support('sphere',true),pointMm:[5,10,7],radiusMm:4} as Support
  expect(result(a,b).radiusDifferenceMm).toBe(1)
  expect(result(a,b).satisfied).toBe(false)
  expect(measure(a,{...b,radiusErrorMm:1} as Support,mirror,null,1e-6,1e-8).status).toBe('precisionLimit')
})
it('mirror lever arm and off-solution target projection uncertainty are propagated',()=>{
  const a=support('point'),b=support('point',true)
  expect(measure(a,b,{...mirror,directionErrorRad:1e-7},null,1e-6,1e-8).status).toBe('precisionLimit')
  const p=support('plane'),q={...support('plane',true),directionErrorRad:1e-5} as Support
  expect(measure(p,q,mirror,'aligned',1e-6,1e-3).status).toBe('precisionLimit')
})
it('rejects malformed purposes, nonfinite data, nonunit directions and invalid bands',()=>{
  const a=support('point'),b=support('point',true)
  for(const tol of [0,-1,NaN,Infinity])expect(()=>measure(a,b,mirror,null,tol,1e-8)).toThrow()
  expect(()=>measure(a,b,mirror,'aligned',1e-6,1e-8)).toThrow()
  expect(()=>measure(a,support('sphere'),mirror,null,1e-6,1e-8)).toThrow()
  expect(()=>measure(a,b,{...mirror,normal:[2,0,0]},null,1e-6,1e-8)).toThrow()
  expect(()=>measure({...a,positionErrorMm:-1},b,mirror,null,1e-6,1e-8)).toThrow()
  expect(()=>measure({...a,pointMm:[NaN,0,0]},b,mirror,null,1e-6,1e-8)).toThrow()
})
it('finite huge reflection is diagnosed rather than publishing an overflowed physical measurement',()=>{
  const a:Support={kind:'point',pointMm:[Number.MAX_VALUE,0,0],positionErrorMm:0}
  const b:Support={kind:'point',pointMm:[0,0,0],positionErrorMm:0}
  const m:typeof mirror={...mirror,pointMm:[-Number.MAX_VALUE,0,0],normal:[1,0,0]}
  expect(measure(a,b,m,null,1e-6,1e-8).status).toBe('precisionLimit')
})
it('does not certify a subnormal physical defect or uncertainty using an underflowed rounding bound',()=>{
  const tiny=2**-1074
  const a:Support={kind:'point',pointMm:[0,0,0],positionErrorMm:0}
  const m:typeof mirror={...mirror,pointMm:[0,0,0],normal:[1,0,0]}
  expect(measure(a,{...a,pointMm:[tiny,0,0]},m,null,tiny,1e-8).status).toBe('precisionLimit')
  expect(measure({...a,positionErrorMm:tiny},a,m,null,1e-6,1e-8).status).toBe('precisionLimit')
  const sphere:Support={...a,kind:'sphere',radiusMm:tiny,radiusErrorMm:0}
  expect(measure(sphere,sphere,m,null,1e-6,1e-8).status).toBe('precisionLimit')
  // Normal inputs can subtract to a subnormal displacement: 2^-1022 and its
  // next representable neighbour are distinct, but their difference is 2^-1074.
  const normal=2**-1022
  expect(measure({...a,pointMm:[normal,0,0]},{...a,pointMm:[normal+tiny,0,0]},
    {...m,pointMm:[normal,0,0]},null,normal,1e-8).status).toBe('precisionLimit')
})
