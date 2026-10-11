import { describe, expect, it } from "vitest";
import { arcStepPreservesWinding, type ArcRadials } from "./arc-step";
import { planSketchFillet } from "./fillet";
import { solveSketch } from "./solver";
import type { EntityProfile, SketchConstraint } from "./types";
import { createDocument, parseDocument, serializeDocument } from "../model/document";

const radials = (start: [number, number], end: [number, number]): ArcRadials => ({ start, end });

describe("continuous arc Newton step", () => {
  it("rejects two hidden 0/2π crossings even when both endpoint sectors agree", () => {
    // cross((1,t),(1-t,3/16)) = (t-1/4)(t-3/4).
    const before = radials([1,0], [1,3/16]);
    const after = radials([1,1], [0,3/16]);
    expect(arcStepPreservesWinding(before, after, .01)).toBe(false);
  });

  it("rejects a double root touching the zero sweep without changing cross sign", () => {
    // cross((1,t),(1-t,1/4)) = (t-1/2)², dot at1/2 is positive.
    expect(arcStepPreservesWinding(radials([1,0],[1,.25]), radials([1,1],[0,.25]), .01)).toBe(false);
  });

  it("rejects a seam exactly at the trial endpoint", () => {
    expect(arcStepPreservesWinding(radials([1,0],[0,1]), radials([1,0],[1,0]), .01)).toBe(false);
  });

  it("allows a legitimate minor to major transition through π", () => {
    expect(arcStepPreservesWinding(
      radials([1,0],[-Math.sqrt(3)/2,.5]),
      radials([1,0],[-Math.sqrt(3)/2,-.5]), .01,
    )).toBe(true);
    // Both quadratic roots can also be antipodal, rather than seam crossings.
    expect(arcStepPreservesWinding(radials([1,0],[-1,-3/16]), radials([1,1],[0,-3/16]), .01)).toBe(true);
  });

  it("allows both radials to rotate across atan2's branch without closing their relative sweep", () => {
    const vector = (degrees: number): [number, number] => [
      Math.cos(degrees * Math.PI / 180), Math.sin(degrees * Math.PI / 180),
    ];
    expect(arcStepPreservesWinding(
      radials(vector(170), vector(190)), radials(vector(190), vector(210)), .01,
    )).toBe(true);
  });

  it("handles identically collinear radials without losing the distinction between zero and π", () => {
    expect(arcStepPreservesWinding(radials([1,0],[-1,0]), radials([2,0],[-3,0]), .01)).toBe(true);
    expect(arcStepPreservesWinding(radials([1,0],[2,0]), radials([2,0],[3,0]), .01)).toBe(false);
  });

  it.each(["start", "end"] as const)("checks the interior radial minimum for %s, even with valid endpoint radii", endpoint => {
    const before = radials([-1,.001],[0,-1]), after = radials([1,.001],[0,-1]);
    if (endpoint === "end") {
      [before.start,before.end] = [before.end,before.start];
      [after.start,after.end] = [after.end,after.start];
    }
    expect(arcStepPreservesWinding(before, after, .01)).toBe(false);
    const moving = endpoint === "start" ? "start" : "end";
    const safeBefore = { ...before, [moving]: [-1,.02] } as ArcRadials;
    const safeAfter = { ...after, [moving]: [1,.02] } as ArcRadials;
    expect(arcStepPreservesWinding(safeBefore, safeAfter, .01)).toBe(true);
  });

  it.each([1e-5, 1, 1e5])("normalizes the polynomial and radial minimum at scale %s", scale => {
    const multiply = (value: ArcRadials): ArcRadials => ({
      start: value.start.map(x=>x*scale) as [number,number],
      end: value.end.map(x=>x*scale) as [number,number],
    });
    expect(arcStepPreservesWinding(multiply(radials([1,0],[1,3/16])), multiply(radials([1,1],[0,3/16])), .01*scale)).toBe(false);
    expect(arcStepPreservesWinding(multiply(radials([1,0],[-1,.2])), multiply(radials([1,0],[-1,-.2])), .01*scale)).toBe(true);
  });
});

