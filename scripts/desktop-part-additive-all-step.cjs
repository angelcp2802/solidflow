'use strict';
const measurePlanarStep = require('./desktop-part-planar-step.cjs');

module.exports = (bytes, check) => {
  const plane = (area, normal, min, max) => ({ area, normal, min, max });
  const cubePlanes = x => [
    plane(16, [0, 0, -1], [x, 0, 0], [x + 4, 4, 0]), plane(16, [0, 0, 1], [x, 0, 4], [x + 4, 4, 4]),
    plane(16, [-1, 0, 0], [x, 0, 0], [x, 4, 4]), plane(16, [1, 0, 0], [x + 4, 0, 0], [x + 4, 4, 4]),
    plane(16, [0, -1, 0], [x, 0, 0], [x + 4, 0, 4]), plane(16, [0, 1, 0], [x, 4, 0], [x + 4, 4, 4]),
  ];
  const cappedPlanes = x => [
    plane(16, [0, 0, -1], [x, 0, 0], [x + 4, 4, 0]),
    plane(12, [0, 0, 1], [x, 0, 4], [x + 4, 4, 4]),
    plane(4, [0, 0, 1], [x, 0, 6], [x + 2, 2, 6]),
    plane(20, [-1, 0, 0], [x, 0, 0], [x, 4, 6]),
    plane(20, [0, -1, 0], [x, 0, 0], [x + 4, 0, 6]),
    plane(16, [1, 0, 0], [x + 4, 0, 0], [x + 4, 4, 4]),
    plane(16, [0, 1, 0], [x, 4, 0], [x + 4, 4, 4]),
    plane(4, [1, 0, 0], [x + 2, 0, 4], [x + 2, 2, 6]),
    plane(4, [0, 1, 0], [x, 2, 4], [x + 2, 2, 6]),
  ];
  const analytical = [
    { name: 'A unchanged source cap', volume: 72, area: 112, min: [0, 0, 0], max: [4, 4, 6], centroid: [17 / 9, 17 / 9, 7 / 3], planes: cappedPlanes(0) },
    { name: 'B restored cube', volume: 64, area: 96, min: [10, 0, 0], max: [14, 4, 4], centroid: [12, 2, 2], planes: cubePlanes(10) },
    { name: 'C actual regenerated cap', volume: 72, area: 112, min: [30, 0, 0], max: [34, 4, 6], centroid: [30 + 17 / 9, 17 / 9, 7 / 3], planes: cappedPlanes(30) },
  ];
  return measurePlanarStep(bytes, check, analytical, { label: 'positive ALL', volume: 208, area: 320 });
};
