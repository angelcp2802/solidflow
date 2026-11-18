import { evaluateRigidMates } from './assemblyMateEquations'
import { retractRigidBodyPose } from './assemblyKinematics'
import { oneSidedJacobiSvd, solveSvdLeastSquares, type JacobiSvdOptions, type JacobiSvdResult } from './assemblyLeastSquares'
import { solveConstrainedLeastSquares, type ConstrainedLeastSquaresEvidence, type LeastSquaresInequality } from './assemblyConstrainedLeastSquares'
import { MAX_RIGID_SOLVER_BODIES, MAX_RIGID_SOLVER_CONSTRAINTS, solveRigidMates,
  type RigidGroupEvidence, type RigidMateSolveResult, type RigidMateSolverOptions } from './assemblySolver'
import { composeRigidPoses, identityRigidPose, rigidRotationMatrix, validateRigidPose, type RigidPose } from './rigidPose'
import type { RigidMateProblem, RigidMateRow } from './assemblySolveTypes'
import { admitRigidGearStep, rebaseRigidGearAngles } from './assemblyGear'
import { admitRigidScrewStep, rebaseRigidScrewAngles } from './assemblyScrew'
import { admitRigidRackPinionStep, rebaseRigidRackPinionAngles } from './assemblyRackPinion'
import { angularEndpointKernelRows, certifiedAngularNullspace } from './assemblyAngularLimitSearch'

export interface RigidMateTarget {
  bodyId: string
  /** Selected component frame relative to this rigid owner. */
  frame: RigidPose
  /** Absolute selected component placement in the solve scope. */
  targetPose: RigidPose
  mode: 'translate' | 'rotate'
}
export interface RigidMateProjectionOptions {
  maxIterations?: number
  maxTrials?: number
  maxStepNorm?: number
  /** Feasible GN step norm: normalized translations/radian rotations, not an optimality error bound. */
  stationarityTolerance?: number
  solver?: RigidMateSolverOptions
}
export interface RigidMateProjectionEvidence {
  iterations: number
  trials: number
  /** Max primary/secondary feasible GN tangent-step norm, not a raw gradient. */
  stationarityNorm: number
  /** Half the squared primary/secondary residual norms. Lengths use lengthScale. */
  primaryCost: number
  secondaryCost: number
  positionResidual: number
  angleResidual: number
  convergence: 'target' | 'stationary' | 'immobile'
  localOnly: true
  inequalityProjection?: { primary: ConstrainedLeastSquaresEvidence; secondary?: ConstrainedLeastSquaresEvidence }
}
export type RigidMateProjectionResult =
  | { status: 'ready'; result: RigidMateSolveResult; requestedPose: RigidPose; resolvedPose: RigidPose; evidence: RigidMateProjectionEvidence }
  | { status: 'rejected'; message: string; result?: RigidMateSolveResult }
type Matrix = number[][]
interface Policy { maxIterations: number; maxTrials: number; maxStepNorm: number; stationarityTolerance: number; solver: RigidMateSolverOptions }
interface Objective { primary: RigidMateRow[]; secondary: RigidMateRow[]; primaryNorm: number; secondaryNorm: number; position: number; angle: number; resolved: RigidPose }