const fix = (pointId: string, x: number, y: number): SketchConstraint => ({ id:`fix-${pointId}`,type:"fix",pointId,x,y });
function arcCorner(scale: number, offset: [number,number]): EntityProfile {
  const point = (id: string, x: number, y: number) => ({id,x:offset[0]+x*scale,y:offset[1]+y*scale});
  const theta = 20*Math.PI/180;
  const points = [point("center",0,0),point("corner",10,0),point("far-a",30,0),point("far-b",10*Math.cos(theta),10*Math.sin(theta))];
  return { kind:"entities",points,entities:[
    {id:"a",type:"line",start:"corner",end:"far-a",construction:false},
    {id:"b",type:"arc",center:"center",start:"corner",end:"far-b",clockwise:false,construction:false},
  ],constraints:[...points.map(p=>fix(p.id,p.x,p.y)),{id:"h",type:"horizontal",entityId:"a"}]};
}
function reopen(profile: EntityProfile): EntityProfile {
  const document = createDocument("Arc continuity");
  document.features.push({id:"s",type:"sketch",name:"Sketch",plane:"XY",offset:0,suppressed:false,profile});
  const feature = parseDocument(serializeDocument(document)).features.find(f=>f.id==="s");
  if(feature?.type!=="sketch"||feature.profile.kind!=="entities") throw new Error("Expected saved entity sketch");
  return feature.profile;
}
function editRadius(profile: EntityProfile, entityId: string, radius: number) {
  const constraint = profile.constraints.find(c=>c.type==="radius"&&c.entityId===entityId);
  if(constraint?.type!=="radius") throw new Error("Expected fillet radius");
  constraint.value=radius;
}
function sweep(profile: EntityProfile, entityId: string) {
  const arc=profile.entities.find(e=>e.id===entityId);
  if(arc?.type!=="arc")throw new Error("Expected arc");
  const xy=(id:string)=>profile.points.find(p=>p.id===id)!;
  const c=xy(arc.center),a=xy(arc.start),b=xy(arc.end),sign=arc.clockwise?-1:1;
  return ((sign*(Math.atan2(b.y-c.y,b.x-c.x)-Math.atan2(a.y-c.y,a.x-c.x))%(2*Math.PI)+2*Math.PI)%(2*Math.PI))*180/Math.PI;
}

