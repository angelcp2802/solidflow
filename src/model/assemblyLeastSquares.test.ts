import { expect, it } from 'vitest';
import { MAX_JACOBI_SWEEPS, MAX_LEAST_SQUARES_COLUMNS, MAX_LEAST_SQUARES_ROWS,
  oneSidedJacobiSvd, solveSvdLeastSquares, type JacobiSvdOptions, type JacobiSvdResult,
  type LeastSquaresMatrix } from './assemblyLeastSquares';

// Original rational/Cartesian matrices. No CAD data, native runtime, numerical
// dependency or production helper supplies an expected singular value/solution.
function close(actual: readonly number[], expected: readonly number[], tolerance = 1e-11): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, i) => {
    expect(Number.isFinite(value)).toBe(true);
    expect(Math.abs(value - expected[i])).toBeLessThanOrEqual(tolerance);
  });
}
function apply(a: LeastSquaresMatrix, x: readonly number[]): number[] {
  return a.map(row => row.reduce((total, value, j) => total + value * x[j], 0));
}
function evidence(a: LeastSquaresMatrix, svd: JacobiSvdResult): void {
  expect(svd.status).toBe('converged'); expect(svd.evidence.converged).toBe(true); expect(svd.evidence.certified).toBe(true);
  const rows = a.length, columns = a[0].length;
  expect(svd.u).toHaveLength(rows); expect(svd.v).toHaveLength(columns); expect(svd.singularValues).toHaveLength(columns);
  svd.u.forEach(row => expect(row).toHaveLength(columns)); svd.v.forEach(row => expect(row).toHaveLength(columns));
  const scale = Math.max(1, ...a.flat().map(Math.abs));
  for (let i = 0; i < rows; i++) for (let j = 0; j < columns; j++) {
    const reconstructed = svd.singularValues.reduce((total, singular, k) => total + svd.u[i][k] * (singular / scale) * svd.v[j][k], 0);
    expect(Math.abs(reconstructed - a[i][j] / scale)).toBeLessThan(1e-11);
  }
  for (let p = 0; p < columns; p++) for (let q = 0; q < columns; q++) {
    const dot = svd.v.reduce((total, row) => total + row[p] * row[q], 0);
    expect(Math.abs(dot - (p === q ? 1 : 0))).toBeLessThan(1e-11);
  }
  for (const p of svd.retainedColumns) for (const q of svd.retainedColumns) {
    const dot = svd.u.reduce((total, row) => total + row[p] * row[q], 0);
    expect(Math.abs(dot - (p === q ? 1 : 0))).toBeLessThan(1e-11);
  }
  expect(svd.evidence.relativeReconstructionError).toBeLessThan(1e-11);
  expect(svd.evidence.leftOrthogonalityError).toBeLessThan(1e-11);
  expect(svd.evidence.rightOrthogonalityError).toBeLessThan(1e-11);
}

