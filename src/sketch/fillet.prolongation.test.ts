import { describe, expect, it } from "vitest";
import { createDocument, parseDocument, serializeDocument } from "../model/document";
import { planSketchFillet, type FilletParameters, type FilletPlan } from "./fillet";
import { solveSketch } from "./solver";
import type { EntityProfile, SketchConstraint, SketchSelection } from "./types";

// Independent synthetic millimetre fixtures: offsets and similar triangles give
// x²+r²=(10+r)² for the line/circle pair, and h²+6²=(10+r)² for two circles.
// Expected contacts below are explicit Cartesian formulae, not planner helpers.
const pair: SketchSelection[] = [{ kind: "entity", id: "a" }, { kind: "entity", id: "b" }];
const parameters: FilletParameters = { radius: 2, cornerPolicy: "keep" };
const point = (id: string, x: number, y: number) => ({ id, x, y });
const fix = (pointId: string, x: number, y: number): SketchConstraint => ({ id: `fix-${pointId}`, type: "fix", pointId, x, y });
const xy = (profile: EntityProfile, id: string) => id === "origin" ? point("origin", 0, 0) : profile.points.find(p => p.id === id)!;
function arc(profile: EntityProfile, id: string) {
  const value = profile.entities.find(entity => entity.id === id);
  if (value?.type !== "arc") throw new Error("Expected arc");
  return value;
}
function shape(profile: EntityProfile, id: string) {
  const entity = arc(profile, id);
  return { ...entity, c: xy(profile, entity.center), s: xy(profile, entity.start), e: xy(profile, entity.end) };
}
function sweep(profile: EntityProfile, id: string) {
  const a = shape(profile, id), sign = a.clockwise ? -1 : 1;
  return ((sign * (Math.atan2(a.e.y-a.c.y, a.e.x-a.c.x)-Math.atan2(a.s.y-a.c.y, a.s.x-a.c.x)) % (2*Math.PI)) + 2*Math.PI) % (2*Math.PI);
}
function expectXY(actual: { x: number; y: number }, x: number, y: number) {
  expect(actual.x).toBeCloseTo(x, 6);
  expect(actual.y).toBeCloseTo(y, 6);
}
function plan(profile: EntityProfile, radius = 2, solutionIndex?: number, selection = pair): FilletPlan {
  const result = planSketchFillet(profile, selection, { ...parameters, radius, solutionIndex });
  expect(result.changed, result.message).toBe(true);
  return result;
}
function solved(profile: EntityProfile, context = "") {
  const result = solveSketch(profile);
  expect(result.status, `${context}: ${result.message} (${result.maxResidual})`).toBe("fullyDefined");
  expect(result.maxResidual).toBeLessThanOrEqual(1e-7);
  return result;
}
function reopened(profile: EntityProfile) {
  const document = createDocument("Synthetic prolonged fillet");
  document.features.push({ id: "s", type: "sketch", name: "Sketch", plane: "XY", offset: 0, suppressed: false, profile });
  const feature = parseDocument(serializeDocument(document)).features[0];
  if (feature.type !== "sketch" || feature.profile.kind !== "entities") throw new Error("Expected entity sketch");
  return feature.profile;
}
function setRadius(profile: EntityProfile, id: string, value: number) {
  const dimension = profile.constraints.find(c => c.type === "radius" && c.entityId === id && !c.driven);
  if (dimension?.type !== "radius") throw new Error("Expected driving radius");
  dimension.value = value;
}
function lineArc(reflect = false, reverse = false): EntityProfile {
  const sign = reflect ? -1 : 1;
  return {
    kind: "entities",
    points: [point("old-a", 10, 0), point("far-a", 30, 0), point("old-b", 5*Math.sqrt(3), sign*5), point("far-b", 0, sign*10)],
    entities: [
      { id: "a", type: "line", start: "old-a", end: "far-a", construction: false },
      { id: "b", type: "arc", center: "origin", start: reverse ? "far-b" : "old-b", end: reverse ? "old-b" : "far-b", clockwise: reflect !== reverse, construction: false },
    ],
    constraints: [
      fix("far-a", 30, 0),
      fix("far-b", 0, sign*10),
      fix("old-a", 10, 0),
      fix("old-b", 5*Math.sqrt(3), sign*5),
      { id: "line-horizontal", type: "horizontal", entityId: "a" },
      { id: "source-radius", type: "radius", entityId: "b", value: 10 },
      { id: "source-reading", type: "radius", entityId: "b", value: 999, driven: true, referenceRole: "annotation" },
    ],
  };
}
function twoArcs(): EntityProfile {
  const y = 10*Math.sin(75*Math.PI/180), x = 10*Math.cos(75*Math.PI/180);
  return {
    kind: "entities",
    points: [point("ca",-6,0),point("cb",6,0),point("old-a",-6+x,y),point("old-b",6-x,y),point("far-a",-16,0),point("far-b",16,0)],
    entities: [
      { id: "a",type:"arc",center:"ca",start:"old-a",end:"far-a",clockwise:false,construction:false },
      { id: "b",type:"arc",center:"cb",start:"old-b",end:"far-b",clockwise:true,construction:false },
    ],
    constraints: [fix("ca",-6,0),fix("cb",6,0),
      ...["a","b"].flatMap((id): SketchConstraint[] => [
        {id:`radius-${id}`,type:"radius",entityId:id,value:10},
        {id:`far-y-${id}`,type:"distanceY",a:"origin",b:`far-${id}`,value:0},
        fix(`old-${id}`,id==="a"?-6+x:6-x,y),
      ]),
    ],
  };
}

