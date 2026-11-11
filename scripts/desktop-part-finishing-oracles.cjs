'use strict';

// Independent Cartesian formulas for the original 10x6x4 prism. These are
// test-only mathematics; no finishing implementation or native query is used.
module.exports = function finishingOracle(kind, mode = 'selected', size = 1) {
  if (!['fillet', 'chamfer'].includes(kind) || !['all', 'selected'].includes(mode) || ![.5, 1].includes(size)) throw Error('Fixed original finishing oracle required');
  const [a, b, c] = [10, 6, 4], r = size, x = a - 2 * r, y = b - 2 * r, z = c - 2 * r;
  if (mode === 'selected') return kind === 'fillet'
    ? { volume: 240 - (4 - Math.PI) * r * r, area: 248 - 8 * r + 2 * Math.PI * r - 2 * r * r + Math.PI * r * r / 2 }
    : { volume: 240 - 2 * r * r, area: 248 - 8 * r + 4 * Math.SQRT2 * r - r * r };
  if (kind === 'fillet') return {
    volume: x * y * z + 2 * r * (x * y + x * z + y * z) + Math.PI * r * r * (x + y + z) + 4 * Math.PI * r ** 3 / 3,
    area: 2 * (x * y + x * z + y * z) + 2 * Math.PI * r * (x + y + z) + 4 * Math.PI * r * r,
  };
  // Twelve rectangular bevels and eight equilateral corner triangles.
  return { volume: a * b * c - 2 * r * r * (a + b + c) + 16 * r ** 3 / 3,
    area: 2 * (x * y + x * z + y * z) + 4 * Math.SQRT2 * r * (a + b + c - 6 * r) + 4 * Math.sqrt(3) * r * r };
};
