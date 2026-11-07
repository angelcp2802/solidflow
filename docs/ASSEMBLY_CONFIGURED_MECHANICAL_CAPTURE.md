# Configured mechanical capture

[Issue #51](https://github.com/angelcp2802/solidflow/issues/51) adds a separate
native producer for lock, concentric with locked rotation, gear, screw and
rack-pinion in the configured workspace. It extends the same
[integration draft](https://github.com/angelcp2802/solidflow/pull/49).
Read [actual validation](VALIDATION.md) before treating authored cases or CI
configuration as executed acceptance.

The renderer sends the exact scope path, declaring ID/revision, selected state
and an add/replace spec. The spec includes references, parameters and explicit
weighted gear phase in radians. It cannot contain relative poses, neutral
rotations/travel or accumulated angles. Retain uses the existing declaration's
private capture and requires the same family and exact endpoint/carrier roles.
Reference changes require explicit recapture. Gear phase is an editable parameter,
separate from neutral rotations and turn branches.

Fresh capture solves the remaining genuine configured context. Recapture first
removes its old declaration privately, so an obsolete declaration cannot prevent
an explicit repair. Locked concentric and screw use a private unlocked concentric
alignment, then query the aligned native geometry again. This temporary relation
is removed before publishing the real declaration. Rack capture adds no implicit
guide or alignment. A null gear carrier means the declaring scope frame.

Native witnesses retain their actual purpose, root ownership and complete
placement-chain conditioning. Numerical scope endpoints compose local descendant
chains; a pair of world inverses is not used to erase original arithmetic error.
Every placed use selecting one intrinsic state must yield the same capture.
After capture, child-first solve and fresh physical verification of all placed
relations, an actual matching scene must succeed before a private token is issued.

The pending transaction keeps the original baseline separate from its prepared
proposal. Apply consumes that proposal's genuine single-use preparation against
the unchanged original context. Cancel publishes nothing. Pure invalid admission
does not revoke another valid preview. Native failure, stale context, release
failure or repeated Apply cannot publish a partial candidate. The ordinary
declaration-edit route continues to reject caller-authored mechanical captures.

The form offers actual configured component/cylinder/LINE nominees. Nominees
are not proofs. Draft edits preserve committed history, recovery and files;
Apply publishes one complete v3 history state. Retain preserves winding; explicit
recapture establishes a new current neutral. Undo/Redo, save and reopening keep
the entire catalog and selected root state.

Five fixed renderer commands share original analytical geometry and each keeps
the existing isolated 180/170/35-second harness deadlines. The aggregate
`npm run test:desktop:assembly-configured-mechanical` runs them sequentially.
Their bounded neutral capture/edit/recapture lifecycle does not establish general
mechanical motion, automatic topology correspondence, flexible instances,
arbitrary-model compatibility, installed packaging or platform support. See
[fixture provenance](PROVENANCE.md#original-configured-mechanical-capture).

Each fixed renderer case also withholds its first successful real Save As result
after the actual file has been written and its digest checked. The test releases
the unchanged return, then waits for actual clean header/path, enabled Open/Save,
disabled Apply and complete recovery. Normal Save uses the same readiness fence.
The IPC-return marker alone is not a claim that React has completed its update.
