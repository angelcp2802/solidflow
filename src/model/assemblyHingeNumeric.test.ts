import  {
  expect,it
} from 'vitest'
import  {
  evaluateRigidMates
} from './assemblyMateEquations'
import  {
  projectRigidMateTarget
} from './assemblyProjection'
import  {
  solveRigidMates
} from './assemblySolver'
import  {
  copyRigidHingeConstraint
} from './assemblyHingeNumeric'
import  {
  identityRigidPose,composeRigidPoses,type RigidPose
} from './rigidPose'
import  {
  rotationExp,retractRigidBodyPose
} from './assemblyKinematics'
import type  {
  RigidHingeConstraint,RigidMateEndpoint,RigidMateProblem
} from './assemblySolveTypes'
const I=identityRigidPose // Original exact Cartesian axes and planes. No saved or native proof is supplied.
function hinge():RigidHingeConstraint {
  const axis=(bodyId:string|null):RigidMateEndpoint=>( {
    bodyId,frame:I(),support: {
      kind:'line',point:[0,0,0],axis:[0,0,1],tolerance:0
    }
  })
  const plane=(bodyId:string|null):RigidMateEndpoint=>( {
    bodyId,frame:I(),support: {
      kind:'plane',point:[0,0,2],normal:[0,0,1],xDirection:[1,0,0],tolerance:0
    }
  })
  return  {
    id:'original',type:'hinge',axis:[axis('a'),axis('b')],axial:[plane('a'),plane('b')],alignment:'aligned'
  }
}
function problem(c=hinge(),both=false):RigidMateProblem {
  return  {
    bodies:[ {
      id:'a',pose:I(),fixed:!both
    }, {
      id:'b',pose:I(),fixed:false
    }
    ],constraints:[c],origin:[0,0,0],lengthScale:3,lengthTolerance:1e-6,angleTolerance:1e-8
  }
}
it('measures regular rank five and preserves a literal free spin about the common axis',()=> {
  const p=problem(),r=solveRigidMates(p);
  expect(r.status).toBe('underdefined');
  expect(r.rank).toBe(5);
  expect(r.localDOF).toBe(1)
  p.bodies[1].pose.rotation=rotationExp([0,0,.71]);
  expect(evaluateRigidMates(p).checks[0].satisfied).toBe(true)
  p.bodies[1].pose.translation=[1,2,3];
  const solved=solveRigidMates(p);
  expect(solved.status).toBe('underdefined');
  expect(solved.rank).toBe(5);
  expect(solved.evidence.groups[0].checks.every(c=>c.satisfied)).toBe(true)
})
it('admits different descendant frames of one owner and signed anti-axis with opposite axial normal',()=> {
  const c=hinge();
  c.alignment='opposed';
  c.axis[1].frame.rotation=rotationExp([Math.PI,0,0]);
  c.axial[1].frame= {
    translation:[0,0,4],rotation:rotationExp([Math.PI,0,0])
  }
  const e=evaluateRigidMates(problem(c));
  expect(e.diagnostics).toEqual([]);
  expect(e.checks[0].satisfied).toBe(true)
  c.axial[0].bodyId='b';
  expect(()=>copyRigidHingeConstraint(c)).toThrow(/owner/)
})
it('rejects radial planes, sparse roles, executable nested fields and explicit undefined uncertainties',()=> {
  const c=hinge();
  c.axial[0].support= {
    kind:'plane',point:[0,0,0],normal:[1,0,0],xDirection:[0,1,0],tolerance:0
  };
  expect(()=>copyRigidHingeConstraint(c)).toThrow(/perpendicular/)
  let reads=0;
  const bad=hinge();
  Object.defineProperty(bad.axis[0],'support', {
    enumerable:true,get() {
      reads++;
      return null
    }
  });
  expect(()=>copyRigidHingeConstraint(bad)).toThrow();
  expect(reads).toBe(0)
  expect(()=>copyRigidHingeConstraint( {
    ...hinge(),axis:[,hinge().axis[1]]
  })).toThrow();
  expect(()=>copyRigidHingeConstraint( {
    ...hinge(),uncertainty:undefined
  })).toThrow()
})
it('retains all four real incidences and common gauge without inventing repeated-owner freedom',()=> {
  const p=problem(hinge(),true),e=evaluateRigidMates(p);
  for(const row of e.rows)for(let j=0; j<6; j++)expect(Math.abs(row.jacobian[j]+row.jacobian[6+j])).toBeLessThan(1e-12)
  const c=hinge();
  c.axis[1].bodyId='a';
  c.axial[1].bodyId='a';
  const same=problem(c,true);
  const s=solveRigidMates(same);
  expect(s.rank).toBe(0);
  expect(evaluateRigidMates(same).rows.every(r=>r.jacobian.every(x=>Math.abs(x)<1e-12))).toBe(true)
  c.axis[0].bodyId=null;
  c.axial[0].bodyId=null;
  c.axis[1].bodyId=null;
  c.axial[1].bodyId=null;
  expect(evaluateRigidMates(problem(c)).checks[0].satisfied).toBe(true)
})
for(const step of [2e-5,7e-6])it('matches offsolution two-owner left-retraction derivatives at step '+step,()=> {
  const p=problem(hinge(),true);
  p.bodies[0].pose= {
    translation:[.4,-.2,.3],rotation:rotationExp([.13,-.22,.17])
  };
  p.bodies[1].pose= {
    translation:[-.5,.6,-.2],rotation:rotationExp([-.18,.14,-.11])
  };
  p.constraints[0]=hinge()
  const baseline=evaluateRigidMates(p);
  expect(baseline.diagnostics).toEqual([])
  for(let col=0; col<12; col++) {
    const evalAt=(sign:number)=> {
      const map=new Map<string,RigidPose>(p.bodies.map(b=>[b.id,b.pose]));
      const body=p.bodies[Math.floor(col/6)],d=Array(6).fill(0);
      d[col%6]=sign*step;
      map.set(body.id,retractRigidBodyPose(body.pose,d,p.origin,p.lengthScale));
      return evaluateRigidMates(p,map).rows
    };
    const plus=evalAt(1),minus=evalAt(-1);
    baseline.rows.forEach((row,i)=>expect(Math.abs((plus[i].residual-minus[i].residual)/(2*step)-row.jacobian[col])).toBeLessThan(2e-8))
  }
})
it('withholds precision-only angular and axial uncertainty failures without widening bands',()=> {
  const c=hinge();
  c.uncertainty=Array.from( {
    length:4
  },()=>( {
    positionErrorMm:1e-3,directionErrorRad:0
  })) as NonNullable<RigidHingeConstraint['uncertainty']>;
  expect(evaluateRigidMates(problem(c)).diagnostics[0].code).toBe('precisionLimit')
  c.uncertainty=Array.from( {
    length:4
  },()=>( {
    positionErrorMm:0,directionErrorRad:1e-3
  })) as NonNullable<RigidHingeConstraint['uncertainty']>;
  expect(evaluateRigidMates(problem(c)).diagnostics[0].code).toBe('precisionLimit')
})
it('restores an antipodal signed-axis chart through the actual free owner',()=> {
  const p=problem();
  p.bodies[1].pose.rotation=rotationExp([Math.PI,0,0]);
  const r=solveRigidMates(p);
  expect(r.status).toBe('underdefined');
  expect(r.rank).toBe(5);
  expect(r.evidence.groups[0].checks.every(c=>c.satisfied)).toBe(true)
})
it('keeps offsolution common rigid gauge in all six columns and measures six-dimensional gauge plus spin correctly',()=> {
  const p=problem(hinge(),true);
  p.bodies[0].pose= {
    translation:[.3,-.4,.2],rotation:rotationExp([.2,.1,-.3])
  };
  p.bodies[1].pose= {
    translation:[-.2,.1,.3],rotation:rotationExp([-.1,.3,.2])
  };
  const e=evaluateRigidMates(p)
  for(const row of e.rows)for(let j=0; j<6; j++)expect(Math.abs(row.jacobian[j]+row.jacobian[j+6])).toBeLessThan(2e-14)
  const regular=solveRigidMates(problem(hinge(),true));
  expect(regular.rank).toBe(5);
  expect(regular.localDOF).toBe(7)
})
it('does not certify a nominal near-band angular fit after uncertainty consumes the remaining band',()=> {
  const c=hinge(),p=problem(c);
  p.angleTolerance=1e-5;
  p.bodies[1].pose.rotation=rotationExp([8e-6,0,0]);
  c.uncertainty=Array.from( {
    length:4
  },()=>( {
    positionErrorMm:0,directionErrorRad:2e-6
  })) as NonNullable<RigidHingeConstraint['uncertainty']>;
  expect(evaluateRigidMates(p).diagnostics[0].code).toBe('precisionLimit')
  const safe=structuredClone(p);
  safe.bodies[1].pose.rotation=rotationExp([2e-6,0,0]);
  expect(evaluateRigidMates(safe).checks[0].satisfied).toBe(true)
})
it('projects a requested spin while retaining axial and transverse constraints',()=> {
  const p=problem(),requested= {
    bodyId:'b',frame:I(),targetPose: {
      translation:[0,0,0] as [number,number,number],rotation:rotationExp([0,0,.43])
    },mode:'rotate' as const
  },r=projectRigidMateTarget(p,requested);
  expect(r.status).toBe('ready');
  if(r.status!=='ready')throw Error('Projection rejected');
  expect(r.result.poses!.get('b')!.rotation[2]).toBeCloseTo(Math.sin(.43/2),6);
  expect(p.bodies[1].pose).toEqual(I())
})
it('rejects large topology envelopes rather than enlarging the requested length band',()=>{
  const c=hinge();for(const e of [...c.axis,...c.axial])e.support!.tolerance=4e-7;
  const p=problem(c);expect(p.lengthTolerance).toBe(1e-6);
  expect(evaluateRigidMates(p).diagnostics[0].code).toBe('precisionLimit');
  expect(p.lengthTolerance).toBe(1e-6);
})
it('admits an original oblique support axis and retains rank, spin and offsolution derivatives', () => {
  const c = hinge();
  for (const e of c.axis) e.support = { kind: 'line', point: [0, 0, 0], axis: [.6, 0, .8], tolerance: 0 };
  for (const e of c.axial) e.support = { kind: 'plane', point: [1.2, 0, 1.6], normal: [.6, 0, .8], xDirection: [.8, 0, -.6], tolerance: 0 };
  const regular = problem(c);
  expect(evaluateRigidMates(regular).diagnostics).toEqual([]);
  expect(solveRigidMates(regular).rank).toBe(5);
  regular.bodies[1].pose.rotation = rotationExp([.6 * .43, 0, .8 * .43]);
  expect(evaluateRigidMates(regular).checks[0].satisfied).toBe(true);
  const p = problem(c, true);
  p.bodies[0].pose = { translation: [.4, -.2, .3], rotation: rotationExp([.13, -.22, .17]) };
  p.bodies[1].pose = { translation: [-.5, .6, -.2], rotation: rotationExp([-.18, .14, -.11]) };
  const baseline = evaluateRigidMates(p);
  expect(baseline.diagnostics).toEqual([]);
  for (const step of [2e-5, 7e-6]) for (let col = 0; col < 12; col++) {
    const at = (sign: number) => {
      const map = new Map<string, RigidPose>(p.bodies.map(b => [b.id, b.pose]));
      const body = p.bodies[Math.floor(col / 6)], delta = Array(6).fill(0);
      delta[col % 6] = sign * step;
      map.set(body.id, retractRigidBodyPose(body.pose, delta, p.origin, p.lengthScale));
      return evaluateRigidMates(p, map).rows;
    };
    const plus = at(1), minus = at(-1);
    baseline.rows.forEach((row, i) => expect(Math.abs((plus[i].residual - minus[i].residual) / (2 * step) - row.jacobian[col])).toBeLessThan(2e-8));
  }
});
it('requires explicit total position errors to retain every native support tolerance', () => {
  const c = hinge();
  for (const e of [...c.axis, ...c.axial]) e.support!.tolerance = 2e-7;
  c.uncertainty = Array.from({ length: 4 }, () => ({ positionErrorMm: 0, directionErrorRad: 0 })) as NonNullable<RigidHingeConstraint['uncertainty']>;
  const p = problem(c);
  p.bodies[1].pose.translation = [0, 0, 9e-7];
  expect(() => copyRigidHingeConstraint(c)).toThrow(/include its support tolerance/);
  expect(evaluateRigidMates(p).diagnostics[0].code).toBe('invalidGeometry');
  for (const error of c.uncertainty) error.positionErrorMm = 2e-7;
  expect(copyRigidHingeConstraint(c).uncertainty).toEqual(c.uncertainty);
  expect(evaluateRigidMates(p).diagnostics[0].code).toBe('precisionLimit');
});
