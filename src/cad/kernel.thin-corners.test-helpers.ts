import type { EntityProfile } from '../sketch/types';
import type { SketchFeature, ThinWallDefinition, Vec3 } from './kernel.types';

// Original dimensioned fixtures. Expected lengths, turns and measures below are
// analytical constants; no fillet, offset or native result supplies the oracle.
export const cornerPolyline = (coordinates: [number, number][], prefix = ''): EntityProfile => ({ kind: 'entities',
  points: coordinates.map(([x, y], index) => ({ id: `${prefix}p${index}`, x, y })),
  entities: coordinates.slice(0, -1).map((_, index) => ({ id: `${prefix}e${index}`, type: 'line', construction: false,
    start: `${prefix}p${index}`, end: `${prefix}p${index + 1}` })), constraints: [] });
export const cornerSketch = (profile: SketchFeature['profile']): SketchFeature => ({
  id: 'original-corner-source', name: 'Original corner source', type: 'sketch', plane: 'XY', offset: 0, suppressed: false, profile,
});
export const cornerWall = (p: number, n: number, radius: number): ThinWallDefinition => ({
  ...(n === 0 ? { kind: 'one-side' as const, thickness: p, reversed: false }
    : p === 0 ? { kind: 'one-side' as const, thickness: n, reversed: true }
      : { kind: 'two-sides' as const, firstThickness: p, secondThickness: n }), autoCorners: { enabled: true, radius },
});
export function lineArcCorner(): EntityProfile {
  return { kind: 'entities', constraints: [], points: [{ id: 'a', x: 0, y: -10 }, { id: 'joint', x: 0, y: 0 },
    { id: 'center', x: 0, y: 5 }, { id: 'b', x: 5, y: 5 }], entities: [
    { id: 'line', type: 'line', start: 'a', end: 'joint', construction: false },
    { id: 'arc', type: 'arc', start: 'joint', end: 'b', center: 'center', clockwise: false, construction: false },
  ] };
}
export function arcArcCorner(): EntityProfile {
  return { kind: 'entities', constraints: [], points: [{ id: 'a', x: -5, y: -5 }, { id: 'ca', x: -5, y: 0 },
    { id: 'joint', x: 0, y: 0 }, { id: 'cb', x: 0, y: 5 }, { id: 'b', x: 5, y: 5 }], entities: [
    { id: 'first', type: 'arc', start: 'a', end: 'joint', center: 'ca', clockwise: false, construction: false },
    { id: 'second', type: 'arc', start: 'joint', end: 'b', center: 'cb', clockwise: false, construction: false },
  ] };
}
export function consumedArcCorner(): EntityProfile {
  return { kind: 'entities', constraints: [], points: [{ id: 'a', x: 0, y: -10 }, { id: 'joint-a', x: 0, y: 0 },
    { id: 'center', x: 0, y: 5 }, { id: 'joint-b', x: 5, y: 5 }, { id: 'b', x: 15, y: 5 }], entities: [
    { id: 'first', type: 'line', start: 'a', end: 'joint-a', construction: false },
    { id: 'middle', type: 'arc', start: 'joint-a', end: 'joint-b', center: 'center', clockwise: false, construction: false },
    { id: 'last', type: 'line', start: 'joint-b', end: 'b', construction: false },
  ] };
}
export interface CornerOracle {
  name: string; profile: EntityProfile; wall: ThinWallDefinition; depth: number;
  sectionArea: number; volume: number; area: number; min: Vec3; max: Vec3; solids?: number;
}
export function cornerOracles(): CornerOracle[] {
  const p = Math.PI, L = () => cornerPolyline([[0, 0], [20, 0], [20, 15]]);
  const rho = 3, alphaLine = Math.asin(rho / (5 + rho));
  const lineArcLength = 15 - Math.sqrt(25 + 10 * rho) + (rho + 5) * (p / 2 - alphaLine);
  const c = (-5 + Math.sqrt(25 + 20 * rho + 2 * rho * rho)) / 2, alphaArcs = Math.atan(c / (c + 5));
  const arcArcLength = 10 * (p / 2 - alphaArcs) + rho * (p / 2 - 2 * alphaArcs);
  const first = cornerPolyline([[0, 0], [20, 0], [20, 15]], 'a-');
  const second = cornerPolyline([[40, 0], [60, 0], [60, 15]], 'b-');
  const mixedVariants = [[0, 1], [1, 1], [2, 1]].flatMap(([positive, negative]): CornerOracle[] => {
    const r = 2 + positive, width = positive + negative, a = Math.asin(r / (5 + r));
    const mixedLength = 15 - Math.sqrt(25 + 10 * r) + (r + 5) * (p / 2 - a);
    const q = (-5 + Math.sqrt(25 + 20 * r + 2 * r * r)) / 2, b = Math.atan(q / (q + 5));
    const curvedLength = 10 * (p / 2 - b) + r * (p / 2 - 2 * b);
    const curvedArea = width * curvedLength + (positive * positive - negative * negative) * p / 4;
    const curvedPerimeter = 2 * curvedLength + (positive - negative) * p / 2 + 2 * width;
    return [
      { name: `LINE/ARC wall ${positive}/${negative}, inner R2`, profile: lineArcCorner(), wall: cornerWall(positive, negative, 2), depth: 3,
        sectionArea: width * mixedLength, volume: 3 * width * mixedLength, area: (2 * width + 6) * mixedLength + 6 * width,
        min: [-negative, -10, 0], max: [5 + positive, 5, 3] },
      { name: `ARC/ARC wall ${positive}/${negative}, inner R2`, profile: arcArcCorner(), wall: cornerWall(positive, negative, 2), depth: 3,
        sectionArea: curvedArea, volume: 3 * curvedArea, area: 2 * curvedArea + 3 * curvedPerimeter,
        min: [-5, -5 - positive, 0], max: [5 + positive, 5, 3] },
    ];
  });
  return [
    { name: 'right L, inner R3', profile: L(), wall: cornerWall(2, 0, 3), depth: 10,
      sectionArea: 58 + 4 * p, volume: 580 + 40 * p, area: 736 + 48 * p, min: [0, -2, 0], max: [22, 15, 10] },
    { name: 'left L, inner R3', profile: L(), wall: cornerWall(0, 2, 3), depth: 10,
      sectionArea: 50 + 4 * p, volume: 500 + 40 * p, area: 640 + 48 * p, min: [0, 0, 0], max: [20, 15, 10] },
    { name: 'left L, inner R0.001', profile: L(), wall: cornerWall(0, 2, .001), depth: 10,
      sectionArea: 61.996 + 1.001 * p, volume: 10 * (61.996 + 1.001 * p), area: 783.952 + 12.012 * p, min: [0, 0, 0], max: [20, 15, 10] },
    { name: 'wall midpoint, inner R3', profile: L(), wall: { kind: 'mid-plane', thickness: 4, autoCorners: { enabled: true, radius: 3 } }, depth: 10,
      sectionArea: 100 + 10 * p, volume: 1000 + 100 * p, area: 780 + 70 * p, min: [0, -2, 0], max: [22, 15, 10] },
    { name: 'asymmetric wall, inner R3', profile: L(), wall: cornerWall(2, 1, 3), depth: 10,
      sectionArea: 81 + 6.75 * p, volume: 810 + 67.5 * p, area: 762 + 58.5 * p, min: [0, -2, 0], max: [22, 15, 10] },
    { name: 'LINE/ARC, inner R2', profile: lineArcCorner(), wall: cornerWall(1, 0, 2), depth: 3,
      sectionArea: lineArcLength, volume: 3 * lineArcLength, area: 8 * lineArcLength + 6, min: [0, -10, 0], max: [6, 5, 3] },
    { name: 'ARC/ARC, inner R2', profile: arcArcCorner(), wall: cornerWall(1, 0, 2), depth: 3,
      sectionArea: arcArcLength + p / 4, volume: 3 * arcArcLength + 3 * p / 4, area: 8 * arcArcLength + 2 * p + 6, min: [-5, -6, 0], max: [6, 5, 3] },
    ...mixedVariants,
    { name: 'zigzag left/right corners, inner R2', profile: cornerPolyline([[0, 0], [12, 0], [12, 12], [24, 12]]), wall: cornerWall(1, 0, 2), depth: 3,
      sectionArea: 26 + 2.5 * p, volume: 78 + 7.5 * p, area: 214 + 20 * p, min: [0, -1, 0], max: [24, 12, 3] },
    { name: 'two disconnected L chains', profile: { kind: 'entities', points: [...first.points, ...second.points], entities: [...first.entities, ...second.entities], constraints: [] },
      wall: cornerWall(2, 0, 3), depth: 10, sectionArea: 116 + 8 * p, volume: 1160 + 80 * p, area: 1472 + 96 * p, min: [0, -2, 0], max: [62, 15, 10], solids: 2 },
  ];
}
