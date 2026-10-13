import { Face, getOC, measureShapeSurfaceProperties, type Shape3D } from 'replicad';
import { castOwnedNativeShape, castOwnedNativeSolid } from './kernel.native';
import type { PlaneFrame, Vec3 } from './kernel.types';

const TOLERANCE = 1e-6;
type MakePrism = (length: number, start?: number) => Shape3D;
const dot = (a: number[], b: number[]) => a.reduce((sum, value, axis) => sum + value * b[axis], 0);
function volume(shape: Shape3D): number {
  const oc=getOC(),properties = new oc.GProp_GProps();
  try { oc.BRepGProp.VolumeProperties(shape.wrapped,properties,1e-10,false,false);return properties.Mass(); } finally { properties.delete(); }
}
function extent(shape: Shape3D | Face, origin: Vec3, direction: Vec3): [number, number] {
  const box = shape.boundingBox;
  try {
    const [a, b] = box.bounds, projections: number[] = [];
    for (const x of [a[0], b[0]]) for (const y of [a[1], b[1]]) for (const z of [a[2], b[2]]) {
      projections.push(dot([x-origin[0], y-origin[1], z-origin[2]], direction));
    }
    return [Math.min(...projections), Math.max(...projections)];
  } finally { box.delete(); }
}
function capArea(shape: Shape3D, origin: Vec3, direction: Vec3, distance: number): number {
  const faces = shape.faces;
  try { return faces.reduce((sum, face) => {
    if (face.geomType !== 'PLANE') return sum;
    const normal = face.normalAt(), point = face.pointOnSurface(.5, .5);
    try {
      if (Math.abs(Math.abs(dot(normal.toTuple(), direction))-1)>1e-8) return sum;
      const position = dot(point.toTuple().map((value, axis)=>value-origin[axis]), direction);
      if (Math.abs(position-distance)>TOLERANCE*10) return sum;
      const properties = measureShapeSurfaceProperties(face);
      try { return sum+properties.area; } finally { properties.delete(); }
    } finally { normal.delete(); point.delete(); }
  }, 0); } finally { faces.forEach(face=>face.delete()); }
}

/** Bounds only enclose the cutting tool; the resulting boundary is the exact body B-rep. */
export function throughAllTool(body: Shape3D, origin: Vec3, direction: Vec3, bothDirections: boolean, makePrism: MakePrism): Shape3D {
  const [minimum, maximum] = extent(body, origin, direction);
  const margin = Math.max(1, (maximum-minimum)*.01);
  const start = bothDirections ? Math.min(0, minimum-margin) : 0;
  const end = Math.max(0, maximum)+margin;
  if (!bothDirections && maximum < TOLERANCE) throw new Error('No hay material en el sentido de extrusión elegido. Invierte la dirección.');
  return makePrism(end-start, start);
}

