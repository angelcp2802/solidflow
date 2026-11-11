import { expect, it } from 'vitest'
import type { Vec3 } from '../cad/kernel.types'
import { retractRigidBodyPose } from './assemblyKinematics'
import { composeRigidPoses, identityRigidPose, transformRigidDirection, transformRigidPoint, type Quaternion } from './rigidPose'
import { compareSymmetrySupports, compareConditionedSymmetrySupports, type SymmetrySupport, type SymmetryConditioning, type SymmetryComparison, type SymmetryAlignment, type ConditionedSymmetrySupport } from './assemblySymmetryGeometry'

// Original infinite-support mathematics. No saved, native or external model evidence.
const policy: SymmetryConditioning = {originMm:[1,-2,3],lengthScaleMm:2,lengthToleranceMm:1e-6,angleToleranceRad:1e-8}
const identity:Quaternion=[0,0,0,1], frame:Quaternion=[.2,.4,.4,.8]
const kinds=['point','line','plane','sphere','cylinder'] as const
const dot=(a:readonly number[],b:readonly number[])=>a.reduce((s,v,i)=>s+v*b[i],0)
const near=(a:readonly number[],b:readonly number[],tol=1e-11)=>{expect(a).toHaveLength(b.length);a.forEach((v,i)=>{expect(Number.isFinite(v)).toBe(true);expect(Math.abs(v-b[i])).toBeLessThanOrEqual(tol)})}
function support(kind:typeof kinds[number],ownerId:string|null,pointMm:Vec3,target=false):SymmetrySupport {
  const base={ownerId,pointMm}
  if(kind==='point')return {...base,kind}
  if(kind==='sphere')return {...base,kind,radiusMm:3}
  if(kind==='plane')return {...base,kind,normal:target?[0,1,0]:[1,0,0]}
  return {...base,kind,direction:target?[0,1,0]:[1,0,0],...(kind==='cylinder'?{radiusMm:3}:{})} as SymmetrySupport
}
const mirror=():SymmetrySupport&{kind:'plane'}=>({kind:'plane',ownerId:'m',pointMm:[7/3,14/3,14/3],normal:[1/3,2/3,2/3]})
const alignment=(kind:typeof kinds[number]):SymmetryAlignment=>kind==='point'||kind==='sphere'?null:'aligned'
function fixture(kind:typeof kinds[number]):[SymmetrySupport,SymmetrySupport,SymmetrySupport&{kind:'plane'}] {return [support(kind,'a',[1,2,-1]),support(kind,'b',[6,12,10],true),mirror()]}
function ok(value:ReturnType<typeof compareSymmetrySupports>):SymmetryComparison {expect(value.status,value.status==='ok'?'':value.message).toBe('ok');if(value.status!=='ok')throw Error(value.message);return value}
const compare=(v:ReturnType<typeof fixture>,q=identity,c=policy)=>ok(compareSymmetrySupports(...v,alignment(v[0].kind),q,c))

for(const kind of kinds)it('reflects original rational '+kind+' supports with independent literal defects',()=>{
  // m=(1,2,2)/3,c=7: H=[7,-4,-4;-4,1,-8;-4,-8,1]/9.
  // H*(1,2,-1)+2cm=(5,10,7); target minus reflection=(1,2,3).
  const value=compare(fixture(kind)),directional=alignment(kind)!==null
  near(value.reflected.point,[2,6,2])
  near(value.position,kind==='plane'?[0,1,0]:kind==='line'||kind==='cylinder'?[.5,0,1.5]:[.5,1,1.5])
  near([value.positionErrorMm],[kind==='plane'?2:kind==='line'||kind==='cylinder'?Math.sqrt(10):Math.sqrt(14)])
  if(directional){near(value.reflected.direction!,[7/9,-4/9,-4/9]);near(value.normal!,[-7/9,13/9,4/9]);near([value.angleRadians!],[Math.atan2(Math.sqrt(65),-4)])}
  else {expect(value.normal).toBeNull();expect(value.reflected.direction).toBeNull();expect(value.angleRadians).toBeNull()}
  expect(value.radiusDifferenceMm).toBe(kind==='sphere'||kind==='cylinder'?0:null)
})

