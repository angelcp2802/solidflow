import { draw, getOC, Plane, sketchCircle, type Shape3D, type Sketch } from 'replicad';
import { frameCross, framePoint } from './kernel.frames';
import { throughAllTool, untilNextTool } from './kernel.extrusion-limits';
import type { HoleFeature, HolePosition, PlaneFrame, Vec3 } from './kernel.types';

const MIN_LENGTH = .01, MAX_LENGTH = 100_000;
type ValidateSolid = (shape: Shape3D) => number;
function length(value:number,name:string):void {
  if(!Number.isFinite(value)||value<MIN_LENGTH||value>MAX_LENGTH)throw new Error(`${name}: introduce un valor entre 0,01 y 100.000 mm.`);
}
function angle(value:number,name:string):void {
  if(!Number.isFinite(value)||value<1||value>179)throw new Error(`${name}: introduce un ángulo incluido entre 1° y 179°.`);
}
function volume(shape:Shape3D):number {
  const oc=getOC(),properties=new oc.GProp_GProps();
  try{oc.BRepGProp.VolumeProperties(shape.wrapped,properties,1e-10,false,false);return properties.Mass();}finally{properties.delete();}
}
function moved(origin:Vec3,direction:Vec3,distance:number):Vec3{return origin.map((value,axis)=>value+direction[axis]*distance)as Vec3;}
/** Keep semantic position identity when dimensions change, but invalidate refs if labelled centres exchange spatial roles. */
export function holePositionStructure(positions:HolePosition[]):unknown {
  const ordinal=(value:number,axis:'x'|'y')=>positions.filter(position=>position[axis]<value-1e-6).length;
  return positions.map(position=>[position.id,ordinal(position.x,'x'),ordinal(position.y,'y')]).sort((a,b)=>String(a[0])<String(b[0])?-1:String(a[0])>String(b[0])?1:0);
}
function cylinder(radius:number,origin:Vec3,frame:PlaneFrame,direction:Vec3,depth:number):Shape3D {
  const plane=new Plane(origin,frame.xDirection,direction),sketch=sketchCircle(radius,{plane});
  try{return sketch.extrude(depth);}finally{sketch.delete();plane.delete();}
}
/** Revolving straight edges produces a native conical surface, including the apex at zero end radius. */
function cone(firstRadius:number,lastRadius:number,depth:number,origin:Vec3,frame:PlaneFrame,direction:Vec3):Shape3D {
  const plane=new Plane(origin,frame.xDirection,frameCross(frame.xDirection,direction));
  const pen=draw([0,0]).lineTo([firstRadius,0]).lineTo([lastRadius,depth]);
  const sketch=(lastRadius>0?pen.lineTo([0,depth]):pen).close().sketchOnPlane(plane)as Sketch;
  try{return sketch.revolve(direction,{origin,angle:360});}finally{sketch.delete();plane.delete();}
}

