import { expect, it } from 'vitest'
import type { Vec3 } from '../cad/kernel.types'
import { retractRigidBodyPose, rotationExp } from './assemblyKinematics'
import { identityRigidPose, transformRigidDirection, transformRigidPoint } from './rigidPose'
import { measureOrderedPlanePlacement, measureConditionedOrderedPlanePlacement, type PlanePlacementSupport,
  type ConditionedPlanePlacementSupport, type PlanePlacementTuple, type OrderedPlanePlacement, type PlanePlacementDerivative } from './assemblyPlanePlacement'

// Original rational planes/ray equations. No native fixture or saved mate authority.
const choices = { directionSign:1,tabSpanSign:1 } as const
const policy = {originMm:[0,0,0] as Vec3,lengthScaleMm:1,lengthToleranceMm:1e-6,angleToleranceRad:1e-8}
function original(ids:(string|null)[]=['a','b','c','d']): PlanePlacementTuple<ConditionedPlanePlacementSupport> {
  return [{ownerId:ids[0],point:[0,2,-1],normal:[1,0,0]},
    {ownerId:ids[1],point:[10,0,0],normal:[3/5,4/5,0]},
    {ownerId:ids[2],point:[2,0,0],normal:[3/5,0,4/5]},
    {ownerId:ids[3],point:[5,0,0],normal:[4/5,3/5,0]}]
}
function ok(value: ReturnType<typeof measureConditionedOrderedPlanePlacement>): OrderedPlanePlacement {expect(value.status).toBe('ok');if(value.status!=='ok')throw Error(value.message);return value}
const evaluate=(p:PlanePlacementTuple<ConditionedPlanePlacementSupport>)=>ok(measureConditionedOrderedPlanePlacement(p,choices,1e-6,1e-8))
const fields=['widthSpan','signedTabSpan','tabExtent','availableSpan','orderedStartDistance','orderedEndDistance'] as const
const values=(v:OrderedPlanePlacement)=>[...v.parameters,...fields.map(k=>v[k])]
const column=(b:PlanePlacementDerivative,c:number)=>[...b.parameters.map(row=>row[c]),...fields.map(k=>b[k][c])]
function near(a:readonly number[],b:readonly number[],tol=1e-11){expect(a).toHaveLength(b.length);a.forEach((v,i)=>{expect(Number.isFinite(v)).toBe(true);expect(Math.abs(v-b[i])).toBeLessThanOrEqual(tol)})}
function move(p:ConditionedPlanePlacementSupport,delta:number[]):ConditionedPlanePlacementSupport {
  const pose=retractRigidBodyPose(identityRigidPose(),delta,[0,0,0],1)
  return {...p,point:transformRigidPoint(pose,p.point),normal:transformRigidDirection(pose,p.normal)}
}
function shifted(p:PlanePlacementTuple<ConditionedPlanePlacementSupport>,test:(i:number)=>boolean,c:number,h:number){const delta=Array(6).fill(0);delta[c]=h;return p.map((v,i)=>test(i)?move(v,delta):structuredClone(v)) as unknown as PlanePlacementTuple<ConditionedPlanePlacementSupport>}

it('intersects four original nonparallel rational planes without parallel projection',()=>{
  const v=evaluate(original());near(v.parameters,[0,22/3,10/3,7/2]);near(fields.map(k=>v[k]),[22/3,1/6,1/6,43/6,10/3,23/6]);
  expect(v.unorientedParallelAngles[1]).toBeGreaterThan(.5);expect(v.ray).toEqual({point:[0,2,-1],direction:[1,0,0]})
})
it('keeps reversed ordered distances distinct from physical envelope clearance',()=>{
  const p:PlanePlacementTuple<ConditionedPlanePlacementSupport>=[-7,11,-2,-5].map((x,i)=>({ownerId:String(i),point:[x,0,0],normal:[1,0,0]})) as unknown as PlanePlacementTuple<ConditionedPlanePlacementSupport>
  const v=ok(measureConditionedOrderedPlanePlacement(p,{directionSign:1,tabSpanSign:-1},1e-6,1e-8))
  near(v.parameters,[0,18,5,2]);near(fields.map(k=>v[k]),[18,-3,3,15,5,16]);expect(v.orderedStartDistance-v.availableSpan/3).toBe(0)
  expect(Math.min(-2,-5)-(-7)).toBe(2);expect(v.orderedStartDistance).toBe(5)
})
it('does not sort, clamp or infer a direction/extent sign from signed spans',()=>{
  const p=original(),a=evaluate(p),b=ok(measureConditionedOrderedPlanePlacement(p,{directionSign:-1,tabSpanSign:1},1e-6,1e-8))
  near(b.parameters,a.parameters.map(x=>-x));expect(b.widthSpan).toBeLessThan(0)
  const swapped=[p[0],p[1],p[3],p[2]] as const,v=ok(measureConditionedOrderedPlanePlacement(swapped,{directionSign:1,tabSpanSign:-1},1e-6,1e-8))
  near([v.tabExtent,v.availableSpan,v.orderedStartDistance],[1/6,43/6,7/2])
  const flat=[p[0],p[0],p[2],p[2]] as const,z=evaluate(flat);near([z.widthSpan,z.signedTabSpan,z.availableSpan],[0,0,0])
})

