import { asDir, Face, getOC, makePln, measureShapeVolumeProperties, type Shape3D } from 'replicad';
import { createFaceCatalog, resolveSelectedFaces } from './kernel.faces';
import type { DraftFeature, PlaneFrame, ShellFeature } from './kernel.types';
import { castOwnedNativeShape, castOwnedNativeSolid } from './kernel.native';

type ValidateSolid = (shape: Shape3D) => number;
const NATIVE_TOLERANCE = 1e-6;

function volume(shape: Shape3D): number {
  const properties = measureShapeVolumeProperties(shape);
  try { return properties.volume; } finally { properties.delete(); }
}

function singleSolid(shape: Shape3D): void {
  const solids = shape.solids;
  try { if (solids.length !== 1) throw new Error('El vaciado o desmoldeo requiere un único sólido conectado.'); }
  finally { solids.forEach((solid) => solid.delete()); }
}

/** A conical parametric surface can cross its apex while BRepCheck still reports valid. */
function rejectInteriorConeApex(shape: Shape3D): void {
  const faces = shape.faces;
  try {
    for (const face of faces) {
      if (face.geomType !== 'CONE') continue;
      const points = [[.125, 0], [.625, 0], [.125, 1], [.625, 1]].map(([u, v]) => {
        const point = face.pointOnSurface(u, v);
        try { return point.toTuple(); } finally { point.delete(); }
      });
      // Difference between two generators is affine in V and vanishes at the apex.
      const a = points[0].map((value, axis) => value - points[1][axis]);
      const b = points[2].map((value, axis) => value - points[3][axis]);
      const delta = b.map((value, axis) => value - a[axis]);
      const squared = delta.reduce((sum, value) => sum + value * value, 0);
      if (squared < 1e-20) continue;
      const t = -a.reduce((sum, value, axis) => sum + value * delta[axis], 0) / squared;
      if (t <= 1e-8 || t >= 1 - 1e-8) continue;
      const distance = Math.hypot(...a.map((value, axis) => value + t * delta[axis]));
      if (distance < NATIVE_TOLERANCE) {
        throw new Error('La operación cruza el vértice de una cara cónica y crea una singularidad. Reduce el ángulo o el espesor.');
      }
    }
  } finally { faces.forEach((face) => face.delete()); }
}

function nativeOffset(body: Shape3D, thickness: number): Shape3D {
  const oc = getOC(), builder = new oc.BRepOffsetAPI_MakeOffsetShape(), solids = body.solids;
  try {
    builder.PerformByJoin(solids[0].wrapped, thickness, NATIVE_TOLERANCE, oc.BRepOffset_Mode.BRepOffset_Skin,
      false, false, oc.GeomAbs_JoinType.GeomAbs_Intersection, false);
    if (!builder.IsDone()) throw new Error('No se puede construir el offset cerrado con este espesor. Reduce el valor.');
    const raw = builder.Shape();
    if (raw.IsNull()) { raw.delete(); throw new Error('El offset cerrado desaparece con este espesor. Reduce el valor.'); }
    const result = castOwnedNativeSolid(raw, 'No se puede construir un sólido para el offset. Reduce el espesor.');
    if (volume(result) >= 0) return result;
    try { return castOwnedNativeSolid(result.wrapped.Reversed(), 'No se puede orientar el sólido de offset. Reduce el espesor.'); } finally { result.delete(); }
  } finally { builder.delete(); solids.forEach((solid) => solid.delete()); }
}

