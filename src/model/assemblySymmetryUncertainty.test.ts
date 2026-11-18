import {expect,it} from 'vitest'
import {evaluateRigidMates,copySymmetryUncertainty} from './assemblyMateEquations'
import {solveRigidMates} from './assemblySolver'
import {projectRigidMateTarget} from './assemblyProjection'
import {identityRigidPose} from './rigidPose'
import type {RigidMateProblem,RigidMateSupport,RigidSymmetryConstraint,RigidSymmetrySupportUncertainty} from './assemblySolveTypes'
const kinds=['point','line','plane','sphere','cylinder'] as const
function fixture(kind:typeof kinds[number]='point',lever=5):RigidMateProblem {
  const support=(target=false):RigidMateSupport=>{
    const base={point:[target?lever:-lever,0,0] as [number,number,number],tolerance:.01}
    if(kind==='point')return{...base,kind}
    if(kind==='sphere')return{...base,kind,radius:3}
    const axis:[number,number,number]=[0,1,0]
    if(kind==='plane')return{...base,kind,normal:axis,xDirection:[0,0,1]}
    if(kind==='line')return{...base,kind,axis}
    return{...base,kind,axis,xDirection:[0,0,1],radius:3}
  }
  const error=(s:RigidMateSupport):RigidSymmetrySupportUncertainty=>({positionErrorMm:0,
    ...(s.kind==='plane'||s.kind==='line'||s.kind==='cylinder'?{directionErrorRad:0}:{}),
    ...(s.kind==='sphere'||s.kind==='cylinder'?{radiusErrorMm:0}:{})})
  const a=support(),b=support(true),m:RigidMateSupport={kind:'plane',point:[0,0,0],normal:[1,0,0],xDirection:[0,0,1],tolerance:.01}
  const c:RigidSymmetryConstraint={id:'original-uncertainty',type:'symmetry',source:{bodyId:'a',frame:identityRigidPose(),support:a},target:{bodyId:'b',frame:identityRigidPose(),support:b},mirror:{bodyId:'m',frame:identityRigidPose(),support:m},alignment:kind==='point'||kind==='sphere'?null:'aligned',uncertainty:[error(a),error(b),error(m)]}
  return {bodies:['a','b','m'].map(id=>({id,pose:identityRigidPose(),fixed:false})),constraints:[c],origin:[0,0,0],lengthScale:10,lengthTolerance:1e-6,angleTolerance:1e-8}
}
const constraint=(p:RigidMateProblem)=>p.constraints[0] as RigidSymmetryConstraint
for(const kind of kinds)it('propagates explicit '+kind+' envelope independently of the comparison band',()=>{
  const p=fixture(kind),c=constraint(p),before=structuredClone(p)
  const e=evaluateRigidMates(p)
  expect(e.diagnostics).toEqual([]);expect(e.checks[0].satisfied).toBe(true)
  expect(e.symmetry![0].lengthTolerance).toBe(1e-6)
  const solved=solveRigidMates(p);expect(['underdefined','fullyDefined']).toContain(solved.status)
  expect(p).toEqual(before)
  c.uncertainty![0].positionErrorMm=2e-6
  expect(evaluateRigidMates(p).diagnostics[0].code).toBe('precisionLimit')
  expect(solveRigidMates(p).poses).toBeNull()
})
it('rejects nominal zero reflection when mirror angular uncertainty is amplified by a 1000mm lever',()=>{
  const p=fixture('point',1000);constraint(p).uncertainty![2].directionErrorRad=1e-8
  // Reflection maps (-1000,0,0) exactly to (1000,0,0), but the
  // first-order mirror contribution alone is 4*1000*1e-8=4e-5mm.
  const e=evaluateRigidMates(p);expect(e.diagnostics[0].code).toBe('precisionLimit')
  expect(solveRigidMates(p).poses).toBeNull()
})
it('recomputes amplification at candidate poses instead of freezing baseline uncertainty',()=>{
  const p=fixture('point',1),c=constraint(p);c.uncertainty![2].directionErrorRad=1e-9
  expect(evaluateRigidMates(p).diagnostics).toEqual([])
  const candidate=new Map(p.bodies.map(b=>[b.id,structuredClone(b.pose)]))
  candidate.get('a')!.translation=[-999,0,0];candidate.get('b')!.translation=[999,0,0]
  expect(evaluateRigidMates(p,candidate).diagnostics[0].code).toBe('precisionLimit')
  expect(evaluateRigidMates(p).diagnostics).toEqual([])
})
it('retains original-chain envelope even when the declared owner placement cancelled to zero',()=>{
  const p=fixture();constraint(p).uncertainty![0].positionErrorMm=1
  expect(p.bodies[0].pose.translation).toEqual([0,0,0])
  expect(evaluateRigidMates(p).diagnostics[0].code).toBe('precisionLimit')
})
it('preserves legacy numerical tolerance compatibility only when uncertainty is absent',()=>{
  const p=fixture();p.bodies[1].pose.translation=[.001,0,0]
  expect(evaluateRigidMates(p).checks[0].satisfied).toBe(false)
  delete constraint(p).uncertainty
  expect(evaluateRigidMates(p).checks[0].satisfied).toBe(true)
  expect(evaluateRigidMates(p).symmetry![0].lengthTolerance).toBe(.03)
})
for(const kind of ['sphere','cylinder'] as const)it('retains '+kind+' radius uncertainty and mismatch separately',()=>{
  const p=fixture(kind),c=constraint(p)
  c.uncertainty![0].radiusErrorMm=2e-6
  expect(evaluateRigidMates(p).diagnostics[0].code).toBe('precisionLimit')
  c.uncertainty![0].radiusErrorMm=0
  ;(c.target.support as {radius:number}).radius=4
  expect(evaluateRigidMates(p).diagnostics).not.toEqual([])
  expect(solveRigidMates(p).poses).toBeNull()
})
it('normalizes physical errors consistently at two scales and a distant common origin',()=>{
  for(const scale of [2,200]){
    const p=fixture(),c=constraint(p);p.lengthScale=scale;p.origin=[1e12,-1e12,1e12]
    p.bodies.forEach(b=>{b.pose.translation=[...p.origin]})
    c.uncertainty![0].positionErrorMm=1e-8
    expect(evaluateRigidMates(p).diagnostics).toEqual([])
    c.uncertainty![0].positionErrorMm=1e-4
    expect(evaluateRigidMates(p).diagnostics[0].code).toBe('precisionLimit')
  }
})
it('retains directional uncertainty in each directional family and mirror at the requested angle band',()=>{
  for(const kind of ['line','plane','cylinder'] as const){
    const p=fixture(kind);constraint(p).uncertainty![0].directionErrorRad=2e-8
    expect(evaluateRigidMates(p).diagnostics[0].code).toBe('precisionLimit')
    expect(solveRigidMates(p).poses).toBeNull()
  }
  const p=fixture('plane');constraint(p).uncertainty![2].directionErrorRad=2e-8
  expect(evaluateRigidMates(p).diagnostics[0].code).toBe('precisionLimit')
})
it('does not silently erase a nonzero physical error during normalization',()=>{
  const p=fixture();p.lengthScale=1e300;p.lengthTolerance=1e300
  constraint(p).uncertainty![0].positionErrorMm=1e-100
  expect(evaluateRigidMates(p).diagnostics[0].code).toBe('precisionLimit')
})
it('projection retains the explicit envelope and cannot publish an uncertain solution',()=>{
  const p=fixture('point',1000);constraint(p).uncertainty![2].directionErrorRad=1e-8
  const projected=projectRigidMateTarget(p,{bodyId:'b',frame:identityRigidPose(),targetPose:identityRigidPose(),mode:'translate'})
  expect(projected.status).toBe('rejected')
  expect(projected).not.toHaveProperty('resolvedPose')
})
it('strictly copies three family-aware data roles without alias or accessor invocation',()=>{
  const c=constraint(fixture()),copy=copySymmetryUncertainty(c)!
  copy[0].positionErrorMm=99;expect(c.uncertainty![0].positionErrorMm).toBe(0)
  const malformed:unknown[]=[[],[{}, {}, {}],[{positionErrorMm:-1},{positionErrorMm:0},{positionErrorMm:0,directionErrorRad:0}],
    [{positionErrorMm:NaN},{positionErrorMm:0},{positionErrorMm:0,directionErrorRad:0}],
    [{positionErrorMm:0,directionErrorRad:0},{positionErrorMm:0},{positionErrorMm:0,directionErrorRad:0}]]
  const sparse=new Array(3);malformed.push(sparse)
  const inherited=[Object.create({positionErrorMm:0}),{positionErrorMm:0},{positionErrorMm:0,directionErrorRad:0}];malformed.push(inherited)
  const nonfiniteDirection=[{positionErrorMm:0},{positionErrorMm:0},{positionErrorMm:0,directionErrorRad:Infinity}];malformed.push(nonfiniteDirection)
  const hidden=[{positionErrorMm:0},{positionErrorMm:0},{positionErrorMm:0,directionErrorRad:0}];Object.defineProperty(hidden,'0',{enumerable:false});malformed.push(hidden)
  for(const input of malformed){const p=fixture();Object.defineProperty(constraint(p),'uncertainty',{value:input,enumerable:true});expect(solveRigidMates(p).status).toBe('invalidInput')}
  let calls=0;const p=fixture();Object.defineProperty(constraint(p),'uncertainty',{get(){calls++;return []},enumerable:true})
  expect(solveRigidMates(p).status).toBe('invalidInput');expect(calls).toBe(0)
})
