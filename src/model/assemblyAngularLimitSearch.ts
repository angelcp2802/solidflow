import { oneSidedJacobiSvd, type JacobiSvdOptions } from './assemblyLeastSquares'
import { solveConstrainedLeastSquares, type LeastSquaresInequality } from './assemblyConstrainedLeastSquares'
import { rebaseRigidGearAngles, type AssemblyGearAngles } from './assemblyGear'
import { rebaseRigidScrewAngles } from './assemblyScrew'
import { rebaseRigidRackPinionAngles } from './assemblyRackPinion'
import { evaluateRigidMates } from './assemblyMateEquations'
import type { RigidPose } from './rigidPose'
import type { RigidMateEvaluation, RigidMateProblem, RigidMateRow } from './assemblySolveTypes'

type Matrix = number[][]
export class AngularLimitRankError extends Error {
  constructor(readonly status:'rankUncertain'|'nonConverged') {super('Angular critical nullspace is not trustworthy.')}
}
const dot = (a:readonly number[],b:readonly number[]) => a.reduce((sum,value,index)=>sum+value*b[index],0)
const identity = (size:number):Matrix => Array.from({length:size},(_,column)=>Array.from({length:size},(_,row)=>row===column?1:0))
export function certifiedAngularNullspace(rows:readonly RigidMateRow[],size:number,svd?:JacobiSvdOptions):Matrix {
  if(!rows.length)return identity(size)
  const factor=oneSidedJacobiSvd(rows.map(row=>row.jacobian),svd)
  if(!factor.evidence.certified||factor.rank===null)throw new AngularLimitRankError(factor.evidence.certified?'rankUncertain':'nonConverged')
  return factor.v[0].flatMap((_,column)=>column<factor.rank!?[]:[factor.v.map(row=>row[column])])
}
export function angularEndpointKernelRows(evaluation:RigidMateEvaluation):RigidMateRow[] {
  return (evaluation.angularLimitCharts??[]).flatMap(chart=>evaluation.checks.find(check=>check.constraintId===chart.constraintId)?.satisfied?chart.equalityRows??[]:[])
}
export function angularRestorationRows(evaluation:RigidMateEvaluation):RigidMateRow[] {
  return [...evaluation.rows,...(evaluation.inequalities??[]).filter(item=>item.margin<0).map(item=>({constraintId:item.constraintId,
    kind:item.kind??'length' as const,residual:item.margin,tolerance:item.tolerance,jacobian:item.jacobian})),
    ...(evaluation.angularLimitCharts??[]).flatMap(chart=>chart.equalityRows??[])]
}
/** Includes nonsmooth physical gaps without inventing a scalar zero Jacobian. */
export function angularRestorationNorm(evaluation:RigidMateEvaluation):number {
  const regular=angularRestorationRows(evaluation).map(row=>row.residual),
    gaps=(evaluation.limitAngles??[]).filter(value=>value.stratum!=='regular'
      &&!evaluation.angularLimitCharts?.find(chart=>chart.constraintId===value.constraintId)?.equalityRows)
      .map(value=>Math.max(0,-value.marginsRadians.minimum,-value.marginsRadians.maximum))
  const norm=Math.hypot(...regular,...gaps)
  if(!Number.isFinite(norm))throw new RangeError('Angular restoration merit exceeds finite precision.')
  return norm
}
/** Evaluate the ORIGINAL saved constraints in the charts actually reached by
 * admitted bilateral restoration. Several small accepted inner steps can pass
 * a half-turn relative to the outer anchor; recomputing against that old anchor
 * would lose winding even though every individual step was admitted.
 */
export function evaluateAngularManifoldCandidate(problem:RigidMateProblem,poses:ReadonlyMap<string,RigidPose>,
  gearAngles:ReadonlyMap<string,AssemblyGearAngles>,screwAngles:ReadonlyMap<string,number>,rackPinionAngles:ReadonlyMap<string,number>):RigidMateEvaluation {
  return evaluateRigidMates(rebaseRigidRackPinionAngles(rebaseRigidScrewAngles(rebaseRigidGearAngles(problem,gearAngles),screwAngles),rackPinionAngles),poses)
}
export interface AngularOpeningPolicy { maxTrials:number;maxStepNorm:number;angleTolerance:number;svd?:JacobiSvdOptions }
export interface AngularOpeningEvidence { trials:number;pivots:number;finiteProbes:number;accepted:boolean;method?:'critical-cone'|'finite-manifold' }

/** Bounded restoration search in admitted hard-nullspace coordinates. Trial
 * callbacks restore the actual bilateral manifold and evaluate the ORIGINAL
 * nonlinear merit. A failed search is not an inconsistency certificate.
 */