/** Split uses the exact native face; a component must retain the entire initial cap and lose the artificial final cap. */
function splitAtFace(prism: Shape3D, target: Face, origin: Vec3, direction: Vec3, length: number, materialSense?: number, farthest = false): Shape3D | null {
  const oc = getOC(), argumentsList = new oc.NCollection_List_TopoDS_Shape(), tools = new oc.NCollection_List_TopoDS_Shape();
  const builder = new oc.BRepAlgoAPI_Splitter();
  let result: Shape3D | null = null;
  const selected: Shape3D[] = [];
  try {
    argumentsList.Append(prism.wrapped).delete(); tools.Append(target.wrapped).delete();
    builder.SetArguments(argumentsList); builder.SetTools(tools);
    // The limiting face can share topology with a retained historical body.
    builder.SetNonDestructive(true);
    if (!builder.NonDestructive()) throw new Error('No se puede proteger la geometría original al dividir la extrusión.');
    builder.Build();
    result = castOwnedNativeSolid(builder.Shape(), 'No se puede dividir la extrusión con esta superficie.');
    const solids = result.solids, solidFaces=solids.map(solid=>solid.faces);
    try {
      const initialArea = capArea(prism, origin, direction, 0);
      const chosen=new Set<number>();
      for (const [index,solid] of solids.entries()) {
        const area = capArea(solid, origin, direction, 0);
        if (area <= TOLERANCE*TOLERANCE) continue;
        chosen.add(index);
      }
      if(farthest){chosen.clear();solids.forEach((solid,index)=>{if(capArea(solid,origin,direction,length)<=TOLERANCE*TOLERANCE)chosen.add(index);});}
      // A cut crosses entry intersections and stops at the first complete exit; a boss stops at entry.
      // Adjacency comes from shared native split faces, never sampled ray hits or enumeration identities.
      if(materialSense) for(let pass=0;pass<solids.length;pass++){
        let added=false;
        for(const index of [...chosen])for(const face of solidFaces[index])for(let other=0;other<solids.length;other++){
          if(chosen.has(other)||!solidFaces[other].some(neighbor=>neighbor.isSame(face)))continue;
          const signs=[.25,.5,.75].map(parameter=>{
            const point=face.pointOnSurface(parameter,.5),normal=target.normalAt(point);
            try{return dot(normal.toTuple(),direction)*materialSense;}finally{point.delete();normal.delete();}
          });
          if(signs.some(sign=>sign>TOLERANCE)&&signs.some(sign=>sign<-TOLERANCE)) throw new Error('La superficie siguiente cambia de sentido sobre el perfil. Selecciona una cara límite explícita.');
          if(signs.every(sign=>sign<=TOLERANCE)){if(farthest)return null;chosen.add(other);added=true;}
        }
        if(!added)break;
      }
      let retainedArea=0;
      for(const index of chosen){if(capArea(solids[index],origin,direction,length)>TOLERANCE*TOLERANCE)return null;retainedArea+=capArea(solids[index],origin,direction,0);selected.push(solids[index].clone());}
      if (!selected.length || Math.abs(retainedArea-initialArea)>Math.max(1e-7, initialArea*1e-8)) return null;
      let united=selected[0].clone();
      try{for(const next of selected.slice(1)){const fused=united.fuse(next);united.delete();united=fused;}return united.clone();}finally{united.delete();}
    } finally { solidFaces.flat().forEach(face=>face.delete());solids.forEach(solid=>solid.delete()); }
  } finally {
    selected.forEach(shape=>shape.delete()); result?.delete(); builder.delete(); tools.delete(); argumentsList.delete();
  }
}

function planeFace(frame: PlaneFrame): Face {
  const oc = getOC(), origin = new oc.gp_Pnt(...frame.origin), normal = new oc.gp_Dir(...frame.normal), plane = new oc.gp_Pln(origin, normal);
  const builder = new oc.BRepBuilderAPI_MakeFace(plane);
  try { return castOwnedNativeShape(builder.Face()) as Face; }
  finally { builder.delete(); plane.delete(); normal.delete(); origin.delete(); }
}

/** A planar target extends analytically; a curved target retains its selected face's trim and branch. */
export function upToSurfaceTool(target: {frame: PlaneFrame} | {face: Face}, origin: Vec3, direction: Vec3, makePrism: MakePrism): Shape3D {
  let face: Face | null = null;
  let probe: Shape3D | null = null;
  try {
    if ('frame' in target) face = planeFace(target.frame);
    else if (target.face.geomType === 'PLANE') {
      const surface = getOC().BRep_Tool.Surface(target.face.wrapped);
      const builder = new (getOC().BRepBuilderAPI_MakeFace)(surface, TOLERANCE);
      try { face = castOwnedNativeShape(builder.Face()) as Face; } finally { builder.delete(); surface.delete(); }
    } else face = target.face.clone();
    probe = makePrism(1);
    let length: number;
    if (face.geomType==='PLANE') {
      const n=face.normalAt(), point=face.pointOnSurface(.5,.5);
      try {
        const normal=n.toTuple(), divisor=dot(normal,direction);
        if(Math.abs(divisor)<1e-10) throw new Error('La superficie límite es paralela a la dirección de extrusión.');
        const [minimum,maximum]=extent(probe,point.toTuple(),normal);
        const distances=[-minimum/divisor,-maximum/divisor];
        // Probe contains one unit of depth; its bounds provide a conservative complete-profile envelope.
        length=Math.max(...distances)+2;
        if(length<=TOLERANCE) throw new Error('La superficie límite está detrás del croquis. Invierte la dirección.');
      } finally { n.delete();point.delete(); }
    } else {
      const [minimum, maximum]=extent(face,origin,direction);
      length=Math.max(1,maximum)+Math.max(1,(maximum-minimum)*.05);
    }
    if(!Number.isFinite(length)||length>10_000_000) throw new Error('La superficie límite queda demasiado lejos en esta dirección.');
    const prism=makePrism(length);
    try {
      const result=splitAtFace(prism,face,origin,direction,length);
      if(!result) throw new Error('La superficie límite no cierra todo el perfil en el sentido elegido. Revisa el contorno, la cara o la dirección.');
      return result;
    } finally { prism.delete(); }
  } finally { face?.delete(); probe?.delete(); }
}