for(const kind of ['line','plane','cylinder'] as const)it('keeps explicit opposed normal sign for '+kind,()=>{
  const v=fixture(kind),value=ok(compareSymmetrySupports(...v,'opposed',identity,policy))
  near(value.normal!,[7/9,5/9,-4/9]);near([value.angleRadians!],[Math.atan2(Math.sqrt(65),4)])
  near(value.position,compare(v).position)
})

it('expresses literal defects in the original rational source frame',()=>{
  near(compare(fixture('point'),frame).position,[13/50,33/25,13/10])
  near(compare(fixture('plane'),frame).normal!,[149/225,343/225,-16/45])
})

it('preserves the same mirror plane under reversal of its declared normal',()=>{
  for(const kind of kinds){const v=fixture(kind),base=compare(v,frame);v[2].normal=v[2].normal.map(x=>-x) as Vec3;const reversed=compare(v,frame)
    near(reversed.position,base.position);if(base.normal)near(reversed.normal!,base.normal)
    base.supports.forEach((block,i)=>{for(let col=0;col<6;col++){near(reversed.supports[i].position[col],block.position[col]);if(block.normal)near(reversed.supports[i].normal![col],block.normal[col])}})
  }
})

function moved(s:SymmetrySupport,owner:string,col:number,h:number):SymmetrySupport {
  if(s.ownerId!==owner)return structuredClone(s)
  const delta=Array(6).fill(0);delta[col]=h
  const pose=retractRigidBodyPose(identityRigidPose(),delta,policy.originMm,policy.lengthScaleMm)
  const value={...s,pointMm:transformRigidPoint(pose,s.pointMm)}
  if(value.kind==='plane')value.normal=transformRigidDirection(pose,value.normal)
  if(value.kind==='line'||value.kind==='cylinder')value.direction=transformRigidDirection(pose,value.direction)
  return value
}
function movedFrame(owner:string,sourceOwner:string|null,col:number,h:number):Quaternion {
  if(owner!==sourceOwner)return frame
  const delta=Array(6).fill(0);delta[col]=h
  return composeRigidPoses(retractRigidBodyPose(identityRigidPose(),delta,policy.originMm,policy.lengthScaleMm),{translation:[0,0,0],rotation:frame}).rotation
}
for(const kind of kinds)it('differentiates all three moving owners for '+kind+' with actual left retractions and attached oblique frame',()=>{
  for(const ids of [['a','b','m'],['shared','shared','m'],['a',null,'m'],['shared','shared','shared']] as const){
  const v=fixture(kind);v.forEach((s,i)=>{s.ownerId=ids[i]});const base=compare(v,frame),owners=[...new Set(ids.filter((id):id is Exclude<typeof id,null>=>id!==null))]
  expect(base.owners.map(o=>o.ownerId)).toEqual(owners)
  for(const h of [2e-6,7e-7])for(const owner of owners)for(let col=0;col<6;col++){
    const evalAt=(amount:number)=>compare(v.map(s=>moved(s,owner,col,amount)) as ReturnType<typeof fixture>,movedFrame(owner,v[0].ownerId,col,amount))
    const plus=evalAt(h),minus=evalAt(-h),block=base.owners.find(o=>o.ownerId===owner)!
    for(const field of ['position','normal'] as const){
      if(base[field]===null){expect(block[field]).toBeNull();continue}
      const fd=plus[field]!.map((x,i)=>(x-minus[field]![i])/(2*h))
      near(block[field]![col],fd,5e-7*Math.max(1,...fd.map(Math.abs)))
    }
  }
  }
})

for(const kind of kinds)it('accumulates repeated/null ownership and preserves formal columns for '+kind,()=>{
  const v=fixture(kind);v[0].ownerId='shared';v[1].ownerId='shared';v[2].ownerId=null
  const value=compare(v,frame);expect(value.supports).toHaveLength(3);expect(value.owners.map(o=>o.ownerId)).toEqual(['shared'])
  for(let col=0;col<6;col++)for(const field of ['position','normal'] as const){
    if(value[field]===null)continue
    near(value.owners[0][field]![col],value.supports[0][field]![col].map((x,i)=>x+value.supports[1][field]![col][i]))
  }
  expect(value.supports[2].position.flat().some(x=>Math.abs(x)>1e-6)).toBe(true)
  v.forEach(s=>{s.ownerId=null});expect(compare(v,frame).owners).toEqual([])
})