function finite(value: number): number {
  if (!Number.isFinite(value)) throw new RangeError('Projection arithmetic exceeds finite precision.')
  return value
}
/** Capture plain data without invoking accessors, serializers or shared aliases. */
function copyData<T>(value: T, state = { visiting: new Set<object>(), nodes: 0 }, depth = 0): T {
  // Admission limits for this numeric API, not peak memory/time bounds or a new
  // assembly-size claim. Preserve the existing 4096 body/constraint envelopes.
  if (++state.nodes > 1_000_000 || depth > 64) throw new Error('Projection input traversal capacity exceeded.')
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') throw new Error('Projection inputs must be plain data.')
    return value
  }
  if (state.visiting.has(value)) throw new Error('Projection input data cannot be cyclic.')
  const array = Array.isArray(value), arrayLength = array ? (value as unknown[]).length : 0, prototype = Object.getPrototypeOf(value)
  if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) throw new Error('Projection inputs must be plain data.')
  if (arrayLength > Math.max(MAX_RIGID_SOLVER_BODIES, MAX_RIGID_SOLVER_CONSTRAINTS)) throw new Error('Projection input array capacity exceeded.')
  state.visiting.add(value)
  const result: Record<string, unknown> | unknown[] = array ? [] : Object.create(null)
  for (const key of Reflect.ownKeys(value)) {
    if (array && key === 'length') continue
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!
    if (typeof key !== 'string' || !descriptor.enumerable || !('value' in descriptor)
      || array && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= arrayLength)) throw new Error('Projection inputs need enumerable data fields.')
    Object.defineProperty(result, key, { value: copyData(descriptor.value, state, depth + 1), enumerable: true, writable: true, configurable: true })
  }
  if (array && Object.keys(result).length !== arrayLength) throw new Error('Projection arrays must be dense.')
  state.visiting.delete(value)
  return result as T
}
function fields(value: object, allowed: string[], required: string[] = []): void {
  if (Object.keys(value).some(key => !allowed.includes(key)) || required.some(key => !Object.hasOwn(value, key))) throw new Error('Invalid projection fields.')
}
function policy(input: RigidMateProjectionOptions): Policy {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid projection options.')
  fields(input, ['maxIterations', 'maxTrials', 'maxStepNorm', 'stationarityTolerance', 'solver'])
  const value = { maxIterations: input.maxIterations ?? 80, maxTrials: input.maxTrials ?? 16, maxStepNorm: input.maxStepNorm ?? 1,
    stationarityTolerance: input.stationarityTolerance ?? 1e-8, solver: input.solver ?? {} }
  if (!Number.isInteger(value.maxIterations) || value.maxIterations < 0 || value.maxIterations > 200
    || !Number.isInteger(value.maxTrials) || value.maxTrials < 1 || value.maxTrials > 32
    || !Number.isFinite(value.maxStepNorm) || value.maxStepNorm <= 0 || value.maxStepNorm > 2
    || !Number.isFinite(value.stationarityTolerance) || value.stationarityTolerance <= 0 || value.stationarityTolerance > 1e-3) throw new Error('Invalid projection iteration, step or stationarity policy.')
  return value
}
function checkedTarget(input: RigidMateTarget, problem: RigidMateProblem): RigidMateTarget {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid projection target.')
  fields(input, ['bodyId', 'frame', 'targetPose', 'mode'], ['bodyId', 'frame', 'targetPose', 'mode'])
  if (typeof input.bodyId !== 'string' || !problem.bodies.some(body => body.id === input.bodyId)
    || input.mode !== 'translate' && input.mode !== 'rotate') throw new Error('Projection target needs an actual rigid owner and explicit mode.')
  return { bodyId: input.bodyId, frame: validateRigidPose(input.frame), targetPose: validateRigidPose(input.targetPose), mode: input.mode }
}
function dot(a: readonly number[], b: readonly number[]): number { return finite(a.reduce((sum, value, index) => finite(sum + finite(value * b[index])), 0)) }
function norm(values: readonly number[]): number { return finite(Math.hypot(...values)) }
/** Basis is stored as a list of column vectors, including the empty basis. */
function reduced(rows: readonly RigidMateRow[], basis: Matrix): Matrix { return rows.map(row => basis.map(column => dot(row.jacobian, column))) }
function combination(basis: Matrix, values: readonly number[], size: number): number[] {
  return Array.from({ length: size }, (_, row) => dot(basis.map(column => column[row]), values))
}
function nullspace(factor: JacobiSvdResult): Matrix {
  if (!factor.evidence.certified || factor.rank === null) throw new Error('Projection target rank is not trustworthy.')
  return factor.v[0].flatMap((_, column) => column < factor.rank! ? [] : [factor.v.map(row => row[column])])
}
/** In a regular full-attitude chart, ker(Jrotate) is exactly omegaOwner=0.
 * Eliminate those variables BEFORE factoring the bilateral equations. Lifting
 * a secondary nullspace through two dense SVD bases can reintroduce a small
 * owner rotation and hence a real primary-cost increase from an exact minimum.
 * These zeros define optimization coordinates; no solved pose is rounded.
 */
