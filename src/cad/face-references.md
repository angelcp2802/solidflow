# Planar supports and reference frames

SolidFlow 0.4 attaches sketches and reference planes to earlier named reference
planes or planar B-rep faces. The feature document stores dependencies and local
dimensions, never a frozen native plane or an enumeration index.

## Coordinate frames

`PlaneFrame` contains an origin, a unit X direction and an outward unit normal.
Local Y is `normal × X`, so the frame is right handed. `kernel.frames.ts` supplies
pure, serializable helpers without requiring OpenCascade:

- `principalPlaneFrame(plane, offset)` retains XY/+Z, XZ/−Y and YZ/+X conventions.
- `offsetPlaneFrame(frame, offset, reversed)` moves along the original normal,
  then reverses the normal if requested. X remains fixed; local Y reverses too.
- `framePoint(frame, u, v)` maps sketch coordinates into the model.
- `frameYDirection(frame)` provides the local revolution axis.

For a planar face, the normal comes from OpenCascade's oriented face. The origin
is the orthogonal projection of the world origin onto the infinite support plane,
not the face centroid. Local X is world X projected into that plane and
normalized. When that projection has length below 10⁻⁶, projected world Y supplies
X instead. The origin can therefore lie outside the bounded face; attaching a
sketch defines a plane and does not constrain its curves to the face boundary.

The selected face's current frame is rebuilt after source dimension edits. Sketch
offset is applied afterwards. Symmetric extrusion shifts its starting frame by
minus half the signed depth. Revolution uses local Y through the sketch-frame
origin. These placements apply to legacy rectangles/circles and multientity
profiles, including faces inclined relative to all principal planes.

## Historical dependencies

A face reference identifies the solid immediately after its `sourceFeatureId`
operation. It does not identify a similarly positioned face on the final body.
The engine scans the current feature history for referenced sources, captures
only those sources when their operations finish, and stores copied face keys and
frames for the duration of that rebuild. Native face wrappers are released at
each capture. No native source shapes or stale frames persist between rebuilds.

Reference planes do not replace the current solid or become valid solid bases
for a fillet/chamfer. Suppressing a source temporarily omits dependent planes,
sketches, extrusions, cuts, revolutions and finishes, with warnings, without
rewriting their suppression flags. Missing, forward, incompatible or ambiguous
references are errors; export of an incomplete failed rebuild is blocked.

## Conservative face naming

`kernel.faces.ts` uses `face-v1|` followed by a SHA-256 digest of a descriptor.
The descriptor includes structural feature lineage, body topology counts and
curve/surface-type histograms, face type, outward normal and deterministic local
X direction, normalized face bounds and area centroid, wire count, and sorted
boundary curve descriptors with normalized bounds and sample points.

Each coordinate axis is normalized to the current body's B-rep bounds and rounded
to 10⁻⁸. Boundary samples are sorted to avoid traversal-direction dependence.
Native hash codes and enumeration indices never enter the reference. SHA-256
keeps the serialized key at 72 characters even for faces with many boundaries.
Resolution requires exactly one matching key from the named historical source;
there is no nearest-face fallback. Duplicate coincident geometry is rejected as
ambiguous. Curved faces remain available for picking/occlusion but have a null
frame and cannot support a planar sketch or reference plane.

The signature preserves the tested top face when a rectangular prism's depth
changes from 12 to 20 mm. It is deliberately conservative for changes that split
or merge faces, change hole arrangements, alter relative geometric roles, change
boundary parameterization, or change surface type. Such edits may require
reselecting the face. A local frame can also switch its deterministic X basis
near a world-axis singularity; X is included in the key so that this cannot
silently reverse the sketch while keeping the old reference. A real native-box
regression demonstrated that failure before adding the X-direction guard.

This is not a general solution to persistent CAD topological naming. Only faces
reported as planar by OpenCascade are accepted; an approximately planar or
planar-looking spline surface is not silently treated as a plane. Normal and
coordinate quantization absorb numerical noise and do not guarantee preservation
through arbitrary topology or orientation changes.

Existing features without `support` keep their previous structural lineage
byte-for-byte. Their saved edge references and the supplied 0.2/0.3 examples
remain covered by regression tests.

## Verification

`kernel.supports.test.ts` exercises real OpenCascade geometry: six outward box
faces and per-face meshes; face-supported extrusion and inward cut; source-depth
edits; historical support before a later cut changes the face; curved, stale and
ambiguous references; offset/reversed plane chains; entity geometry on a reversed
face plane; suppression propagation; missing/forward/type-invalid dependencies;
arbitrarily inclined faces with legacy and entity profiles; the local revolution
axis; deterministic-basis changes; and STEP validity/volume after reimport.

```powershell
npx vitest run src/cad
```
