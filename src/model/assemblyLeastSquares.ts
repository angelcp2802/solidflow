/** Pure numerical foundation. It supplies no geometric, mate or DOF authority. */
export const MAX_LEAST_SQUARES_ROWS = 256;
export const MAX_LEAST_SQUARES_COLUMNS = 128;
export const MAX_JACOBI_SWEEPS = 128;
export type LeastSquaresMatrix = readonly (readonly number[])[];

export interface JacobiSvdOptions {
  maxSweeps?: number;
  orthogonalityTolerance?: number;
  rankAbsoluteTolerance?: number;
  rankRelativeTolerance?: number;
  rankUncertaintyFactor?: number;
}
export interface JacobiSvdEvidence {
  converged: boolean;
  /** Passed the reported numerical checks; not an interval-arithmetic proof. */
  certified: boolean;
  sweeps: number;
  maxColumnCorrelation: number;
  relativeReconstructionError: number;
  /** Only the retained nonzero columns of U participate. */
  leftOrthogonalityError: number;
  rightOrthogonalityError: number;
  discardedScaledNorm: number;
  /** Original matrix units; includes reconstruction and roundoff allowance. */
  singularValueErrorBound: number;
}
export interface JacobiSvdResult {
  status: 'converged' | 'iterationLimit' | 'evidenceFailed';
  /** A ≈ U diag(singularValues) V^T. U is rows-by-columns, V is square. */
  u: number[][];
  v: number[][];
  singularValues: number[];
  /** Zero/discarded singular values have a zero U column, not an invented basis. */
  retainedColumns: number[];
  matrixScale: number;
  rankThreshold: number;
  /** Numerical threshold/band rank, not exact algebraic rank or physical DOF. */
  rank: number | null;
  rankRange: [number, number];
  evidence: JacobiSvdEvidence;
}
export interface SvdLeastSquaresOptions extends JacobiSvdOptions {
  /** lambda in min ||A*x-b||^2 + lambda*||x||^2, in original matrix units. */
  damping?: number;
}
export interface SvdLeastSquaresResult {
  status: 'solved' | 'rankUncertain' | 'svdNotConverged';
  solution: number[] | null;
  residual: number[] | null;
  residualNorm: number | null;
  svd: JacobiSvdResult;
}

const EPS = Number.EPSILON;
const DEFAULTS = { maxSweeps: 64, orthogonalityTolerance: 64 * EPS,
  rankAbsoluteTolerance: 1e-12, rankRelativeTolerance: 1e-9, rankUncertaintyFactor: 10 };
type Options = typeof DEFAULTS;