function nativeOpenShell(body: Shape3D, faces: Face[], thickness: number): Shape3D {
  const oc = getOC(), removed = new oc.NCollection_List_TopoDS_Shape(), builder = new oc.BRepOffsetAPI_MakeThickSolid(), solids = body.solids;
  try {
    faces.forEach((face) => removed.Append(face.wrapped));
    builder.MakeThickSolidByJoin(solids[0].wrapped, removed, thickness, NATIVE_TOLERANCE, oc.BRepOffset_Mode.BRepOffset_Skin,
      false, false, oc.GeomAbs_JoinType.GeomAbs_Intersection, false);
    if (!builder.IsDone()) throw new Error('No se puede vaciar con estas caras y este espesor. Reduce el valor o cambia las caras eliminadas.');
    const raw = builder.Shape();
    if (raw.IsNull()) { raw.delete(); throw new Error('El vaciado queda vacío con este espesor. Reduce el valor o cambia las caras eliminadas.'); }
    return castOwnedNativeSolid(raw, 'No se puede construir el vaciado. Reduce el espesor o cambia las caras.');
  } finally { builder.delete(); removed.delete(); solids.forEach((solid) => solid.delete()); }
}

/** Open the closed wall using exact face-offset history, never nearest-face matching. */
function nativeCurvedOpenings(body: Shape3D, faces: Face[], thickness: number, inward: boolean, validate: ValidateSolid): Shape3D {
  // Adjacent openings require rebuilding their shared corner; independent face thickenings
  // would leave an artificial corner rib. Keep that unsupported case explicit.
  const boundaries = faces.map((face) => face.edges);
  try {
    for (let i = 0; i < boundaries.length; i++) for (let j = i + 1; j < boundaries.length; j++) {
      if (boundaries[i].some((a) => boundaries[j].some((b) => a.isSame(b)))) {
        throw new Error('Las aperturas curvas que comparten una arista requieren otra selección. Selecciona aperturas separadas.');
      }
    }
  } finally { boundaries.flat().forEach((edge) => edge.delete()); }
  const oc = getOC(), builder = new oc.BRepOffsetAPI_MakeOffsetShape(), solids = body.solids;
  let offset: Shape3D | null = null, candidate: Shape3D | null = null;
  try {
    builder.PerformByJoin(solids[0].wrapped, inward ? -thickness : thickness, NATIVE_TOLERANCE, oc.BRepOffset_Mode.BRepOffset_Skin,
      false, false, oc.GeomAbs_JoinType.GeomAbs_Intersection, false);
    if (!builder.IsDone()) throw new Error('No se puede desplazar la pared curva con este espesor. Reduce el valor.');
    const raw = builder.Shape();
    if (raw.IsNull()) { raw.delete(); throw new Error('El offset de la pared curva desaparece. Reduce el espesor.'); }
    offset = castOwnedNativeSolid(raw, 'No se puede desplazar la pared curva. Reduce el espesor.');
    if (volume(offset) < 0) { const positive = castOwnedNativeSolid(offset.wrapped.Reversed(), 'No se puede orientar la pared curva.'); offset.delete(); offset = positive; }
    validate(offset); singleSolid(offset); rejectInteriorConeApex(offset);
    candidate = inward ? body.cut(offset) : offset.cut(body);
    validate(candidate); singleSolid(candidate);
    for (const face of faces) {
      let openingFace: Face | null = null, tool: Shape3D | null = null;
      const thickener = new oc.BRepOffsetAPI_MakeThickSolid();
      try {
        if (inward) {
          const history = builder.Generated(face.wrapped);
          try {
            if (history.Size() !== 1) throw new Error('El offset divide o pierde una cara de apertura. Cambia el espesor o la selección.');
            const generated = castOwnedNativeShape(history.First());
            if (!(generated instanceof Face)) { generated.delete(); throw new Error('No se encuentra una cara paralela única para la apertura.'); }
            openingFace = generated;
          } finally { history.delete(); }
        } else openingFace = face.clone();
        thickener.MakeThickSolidBySimple(openingFace.wrapped, thickness);
        if (!thickener.IsDone()) throw new Error('No se puede abrir el espesor de esta cara curva. Reduce el valor o cambia la selección.');
        const rawTool = thickener.Shape();
        if (rawTool.IsNull()) { rawTool.delete(); throw new Error('La apertura curva queda vacía con este espesor. Reduce el valor.'); }
        tool = castOwnedNativeSolid(rawTool, 'No se puede construir la apertura de la pared. Cambia el espesor o la cara.');
        if (volume(tool) < 0) { const positive = castOwnedNativeSolid(tool.wrapped.Reversed(), 'No se puede orientar la apertura curva.'); tool.delete(); tool = positive; }
        validate(tool); singleSolid(tool);
        const next: Shape3D = candidate!.cut(tool);
        candidate!.delete(); candidate = next;
        validate(next); singleSolid(next);
      } finally { tool?.delete(); openingFace?.delete(); thickener.delete(); }
    }
    const result = candidate!; candidate = null; return result;
  } finally { candidate?.delete(); offset?.delete(); builder.delete(); solids.forEach((solid) => solid.delete()); }
}