const rotateGauge=(p:readonly number[]):Vec3=>[(9*p[0]-12*p[1]+20*p[2])/25,(20*p[0]+15*p[1])/25,(-12*p[0]+16*p[1]+15*p[2])/25]
function gauge(s:SymmetrySupport):SymmetrySupport{
  const value={...s,pointMm:rotateGauge(s.pointMm).map((x,i)=>x+[7,-11,13][i]) as Vec3}
  if(value.kind==='plane')value.normal=rotateGauge(value.normal)
  if(value.kind==='line'||value.kind==='cylinder')value.direction=rotateGauge(value.direction)
  return value
}
for(const kind of kinds)it('preserves common rigid gauge off solution for '+kind,()=>{
  const v=fixture(kind),base=compare(v,frame),transformed=v.map(gauge) as ReturnType<typeof fixture>
  const nextFrame=composeRigidPoses({translation:[0,0,0],rotation:frame},{translation:[0,0,0],rotation:frame}).rotation
  const actual=compare(transformed,nextFrame)
  near(actual.position,base.position,2e-12);if(base.normal)near(actual.normal!,base.normal,2e-12)
  for(let col=0;col<6;col++){
    near([0,1,2].map(i=>base.owners.reduce((s,o)=>s+o.position[col][i],0)),[0,0,0],2e-11)
    if(base.normal)near([0,1,2].map(i=>base.owners.reduce((s,o)=>s+o.normal![col][i],0)),[0,0,0],2e-11)
  }
})

it('preserves mirror tangential anchor reparameterization off solution',()=>{
  for(const kind of kinds){const v=fixture(kind),base=compare(v,frame);v[2].pointMm=v[2].pointMm.map((x,i)=>x+[2,-1,0][i]) as Vec3;const changed=compare(v,frame);near(changed.position,base.position);if(base.normal)near(changed.normal!,base.normal)
    base.supports.forEach((block,i)=>{for(let col=0;col<6;col++){near(changed.supports[i].position[col],block.position[col]);if(block.normal)near(changed.supports[i].normal![col],block.normal[col])}})
  }
})

it('preserves source plane tangential and line axial parameters when orientation agrees',()=>{
  for(const kind of ['plane','line','cylinder'] as const){
    const v=fixture(kind);if(v[1].kind==='plane')v[1].normal=[7/9,-4/9,-4/9];if(v[1].kind==='line'||v[1].kind==='cylinder')v[1].direction=[7/9,-4/9,-4/9]
    const base=compare(v)
    const shift=kind==='plane'?[0,2,0]:[2,0,0]
    v[0].pointMm=v[0].pointMm.map((x,i)=>x+shift[i]) as Vec3
    near(compare(v).position,base.position)
  }
})

it('distinguishes incompatible radius from supplied uncertainty and finite arithmetic limits',()=>{
  for(const kind of ['sphere','cylinder'] as const){
    const v=fixture(kind);if(v[1].kind==='sphere'||v[1].kind==='cylinder')v[1].radiusMm=3.001
    expect(compareSymmetrySupports(...v,alignment(kind),identity,policy).status).toBe('incompatibleRadius')
  }
  const v=fixture('point');v[2].normalErrorRad=1e-3
  expect(compareSymmetrySupports(...v,null,identity,policy).status).toBe('precisionLimit')
  const p=fixture('point');p[0].pointErrorMm=1e-3
  expect(compareSymmetrySupports(...p,null,identity,policy).status).toBe('precisionLimit')
  expect(compareSymmetrySupports(...fixture('point'),null,identity,{...policy,lengthScaleMm:1e308,lengthToleranceMm:Number.MIN_VALUE}).status).toBe('precisionLimit')
})