function range(message: string): never { throw new RangeError('Least squares: ' + message); }
function finite(value: number, context: string): number {
  if (!Number.isFinite(value)) range(context + ' exceeds finite arithmetic.');
  return value;
}
function dataNumber(array: readonly number[], index: number, context: string): number {
  const field = Object.getOwnPropertyDescriptor(array, String(index));
  if (!field || !('value' in field) || typeof field.value !== 'number' || !Number.isFinite(field.value)) {
    range(context + ' requires dense finite numeric data without accessors.');
  }
  return field.value as number;
}
function matrixCopy(input: LeastSquaresMatrix): number[][] {
  if (!Array.isArray(input) || input.length < 1 || input.length > MAX_LEAST_SQUARES_ROWS) range('row count must be 1..256.');
  const first = Object.getOwnPropertyDescriptor(input, '0');
  if (!first || !('value' in first) || !Array.isArray(first.value)) range('matrix rows must be arrays.');
  const columns = first.value.length as number;
  if (columns < 1 || columns > MAX_LEAST_SQUARES_COLUMNS) range('column count must be 1..128.');
  return Array.from({ length: input.length }, (_, i) => {
    const field = Object.getOwnPropertyDescriptor(input, String(i));
    if (!field || !('value' in field) || !Array.isArray(field.value) || field.value.length !== columns) range('matrix must be dense and rectangular.');
    return Array.from({ length: columns }, (_, j) => dataNumber(field.value, j, 'matrix'));
  });
}
function optionNumber(input: JacobiSvdOptions, key: keyof Options, fallback: number): number {
  const field = Object.getOwnPropertyDescriptor(input, key);
  if (!field) return fallback;
  if (!('value' in field) || typeof field.value !== 'number' || !Number.isFinite(field.value)) range(key + ' must be finite numeric data.');
  return field.value as number;
}
function optionsCopy(input: JacobiSvdOptions): Options {
  if (!input || typeof input !== 'object' || Array.isArray(input)) range('options must be a record.');
  const result = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS) as (keyof Options)[]) result[key] = optionNumber(input, key, result[key]);
  if (!Number.isInteger(result.maxSweeps) || result.maxSweeps < 0 || result.maxSweeps > MAX_JACOBI_SWEEPS) range('maxSweeps must be an integer in 0..128.');
  if (result.orthogonalityTolerance < 32 * EPS || result.orthogonalityTolerance > 1e-6) range('orthogonalityTolerance must be in 32*epsilon..1e-6.');
  if (result.rankAbsoluteTolerance < 0 || result.rankRelativeTolerance < 0 || result.rankRelativeTolerance > 1
    || result.rankAbsoluteTolerance === 0 && result.rankRelativeTolerance === 0) range('rank tolerances must be nonnegative, with a positive threshold and relative tolerance <=1.');
  if (result.rankUncertaintyFactor < 2 || result.rankUncertaintyFactor > 100) range('rankUncertaintyFactor must be in 2..100.');
  return result;
}
function identity(size: number): number[][] {
  return Array.from({ length: size }, (_, i) => Array.from({ length: size }, (_, j) => i === j ? 1 : 0));
}
function sum(values: readonly number[]): number {
  let total = 0, correction = 0;
  for (const value of values) {
    const next = total + value;
    correction += Math.abs(total) >= Math.abs(value) ? total - next + value : value - next + total;
    total = next;
  }
  return finite(total + correction, 'summation');
}
function columnNorm(matrix: number[][], column: number): number {
  return Math.hypot(...matrix.map(row => row[column]));
}
function correlation(matrix: number[][], p: number, q: number, a: number, b: number): number {
  return Math.max(-1, Math.min(1, sum(matrix.map(row => (row[p] / a) * (row[q] / b)))));
}
function columnEvidence(matrix: number[][], floor: number): { norms: number[]; max: number } {
  const norms = matrix[0].map((_, j) => columnNorm(matrix, j));
  let max = 0;
  for (let p = 0; p < norms.length; p++) for (let q = p + 1; q < norms.length; q++) {
    if (norms[p] > floor && norms[q] > floor) max = Math.max(max, Math.abs(correlation(matrix, p, q, norms[p], norms[q])));
  }
  return { norms, max };
}
function orthogonality(matrix: number[][], columns: readonly number[]): number {
  let error = 0;
  for (let p = 0; p < columns.length; p++) for (let q = p; q < columns.length; q++) {
    const dot = sum(matrix.map(row => row[columns[p]] * row[columns[q]]));
    error = Math.max(error, Math.abs(dot - (p === q ? 1 : 0)));
  }
  return error;
}
/** Combine finite factors without spurious intermediate overflow/underflow. */
function quotient(numerators: readonly number[], denominators: readonly number[]): number {
  if (denominators.some(value => !Number.isFinite(value) || value === 0)) range('invalid denominator.');
  if (numerators.some(value => value === 0)) return 0;
  let mantissa = 1, exponent = 0, sign = 1;
  for (const [values, direction] of [[numerators, 1], [denominators, -1]] as const) for (const value of values) {
    finite(value, 'product input');
    if (value < 0) sign = -sign;
    const absolute = Math.abs(value), power = Math.min(1023, Math.floor(Math.log2(absolute)));
    if (direction === 1) mantissa *= absolute / 2 ** power;
    else mantissa /= absolute / 2 ** power;
    exponent += direction * power;
    while (mantissa >= 2) { mantissa /= 2; exponent++; }
    while (mantissa < 1) { mantissa *= 2; exponent--; }
  }
  if (exponent > 1023 || exponent < -1074) range('product exceeds representable magnitude.');
  const result = finite(sign * mantissa * 2 ** exponent, 'product');
  if (result === 0) range('product underflows.');
  return result;
}
function product(...values: number[]): number { return quotient(values, []); }

/**
 * Scale-aware one-sided cyclic Jacobi, operating directly on columns of A.
 * Pairwise dot products guide rotations; no normal matrix is formed or ranked.
 * Tiny discarded columns contribute to the backward-error/rank uncertainty.
 * The returned V includes all variable directions, even for a wide matrix.
 */