export function shellSolid(body: Shape3D, feature: ShellFeature, lineage: string, validate: ValidateSolid): Shape3D {
  if (!Number.isFinite(feature.thickness) || feature.thickness < .01 || feature.thickness > 100_000) {
    throw new Error('El espesor debe estar entre 0,01 y 100.000 mm.');
  }
  if (feature.direction !== 'inward' && feature.direction !== 'outward') throw new Error('Dirección de vaciado no compatible.');
  singleSolid(body);
  const catalog = createFaceCatalog(body, feature.baseFeatureId, lineage);
  let candidate: Shape3D | null = null, offset: Shape3D | null = null;
  try {
    const faces = resolveSelectedFaces(catalog, feature.removedFaces, feature.baseFeatureId);
    if (faces.length === catalog.entries.length) throw new Error('El vaciado necesita conservar al menos una cara como pared.');
    const inward = feature.direction === 'inward', signedThickness = inward ? -feature.thickness : feature.thickness;
    const baseVolume = volume(body), tolerance = Math.max(1e-6, baseVolume * 1e-9);
    if (faces.length) candidate = faces.some((face) => face.geomType !== 'PLANE')
      ? nativeCurvedOpenings(body, faces, feature.thickness, inward, validate) : nativeOpenShell(body, faces, signedThickness);
    else {
      // A closed shell is the actual difference of the source and its complete native offset.
      // MakeThickSolidByJoin with an empty closing list returns only the offset, not a cavity.
      offset = nativeOffset(body, signedThickness);
      validate(offset); singleSolid(offset); rejectInteriorConeApex(offset);
      const outside = inward ? offset.cut(body) : body.cut(offset);
      try {
        if (Math.abs(volume(outside)) > tolerance) throw new Error('El offset se cruza con el sólido original. Reduce el espesor.');
      } finally { outside.delete(); }
      candidate = inward ? body.cut(offset) : offset.cut(body);
    }
    const resultVolume = validate(candidate);
    singleSolid(candidate); rejectInteriorConeApex(candidate);
    if (inward && resultVolume >= baseVolume - tolerance) throw new Error('El espesor no deja una cavidad válida. Reduce el valor.');
    const wrongSide = inward ? candidate.cut(body) : candidate.intersect(body);
    try {
      if (Math.abs(volume(wrongSide)) > tolerance) throw new Error('El vaciado produce material en el lado incorrecto de la pared. Reduce el espesor.');
    } finally { wrongSide.delete(); }
    if (inward && faces.length) {
      // If a complete inner offset exists, an opened cavity must also remove that core.
      // OCCT can otherwise return a valid, almost full solid for some curved openings.
      let core: Shape3D | null = null;
      try {
        core = nativeOffset(body, signedThickness); validate(core); singleSolid(core);
        const outside = core.cut(body);
        try {
          if (Math.abs(volume(outside)) > tolerance) { core.delete(); core = null; }
        } finally { outside.delete(); }
      } catch { core?.delete(); core = null; }
      // A closed offset may legitimately collapse at faces that the open shell removes.
      // In that case the original open-shell validity and sidedness checks still apply.
      if (core) {
        let filledCore: Shape3D | null = null;
        try {
          filledCore = candidate.intersect(core);
          if (Math.abs(volume(filledCore)) > tolerance) {
            throw new Error('La apertura no genera una cavidad completa con este espesor. Cambia las caras eliminadas o reduce el espesor.');
          }
        } finally { filledCore?.delete(); core.delete(); }
      }
    }
    const result = candidate; candidate = null; return result;
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error('OpenCascade no pudo construir el vaciado. Reduce el espesor o cambia las caras eliminadas.');
  } finally { candidate?.delete(); offset?.delete(); catalog.dispose(); }
}