export function searchAngularLimitOpening<T>(evaluation:RigidMateEvaluation,size:number,policy:AngularOpeningPolicy,
  trial:(delta:number[],remainingTrials:number)=>{value:T|null;trials:number}):{value:T|null;evidence:AngularOpeningEvidence} {
  const evidence:AngularOpeningEvidence={trials:0,pivots:0,finiteProbes:0,accepted:false},
    charts=(evaluation.angularLimitCharts??[]).filter(chart=>chart.openingRows&&!evaluation.checks.find(check=>check.constraintId===chart.constraintId)?.satisfied)
  if(!charts.length||evaluation.rows.some(row=>Math.abs(row.residual)>row.tolerance)
    ||evaluation.inequalities?.some(row=>row.margin < -row.tolerance))return{value:null,evidence}
  const basis=certifiedAngularNullspace([...evaluation.rows,...angularEndpointKernelRows(evaluation)],size,policy.svd)
  if(!basis.length)return{value:null,evidence}
  const inequalities:LeastSquaresInequality[]=(evaluation.inequalities??[]).map(row=>({id:JSON.stringify([row.constraintId,row.bound]),
    margin:row.margin,tolerance:row.tolerance,jacobian:basis.map(column=>dot(row.jacobian,column))})),
    combine=(coordinates:number[])=>Array.from({length:size},(_,index)=>dot(basis.map(column=>column[index]),coordinates)),
    solve=(matrix:Matrix,rhs:number[])=>{
      const result=solveConstrainedLeastSquares(matrix,rhs,inequalities,{maxPivots:policy.maxTrials-evidence.trials,
        stationarityTolerance:policy.angleTolerance,svd:policy.svd})
      evidence.pivots+=result.evidence.pivots;evidence.trials+=result.evidence.pivots
      return result.status==='solved'?result.solution:null
    },
    probe=(coordinates:number[],method:'critical-cone'|'finite-manifold'):T|null=>{
      let delta=combine(coordinates),norm=Math.hypot(...delta)
      if(!Number.isFinite(norm))throw new RangeError('Angular opening tangent is not finite.')
      if(norm===0)return null
      if(norm>policy.maxStepNorm){delta=delta.map(value=>value*policy.maxStepNorm/norm);norm=policy.maxStepNorm}
      for(let scale=1;evidence.trials<policy.maxTrials;scale*=.5){
        evidence.trials++;evidence.finiteProbes++
        const result=trial(delta.map(entry=>entry*scale),policy.maxTrials-evidence.trials)
        if(!Number.isInteger(result.trials)||result.trials<0||result.trials>policy.maxTrials-evidence.trials)throw new Error('Angular manifold restoration exceeded its shared trial budget.')
        evidence.trials+=result.trials
        if(result.value!==null){evidence.accepted=true;evidence.method=method;return result.value}
        // Give independent admitted directions a chance within the SAME budget.
        if(scale<=.5)break
      }
      return null
    }
  for(const chart of charts){
    const reduced=chart.openingRows!.map(row=>basis.map(column=>dot(row.jacobian,column))),factor=oneSidedJacobiSvd(reduced,policy.svd)
    if(factor.evidence.certified&&factor.rank!==null&&factor.rank>0){
      // A constrained projection of +/-range basis vectors finds mixed cone
      // openings that individually infeasible right singular modes can miss.
      for(let column=0;column<factor.rank&&evidence.trials<policy.maxTrials;column++)for(const sign of [1,-1]){
        const coordinates=solve(reduced,factor.u.map(row=>sign*row[column]))
        if(coordinates){const value=probe(coordinates,'critical-cone');if(value!==null)return{value,evidence}}
        if(evidence.trials>=policy.maxTrials)break
      }
    }
  }
  // KN=0 need not mean no finite opening: curved mechanisms can first open at
  // second order. Pure translation modes cannot change any selected direction.
  const modes=identity(basis.length).filter((_,column)=>Math.hypot(...basis[column].filter((_,index)=>index%6>=3))>0)
  function* candidates(){yield* modes;for(let index=0;index<modes.length;index++)for(const second of modes.slice(index+1))yield modes[index].map((value,i)=>value+second[i])}
  for(const mode of candidates())for(const sign of [1,-1]){
    if(evidence.trials>=policy.maxTrials)return{value:null,evidence}
    const coordinates=solve(identity(basis.length),mode.map(value=>sign*value))
    if(coordinates){const value=probe(coordinates,'finite-manifold');if(value!==null)return{value,evidence}}
  }
  return{value:null,evidence}
}