it('retains normalized small offsets which world coordinates cannot recover',()=>{
  const c={...policy,originMm:[1e16,0,0] as Vec3,lengthScaleMm:1}
  const a:ConditionedSymmetrySupport={kind:'point',ownerId:'a',point:[-.25,0,0]},b:ConditionedSymmetrySupport={kind:'point',ownerId:'b',point:[.5,0,0]},m:ConditionedSymmetrySupport&{kind:'plane'}={kind:'plane',ownerId:'m',point:[0,0,0],normal:[1,0,0]}
  near(ok(compareConditionedSymmetrySupports(a,b,m,null,identity,c)).position,[.25,0,0])
  const world=(s:typeof a):SymmetrySupport=>({kind:'point',ownerId:s.ownerId,pointMm:[1e16+s.point[0],0,0]})
  expect(compareSymmetrySupports(world(a),world(b),{kind:'plane',ownerId:'m',pointMm:[1e16,0,0],normal:[1,0,0]},null,identity,c).status).toBe('precisionLimit')
})

it('accounts for representable input uncertainty and rejects lost nonzero uncertainty',()=>{
  const v=fixture('plane');v[0].pointErrorMm=1e-12;v[2].normalErrorRad=1e-13
  const value=compare(v);expect(value.precision.position).toBeGreaterThan(1e-12/policy.lengthScaleMm);expect(value.precision.normal).toBeGreaterThanOrEqual(4e-13)
  const underflow=fixture('point');underflow.forEach(s=>{s.pointMm=[0,0,0]});underflow[0].pointErrorMm=Number.MIN_VALUE
  expect(compareSymmetrySupports(...underflow,null,identity,{...policy,originMm:[0,0,0],lengthScaleMm:1e100,lengthToleranceMm:1e95}).status).toBe('precisionLimit')
  const a:ConditionedSymmetrySupport={kind:'point',ownerId:'a',point:[Number.MIN_VALUE,0,0]},b:ConditionedSymmetrySupport={kind:'point',ownerId:'b',point:[0,0,0]},m:ConditionedSymmetrySupport&{kind:'plane'}={kind:'plane',ownerId:'m',point:[0,0,0],normal:[1,0,0]}
  expect(compareConditionedSymmetrySupports(a,b,m,null,identity,policy).status).toBe('precisionLimit')
})

it('rejects malformed kinds, orientation, radius, units and nonfinite inputs',()=>{
  const calls=[()=>compareSymmetrySupports(...fixture('point'),'aligned',identity,policy),()=>compareSymmetrySupports(...fixture('line'),null,identity,policy),()=>compareSymmetrySupports(...fixture('point'),null,identity,{...policy,lengthScaleMm:0})]
  for(const call of calls)expect(call).toThrow()
  const v=fixture('plane');v[2].normal=[2,0,0];expect(()=>compareSymmetrySupports(...v,'aligned',identity,policy)).toThrow()
  const p=fixture('point');p[0].pointMm=[Infinity,0,0];expect(()=>compareSymmetrySupports(...p,null,identity,policy)).toThrow()
  const r=fixture('sphere');if(r[0].kind==='sphere')r[0].radiusMm=-1;expect(()=>compareSymmetrySupports(...r,null,identity,policy)).toThrow()
  const mismatched=fixture('point');mismatched[1]=support('line','b',[0,0,0]);expect(()=>compareSymmetrySupports(...mismatched,null,identity,policy)).toThrow()
})

it('admits exact reflected supports with independent target parameter origins in all five families',()=>{
  for(const kind of kinds){
    const a=support(kind,'a',[-5,2,3]),b=support(kind,'b',[5,2,3]),m:SymmetrySupport&{kind:'plane'}={kind:'plane',ownerId:'m',pointMm:[0,0,0],normal:[1,0,0]}
    if(a.kind==='plane'){a.normal=[.6,.8,0];if(b.kind==='plane'){b.normal=[-.6,.8,0];b.pointMm=[9,5,3]}}
    if(a.kind==='line'||a.kind==='cylinder'){a.direction=[.6,.8,0];if(b.kind==='line'||b.kind==='cylinder'){b.direction=[-.6,.8,0];b.pointMm=[3.8,3.6,3]}}
    const value=ok(compareSymmetrySupports(a,b,m,alignment(kind),frame,policy))
    near(value.position,[0,0,0]);near([value.positionErrorMm],[0])
    if(value.normal){near(value.normal,[0,0,0]);near([value.angleRadians!],[0])}
  }
})