function topology(shape: Shape3D): [number, number] {
  const faces = shape.faces, edges = shape.edges;
  try { return [faces.length, edges.length]; }
  finally { faces.forEach((face) => face.delete()); edges.forEach((edge) => edge.delete()); }
}

export function draftSolid(body: Shape3D, feature: DraftFeature, frame: PlaneFrame, lineage: string, validate: ValidateSolid): Shape3D {
  if (!Number.isFinite(feature.angle) || feature.angle < .01 || feature.angle > 89.9) throw new Error('El ángulo debe estar entre 0,01° y 89,9°.');
  if (typeof feature.reversed !== 'boolean' || feature.propagation !== 'tangent') {
    throw new Error('El desmoldeo requiere un sentido válido y propagación tangente.');
  }
  if (!feature.faces.length) throw new Error('Selecciona al menos una cara para desmoldear.');
  singleSolid(body);
  const catalog = createFaceCatalog(body, feature.baseFeatureId, lineage), oc = getOC();
  const builder = new oc.BRepOffsetAPI_DraftAngle(body.wrapped), plane = makePln(frame.origin, frame.normal), direction = asDir(frame.normal);
  let candidate: Shape3D | null = null;
  try {
    const faces = resolveSelectedFaces(catalog, feature.faces, feature.baseFeatureId);
    const radians = feature.angle * Math.PI / 180 * (feature.reversed ? -1 : 1);
    for (const face of faces) {
      if (!['PLANE', 'CYLINDRE', 'CONE'].includes(face.geomType)) {
        throw new Error('El desmoldeo admite caras planas, cilíndricas o cónicas. Cambia la selección de caras.');
      }
      // Flag=true performs direct cylindrical/conical tapering; it is not a tangent-propagation switch.
      builder.Add(face.wrapped, direction, radians, plane, true);
      if (!builder.AddDone()) throw new Error('No se puede desmoldear una cara con este plano neutro. Cambia la cara, el plano o el ángulo.');
    }
    builder.Build();
    if (!builder.IsDone()) throw new Error('El desmoldeo no se puede completar. Reduce el ángulo o cambia las caras y el plano neutro.');
    const raw = builder.Shape();
    if (raw.IsNull()) { raw.delete(); throw new Error('El desmoldeo queda vacío con este ángulo. Reduce el valor o cambia las caras.'); }
    candidate = castOwnedNativeSolid(raw, 'El desmoldeo no produce un sólido. Reduce el ángulo o cambia las caras.');
    validate(candidate); singleSolid(candidate); rejectInteriorConeApex(candidate);
    if (JSON.stringify(topology(candidate)) !== JSON.stringify(topology(body))) {
      throw new Error('El desmoldeo altera la topología del sólido. Reduce el ángulo o cambia el plano neutro.');
    }
    const added = candidate.cut(body), removed = body.cut(candidate);
    try {
      if (Math.abs(volume(added)) + Math.abs(volume(removed)) <= Math.max(1e-8, volume(body) * 1e-10)) {
        throw new Error('El desmoldeo no modifica el sólido. Revisa las caras y el plano neutro.');
      }
    } finally { added.delete(); removed.delete(); }
    const result = candidate; candidate = null; return result;
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error('OpenCascade no pudo construir el desmoldeo. Reduce el ángulo o cambia las caras y el plano neutro.');
  } finally { candidate?.delete(); builder.delete(); plane.delete(); direction.delete(); catalog.dispose(); }
}