describe("solver arc continuity during dimension edits", () => {
  it.each([
    [.1,[0,0]], [1,[50000,-80000]], [1000,[-200000,300000]],
  ] as [number,[number,number]][])("rejects R2→R10 after reopening at scale %s and offset %s, keeping input geometry", (scale,offset) => {
    const initial=solveSketch(arcCorner(scale,offset));
    expect(initial.status,initial.message).toBe("fullyDefined");
    const plan=planSketchFillet(initial.profile,[{kind:"entity",id:"a"},{kind:"entity",id:"b"}],{radius:2*scale,cornerPolicy:"keep"});
    expect(plan.changed,plan.message).toBe(true);
    const committed=solveSketch(plan.profile);
    expect(committed.status,committed.message).toBe("fullyDefined");
    expect(sweep(committed.profile,"b")).toBeCloseTo(20-Math.asin(1/6)*180/Math.PI,5);
    const edited=reopen(committed.profile);
    editRadius(edited,plan.filletEntityId!,10*scale);
    const snapshot=structuredClone(edited), failed=solveSketch(edited);
    expect(["invalid","inconsistent","notConverged"]).toContain(failed.status);
    expect(failed.profile).toEqual(snapshot);
    expect(edited).toEqual(snapshot);
    expect(sweep(failed.profile,"b")).toBeCloseTo(sweep(committed.profile,"b"),8);
    // Metadata preserves the requested edit; fallback coordinates do not wrap.
    expect(failed.profile.constraints).toContainEqual(expect.objectContaining({type:"radius",entityId:plan.filletEntityId,value:10*scale}));
    expect(planSketchFillet(initial.profile,[{kind:"entity",id:"a"},{kind:"entity",id:"b"}],{radius:10*scale,cornerPolicy:"keep",solutionIndex:plan.selectedSolutionIndex!}).changed).toBe(false);

    const valid=reopen(committed.profile);
    editRadius(valid,plan.filletEntityId!,3*scale);
    const solved=solveSketch(valid);
    expect(solved.status,`R3 at scale${scale}: ${solved.message}`).toBe("fullyDefined");
    expect(solved.maxResidual).toBeLessThanOrEqual(1e-7);
    expect(sweep(solved.profile,"b")).toBeCloseTo(20-Math.asin(3/13)*180/Math.PI,5);
    const restored=solveSketch(reopen(solved.profile));
    expect(restored.status,restored.message).toBe("fullyDefined");
    expect(restored.profile.entities).toEqual(solved.profile.entities);
    expect(sweep(restored.profile,"b")).toBeCloseTo(sweep(solved.profile,"b"),8);
  });

  it("keeps the edited input when a near-collapsed small arc cannot be ranked reliably", () => {
    const initial = solveSketch(arcCorner(.1, [0, 0]));
    expect(initial.status, initial.message).toBe("fullyDefined");
    const plan = planSketchFillet(initial.profile, [{ kind: "entity", id: "a" }, { kind: "entity", id: "b" }], {
      radius: .2, cornerPolicy: "keep",
    });
    expect(plan.changed, plan.message).toBe(true);
    const committed = solveSketch(plan.profile);
    expect(committed.status, committed.message).toBe("fullyDefined");
    const edited = reopen(committed.profile);
    // This geometrically valid edit leaves only a 0.5288° source arc. The
    // existing rank check rejects it with or without the continuity guard.
    editRadius(edited, plan.filletEntityId!, .5);
    const snapshot = structuredClone(edited), failed = solveSketch(edited);
    expect(failed.status).toBe("notConverged");
    expect(failed.maxResidual).toBeLessThanOrEqual(1e-7);
    expect(failed.profile).toEqual(snapshot);
    expect(edited).toEqual(snapshot);
    expect(sweep(failed.profile, "b")).toBeCloseTo(sweep(committed.profile, "b"), 8);
  });

  it.each([false,true])("allows a saved arc to pass through π in direction clockwise=%s", clockwise => {
    const angle=170*Math.PI/180, next=190*Math.PI/180;
    const input:EntityProfile={kind:"entities",points:[{id:"center",x:120,y:-30},{id:"start",x:121,y:-30},{id:"end",x:120+Math.cos(angle),y:-30+Math.sin(angle)}],entities:[{id:"arc",type:"arc",center:"center",start:"start",end:"end",clockwise,construction:false}],constraints:[]};
    input.constraints=input.points.map(p=>fix(p.id,p.x,p.y));
    const initial=solveSketch(input);
    expect(initial.status,initial.message).toBe("fullyDefined");
    const edited=reopen(initial.profile), target=edited.constraints.find(c=>c.id==="fix-end");
    if(target?.type!=="fix")throw new Error("Expected endpoint fix");
    target.x=120+Math.cos(next);target.y=-30+Math.sin(next);
    const solved=solveSketch(edited);
    expect(solved.status,solved.message).toBe("fullyDefined");
    expect(sweep(solved.profile,"arc")).toBeCloseTo(clockwise?170:190,5);
    expect(solveSketch(reopen(solved.profile)).status).toBe("fullyDefined");
  });

  it("still rejects a fillet radius exceeding a fixed line side without changing the edited input", () => {
    const input:EntityProfile={kind:"entities",points:[{id:"far-a",x:40,y:0},{id:"far-b",x:0,y:30}],entities:[{id:"a",type:"line",start:"origin",end:"far-a",construction:false},{id:"b",type:"line",start:"origin",end:"far-b",construction:false}],constraints:[fix("far-a",40,0),fix("far-b",0,30),{id:"h",type:"horizontal",entityId:"a"},{id:"v",type:"vertical",entityId:"b"}]};
    const plan=planSketchFillet(input,[{kind:"point",id:"origin"}],{radius:2,cornerPolicy:"keep"});
    expect(plan.changed,plan.message).toBe(true);
    const first=solveSketch(plan.profile);
    expect(first.status,first.message).toBe("fullyDefined");
    const edited=reopen(first.profile);
    editRadius(edited,plan.filletEntityId!,31);
    const snapshot=structuredClone(edited), failed=solveSketch(edited);
    expect(["invalid","inconsistent","notConverged"]).toContain(failed.status);
    expect(failed.profile).toEqual(snapshot);
    expect(edited).toEqual(snapshot);
  });
});