export function oneSidedJacobiSvd(input: LeastSquaresMatrix, requested: JacobiSvdOptions = {}): JacobiSvdResult {
  const original = matrixCopy(input), options = optionsCopy(requested), rows = original.length, columns = original[0].length;
  const matrixScale = Math.max(...original.flat().map(Math.abs)), v = identity(columns);
  const normalized = original.map(row => row.map(value => {
    if (matrixScale === 0) return 0;
    const result = value / matrixScale;
    if (value !== 0 && result === 0) range('matrix scaling loses a nonzero input.');
    return result;
  }));
  const work = normalized.map(row => [...row]), matrixNorm = Math.hypot(...normalized.flat());
  // This floor is numerical resolution, not a caller's physical/rank tolerance.
  const floor = EPS * Math.max(rows, columns) * matrixNorm;
  let state = columnEvidence(work, floor), sweeps = 0;
  while (state.max > options.orthogonalityTolerance && sweeps < options.maxSweeps) {
    for (let p = 0; p < columns; p++) for (let q = p + 1; q < columns; q++) {
      const a = columnNorm(work, p), b = columnNorm(work, q);
      if (a <= floor || b <= floor) continue;
      const dot = correlation(work, p, q, a, b);
      if (Math.abs(dot) <= options.orthogonalityTolerance) continue;
      const scale = Math.max(a, b), ap = a / scale, bp = b / scale;
      const gamma = ap * bp * dot, delta = bp * bp - ap * ap;
      const tangent = delta === 0 ? Math.sign(gamma)
        : 2 * gamma / (delta + Math.sign(delta) * Math.hypot(delta, 2 * gamma));
      const cosine = 1 / Math.hypot(1, tangent), sine = cosine * tangent;
      for (const matrix of [work, v]) for (const row of matrix) {
        const left = row[p], right = row[q];
        row[p] = cosine * left - sine * right; row[q] = sine * left + cosine * right;
      }
    }
    sweeps++; state = columnEvidence(work, floor);
  }
  const order = state.norms.map((norm, index) => ({ norm, index })).sort((a, b) => b.norm - a.norm || a.index - b.index);
  const scaledSingular = order.map(({ norm }) => norm > floor ? norm : 0);
  const singularValues = scaledSingular.map(value => value === 0 ? 0 : product(value, matrixScale));
  const u = work.map(row => order.map(({ norm, index }) => norm > floor ? row[index] / norm : 0));
  const sortedV = v.map(row => order.map(({ index }) => row[index]));
  const retainedColumns = scaledSingular.flatMap((value, index) => value > 0 ? [index] : []);
  const differences = normalized.flatMap((row, i) => row.map((value, j) => value
    - sum(scaledSingular.map((singular, k) => u[i][k] * singular * sortedV[j][k]))));
  const reconstruction = Math.hypot(...differences), relativeReconstructionError = matrixNorm === 0 ? 0 : reconstruction / matrixNorm;
  const discardedScaledNorm = Math.hypot(...order.filter(({ norm }) => norm <= floor).map(({ norm }) => norm));
  const leftOrthogonalityError = orthogonality(u, retainedColumns), rightOrthogonalityError = orthogonality(sortedV, order.map((_, i) => i));
  const rounding = 32 * EPS * Math.max(rows, columns) * matrixNorm;
  // Column norms approximate singular values only when both bases are close to
  // orthogonal. Include their Gram errors, not just a reconstruction residual.
  const basisAllowance = 2 * columns * (leftOrthogonalityError + rightOrthogonalityError) * matrixNorm;
  const singularValueErrorBound = matrixScale === 0 ? 0 : product(matrixScale, reconstruction + rounding + basisAllowance);
  const converged = state.max <= options.orthogonalityTolerance;
  const roundoffLimit = 128 * EPS * Math.max(rows, columns);
  const certified = converged && retainedColumns.length <= Math.min(rows, columns)
    && relativeReconstructionError <= roundoffLimit && rightOrthogonalityError <= roundoffLimit
    && leftOrthogonalityError <= 4 * options.orthogonalityTolerance;
  const rankThreshold = Math.max(options.rankAbsoluteTolerance, product(options.rankRelativeTolerance, singularValues[0]));
  if (rankThreshold === 0 && matrixScale !== 0) range('rank threshold underflows.');
  const comparisonScale = Math.max(rankThreshold, singularValues[0], singularValueErrorBound);
  let lower = 0, upper = 0;
  // Exact zero has known rank zero, including a relative-only zero threshold.
  // Skip comparison entirely so that this case never evaluates 0/0.
  if (matrixScale !== 0) for (const singular of singularValues) {
    const value = singular / comparisonScale, error = singularValueErrorBound / comparisonScale, threshold = rankThreshold / comparisonScale;
    if (value - error > threshold * options.rankUncertaintyFactor) lower++;
    if (value + error >= threshold / options.rankUncertaintyFactor) upper++;
  }
  upper = Math.min(upper, rows, columns);
  const rankRange: [number, number] = certified ? [lower, upper] : [0, Math.min(rows, columns)];
  return { status: !converged ? 'iterationLimit' : certified ? 'converged' : 'evidenceFailed', u, v: sortedV,
    singularValues, retainedColumns, matrixScale, rankThreshold, rank: certified && lower === upper ? lower : null, rankRange,
    evidence: { converged, certified, sweeps, maxColumnCorrelation: state.max, relativeReconstructionError,
      leftOrthogonalityError, rightOrthogonalityError, discardedScaledNorm, singularValueErrorBound } };
}

