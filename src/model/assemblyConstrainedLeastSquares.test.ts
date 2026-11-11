import { expect, it, vi } from 'vitest'
import { solveConstrainedLeastSquares, factorInequalityLineality, type LeastSquaresInequality } from './assemblyConstrainedLeastSquares'
import * as leastSquares from './assemblyLeastSquares'

// Independent Cartesian convex objectives. Multipliers use cost - mu*g.
// These local certificates do not certify nonlinear assembly feasibility.
const policy={maxPivots:16,stationarityTolerance:1e-10}
function bound(id:string,jacobian:number[],margin=0):LeastSquaresInequality {return{id,jacobian,margin,tolerance:1e-10}}
function near(actual:number[],expected:number[]):void {expect(actual).toHaveLength(expected.length);actual.forEach((value,index)=>expect(Math.abs(value-expected[index])).toBeLessThan(1e-9))}
it.each([
  {q:10,target:20,resolved:20,lower:0,upper:0},
  {q:10,target:0,resolved:10,lower:10,upper:0},
  {q:20,target:40,resolved:30,lower:0,upper:10},
  {q:30,target:20,resolved:20,lower:0,upper:0},
  {q:30,target:40,resolved:30,lower:0,upper:10},
])('has independently known interval solution and KKT signs from q=$q toward $target',({q,target,resolved,lower,upper})=>{
  const result=solveConstrainedLeastSquares([[1]],[target-q],[bound('lower',[1],q-10),bound('upper',[-1],30-q)],policy)
  expect(result.status).toBe('solved');near(result.solution!,[resolved-q]);expect(result.evidence.certified).toBe(true)
  near(result.evidence.multipliers.map(item=>item.value),[lower,upper]);expect(result.evidence.stationarityNorm).toBeLessThanOrEqual(1e-10)
  expect(result.evidence.primalResidual).toBeLessThanOrEqual(1e-10);expect(result.evidence.complementarityResidual).toBeLessThanOrEqual(1e-10)
  if(q===10&&target===20)expect(result.evidence.pivots).toBeGreaterThan(1)
})
it.each([-5,0,5])('keeps equal bounds as opposite inequalities for target %s',(target)=>{
  const result=solveConstrainedLeastSquares([[1]],[target],[bound('a-minimum',[1]),bound('b-maximum',[-1])],policy)
  expect(result.status).toBe('solved');near(result.solution!,[0]);expect(result.evidence.multipliers.every(item=>item.value>=0)).toBe(true)
})
it.each([false,true])('handles duplicate active boundaries with inward/outward intent=%s',(inward)=>{
  const result=solveConstrainedLeastSquares([[1]],[inward?2:-2],[bound('one',[1]),bound('two',[1])],policy)
  expect(result.status).toBe('solved');near(result.solution!,[inward?2:0])
  expect(result.evidence.multipliers.reduce((sum,item)=>sum+item.value,0)).toBeCloseTo(inward?0:2,9)
})
it('projects into a quadrant whose dimension is two although lineality is zero',()=>{
  const rows=[bound('x',[1,0]),bound('y',[0,1])],result=solveConstrainedLeastSquares([[1,0],[0,1]],[2,3],rows,policy)
  expect(result.status).toBe('solved');near(result.solution!,[2,3])
  const factor=factorInequalityLineality(rows.map(item=>item.jacobian),2)!
  expect(factor.rank).toBe(2) // This proves lineality zero, not cone dimension zero.
  expect(rows.every(item=>item.jacobian.reduce((sum,value,index)=>sum+value*[1,1][index],0)>0)).toBe(true)
})
it('retains a weak active bound for secondary optimization without freezing its primary face',()=>{
  const primary=solveConstrainedLeastSquares([[1,0]],[0],[bound('inward',[0,1])],policy)
  expect(primary.status).toBe('solved');near(primary.solution!,[0,0]);expect(primary.evidence.multipliers[0].value).toBe(0)
  // Preserve the primary image x=0, then optimize y with the ORIGINAL bound.
  const secondary=solveConstrainedLeastSquares([[1]],[4],[bound('inward',[1])],policy)
  expect(secondary.status).toBe('solved');near(secondary.solution!,[4])
})
it('uses coupled least-squares geometry instead of a componentwise clamp',()=>{
  // min .5*((x+y-3)^2+(2x-y)^2), x>=2. Unconstrained x=1,y=2;
  // at x=2, d/dy gives y=2.5. A clamp would wrongly retain y=2.
  // Translate variables about the feasible point (2,0).
  const shifted=solveConstrainedLeastSquares([[1,1],[2,-1]],[1,-4],[bound('x',[1,0])],policy)
  expect(shifted.status).toBe('solved');near(shifted.solution!,[0,2.5])
  expect(shifted.evidence.multipliers[0].value).toBeCloseTo(4.5,9)
})
it('honors damping without forming normal equations',()=>{
  const result=solveConstrainedLeastSquares([[2]],[4],[bound('lower',[1])],{...policy,damping:4})
  expect(result.status).toBe('solved');near(result.solution!,[1]);expect(result.evidence.multipliers[0].value).toBe(0)
})
it('preserves an independently small representable interval',()=>{
  const gap=2**-30,result=solveConstrainedLeastSquares([[1]],[1],[bound('minimum',[1]),{...bound('maximum',[-1],gap),tolerance:1e-14}],{...policy,stationarityTolerance:1e-12})
  expect(result.status).toBe('solved');expect(Math.abs(result.solution![0]-gap)).toBeLessThan(1e-14)
})
it.each([-1,1])('keeps positive near-active margins while blocking another face, inward sign=%s',(sign)=>{
  const gap=2**-32,rows=[{...bound('a-x',[1,0],gap),tolerance:1e-9},bound('b-y',[0,1])],
    result=solveConstrainedLeastSquares([[1,0],[0,1]],[sign,-1],rows,policy)
  // Initial x-margin is positive; y blocks at fraction zero before x reaches
  // its working face. Original margins and the independent KKT remain checked.
  expect(result.status).toBe('solved');near(result.solution!,[sign<0?-gap:1,0])
  expect(result.evidence.certified).toBe(true);expect(result.evidence.multipliers.every(item=>item.value>=0)).toBe(true)
})
it.each([0,1])('does not publish a partially optimized step when pivot budget=%s',(maxPivots)=>{
  const result=solveConstrainedLeastSquares([[1]],[3],[bound('lower',[1])],{...policy,maxPivots})
  expect(result.status).toBe('nonConverged');expect(result.solution).toBeNull();expect(result.evidence.certified).toBe(false);expect(result.evidence.pivots).toBeLessThanOrEqual(maxPivots)
})
it('refuses an infeasible initial step rather than inventing a nonlinear conflict certificate',()=>{
  const result=solveConstrainedLeastSquares([[1]],[2],[bound('outside',[1],-1)],policy)
  expect(result.status).toBe('nonConverged');expect(result.solution).toBeNull();expect(result.evidence.pivots).toBe(0)
})
it('keeps zero-gradient rows without inventing a movement direction',()=>{
  const result=solveConstrainedLeastSquares([[0,0]],[3],[bound('zero',[0,0])],policy)
  expect(result.status).toBe('solved');near(result.solution!,[0,0]);expect(result.evidence.stationarityNorm).toBe(0)
})
it('rejects uncertain numerical factors instead of claiming KKT',()=>{
  const real=leastSquares.solveSvdLeastSquares,spy=vi.spyOn(leastSquares,'solveSvdLeastSquares').mockImplementation((matrix,rhs,options)=>{
    const result=real(matrix,rhs,options);return{...result,status:'rankUncertain',solution:null,residual:null,residualNorm:null}
  })
  try {const result=solveConstrainedLeastSquares([[1]],[1],[],policy);expect(result.status).toBe('rankUncertain');expect(result.solution).toBeNull();expect(result.evidence.certified).toBe(false)} finally {spy.mockRestore()}
})
it('does not invoke accessor matrix or inequality data',()=>{
  let invoked=0;const matrix=[[1]];Object.defineProperty(matrix,0,{get(){invoked++;return[1]}})
  const first=solveConstrainedLeastSquares(matrix,[1],[],policy);expect(first.solution).toBeNull()
  const row=bound('own',[1]);Object.defineProperty(row,'margin',{get(){invoked++;return 0}})
  expect(solveConstrainedLeastSquares([[1]],[1],[row],policy).solution).toBeNull();expect(invoked).toBe(0)
})
it('rejects accessor SVD options before copying a numerical policy',()=>{
  let invoked=0;const svd={maxSweeps:64}
  Object.defineProperty(svd,'maxSweeps',{get(){invoked++;return 64}})
  const result=solveConstrainedLeastSquares([[1]],[1],[],{...policy,svd})
  expect(result.status).toBe('nonConverged');expect(result.solution).toBeNull();expect(result.evidence.certified).toBe(false);expect(invoked).toBe(0)
})
it('detaches both input matrices and returned KKT data',()=>{
  const matrix=[[1]],rhs=[2],rows=[bound('lower',[1])],before=JSON.stringify({matrix,rhs,rows}),result=solveConstrainedLeastSquares(matrix,rhs,rows,policy)
  result.solution![0]=99;result.evidence.multipliers[0].value=99;result.evidence.workingSet.push('foreign')
  expect(JSON.stringify({matrix,rhs,rows})).toBe(before)
})