it('factors a tall Cartesian 3-4-5 column and an orthogonal column', () => {
  const a = [[3, 0], [4, 0], [0, 2]], svd = oneSidedJacobiSvd(a);
  close(svd.singularValues, [5, 2]); expect(svd.rank).toBe(2); expect(svd.rankRange).toEqual([2, 2]); evidence(a, svd);
});
it('rotates coupled rational columns with independent singular values seven and one', () => {
  const a = [[3, 4], [4, 3]], svd = oneSidedJacobiSvd(a);
  // The symmetric maps of (1,1) and (1,-1) have magnitudes 7 and 1.
  close(svd.singularValues, [7, 1]); expect(svd.evidence.sweeps).toBeGreaterThan(0); evidence(a, svd);
});
it('converges a fully coupled rational three-column factorization with prescribed spectrum', () => {
  // H diag(9,3,1) H^T, H=I-2*v*v^T/9 and v=(1,2,2).
  // H is an independently known orthogonal Householder reflection.
  const a = [[505 / 81, -232 / 81, -160 / 81], [-232 / 81, 211 / 81, 112 / 81], [-160 / 81, 112 / 81, 337 / 81]];
  const svd = oneSidedJacobiSvd(a); close(svd.singularValues, [9, 3, 1]); expect(svd.rank).toBe(3); evidence(a, svd);
});
it('converges repeated singular values in fully coupled rational columns', () => {
  // The same H gives H diag(9,3,3) H^T = 3*I+6*h1*h1^T.
  const a = [[179 / 27, -56 / 27, -56 / 27], [-56 / 27, 113 / 27, 32 / 27], [-56 / 27, 32 / 27, 113 / 27]];
  const svd = oneSidedJacobiSvd(a); close(svd.singularValues, [9, 3, 3]); expect(svd.rank).toBe(3); evidence(a, svd);
});
it('retains repeated singular values without requiring a preferred singular-vector basis', () => {
  const a = [[1, 1], [1, -1], [0, 0]], svd = oneSidedJacobiSvd(a);
  close(svd.singularValues, [Math.SQRT2, Math.SQRT2]); expect(svd.rank).toBe(2); evidence(a, svd);
});
it('finds rank one in exactly dependent columns without ranking a normal matrix', () => {
  const a = [[1, 2], [2, 4], [3, 6]], svd = oneSidedJacobiSvd(a);
  close(svd.singularValues, [Math.sqrt(70), 0]); expect(svd.rank).toBe(1); evidence(a, svd);
  const nullVector = svd.v.map(row => row[1]); close(apply(a, nullVector), [0, 0, 0]);
});
it('keeps the complete right variable space for a wide matrix', () => {
  const a = [[1, 2, 0], [0, 0, 3]], svd = oneSidedJacobiSvd(a);
  close(svd.singularValues, [3, Math.sqrt(5), 0]); expect(svd.rank).toBe(2); evidence(a, svd);
  close(apply(a, svd.v.map(row => row[2])), [0, 0]);
  expect(svd.u.map(row => row[2])).toEqual([0, 0]);
});
it.each([{ a: [[0]] }, { a: [[0, 0, 0], [0, 0, 0]] }, { a: [[0], [0], [0]] }])('handles a positive-dimensional zero matrix %#', ({ a }) => {
  const svd = oneSidedJacobiSvd(a);
  expect(svd.rank).toBe(0); expect(svd.rankRange).toEqual([0, 0]); expect(svd.retainedColumns).toEqual([]);
  expect(svd.singularValues).toEqual(a[0].map(() => 0)); expect(svd.evidence.sweeps).toBe(0);
  expect(svd.evidence.singularValueErrorBound).toBe(0); evidence(a, svd);
});
it('knows exact zero rank under a relative-only policy without a positive absolute threshold', () => {
  const a = [[0, 0, 0], [0, 0, 0]], svd = oneSidedJacobiSvd(a, { rankAbsoluteTolerance: 0, rankRelativeTolerance: 1e-9 });
  expect(svd.rankThreshold).toBe(0); expect(svd.rank).toBe(0); expect(svd.rankRange).toEqual([0, 0]);
  expect(svd.evidence.singularValueErrorBound).toBe(0); evidence(a, svd);
});
it.each([0, 2])('solves exact zero under a relative-only policy with damping %s', damping => {
  const result = solveSvdLeastSquares([[0, 0, 0], [0, 0, 0]], [3, 4], { rankAbsoluteTolerance: 0, rankRelativeTolerance: 1e-9, damping });
  expect(result.status).toBe('solved'); expect(result.svd.rankThreshold).toBe(0); expect(result.svd.rank).toBe(0);
  expect(result.svd.rankRange).toEqual([0, 0]); expect(result.solution).toEqual([0, 0, 0]);
  expect(result.residual).toEqual([-3, -4]); expect(result.residualNorm).toBe(5);
});
it('preserves frozen input matrices and options and returns detached factors', () => {
  const a = Object.freeze([Object.freeze([3, 4]), Object.freeze([4, 3])]);
  const options = Object.freeze({ maxSweeps: 20 }), before = JSON.stringify({ a, options });
  const svd = oneSidedJacobiSvd(a, options); svd.u[0][0] = 42; svd.v[0][0] = 43; svd.singularValues[0] = 44;
  expect(JSON.stringify({ a, options })).toBe(before); close(oneSidedJacobiSvd(a).singularValues, [7, 1]);
});
it('preserves singular values under independent row/column permutations and signs', () => {
  const a = [[0, -3, -4], [-2, 0, 0]], svd = oneSidedJacobiSvd(a);
  // Original rows [3,4,0], [0,0,2], reversed and signed; columns cycle.
  close(svd.singularValues, [5, 2, 0]); expect(svd.rank).toBe(2); evidence(a, svd);
});
it('handles dependent columns with substantially different scales', () => {
  const a = [[1e12, 1], [2e12, 2], [3e12, 3]], svd = oneSidedJacobiSvd(a);
  expect(Math.abs(svd.singularValues[0] / 1e12 - Math.sqrt(14))).toBeLessThan(1e-11);
  expect(svd.singularValues[1]).toBe(0); expect(svd.rank).toBe(1); evidence(a, svd);
});
it.each([1e-300, 1e-150, 1e150])('scales a coupled factorization without squaring scale %s', scale => {
  const a = [[3 * scale, 4 * scale], [4 * scale, 3 * scale]], svd = oneSidedJacobiSvd(a, { rankAbsoluteTolerance: 0 });
  close(svd.singularValues.map(value => value / scale), [7, 1]); expect(svd.rank).toBe(2); evidence(a, svd);
});
it('bounds roundoff rank uncertainty separately from a definite rank threshold', () => {
  const svd = oneSidedJacobiSvd([[1, 0], [0, 1e-9]]);
  expect(svd.evidence.certified).toBe(true); expect(svd.rank).toBeNull(); expect(svd.rankRange).toEqual([1, 2]);
  expect(svd.rankThreshold).toBe(1e-9); expect(svd.evidence.singularValueErrorBound).toBeGreaterThan(0);
});
it('includes imperfect column orthogonality in singular-value error evidence', () => {
  const svd = oneSidedJacobiSvd([[1, 5e-7], [0, 1]], { orthogonalityTolerance: 1e-6 });
  expect(svd.evidence.certified).toBe(true); expect(svd.evidence.sweeps).toBe(0);
  expect(svd.evidence.leftOrthogonalityError).toBeGreaterThan(4e-7);
  expect(svd.evidence.singularValueErrorBound).toBeGreaterThan(1e-6);
});
it.each([{ small: 1e-11, rank: 1 }, { small: 1e-7, rank: 2 }])('classifies a singular value clearly outside the uncertainty band: $small', ({ small, rank }) => {
  const svd = oneSidedJacobiSvd([[1, 0], [0, small]]);
  expect(svd.rank).toBe(rank); expect(svd.rankRange).toEqual([rank, rank]);
});
it('supports an explicit absolute threshold without relative weighting', () => {
  const svd = oneSidedJacobiSvd([[1e-7, 0], [0, 2e-12]], { rankRelativeTolerance: 0 });
  expect(svd.rankThreshold).toBe(1e-12); expect(svd.rank).toBeNull(); expect(svd.rankRange).toEqual([1, 2]);
});
it('does not certify exact numerical null directions below its backward-error allowance', () => {
  const svd = oneSidedJacobiSvd([[1, 2], [2, 4]], { rankAbsoluteTolerance: 0, rankRelativeTolerance: Number.EPSILON });
  expect(svd.evidence.certified).toBe(true); expect(svd.rank).toBeNull(); expect(svd.rankRange).toEqual([1, 2]);
});
it('returns an explicit exhaustion diagnostic before a coupled rotation is allowed', () => {
  const svd = oneSidedJacobiSvd([[3, 4], [4, 3]], { maxSweeps: 0 });
  expect(svd.status).toBe('iterationLimit'); expect(svd.evidence.converged).toBe(false); expect(svd.evidence.certified).toBe(false);
  expect(svd.evidence.sweeps).toBe(0); expect(svd.evidence.maxColumnCorrelation).toBeGreaterThan(.9);
  expect(svd.rank).toBeNull(); expect(svd.rankRange).toEqual([0, 2]);
});
it('reports one-sweep exhaustion when later pair rotations disturb earlier columns', () => {
  const svd = oneSidedJacobiSvd([[1, 1, 1], [0, 1, 2], [1, 2, 4]], { maxSweeps: 1 });
  expect(svd.status).toBe('iterationLimit'); expect(svd.evidence.sweeps).toBe(1); expect(svd.rank).toBeNull();
});
it('requires no sweeps for already orthogonal diagonal columns', () => {
  const a = [[2, 0], [0, 1]], svd = oneSidedJacobiSvd(a, { maxSweeps: 0 });
  expect(svd.evidence.sweeps).toBe(0); expect(svd.rank).toBe(2); evidence(a, svd);
});
it('solves an overdetermined system with an independently rational least-squares solution', () => {
  const a = [[1, 0], [0, 1], [1, 1]], b = [1, 2, 4], result = solveSvdLeastSquares(a, b);
  expect(result.status).toBe('solved'); close(result.solution!, [4 / 3, 7 / 3]); close(result.residual!, [1 / 3, 1 / 3, -1 / 3]);
  expect(Math.abs(result.residualNorm! - 1 / Math.sqrt(3))).toBeLessThan(1e-11);
  close([result.residual![0] + result.residual![2], result.residual![1] + result.residual![2]], [0, 0]);
});
it('returns the minimum-norm solution of a wide system, orthogonal to its known null vector', () => {
  const result = solveSvdLeastSquares([[1, 2, 0], [0, 0, 3]], [5, 6]);
  expect(result.status).toBe('solved'); close(result.solution!, [1, 2, 2]); close(result.residual!, [0, 0]);
  expect(Math.abs(-2 * result.solution![0] + result.solution![1])).toBeLessThan(1e-11);
});
it('solves dependent equations by minimum norm without replacing the missing direction', () => {
  const result = solveSvdLeastSquares([[1, 2], [2, 4], [3, 6]], [1, 2, 3]);
  expect(result.status).toBe('solved'); close(result.solution!, [.2, .4]); close(result.residual!, [0, 0, 0]);
});
it('computes original-unit Tikhonov damping with a rational independent solution', () => {
  const result = solveSvdLeastSquares([[1, 0], [0, 1], [1, 1]], [1, 2, 4], { damping: 1 });
  expect(result.status).toBe('solved'); close(result.solution!, [9 / 8, 13 / 8]);
  // (A^T A + I) x = [5,6], independently [[3,1],[1,3]] x.
  close([3 * result.solution![0] + result.solution![1], result.solution![0] + 3 * result.solution![1]], [5, 6]);
});
it('damps a rank-deficient matrix without inventing a nullspace component', () => {
  const result = solveSvdLeastSquares([[1, 2], [2, 4]], [1, 2], { damping: 5 });
  expect(result.status).toBe('solved'); close(result.solution!, [1 / 6, 1 / 3]);
});
it('solves a zero matrix with a nonzero right-hand side and reports its actual residual', () => {
  const result = solveSvdLeastSquares([[0, 0, 0], [0, 0, 0]], [3, 4]);
  expect(result.status).toBe('solved'); expect(result.solution).toEqual([0, 0, 0]); close(result.residual!, [-3, -4]); expect(result.residualNorm).toBe(5);
});
it('returns an exactly zero step for zero right-hand side without zero divisions', () => {
  const result = solveSvdLeastSquares([[3, 4], [4, 3]], [0, 0]);
  expect(result.status).toBe('solved'); expect(result.solution).toEqual([0, 0]); expect(result.residual).toEqual([0, 0]);
});
it.each([1e-300, 1e-150, 1e150])('solves equal matrix/RHS scale %s without intermediate squared overflow', scale => {
  const result = solveSvdLeastSquares([[3 * scale, 4 * scale], [4 * scale, 3 * scale]], [11 * scale, 10 * scale], { rankAbsoluteTolerance: 0 });
  expect(result.status).toBe('solved'); close(result.solution!, [1, 2]);
});
it('handles the largest finite scalar with a finite exact solution', () => {
  const result = solveSvdLeastSquares([[Number.MAX_VALUE]], [Number.MAX_VALUE]);
  expect(result.status).toBe('solved'); close(result.solution!, [1]); expect(result.residual).toEqual([0]);
});
it('computes very large damping without forming lambda or sigma squared intermediates', () => {
  const result = solveSvdLeastSquares([[1e150]], [1e150], { damping: 1e300, rankAbsoluteTolerance: 0 });
  expect(result.status).toBe('solved'); close(result.solution!, [.5]);
});
it('refuses a step when rank is ambiguous even if damping is requested', () => {
  const result = solveSvdLeastSquares([[1, 0], [0, 1e-9]], [1, 1], { damping: 1 });
  expect(result.status).toBe('rankUncertain'); expect(result.solution).toBeNull(); expect(result.residual).toBeNull(); expect(result.residualNorm).toBeNull();
});
it('refuses a step from an exhausted factorization', () => {
  const result = solveSvdLeastSquares([[3, 4], [4, 3]], [1, 1], { maxSweeps: 0 });
  expect(result.status).toBe('svdNotConverged'); expect(result.solution).toBeNull();
});
it('accepts the explicit matrix dimension boundary without clipping columns', () => {
  const a = Array.from({ length: MAX_LEAST_SQUARES_ROWS }, (_, i) => Array.from({ length: MAX_LEAST_SQUARES_COLUMNS }, (_, j) => i === j ? 1 : 0));
  const svd = oneSidedJacobiSvd(a, { maxSweeps: 0 });
  expect(svd.rank).toBe(MAX_LEAST_SQUARES_COLUMNS); expect(svd.v).toHaveLength(MAX_LEAST_SQUARES_COLUMNS); expect(svd.u).toHaveLength(MAX_LEAST_SQUARES_ROWS);
});