function rotationPreservingNullspace(rows: readonly RigidMateRow[], ids: readonly string[], ownerId: string,
  svd: JacobiSvdOptions | undefined): Matrix {
  const owner = ids.indexOf(ownerId)
  if (owner < 0) throw new Error('Projection secondary owner is absent from its connected group.')
  const size = ids.length * 6, firstAngular = owner * 6 + 3,
    allowed = Array.from({length:size},(_,index)=>index).filter(index=>index<firstAngular||index>=firstAngular+3)
  // A pure angular interval can have no bilateral rows at all. Preserve the
  // physical variable width explicitly instead of factoring an empty matrix.
  if(!rows.length)return allowed.map(index=>Array.from({length:size},(_,coordinate)=>coordinate===index?1:0))
  const factor = oneSidedJacobiSvd(rows.map(row=>allowed.map(index=>row.jacobian[index])),svd)
  return nullspace(factor).map(column=>{
    const expanded = Array(size).fill(0) as number[]
    allowed.forEach((index,position)=>{expanded[index]=column[position]})
    return expanded
  })
}
function groupFor(result: RigidMateSolveResult, id: string): RigidGroupEvidence | undefined { return result.evidence.groups.find(group => group.bodyIds.includes(id)) }
function objective(problem: RigidMateProblem, target: RigidMateTarget, result: RigidMateSolveResult, group?: RigidGroupEvidence): Objective {
  if (!result.poses) throw new Error('Projection has no feasible hard solution.')
  const ids = group?.bodyIds ?? [target.bodyId], bodies = ids.map(id => {
    const original = problem.bodies.find(body => body.id === id)!
    return { ...original, pose: validateRigidPose(result.poses!.get(id)) }
  })
  // Reuse only the analytical attitude chart/Jacobian. Position is expressed
  // explicitly in the world frame below. This transient soft block never enters
  // a hard solve, saved mate or DOF count.
  const evaluated = evaluateRigidMates({ ...problem, passiveGears: undefined, passiveScrews: undefined, passiveRackPinions: undefined, bodies, constraints: [{ id: 'projection-target', type: 'lock',
    first: { bodyId: null, frame: target.targetPose }, second: { bodyId: target.bodyId, frame: target.frame }, relativePose: identityRigidPose() }] })
  if (evaluated.diagnostics.length || evaluated.rows.length !== 6 || evaluated.checks.length !== 1) {
    throw new Error(evaluated.diagnostics.map(item => item.message).join('; ') || 'Projection target chart could not be evaluated.')
  }
  const owner = result.poses.get(target.bodyId)!, matrix = rigidRotationMatrix(owner.rotation),
    local = target.frame.translation.map(value => finite(value / problem.lengthScale)),
    // Preserve local offsets before adding a distant global origin. Composing a
    // world point first could round away its offset before normalization.
    point = owner.translation.map((value, axis) => finite(finite((value - problem.origin[axis]) / problem.lengthScale)
      + dot(matrix.slice(axis * 3, axis * 3 + 3), local))),
    targetPoint = target.targetPose.translation.map((value, axis) => finite((value - problem.origin[axis]) / problem.lengthScale)),
    difference = point.map((value, axis) => finite(value - targetPoint[axis])),
    free = bodies.filter(body => !body.fixed),
    rotations = [[0, -point[2], point[1]], [point[2], 0, -point[0]], [-point[1], point[0], 0]],
    position: RigidMateRow[] = difference.map((value, axis) => ({ constraintId: 'projection-target', kind: 'length',
      residual: value, tolerance: finite(problem.lengthTolerance / problem.lengthScale),
      jacobian: free.flatMap(body => body.id === target.bodyId ? [axis === 0 ? 1 : 0, axis === 1 ? 1 : 0, axis === 2 ? 1 : 0,
        rotations[0][axis], rotations[1][axis], rotations[2][axis]] : [0, 0, 0, 0, 0, 0]) })),
    angle = evaluated.rows.filter(row => row.kind === 'angle'),
    primary = target.mode === 'translate' ? position : angle, secondary = target.mode === 'translate' ? angle : position
  return { primary, secondary, primaryNorm: norm(primary.map(row => row.residual)), secondaryNorm: norm(secondary.map(row => row.residual)),
    position: finite(norm(difference) * problem.lengthScale), angle: finite(evaluated.checks[0].angleResidual),
    resolved: composeRigidPoses(owner, target.frame) }
}
function targetTolerances(problem: RigidMateProblem, target: RigidMateTarget): [number, number] {
  const length = finite(problem.lengthTolerance / problem.lengthScale)
  if (length === 0) throw new RangeError('Projection length resolution underflows.')
  return target.mode === 'translate' ? [length, problem.angleTolerance] : [problem.angleTolerance, length]
}
function negative(rows: readonly RigidMateRow[]): number[] { return rows.map(row => -row.residual) }
function sufficientDecrease(before: readonly RigidMateRow[], after: readonly RigidMateRow[], delta: readonly number[]): boolean {
  // Armijo on the actual hard-restored candidate, with a meaningful 0.1 share
  // of first-order predicted descent. A merely positive decrease can accept
  // near-reflections around a curved minimum and converge sublinearly forever.
  const actualTerms = before.map((row, i) => finite(.5 * finite(finite(row.residual - after[i].residual) * finite(row.residual + after[i].residual)))),
    predictedTerms = before.map(row => finite(-row.residual * dot(row.jacobian, delta))),
    actual = finite(actualTerms.reduce((sum, value) => finite(sum + value), 0)),
    predicted = finite(predictedTerms.reduce((sum, value) => finite(sum + value), 0)),
    allowance = finite(64 * Number.EPSILON * finite(actualTerms.reduce((sum, value) => finite(sum + Math.abs(value)), 0)
      + .1 * predictedTerms.reduce((sum, value) => finite(sum + Math.abs(value)), 0)))
  return predicted > 0 && actual > 0 && actual >= finite(.1 * predicted + allowance)
}
function sameCost(before: readonly RigidMateRow[], after: readonly RigidMateRow[]): boolean {
  const terms = before.map((row, i) => finite(finite(row.residual - after[i].residual) * finite(row.residual + after[i].residual))),
    difference = finite(terms.reduce((sum, value) => finite(sum + value), 0)),
    squaredMagnitude = finite(before.reduce((sum, row, i) => finite(sum + finite(row.residual * row.residual) + finite(after[i].residual * after[i].residual)), 0))
  return Math.abs(difference) <= finite(64 * Number.EPSILON * squaredMagnitude)
}
function rejected(message: string, result?: RigidMateSolveResult): RigidMateProjectionResult {
  // A rejected projection never leaks the feasible candidate as publishable poses.
  return { status: 'rejected', message, ...(result && result.poses === null ? { result } : {}) }
}

