# Development guide

## Internal thin-wall axial caps — 2026-10-29

Validate the strict optional `thinWall.endCaps` declaration before native work.
Active settings require a fixed-depth additive non-symmetric extrusion and one
closed source region. Reject unsupported contexts before automatic-end factories
and absence witnesses. Keep outer/inner profiles as explicit temporary section
metadata; generated identifier spellings are not a geometry API. Extrude outer
material over the signed envelope and shorten/shift only the inner core at both
ends, preserving the incoming resolved frame once. Share the builder with
supported additive regeneration and retain owner/currentness/release checks.

`profileClosedSingle` is a current solved display witness for new cap controls,
not document or native authority. Retained unsupported settings need explicit
OFF recovery, invalid inactive dimensions remain editable, and decimal entry
must retain focus. Run `npm run test:desktop:part-end-caps` alongside the complete
thin-wall, automatic-corner, external-axis and revolution routes. See the
[contract](THIN_WALL_OPERATIONS.md), [fixtures](PROVENANCE.md) and
[executed validation](VALIDATION.md). Broader cap extents/regions, combined demo,
installed platforms and recurring stability remain separate requirements.

## Automatic thin-wall corners — 2026-10-29

The optional `thinWall.autoCorners` record stores only enabled/radius data;
validate its own descriptors before reading nested values. Absence must preserve
legacy declaration and topology descriptors. Radius means the inner material
radius. Plan all analytic corner contacts on the original solved source and
check the remaining interval of every shared LINE/ARC before returning a
temporary rounded chain. Do not invoke a sketch edit, allocate constraints or
run another solve. The shared wall builder offsets this common chain for both
sides and retains existing crossings, reentry, ownership and native checks.