/** A candidate is an actual trimmed body face closing every contour. Incomparable limits are never ranked by average depth. */
export function untilNextTool(body: Shape3D, origin: Vec3, direction: Vec3, makePrism: MakePrism, cutting: boolean): Shape3D {
  const [,maximum]=extent(body,origin,direction);
  if(maximum<=TOLERANCE) throw new Error('No hay una superficie siguiente en el sentido elegido.');
  const length=maximum+Math.max(1,Math.abs(maximum)*.01), prism=makePrism(length), faces=body.faces;
  const candidates: Shape3D[]=[];
  try {
    for(const face of faces){
      const [minimum,maximumFace]=extent(face,origin,direction);
      if(maximumFace<=TOLERANCE||minimum>=length-TOLERANCE) continue;
      const candidate=splitAtFace(prism,face,origin,direction,length,cutting?1:-1);
      if(candidate) candidates.push(candidate);
    }
    if(!candidates.length) throw new Error('Ninguna superficie siguiente del cuerpo intercepta todo el perfil.');
    candidates.sort((a,b)=>volume(a)-volume(b));
    const nearest=candidates[0], tolerance=Math.max(1e-7,volume(nearest)*1e-8);
    for(const candidate of candidates.slice(1)) {
      const outside=nearest.cut(candidate);
      try { if(Math.abs(volume(outside))>tolerance) throw new Error('Hay superficies siguientes incompatibles sobre el perfil. Selecciona una cara límite explícita.'); }
      finally { outside.delete(); }
    }
    return nearest.clone();
  } finally { candidates.forEach(candidate=>candidate.delete());faces.forEach(face=>face.delete());prism.delete(); }
}

/** Additive ThroughAll finishes at actual exit faces; enclosing-box margins must never become a boss boundary. */
export function throughAllBossTool(body: Shape3D, origin: Vec3, direction: Vec3, bothDirections: boolean, makePrism: MakePrism): Shape3D {
  const oneDirection=(axis:Vec3,make:MakePrism):Shape3D|null=>{
    const [,maximum]=extent(body,origin,axis);
    if(maximum<=TOLERANCE)return null;
    const length=maximum+Math.max(1,maximum*.01),prism=make(length),faces=body.faces,candidates:Shape3D[]=[];
    try{
      for(const face of faces){
        if(extent(face,origin,axis)[1]<=TOLERANCE)continue;
        const candidate=splitAtFace(prism,face,origin,axis,length,1,true);
        if(candidate)candidates.push(candidate);
      }
      if(!candidates.length)throw new Error('Por todo no encuentra una superficie de salida que cierre todo el perfil del saliente.');
      candidates.sort((a,b)=>volume(b)-volume(a));
      const farthest=candidates[0],tolerance=Math.max(1e-7,volume(farthest)*1e-8);
      const occupied=body.intersect(prism),beyond=occupied.cut(farthest);
      try{if(Math.abs(volume(beyond))>tolerance)throw new Error('La salida Por todo tiene varios límites parciales. Selecciona una superficie límite explícita.');}
      finally{occupied.delete();beyond.delete();}
      return farthest.clone();
    }finally{faces.forEach(face=>face.delete());candidates.forEach(candidate=>candidate.delete());prism.delete();}
  };
  let forward:Shape3D|null=null,backward:Shape3D|null=null;
  try{
    forward=oneDirection(direction,makePrism);
    if(bothDirections)backward=oneDirection(direction.map(value=>-value)as Vec3,(length,start=0)=>makePrism(length,-start-length));
    if(forward&&backward)return forward.fuse(backward);
    if(forward||backward)return (forward??backward)!.clone();
    throw new Error('No hay material que limite el saliente Por todo en el sentido elegido.');
  }finally{forward?.delete();backward?.delete();}
}