/** Local lexicographic projection onto all hard mate equations, without anchors.
 * Translate minimizes position first; rotate minimizes attitude first. The other
 * objective first uses the primary numerical nullspace; stationary points also
 * permit bounded finite primary-cost ties. No finite penalty trades mate accuracy
 * for pointer intent, and no global nearest claim is made.
 */
export function projectRigidMateTarget(input: RigidMateProblem, requested: RigidMateTarget,
  options: RigidMateProjectionOptions = {}): RigidMateProjectionResult {
  try {
    let problem = copyData(input)
    const target = checkedTarget(copyData(requested), problem), selected = policy(copyData(options))
    let hard = solveRigidMates(problem, selected.solver)
    if (!hard.poses) return rejected('The original hard mates did not produce a trustworthy feasible solution.', hard)
    const [primaryTolerance, secondaryTolerance] = targetTolerances(problem, target)
    let iterations = 0, trials = 0, bestPrimary = Infinity, bestPrimaryRows: RigidMateRow[] = []
    let inequalityProjection: RigidMateProjectionEvidence['inequalityProjection']
    for (;;) {
      problem = rebaseRigidRackPinionAngles(rebaseRigidScrewAngles(rebaseRigidGearAngles(problem, hard.gearAngles), hard.screwAngles), hard.rackPinionAngles)
      const group = groupFor(hard, target.bodyId), value = objective(problem, target, hard, group)
      if (value.primaryNorm < bestPrimary) { bestPrimary = value.primaryNorm; bestPrimaryRows = value.primary }
      const variableCount = (group?.bodyIds.length ?? 0) * 6,
        hasLimits = !!group?.constraintIds.some(id=>problem.constraints.some(constraint=>constraint.id===id&&(constraint.type==='hinge'&&!!constraint.stops||constraint.type==='limit-distance'||constraint.type==='limit-angle'||constraint.type==='limit-directed-angle'||constraint.type==='circular-path'&&constraint.position.mode==='free'&&constraint.position.domain==='trim'))),
        evaluated = hasLimits ? evaluateRigidMates({...problem,
          bodies:[...group!.bodyIds.map(id=>problem.bodies.find(body=>body.id===id)!),
            ...problem.bodies.filter(body=>!group!.bodyIds.includes(body.id)).map(body=>({...body,fixed:true}))],
          constraints:problem.constraints.filter(constraint=>group!.constraintIds.includes(constraint.id))},hard.poses!) : undefined
      if (evaluated?.diagnostics.length) return rejected('Feasible interval chart could not be evaluated.')
      const endpointKernels=evaluated?angularEndpointKernelRows(evaluated):[],
        basis = endpointKernels.length?certifiedAngularNullspace([...evaluated!.rows,...endpointKernels],variableCount,selected.solver.svd):group?.nullspace.map(item => [...item.vector]) ?? []
      const complete = (convergence: RigidMateProjectionEvidence['convergence'], stationarityNorm: number): RigidMateProjectionResult => ({ status: 'ready',
        result: hard, requestedPose: validateRigidPose(target.targetPose), resolvedPose: validateRigidPose(value.resolved), evidence: {
          iterations, trials, stationarityNorm, primaryCost: finite(.5 * value.primaryNorm * value.primaryNorm), secondaryCost: finite(.5 * value.secondaryNorm * value.secondaryNorm),
          positionResidual: value.position, angleResidual: value.angle, convergence, localOnly: true,
          ...(inequalityProjection ? {inequalityProjection} : {}) } })
      if (!basis.length) return complete('immobile', 0)
      const first = reduced(value.primary, basis), second = reduced(value.secondary, basis)
      let remainingTrials = selected.maxTrials
      const inequalities: LeastSquaresInequality[] = (evaluated?.inequalities ?? []).filter(item=>group!.constraintIds.includes(item.constraintId)).map(item=>({
        id:JSON.stringify([item.constraintId,item.bound]),margin:item.margin,tolerance:item.tolerance,
        jacobian:basis.map(column=>dot(item.jacobian,column))}))
      const constrained = (matrix:Matrix,rhs:number[],bounds:LeastSquaresInequality[]) => {
        const result=solveConstrainedLeastSquares(matrix,rhs,bounds,{maxPivots:remainingTrials,stationarityTolerance:selected.stationarityTolerance,svd:selected.solver.svd})
        trials+=result.evidence.pivots;remainingTrials-=result.evidence.pivots
        return result
      }
      if (hasLimits && selected.maxIterations===0 && (value.primaryNorm>primaryTolerance||value.secondaryNorm>secondaryTolerance)) return rejected('Projection iteration budget exhausted before constrained optimization.')
      let coordinates:number[],primaryNull:Matrix,secondaryTangent=Array.from({length:variableCount},()=>0)
      if (hasLimits) {
        const primary=constrained(first,negative(value.primary),inequalities)
        if(primary.status!=='solved')return rejected('Projection primary inequality solve failed: '+primary.status+'.')
        coordinates=primary.solution!;inequalityProjection={primary:primary.evidence}
        const factor=oneSidedJacobiSvd(first,selected.solver.svd)
        if(!factor.evidence.certified||factor.rank===null)return rejected('Projection primary image rank is not trustworthy.')
        primaryNull=nullspace(factor)
      } else {
        const primary=solveSvdLeastSquares(first,negative(value.primary),selected.solver.svd)
        if(primary.status!=='solved')return rejected('Projection primary SVD failed: '+primary.status+'.')
        coordinates=primary.solution!;primaryNull=nullspace(primary.svd)
      }
      const restrictedSecond=second.map(row=>primaryNull.map(column=>dot(row,column)))
      const primaryTangent = combination(basis, coordinates, variableCount)
      if (primaryNull.length) {
        if (hasLimits && target.mode==='rotate') {
          const secondaryBasis = rotationPreservingNullspace([...evaluated!.rows,...endpointKernels],group!.bodyIds,target.bodyId,selected.solver.svd)
          if (secondaryBasis.length!==primaryNull.length) return rejected('Projection secondary primary-image dimension is not trustworthy.')
          const rhs = negative(value.secondary).map((residual,index)=>finite(residual-dot(value.secondary[index].jacobian,primaryTangent))),
            secondary = constrained(reduced(value.secondary,secondaryBasis),rhs,(evaluated!.inequalities??[]).map(item=>({
              id:JSON.stringify([item.constraintId,item.bound]),margin:finite(item.margin+dot(item.jacobian,primaryTangent)),tolerance:item.tolerance,
              jacobian:secondaryBasis.map(column=>dot(item.jacobian,column))})))
          if (secondary.status!=='solved') return rejected('Projection secondary inequality solve failed: '+secondary.status+'.')
          inequalityProjection!.secondary=secondary.evidence
          secondaryTangent=combination(secondaryBasis,secondary.solution!,variableCount)
        } else {
          const rhs = negative(value.secondary).map((residual, i) => finite(residual - dot(second[i], coordinates)))
          // Preserve the primary IMAGE, not its working face. Every original
          // inequality remains available for secondary activation and release.
          const secondary = hasLimits ? constrained(restrictedSecond,rhs,inequalities.map(item=>({...item,
            margin:finite(item.margin+dot(item.jacobian,coordinates)),jacobian:primaryNull.map(column=>dot(item.jacobian,column))})))
            : solveSvdLeastSquares(restrictedSecond, rhs, selected.solver.svd)
          if (secondary.status !== 'solved') return rejected('Projection secondary SVD failed: ' + secondary.status + '.')
          if(hasLimits)inequalityProjection!.secondary=(secondary as ReturnType<typeof solveConstrainedLeastSquares>).evidence
          const correction = combination(primaryNull, secondary.solution!, coordinates.length)
          secondaryTangent = combination(basis, correction, variableCount)
          coordinates = coordinates.map((number, i) => finite(number + correction[i]))
        }
      }
      const primaryStepNorm = norm(primaryTangent), stationarity = Math.max(primaryStepNorm, norm(secondaryTangent))
      if (value.primaryNorm <= primaryTolerance && value.secondaryNorm <= secondaryTolerance) return complete('target', stationarity)
      let costTieOnly = false
      if (stationarity <= selected.stationarityTolerance) {
        // A constant-cost curved primary objective can have nonzero point J,
        // e.g. a hinge aimed at its circle center. Its differential nullspace
        // would hide a valid secondary spin. Probe finite hard-feasible steps,
        // accepting only roundoff-level ties to the best primary cost ever seen.
        const unrestricted = hasLimits ? constrained(second,negative(value.secondary),inequalities)
          : solveSvdLeastSquares(second, negative(value.secondary), selected.solver.svd)
        if (unrestricted.status !== 'solved') return rejected('Projection cost-tie SVD failed: ' + unrestricted.status + '.')
        coordinates = unrestricted.solution!
        if (norm(combination(basis, coordinates, variableCount)) <= selected.stationarityTolerance) return complete('stationary', stationarity)
        costTieOnly = true
      }
      if (iterations >= selected.maxIterations) return rejected('Projection iteration budget exhausted before target or stationarity.')
      let step = hasLimits && target.mode==='rotate' && !costTieOnly
        ? primaryTangent.map((number,index)=>finite(number+secondaryTangent[index])) : combination(basis, coordinates, variableCount), magnitude = norm(step)
      if (magnitude === 0) return rejected('Projection step vanished before the reported stationarity threshold.')
      if (magnitude > selected.maxStepNorm) step = step.map(number => finite(number * selected.maxStepNorm / magnitude))
      let accepted = false, lastTrialFailure = 'no lexicographic progress', lastHardFailure: RigidMateSolveResult | undefined
      for (let trial = 0; trial < remainingTrials; trial++) {
        trials++
        try {
          const multiplier = 2 ** -trial, delta = step.map(number => finite(number * multiplier)), poses = new Map(hard.poses!), ids = group!.bodyIds
          const rotationSteps = new Map(ids.map((id, index) => [id, Math.hypot(...delta.slice(index * 6 + 3, index * 6 + 6))]))
          if (!admitRigidGearStep(problem, hard.poses!, rotationSteps) || !admitRigidScrewStep(problem, hard.poses!, rotationSteps) || !admitRigidRackPinionStep(problem, hard.poses!, rotationSteps)) throw new Error('Projection trial exceeds its continuous angular chart.')
          ids.forEach((id, index) => poses.set(id, retractRigidBodyPose(hard.poses!.get(id)!,
            delta.slice(index * 6, index * 6 + 6), problem.origin, problem.lengthScale)))
          const candidate = solveRigidMates({ ...problem, bodies: problem.bodies.map(body => ({ ...body, pose: poses.get(body.id)! })) },
            { ...selected.solver, maxSeedPasses: 0 })
          if (!candidate.poses) {
            if (candidate.status !== 'nonConverged') return rejected('Hard-only projection restoration failed: ' + candidate.status + '.', candidate)
            lastHardFailure = candidate; lastTrialFailure = 'hard-only restoration ' + candidate.status; continue
          }
          const next = objective(problem, target, candidate, groupFor(candidate, target.bodyId)),
            primaryDecrease = !costTieOnly && sufficientDecrease(value.primary, next.primary, delta),
            // A secondary decrease must not bypass insufficient primary descent
            // while that primary objective still has a meaningful feasible step.
            secondaryDecrease = (costTieOnly || primaryStepNorm <= selected.stationarityTolerance || value.primaryNorm <= primaryTolerance)
              && sameCost(bestPrimaryRows, next.primary)
              && sufficientDecrease(value.secondary, next.secondary, delta)
          if (primaryDecrease || secondaryDecrease) { hard = candidate; iterations++; accepted = true; break }
          lastTrialFailure = 'no lexicographic progress'
        } catch (error) {
          // A finite/chart-invalid proposal may become admissible at a smaller
          // step. Its candidate never escapes and the accepted hard state stays.
          lastTrialFailure = error instanceof Error ? error.message : 'invalid projection trial'
        }
      }
      if (!accepted) {
        if (costTieOnly) return complete('stationary', stationarity)
        return rejected('Projection line-search budget exhausted: ' + lastTrialFailure + '.', lastHardFailure)
      }
    }
  } catch (error) { return rejected(error instanceof Error ? error.message : 'Rigid target projection failed.') }
}
