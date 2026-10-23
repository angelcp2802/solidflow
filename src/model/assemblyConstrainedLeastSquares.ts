import { MAX_LEAST_SQUARES_COLUMNS, MAX_LEAST_SQUARES_ROWS, oneSidedJacobiSvd, solveSvdLeastSquares,
  type JacobiSvdOptions, type JacobiSvdResult } from './assemblyLeastSquares'

export interface LeastSquaresInequality {
  id: string
  /** margin + jacobian*x >= 0, with explicitly reported numerical precision. */
  margin: number
  tolerance: number
  jacobian: number[]
}
export interface ConstrainedLeastSquaresOptions {
  maxPivots: number
  stationarityTolerance: number
  damping?: number
  svd?: JacobiSvdOptions
}
export interface ConstrainedLeastSquaresEvidence {
  pivots: number
  workingSet: string[]
  multipliers: { id: string; value: number }[]
  primalResidual: number
  stationarityNorm: number
  complementarityResidual: number
  /** Evidence for the local convex subproblem, never an assembly certificate. */
  certified: boolean
}
export interface ConstrainedLeastSquaresResult {
  status: 'solved' | 'nonConverged' | 'rankUncertain' | 'precisionLimit'
  solution: number[] | null
  evidence: ConstrainedLeastSquaresEvidence
}
type Matrix = number[][]
function finite(value: number): number {
  if (!Number.isFinite(value)) throw new RangeError('Constrained least-squares arithmetic exceeds finite precision.')
  return value
}
function data(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Constrained least-squares needs finite numeric data.')
  return value
}
function vector(value: readonly number[]): number[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) throw new Error('Constrained least-squares vectors must be arrays.')
  return Array.from({ length: value.length }, (_, index) => {
    const field = Object.getOwnPropertyDescriptor(value, String(index))
    if (!field || !('value' in field)) throw new Error('Constrained least-squares vectors must be dense own data.')
    return data(field.value)
  })
}
function plain(value:object,allowed:string[],required=allowed):void {
  if (!value||typeof value!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(value))
    || Reflect.ownKeys(value).some(key=>typeof key!=='string'||!allowed.includes(key)||!Object.getOwnPropertyDescriptor(value,key)?.enumerable
      || !('value' in Object.getOwnPropertyDescriptor(value,key)!)) || required.some(key=>!Object.hasOwn(value,key))) throw new Error('Constrained inputs must be plain own data.')
}
function list<T>(value:readonly T[],copy:(item:T)=>T):T[] {
  if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype)throw new Error('Constrained lists must be arrays.')
  return Array.from({length:value.length},(_,index)=>{
    const field=Object.getOwnPropertyDescriptor(value,String(index))
    if(!field||!('value' in field))throw new Error('Constrained lists must be dense own data.')
    return copy(field.value)
  })
}
function dot(a: readonly number[], b: readonly number[]): number {
  return finite(a.reduce((sum, value, index) => finite(sum + finite(value * b[index])), 0))
}
function combine(basis: Matrix, coefficients: number[], size: number): number[] {
  return Array.from({ length: size }, (_, index) => dot(basis.map(column => column[index]), coefficients))
}
function identity(size: number): Matrix {
  return Array.from({ length: size }, (_, column) => Array.from({ length: size }, (_, row) => row === column ? 1 : 0))
}
function nullspace(factor: JacobiSvdResult): Matrix {
  return factor.v[0].flatMap((_, column) => column < factor.rank! ? [] : [factor.v.map(row => row[column])])
}

/** Bounded primal active-set least squares. The objective remains least squares;
 * working faces alone are affine equalities. No normal equations or pose clamp.
 * Zero is the initial feasible step. Numerical feasibility uses each declared
 * inequality tolerance; publication still requires original nonlinear checks.
 */