/**
 * Minimum-norm truncated pseudoinverse, or Tikhonov step with lambda>=0.
 * Damping uses all retained numerical singular values; discarded columns stay
 * zero. Neither result certifies accuracy below the reported factor error.
 * Refuses uncertified/ambiguous rank rather than silently selecting directions.
 * b is the desired right-hand side; an LM caller explicitly supplies -residual.
 */
export function solveSvdLeastSquares(input: LeastSquaresMatrix, rhs: readonly number[], requested: SvdLeastSquaresOptions = {}): SvdLeastSquaresResult {
  const matrix = matrixCopy(input), rows = matrix.length, columns = matrix[0].length;
  optionsCopy(requested);
  if (!Array.isArray(rhs) || rhs.length !== rows) range('right-hand side must match matrix rows.');
  const b = Array.from({ length: rows }, (_, i) => dataNumber(rhs, i, 'right-hand side'));
  const dampingField = Object.getOwnPropertyDescriptor(requested, 'damping');
  if (dampingField && (!('value' in dampingField) || typeof dampingField.value !== 'number' || !Number.isFinite(dampingField.value))) range('damping must be finite numeric data.');
  const damping = (dampingField?.value as number | undefined) ?? 0;
  if (damping < 0) range('damping must be nonnegative.');
  const svd = oneSidedJacobiSvd(matrix, requested);
  const blocked = (status: 'rankUncertain' | 'svdNotConverged'): SvdLeastSquaresResult => ({ status, solution: null, residual: null, residualNorm: null, svd });
  if (!svd.evidence.certified) return blocked('svdNotConverged');
  if (svd.rank === null) return blocked('rankUncertain');
  const bScale = Math.max(...b.map(Math.abs)), rootDamping = Math.sqrt(damping);
  const scaledB = b.map(value => {
    const scaled = bScale === 0 ? 0 : value / bScale;
    if (value !== 0 && scaled === 0) range('right-hand-side scaling loses a nonzero input.');
    return scaled;
  });
  const coefficients = svd.singularValues.map((singular, k) => {
    if (bScale === 0 || singular === 0 || damping === 0 && k >= svd.rank!) return 0;
    const projection = sum(scaledB.map((value, i) => svd.u[i][k] * value));
    if (projection === 0) return 0;
    const denominator = Math.hypot(singular, rootDamping);
    return quotient([bScale, singular, projection], [denominator, denominator]);
  });
  const coefficientScale = Math.max(...coefficients.map(Math.abs));
  const solution = Array.from({ length: columns }, (_, j) => coefficientScale === 0 ? 0
    : product(coefficientScale, sum(coefficients.map((value, k) => svd.v[j][k] * (value / coefficientScale)))));
  const solutionScale = Math.max(...solution.map(Math.abs));
  const residual = matrix.map((row, i) => {
    const projected = svd.matrixScale === 0 || solutionScale === 0 ? 0 : product(svd.matrixScale, solutionScale,
      sum(row.map((value, j) => (value / svd.matrixScale) * (solution[j] / solutionScale))));
    return finite(projected - b[i], 'least-squares residual');
  });
  return { status: 'solved', solution, residual, residualNorm: finite(Math.hypot(...residual), 'residual norm'), svd };
}