const invalidMatrices = [
  { name: 'empty rows without an encoded variable space', value: [] },
  { name: 'empty columns', value: [[]] },
  { name: 'ragged rows', value: [[1], [1, 2]] },
  { name: 'sparse rows', value: new Array(2) },
  { name: 'sparse entries', value: [new Array(2)] },
  { name: 'NaN entry', value: [[NaN]] },
  { name: 'infinite entry', value: [[Infinity]] },
  { name: 'coercible string', value: [['1']] },
  { name: 'excess rows', value: Array.from({ length: MAX_LEAST_SQUARES_ROWS + 1 }, () => [1]) },
  { name: 'excess columns', value: [Array(MAX_LEAST_SQUARES_COLUMNS + 1).fill(1)] },
] as const;
it.each(invalidMatrices)('rejects $name before numerical operations', ({ value }) => {
  expect(() => oneSidedJacobiSvd(value as unknown as LeastSquaresMatrix)).toThrow(RangeError);
});
it('rejects matrix accessors without invoking them', () => {
  let calls = 0; const row = [0]; Object.defineProperty(row, '0', { get() { calls++; throw new Error('not data'); } });
  expect(() => oneSidedJacobiSvd([row])).toThrow(RangeError); expect(calls).toBe(0);
});
it.each([
  { maxSweeps: -1 }, { maxSweeps: .5 }, { maxSweeps: MAX_JACOBI_SWEEPS + 1 },
  { orthogonalityTolerance: 0 }, { orthogonalityTolerance: 1 },
  { rankAbsoluteTolerance: -1 }, { rankRelativeTolerance: 2 },
  { rankAbsoluteTolerance: 0, rankRelativeTolerance: 0 }, { rankUncertaintyFactor: 1 }, { rankUncertaintyFactor: 101 },
  { rankAbsoluteTolerance: NaN },
] as JacobiSvdOptions[])('rejects invalid numerical policy %#', options => {
  expect(() => oneSidedJacobiSvd([[1]], options)).toThrow(RangeError);
});
it('rejects an option accessor without evaluating it', () => {
  let calls = 0; const options = { get maxSweeps(): number { calls++; throw new Error('not data'); } };
  expect(() => oneSidedJacobiSvd([[1]], options)).toThrow(RangeError); expect(calls).toBe(0);
});
it.each([{ rhs: [1] }, { rhs: [NaN, 1] }, { rhs: [Infinity, 1] }, { rhs: new Array<number>(2) }])('rejects wrong/nonfinite/sparse right-hand side %#', ({ rhs }) => {
  expect(() => solveSvdLeastSquares([[1], [1]], rhs)).toThrow(RangeError);
});
it.each([-1, Infinity, NaN])('rejects invalid damping %s', damping => {
  expect(() => solveSvdLeastSquares([[1]], [1], { damping })).toThrow(RangeError);
});
it('rejects finite input whose singular value exceeds representable range', () => {
  expect(() => oneSidedJacobiSvd([[Number.MAX_VALUE, Number.MAX_VALUE]])).toThrow(/representable|finite arithmetic/);
});
it('rejects input dynamic range that would silently lose a nonzero matrix entry', () => {
  expect(() => oneSidedJacobiSvd([[Number.MAX_VALUE, Number.MIN_VALUE]])).toThrow(/scaling loses/);
});
it('rejects a rank threshold below representable magnitude rather than fabricating certainty', () => {
  expect(() => oneSidedJacobiSvd([[Number.MIN_VALUE]], { rankAbsoluteTolerance: 0 })).toThrow(/representable|underflow/);
});
it('rejects a finite-input step whose solution overflows', () => {
  expect(() => solveSvdLeastSquares([[1e-300]], [1e300], { rankAbsoluteTolerance: 0 })).toThrow(/representable|finite arithmetic/);
});
it('rejects an overflowing residual norm instead of returning Infinity as evidence', () => {
  expect(() => solveSvdLeastSquares([[0], [0]], [Number.MAX_VALUE, Number.MAX_VALUE])).toThrow(/residual norm/);
});
it('rejects right-hand-side scaling that loses a nonzero input', () => {
  expect(() => solveSvdLeastSquares([[1, 0], [0, 1]], [Number.MAX_VALUE, Number.MIN_VALUE])).toThrow(/scaling loses/);
});