export function solveConstrainedLeastSquares(input: readonly (readonly number[])[], right: readonly number[],
  declared: readonly LeastSquaresInequality[], options: ConstrainedLeastSquaresOptions): ConstrainedLeastSquaresResult {
  const evidence: ConstrainedLeastSquaresEvidence = { pivots: 0, workingSet: [], multipliers: [], primalResidual: 0,
    stationarityNorm: Infinity, complementarityResidual: Infinity, certified: false }
  const fail = (status: ConstrainedLeastSquaresResult['status']): ConstrainedLeastSquaresResult => ({ status, solution: null, evidence })
  try {
    if (!Array.isArray(input) || !input.length || input.length > MAX_LEAST_SQUARES_ROWS) throw new Error('Invalid constrained objective row count.')
    const matrix = list(input,row=>vector(row)), rhs = vector(right), size = matrix[0].length
    if (!size || size > MAX_LEAST_SQUARES_COLUMNS || matrix.some(row => row.length !== size) || rhs.length !== matrix.length) throw new Error('Invalid constrained objective dimensions.')
    if (!Array.isArray(declared) || declared.length > MAX_LEAST_SQUARES_ROWS) throw new Error('Invalid inequality count.')
    const ids = new Set<string>()
    const inequalities = list(declared, item => {
      if (!item || typeof item !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(item))) throw new Error('Inequalities must be plain data.')
      if (Reflect.ownKeys(item).length !== 4 || !['id','margin','tolerance','jacobian'].every(key => {
        const field = Object.getOwnPropertyDescriptor(item, key); return !!field && field.enumerable && 'value' in field
      })) throw new Error('Invalid inequality fields.')
      if (typeof item.id !== 'string' || !item.id || ids.has(item.id)) throw new Error('Inequality IDs must be unique.')
      ids.add(item.id)
      const jacobian = vector(item.jacobian), margin = data(item.margin), tolerance = data(item.tolerance)
      if (jacobian.length !== size || tolerance <= 0) throw new Error('Invalid inequality dimensions or precision.')
      return { id: item.id, margin, tolerance, jacobian }
    })
    plain(options,['maxPivots','stationarityTolerance','damping','svd'],['maxPivots','stationarityTolerance'])
    const svd = options.svd ?? {}
    plain(svd,['maxSweeps','orthogonalityTolerance','rankAbsoluteTolerance','rankRelativeTolerance','rankUncertaintyFactor'],[])
    const maxPivots = data(options.maxPivots), tolerance = data(options.stationarityTolerance), damping = data(options.damping ?? 0)
    if (!Number.isInteger(maxPivots) || maxPivots < 0 || maxPivots > 32 || tolerance <= 0 || damping < 0) throw new Error('Invalid constrained least-squares policy.')
    if (inequalities.some(item => item.margin < -item.tolerance)) return fail('nonConverged')
    const initial = inequalities.map((item,index)=>({item,index})).filter(({item})=>Math.abs(item.margin)<=item.tolerance&&Math.hypot(...item.jacobian)>0)
      .sort((a,b)=>a.item.id<b.item.id?-1:1)[0]
    let current = Array(size).fill(0) as number[], working: number[] = initial ? [initial.index] : []
    for (; evidence.pivots < maxPivots;) {
      evidence.pivots++
      evidence.workingSet = working.map(index => inequalities[index].id)
      let particular = Array(size).fill(0) as number[], basis = identity(size)
      if (working.length) {
        const face = working.map(index => inequalities[index].jacobian), faceRhs = working.map(index => -inequalities[index].margin)
        const solved = solveSvdLeastSquares(face, faceRhs, svd)
        if (solved.status !== 'solved') return fail(solved.status === 'rankUncertain' ? 'rankUncertain' : 'nonConverged')
        if (solved.residual!.some((value,index) => Math.abs(value) > inequalities[working[index]].tolerance)) return fail('nonConverged')
        particular = solved.solution!; basis = nullspace(solved.svd)
      }
      let optimum = particular
      if (basis.length) {
        const reduced = matrix.map(row => basis.map(column => dot(row, column))), shifted = rhs.map((value,index) => finite(value - dot(matrix[index], particular)))
        const solved = solveSvdLeastSquares(reduced, shifted, { ...svd, damping })
        if (solved.status !== 'solved') return fail(solved.status === 'rankUncertain' ? 'rankUncertain' : 'nonConverged')
        const correction = combine(basis, solved.solution!, size)
        optimum = particular.map((value,index) => finite(value + correction[index]))
      }
      const direction = optimum.map((value,index) => finite(value - current[index]))
      let fraction = 1, blocking = -1
      for (let index = 0; index < inequalities.length; index++) if (!working.includes(index)) {
        const item = inequalities[index], slope = dot(item.jacobian, direction)
        if (slope >= 0) continue
        const margin = finite(item.margin + dot(item.jacobian, current)), atEnd = finite(margin + slope)
        if (atEnd >= -item.tolerance) continue
        const candidate = Math.max(0, finite(-margin / slope))
        if (candidate < fraction || candidate === fraction && (blocking < 0 || item.id < inequalities[blocking].id)) { fraction = candidate; blocking = index }
      }
      if (blocking >= 0) {
        if(working.length>=MAX_LEAST_SQUARES_COLUMNS)return fail('nonConverged')
        current = current.map((value,index) => finite(value + fraction * direction[index]))
        working.push(blocking); working.sort((a,b) => inequalities[a].id < inequalities[b].id ? -1 : 1)
        continue
      }
      current = optimum
      const residual = matrix.map((row,index) => finite(dot(row,current) - rhs[index])),
        gradient = current.map((value,column) => finite(matrix.reduce((sum,row,index) => finite(sum + finite(row[column] * residual[index])), 0) + damping * value))
      let multipliers: number[] = []
      if (working.length) {
        const transpose = Array.from({ length: size }, (_, column) => working.map(index => inequalities[index].jacobian[column]))
        const dual = solveSvdLeastSquares(transpose, gradient, svd)
        if (dual.status !== 'solved') return fail(dual.status === 'rankUncertain' ? 'rankUncertain' : 'nonConverged')
        multipliers = dual.solution!
        const release = multipliers.reduce((selected,value,index) => value < 0 && (selected < 0 || value < multipliers[selected]) ? index : selected, -1)
        // Weakly active zero multipliers are not frozen for another objective.
        // A genuinely negative multiplier releases its face and restarts.
        if (release >= 0 && Math.abs(multipliers[release])*Math.hypot(...inequalities[working[release]].jacobian) > tolerance) { working.splice(release,1); continue }
        multipliers = multipliers.map(value => Math.max(0,value))
      }
      const margins = inequalities.map(item => finite(item.margin + dot(item.jacobian,current))),
        stationarity = gradient.map((value,column) => finite(value - working.reduce((sum,index,k) => finite(sum + finite(inequalities[index].jacobian[column] * multipliers[k])),0)))
      evidence.workingSet = working.map(index => inequalities[index].id)
      evidence.multipliers = inequalities.map((item,index) => ({ id:item.id,value:working.includes(index) ? multipliers[working.indexOf(index)] : 0 }))
      evidence.primalResidual = Math.max(0,...margins.map(value => -value))
      evidence.stationarityNorm = finite(Math.hypot(...stationarity))
      evidence.complementarityResidual = Math.max(0,...working.map((index,k) => Math.abs(finite(multipliers[k] * margins[index]))))
      if (margins.some((value,index) => value < -inequalities[index].tolerance)
        || evidence.stationarityNorm > tolerance || evidence.complementarityResidual > tolerance) return fail('nonConverged')
      evidence.certified = true
      return {status:'solved',solution:[...current],evidence}
    }
    return fail('nonConverged')
  } catch (error) { return fail(error instanceof RangeError ? 'precisionLimit' : 'nonConverged') }
}

/** Lineality, not cone dimension: all active normals vanish in both directions. */
export function factorInequalityLineality(rows: readonly (readonly number[])[], size: number, svd: JacobiSvdOptions = {}): JacobiSvdResult | null {
  if (!rows.length) return null
  if (!Number.isInteger(size) || size < 1 || rows.some(row => row.length !== size)) throw new Error('Invalid lineality dimensions.')
  return oneSidedJacobiSvd(rows,svd)
}
