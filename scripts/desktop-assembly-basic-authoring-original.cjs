'use strict';
// Independently authored analytical fixture. A 3 x 2 rectangle in XY extruded
// 4 mm: V=24 mm3, A=2*(3*2+3*4+2*4)=52 mm2, bounds [0,0,0]..[3,2,4].
// No imported CAD, reference application data, or preassembled graph.
module.exports = function basicAuthoringOriginal() {
  const stamp = '2026-10-25T00:00:00.000Z';
  return { version: 1, id: 'basic-authoring-prism', name: 'Original authoring prism', units: 'mm', createdAt: stamp, updatedAt: stamp,
    features: [
      { id: 'basic-profile', name: 'Original 3 by 2 rectangle', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
        profile: { kind: 'rectangle', center: [1.5, 1], width: 3, height: 2 } },
      { id: 'basic-solid', name: 'Original 4 mm extrusion', type: 'extrude', sketchId: 'basic-profile', depth: 4, symmetric: false, suppressed: false },
    ] };
};