export function holeSolid(body:Shape3D,feature:HoleFeature,frame:PlaneFrame,validate:ValidateSolid):Shape3D {
  length(feature.diameter,'Diámetro del taladro');
  if(typeof feature.reversed!=='boolean')throw new Error('El sentido del taladro no es válido.');
  if(!Array.isArray(feature.positions)||feature.positions.length<1||feature.positions.length>128)throw new Error('Añade entre 1 y 128 posiciones para los taladros.');
  const ids=new Set<string>();
  for(const [index,position]of feature.positions.entries()){
    if(!position.id||ids.has(position.id))throw new Error('Cada posición necesita un identificador único.');ids.add(position.id);
    if(![position.x,position.y].every(value=>Number.isFinite(value)&&Math.abs(value)<=1_000_000))throw new Error('Las coordenadas de los taladros deben ser finitas y no superar 1.000.000 mm.');
    if(feature.positions.slice(0,index).some(other=>Math.hypot(other.x-position.x,other.y-position.y)<1e-6))throw new Error('Hay dos posiciones de taladro coincidentes. Mueve o elimina una de ellas.');
  }
  const radius=feature.diameter/2,direction=frame.normal.map(value=>value*(feature.reversed?1:-1))as Vec3;
  let shaftDepth=0,tipDepth=0,headDepth=0;
  const end=feature.endCondition,head=feature.head;
  if(end.kind==='blind'){
    length(end.depth,'Profundidad del taladro');
    if(!['shoulder','tip'].includes(end.depthReference))throw new Error('Selecciona si la profundidad se mide al hombro o a la punta.');
    if(end.tip.kind==='conical'){angle(end.tip.angle,'Ángulo de punta');tipDepth=radius/Math.tan(end.tip.angle*Math.PI/360);}
    else if(end.tip.kind!=='flat')throw new Error('Tipo de punta no compatible.');
    shaftDepth=end.depth-(end.depthReference==='tip'?tipDepth:0);
    if(shaftDepth<=1e-7)throw new Error('La profundidad hasta la punta no deja un tramo cilíndrico positivo por encima de la tolerancia geométrica. Aumenta la profundidad o el ángulo de punta.');
    if(shaftDepth+tipDepth>10_000_000)throw new Error('La punta del taladro es demasiado larga. Aumenta su ángulo.');
  }else if(end.kind!=='throughAll'&&end.kind!=='untilNext')throw new Error('Condición final de taladro no compatible.');
  if(head.kind!=='simple'){
    length(head.diameter,'Diámetro del rebaje');
    if(head.diameter<=feature.diameter+1e-7)throw new Error('El diámetro del rebaje debe ser mayor que el diámetro del taladro.');
    if(head.kind==='counterbore'){length(head.depth,'Profundidad del refrentado');headDepth=head.depth;}
    else if(head.kind==='countersink'){angle(head.angle,'Ángulo del avellanado');headDepth=(head.diameter-feature.diameter)/(2*Math.tan(head.angle*Math.PI/360));}
    else throw new Error('Tipo de cabeza de taladro no compatible.');
    if(headDepth>10_000_000)throw new Error('El rebaje resulta demasiado profundo. Revisa sus diámetros y ángulo.');
    if(end.kind==='blind'&&headDepth>shaftDepth+1e-7)throw new Error('El rebaje supera la profundidad cilíndrica del taladro ciego. Reduce el rebaje o aumenta la profundidad.');
  }
  const solids=body.solids;
  try{if(solids.length!==1)throw new Error('El asistente para taladro requiere un único cuerpo conectado.');}finally{solids.forEach(solid=>solid.delete());}
  const contactTolerance=1e-9;
  let result:Shape3D=body.clone(),handedOff=false;
  try{
    for(const [index,position]of feature.positions.entries()){
      const origin=framePoint(frame,position.x,position.y);
      const makePrism=(depth:number,start=0)=>cylinder(radius,moved(origin,direction,start),frame,direction,depth);
      let tool:Shape3D|null=null;
      try{
        tool=end.kind==='blind'?makePrism(shaftDepth):end.kind==='throughAll'
          ?throughAllTool(body,origin,direction,false,makePrism):untilNextTool(body,origin,direction,makePrism,true);
        if(end.kind==='untilNext'&&head.kind!=='simple'){
          // A curved/sloped exit has no single depth: test exact containment of the head's central bore.
          const core=makePrism(headDepth);let beyond:Shape3D|null=null;
          try{
            beyond=core.cut(tool);
            if(volume(beyond)>contactTolerance)throw new Error(`El rebaje del taladro ${index+1} supera la salida Hasta siguiente. Reduce el rebaje o cambia la condición final.`);
          }finally{beyond?.delete();core.delete();}
        }
        if(tipDepth>0){
          const tip=cone(radius,0,tipDepth,moved(origin,direction,shaftDepth),frame,direction);
          try{const merged=tool.fuse(tip);tool.delete();tool=merged;}finally{tip.delete();}
        }
        if(head.kind!=='simple'){
          const counter=head.kind==='counterbore'?cylinder(head.diameter/2,origin,frame,direction,headDepth)
            :cone(head.diameter/2,radius,headDepth,origin,frame,direction);
          try{const merged=tool.fuse(counter);tool.delete();tool=merged;}finally{counter.delete();}
        }
        validate(tool);
        // Validate every requested position against the original base, independent of list order and overlap.
        const contact=body.intersect(tool);
        try{if(volume(contact)<=contactTolerance)throw new Error(`El taladro ${index+1} no corta material del cuerpo. Revisa su posición, soporte, profundidad o sentido.`);}finally{contact.delete();}
        const candidate:Shape3D=result.cut(tool);
        try{validate(candidate);}catch(error){candidate.delete();throw error;}
        result.delete();result=candidate;
      }finally{tool?.delete();}
    }
    validate(result);
    // Measure the removed B-rep directly; subtracting two large masses can hide a small valid hole.
    const removed=body.cut(result);
    try{if(volume(removed)<=contactTolerance)throw new Error('Los taladros no retiran material del cuerpo.');}finally{removed.delete();}
    handedOff=true;return result;
  }finally{if(!handedOff)result.delete();}
}