it('compares world and explicitly normalized declarations against the same literal five-family oracles',()=>{
  for(const kind of kinds){
    const v=fixture(kind);v.forEach(s=>{s.pointErrorMm=1e-12;if(s.kind==='plane')s.normalErrorRad=1e-13;if(s.kind==='line'||s.kind==='cylinder')s.directionErrorRad=1e-13;if(s.kind==='sphere'||s.kind==='cylinder')s.radiusErrorMm=1e-12})
    const normalize=(s:SymmetrySupport):ConditionedSymmetrySupport=>{
      const base={ownerId:s.ownerId,point:s.pointMm.map((x,i)=>(x-policy.originMm[i])/2) as Vec3,pointError:s.pointErrorMm!/2}
      switch(s.kind){
        case 'point':return {...base,kind:s.kind}
        case 'plane':return {...base,kind:s.kind,normal:s.normal,normalErrorRad:s.normalErrorRad}
        case 'line':return {...base,kind:s.kind,direction:s.direction,directionErrorRad:s.directionErrorRad}
        case 'sphere':return {...base,kind:s.kind,radius:1.5,radiusError:5e-13}
        case 'cylinder':return {...base,kind:s.kind,direction:s.direction,directionErrorRad:s.directionErrorRad,radius:1.5,radiusError:5e-13}
      }
    }
    const a=normalize(v[0]),b=normalize(v[1]),mirrorNormalized=normalize(v[2]);if(mirrorNormalized.kind!=='plane')throw Error('Original mirror plane required')
    const world=compare(v),normalized=ok(compareConditionedSymmetrySupports(a,b,mirrorNormalized,alignment(kind),identity,policy))
    const expected=kind==='plane'?[0,1,0]:kind==='line'||kind==='cylinder'?[.5,0,1.5]:[.5,1,1.5]
    for(const value of [world,normalized]){near(value.position,expected);near(value.reflected.point,[2,6,2]);if(value.normal)near(value.normal,[-7/9,13/9,4/9]);expect(value.precision.position).toBeGreaterThan(0)}
    world.supports.forEach((block,i)=>{for(let col=0;col<6;col++){near(normalized.supports[i].position[col],block.position[col]);if(block.normal)near(normalized.supports[i].normal![col],block.normal[col])}})
  }
})

it('separates radius compatibility bands, radius uncertainty and explicit zero/pi normal branches',()=>{
  for(const kind of ['sphere','cylinder'] as const){
    const v=fixture(kind);if(v[1].kind!=='sphere'&&v[1].kind!=='cylinder')throw Error('Original radius required')
    v[1].radiusMm=3+policy.lengthToleranceMm/2
    near([compare(v).radiusDifferenceMm!],[policy.lengthToleranceMm/2],1e-12)
    v[1].radiusMm=3+2*policy.lengthToleranceMm
    expect(compareSymmetrySupports(...v,alignment(kind),identity,policy).status).toBe('incompatibleRadius')
    v[1].radiusMm=3;v[1].radiusErrorMm=1e-3
    expect(compareSymmetrySupports(...v,alignment(kind),identity,policy).status).toBe('precisionLimit')
  }
  for(const kind of ['line','plane','cylinder'] as const)for(const sign of [1,-1]){
    const v=fixture(kind),direction=[sign*7/9,-sign*4/9,-sign*4/9] as Vec3
    if(v[1].kind==='plane')v[1].normal=direction
    if(v[1].kind==='line'||v[1].kind==='cylinder')v[1].direction=direction
    near([compare(v).angleRadians!],[sign===1?0:Math.PI])
    near([ok(compareSymmetrySupports(...v,'opposed',identity,policy)).angleRadians!],[sign===1?Math.PI:0])
  }
})