for(const ids of [['a','b','c','d'],['a','b','a','c'],['a','a','a','a'],[null,'b','c','d'],['a',null,'a','b']] as (string|null)[][])it('has independent and accumulated left derivatives for owners '+JSON.stringify(ids),()=>{
  const p=original(ids),base=evaluate(p)
  for(const h of [1e-5,2e-6])for(let role=0;role<4;role++)for(let c=0;c<6;c++){
    const plus=values(evaluate(shifted(p,i=>i===role,c,h))),minus=values(evaluate(shifted(p,i=>i===role,c,-h)))
    near(plus.map((v,i)=>(v-minus[i])/(2*h)),column(base.supports[role],c),2e-7)
  }
  for(const h of [1e-5,2e-6])for(const b of base.owners)for(let c=0;c<6;c++){
    const plus=values(evaluate(shifted(p,i=>ids[i]===b.ownerId,c,h))),minus=values(evaluate(shifted(p,i=>ids[i]===b.ownerId,c,-h)))
    near(plus.map((v,i)=>(v-minus[i])/(2*h)),column(b,c),2e-7)
  }
  expect(base.owners.map(v=>v.ownerId)).toEqual([...new Set(ids.filter(v=>v!==null))]);near(base.supports[0].parameters[0],[0,0,0,0,0,0])
})
it('differentiates all four explicit sign combinations with moving anchor, repeated and null owners',()=>{
  const pose={translation:[3,-5,2] as Vec3,rotation:rotationExp([.19,-.27,.31])}
  const p=original(['anchor','other','anchor',null]).map(v=>({...v,point:transformRigidPoint(pose,v.point),normal:transformRigidDirection(pose,v.normal)})) as unknown as PlanePlacementTuple<ConditionedPlanePlacementSupport>
  for(const directionSign of [1,-1] as const)for(const tabSpanSign of [1,-1] as const){
    const signs={directionSign,tabSpanSign},run=(q:typeof p)=>ok(measureConditionedOrderedPlanePlacement(q,signs,1e-6,1e-8)),base=run(p)
    for(const h of [1e-5,2e-6]){
      for(let role=0;role<4;role++)for(let c=0;c<6;c++){
        const plus=values(run(shifted(p,i=>i===role,c,h))),minus=values(run(shifted(p,i=>i===role,c,-h)))
        near(plus.map((v,i)=>(v-minus[i])/(2*h)),column(base.supports[role],c),2e-7)
      }
      for(const owner of base.owners)for(let c=0;c<6;c++){
        const plus=values(run(shifted(p,i=>p[i].ownerId===owner.ownerId,c,h))),minus=values(run(shifted(p,i=>p[i].ownerId===owner.ownerId,c,-h)))
        near(plus.map((v,i)=>(v-minus[i])/(2*h)),column(owner,c),2e-7)
      }
    }
    expect(base.owners.map(v=>v.ownerId)).toEqual(['anchor','other'])
  }
})
it('preserves six common rigid gauge directions away from a target and under finite motion',()=>{
  const p=original(),v=evaluate(p)
  expect(Math.abs(v.orderedStartDistance-.2*v.availableSpan)).toBeGreaterThan(1)
  for(let c=0;c<6;c++)near(v.owners.reduce((a,b)=>a.map((x,i)=>x+column(b,c)[i]),Array(10).fill(0)),Array(10).fill(0),2e-13)
  const pose={translation:[7,-9,5] as Vec3,rotation:rotationExp([.23,-.31,.17])}
  const moved=p.map(x=>({...x,point:transformRigidPoint(pose,x.point),normal:transformRigidDirection(pose,x.normal)})) as unknown as typeof p
  near(values(evaluate(moved)),values(v),3e-14)
})
it('keeps plane parameterization invariance except for the declared nonparallel ray anchor',()=>{
  const p=original(),changed=structuredClone(p);changed[1].point=[14,-3,0]
  near(values(evaluate(changed)),values(evaluate(p)))
  const anchor=structuredClone(p);anchor[0].point=[0,3,-1];near(evaluate(anchor).parameters,[0,6,10/3,11/4])
})
it('does not change a nonanchor plane intersection when its normal equation reverses',()=>{
  const p=original(),reversed=structuredClone(p);reversed[1].normal=reversed[1].normal.map(x=>-x) as Vec3
  const a=evaluate(p),b=evaluate(reversed);near(values(a),values(b))
  for(let role=0;role<4;role++)for(let c=0;c<6;c++)near(column(a.supports[role],c),column(b.supports[role],c))
})
for(const scale of [2,7])it('uses fixed normalized world conditioning at scale '+scale+' with oblique local rotations',()=>{
  const pose={translation:[8,-3,9] as Vec3,rotation:rotationExp([.31,.11,-.27])},c={...policy,originMm:[1,-2,3] as Vec3,lengthScaleMm:scale}
  const world=original().map(p=>({ownerId:p.ownerId,pointMm:transformRigidPoint(pose,p.point),normal:transformRigidDirection(pose,p.normal)})) as unknown as PlanePlacementTuple<PlanePlacementSupport>
  const v=ok(measureOrderedPlanePlacement(world,choices,c));near(v.parameters,[0,22/3/scale,10/3/scale,7/2/scale]);expect(v.lengthScaleMm).toBe(scale)
  for(const h of [1e-5,2e-6])for(let role=0;role<4;role++)for(let col=0;col<6;col++){
    const moved=(amount:number)=>{const d=Array(6).fill(0);d[col]=amount;const r=retractRigidBodyPose(identityRigidPose(),d,c.originMm,scale);return world.map((p,i)=>i===role?{...p,pointMm:transformRigidPoint(r,p.pointMm),normal:transformRigidDirection(r,p.normal)}:p) as unknown as typeof world}
    const plus=values(ok(measureOrderedPlanePlacement(moved(h),choices,c))),minus=values(ok(measureOrderedPlanePlacement(moved(-h),choices,c)))
    near(plus.map((x,i)=>(x-minus[i])/(2*h)),column(v.supports[role],col),2e-7)
  }
})
it('distinguishes exact nontransversality from unresolved quotient amplification',()=>{
  const p=structuredClone(original());p[2].normal=[0,1,0]
  expect(measureConditionedOrderedPlanePlacement(p,choices,1e-6,1e-8).status).toBe('nonTransverse')
  p[2].normal=[1e-9,Math.sqrt(1-1e-18),0];p[2].normalErrorRad=1e-8
  expect(measureConditionedOrderedPlanePlacement(p,choices,1e-6,1e-6).status).toBe('precisionLimit')
})
it('admits bounded declared uncertainty without widening either requested band',()=>{
  const p=structuredClone(original());p[2].pointError=1e-8
  const v=evaluate(p);expect(v.precision.availableSpan).toBeGreaterThan(1e-8);expect(v.precision.availableSpan).toBeLessThan(1e-6)
  p[2].pointError=1e-4;expect(measureConditionedOrderedPlanePlacement(p,choices,1e-6,1e-8).status).toBe('precisionLimit')
  p[2].pointError=0;p[2].normalErrorRad=1e-6;expect(measureConditionedOrderedPlanePlacement(p,choices,1e-6,1e-8).status).toBe('precisionLimit')
})
it('rejects world normalization loss and original cancellation before it can masquerade as precision',()=>{
  const world=original().map(p=>({ownerId:p.ownerId,pointMm:p.point,normal:p.normal})) as unknown as PlanePlacementTuple<PlanePlacementSupport>
  for(const [scale,tol] of [[1e300,1e-300],[1e-300,1e300]])expect(measureOrderedPlanePlacement(world,choices,{...policy,lengthScaleMm:scale,lengthToleranceMm:tol}).status).toBe('precisionLimit')
  const declared=structuredClone(world);declared[0].pointErrorMm=1e-300
  expect(measureOrderedPlanePlacement(declared,choices,{...policy,lengthScaleMm:1e100,lengthToleranceMm:1e100}).status).toBe('precisionLimit')
  const far=world.map(p=>({...p,pointMm:p.pointMm.map(x=>x+1e16) as Vec3})) as unknown as typeof world
  expect(measureOrderedPlanePlacement(far,choices,{...policy,originMm:[1e16,1e16,1e16]}).status).toBe('precisionLimit')
  const tiny=structuredClone(original());tiny[0].point[0]=Number.MIN_VALUE;expect(measureConditionedOrderedPlanePlacement(tiny,choices,1e-6,1e-8).status).toBe('precisionLimit')
  const huge=original().map(p=>({...p,point:[1e308,0,0] as Vec3})) as unknown as typeof tiny
  expect(measureConditionedOrderedPlanePlacement(huge,choices,1e308,1).status).toBe('precisionLimit')
})
it('rejects malformed data without executing getters or inventing signs/roles',()=>{
  let hits=0;const p=structuredClone(original());Object.defineProperty(p[1],'point',{enumerable:true,get(){hits++;return [0,0,0]}})
  expect(()=>evaluate(p)).toThrow();expect(hits).toBe(0)
  const hole=Array(4);expect(()=>measureConditionedOrderedPlanePlacement(hole as unknown as typeof p,choices,1e-6,1e-8)).toThrow()
  expect(()=>measureConditionedOrderedPlanePlacement(original(),{directionSign:0,tabSpanSign:1} as never,1e-6,1e-8)).toThrow()
  const nonunit=structuredClone(original());nonunit[1].normal=[2,0,0];expect(()=>evaluate(nonunit)).toThrow()
  expect(()=>measureConditionedOrderedPlanePlacement(original(),choices,1e-6,Math.PI)).toThrow()
  const world=original().map(p=>({ownerId:p.ownerId,pointMm:p.point,normal:p.normal})) as unknown as PlanePlacementTuple<PlanePlacementSupport>
  expect(()=>measureOrderedPlanePlacement(world,choices,{...policy,lengthScaleMm:1e300,lengthToleranceMm:1e-300,angleToleranceRad:Math.PI})).toThrow()
})