Keep small-radius admission internal to derived profiles; ordinary source ARC
validation retains its existing defaults. `profileOpenOnly` is a solved display
witness, not document authority. Only a unique current successful eligible source
permits new activation. Retained extrusion settings must remain recoverable after
source closure: allow disabling and correction of an invalid inactive radius,
preserve focus through decimal entry, and keep the global stale-prefix lock.
Cut/revolution menu coverage, closed/mixed
profiles, axial caps and offset repair remain separate work. The new original
renderer command is `npm run test:desktop:part-auto-corners`; keep the complete
existing thin-wall, external-axis and revolution routes. See the
[contract](THIN_WALL_OPERATIONS.md), [fixtures](PROVENANCE.md#original-automatic-corner-fixtures--2026-10-29)
and [executed validation](VALIDATION.md).

## Planar thin-wall integration — 2026-10-28

The [thin-wall contract](THIN_WALL_OPERATIONS.md) defines the strict optional
three-mode declaration for additive/subtractive extrusions and revolutions.
Resolve the original sketch and revolution axis before deriving a temporary
closed material section. Do not solve that section again, mutate source
constraints, or replace a translated limit frame with the original offset.
Every fixed/automatic end-condition factory and extrude/cut regeneration recipe
must use the same section. Never assign filled-prism provenance to a thin wall.

The pure profile-curve module shares topology classification with native profile
construction. `SketchVisual.profileTopology` describes the already-solved source;
the UI can require a new open-profile wall only while that model/prefix witness
is current. Editor clearing removes the optional field; invalid temporary values
stay editable and block Apply. Preserve exact body ownership and legacy absence.
The [original fixtures](PROVENANCE.md#original-planar-thin-wall-fixtures--2026-10-28)
and [validation](VALIDATION.md) separate mathematical/native tests, rendered
interaction and platform acceptance. Axial caps, broader automatic-corner UI and
offset clipping/repair remain open; straight section end segments are not axial
caps. This increment does not close the full prototype thin-feature group.

## External revolution axes — 2026-10-28

Additive and subtractive revolutions share three additional strict axis variants:
`{kind:'principal-axis',axis:'X'|'Y'|'Z'}` in the part's world frame,
`{kind:'external-sketch-line',sketchId,entityId}` from an earlier resolved sketch,
and `{kind:'linear-edge',edge,body}` with an exact `BodyReference` or explicit
`null` for a legacy aggregate. Saved coordinates and native handles are not axis
declarations. Existing local X/Y, same-sketch lines and absent defaults retain
their canonical bytes and historical reference descriptors: explicit local
declarations keep v1 axis identities, and absence keeps the legacy local-Y
lineage. New variants use v2 axis descriptors within the existing document
version; older strict readers reject them rather than substituting an axis.

Resolve the axis once against the operation's preceding build state, then reuse
it for the tool and reference lineage. Read solved endpoints/current support
frames for external sketches. Material axes require a unique current native LINE
in the declared body state, including matching edge/body source IDs and current
lineage; an explicit catalog cannot fall back to the aggregate. Retain the
actual world line. Its distance from the profile plane must not exceed `1e-7 mm`,
and its unit direction's absolute dot product with the plane normal must not
exceed `1e-8`. Reject unavailable, ambiguous, curved or out-of-plane sources
without substituting local Y. Existing reverse and bounded-extent rules remain.

Axis producers are graph dependencies, including deletion through a read body's
creator behind a potential ALL state. They are not extra profile inputs:
`featureSketchIds` still contains only the revolution profile; reading an axis
body does not add it to material targets or outputs. Preserve profile consumption,
Normal To, history and explicit body-state ownership. Revolution regeneration
through feature recipes remains a separate, explicitly gated capability.

`SketchVisual.lineEntities` supplies identified resolved world-space LINE
witnesses without changing legacy line arrays. Viewport candidates retain full
declarations and body owners; display segments confer no native authority.
Selection requires the current draft/document/prefix ticket, candidate catalog,
matching press/release camera and a catalog marked presented after rendering.
Camera changes, wheel, resize, cancellation and context replacement revoke stale
gestures. Coincident declarations use an explicit chooser instead of guessing
an owner; entering that menu must not cancel its pending choice.

After building, run `npm run test:desktop:part-external-axis` for the original
production-renderer workflow. Its fixture, separate native CAD oracles and
observation limits are described in [provenance](PROVENANCE.md). Record actual
command results in [validation](VALIDATION.md); authored checks do not establish
complete demo or platform acceptance.

## Opening a saved direction from a parameter editor — 2026-10-28

Do not use the broad `referenceEditing` display state as the entry guard for
`beginDirectionEdit`. It includes the legacy cylinder-tangency parameter editor,
which the established saved-direction action must be able to replace. Use the
current shared-reference ticket owners to block an owned draft instead. Keep all
operation, native preview, staging, document, scope, session, mounted and confirmed
scene guards, then explicitly clear the replaced cylinder editor when beginning
the directional ticket/draft.

The existing complete cylinder-tangency route checks that this navigation does
no CAD work, closes the directional edit, reopens/closes the cylinder edit and
releases the family options. Preserve that cross-editor contract alongside the
directional reference-replacement route; do not increase its deadline or replace
the sequence with an extra Close action to mask a no-op button.

## Saved direction-reference editor identity — 2026-10-28

Parallel/perpendicular editing participates in the standard workspace's shared
reference draft. Retain the unique exact original declaration, document signature,
scope ID/revision/path and editor session. The ticket's original family is stable
while the draft may convert between the two directional families. Never resolve
the ticket against a previewed declaration or substitute saved endpoints for an
empty replacement slot.

Reference callbacks require the current ticket, draft, slot, document, scope and
presented scene. Resolve actual current face/LINE/origin catalog entries before
writing the draft. Recalculate the collinear/orthogonal objective from the new
endpoints. Preview and Apply use existing worker verification/capabilities; no
saved reference or renderer ticket grants native authority.

Preview Cancel retains the draft; explicit Close, Apply, history, document
replacement or a new scope revoke it. Keep the complete original direction
workflow and its geometric oracles before the appended replacement lifecycle.
Only that test's bounded temporary-path dialog list adds a second Save and third
Open; production file grants, native-dialog policies and deadlines remain.

## Quoted JSON byte-count allocation — 2026-10-28

Both v2 and configured-document JSON preflights use the shared
`jsonStringByteLength` for primitive string keys/values. ASCII U+0020..U+007F,
excluding quote and backslash, needs neither JSON escaping nor multibyte UTF-8:
its quoted size is `length + 2`. Other strings retain the exact existing
`TextEncoder.encode(JSON.stringify(value))` calculation. The helper is a byte
counter, not an encoder or sanitizer; it rejects nonprimitive input without
coercion. The regular expression has no stateful flags.

Keep the caller's existing per-string length check and per-walk encoder. Preserve
descriptor inspection before value reads, prototypes, cycles, sparse/symbol or
hidden fields, node/depth limits and cumulative byte accounting. Repeated data
counts on every use. Do not cache validation by mutable caller identity or
substitute compact preflight counts for the separate pretty-serialized document
and combined source/catalog/state 20 MiB bounds.

The original combined-budget test retains its 7,650,000 zero bytes, 4,096 states,
all individual/combined byte assertions and the public five-second timeout.
Its opaque source exercises storage and validation, not valid STEP geometry.
Separate private phase timing or CPU sampling is diagnostic evidence, not a
replacement for the unchanged public case or affected-platform acceptance.

## Assembly context release ordering — 2026-10-28

The shared standard/configured assembly viewport uses `createCadContextGesture`
for right-button intent and actual release, in either order. Never select,
nominate a view target or open a pointer context before both arrive. Complete at
the recorded release point, once, before the left-selection handler's early
return. Keep the existing irreversible four-pixel drag and pointer guards.

The press frame includes the exact presented/current scene, origin catalog,
interaction revision, view-history revision, camera pose/projection and canvas
rectangle. Recheck it at both request and release, including disabled, reference
picking, manipulator and navigation state. Camera change, resize, leave/cancel,
blur, Escape, a replacement press and direct keyboard opening revoke pending
pointer intent; remove listeners when controls are recreated or disposed.
Keyboard opening remains direct and Escape keeps its normal workspace behavior.

The existing complete `test:desktop:assembly-basic-authoring` and
`test:desktop:assembly-configured-components` routes now include the shared
`desktop-assembly-context-gesture.cjs` subflow. Actual CDP presses/releases are
combined with an explicitly untrusted synthetic early `contextmenu` to exercise
the previously conditional order. Check no early popup/selection, drag/return,
Escape, keyboard replacement, one released component menu and the ordinary
native-context click. Preserve original geometry, history, file, cleanup and
deadline oracles. A controlled early event is not natural OS-delivery evidence.

## Right-context release ordering — 2026-10-27

Treat a native `contextmenu` as menu intent, never as a synthetic pointer release.
`createCadContextGesture` retains intent and the actual matching right-button
release separately. Complete once when both exist, in either order, at the
recorded release point. Consume the state before calling the context action.
Reuse the existing selection gesture's irreversible four-pixel drag/pointer
guard; do not introduce a timer, delayed opening or another movement threshold.

Recheck the exact interaction frame at request and release. Process a possible
right-context completion before the left-selection handler's early return.
Keep presented-model, disabled and navigation checks at the actual opening.
Cancel pending context state on camera changes, leave/cancel, window blur, a
replacement press, Escape and direct keyboard-context opening. Escape still
propagates to the existing application handler. Copy native event fields
explicitly: DOM pointer coordinates need not be enumerable own properties.

The original fresh-sketch workflow retains a passive trace around its unchanged
four-call, 12-pixel right drag. Log menu presence and selected-face state
separately while retaining their existing combined assertion. Scope the observer
to that synthetic fixture, cap records/strings, remove its listeners and mutation
observer in `finally`, and preserve the primary failure. The viewport's WebGL
canvas is distinct from the orientation triad (`role="img"`); do not require the
whole viewport to contain only one canvas. Trace collection adds no evaluations
or waits between pointer calls. It records calls to the pointer adapter, not
intercepted CDP messages. Capture listeners precede application handlers and
mutation notifications are batched; do not infer synchronous post-handler state
from a capture-phase event row.

## Part viewport context ownership — 2026-10-27

Part viewport right-click targeting shares the existing visible face/edge/body
pickers and selection filters. A stationary press must retain its input frame,
displayed model, mode and camera; movement beyond 4 px, cancellation, blur,
leaving the canvas, a new model or a changed context invalidates it. Keyboard
ContextMenu/Shift+F10 uses a single current selected target; mixed selection
retains background commands. Opening a background context preserves selection.

Resolve exact primary face/edge references and unique current body identities
against the presented catalog. Do not substitute a legacy alias or aggregate
for an explicit body. Operation-plane targets require a current visible native
plane entry and a live plane feature. Principal XY/XZ/YZ keyboard selections
are a distinct target, independent of rendered operation planes. They use the
existing principal-frame sketch/Normal To behavior, never an invented mesh.

Bind each popup to the document, displayed model, selection witness and document
epoch. Recheck currentness before executing an existing command. Editing,
rebuild, camera navigation, file work and dialogs withhold contexts. Selection,
editing and commit handlers revoke retained popup authority; actions consume it
once. Closing for Escape retains selection and restores initiating focus.
CadContextMenu closes before calling onSelect: the close handler schedules UI
removal, while the action still performs its synchronous ownership check and
consumption. Do not replace that close handler with early authority revocation
without preserving authorized command execution.

The blue shared menu exposes existing feature/input-sketch editors, planar
sketch creation, view commands, named views and explicit deselection. It grants
no new native proof, file permission, worker action or saved-document field.
Keep display-resolver tests, CDP gestures, DOM command activation, actual native
reconstruction and independent saved-file checks distinct in validation.

## Current-body assembly placement — 2026-10-27

Scene construction asks the completed part inspection to place an exact current
body directly. `placeCurrentAssemblyBody(reference, pose)` borrows the prototype
only for the synchronous checked placement and returns an owned independent
shape with its measured solid count. It avoids the previous intermediate
`copyCurrentBodyShape` and its duplicate admission. The ordinary copy API and
its other export, interference and translation consumers retain their contract.

Capture the same completed-build epoch, aggregate and explicit body catalog as
copying. An explicit catalog requires its exact current body reference; null
continues to mean the complete legacy aggregate only. Validate the source and
placed result, preserve closed-solid cardinality and finite rigid placement,
and keep `CopyGeom=true` and topology-independence checks. Current-body placement
changes neither presentation meshing order nor reference metadata.

Check engine and enclosing-lease currentness before using borrowed source data,
after native query boundaries and after placement cleanup. Adopt each received
independent candidate before a guard can throw. The engine adopts the helper's
returned shape before its final guard; the lease adopts the engine's result
before its post-read guard. Withhold both shape and count on any operation or
cleanup failure, release owned candidates, retain aggregate causes and revoke
the failed inspection. Invalid body selection before placement must not revoke
an otherwise healthy engine. Never delete the borrowed prototype as a candidate.

The lease exposes exactly two placement arguments; its owner guard is internal.
It grants no retained validation proof, saved reference, worker command or Apply
capability. Profile `copyBodyShape` calls and `withNativeValidationContext`
scopes by their actual names: the transform still copies native geometry, and
one validation scope can perform several native queries. Keep native dispatcher,
worker round-trip and complete renderer timings separate.

## Dedicated worker message admission — 2026-10-27

The CAD worker accepts browser-delivered dedicated-channel events only:
`isTrusted === true`, empty `origin`, null `source` and no transferred ports.
Check metadata before reading `data` or calling the serial queue. Ignore
synthetic events without closing their caller-owned ports. For an actual
received event outside the channel contract, close any transferred ports and
withhold the entire request. These checks grant no command, file or preview
capability; the existing strict queue envelope, payload validators and private
session tokens remain authoritative. They do not authenticate a compromised
owning renderer.

This is the dedicated-worker channel contract, whose implicit MessagePort
delivery differs from cross-window messaging. The [Worker postMessage steps](https://html.spec.whatwg.org/multipage/workers.html#dom-worker-postmessage)
use that implicit port; [channel message delivery](https://html.spec.whatwg.org/multipage/web-messaging.html#message-ports)
sets data/ports while [MessageEvent](https://html.spec.whatwg.org/multipage/comms.html#the-messageevent-interface)
retains empty origin/null source defaults. Native [port close](https://html.spec.whatwg.org/multipage/web-messaging.html#dom-messageport-close)
disentangles the received channel. An empty origin is not a trusted web origin.

The desktop smoke sends an actual transferred-port `init` request100 before
the existing malformed requests101–103 and native prism104. A reply101 is an
ordered barrier; accepting100 would violate the original exact reply sequence.
The four responses must have the dedicated-channel metadata, and the prism's
independent V24 mm³/bounds remain. Test-owned ports are closed and the worker
terminated on success, error or the unchanged15 s probe deadline. Unit tests
import the actual worker entry with mocked queue/native dependencies; they
check metadata/data-read ordering and port closure, not native geometry or
browser provenance. Record actual compiled execution separately from units
and await hosted CodeQL before claiming that its warning has cleared.

## Placed scene cardinality and passive picking timings — 2026-10-27

`placeAssemblyShapeChecked` returns an owned, independent placed aggregate and
the solid count measured from that exact result. It performs the same source
and result BRep/closed-solid checks, cardinality comparison, proper rigid
transform, copy independence and finite-bounds checks as `placeAssemblyShape`.
The latter keeps its shape-only API. The pair may escape only after all other
native owners have been released successfully; a cleanup failure withholds both
fields and releases the candidate. No validator survives the operation.

The scene builder consumes that count synchronously, before meshing or mutating
the returned shape, instead of immediately validating the identical aggregate
again. It still queries actual placed mesh, edges, native mass/area and bounds.
Do not use the count after mutation or as an authorization for another request.
Fault-injection tests aimed at scene construction must intercept the checked
entry point, return its original pair and patch its actual owned shape. Separate
export, interference and translation consumers retain their shape-only wrapper.

The six-case symmetry viewport-picking harness enables optional passive worker
timings. `workerRoundTripMs` measures renderer send to reply arrival, including
transport, queueing and scheduling; it is not kernel CPU time.
`responseCaptureMs` measures the observer's existing response projection.
Missing, invalid or backward clocks produce nullable diagnostics. Timings never
alter sent data, actual replies, acceptance, polling or deadlines. The existing
256-record envelope bounds retained timing records; overflow is explicit.

Workflow accounting also covers this picking route. Its categories overlap,
so their totals must not be added. Existing rigid-workflow phase names remain
idle here; the six symmetry families are identified in bounded response timing
records. Compare the same workload, host, versions and oracles before reporting
a difference. Local synthetic timing does not establish hosted stability,
installed-platform acceptance or external-application behavior.

## Subtractive revolution contract — 2026-10-27

`revolvedCut` is a distinct saved feature, sharing sketch, axis, angle, reverse
and extent declarations with additive `revolve`. Keep additive `bodyOperation`
and subtractive `bodyScope` separate. The strict parser rejects mixed extrusion
or additive fields; older readers reject the new type rather than silently
reinterpreting removal as added material. Existing `revolve` bytes and reference
descriptors remain unchanged.

Resolve the current solved sketch/support frame and the existing bounded angular
interval before building the revolved tool. Subtract it from the current exact
scope through the native body transaction; require material removal from every
selected target and preserve all prior states on failure. A cut allocates no
body ID: output references advance each selected body to the cut's feature ID.
Its sketch and scope are graph dependencies for edits and downstream rebuilds.
An explicit catalog requires nonempty exact targets. Aggregate legacy histories
can omit scope; they still require earlier material and actual intersection.

Expose the command in the part ribbon and Insert menu, with matching staged-edit,
busy and existing-material guards. Reuse the blue revolution parameter editor;
do not offer additive output modes in a cut. Body picking can select several
current bodies. Preview/Cancel, acceptance, history, normal Save and reopening
retain the existing body-command contracts. External axes, thin walls and
regenerative feature patterns by revolution remain separate work; the existing
recipe gate continues to reject unsupported revolution regeneration.

## Bounded Windows atomic publication — 2026-10-27

Save and export stage their exact bytes in a same-directory exclusive `wx`
temporary file with mode `0600`, sync and close it, then replace the destination
with rename. On Windows only, rename failures with `EPERM`, `EACCES` or `EBUSY`
receive at most five retries after 50/100/200/400/800 ms (six attempts, 1,550 ms
of scheduled waiting). These codes can also represent permanent denial: reaching
the bound rejects the operation with its final filesystem error. Other errors,
other platforms and staging failures are not retried.

Never unlink, truncate or copy over the previous destination to make replacement
succeed. Recheck the exact authorized main-frame sender before every publication
attempt, including after staging and retry delays. Keep the shared file-operation
gate until completion or failure, grant a new Save pathname only after successful
publication, and retain an existing grant after a failed later Save. Close staged
handles and attempt temporary cleanup in `finally`; cleanup failure must not hide
the publication error. This does not identify the source of a hosted lock or
establish crash/power-loss durability, general network-filesystem behavior or
installed-platform acceptance.

The IPC tests inject filesystem failures and control retry timers around real
temporary files, and also exercise a real Windows reader opened without Delete
sharing. The latter releases
its own temporary-file lock during the first retry; it is skipped on non-Windows
hosts. No personal model, third-party application or dependency is needed.

## Configured origin/background context contracts — 2026-10-27

Use the same current-scene guards for all configured popup kinds. Bind normal,
origin and BOM selection identities as well as the complete UI ticket, navigation
revision and evaluation identity. Origin rows resolve against the live global
catalog; nominate an existing purpose-compatible form option in the current
edit frame. Root is component:null, descendants are relative, and outside owners
are unavailable. Preparing a first role never grants native Apply authority.

Use current occurrence names for labels and exact IDs/bindings for actions.
Viewport keyboard context may target a single current selected origin; stale or
ambiguous catalogs must not fall back to a component. Multiple/mixed selections
retain background commands. Background opening preserves selection; only the
explicit deselection command clears it. Wait for the renderer to remove the old
origin catalog before testing a subsequent keyboard command. Preserve existing
empty-selection Normal To semantics, native previews, history and persistence.

## Symmetry workflow deadline checkpoints — 2026-10-27

The six-case renderer workflow records a fixed family/stage checkpoint and
completed-case count before each original phase. These scalar diagnostics do
not accept native results, change action order or replace Save/Apply/history
predicates. Preserve all geometry/reference oracles and the original deadlines.

The deadline callback reads own data descriptors only. Include the bounded
family, stage, completed count and elapsed intervals; never serialize documents,
geometry, getters or arbitrary evidence objects while reporting a timeout.
The diagnostic clock is monotonic and tolerates invalid readings or exceptions.
A checkpoint identifies the pending phase; it does not prove the cause of a
slowdown, successful completion or a performance improvement.

## Configured component context ownership — 2026-10-27

Tree and viewport component menus share CadContextMenu. Resolve the exact
occurrence path, definition/revision and effective owner in the workspace's
current validated evaluation. Select that owner and occurrence before capturing
the menu ticket. Retain the exact evaluation and committed scene identities,
complete UI ticket and navigation revision; recheck them at action time. A
presentation target never grants geometry, file or native Apply authority.

Exclude operations, previews, relation drafts/picks, camera navigation and
dialogs. Keep Properties available for suppressed occurrences; a suppressed
owner disables all component mutations, and a suppressed occurrence cannot
start Fix/Float. Fix/Float must use the existing verified native preview with
explicit Apply/Cancel. Visibility and suppression use the existing validated
state edit/history/recovery path, including shared named-state semantics.

Opening or escaping a menu performs no document/file/kernel operation. Preserve
ContextMenu, Shift+F10, disabled-item navigation, initiating focus and selection.
Viewport origin/background commands and broader context/reference editing
remain separate unfinished work. This adds no saved schema or IPC command.

## Configured scope navigation and scene ownership — 2026-10-27

Changing the UI scope does not change the configured source, catalog or root
selector. An idle scope change may retain the exact scene shared by the
rendered state, sceneRef and committedSceneRef only when its complete native
context still matches the current document and generation. Exclude operation,
busy, preview (state and ref), relation draft (state and ref), camera navigation
and every New/discard/answer/saved-view dialog. Other cases retain revoke and
the existing fresh reconstruction path. Document changes, Apply, Cancel and
root-configuration changes retain their existing native invalidation.

Keep a separate monotonic UI navigation revision. Update its ref synchronously
before changing scope, and its React state so a batched return to the original
scope still renders a new owner. Include it in configured UI tickets, origin
tree and Normal To session identities. A previous callback must stay stale
after A to B to A even if the source, selected occurrence and native generation
are identical. This revision is transient UI state, never a native capability
or saved-document field.

Clear prior picks, normal/origin/BOM selections and the old occurrence during
the scope change; the tree's selecting handler may then retain its intended
destination. AssemblyViewport binds left selection gestures, right-button
context presses and origin-label pointer presses to the caller's interaction
revision. A release from an earlier scope must not reach the current selection
callback. Existing callers without a revision retain their previous gesture
semantics; current keyboard origin activation still checks its current binding.

The shared renderer scope helper requires an existing real build matching the
whole current source/catalog/root state, then checks exact recovery, unchanged
history/file guards and zero new worker requests after scope selection. It
returns that prior build explicitly for retained-scene assertions; it must not
manufacture a fresh worker reply. Native geometry oracles remain with each
owning workflow. Record performance measurements and their workload separately
from functional acceptance in [validation](VALIDATION.md).

## Editing document-local views — 2026-10-27

The shared saved-view dialog supports renaming a selected entry and replacing
its camera with the current stationary view. Both commands retain its ID and
catalog order. Rename preserves the exact saved pose; Update preserves the
name and all other entries. Capture and name admission use the existing strict
validators, including duplicate names, finite camera bounds and the 64-entry
limit. Editing remains possible at capacity; creating another view does not.

Keep these commands inside the current modal/document/scene ticket and the
existing metadata-only document transaction. No-op edits add no history. A
pending name changes nothing until Renombrar; Cerrar/Escape discards that text.
An explicit completed edit participates in document Undo/Redo, dirty state,
recovery and ordinary Save/reopen, while leaving the displayed camera, native
scene, geometric witnesses and file authority unchanged. Updating a saved view
does not recall it. File versions and the existing namedViews schema remain
unchanged; the earlier strict-reader compatibility limits still apply.

The renderer acceptance route retains its original distinct-pose and exact
camera-restoration assertions before editing. It then checks a rejected rename,
pending-name cancellation, explicit rename/update, Undo/Redo and a repeated
no-op update before saving and reopening the edited entry. Its new saved
baseline must first equal the independently authored second pose. Fixed typing
is restricted to the creation or rename input by its exact accessible label,
single modal, actual focus, editability and hit-test. Record execution separately
from this contract and from any claim about external software behavior.

## Origin-reference label pixel placement — 2026-10-27

Origin-reference buttons use rectangular borders and place their HTML boxes at
the nearest bounded integer CSS-pixel position. Preserve projected witness
`x/y`, binding, key and label data exactly. This is presentation layout only;
CAD coordinates, camera matrices and document data are unaffected.

Use the first actual snapped row to calculate grid capacity, rank cells and
place labels. Keep the existing four-pixel gap and reserved toolbar band. If
the full catalog cannot fit, retain all identities in the existing overflow
list. A valid fractional interval with no integer position retains bounded
clamping; it must not invent space or clip a button.

Keep exact camera-image assertions, text-exclusion definitions, projected-anchor
tolerances and deadlines unchanged. Runtime observations and the visual
comparison boundary are recorded in [validation](VALIDATION.md).

## Shared header menu visibility — 2026-10-27

`CommandHeader` owns only menu visibility and its disclosure/pin controls.
Callers and `AssemblyMenuBar` retain command identity, current disabled checks
and CAD/file authority. A renderer-memory preference starts pinned and survives
workspace remounts within that renderer session; it is not document data or a
persisted application setting. The initial pinned state preserves the existing
SolidFlow layout and is a project design choice.

Disclosure and pin buttons retain a 28px minimum height within the existing
35px row. Initial layout checks include the single pressed pin in the exact
control inventory and retain containment, hit testing and overlap checks.
Keyboard traversal from a pinned menu closes its popup, reaches the pin, then
continues to quick actions on the next Tab. Keep that intermediate focus target
explicit in both part and assembly acceptance routes.

Unpinning leaves a temporary menu row over the quick-action region. Those quick
actions remain in the layout but become hidden, inert and excluded from the
accessibility tree until the disclosure closes. Outside pointer/focus and
window blur close the temporary row. The existing popup consumes the first
Escape; a later Escape closes the row and restores its disclosure. ArrowDown
reveals and focuses the first menu; Enter retains native button activation.

Before executing a command from a temporary menu, focus the stable disclosure
and close the row. Dialogs must capture that connected return target before
their opening action runs. Keep the existing current-command/disabled/open-menu
guards ahead of this focus step. Fixed menus retain their prior focus return.

Header evidence uses three original PNG crops of the owned hidden test window,
bounded to 2,400 by 64 pixels and 256 KiB per image. Two animation frames precede
each requested image; expected DOM state is checked before and after. These
observations do not establish atomic DOM/compositor synchronization. They do
not replace actual input/focus checks or the existing camera comparisons.

## Previous-preset raster evidence — 2026-10-27

The shared camera acceptance route retains the accepted Top and Bottom preset
crops in its existing two diagnostic owners. A failed Previous comparison uses
the exact original accepted capture, before projection observations and public
frame copies. Bottom uses the second owner's identity; Top uses the first.
Release both owners before gesture coverage and in the final cleanup path.

Optional retention, comparison or cleanup errors must preserve the original
acceptance error. Diagnostic failure reports `unavailable`; it never changes a
pass criterion. Keep the original pointer/key sequence, stationary polls,
capture count, text exclusions, projected-anchor tolerance and byte limits.
This instrumentation retains observations; it does not establish a rendering
cause or fix a visual discrepancy.

## Native geometry through motion presentation — 2026-10-27

Explicit local angular motion shares its request-local native part owner between
the verified stations and the final display scene. The internal optional
presentation hook runs after every station and complete-turn check succeeds. It
receives a detached, deeply frozen final document and an expiring part provider;
it must complete synchronously and return `undefined`. The hook receives no
preview capability and cannot change the private candidate.

Register the final native capability only after successful owner cleanup. The
worker session requires a prepared scene before publishing its ready reply.
Scene failures propagate with any aggregated cleanup causes; failure to close
the shared owner after successful scene construction retains the existing
`rejected` / `reference` result. Attempt each owner release once and preserve
revocation when later token generation or reply copying fails.

No native cache survives the request. Complete definition-content admission,
fresh document-bound witnesses, placed-body copies, geometric checks, meshing
and resource limits remain required. A retained provider or inspection must
reject access after closure. Apply and other movement paths retain their own
reconstruction. Measure nested scene time without adding it to the inclusive
motion time; executed workloads and limits belong in [validation](VALIDATION.md).

## View-catalog coverage across existing workflows — 2026-10-27

A view-catalog change must update the independent exact expectations in the
basic-authoring background context, the shared assembly View-menu helper, the
compact viewport helper and the live-cut part-menu route. Checking only the
shared navigation route misses these existing consumers. Preserve literal
expected order, labels, shortcuts, roles, disabled states and keyboard focus;
do not derive expected inventory from the production catalog under test.

The live-cut menu's added presets shift Normal To, named views, Previous and
the display checkboxes by two positions. Its traversal still skips the same
unavailable functions, includes both enabled new presets and retains the cut
draft without another native request. Basic authoring retains the already
observed background target/actions before asserting inventory, then completes
that same evidence record after the existing keyboard/context checks. This
adds no input, evaluation, capture, wait or relaxed acceptance condition.

## Dimetric/trimetric commands and named-view diagnostics — 2026-10-27

The shared orientation catalog includes Dimetric and Trimetric in the Part,
standard assembly and configured assembly selectors and View menus. Both use
the existing Fit/Previous/session-history path and have no keyboard shortcut;
Ctrl+1 through Ctrl+7 and Ctrl+8 retain their existing commands. Normal To stays
last in the selector. The standard assembly background menu derives the same
catalog. No new document field or serialized preset name is introduced.

The new fixed directions use positive X/Y/Z and project world Y as screen-up,
retaining the ordinary Y orbit axis. Independent literal screen bases project
all corners of an original 10 x 6 x 4 box; category checks distinguish two equal
dimetric axis scales from three distinct trimetric scales. Keep exact camera
history, gesture ownership, workspace guards and named-view validation intact.

The shared renderer route appends actual View-menu selection and repetition of
both presets, followed by Previous returning to Dimetric and then Isometric.
Each step preserves observed worker/document/file/history authority. Selector
inventory is observed separately; this route does not select its new native
options. Existing exact crop comparisons, bounded text masks, projected-anchor
tolerance and operation deadlines remain unchanged.

Named-view diagnostics retain an additional, independently owned moved-image
baseline for the moved-to-Previous comparison. The exact accepted capture
object selects that baseline; a copy, stale object or different saved baseline
is rejected. Recall continues to compare against the saved-view baseline.
At most two baselines and the latest capture are retained, each capped at
2 million pixels. The moved baseline is released after each gesture and all
captures are released in finally. Failure-only pixel evidence keeps its
128 KiB limit. This adds no capture, input, evaluation or poll and must never
replace the original assertion. It is diagnostic evidence, not a rendering fix.

## Selection during camera navigation — 2026-10-27

Projected origin labels are camera-dependent: an axis endpoint outside the
viewport has no label, even if part of that axis remains visible and selectable.
The named-view renderer check compares persistent part/tree selection exactly
and requires every currently projected label to retain its known selected state.
Unknown or duplicate label identities fail. Its original fixtures explicitly
establish all three unselected root axes, or the configured selected root X and
its tree row, before navigation. The saved baseline must contain that complete
label inventory, so exact recalled-view comparisons cannot become vacuous.

A clipped label's DOM selected class is unobservable. Configured tree selection
provides the persistent witness; returning to a saved camera still requires the
exact original label inventory, projected anchors and existing pixel/mask checks.
Native reopening separately restores the original selection/visibility through
the actual controls. Failure diagnostics retain the already observed selection
and moved frame without adding input, capture, evaluation or waiting.

`test:desktop:assembly-shortcuts-compact` and
`test:desktop:assembly-configured-shortcuts-compact` request a hidden 1040 x 720
window and record its actual content dimensions. They reuse the original
shortcut recipes, ownership/security checks, deadlines and cleanup. CI runs
them in addition to the existing original-size scenarios; operating-system
window decorations and available display space can affect actual content size.

## Document-local named views — 2026-10-26

Part, standard assembly and configured assembly roots may contain an optional
`namedViews` catalog. Each entry has its own stable ID, name and detached
orthographic camera pose: position, target, up, vertical frustum, zoom and clip
range. Previous View remains transient session state and is never serialized.
An embedded part retains its own catalog; importing or reusing a component must
not promote that catalog into its parent assembly. A configured root catalog is
separate from its source document and configuration catalog.

Versions 1, 2 and 3 retain their existing interpretation when the optional field
is absent. Their older strict readers can reject files containing the new field;
do not promise those readers will preserve or understand it. Omitting the last
deleted catalog avoids leaving an empty extension in the document. Loading,
serialization and recovery validate the same optional data before acceptance.

Limit a catalog to 64 entries and a name to 80 UTF-16 code units. Creation trims
and normalizes a name to NFC; imported names must already have that form.
Locale-independent lowercase keys detect name collisions. IDs are unique,
bounded to 128 code units and cannot contain control characters. Accept only
exact data fields and dense arrays, and return detached values. Reject malformed
cameras without normalizing them: finite bounded coordinates, unit up,
nondegenerate direction/basis and representable projection values are required.
The current viewport aspect must also admit the horizontal projection at recall.
No saved view carries native geometry, references or an Apply capability.

The desktop Save envelope admits this optional field and independently validates
its catalog and numeric camera data at roots, configured sources and embedded
parts before any dialog or write. It retains its bounded envelope role; full
CAD graph validation remains in the model. File grants, sender checks, the
document byte limit and atomic writes are unchanged. Invalid metadata must not
overwrite a previously authorized file or revoke its existing grant.

Creating or deleting a view is one document-history transaction. It affects
dirty state, Save/Save As and recovery. A metadata-only adoption may preserve
the current geometric scene only when the complete document excluding its root
`namedViews` field remains exactly equal and the scene is already confirmed for
the current document. Apply the same rule to Undo/Redo; otherwise retain the
ordinary invalidation/rebuild path. Never omit nested catalogs, timestamps,
revisions, configuration context or other document data from that comparison.
Native snapshot, witness and worker authentication remain complete.

Recall resolves an entry from the current document and restores its camera
without Fit or a CAD operation. It leaves document dirty state and document
history unchanged. One effective recall adds one Previous View entry; a no-op
does not. Restore vertical framing and use the current viewport aspect for
horizontal framing. Creating, deleting or canceling a catalog entry does not
move the camera. The existing ten-entry camera-history limit still applies.

The shared catalog dialog owns one committed document and scene context.
Revalidate that context on every action; New/Open, remount, a different scene,
active geometry edits or a gesture invalidate an old dialog action. The modal
contains focus and keyboard input while preserving native text editing. Its
toolbar and menu entry use the same availability and ownership checks.

## Retained pixel observations for view restoration — 2026-10-26

The opted-in camera comparison can report up to sixteen differing pixel centers
and clipped 3-by-3 neighborhoods from its two already retained captures. Prefer
differences in the existing comparison buffers, then fill the remaining slots
with distinct raw differences. Complete counts, bounds and grids still describe
every differing pixel. Native byte positions are reported without assuming
RGBA/BGRA order; each neighborhood records both original mask-membership bits.

Retained metadata combines the existing canvas/label rectangles with the crop
and bitmap scale. The same DOM evaluations additionally observe device-pixel
ratio and a fixed set of twelve computed style values. Each style string is
bounded to 192 characters.
The additional metadata hashes label keys and does not duplicate label text.
These observations precede capture and do not establish synchronized compositor
state or ownership of a pixel.

Keep this metadata outside the public camera frame and its stability signature.
Only the existing failed comparison requests the extra report, capped at 128 KiB;
optional diagnostic failure must preserve the original statistics and failure.
Returned data is detached, and clearing the retained pair releases its metadata.
Do not add captures, evaluations, gestures, waits, mask expansion or acceptance
tolerances. This is test evidence, not a change to camera or label behavior.

## Native part reuse during ordinary assembly Solve — 2026-10-26

An ordinary assembly Solve request can reuse completed local part reconstruction
across its reference snapshots and final display scene. Admission compares the
complete validated definition content; matching ID/revision labels alone do not
establish a reusable part. Changed content follows the private reconstruction
path. The shared inventory belongs to that request and has no lifetime across
requests, saved documents or worker sessions.

Every snapshot still authenticates its own document, placements and witnesses,
and every final relation is checked against current native geometry. The scene
borrows only guarded inspection/copy operations and detached presentation data.
Each placed occurrence retains its independent body copy, validation, meshing,
physical measurements and existing resource limits. Presentation preserves the
ordinary mesh order, current picking identities, names, warnings and optional
vertex-catalog admission.

The shared native owner must close successfully before a new preview token is
stored. Preparing the complete reply must also succeed before that publication.
Failures revoke the candidate; an expired lease cannot inspect or copy geometry.
Apply, configured assemblies and the existing movement routes keep their own
reconstruction paths. Executed equivalence checks and timing comparisons belong
in [validation](VALIDATION.md), with their measured cases and limits.

## Names in standard relation reference cards — 2026-10-26

The two generic reference cards in the standard assembly Relations inspector
show current occurrence names instead of internal IDs. Resolve a component's
scope-relative saved path against the current document tree, requiring a unique
complete path and its exact definition/revision. Nested names include their
ancestor names; same-named siblings receive a display-only instance ordinal in
document order. Missing or incompatible declarations show `Referencia no vigente`
rather than borrowing another component's name.

Derive these labels from current rows during rendering. Names and instance
ordinals are presentation only: they never replace saved identity or authorize a
reference. The original reference remains available in the card's tooltip.
Current-scope datums and empty roles keep their existing labels. Other relation
panels and the configured workspace retain their existing presentation.

## Basic symmetry Save observations — 2026-10-26

The basic five-family symmetry renderer route now uses the same passive Save
observer as the symmetry-picking route. The test-owned IPC proxy records each
request's ordinal, categorical destination and canonical content hash, then its
pending, fulfilled or rejected state, observed duration and sanitized rejection.
`completed: false` alone does not distinguish an outstanding handler from one
that rejected. A handler duration does not isolate a filesystem operation.

The file predicate retains only its latest existing read, bounded to 4 MiB for
diagnostics. After the wait, one summary compares that read with the original
committed Apply document and reports hashes, parse/read status and differing
top-level fields. Its return value never decides acceptance. Reset the retained
read state before each existing read so a later read error cannot report stale
successful bytes. Raw content and personal paths are not added to the report.

Keep the five families, saved-document predicate, read count, polling interval
and deadlines unchanged when maintaining this observer. It adds no write retry,
file read, renderer evaluation or production persistence change. The proxy tests
exercise both symmetry route flags and preserve the original return and thrown
error identities. See [validation](VALIDATION.md) for measured cases and limits.

## Native part reuse during explicit motion — 2026-10-26

One explicit component-motion request can reuse the native local geometry of
unchanged part definitions across its verified stations. Admission compares the
complete validated part definition, including its content, rather than trusting
its ID and revision alone. Different content uses a private reconstruction.
There is no cache shared between requests, saved documents or worker sessions.

Every station still creates new document-bound reference snapshots, resolves
current placements and performs the existing native checks. Placed supports,
witnesses, solver outputs and motion acceptance are never cached. Per-snapshot
body and reference limits remain in force, including reused entries, and the
retained native inventory has its own cumulative limits.

The operation owns shared native geometry and releases it before the final
preview becomes authoritative. Individual snapshots release only the geometry
they own. A fatal native failure revokes shared borrowers; cleanup failures
prevent a successful result. Apply authenticates and commits the private pending
candidate; the worker then rebuilds its scene separately, with no retained pool.
Recorded measurements and executed validation belong in [validation](VALIDATION.md).

## Wheel-history raster diagnostics — 2026-10-26

The part-from-empty and standard/configured shortcut routes can retain two
existing camera crops for the final Previous View comparison after wheel zoom,
Fit and a temporary Front view. The retained baseline is the original result
accepted by the unchanged stationary-frame wait, before projection witnesses
are read. Only the latest candidate and that baseline are retained, with a
bounded pixel count; pixel buffers are never added to the public frame object
or its stationarity signature.

If that original comparison fails, a compact diagnostic reports the changed
pixel counts, maximum byte differences, bounding boxes and a fixed 4-by-4 grid.
Raw and unmasked comparisons remain distinct, using the existing text masks.
No additional screenshot, input, camera-state read, wait or acceptance tolerance
is introduced. Diagnostic errors cannot replace the original failure, and the
retained buffers are released when the view workflow finishes or throws.

These observations distinguish where a raster mismatch occurs; they do not
establish that the camera history is wrong, fix a rendering defect or establish
platform support. Executed checks and their limits belong in [validation](VALIDATION.md).

## Hosted interaction diagnostics — 2026-10-26

The Normal To renderer route retains pointer, End and Enter for the orientation
selector on Windows and Linux. On macOS it reaches the closed selector through
bounded native Tab/Shift+Tab input, then types `n` only when Normal is the unique
enabled visible matching option. Read-only DOM guards check focus, visibility,
hit testing and absence of a dialog or menu. This route does not exercise the
macOS native dropdown with the mouse.

Passive, bounded DOM listeners record delivered keys and input/change values
before React resets the command selector. On macOS observation begins after
focus traversal. Every platform requires trusted input and change events for
Normal, without dropped observations, before the existing independent geometric
hit. Observations do not modify controls or inspect camera/React state, and
listeners are removed on success or error. An enabled button alone does not
establish that the selector executed Normal To. Actual platform acceptance is
recorded separately; helper tests do not prove native macOS delivery.

The symmetry-picking route records each native Save request and outcome,
including a sanitized rejection or a still-pending handler. Its file comparison
retains the latest result of the existing read, then summarizes it against the
original committed Apply document. These observations do not retry a write,
read an additional file or change the saved-document predicate or deadlines.
The shared source-revision observer's stricter return predicate is not used
as symmetry acceptance. Handler durations describe the observed intervals;
they do not identify an individual filesystem operation as the cause.

These diagnostics run only in the existing isolated, test-owned workflows.
They do not change production controls, IPC admission or document persistence.
See [validation](VALIDATION.md) for executed cases and unresolved hosted errors.

## Stable part selection actions — 2026-10-26

The part tree has one permanent selection footer. Its two fixed-height rows
show the current selection and its actions: sketch/plane creation for a face,
or edit/suppress/delete for an operation. Curved faces retain the existing
disabled planar-creation controls. Full action names remain accessible through
button labels and tooltips; long selection names are truncated with their full
text available in the title.

Selecting a tree occurrence after a face changes this footer's content without
resizing the tree or clamping its scroll position. A second click at the same
pointer position can therefore edit the same occurrence. No delayed selection,
retargeted click or alternative double-click handler is introduced.

The Normal To renderer route uses a 1040 x 720 test window and compares the
row, tree, footer and scroll position across the first click before dispatching
the second click. Fresh face-based sketch creation and the existing operation
editing routes remain separate checks. See [validation](VALIDATION.md) for
executed results and limits; the window size is one checked case.

## Returning from datum browsing to component manipulation — 2026-10-26

Arming **Arrastrar posición** or **Arrastrar giro** clears both the browsed
tree datum and its Normal To presentation selection. The retained component
becomes the active manipulation target with no datum overlay. A component
alone remains an unsupported Normal To target; this transition does not
become a no-selection request or change the camera, document or model history.
The existing eligibility and active-operation guards remain in effect.

Context menus include **Normal a** alongside their existing commands. A current
planar datum enables it; a tree-selected component or background context that
retains that component disables it. Origin navigation, component mutations,
ordered standard views and Previous View retain their separate availability.
The origin-axis and basic-authoring renderer routes check these interactions;
executed results belong in [validation](VALIDATION.md).

## Selection-derived Normal To — 2026-10-26

**Normal a** (Ctrl+8) is available through the orientation controls and View
menu in part, standard assembly and configured assembly workspaces. In 3D,
it resolves the current selection to a world-space orientation, then invokes
that workspace's existing Fit. It does not retain the current zoom when
executed. Previous View restores the prior camera framing, including its zoom
and pan, independently of model Undo and the saved document.

SolidFlow defines the following orientation policy:

- A planar face or datum uses its current normal for the target-to-eye
  direction and its natural frame Y (`normal × xDirection`) for screen up.
  Part sketches and features with exactly one current, valid input sketch use
  that sketch's frame. Assembly root and component datum planes use their
  evaluated world placement, including inherited rotation and translation.
- A cylindrical or conical face uses its native analytic surface axis and
  radial frame. This is presentation metadata; it does not introduce a new
  solver support or admit a standalone model axis or edge as a view target.
- Ctrl/Meta selection retains an ordered pair of planar references. The first
  normal sets the target-to-eye direction; the second normal, projected
  perpendicular to the first, sets screen up. Reversing the order changes the
  result. Parallel or opposed normals cannot define this pair.
- With no selection, the nearest of the 24 proper cardinal orientations is
  chosen by minimum complete orientation rotation, including screen up.
  Ties are deterministic: Front/Back, Left/Right, Top/Bottom, with natural up
  before the quarter-turn alternatives. This is not independent rounding of
  the three direction coordinates.
- Repeating Normal To for the same ordered identity and world geometry
  alternates the viewing side while retaining up. Executing Normal To for a
  different target, an effective navigation gesture, another view command or
  a new document resets that repetition. An empty selection has no side-flip cycle.

Ordinary assembly clicks still select components and separately nominate the
hit face for viewing. Tree and BOM component selections are unsupported view
targets until a compatible face or plane is chosen; retaining a component
through a rebuild does not turn it into an empty-selection request. Modified
selection toggles references without dropping a third or fourth identity.
More than two references, unsupported curved surfaces, hidden or ambiguous
faces and stale document/scene/scope/session selections disable Normal To.
Invalid selection does not execute nearest, consume a camera request or add
history. Relation picking and previews keep their own selection ownership;
camera nomination does not edit their references or drafts.

In the existing 2D sketch editor, Normal To requests the editor's 2D Fit.
It does not flip a 3D side or add to 3D camera history. The prior 3D camera
remains owned by the surrounding part workspace. Named custom views, dimetric
and trimetric presets, standalone edge/axis targets and arbitrary curved-face
orientation are outside this increment.

`npm run test:desktop:normal-to-view` is the dedicated production-renderer
route for the original part, standard assembly and configured root-state
fixtures described in [provenance](PROVENANCE.md). Native extraction tests,
mathematical orientation tests and renderer interaction checks establish
different facts. Recorded local results and remaining platform limits are
listed separately in [validation](VALIDATION.md).

## Replace saved standard relation references — 2026-10-26

The standard distance, ordinary angle, coincidence and concentricity editors
allow either ordered reference to be replaced or cleared. Select its numbered
field before choosing a compatible face, origin plane or origin axis. Ordinary
angles also accept current native LINE edges. Distance and coincidence require
planes; concentricity requires cylindrical face axes or origin axes. The type,
relation ID, suppression and parent-definition scope remain unchanged.

Reference selection changes only the current editor draft. A complete compatible
pair must pass a fresh native preview before Apply can commit it. Cancel revokes
the preview and retains the reference draft and parameter fields for retry;
ending the editor discards that draft. Apply, Undo/Redo, document replacement and
scope/session changes end the editor. Pick callbacks recheck the retained draft,
active slot and current document/scene before accepting visible geometry.

A concentric rotation capture belongs to the ordered component owner frames.
Replacing an axis on the same owners preserves its exact quaternion, subject to
fresh solver verification. Changing either owner or their order requires an
explicit **Desbloquear giro**. The editor neither transfers nor recaptures a lock
implicitly. This is SolidFlow's declared editing policy; static declarations in
another application do not prove its runtime interaction or lock policy.

The original `test:desktop:assembly-mate-reference-edit` route covers the four
editors separately from the existing basic-authoring route. Its source fixture
and independent geometry expectations are recorded in [provenance](PROVENANCE.md).
Only executed results in [validation](VALIDATION.md) establish a checked case;
this does not add configured-workspace reference editing or certify all platforms.

## Direct camera input and bounded symmetry observation — 2026-10-26

Part and assembly viewports use direct camera manipulation. Middle-button
orbit, modified-middle pan and wheel zoom end at their last input pose, with
no inertial tail or automatic rotation. The shared configuration also applies
when controls are recreated for a changed up direction or focus-loss cancel.
Input handlers and explicit Fit update controls; render frames do not advance
them again. Before rendering, the completed pose is reapplied to prevent
vector/spherical round-trip drift. Empty gestures retain their starting pose.
This is an explicit interaction policy, not proof of another application's
runtime behavior.

Camera history still records one effective gesture and remains separate from
model Undo. View commands stay blocked while the gesture is held. Cancel, Fit,
resize, sketch remount and New/Open keep their existing ownership rules.
Gesture finalization also checks the actual pose when controls emit no change
event. Translation comparisons use visible height/zoom with a floating-point
rounding floor, preserving the fine pan in the covered high-zoom and
translated-origin cases.
Numerical tests use real installed controls and compare complete poses,
quaternions and matrices immediately after input and after subsequent frames.
Renderer checks retain exact crop comparisons, bounded text masks and their
existing deadlines; record actual results separately in [validation](VALIDATION.md).

The symmetry-picking renderer workflow reads scalar counters where it only
needs a serial and filters the requested worker response before copying it
across the renderer boundary. The full selected response and all worker errors
remain available. Exact completed cardinality must be at most one before a
response is accepted; a bounded diagnostic summary cannot replace that count.
Original geometric checks, pointer picks, saved files and deadlines remain.

## Source revision Save diagnostics — 2026-10-26

The source-revision renderer workflow retains one bounded last-observation
record for its normal Save. It separately reports equality with the complete
Apply-authored graph and the number of completed chosen saves; acceptance
still requires both exact graph equality and exactly one completed save.
The expectation is frozen before Save, with no later recovery or disk recapture.

For that workflow only, file IPC records request/return destination categories,
request raw/canonical hashes and a bounded rejection description. Diagnostics
omit file paths, document contents, stack and causes. Malformed saved JSON uses
a fixed diagnostic category because parser messages may quote input. The
original IPC/read/parse errors are still propagated unchanged. No retry, new
file read, additional awaited action or deadline change is introduced.
The existing final byte, geometry, history and parent-review checks remain.
See [validation](VALIDATION.md) for executed results and unresolved causes.

## Standard views and previous camera states — 2026-10-25

Part, standard assembly and configured assembly share seven standard views:
Front, Back, Left, Right, Top, Bottom and Isometric, on Ctrl+1 through Ctrl+7.
The compact orientation selector and View menu use the same declarations.
Front looks toward the XY plane from +Z with +Y upward; Top looks from +Y
with -Z upward. Isometric uses equal positive X/Y/Z direction components.
These presentation conventions do not transform the saved geometry.

Previous View (Ctrl+Shift+Z) consumes up to ten prior camera states. Model Redo
remains Ctrl+Y. Camera history is separate from document Undo and serialization:
effective named-view changes, Fit and actual navigation gestures can be undone
without changing the CAD model. Repeated identical views do not add entries.
The 3D camera survives entry into and cancellation of a sketch, whose 2D Fit
uses a separate request. New/Open establish a new camera-history session.

The implementation uses public OrbitControls events and methods. Native input
transport is exercised by the existing part-from-empty and both assembly
keyboard routes: seven presets, middle-button orbit, modified middle-button
pan, wheel zoom and Previous. The part route additionally checks a sketch
round trip after zooming. Exact central-render-crop restoration excludes the
bounded HTML origin-label text rectangles; their projected SVG anchors are
checked separately. This avoids treating text compositor antialiasing as a
camera change. The rendered restoration checks are separate from independent
mathematical orientation tests; neither proves all view tools
or platform parity. Normal To now has the separately scoped policy and recorded
acceptance described above; these earlier routes do not establish its coverage.
Named custom views, dimetric and trimetric presets remain separate work.
Record actual executed cases in [validation](VALIDATION.md).

## New document choice and authoring from empty — 2026-10-25

New (`Nuevo…`, Ctrl+N) opens a shared Part/Assembly chooser in the part,
standard assembly and configured assembly workspaces. Part creates an empty
part; Assembly creates an empty standard assembly. This is document replacement,
not insertion into the current model. The existing part-to-assembly copy command
remains separate.

Cancel or Escape closes the chooser without replacement. While it is open,
keyboard and pointer ownership prevent background commands and repeated New
requests from creating another replacement. A selected choice then uses the
workspace's existing unsaved-change decision; cancelling that decision also
preserves the current document. The request rechecks current document/session
and operation state after both asynchronous boundaries. Busy work, active
editors, staged changes, previews and pending file/replacement operations retain
the workspace's existing guards: New does not accept or discard an active draft
implicitly. A successful new document starts with its own identity and history.

After building, run `npm run test:desktop:part-from-empty` for the fixed
production-renderer route. It starts without an input fixture, checks chooser
cancellation and creates four original rectangular sketches with pointer strokes,
followed by extrusion, through-all cut, merged boss and blind pocket. Parameter
fields use existing controls. It checks Undo/Redo and a single Save As/reopen;
the only Open grant is the file just saved. The route runs in the persistence
CI batch under the existing deadlines. See [provenance](PROVENANCE.md) for exact
coordinates and tolerances and [validation](VALIDATION.md) for actual results.
Its implementation does not itself establish passing execution, all three
workspace interactions or platform support.

## Assembly keyboard commands — 2026-10-25

Standard and configured workspaces register keyboard commands while mounted.
They reuse the current menu callbacks and disabled predicates. Ctrl+O opens,
Ctrl+S saves, Ctrl+Shift+S saves as, Ctrl+Z undoes, and Ctrl+Y redoes.
Ctrl+Shift+Z invokes Previous View as described above;
it does not redo document edits. Ctrl+N now opens the shared Part/Assembly
chooser in both assembly workspaces, as described above. F fits the view; Ctrl+1
through Ctrl+7 select the seven standard views. The matcher also recognizes Meta,
but platform execution must be recorded separately.

Text fields retain native Undo/Redo and unmodified typing. Composition, repeats
and unsupported modifiers cannot repeatedly invoke application commands.
Dialogs and open menus own their keyboard events. With no such owner and focus
outside a field, Escape stops active reference picking first, retaining its
references and fields; otherwise it invokes the available Cancel command.
It does not automatically accept a relation or clear its fields.

Saving from the standard component-name field crosses its existing blur
validation before serialization. Invalid text is restored and the shortcut
does not save it. Open/New after a changed name requires a fresh invocation
once the rebuild finishes; no deferred command is queued. Other parameter
fields retain their existing draft semantics and command guards.

The two `test:desktop:assembly-shortcuts` and
`test:desktop:assembly-configured-shortcuts` routes use original tracked prism
recipes and actual keyboard transport. They run in the existing persistence CI
batch. See [validation](VALIDATION.md) for the cases actually executed; configured
CI alone establishes neither platform support nor complete shortcut parity.

## Edit saved coincidence and concentricity — 2026-10-25

The standard relation list offers **Editar coincidencia** and **Editar
concentricidad**. Name and Orientation are editable; Type remains read-only.
The ordered references can now be replaced as described above. The edited relation keeps its ID, suppression and
parent-definition scope. Finish any other relation editor first. Edits in a
reused subassembly still affect the shared definition.

A concentric edit preserves the exact saved rotation lock. **Desbloquear giro**
is available only when that relation already has a lock; it explicitly removes
the lock through **Vista previa de la relación editada**, followed by Apply.
Changing orientation while retaining a lock may be incompatible and is checked
by the existing solver. No automatic recapture or quaternion entry is provided.
The existing verified-preview capture route remains available after leaving
this editor. Capture and generic Resolve are blocked while it is active.

Cancel revokes the preview but retains name, orientation and unlock intent for
retry. **Terminar edición de relación** leaves without committing. Apply,
Undo/Redo, document replacement and scope changes end the editor. Declaration
tickets bind the document, exact scope and document session, including a
byte-identical reopen; preview-generation changes alone retain the fields.
The document schema and native solver are unchanged. See [validation](VALIDATION.md)
for executed cases and limits; this does not establish configured-workspace
editing or general interaction parity.

## Create an assembly from the current part — 2026-10-25

**Archivo → Crear ensamblaje con esta pieza**, also available as **Con esta
pieza** in the ribbon, starts a new assembly containing an independent embedded
copy of the current committed part. Accepted changes that have not been saved
are included. The first occurrence is fixed at the common origin, with identity
placement and no mates. Ordinary import and reusable-source insertion retain
their existing floating default. **Nuevo ensamblaje vacío** remains separate.

The command requires a healthy, current build of the complete committed part,
with solid geometry and no active editor, staged sketch, pending file operation
or replacement confirmation. It neither accepts nor cancels a draft. Transfer
is synchronous and validates the embedded snapshot and assembly file-size
limit before replacing the workspace. Failure leaves the part in place.

The assembly starts unsaved with its own file identity. Creating or saving it
does not write to the part's original file. The part's feature identities and
declarations are preserved; its session Undo history and external file link are
not transferred. Save the new assembly to retain the embedded copy. This is a
document composition command, not a new geometry algorithm or a live source
link. See [validation](VALIDATION.md) for the executed cases and limits.

## Rigid assembly workflow timing — 2026-10-25

The rigid renderer test reports passive timings for authoring, source updates,
movement, dragging, projection, interference, translation, BOM and gears.
Fixed counters measure existing renderer evaluations, pointer dispatches,
wait inspections, 100 ms sleeps and assembly response waits. A deadline captures
pending operations synchronously, without another renderer request. Inclusive
categories overlap: a response wait contains polling, sleeps and evaluations;
these totals must not be added or interpreted as native solver time. Evaluation
time includes any existing pending-Save barrier and transport scheduling.

Source-update polling reads the completed response projection instead of the
entire accumulated history. It retains the exact completed-match count, selected
record and every worker error; more than one completed match still fails.
Final checks that only need serial/error counts use the existing counters.
The full history remains available for geometry and document oracles. Actions,
poll cadence, deadlines, solver checks and tolerances are unchanged. Diagnostic
unit tests run with `npm test`; validate the complete route with
`npm run test:desktop:assembly` after building.

## Saved ordinary angle editing — 2026-10-25

The standard relation list offers **Editar ángulo** for a saved ordinary
angle. Name and **Ángulo de relación** remain editable; Type is read-only.
The ordered geometry references can now be replaced as described above.
There is no alignment control.
The current model uses the principal domain 0–180 degrees, including both
endpoints. Blank, nonfinite or out-of-range input cannot submit an edited
preview. This domain describes this application's model, not interaction or
angle-convention parity with another application.

**Vista previa del ángulo editado** updates the existing relation without
changing its ID, suppression or parent scope. Finish any
other reference editor first. Cancel revokes the preview while retaining name
and angle for retry; **Terminar edición de ángulo** leaves without committing.
Apply, Undo/Redo, document replacement and scope changes clear the edit.
Document/scope/session tickets reject stale editors, including byte-identical
reopening; preview generation changes alone do not discard the fields.
New relation creation remains blocked during editing; reference picking edits
the current draft as described above.
The existing solver, preview freshness, history and file paths are unchanged.

The original authoring route adds Guía Z first and Base Z second at 30 degrees,
then edits the name and angle to 60. It previews and cancels 60, 0 and 180,
retries 60 and applies, then checks Undo to 30 and Redo to 60 before saving and
reopening all three relations. Cancel checks recovery, history controls,
retained fields and revoked Apply; it does not independently measure the
restored displayed scene. Existing portable/manual checks predate this editor.
See [validation](VALIDATION.md) for executed snapshots and bounded results.

## Saved standard distance editing — 2026-10-25

The standard relation list offers **Editar distancia** for a saved signed
distance. The editor reuses Name, Signed distance and Orientation, while Type
remains read-only. The ordered reference controls now edit the current draft.
Finish another
relation editor first. **Vista previa de la distancia editada** updates the
existing mate through the normal native preview path; it preserves the mate
ID, suppression and parent-definition scope. New relation
creation is blocked until **Terminar edición de distancia** or successful Apply.
Blank or nonfinite distance values cannot submit a preview.

The edit ticket binds the committed document, exact scope and document session.
Preview and Cancel may change the worker generation without ending the editor;
Cancel retains the name, signed value and orientation for retry. Apply, Undo,
Redo, document replacement and scope changes end the edit. The existing preview
freshness and Apply guards remain authoritative; no schema or solver change is
involved. Reused subassemblies retain shared parent-definition edit semantics.

The original three-piece authoring route now edits its root-to-Guía distance
from -10 to -12 mm, changes its name, previews both orientations and cancels
before retrying aligned. It checks Apply, Undo/Redo and the final saved reopening.
Cancel checks recovery, history controls, retained editor fields and revoked
Apply; it does not independently measure the restored displayed scene. The
earlier portable/manual checks predate this feature. See [validation](VALIDATION.md)
for executed snapshots, results and remaining limits.

## Standard assembly context actions — 2026-10-25

Right-clicking a standard assembly component selects that exact occurrence and
opens Properties, Move, Fix/Float, Hide/Show and Suppress/Activate commands.
The tree remains global when the relation scope changes. These commands use
the existing parent-definition edits; editing a declaration in a reused
subassembly still affects its equivalent uses. Move is unavailable for a fixed
or effectively suppressed component. Hidden/suppressed rows remain available
in the tree for restoration.

Tree datum menus browse the selected origin and navigate to its owner or the
origin controls; opening a menu never assigns a relation role. Selected tree
overlays keep their global frame, while ordinary overlays use the current
scope. Datum context browsing currently requires the Model panel. Background
menus retain selection and expose existing view commands. ContextMenu and
Shift+F10 are supported on tree rows and the focused viewport; Escape closes
the menu, restores focus and retains selection.

The shared context-menu component retains the part adapter's selectors and
keyboard behavior. Assembly targets are revalidated against the current
document, occurrence/definition, selection, scope, scene, generation and
document session before activation. Drafts, previews, active reference picking,
dragging and staged edits block context actions. Reopening a byte-identical
document invalidates the previous menu through its workspace session.

The bounded authoring renderer checks tree targeting, Properties focus,
Fix/Float, datum browsing, viewport background pointer input and component
keyboard context. It retains geometry/history/file checks. It does not yet
establish body/datum context picking by actual pointer, every state toggle,
configured menus or exact menu-inventory parity. See [validation](VALIDATION.md)
for the executed snapshots and remaining limits.

## Presentation during hidden renderer tests — 2026-10-25

The isolated UI harness observes real compositor presentations from production
page load until workflow completion. This keeps hidden-window frame scheduling
from dominating acknowledged pointer input and animation-frame barriers. It
does not fabricate frames, input events, application state or worker replies.
Production window preferences, security checks and test deadlines are unchanged.

One subscription owns the window. Assembly, active-profile and body-catalogue
captures wait through that same observer before taking their hidden snapshot;
they do not replace or stop the subscription. Completion and failure stop the
observer and settle pending presentation waits, preserving the primary failure.
The result records observed frames, capture barriers and final observer state.

These runs exercise a hidden window with active presentation observation. They
do not establish normal background performance, OS focus or a particular frame
rate. Keep the complete assembly and accumulated symmetry workflows intact;
their geometry, history and file checks remain distinct from presentation.
See [validation](VALIDATION.md) for the executed source snapshot and limits.

## Basic standard assembly authoring — 2026-10-25

Component naming commits on blur. Automatic scene rebuilding now owns activity
separately from explicit commands: the next click on Fixed, Visible, Suppressed
or Save can act on the committed document while that rebuild is pending. Both
owners still block native selection, solving and Apply; each completion releases
only its own activity, and stale build responses retain their generation checks.
Staged source changes and root-revision editing continue to block these document
actions. The renderer route explicitly checks name-to-Fixed and name-to-Save As
with one pointer click and no intervening Tab or rebuild wait. File contents and
reopening must contain the final name. See the latest validation entry for the
executed snapshot and limits.

A rejected component name restores the committed text on blur and retains the
visible validation error. Empty text, whitespace-only text and names longer than
200 characters remain invalid under the existing parser. Rejection does not
commit a document/history change or submit worker work. The renderer prepares
these values on the visible input and uses actual Tab to trigger blur, checking
restored text, recovery, complete worker observations, counters and history
controls. Valid name-to-Fixed and name-to-Save As routes remain in the same
workflow. Build, the 215-checkpoint renderer, full suite and desktop smoke pass
on the same 1,137-input snapshot; see [validation](VALIDATION.md) for the bounded
results. The separate manual check of the earlier portable package does not
validate this rejection fix.

The insertion-continuity implementation passes the bounded local authoring,
import and origin regressions. After importing
or reusing a component, the transition selects the exact new occurrence
and opens Properties with focus on its name only after its current rebuild has
completed. A stale insertion must not move focus or selection after navigation,
scope changes, Undo, document replacement or a cancelled picker. Existing
mutation, freshness and preview guards remain authoritative.

Insertion keeps identity pose and `fixed=false`; selecting the new component
does not move it out of overlap or automatically ground the first instance.
The bounded three-piece walkthrough fixes its base and moves the other pieces
explicitly. It exercises current distance and parallel relations, preview,
Cancel/Apply, history and file persistence rather than adding a CAD family.
The renderer checks this automatic focus before navigation/scroll assistance,
then checks that cancelling another import retains panel, selection, recovery,
history and complete worker observations; the two expected busy-state UI audit
events are checked separately. After numeric placement, the route explicitly
uses Ajustar before origin picking; movement does not auto-fit. Visible numeric/name/select fields are
scripted; pointer actions and remaining Tab-to-commit naming use actual input transport.
Selected run 07 and bounded manual reuse/Undo and final image reviews pass.
The complete suite and desktop smoke also pass on the same final 1,135-input
snapshot. This establishes the recorded workflow, not exact behavioral parity
for menus, buttons, context menus or navigation; that audit remains separate.
See [validation](VALIDATION.md) and
[the standard walkthrough](DEMO_ASSEMBLIES.md#standard-three-piece-authoring).

## Standard assembly reference controls — 2026-10-25

The standard assembly Relations inspector owns one origin-reference disclosure,
`#assembly-relation-origins`, after the generic reference roles and guidance
when present, and before the face controls. The previous viewport overlay is
removed. Its existing axes/planes toggles, scope/selected-component/both owner
selector and origin-picking action remain single instances with unchanged
callbacks. The disclosure is present for all relation families; unsupported
origin picking stays disabled under the existing type and freshness guards.

The native `details`/`summary` control starts closed. Enabling axes or planes,
or arming origin picking, opens it. Closing it preserves visibility settings,
references and an armed picker; its summary shows the active role. Leaving
Relations still disarms picking through the existing navigation path. Panel
disclosure changes presentation state, not the CAD document or solve authority.

Disclosure updates skip dispatch when the open value is already current. This
addresses the ticket mismatch observed in runtime diagnostics; a parent-only
render is the explanation inferred from source inspection, not an executed
minimal reproduction. Ticket and freshness guards remain intact. The compact
standard origin workflow now passes real pointer and Enter disclosure
activation, retained reference/recovery/native
observations and current origin selection. Configured layout and CAD algorithms
are unchanged. Configured origin, rotation-lock and compact configured picking
regressions also pass on the same final snapshot. A bounded Windows manual
check assigns the first origin role and retains it through pointer/Enter
folding; four final captures receive a separate bounded visual review. The
full suite and smoke pass on the same final snapshot; current-head hosted
acceptance remains pending. [Validation](VALIDATION.md) records exact scope,
earlier failures, separate diagnostics and the final input snapshot.

## Shared command header — 2026-10-25

Part, standard assembly and configured assembly now use a shared presentational
`CommandHeader`: brand, menus, quick actions, document identity and utilities
occupy one 35 px row above the existing command ribbon. The former separate
quick-action row is removed. Part search remains the tree filter; assembly
utilities identify the workspace. Compact assembly actions retain accessible
text and titles even though their visible presentation is icon-only.

Callers still own callbacks, enabled states, dirty/file identity and menu focus.
No CAD action, reference, draft or document schema is added. Menu popups retain
their existing keyboard handling and are not clipped by the shared header.
The layout keeps menus visible; menu auto-hide and pin/unpin interaction remain
open work. Build and the bounded body-catalogue renderer pass; the latter
checks actual header containment and hit targets at compact width. Its measured
34 px increase applies to that fixture's tree at unchanged content size, not
all viewports. Parts, standard/configured origin-axis and compact configured
picking checks also pass. After a harness-only follow-up to the revolution
tree-layout wait, revolution, parts and rigid assembly pass on the final
snapshot, followed by configured persistence. Production remains unchanged
across that update. Bounded standard-assembly manual checks pass at minimum and
maximized sizes, and eight retained captures pass bounded visual review.
Lower compact editor content still requires scrolling. The full suite and
desktop smoke pass on the final snapshot. Hosted acceptance of the new head
remains pending; [validation](VALIDATION.md) distinguishes the two input
snapshots and retained renderer results.

## Body catalogue in the part tree — 2026-10-25

The browsing body catalogue sits inside the document tree, below Part
properties and before Material. Its folder button and the document-root button
use native button activation, `aria-expanded`, `aria-controls` and hidden
content. Compact body rows and the folder control are 28 px high. A separate
keyboard-accessible details disclosure exposes the full body name and measured
volume; truncated row labels are not the only way to read them.

Collapsing either level preserves body selection and does not edit the CAD
document. Reopening a document, including the same document ID, resets the
folder's presentation state. Current body references, stale-selection feedback
and busy/current-preview guards remain in force. Operation PropertyManagers
retain their existing body controls rather than adopting this compact layout.

The original `test:desktop:part-body-catalog` workflow checks pointer and native
Tab/Enter/Space interactions, selection retention, read-only native-request,
history and recovery invariants, lower-feature editing followed by Cancel,
and same-ID reopening. Initial layout observations precede reveal assistance;
later activation may use `scrollIntoView`. A zero-minimum grid track and entry
minimum width keep long labels inside the tree while details expose their full
text. The body list shares the outer tree scroll rather than imposing a second
112 px list viewport. The details text retains its own 80 px maximum-height
scroll region. A renderer assertion requires body B and its details control to
remain fully visible with body A's details open in the original two-body case.
Build 04 and the catalogue, finishing and successive-parts renderers pass on
the final matching source/runtime snapshot. Bounded Windows manual browsing
also passes at minimum and maximized sizes, including visible keyboard focus
and selection retention through both disclosure levels. The full suite and
desktop smoke pass on that same final snapshot. Hosted acceptance of the new
head remains pending. See [validation](VALIDATION.md) for exact results and
limits.

## Fillet and chamfer PropertyManagers — 2026-10-25

Fillet and chamfer present edge selection, Radius or Distance, Bodies and Name
in that DOM and keyboard order. The existing body and name editors remain
single instances with their original callbacks. Density rules apply only to
these two editors, retaining 28 px inputs and the sticky confirmation header.
Current edge/body identities, selection versus preview mode, diagnostic text,
Cancel and Apply guards are unchanged; no finishing mode or geometry is added.

Eight SSR cases check the panel structure and control states. The new original
two-prism renderer covers separate constant-radius fillet and equal-distance
chamfer cases on one current edge of body A, with body B unchanged. Initial
layout observations precede helper scrolling. Subsequent controls use actual
pointer activation with scroll assistance; this does not establish that every
control is initially visible. The workflow checks Cancel, Apply, Undo/Redo,
Save/reopen and actual STEP export, with analytical geometry expectations.
It does not cover all-edge selection, tangent propagation or chained finishes.
Run it after building with `npm run test:desktop:part-finishing` (under Xvfb on
headless Linux). CI configures this command in each platform's persistence job.
The named local Windows build, finishing/sequence renderers, full suite and
desktop smoke pass. Only an IPC test-context correction separates the selected
renderer snapshot from the final full-suite/smoke snapshot; production and
renderer inputs are unchanged. Hosted acceptance remains pending. Exact results
and limits are in [validation](VALIDATION.md), with fixture and measurement
boundaries in [provenance](PROVENANCE.md).

## Extrusion and cut PropertyManagers — 2026-10-25

Extrusion and cut now present the selected profile, direction parameters and
any destination-surface controls before Bodies and Name. The existing shared
body and name editors remain single instances with their original callbacks.
Density rules are scoped to these two editors, retain actual inputs and field
boxes of at least 28 px and keep the confirmation header sticky. Other operation layouts and
document declarations are unchanged.

The body panel translates only two exact incomplete-draft validation messages,
and only when the corresponding draft state matches. An empty explicit cut
scope with no selected bodies shows “Selecciona al menos un cuerpo que quieras
cortar.” A new separate extrusion with `throughAll` or `untilNext`, no body
limit and an empty base-feature ID shows “Selecciona un cuerpo límite para
calcular hasta dónde llega la extrusión.” Other errors, stale references and
additional diagnostic details pass through unchanged. This is presentation:
validation, native verification and Apply authority remain unchanged.

The original sequence renderer now runs at the production minimum window size.
It observes the initial DOM order, source profile/lock, primary field visibility
and confirmation controls before extra scrolling, measuring actual input height
as well as its enclosing box. Its missing-cut-destination
case uses actual pointer deselection, normal inspector wheel input and the
existing Cancel/restore path. Its missing-extrusion-limit cases return to blind
depth and continue the original merge operation; they do not test Cancel from
those limit modes. The fresh-sketch renderer keeps its normal window size and
checks staged-profile locking through its existing Cancel/retry/Apply paths.

Normal `upToSurface` entry always supplies a preferred reference plane or a
principal plane. There is no normal empty-target UI state in this increment,
and the renderer does not fabricate one. Final build, three selected renderers
and bounded visible checks pass. Final local acceptance also passes the full
suite and desktop smoke; build, all three renderer-03 cases, full-suite 03 and
smoke 03 share the exact 1,119-input source/runtime snapshot. Hosted acceptance
of the new head remains pending. The frozen source and the distinction between
visual observations and numerical oracles are recorded in
[validation](VALIDATION.md).

## Parameter-first PropertyManagers — 2026-10-25

The revolution editor presents Profile, Axis, Direction 1, optional Direction 2,
Bodies and Name in that DOM and keyboard order. Its density rules apply only to
revolution: shorter guidance and tighter section spacing retain the existing
28 px field boxes and sticky confirmation header. Name and body-operation
controls reuse one copy of their existing callbacks. Other operation editors
retain their ordering. The axis heading labels its select directly, avoiding a
second label above the same field. Missing references and invalid-angle alerts
remain explicit; the staged profile lock and preview/Apply guards are unchanged.

The configured general-relation editor presents Type and family options,
references, the origin disclosure, parameters, then Name. The workspace owns its
single PropertyManager title with level-2 heading semantics; the embedded form
does not repeat it. A new draft focuses Type. Reopening a saved distance
relation focuses Reference 1 while Type
remains disabled. Unused origin controls stay mounted inside their closed
disclosure. Rearranging the form does not select references, rearm temporary
viewport picking or commit a relation.

Standard relation guidance follows the actual sequence: select the missing
references, review parameters and request the relevant preview, then Apply only
after current verification succeeds. Specialized relation families keep their
own reference and parameter controls. Choosing references alone does not grant
Apply authority. The guidance is hidden while editing is blocked or a replacement
dialog is active; existing error/status reporting remains available.

Selected renderer checks inspect initial layout before helper scrolling, retain
full containment and hit-target requirements, and cover creation and saved
editing separately. At minimum window size the first angle is initially visible,
but reversal and Direction 2 still need scrolling. Final local acceptance passes
build, both affected configured renderers, the full suite and desktop smoke on
one matching 1,118-input source/runtime snapshot. Four other selected renderers
and manual observations precede the configured heading correction; see the
dated [validation record](VALIDATION.md) for that distinction. Current-head
hosted acceptance remains pending. Historical results below belong to their
recorded source states.

`RevolveFeature.extent` optionally declares `{ kind: 'two-directions',
secondAngle }` or `{ kind: 'mid-plane' }`. Absence retains the existing unilateral
angle, strictly greater than zero and at most 360 degrees, without adding saved
defaults. Two-direction angles are each finite and nonnegative, with a strictly
positive sum at most 360 degrees; either side may be zero. Mid-plane uses `angle`
as the total span, strictly greater than zero and at most 360 degrees. Parsing
rejects unknown fields, malformed variants and explicit undefined/null values;
it never clamps angles. Document version 1 is unchanged, but older readers can
reject the new field.

The directed-axis interval is [-secondAngle, angle] for two directions and
[-angle/2, angle/2] for mid-plane. One total revolution followed by its angular
offset constructs the interval, including a zero side, rather than fusing two
independent solids. Mid-plane ignores the stored reverse flag for geometry and
reference identity without deleting it. Disabling Direction 2 or choosing
mid-plane discards its second-angle value. Returning to a unilateral specified
angle removes `extent` entirely and retains the stored reverse choice; a zero
remaining first angle requires repair. The existing staged-sketch and
preview/accept/cancel authority paths remain in use.

Without `extent`, canonical document bytes and the existing lineage descriptor
are preserved. New modes add a versioned extent descriptor and distinguish a
full turn from a partial interval. Changing extent mode invalidates old semantic
references even when the resulting geometry coincides; mid-plane reverse alone
does not. Failed construction invalidates export rather than exposing an older
valid shape. See [validation](VALIDATION.md) for the focused original cases,
three passing selected renderers and completed local full-suite/desktop-smoke
acceptance. Current-head hosted acceptance remains separate and pending.

The assembly workspaces share a compact viewport toolbar. Existing view,
selection and manipulation callbacks, accessible names and busy guards remain
in place. Context labels stay below it, and configured picking instructions
retain their separate layout row. The original origin-lock renderer workflows
inspect actual command containment and center hit targets, activate front and
isometric views with pointer input, and check document/history/CAD-request
invariants. Their command reveal waits for the manager's scheduled focus before
scrolling the target; it still requires stationary, fully contained hit targets.
Both workspace callers reserve a 44 px top band for the toolbar in origin-label
layout. Boxes and the overflow list begin below that band; projected witness
coordinates and reference bindings remain unchanged. The optional inset defaults
to zero outside those workspaces, participates in the layout signature, and
invalidates a press from a prior layout. The origin-picking renderer audits the
actual visible labels against the toolbar bounds as well as their hit targets.

While a part operation is edited, its current resolved source sketches are
visible in orange even when ordinary browsing hides consumed sketches. The
source includes an unaccepted staged sketch. Pending, mismatched or failed source
builds provide no active overlay; stale displayed-model copies are removed for
those input IDs. Suppressed sketches remain excluded. The overlay changes no
selection, document, history or body/face/edge identity. Revealing it does not
trigger a camera fit; the existing first-body fit still applies. Any source
feature error conservatively hides all active inputs. Multiple sweep/loft inputs
currently share the same highlight, without separate role colors.

The original revolution renderer checks a staged height change, active input
identity after reopening a consumed profile, selector changes, Cancel and the
existing geometry/history/save/export oracles. Optional captures retain two
presented editor states separately from the clean final-document capture.
Screenshots require visual inspection; DOM input IDs are not pixel evidence.

The standard assembly renderer records bounded gear-gesture dispatch/release
stages and remaining time against its unchanged child deadline. Idle polling
returns a bounded read-only projection with the latest matching request and
response summaries, retaining the final full-history audit. These diagnostics
do not by themselves establish a timeout cause or fix.

Concentric rotation capture accepts current principal-axis references and
material-cylinder axis references. Other mechanical families retain their
existing material support requirements. The saved quaternion uses ordered full
owner frames, inverse(first) times second; it fixes relative orientation while
leaving axial travel free. New origin captures require distinct local rigid
owners in the declaring scope, with the scope frame as a valid static endpoint.
Native witnesses, original placement-chain precision, final physical checks
and private preview/Apply authority remain required. No format version changes;
older readers may reject principal-axis declarations with a non-null lock.

The standard manager captures through its verified preview. The configured
manager exposes an explicit Lock rotation action for an existing free concentric
relation; replacement retains the relation ID, name, ordered roles and alignment.
Its mechanical editor requires recapture when no saved lock exists. The renderer
sends reference intent, never a captured quaternion. Named-state edits retain the
source and inactive configurations. Original production-renderer commands are
`test:desktop:assembly-origin-axis-lock` and
`test:desktop:assembly-configured-origin-axis-lock`.

The part tree reserves the selection-action strip even when no operation is
selected. Its disabled actions retain their existing guards, preventing selection
from shortening the scrollable tree between the two presses of a double click.
The compact revolution renderer checks actual CDP click counts at the lower tree
edge, unchanged row geometry and exact Cancel after reopening the saved operation.

Part operation commands use labelled `CommandGroup` containers without changing
their callback, order or availability. The fixed-height ribbon keeps horizontal
overflow; group-specific icon and row sizing makes space for labels. Direct
commands no longer draw a dropdown chevron. The part property editor keeps its
existing title and confirmation row inside a sticky header, with scroll padding
for field navigation. These are presentation changes, not new CAD capabilities.

Configured origin-picking instructions occupy a separate flex row before the
viewport. They previously used an absolute overlay above projected origin
labels. The existing ResizeObserver updates viewport projection when the row
appears; current layout and identity checks remain required. Origin-label audits
include the bounded actual hit element to make future covering elements visible
in diagnostics, without relaxing containment, separation or center-hit checks.

`RevolveFeature.axis` optionally selects a local X/Y axis or stable line entity
ID in its existing `sketchId`; `reversed` changes the directed-axis orientation
except in mid-plane mode. Angle limits follow the extent contract above.
Absent axis/reversal retains local +Y and false without materializing fields
on read/write. The strict parser rejects unsupported fields; older readers may
reject new declarations. Same-sketch lines need no additional feature graph edge.
The native resolver reads current solved endpoints and the resolved sketch frame,
rejecting missing, ambiguous, nonfinite or degenerate axes. Radial profile checks
include exact circular-arc extrema. Implicit Y with absent/false reversal keeps
the historical lineage descriptor; explicit axes use a versioned declaration
identity. Rebuilding after axis edits must never expose a prior valid export.

`RevolvePanel` derives options from the operation's current staged source sketch,
retains unavailable declarations visibly, and updates through the existing draft
and preview freshness path. It does not grant Apply authority or change body plans.
The original staged-sketch Cancel and acceptance transactions remain required.

`test:desktop:part-revolution` uses a tracked original sketch recipe and the
existing hidden production harness at the production minimum 1040 by 700 window.
It previews X/Y and a construction-line axis, reversed partial turns and exact
Cancel, then tests a reversed explicit-Y revolution and subsequent cut through
history, Save/reopen and one restricted STEP export. Its independent reader
checks the exported solid. The harness reveals controls with DOM scrolling and
requires unique visible enabled hit-tested targets before field changes; command
activation remains actual pointer input. Field setters and test-owned native
dialogs are distinct from human typing/dialog operation. CI configuration for
three systems is not executed platform evidence.

Ordinary part browsing uses `partSelection.ts` to share the edge/face/plane
candidate policy between hover and activation. It reuses the existing visible
geometry pickers and their pixel thresholds, clipping and occlusion checks.
Explicit body selection remains separate. Busy or stale browsing is disabled;
operation-owned face, edge and body modes retain their own callbacks and guards.
Clearing ordinary selection changes only local presentation state, never an
operation draft, recovery or document history.

`assemblyOriginLabelLayout.ts` lays out fixed CSS-pixel rectangles independently
of `assemblyOriginLabels`' geometric projection. Key order resolves ties and a
bounded fallback grid packs remaining space. Insufficient capacity moves the
whole set to one scrolling list without dropping identities. Anchor coordinates,
bindings and geometric picking remain unchanged. Layout is recomputed only when
projected anchors or viewport dimensions change; a pointer press from an older
layout cannot activate after a resize or layout change. Existing current-catalog,
scope and reference-compatibility checks remain required.

The assembly component trees share `assemblyTreeNavigation.ts` and
`useAssemblyTreeNavigation.ts`. Keys identify the full occurrence path and exact
definition revision, so reused subassemblies expand independently. The configured
tree also identifies its configuration actions separately. Expansion and keyboard
focus are presentation state; they are never serialized into the CAD document.
Collapsed descendants remain mounted under hidden groups, retaining selection.
New external selection, returning to the model pane or replacing the document
reveals the selected ancestry; ordinary renders do not undo an explicit collapse.
Removed or revised identities are pruned. Up/Down/Home/End move focus; Right opens
or enters a branch and Left closes it or returns to its parent. Enter/Space use
the row's existing activation. A disclosure returns focus to its owning row.

Selecting a component keeps the model tree visible. The explicit component
properties command opens a separate standard Properties pane or the configured
occurrence inspector. The standard editor fieldset is mounted once in that pane;
changing panes preserves its controlled and uncontrolled values. Its tab can
show empty guidance without a selection; component commands still require a
selected component. The Move command aligns the existing movement section below
the sticky header so its fields are visible, even when the heading was already
near the bottom of the pane. Individual control destinations retain minimal scrolling.
Returning through the pane header reveals and focuses the selected tree row.
Document replacement resets the standard manager to Model. Configured selection may
still rebuild when its declaring scope changes; it must retain the fresh-build
guard. Disclosure and keyboard focus themselves do not issue CAD requests.
The component tree also exposes principal planes and axes for the document root
and each visible, unsuppressed occurrence. `assemblyOriginTree.ts` separates the
complete declaration catalog from the viewport's bounded display list: browsing
draws only the selected datum. Its full owner path, definition revision, selected
configuration lineage, world pose and current document/scope/session binding
must still resolve before selection or highlighting. Root browsing always uses
the document frame, independently of the current relation-editing scope.

Datum browsing is presentation-only. It neither changes component selection or
scope nor assigns a relation role, and collapse retains its highlight. Selecting
a component clears it. Selecting a datum disarms an idle standard manipulator;
arming a manipulator clears datum browsing. Active drag sessions remain guarded.
While a datum is selected, component Properties access is disabled and standard
component editors stay mounted but hidden and disabled, retaining their fields.
The standard workspace keeps guarded datum rows focusable
with `aria-disabled` when component browsing remains available; activation stays
blocked. The configured model tree remains disabled during a relation draft.
Armed origin roles retain the existing relation editor and its current display,
ticket and compatibility checks. A point-origin producer is not added.

The configured relation editor uses a native details/summary disclosure for
origin references. Controls remain mounted when closed. Disclosure alone changes
neither picking intent, owner nor assigned roles. A new explicit visibility or
origin-picking request opens the section; ordinary rerenders do not undo a user's
collapse. Inspector reveal chooses an enabled, rendered control outside closed
details content so a new relation focuses its main form without opening origins.
The renderer navigator reveals these controls through the actual summary before
using them; it never assigns the details open state directly.

`desktop-assembly-tree-navigation.cjs` discovers mounted ancestry and opens its
real disclosure controls before a hidden target can be selected. It does not
unhide nodes or write application state. The bounded tree-controls scenario uses
the existing original reused BOM fixtures and actual pointer/keyboard input;
its acceptance and subsequent persistence checks remain separate. See
[validation](VALIDATION.md) for executed cases and limits.

`desktop-assembly-origin-tree-controls.cjs` uses actual pointer input on the
original origin-axis and reused BOM fixtures. It checks root/component plane
and axis selection, retained highlight when collapsed, and exact recovery,
history controls, owner/scope and native request invariants before restoring
the original component. Existing relation and file-persistence oracles follow.

Tree navigation and serial-only boundaries in the standard persistence workflow
use the observer's request serial, assembly count and worker-error count through
a read-only projection calculated in the renderer.
Each helper's existing idle entry also compares those counters with a full
snapshot and records payload sizes and read durations. A mismatch fails the
workflow. Standard persistence response polling projects the last completed
matching record, including failures, and all worker errors before transport.
Its serial/action filters and ordering are unchanged. Idle audits compare the
complete projected record against the full snapshot, plus an empty result after
the current serial. Source-repair correlation, gesture streams and final error
audits retain full snapshots; no observation is pruned. These measurements do
not by themselves identify the cause of an earlier workflow deadline.

The standard persistence workflow passes its existing `assemblyNavigation`
instance to all eight subflows. Their `withNavigation` entry reuses the already
wrapped click instead of wrapping it again and revealing every target twice.
Explicit subflow pane changes use that same navigator and its actual pointer
transport when available. Target uniqueness, visibility, enabled controls and
native response checks remain. One unused pre-save gear snapshot is removed;
the subsequent full audit and all consumed observations remain. Measure the
complete workflow before making any performance or deadline-stability claim.

Part and assembly top-level menus use `AssemblyMenuBar.tsx`. Callers provide existing
actions and their current guards; closed menus do not mount duplicate controls.
Focus transfers after the menu commit, before a following keyboard action.
Escape within the menu closes it and restores trigger focus without reaching
the workspace's draft-cancellation handler. The part keyboard handler respects
consumed events. Menu availability follows the current edit and history state.

`AssemblyCommandTabs.tsx` controls a separate `ribbonTab` in both assembly
workspaces. Selecting Ensamblaje, Relaciones or Evaluar changes command visibility
without navigating the inspector, altering a draft or disarming reference picking.
Each command remains mounted once in its owned tab panel; inactive panels use
`hidden`. Ensamblaje contains insertion and the primary relation command,
Relaciones contains the relation list, and Evaluar contains the available analysis
commands. Solve/Apply/Cancel remain outside the hidden panels with their existing
guards. Left/Right wrap between tabs; Home/End select the first/last tab. Only the
selected tab is in the Tab sequence. Closing BOM reveals Evaluar and restores
focus after commit; document replacement resets the ribbon to Ensamblaje.

Starting a profile operation from a new or saved unused part sketch stages it
without accepting it. The operation's source build, body-command validation,
preview and acceptance use the same `operationDocument`, including the staged
sketch. Saved sketches update in place; new sketches append. Its profile selector
is locked and acceptance requires that sketch ID.
The persisted `doc`, serialized document and recovery remain unchanged during
the preview. Cancel restores the sketch draft and its local undo/redo; document
replacement clears staging. Acceptance validates the final document before
recording the sketch change then operation, with no intermediate document render
or recovery write. An unchanged saved sketch retains the original document and
does not add a redundant history entry. Document Undo removes the operation first,
matching the explicit exit-sketch route. Saved unused sketch previews build the
complete modified feature list before admission; any dependent feature, including
a suppressed one, excludes the shortcut. Consumed sketch edits retain rollback.
A stale or unhealthy preview and unfinished sketch
chamfer, fillet, mirror or offset tools must not start the transition.

`PartFeatureContextMenu` renders caller-owned tree editing actions in a portal.
Each opening has a fresh request identity; actions identify the selected feature
and each distinct sketch input. Pointer, context-menu key and Shift+F10 routes
share the same guards. Escape is consumed before workspace keyboard handlers.

`partFeatureTree.ts` derives root features and distinct sketch inputs without
changing the document. Expansion belongs to the workspace, and filtering only
forces the displayed branches open. Shared inputs have parent-specific occurrence
keys. Disclosures are siblings of the actionable rows; collapsed groups retain
their ARIA target but unmount their child rows. Focus navigation does not select
a feature. Editing remembers the input occurrence, reveals its owner and returns
focus after the tree remounts; document replacement clears this presentation state.

The prepared part renderer exercises disclosure, selection retention, Right/Left
navigation and temporary filtering before the existing geometry sequence. Tree
pointer targets are scrolled into view through the DOM API, observed stationary
and hit-tested before CDP press/release. A failure includes bounded rectangle,
viewport, scrolling and hit-target diagnostics. Deadlines and geometry checks are
unchanged; see [validation](VALIDATION.md) for executed and hosted results.

The two origin-axis renderer flows also exercise actual menu pointer/keyboard
input through `desktop-assembly-menu-controls.cjs`, including Escape, Tab,
disabled history, tree/editor navigation and retained references. Keyboard
transport is restricted to these hidden, test-owned windows and fixed keys.
The configured flow additionally changes the displayed origin owner inside its
current draft, transiently selecting both components before restoring the
original root/component pair for the unchanged native oracle. Owner selection
is scripted; origin-label selection uses actual CDP input. See
[validation](VALIDATION.md) for executed cases and limits.

Assembly renderer workflows use the application's contextual manager tabs.
`desktop-assembly-navigation.cjs` and `desktop-configured-navigation.cjs` reveal
the owning panel before a scripted control action; neither unhides DOM nodes nor
changes application state directly. Pointer workflows retain actual CDP input,
hit testing and bounded wheel events. After a wheel event, the configured pointer
case observes a stationary target before pressing; it does not retry a missed
click or extend the existing deadlines. A panel-navigation pass is separate from
native geometry, file persistence and platform acceptance.

The hosted [CI run for `a709556`](https://github.com/angelcp2802/solidflow/actions/runs/40129262044)
failed symmetry authoring on all three operating systems before its first
preview: tab navigation called the pointer helper, whose scenario guard omitted
that workflow. The failure was `Expected actual pointer input in the hidden
test-owned assembly window.` The targeted guard correction passes the Windows
symmetry renderer's 174 checkpoints, including five Save As/reopen pairs; see
[validation](VALIDATION.md). It does not change solver checks or deadlines,
and hosted recovery still requires new-head execution evidence. The same
commit's [Security run](https://github.com/angelcp2802/solidflow/actions/runs/40129262048)
passed. These results apply to that commit, not to the origin-selection changes.

The later hosted [CI run for `0075cf9`](https://github.com/angelcp2802/solidflow/actions/runs/40131849382)
fails rigid assembly persistence and symmetry viewport selection on Linux and
Windows. All macOS renderer jobs, configured authoring on all three systems and
the three relations jobs pass; Desktop jobs stop at the renderer prerequisite
gate. Dedicated logs were unavailable, so the failed stages alone do not
establish an assertion-level cause. Its
[Security run](https://github.com/angelcp2802/solidflow/actions/runs/40131849385)
passes both CodeQL and dependency audit. This is partial hosted evidence, not
complete acceptance of that commit or the subsequent menu/owner increment.

After building, `npm run test:desktop:assembly-configured-picking` checks actual
component and general face/LINE role selection in an original configured
assembly, with preview, history and real file IPC. See
[core workflows](CORE_WORKFLOWS.md) for the signed-distance example and current
UI feedback. This fixed command uses the existing isolated hidden harness;
configured CI does not establish a platform pass.

Run `npm run test:desktop:assembly-configured-picking-compact` after building
for the fixed 1040 × 700 variant. Both pointer workflows exercise upper-command
access and application-owned left-inspector reveal/focus; the compact case also
checks the available viewport layout. Current execution evidence is limited to
the recorded Windows cases in [validation](VALIDATION.md).

The [configured component authoring contract](ASSEMBLY_CONFIGURED_COMPONENT_AUTHORING.md)
covers insertion, registered reuse and parent-relative fixed/floating state.
After building, run `npm run test:desktop:assembly-configured-components` for
its original shared-state import, preview/history and file-persistence workflow.
Keep the complete v3 catalog and selected imported state; never flatten them.

The [origin-axis contract](ASSEMBLY_ORIGIN_AXES.md) covers explicit root/component
X/Y/Z line references and their native relation lifecycle. After building, run
`npm run test:desktop:assembly-origin-axes` and
`npm run test:desktop:assembly-configured-origin-axes` for the original form,
preview, history and file-persistence workflows. Keep free axial/spin coordinates
separate from constrained coordinates. Concentric origin capture is handled by
the separate lock workflows; other mechanical families retain their material
reference requirements.

Visible origin selection shares `assemblyOriginPicking.ts` for owner-relative
identity, displayed placement, projected labels and axis/plane hit testing.
The standard and configured adapters nominate existing compatible reference
roles; they do not grant native verification or Apply authority. Keep visibility
separate from material picking, reject stale display/context events, and stop
temporary picking when the owner, visibility or active editor changes. Hidden or
suppressed owners must not contribute selectable overlays. The user steps are
in [core workflows](CORE_WORKFLOWS.md).

The origin-axis renderer flows reuse the original two-prism recipe in
`scripts/desktop-assembly-origin-axes-original.cjs`; see [provenance](PROVENANCE.md).
Their visible-selection route uses actual pointer input for visibility, role
and projected-label controls, while owner/type/value form changes remain
scripted. Preserve the independent geometry, Cancel/retry, Apply, history and
Save/reopen checks. A projected-label click is not evidence of a geometry hit
on an axis line or plane surface. Report those routes separately, with the
actual platform and execution results in [validation](VALIDATION.md); this
description adds no new passing or platform-support claim.

The [core workflow walkthrough](CORE_WORKFLOWS.md) prioritizes successive cuts,
additive extrusions, consistent mouse navigation and basic assembly selection.
After building, `npm run test:desktop:part-sequence` exercises its original
prepared-sketch workflow through the production renderer and real file IPC.
After building, `npm run test:desktop:part-fresh-sketch` exercises the separate
fresh face-supported rectangle/boss/pocket workflow described in that guide.
Its configured checks are not an execution claim; see the validation record.

The [configured compound authoring contract](ASSEMBLY_CONFIGURED_COMPOUND_AUTHORING.md)
connects profile-center, material LINE and circular-path forms to the existing
private configured declaration preview. After building, the fixed aggregate
`npm run test:desktop:assembly-configured-compound` runs rectangle profiles,
free circular profiles, LINE and circular material-path workflows sequentially.
Keep their current compound identities and independent geometric oracles separate
from syntax nominees, copied reports and Apply authority. The Configured relation
authoring CI job configures this aggregate and the five mechanical cases on
three operating systems; this listing is not an execution or support claim.

The [configured mechanical capture contract](ASSEMBLY_CONFIGURED_MECHANICAL_CAPTURE.md)
separates references/parameters from native capture authority for all five
mechanical families. Run `npm run test:desktop:assembly-configured-mechanical`
after building for the five bounded renderer workflows. Each also has a fixed
`test:desktop:assembly-configured-<family>` command. CI configures a separate
three-OS job; this listing is not an execution or platform-support claim.

The [configured relation editing contract](ASSEMBLY_CONFIGURED_RELATION_EDITING.md)
adds exact-state declaration lists and private intent previews. Preserve the
original baseline separately from the prepared proposal, materialize named
inheritance before Base edits and keep caller-authored captures gated outside
the separate configured native producer. New fixture and renderer evidence
must remain separate from general family or platform coverage.

The [configured BOM contract](ASSEMBLY_CONFIGURED_BOM.md) counts effective v3
occurrences with selected state, complete ancestry and root-relative member
paths. Keep its declaration-only report and literal-text CSV separate from
native geometry, solver authority and the legacy Base-only BOM. Changes should
retain pure grouping/CSV cases and current-context UI/export guards.

The [prototype hardening contract](PROTOTYPE_HARDENING.md) covers own-data
records, descriptor-first bounded reads, worker queue recovery and current
renderer oracles. The desktop baseline now includes an independent production
worker malformed-input/recovery probe; record it separately from UI controls.

The [persisted configuration integration](ASSEMBLY_CONFIGURATIONS_PERSISTENCE.md)
uses a strict v3 envelope around a v2 source and named-state catalog, an actual
effective native scene and private configured worker capabilities. Keep the
complete context together through history, recovery and file operations. Legacy
source/BOM/export routes must not silently unwrap it to a base assembly.

The standalone [selected-state transaction](ASSEMBLY_CONFIGURATIONS_SOLVE.md)
stages child solves before parents, isolates named inheritance on base writes,
preserves complete captures and gates all placed uses before atomic publication.
Its private single-use handle is separate from saved/editor transport. Never
infer an angular trajectory when an authored capture is stale.

The standalone [configured geometry gate](ASSEMBLY_CONFIGURATIONS_VERIFICATION.md)
owns fresh native observations for each placed relation. Keep physical
measurements independent of numerical residual rows, preserve original chain
error and native purpose, and withhold reports on fatal query/currentness/release
failure. A geometry report is not a saved configuration transaction or Apply grant.

The [closed numerical scope and state planner](ASSEMBLY_CONFIGURATIONS_SCOPE.md)
is separate from saved/editor integration. Preserve exact selected-state keys,
all placed native instances and full-chain numerical conditioning; local
numerical bodies do not replace physical root ownership. Scoped publication
requires the complete live native context before and after execution.

The standalone [capture/winding contract](ASSEMBLY_CONFIGURATIONS_STATE.md)
adds strict exact-state operations and named-capture materialization into core
evaluation. Keep authored captures, selected-state numerical inputs and native
capture authority separate. Base sidecar entries cannot be materialized as
named overrides; saved/editor variant solve/writeback remains a separate integration.

Use Node.js 24 and npm. Dependency versions are recorded in `package-lock.json`; install them with `npm ci`. Git is needed for the contribution workflow. Windows is the platform with the current local desktop evidence; macOS and Linux are targets whose build and runtime results must be recorded separately.

The public Vitest suite retains isolated fork workers and each test's existing
deadline. Concurrent workers are capped at four (or one fewer than the available
CPU count, with a minimum of one), because individual CAD workers can own large
native/WASM heaps. A targeted filtered run is diagnostic evidence, not a
replacement for the complete `npm test` acceptance.

## Choose a branch and runtime

Start ordinary contributions from `main`. The [project status and review queue](PROJECT_STATUS.md)
lists dependent draft increments and their intended bases; review a stacked
change against that base rather than treating its prerequisites as merged.
Consult the selected branch's own contracts and validation record for behavior
that is still proposed.

The [native structural STEP prerequisite](ASSEMBLY_STEP_STRUCTURE.md) supplies
standalone AP242 product/instance export, a bounded graph reader and autonomous
v2 saved import, including [explicit multibody bases](IMPORTED_BODIES.md). The
separate [editor integration](ASSEMBLY_STEP_EDITOR.md) connects explicit worker
requests and the existing restricted file bridge.
Its original native and pure cases run in the public unit suite; changes to the
shared STEP reader also require build and the desktop smoke. Keep programmatic
round trips separate from real file-IPC/editor acceptance and complete assembly
interchange. Keep the original multibody product-boundary cases separate from
arbitrary STEP representation or geometric compatibility claims.

Node runtime major migrations should update `engines`, the CI runtime, this
guide and matching `@types/node` together in a focused proposal. While Node 24
is the documented target, Dependabot is configured to ignore semver-major
`@types/node` version proposals. Other configured update rules and the security
workflows remain in place; report and review audit findings separately.

## Run locally

From the repository root:

```sh
npm ci
npm run desktop
```

The desktop development command starts Vite on `127.0.0.1:5173` and opens Electron. The port is fixed; close an earlier instance if it is occupied. Closing the application ends its development server.

For production-loader testing:

```sh
npm run build
npm start
```

`npm run dev` provides a browser view. Browser downloads and native desktop dialogs are different paths; testing one does not validate the other. Use a synthetic document for experiments and keep a copy before changing a model you need.

## Checks

| Command | Scope |
| --- | --- |
| `npm test` | The public unit/CAD suite and desktop-security checks from a fresh checkout. |
| `npm run test:unit` | Unit and CAD regressions that can run from a fresh public checkout. |
| `npm run test:ipc` | The desktop-security suite without opening a desktop window. Retains Node's spec output and adds bounded failed-leaf annotations only in GitHub Actions; it never overrides test outcomes. |
| `npm run build` | TypeScript checking and production compilation of UI, worker and WASM integration. |
| `npm run test:desktop` | Real Electron production-loader smoke check after building, with a hidden window and isolated temporary user data. |
| `npm run test:desktop:imported-bodies` | Configured production-renderer opening of an original v1 explicit STEP body base, real worker/body identity checks, suppression/history and Save As/reopen through restricted file IPC. Run after building; test-owned dialogs and planar mesh-area checks are separate from native BRep unit evidence. |
| `npm run test:desktop:assembly-step` | Configured production-renderer structural STEP export/import in both workspaces, cancellation/rejection, autonomous Save As/reopen and reexport. Run after building; real worker and output bytes with original fixtures and test-owned dialogs. Record source-specific execution separately. |
| `npm run test:desktop:assembly-step-insertion` | Configured production-renderer insertion of an original structural STEP into a saved parent, cancellation/rejection, exact history, component reuse and autonomous saved reopening. Run after building; real worker and restricted file IPC with test-owned dialogs. Record actual execution separately. |
| `npm run test:desktop:pattern-all` | Scripted production-renderer selected-to-ALL cut interaction, Apply, Save As and reopen, after building. |
| `npm run test:desktop:pattern-until-next` | Scripted production-renderer UntilNext selected cut, cut ALL and selected additive merge, real rejection, Apply, Save As and reopen, after building. |
| `npm run test:desktop:assembly` | Scripted production-renderer rigid assembly relations, authenticated Apply, source revision/repair, constrained numeric movement, read-only interference/clearance, rejection preservation, Save As and reopen, after building. |
| `npm run test:desktop:assembly-configurations` | Production-renderer selected root/child states, named placement editing, real configured Solve/Cancel/retry/Apply, complete history/recovery and Save As/normal Save/reopen. Also exercises committed configured BOM modes/ranges/members, visibility/suppression and actual CSV cancel/error/write through restricted file IPC. Run after building; original reused prisms and test-owned dialogs. Record actual execution separately from platform support. |
| `npm run test:desktop:assembly-configured-relations` | Production-renderer named relation parameter editing, private Cancel/retry/Apply, shared selected-state propagation, add/suppress/remove, Base isolation, full history/recovery and actual Save As/Save/reopen. Run after building; original reused prisms, literal geometry and exact placed verification identities with test-owned dialogs. |
| `npm run test:desktop:assembly-import` | Scripted production-renderer assembly import and reuse, transformed native bounds, local-frame mate solve, incompatible-content rejection, history, Save As and reopening. Run after building; no external-format interchange or human-dialog claim. |
| `npm run test:desktop:assembly-source-update` | Scripted production-renderer all-use subassembly source update, explicit renamed-descendant plane repairs, review/preview cancellation, rejection, Apply/history, parent save identity and saved reopening. Run after building; original fixed-prism case with real worker/file IPC and test-owned dialogs. |
| `npm run test:desktop:assembly-source-update-save-pending` | The same original source-update lifecycle with one actual successful Save result withheld after its real bytes are written. The flow releases that result, then requires clean renderer controls, exact file identity and recovery before continuing. Run after building; the unchanged deadlines and test-owned file grants remain in force. |
| `npm run test:desktop:assembly-linked-source` | Production-renderer explicit link/reload for original parts and reused rigid subassemblies, unchanged bytes, changed-cache review, Cancel/Apply/history, source-byte preservation and offline saved reopening. Run after building; native source selections are test-owned dialog substitutions. Configured cases do not imply an executed result or another platform. |
| `npm run test:desktop:assembly-source-revision` | Production-renderer source editing/movement, explicit root revision Cancel/Apply/history, canceled Save As and normal source Save, then linked parent review/Apply/history/save/reopen using the actually authored bytes. Run after building; original fixture and test-owned native dialog substitutions, without a prefabricated updated source file. |
| `npm run test:desktop:assembly-profile-center` | Configured production-renderer circle/free and rectangle/material-edge authoring, incidence rejection, preview cancellation, Apply/edit/history, suppression/deletion and Save As/reopen. Run after building; original tracked geometry and test-owned dialogs, no viewport-picking or external compatibility claim. |
| `npm run test:desktop:assembly-line-path` | Production-renderer explicit material point/LINE/start authoring, Free/Distance/Percentage, optional component-axis Follow and projected material-face UP with independent reversals, nonincident-origin and actual-length rejection, Cancel/Apply, edit/history, suppression/deletion and Save As/reopen. Run after building; original reused prisms and test-owned dialogs, no viewport-picking or general-path claim. |
| `npm run test:desktop:assembly-circular-path` | Production-renderer material point/open arc/origin authoring, explicit Free trim, Follow/UP, actual-length rejection, Cancel/retry/Apply, editing, history, suppression/deletion and Save As/reopen with a fresh native solve. Run after building; original reused sectors and test-owned dialogs, no viewport-picking, external policy or general-path claim. |
| `npm run test:desktop:assembly-interference-multibody` | Scripted production-renderer optional within-component body inspection, exact pair identities, option/scope invalidation and unchanged history/recovery, after building. One original two-body case; no human-dialog or continuous-collision claim. |
| `npm run test:desktop:assembly-interference-grouping` | Scripted production-renderer root grouping for two reused twice-nested original groups, fifteen/nine/restored-fifteen exact body pairs, option/highlight invalidation and unchanged history/recovery, after building. No selected-scope grouping, internal-body combination or continuous-collision claim. |
| `npm run test:desktop:assembly-interference-grouping-multibody` | Scripted production controls retain internal-body inclusion through six/four/restored-six body pairs in two reused nested groups. Checks option/highlight invalidation and unchanged history/recovery after building; no union or human-dialog claim. |
| `npm run test:desktop:assembly-interference-grouping-scope` | Scripted production inspection with four original multibody leaves in two reused nested groups: same-root selection, cross-root selection, exclusions and selected-against-rest, with exact pair identities and unchanged history/recovery. Run after building; no union, human-dialog or general platform claim. |
| `npm run test:desktop:assembly-screw` | Scripted production-renderer native screw capture, bidirectional drive, history, parameter editing and Save As/reopen, after building. |
| `npm run test:desktop:assembly-rack-pinion` | Scripted production-renderer rack coupling, native edge pointer selection, bidirectional drive, history and Save As/reopen, after building. |
| `npm run test:desktop:assembly-export` | Scripted production-renderer flat assembly STEP/STL export, cancellation, committed history and saved-document reopening, after building. |
| `npm run test:desktop:assembly-direction` | Scripted production-renderer parallel/perpendicular assembly authoring, history and saved-document reopening, after building. |
| `npm run test:desktop:assembly-angle-measurement` | Scripted production-renderer circular angular measurement from three current directions, invalidation, rejection and unchanged saved-document reopening, after building. |
| `npm run test:desktop:assembly-directed-angle` | Scripted production-renderer directed circular stops, strict rejection, local-X pointer projection/release/zero crossing, suppression/reactivation, shared-source three-reference/LINE-guide repair, history and saved-document reopening, after building. |
| `npm run test:desktop:assembly-tangent` | Scripted production-renderer plane/cylindrical-surface support tangency, signed side, history and saved-document reopening, after building. |
| `npm run test:desktop:assembly-cylinder-tangent` | Scripted production-renderer nonparallel and explicitly parallel cylinder support tangency, branch/radius roles, history and saved-document reopening, after building. |
| `npm run test:desktop:assembly-sphere-tangent` | Scripted production-renderer plane/sphere, sphere/sphere and cylinder/sphere support tangency, purpose-specific sphere selection, history and saved-document reopening, after building. |
| `npm run test:desktop:assembly-limit-distance` | Scripted production-renderer signed plane-distance intervals, boundary movement/projection, history and saved-document reopening, after building. |
| `npm run test:desktop:assembly-limit-distance-compact` | The same original interval fixture and complete workflow at a fixed 1040×700 test-owned window. Records actual canvas bounds, canvas hit targets and settled hover state before acquiring either Z-handle half. Run after building; unchanged physical targets, calibration, tolerances and deadlines. |
| `npm run test:desktop:assembly-width` | Scripted production-renderer centered width with four-role viewport plane selection, editing reselection, constant-rotation contact-stop, rejection/cancellation, history and saved-document reopening, after building. |
| `npm run test:desktop:assembly-hinge` | Production-renderer unlimited hinge dropdown authoring with four explicit roles, native radial-plane rejection, Cancel/Apply, editing/reselection, history, physical 90-degree spin, suppression/deletion and Save As/reopen. Run after building; original drilled leaves and test-owned dialogs, no angular-stop or viewport-picking execution claim. |
| `npm run test:desktop:assembly-hinge-picking` | Production-renderer hinge face/LINE pointer selection using original separated drilled leaves, rejected selections, authoring/editing and saved reopening. Run after building; configured scope, with actual execution recorded separately. No general visibility or angular-stop claim. |
| `npm run test:desktop:assembly-hinge-repair` | Production-renderer four-role hinge shared-source repair and selected/all replacement with original H4/H5/H6 leaves, pending-role rejection, ready Cancel/retry, Apply, history and saved reopening. Run after building; configured scope, with actual execution recorded separately. No nested-repair or pointer claim. |
| `npm run test:desktop:assembly-hinge-limits` | Production-renderer six-role limited hinge authoring/editing, projection rejection, wrapped-arc strict motion and outside-stop rejection, Cancel/Apply/history, suppression/deletion and saved reopening. Run after building; original H4 leaves and test-owned dialogs. No pointer or continuous-motion claim. |
| `npm run test:desktop:assembly-hinge-limits-repair` | Production-renderer limited hinge source repair and selected/all replacement with original H4/H5/H6 leaves: six/three/six explicit repairs, incomplete rejection, ready Cancel/retry, Apply/history and saved reopening. Run after building; no pointer, general correspondence or nested renderer claim. |
| `npm run test:desktop:assembly-hinge-limits-picking` | Configured production-renderer six-role face selection, angular reselection, wrong-purpose/hidden/canceled input controls, local-Z stop projection and inward release, Cancel/Apply/history and saved reopening. Run after building; actual results are recorded separately. Original H4 leaves, real CDP input and test-owned dialogs, without a general visibility or continuous-motion claim. |
| `npm run test:desktop:assembly-symmetry` | Scripted production-renderer five-family symmetry authoring through three-role dropdowns, independent native reports/material bounds, edit reselection/cancellation, history and Save As/reopen, after building. No viewport point picking. |
| `npm run test:desktop:assembly-symmetry-repair` | Scripted production-renderer material-point symmetry with three explicit shared-source/all-replacement repairs, pending-role rejection/blocking, ready-preview Cancel/retry, Apply, history and Save As/reopen, after building. One original point-family scenario; no viewport picking or other-family repair claim. |
| `npm run test:desktop:assembly-symmetry-picking` | Scripted production-renderer native vertex/face/LINE and explicit cylinder-axis pointer selection for five symmetry families, authoring, edit reselection, history and saved reopening, after building. Fixed original isometric cases; no general visibility or platform claim. |
| `npm run test:desktop:assembly-symmetry-line-repair` | Dedicated production-renderer workflow for material LINE edges: two-role shared-source repair, replacement, ready Cancel/retry, Apply, history and Save As/reopen, after building. Configured acceptance scope; this command listing records no execution result or viewport-picking claim. |
| `npm run test:desktop:assembly-symmetry-plane-repair` | Dedicated production-renderer workflow for planar faces: two-role shared-source repair, replacement, ready Cancel/retry, Apply, history and Save As/reopen, after building. Configured acceptance scope; this command listing records no execution result or viewport-picking claim. |
| `npm run test:desktop:assembly-symmetry-sphere-repair` | Dedicated production-renderer workflow for full spherical surfaces, including an incompatible-radius selected replacement: two-role shared-source repair, replacement, ready Cancel/retry, Apply, history and Save As/reopen, after building. Configured acceptance scope; this command listing records no execution result or viewport-picking claim. |
| `npm run test:desktop:assembly-symmetry-cylinder-repair` | Dedicated production-renderer workflow for full cylindrical surfaces, including an incompatible-radius selected replacement: two-role shared-source repair, replacement, ready Cancel/retry, Apply, history and Save As/reopen, after building. Configured acceptance scope; this command listing records no execution result or viewport-picking claim. |
| `npm run test:desktop:assembly-symmetry-axisline-repair` | Dedicated production-renderer workflow for explicit cylinder-face line axes, including unequal-radius selected replacement as a line-purpose control: two-role shared-source repair, replacement, ready Cancel/retry, Apply, history and Save As/reopen, after building. Configured acceptance scope; this command listing records no execution result or viewport-picking claim. |
| `npm run test:desktop:assembly-symmetry-nested-selected` | Scripted production-renderer point symmetry in a twice-nested reused assembly, isolated selected replacement, source-only repair, Cancel/retry, history, saved reopening and suppressed-copy reactivation, after building. Original dropdown workflow; no nested pointer claim. |
| `npm run test:desktop:assembly-symmetry-nested-source` | Separate scripted production-renderer shared-source point repair in the same original reused assembly, all three roles, Cancel/retry, history, saved reopening and suppressed-copy reactivation, after building. |
| `npm run test:desktop:assembly-limit-angle` | Scripted production-renderer principal direction-angle intervals, boundary movement/projection, history and saved-document reopening, after building. |
| `npm run test:desktop:assembly-replacement` | Scripted production-renderer selected/all part replacement, explicit face/LINE repair, native gear recapture, cancellation, history and saved-document reopening, after building. |
| `npx --no-install vitest run --config vitest.config.ts src/sketch/extend.review.test.ts` | A focused sketch/CAD regression file using the public project configuration; replace the path with the relevant test. |

The symmetry renderer workflow uses the tracked original 15-occurrence fixture,
current native dropdown choices, actual worker responses and test-owned file
dialogs. It checks all five families' support reports and independent material
properties/bounds, with authoring, history and editing cancellation. It is not
manual dialog or viewport vertex-click evidence. An optional
`SOLIDFLOW_UI_CAPTURE=1` capture is separate from those assertions; record actual
execution and visual limits in validation rather than inferring a pass here.

The desktop smoke check loads the initial model, preload, worker and WASM and checks readiness and console errors. It does not click the editor's tools or launch the packaged installer. On a headless Linux machine, a display server is needed for Electron; CI can use `xvfb-run -a npm run test:desktop` after installing the required system libraries. Do not disable Electron's sandbox to make a check pass.

Run focused tests while developing, then the checks relevant to the complete change. The [CI workflow](../.github/workflows/ci.yml) is configured for Node 24 on Windows 2025 x64, Ubuntu 24.04 x64 and macOS 15 arm64: install, build, unit tests, IPC tests, Electron smoke check and packaging. Linux uses Xvfb. A configured job is not an executed result; check Actions for the actual commit and platform before claiming a pass.

The 51 longer renderer commands run in three fixed batches of 17 per operating
system, separately from unit/CAD and packaging. The configured mechanical and
compound workflows retain their separate job. The original Desktop check names
depend on every renderer and configured job: after pinned Node setup, an
unconditional result guard fails unless both dependencies succeeded. A skipped
or canceled dependency cannot satisfy that guard. Existing 35-minute general
job and 20-minute configured job limits, scenario deadlines, sandbox settings
and no-publish packaging remain unchanged. This split is tracked in issue #53;
command-inventory parity does not replace hosted execution.

CI packages have no signing or notarization credentials and are built with `--publish never`. Binary upload is disabled until the CAD library's complete corresponding-source bundle is verified. They are not automatically published releases. Local packaging commands are `npm run package:win`, `npm run package:mac` and `npm run package:linux`; use the command appropriate to the host. Packaging success does not prove interactive operation, signing or acceptance by the platform's application controls. Current evidence and its limits belong in [VALIDATION.md](VALIDATION.md).

Pull-request CI and security checks run for every target branch, including
stacked pull requests based on a feature branch. The workflow-dispatch entry
points can also validate a published branch explicitly. Inspect the actual
head and run results before reporting a pass.

## Pattern interaction regression

After building, run `npm run test:desktop:pattern-all`. On headless Linux,
use `xvfb-run -a npm run test:desktop:pattern-all` with the same Electron libraries
and sandbox helper as the standard smoke. CI is configured to run this command on each
platform before packaging; inspect the actual run before reporting a pass.

The command starts its own hidden production-loader child and isolated temporary
profile. Scripted DOM events edit the original selected-A pattern to dynamic ALL,
wait for the actual worker preview, Apply, Save As and reopen the saved output.
It checks per-owner geometry, exact refs and saved intent. Native file-dialog
choices are substituted with test-owned paths. A blank bootstrap initializes CDP
before the production page; the original preload also runs on that blank page.
This instrumentation does not supply CAD responses or replace document state.

See the [original fixture](../src/cad/fixtures/pattern-all-original.json),
[fixture provenance](PROVENANCE.md#instrumented-dynamic-all-desktop-fixture) and
[recorded validation](VALIDATION.md). The one linear cut workflow does not prove
human pointer/native-dialog interaction, other pattern families, stale-prefix
Apply, general ownership lifecycle or platform support. Its complete 180-second deadline
is separate from the unchanged standard smoke deadlines.

The separate `test:desktop:pattern-until-next` command uses three original
synthetic documents in one hidden, isolated child. It changes geometry copying
to regeneration, checks selected cut and additive merge, changes cut scope to
ALL with unchanged remote/behind owners, and observes a partial-profile
rejection that keeps Apply blocked. Successful cases use real Apply,
preload/IPC Save As and reopen. Dialog choices are restricted to test-owned
paths; actual worker responses supply volume, bounds and exact owner refs.
The existing budgets remain unchanged: 180 seconds for the parent,
170 seconds for the child workflow and 35 seconds for each step.
This command does not query native BRep, area or material probes through the UI,
run installed packages, or establish general platform support. Its original
fixture parameters and formulas belong in the provenance and validation record.
No result is implied by adding the command; record actual source-specific runs.

## Find the right layer

The standalone [rigid configuration core](ASSEMBLY_CONFIGURATIONS_CORE.md)
evaluates a separate named-state catalog without accepting new saved v2 fields.
Its pure and original native-placement cases run in the ordinary public unit
suite. Keep this prerequisite separate from configuration-aware native
references, scoped solve/writeback, source/BOM/export handling and the editor
lifecycle; those still require integration and source-specific acceptance.
The separate [configured reference context](ASSEMBLY_CONFIGURATIONS_NATIVE.md)
has original native frame/geometry/surface/profile/path, currentness and cleanup
regressions in that same suite. Its full current input and private proofs do not grant legacy
snapshot or configured solver authority. Run build and desktop smoke after
native integration changes, recording the baseline separately from feature
execution.

The [effective relation inventory](ASSEMBLY_CONFIGURATIONS_RELATIONS.md) has
separate pure declaration and native aggregate cases in the public unit suite.
Keep effective suppression, declaring-scope frames and compound incidence
distinct from solved physical satisfaction. Missing declaration diagnostics
are repairable data; a native processing failure must revoke the configured
session and cannot become an ordinary unavailable passive-state entry.

The [configured numerical bridge](ASSEMBLY_CONFIGURATIONS_NUMERIC.md) keeps
effective root-owner endpoint frames, detached all-family constraints and
independent bounded hinge/profile/path measurements separate from production
configured solving or Apply. Its original authored controls include fresh
native candidate reconstruction after standalone numerical experiments; they
do not implement catalog writeback, saved selectors or an editor lifecycle.
Keep native input/error policies and physical oracles distinct, and record
actual test/build/desktop execution separately in the validation record.

| Path | Responsibility |
| --- | --- |
| `src/model/` | Document schema, parsing, dependencies, references and history. |
| `src/sketch/` | Entity geometry, editing, structural validation and the local constraint solver. |
| `src/cad/` | Replicad/OpenCascade operations, BRep validation, worker transport and export. |
| `src/components/` | Sketch editor, 3D viewer and property panels. |
| `src/examples/` | Small reproducible documents exposed through the library. |
| `electron/` | Window, local application protocol, native file dialogs and the restricted IPC bridge. |

Keep geometry out of presentation-only mockups. A new tool should change the saved model through the editing layer and rebuild through the public CAD engine. In sketch trim/extend, preview and commit consume the solved geometry being displayed; they do not run a hidden solve. Driven values come from the solver result, not from a retained nominal value. Read the relevant contract before changing those rules.

Generated sketch IDs are opaque saved identities. Read the [identity contract](SKETCH_IDENTITY.md) before changing creation, preview/application or deletion behavior; a new creation and an edit of an existing object have different identity requirements.

Saved assembly mate endpoints are enumerated by
`src/model/assemblyMateEndpoints.ts`. Source updates and component replacement
share its exhaustive family switch and role lookup. A gear's explicit null
carrier is a fixed declaring scope; a missing role is a different condition.
The helper consumes validated declarations and provides no native authority.
Adding a relation with grouped references also requires explicit changes to
the parser, repair writes, native resolution and numerical owner incidence;
updating this saved-reference inventory alone does not implement the relation.

Numerical incidence uses the separate exhaustive visitor in
`src/model/assemblyNumericMateEndpoints.ts`. The numerical centered-width
constraint retains four original plane supports and has no binary endpoints.
Its [geometry and solver contract](ASSEMBLY_WIDTH_GEOMETRY.md#numerical-centered-solver)
confers no native reference authority. The separate
[saved centered-width integration](ASSEMBLY_WIDTH.md) authenticates all four
planes, preserves their grouped repair roles and provides editor controls.

The [numerical hinge-stop extension](ASSEMBLY_HINGE_STOPS_NUMERIC.md) adds two
co-owned angular planes and an explicit directed interval to the numerical
hinge. Its bilateral rank, active cone and finite direction-error checks are
separate observations. Its [standalone native bridge](ASSEMBLY_HINGE_STOPS_NATIVE.md)
adds six current proofs and independent measurement. The separate
[saved extension](ASSEMBLY_HINGE_STOPS.md) connects optional stops to the editor,
worker and repair visitors. Preserve the old unlimited four-role form and keep
source-specific integration evidence distinct from standalone checks.

The independent [ordered plane placement primitive](ASSEMBLY_PLANE_PLACEMENT.md)
measures four original planes along a moving ray with analytical owner
derivatives. Its transversal chart and signed distances add no saved Width
mode, solver admission or native reference authority.

The [saved profile-center family](ASSEMBLY_PROFILE_CENTER_MATES.md) connects
current full disks or rectangles with explicit material edges to native solve,
independent final checks and editor preview/Apply. Keep its saved admission
separate from mixed-profile mathematical measurement and from external default
or orientation policies. The configured desktop command requires its own
source-specific execution record.

The [bounded profile-center prerequisite](ASSEMBLY_PROFILE_CENTERS.md) recognizes
one complete native rectangular or circular planar boundary and independently
measures ordered centers/normals. Detached observations and numerical resolution
provide no current-reference proof, roll correspondence, saved mate or editor
command. Keep those remaining integration requirements explicit.

The separate [current profile-reference measurement](ASSEMBLY_PROFILE_REFERENCES.md)
requires exact active face/body/source identities and private snapshot-bound
profile witnesses. It composes centers in a common nearby frame while retaining
original placement-chain error. Its fresh read-only pair report does not grant
a saved mate, solver or editor capability.

The separate [symmetry geometry](ASSEMBLY_SYMMETRY_GEOMETRY.md) compares two
matching analytic supports about a third plane with three actual owner roles.
Its numerical solver retains points, lines, planes, spheres and cylinders,
including three moving, repeated and fixed owners. Point supports have no axis;
existing binary families cannot consume them. Position rows use the target
frame, normal rows the reflected source frame, with complete moving-frame
derivatives and geodesic radian scaling. Physical norm/angle checks remain
separate from component rows and local rank evidence. The
[saved/native symmetry workflow](ASSEMBLY_SYMMETRY.md) adds strict three-role
declarations, exact native witnesses, explicit uncertainty throughout numerical
trials and fresh independent final measurements. Native uncertainty never
widens the requested bands. Only the absent-tuple standalone numerical API keeps
its previous tolerance-sum compatibility. Dropdown editing and worker capability
remain separate from read-only report DTOs and viewport point picking. Consult
source-specific validation before claiming an executed interaction or lifecycle.

The [native vertex reference prerequisite](ASSEMBLY_VERTEX_REFERENCES.md)
adds conservative exact-incidence keys and current point queries, separate from
mesh positions, explicit datums, sphere centres and directional witnesses.
Snapshot-issued point proof is private, live and document-bound; copying display
metadata never authenticates a point. This prerequisite adds no saved mate or
vertex-picking/editor command and does not complete symmetry integration.

Lengths use millimeters. State angular units explicitly: the sketch's directed angular dimensions use degrees, while geometric calculations may use radians. Persisted point-on-line and point-on-circle relations use complete supports; a finite hit test is a separate requirement. Useful starting points are [sketch types](../src/sketch/types.ts), the [solver](../src/sketch/solver.ts), [trim](../src/sketch/trim.ts), [extend](../src/sketch/extend.ts) and their adjacent regression tests.

Read the [semantic CAD reference contract](SEMANTIC_REFERENCES.md) before changing extrusion provenance, v2 reference identity, document acceptance or selection aliases. This branch integrates verified references for the first eligible finite entity-profile extrusion and retains conservative v1 behavior for saved references and unsupported correspondence. Original regression inputs and analytical expectations are recorded in [fixture provenance](PROVENANCE.md); written tests and source-level ownership reasoning are not executed validation results.

The proposed [body management contract](BODY_MANAGEMENT.md) covers persistent body identity, explicit creation and Combine, selective cuts, history, export and the complete implementation checklist for issue #26. Its analytical fixtures are acceptance targets, not recorded passes.

The [scoped feature geometry contract](FEATURE_PATTERNS.md) distinguishes exact
per-owner contributions, potential historical states and native availability.
Its signed material copying is separate from the initial saved per-instance
regeneration path. Geometry/true keeps selected targets. Varying sketches,
additive ALL, dynamic geometry scope, AUTO discovery and broader recipes remain
required work.

The [feature recipe declaration layer](FEATURE_RECIPES.md) documents the pure
closure/frame API. The [regeneration contract](FEATURE_REGENERATION.md) connects
explicit-frame tool construction, chronological evaluation and the saved
selected or cut-only ALL scope. The initial native path accepts intrinsic
rectangle/circle cuts or selected merge extrusions with blind/ThroughAll endings
or an explicit fixed principal-plane UpToSurface limit, and no variation.
The bounded saved policy names the seed and end-condition locator; it is never
inferred from geometry. ALL resolves the complete current native
catalog on each rebuild; it does not save a target snapshot. Limits remain
32 selected targets, 256 dynamic owners and 512 active owner applications, with
separate closure/history envelopes. Geometry copy/true and regeneration/false have distinct saved
declarations; legacy false without the explicit mode still rejects.

The 51 pure declaration, 21 evaluator and 18 saved engine cases have different
boundaries. Exact source capture, current-target checks, ordered operations,
atomic owner publication and programmatic save/reopen/history checks do not
establish real property-panel interaction or worker preview/Apply behavior.
Check the actual source-specific [validation](VALIDATION.md) before extending
an earlier component or desktop-smoke result to later integrated source.

The dynamic ALL increment adds 54 authored cases across 17 model/command, seven
SSR, 18 native scope/evaluator, eight saved-engine and four contextual deletion
cases. Counts are fixture inventory, not passing results. ALL retains exact
historical sources and native current-target proofs; only changed owners advance.
An exact consumer through ALL still depends on its body's creator, while ALL
itself is not a saved inventory dependency. Additive ALL and AUTO remain explicit
pending capabilities. Their full contract and evidence boundaries are in
[FEATURE_REGENERATION](FEATURE_REGENERATION.md#dynamic-all-scope) and
[PROVENANCE](PROVENANCE.md#dynamic-all-model-and-rendered-fixtures).

## Test geometry and persistence

The local [rigid assembly proposal](ASSEMBLIES.md) adds separate version-2 APIs,
repairable occurrence-scoped declarations, a simultaneous solver and a dedicated
workspace/worker route. Keep graph, native placement, solver, scripted renderer
interaction and file IPC evidence separate. `test:desktop:assembly` uses the same
hidden isolated production harness as the pattern workflows and a statically
selected original fixture. Actual worker replies supply geometry/solver results;
test-owned native-dialog paths select files. It does not establish human pointer
or native-dialog operation, flexible motion, structural exports or platform
support. CI is configured to run the case on each target; inspect executed runs.
The movement stage uses absolute local translation and incremental local rotation
controls, actual native relation checks and authenticated Apply, with a temporary
solve anchor that is never saved as a fixed flag or mate. Numeric target controls
do not establish pointer dragging, continuous path following or collision stopping.
The [explicit angular request](ASSEMBLY_MOTION.md) preserves signed whole turns
and checks bounded stations before publishing one final preview. The gear stage
adds +720-degree Cancel/Apply/Undo/Redo and saved-winding checks, plus rejection
of an incompatible full X turn. Station checks are not continuous collision
evidence, and the existing command deadlines remain unchanged.
The separate [screw relation](ASSEMBLY_SCREWS.md) includes coaxial alignment and
component-origin axial travel. `test:desktop:assembly-screw` creates bearings
and a guided slider from an original unmated fixture, then uses actual capture,
numeric rotation/translation, Cancel/Apply, Undo/Redo, parameter edits,
suppression/reactivation and file IPC. It runs in its own hidden isolated child
with the same 180/170/35-second parent/child/step limits. Its millimeter coupling
tolerance must not be reported as an identical angular follower tolerance.
CI is configured to run this command separately on each target; inspect actual
source-specific results before claiming execution or platform support.
For local visual review, `SOLIDFLOW_UI_CAPTURE=1` adds one hidden `capturePage`
PNG to the assembly test's JSON output after the final reopened gear mechanism.
Earlier recorded interference, movement and source-update runs retain their
own capture points. Capture is read-only,
keeps the window hidden, and is disabled by default in CI. The parent verifies
its bytes/hash before cleaning up the isolated profile. Keep such local output
under ignored artifacts; a screenshot is not native geometry or interaction proof.

The separate [flat assembly export](ASSEMBLY_EXPORT.md) reconstructs committed
native geometry rather than exporting a displayed preview. Its
`test:desktop:assembly-export` command uses a tracked original fixture and the
same hidden isolated production harness, real worker and restricted file IPC.
Dialog paths are test-owned; this does not establish human native-dialog or
installed-package operation. Geometry-only STEP and tessellated STL have
different validation boundaries from structural assembly interchange. CI is
configured to run the command on each target, which is not an executed result.

The separate [parallel/perpendicular relation proposal](ASSEMBLY_DIRECTION_MATES.md)
uses exact plane normals, cylindrical axes and native LINE edges. Mixed
plane/direction pairs reverse the collinear/orthogonal interpretation compared
with two planes or two directions. Its fixed original-fixture
`test:desktop:assembly-direction` command retains the existing isolated hidden
production harness and deadlines; it does not inject solver replies or committed
state. CI configuration and authored cases do not imply execution or platform
support. Record source-specific outcomes in the validation record.

The separate [plane/cylindrical-surface tangent proposal](ASSEMBLY_TANGENT_MATES.md)
uses an explicit surface reference and a side relative to the plane normal.
Its constraints apply to infinite analytic supports; native support-normal
reports are separate from finite contact or body interference. The fixed
`test:desktop:assembly-tangent` command uses the same hidden production harness,
test-owned dialogs and deadlines. Record actual numerical, native, renderer and
saved-file results separately; configured CI is not an executed platform pass.

The separate [cylinder surface tangency proposal](ASSEMBLY_CYLINDER_TANGENCY.md)
retains distinct nonparallel and added-parallelism intent, fresh surface
witnesses and declared internal radius roles. Its fixed
`test:desktop:assembly-cylinder-tangent` command uses two original documents
with the same hidden child, test-owned dialogs and unchanged deadlines. Neither
variant inherits the plane/cylinder straight-translation proof. Record executed
source-specific native, UI and file results before claiming a pass.

The separate [signed plane-distance interval proposal](ASSEMBLY_LIMIT_DISTANCE.md)
retains bilateral alignment and explicit inclusive signed bounds. Its
`test:desktop:assembly-limit-distance` command uses an original two-box document,
actual worker replies and test-owned file dialogs under the unchanged hidden
harness deadlines. Cone projection and strict movement are distinct operations;
an active unilateral boundary is not a bilateral position lock. Authored cases
and configured CI do not imply execution or platform support. Record actual
numerical, native, renderer and persistence evidence separately.

The dependent [principal direction-angle interval proposal](ASSEMBLY_LIMIT_ANGLE.md)
uses explicit inclusive degree bounds and a declared principal coordinate.
Its `test:desktop:assembly-limit-angle` command uses the original rotated
two-box document and the same hidden production harness, test-owned dialog
paths and unchanged deadlines. Domain endpoints, singular restoration and
signed winding stops have distinct contracts; no cosine-gradient zero or
passing regular case establishes their acceptance. Record actual numerical,
native, renderer, path and saved-file results separately. A configured CI job
is not an executed platform pass.

The [part replacement contract](ASSEMBLY_COMPONENT_REPLACEMENT.md) separates
selected expanded-instance isolation from replacing all exact-source uses.
`test:desktop:assembly-replacement` checks two levels of reused subassemblies,
explicit face/LINE repairs and actual gear recapture, with one replacement Apply,
Undo/Redo and Save As/reopen. It uses original synthetic files, real worker
results and test-owned dialog paths under the existing hidden harness deadlines.
CI is configured to run this command on each target; only executed results can
establish the checked platform/case. Screw/rack native tests are separate from
this gear-specific renderer workflow, which does not prove general automatic
correspondence, human dialogs, subassembly replacement or configurations.

Prefer small analytical fixtures with a known result. For example, a closed 10×6 rectangle extruded 4 mm should have volume 240 mm³; the test should also establish valid BRep and the expected number of solids. For affected references, edit an earlier feature, rebuild dependent features and serialize/reopen the document. Test failure paths for atomic behavior when the command can reject a change.

The [subassembly source-update contract](ASSEMBLY_SUBASSEMBLY_UPDATES.md)
describes a separate all-use update from a complete v2 source with an authored
new revision. The worker retains the exact plan and native catalog, requires
explicit descendant repairs and capture decisions, and grants Apply only after
a fresh solve. Its renderer workflow checks an original fixed-prism case with
a renamed child; source-local inspection of suppressed children is separate
from active parent-placement checks. Configured CI is not platform acceptance.

OpenCascade/WASM tests use the public Vitest `forks` pool: isolated child processes with a fresh worker per test file under Vitest's enabled isolation default. Initialize the runtime before constructing shapes, dispose engines and release owned native objects after use. Keep focused checks on the project configuration. The worker-count policy, test selection and timeouts remain unchanged; avoid sharing mutable kernel state across test files or weakening validity checks to accommodate a failing fixture.

Distinguish these evidence types in reports: numerical unit/integration tests, server-rendered components, browser or Electron interaction and exported-file checks. Record the exact files and commands used. Public CI must be self-contained: it uses tracked source, declared dependencies and synthetic fixtures that the project can distribute. A new fixture needs documented provenance, generation steps, parameters, units and tolerances. Do not invent a source or an expected result to fill a gap in evidence.

The [directed circular stop contract](ASSEMBLY_DIRECTED_ANGLE_STOPS.md) adds an
explicit third guide and an inclusive start/sweep arc. Its independent coordinate
does not reinterpret principal-angle files or count accumulated turns.
`test:desktop:assembly-directed-angle` reuses the tracked original drilled-prism
fixture, real production controls/worker and isolated test-owned Open/Save As
paths under the existing harness deadlines. Six actual local-X pointer drags
use trusted DOM client points and posted request poses for calibration;
the candidate's solved pose supplies neither calibration nor expected
projection. The actual request is bounded against its ideal target, then independently clamped to
literal [-30,60] before checking native/report/display output. Keep those two
precision checks distinct. Save/reopen retains the captured request-derived
expectation. See the [pointer oracles](PROVENANCE.md#directed-circular-stop-pointer-oracles)
and record source-specific results separately; neither configured CI nor a
sampled path proves general platform support, continuous motion or the
complete assembly demo.

The same fixed command then opens an original three-prism shared-source
case, updates depth and through-hole length together, and repairs first,
second and LINE-guide references through actual controls. It checks missing
repairs, ready Cancel, a fresh explicit r1 verification, a distinct revision
retry, Apply, one Undo/Redo and saved reopening. Cancel may restore the
confirmed scene from cache; do not require an unsolicited worker build.
Both workflows share the unchanged time budget and explicit test-owned file
queues; the final capture belongs to the repaired three-prism document.
See the [source-update fixture](PROVENANCE.md#directed-circular-stop-shared-guide-update-fixture)
for independent geometry and evidence limits.

The [native symmetry measurement contract](ASSEMBLY_SYMMETRY_NATIVE_MEASUREMENT.md)
describes standalone read-only comparison of three explicit roles across point,
line, plane, sphere and cylinder purposes. Its fresh snapshot proofs, independent
physical residuals and uncertainty admission grant no saved-mate, solve or Apply
authority. Keep numerical, native and UI evidence separate; repair, persistence
and complete-demo integration remain outside this measurement contract.

## Work safely with desktop files

The [revolute hinge prerequisite](ASSEMBLY_HINGE_CORE.md) supplies numerical
constraints and standalone current-native resolution and measurement. Its
[saved integration](ASSEMBLY_HINGE.md) adds four-role intent, editor/worker
preview/Apply and repair. Preserve actual rigid owners in reference contexts,
qualify axial planes structurally and check physical spin separately from a
DOF count. The [optional angular stops](ASSEMBLY_HINGE_STOPS.md) have their own
six-role lifecycle. Complete assembly acceptance remains open.

The renderer must stay isolated from general Node.js and filesystem access. Use the existing preload/IPC bridge and native-dialog grants for file operations. Do not add arbitrary IPC commands, disable navigation/protocol checks, remove size limits or persist privileged paths in a document to work around a UI problem. Security regressions need tests in the desktop-security suite and a private report if they expose users.

Do not include local recovery data, binaries or output from `artifacts/`, `dist/` or `release/` in a code pull request. Keep generated files out of changes unless the repository explicitly tracks them. See [CONTRIBUTING.md](../CONTRIBUTING.md) for review and provenance requirements.

### Bounded path-curve prerequisite

The [bounded path-curve contract](ASSEMBLY_PATH_CURVES.md) documents current native
LINE/circle observation and evaluation, strict snapshot proof lifetime and
local/world numerical budgets. It adds no saved Path mate, solver family, editor
or worker command. Its original CAD regressions run with the ordinary public
unit suite; source-specific validation remains recorded separately.

The [material circular-arc origin](ASSEMBLY_MATERIAL_ARC_PATH.md) adds a separate
joint edge/vertex purpose for open circular trims. Keep its private proof,
evaluation-specific precision and material-origin direction separate from the
generic parameter-sense observer and the saved LINE family. Its original
regressions use the same public unit suite; it adds no worker or editor command.

The [numerical circular-path layer](ASSEMBLY_CIRCULAR_PATH_NUMERIC.md) adds
explicit trim/support-circle domains, fixed material distance, changing-tangent
Follow/UP, actual owner incidence and local constrained movement. Its separate
radius/frame/sweep errors are mandatory numerical declarations, not inferred
native metrology. Keep it separate from saved mate authentication, native
admission, worker/editor commands and lifecycle. Original mathematical and CAD
experiments run in the public unit suite; record source-specific execution.

The separate [current-native circular bridge](ASSEMBLY_CIRCULAR_PATH_NATIVE.md)
derives numerical constraints from current material proofs and independently
verifies candidate poses with fresh queries. Its stored analytic Float64 model
keeps topology tolerances separate from center/radius/frame/sweep and native D1
arithmetic. Retain original placement-chain budgets and actual root owners;
scoped selection does not introduce child freedom. This bridge adds no saved
mate, worker command, editor or Apply capability. Its original native tests run
in the public unit suite; run build and desktop smoke after integration changes
and record only the actual checked cases and platforms.

The [saved circular-path family](ASSEMBLY_CIRCULAR_PATH.md) connects these current
proofs to explicit saved intent, scoped numerical owners, fresh independent final
checks and private worker preview/Apply. Repair code must choose LINE or arc
purpose from the saved mate family and endpoint role; their compound reference
shapes are identical. Positive native circular-origin scene metadata nominates
editor/repair choices, never proofs. The separate production-renderer command
above uses unchanged hidden-harness deadlines and real worker/file IPC. Record
its actual source-specific execution independently of configured CI.