describe("automatic finite arc prolongation", () => {
  it.each([
    [false,false,false,1],[false,false,true,1],[true,false,false,7],[true,false,true,3],
    [false,true,false,19],[false,true,true,37],[true,true,false,25],[true,true,true,39],
  ] as const)("extends the chosen arc endpoint with reflection=%s reverse-storage=%s reverse-pair=%s", (reflect, reverse, reversePair, key) => {
    const input = lineArc(reflect, reverse), snapshot = structuredClone(input);
    solved(input);
    const result = plan(input, 2, undefined, reversePair ? [...pair].reverse() : pair), f = shape(result.profile, result.filletEntityId!);
    expect(result.selectedSolutionIndex).toBe(key);
    const sign = reflect ? -1 : 1, lineContact = {x:2*Math.sqrt(35),y:0}, arcContact = {x:5*Math.sqrt(35)/3,y:sign*5/3};
    expectXY(f.c,2*Math.sqrt(35),sign*2);
    expectXY(f.s,reversePair ? arcContact.x : lineContact.x,reversePair ? arcContact.y : lineContact.y);
    expectXY(f.e,reversePair ? lineContact.x : arcContact.x,reversePair ? lineContact.y : arcContact.y);
    expect(f.clockwise).toBe(reflect === reversePair);
    const source = arc(result.profile,"b");
    expect(source.center).toBe("origin");
    expect(source[reverse ? "start" : "end"]).toBe("far-b");
    expect(source[reverse ? "end" : "start"]).toBe(reversePair ? f.start : f.end);
    expect(sweep(result.profile,"b")).toBeCloseTo(Math.PI/2-Math.asin(1/6),8);
    expect(result.sourceEdits.find(e=>e.entityId==="b")).toMatchObject({endpoint:reverse?"end":"start",movement:"extend"});
    expect(result.sourceEdits.find(e=>e.entityId==="b")!.amount).toBeCloseTo(10*(Math.PI/6-Math.asin(1/6)),7);
    expect(result.sourceEdits.find(e=>e.entityId==="a")).toMatchObject({endpoint:"start",movement:"trim"});
    expect(result.sourceEdits.find(e=>e.entityId==="a")!.amount).toBeCloseTo(2*Math.sqrt(35)-10,7);
    expect(result.candidates.find(c=>c.index===result.selectedSolutionIndex)!.label).toContain("prolonga");
    expect(result.profile.constraints).toContainEqual(input.constraints.find(c=>c.id==="source-radius"));
    expect(result.profile.constraints).toContainEqual(input.constraints.find(c=>c.id==="source-reading"));
    const committed = solved(result.profile), restored = solved(reopened(committed.profile));
    expect(restored.drivenValues["source-reading"]).toBeCloseTo(10,6);
    expect(restored.profile.entities).toEqual(committed.profile.entities);
    expect(input).toEqual(snapshot);
  });

  it("keeps one fixed branch through R2→R3→R10 extension-to-trimming, with R3 editing after reopening", () => {
    const input=lineArc(),first=plan(input),key=first.selectedSolutionIndex!;
    for(const [radius,movement] of [[3,"extend"],[10,"none"],[12,"trim"]] as const){
      const result=plan(input,radius,key),f=shape(result.profile,result.filletEntityId!);
      const x=Math.sqrt(100+20*radius);
      expect(result.selectedSolutionIndex).toBe(key);
      expectXY(f.c,x,radius);
      expectXY(f.e,10*x/(10+radius),10*radius/(10+radius));
      expect(result.sourceEdits.find(e=>e.entityId==="b")!.movement).toBe(movement);
      solved(result.profile,`direct R${radius}`);
    }
    let current=solved(first.profile).profile;
    for(const radius of [3]){
      const edited=reopened(current);setRadius(edited,first.filletEntityId!,radius);
      current=solved(edited,`edited R${radius}`).profile;
      const f=shape(current,first.filletEntityId!);
      expectXY(f.c,Math.sqrt(100+20*radius),radius);
      expect(sweep(current,"b")).toBeCloseTo(Math.PI/2-Math.asin(radius/(10+radius)),6);
    }
    const rejected=planSketchFillet(input,pair,{...parameters,radius:40,solutionIndex:key});
    expect(rejected.changed).toBe(false);
    expect(rejected.profile).toBe(input);
    expect(rejected.sourceEdits).toEqual([]);
    expect(rejected.selectedSolutionIndex).toBeNull();
  });

  it("retains the edited input when a large R3→R10 solver step cannot meet the existing precision", () => {
    const result=plan(lineArc()),edited=reopened(solved(result.profile).profile);
    setRadius(edited,result.filletEntityId!,3);
    const r3=solved(edited).profile,target=reopened(r3);
    setRadius(target,result.filletEntityId!,10);
    const snapshot=structuredClone(target),failed=solveSketch(target);
    expect(failed.status).toBe("notConverged");
    expect(failed.maxResidual).toBeGreaterThan(1e-7);
    expect(failed.profile).toEqual(snapshot);
    expect(target).toEqual(snapshot);
    expect(shape(failed.profile,result.filletEntityId!).c).toEqual(shape(r3,result.filletEntityId!).c);
  });

  it("allows the retained source to cross π without changing branch or direction", () => {
    const input=lineArc();input.constraints=[];
    Object.assign(xy(input,"far-b"),{x:10*Math.cos(200*Math.PI/180),y:10*Math.sin(200*Math.PI/180)});
    const first=plan(input),next=plan(input,10,first.selectedSolutionIndex!);
    expect(sweep(first.profile,"b")).toBeCloseTo(200*Math.PI/180-Math.asin(1/6),8);
    expect(sweep(first.profile,"b")).toBeGreaterThan(Math.PI);
    expect(first.candidates.find(c=>c.index===first.selectedSolutionIndex)!.label).toContain("arco fuente mayor");
    expect(sweep(next.profile,"b")).toBeCloseTo(170*Math.PI/180,8);
    expect(arc(first.profile,"b").clockwise).toBe(false);
    expect(arc(next.profile,"b").clockwise).toBe(false);
  });

  it.each([0,-1e-4,1e-8])("rejects the explicit source branch at or beyond its retained endpoint (angle delta %s)", delta => {
    const input=lineArc();input.constraints=[];
    const key=plan(input).selectedSolutionIndex!;
    const angle=Math.asin(1/6)+delta;
    Object.assign(xy(input,"far-b"),{x:10*Math.cos(angle),y:10*Math.sin(angle)});
    const snapshot=structuredClone(input),rejected=planSketchFillet(input,pair,{...parameters,solutionIndex:key});
    expect(rejected.changed).toBe(false);
    expect(rejected.profile).toBe(input);
    expect(rejected.sourceEdits).toEqual([]);
    expect(input).toEqual(snapshot);
  });

  it("enumerates each physical two-arc branch once despite two virtual support-corner witnesses", () => {
    const input=twoArcs(),snapshot=structuredClone(input),first=plan(input),signatures=new Set<string>();
    const keys=first.candidates.map(candidate=>candidate.index);
    expect(new Set(keys).size).toBe(keys.length);
    for(const candidate of first.candidates){
      const result=plan(input,2,candidate.index),f=shape(result.profile,result.filletEntityId!);
      const signature=JSON.stringify([f.c.x,f.c.y,f.s.x,f.s.y,f.e.x,f.e.y,f.clockwise,
        ...result.sourceEdits.map(e=>[e.entityId,e.endpoint])]);
      expect(signatures.has(signature)).toBe(false);signatures.add(signature);
    }
    const upper=plan(input,2,0),f=shape(upper.profile,upper.filletEntityId!);
    expectXY(f.c,0,6*Math.sqrt(3));expectXY(f.s,-1,5*Math.sqrt(3));expectXY(f.e,1,5*Math.sqrt(3));
    expect(f.clockwise).toBe(false);
    expect(sweep(upper.profile,"a")).toBeCloseTo(2*Math.PI/3,8);
    expect(sweep(upper.profile,"b")).toBeCloseTo(2*Math.PI/3,8);
    expect(upper.sourceEdits.map(e=>e.movement)).toEqual(["extend","extend"]);
    for(const edit of upper.sourceEdits)expect(edit.amount).toBeCloseTo(10*Math.PI/12,7);
    for(const id of ["a","b"]){
      expect(arc(upper.profile,id).end).toBe(`far-${id}`);
      expect(arc(upper.profile,id).center).toBe(`c${id}`);
      expect(upper.profile.constraints).toContainEqual(input.constraints.find(c=>c.id===`radius-${id}`));
    }
    const committed=solved(upper.profile),edited=reopened(committed.profile);setRadius(edited,upper.filletEntityId!,3);
    const result=solved(edited),next=shape(result.profile,upper.filletEntityId!);
    expectXY(next.c,0,Math.sqrt(133));expectXY(next.s,-18/13,10*Math.sqrt(133)/13);expectXY(next.e,18/13,10*Math.sqrt(133)/13);
    expect(result.profile.constraints.filter(c=>c.type==="tangent").map(c=>c.type==="tangent"&&c.branch)).toEqual(["external","external"]);
    expect(input).toEqual(snapshot);
  });

  it("reverses two-arc traversal with A/B selection while preserving the prolonged supports", () => {
    const input=twoArcs(),result=plan(input,2,undefined,[...pair].reverse()),f=shape(result.profile,result.filletEntityId!);
    expectXY(f.c,0,6*Math.sqrt(3));expectXY(f.s,1,5*Math.sqrt(3));expectXY(f.e,-1,5*Math.sqrt(3));
    expect(f.clockwise).toBe(true);
    expect(result.sourceEdits.map(e=>e.entityId)).toEqual(["b","a"]);
    expect(solved(result.profile).degreesOfFreedom).toBe(0);
  });

  it("requires an explicit branch when symmetric minor solutions have equal total source travel", () => {
    const input: EntityProfile = {kind:"entities",points:[point("left",-30,0),point("right",30,0),point("top",0,10),point("bottom",0,-10)],entities:[
      {id:"a",type:"line",start:"left",end:"right",construction:false},
      {id:"b",type:"arc",center:"origin",start:"top",end:"bottom",clockwise:false,construction:false},
    ],constraints:[]};
    const snapshot=structuredClone(input),ambiguous=planSketchFillet(input,pair,parameters);
    expect(ambiguous.changed).toBe(false);
    expect(ambiguous.message).toContain("mismo desplazamiento");
    expect(ambiguous.candidates.length).toBeGreaterThan(1);
    expect(ambiguous.profile).toBe(input);
    expect(ambiguous.sourceEdits).toEqual([]);
    for(const candidate of ambiguous.candidates)plan(input,2,candidate.index);
    expect(input).toEqual(snapshot);
  });

  it.each(["keep","delete"] as const)("cleans exclusive separated-source endpoints for %s while preserving support/far anchors and metadata", cornerPolicy => {
    const input=lineArc();
    for(const p of input.points){p.x+=50;p.y-=10;}
    for(const constraint of input.constraints)if(constraint.type==="fix"){constraint.x+=50;constraint.y-=10;}
    input.points.push(point("support",50,-10));arc(input,"b").center="support";
    input.constraints.push(fix("support",50,-10),
      {id:"source-length",type:"length",entityId:"a",value:20},
      {id:"retained-reading",type:"length",entityId:"a",value:999,driven:true,referenceRole:"annotation"});
    const snapshot=structuredClone(input),result=planSketchFillet(input,pair,{...parameters,cornerPolicy});
    expect(result.changed,result.message).toBe(true);
    expect(result.deletedConstraintIds.sort()).toEqual(["fix-old-a","fix-old-b","source-length"]);
    expect(result.convertedConstraintIds).toEqual([]);
    for(const id of ["old-a","old-b"])expect(result.profile.points.some(p=>p.id===id)).toBe(false);
    for(const id of ["support","far-a","far-b"]){
      expect(xy(result.profile,id)).toEqual(xy(input,id));
      expect(result.profile.constraints).toContainEqual(input.constraints.find(c=>c.id===`fix-${id}`));
    }
    expect(result.profile.constraints.some(c=>c.type==="pointOnLine"||c.type==="pointOnCircle")).toBe(false);
    expect(arc(result.profile,"b")).toMatchObject({center:"support",end:"far-b"});
    const committed=solved(result.profile),restored=solved(reopened(committed.profile));
    expect(restored.drivenValues["retained-reading"]).toBeCloseTo(30-2*Math.sqrt(35),6);
    expect(restored.drivenValues["source-reading"]).toBeCloseTo(10,6);
    expect(input).toEqual(snapshot);
  });

  it.each([[.1,37,300,-500],[10,137,-100,200]])("keeps the automatic physical branch under scale %s and rotation %s", (scale,degrees,tx,ty) => {
    const input=lineArc();input.constraints=[];
    input.points.push(point("support",0,0));arc(input,"b").center="support";
    const angle=degrees*Math.PI/180,transform=(x:number,y:number)=>({x:tx+scale*(x*Math.cos(angle)-y*Math.sin(angle)),y:ty+scale*(x*Math.sin(angle)+y*Math.cos(angle))});
    for(const p of input.points)Object.assign(p,transform(p.x,p.y));
    const result=plan(input,2*scale),f=shape(result.profile,result.filletEntityId!),expected=transform(2*Math.sqrt(35),2);
    expect(result.selectedSolutionIndex).toBe(1);
    expectXY(f.c,expected.x,expected.y);
    expect(result.sourceEdits.find(e=>e.entityId==="b")!.amount).toBeCloseTo(scale*10*(Math.PI/6-Math.asin(1/6)),6);
    expect(result.sourceEdits.find(e=>e.entityId==="a")!.amount).toBeCloseTo(scale*(2*Math.sqrt(35)-10),6);
  });

  it.each(["keep","delete"] as const)("protects an old endpoint and its fix when external geometry still uses it (%s)", cornerPolicy => {
    const input=lineArc();input.points.push(point("external-far",-20,20));
    input.entities.push({id:"neighbor",type:"line",start:"old-b",end:"external-far",construction:true});
    input.constraints.push(fix("external-far",-20,20));
    const result=planSketchFillet(input,pair,{...parameters,cornerPolicy});
    expect(result.changed,result.message).toBe(true);
    expect(result.profile.constraints).toContainEqual(input.constraints.find(c=>c.id==="fix-old-b"));
    expect(xy(result.profile,"old-b")).toEqual(xy(input,"old-b"));
    expect(result.profile.entities.find(e=>e.id==="neighbor")).toEqual(input.entities.find(e=>e.id==="neighbor"));
    expect(result.deletedConstraintIds).toEqual(["fix-old-a"]);
    expect(solved(result.profile).degreesOfFreedom).toBe(0);
  });

  it.each([
    [false,false,false],[false,false,true],[true,false,false],[true,false,true],
    [false,true,false],[false,true,true],[true,true,false],[true,true,true],
  ])("splits disconnected radius families at the retained arc endpoint (reflect=%s reverse=%s pair=%s)", (reflect,reverse,reversePair) => {
    const sign=reflect?-1:1,farAngle=-130*Math.PI/180;
    const input:EntityProfile={kind:"entities",points:[point("far-a",40,0),point("support",0,sign*10),point("old-b",0,sign*5),point("far-b",5*Math.cos(farAngle),sign*(10+5*Math.sin(farAngle)))],entities:[
      {id:"a",type:"line",start:"origin",end:"far-a",construction:false},
      {id:"b",type:"arc",center:"support",start:reverse?"far-b":"old-b",end:reverse?"old-b":"far-b",clockwise:reflect===reverse,construction:false},
    ],constraints:[]};
    const selection=reversePair?[...pair].reverse():pair,snapshot=structuredClone(input);
    const above=plan(input,27,undefined,selection),key=above.selectedSolutionIndex!;
    const jump=planSketchFillet(input,selection,{...parameters,radius:26,solutionIndex:key});
    expect(jump.changed).toBe(false);
    expect(jump.message).toContain("rama seleccionada ya no existe");
    expect(jump.profile).toBe(input);
    expect(jump.sourceEdits).toEqual([]);
    expect(sweep(above.profile,"b")*180/Math.PI).toBeCloseTo(.599431246262,8);
    const freshKey=key-(reversePair?72:144),below=plan(input,26,freshKey,selection);
    expect(planSketchFillet(input,selection,{...parameters,radius:27,solutionIndex:freshKey}).changed).toBe(false);
    expect(sweep(below.profile,"b")*180/Math.PI).toBeCloseTo(359.632406455814,8);
    const f=shape(below.profile,below.filletEntityId!);
    expectXY(f.c,Math.sqrt(185),sign*26);
    expect(arc(below.profile,"b")[reverse?"start":"end"]).toBe("far-b");
    expect(plan(input,28,key,selection).selectedSolutionIndex).toBe(key);
    const critical=(10+5*Math.sin(farAngle))/(1+Math.sin(farAngle));
    expect(critical).toBeCloseTo(26.371580426032576,8);
    const collapsed=planSketchFillet(input,selection,{...parameters,radius:critical,solutionIndex:key});
    expect(collapsed.changed).toBe(false);
    expect(collapsed.profile).toBe(input);
    expect(input).toEqual(snapshot);
  });

  it("does not split the other offset-intersection side when only the positive center reaches the far point", () => {
    const angle=-130*Math.PI/180;
    const input:EntityProfile={kind:"entities",points:[point("far-a",40,0),point("support",0,10),point("old-b",0,5),point("far-b",5*Math.cos(angle),10+5*Math.sin(angle))],entities:[
      {id:"a",type:"line",start:"origin",end:"far-a",construction:false},
      {id:"b",type:"arc",center:"support",start:"old-b",end:"far-b",clockwise:true,construction:false},
    ],constraints:[]};
    const before=plan(input,26,4),after=plan(input,27,4);
    expect(before.selectedSolutionIndex).toBe(4);expect(after.selectedSolutionIndex).toBe(4);
    expect(shape(before.profile,before.filletEntityId!).c.x).toBeLessThan(0);
    expect(shape(after.profile,after.filletEntityId!).c.x).toBeLessThan(0);
  });

  it("handles a tangent birth as a retained-end boundary for both coalescing offset-intersection slots", () => {
    const input:EntityProfile={kind:"entities",points:[point("far-a",40,0),point("support",0,10),point("old-b",0,5),point("far-b",0,15)],entities:[
      {id:"a",type:"line",start:"origin",end:"far-a",construction:false},
      {id:"b",type:"arc",center:"support",start:"old-b",end:"far-b",clockwise:true,construction:false},
    ],constraints:[]};
    for(const key of [148,149]){
      const result=plan(input,8,key);expect(result.selectedSolutionIndex).toBe(key);
      expect(planSketchFillet(input,pair,{...parameters,radius:7.5,solutionIndex:key}).changed).toBe(false);
    }
    for(const obsoleteKey of [4,5])expect(planSketchFillet(input,pair,{...parameters,radius:8,solutionIndex:obsoleteKey}).changed).toBe(false);
  });

  it("retains a major radius family when the analytic retained-end equation has no finite root", () => {
    const angle=-50*Math.PI/180;
    const input:EntityProfile={kind:"entities",points:[point("far-a",40,0),point("support",0,10),point("old-b",5*Math.cos(angle),10+5*Math.sin(angle)),point("far-b",0,5)],entities:[
      {id:"a",type:"line",start:"origin",end:"far-a",construction:false},
      {id:"b",type:"arc",center:"support",start:"old-b",end:"far-b",clockwise:true,construction:false},
    ],constraints:[]};
    for(const radius of [26,27]){
      const result=plan(input,radius,5);
      expect(result.selectedSolutionIndex).toBe(5);
      expect(sweep(result.profile,"b")).toBeGreaterThan(Math.PI);
    }
  });

  it.each([false,true])("splits the analytic two-arc family without forbidding fresh major intervals (both sources %s)", both => {
    const oldAngle=75*Math.PI/180,farAngle=50*Math.PI/180;
    const farB=both?point("far-b",30-10*Math.cos(farAngle),10*Math.sin(farAngle)):point("far-b",40,0);
    const input:EntityProfile={kind:"entities",points:[point("ca",0,0),point("cb",30,0),point("old-a",10*Math.cos(oldAngle),10*Math.sin(oldAngle)),point("far-a",10*Math.cos(farAngle),10*Math.sin(farAngle)),point("old-b",30-10*Math.cos(oldAngle),10*Math.sin(oldAngle)),farB],entities:[
      {id:"a",type:"arc",center:"ca",start:"old-a",end:"far-a",clockwise:false,construction:false},
      {id:"b",type:"arc",center:"cb",start:"old-b",end:"far-b",clockwise:true,construction:false},
    ],constraints:[]};
    const before=plan(input,10,0);
    expect(sweep(before.profile,"a")).toBeLessThan(Math.PI);
    expect(planSketchFillet(input,pair,{...parameters,radius:20,solutionIndex:0}).changed).toBe(false);
    const key=both?216:72,after=plan(input,20,key),f=shape(after.profile,after.filletEntityId!);
    expectXY(f.c,15,15*Math.sqrt(3));
    expectXY(f.s,5,5*Math.sqrt(3));expectXY(f.e,25,5*Math.sqrt(3));
    expect(sweep(after.profile,"a")*180/Math.PI).toBeCloseTo(350,8);
    if(both)expect(sweep(after.profile,"b")*180/Math.PI).toBeCloseTo(350,8);
    const critical=15/Math.cos(farAngle)-10;
    expect(planSketchFillet(input,pair,{...parameters,radius:critical,solutionIndex:key}).changed).toBe(false);
  });

  it.each([[.1,10000,-20000],[1000,500000,-800000]])("keeps radius-family separation at scale %s with translated supports", (scale,tx,ty) => {
    const angle=-130*Math.PI/180,p=(id:string,x:number,y:number)=>point(id,tx+scale*x,ty+scale*y);
    const input:EntityProfile={kind:"entities",points:[p("old-a",0,0),p("far-a",40,0),p("support",0,10),p("old-b",0,5),p("far-b",5*Math.cos(angle),10+5*Math.sin(angle))],entities:[
      {id:"a",type:"line",start:"old-a",end:"far-a",construction:false},
      {id:"b",type:"arc",center:"support",start:"old-b",end:"far-b",clockwise:true,construction:false},
    ],constraints:[]};
    const before=plan(input,27*scale),key=before.selectedSolutionIndex!;
    expect(key).toBe(149);
    expect(planSketchFillet(input,pair,{...parameters,radius:26*scale,solutionIndex:key}).changed).toBe(false);
    const fresh=plan(input,26*scale,5),f=shape(fresh.profile,fresh.filletEntityId!);
    expectXY(f.c,tx+scale*Math.sqrt(185),ty+scale*26);
    expect(sweep(fresh.profile,"b")*180/Math.PI).toBeCloseTo(359.632406455814,6);
  });
});
