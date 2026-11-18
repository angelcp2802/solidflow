'use strict';
const measurePlanarStep = require('./desktop-part-planar-step.cjs');

const plane = (area, normal, min, max) => ({ area, normal, min, max });
function box(x, z, depth, name) {
  return { name, volume: 16 * depth, area: 32 + 16 * depth,
    min: [x, 0, z], max: [x + 4, 4, z + depth], centroid: [x + 2, 2, z + depth / 2], planes: [
      plane(16, [0, 0, -1], [x, 0, z], [x + 4, 4, z]),
      plane(16, [0, 0, 1], [x, 0, z + depth], [x + 4, 4, z + depth]),
      plane(4 * depth, [-1, 0, 0], [x, 0, z], [x, 4, z + depth]),
      plane(4 * depth, [1, 0, 0], [x + 4, 0, z], [x + 4, 4, z + depth]),
      plane(4 * depth, [0, -1, 0], [x, 0, z], [x + 4, 0, z + depth]),
      plane(4 * depth, [0, 1, 0], [x, 4, z], [x + 4, 4, z + depth]),
    ] };
}

// Literal corner removed from D: [20,22] × [0,2] × [-4,0].
const notchedD = { name: 'D with actual corner removed', volume: 48, area: 88,
  min: [20, 0, -4], max: [24, 4, 0], centroid: [20 + 7 / 3, 7 / 3, -2], planes: [
    plane(12, [0, 0, -1], [20, 0, -4], [24, 4, -4]),
    plane(12, [0, 0, 1], [20, 0, 0], [24, 4, 0]),
    plane(8, [-1, 0, 0], [20, 2, -4], [20, 4, 0]),
    plane(16, [1, 0, 0], [24, 0, -4], [24, 4, 0]),
    plane(8, [0, -1, 0], [22, 0, -4], [24, 0, 0]),
    plane(16, [0, 1, 0], [20, 4, -4], [24, 4, 0]),
    plane(8, [-1, 0, 0], [22, 0, -4], [22, 2, 0]),
    plane(8, [0, -1, 0], [20, 2, -4], [22, 2, 0]),
  ] };

module.exports = (bytes, check) => measurePlanarStep(bytes, check,
  [box(0, 2, 2, 'S restored by the original source'), box(10, -4, 4, 'B complete cube'),
    box(10, 2, 2, 'A unchanged prism'), notchedD, box(30, -4, 4, 'C unchanged cube')],
  { label: 'captured AUTO', volume: 240, area: 408 });
