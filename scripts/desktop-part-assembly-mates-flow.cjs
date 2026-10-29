'use strict';
const fsp = require('node:fs/promises');

// Continues the real sequential-part transfer only after its original two-use
// Save As/reopen assertions. All new identities come from actual UI/worker work.
module.exports = function combinedAssemblyWorkflow(context) {
  const { page, press, field, navigation, observe, waitFor, menuKey, check, checks, canonical, digest,
    input, output, partAssemblyOutput, partAssemblyPinInput, ipc, dialogCounts } = context;
  const APPLY = 'button[aria-label="Aplicar ensamblaje"]';
  const CANCEL = 'button[aria-label="Cancelar vista previa del ensamblaje"]';
  const TYPE = 'select[aria-label="Tipo de relación"]';
  const NAME = 'input[aria-label="Nombre de la relación"]';
  const DISTANCE = 'input[aria-label="Distancia firmada"]';
  const phases = [], inputs = [], matePlans = [], bodyOwners = {}, rotationCaptures = {};
  const evidence = { scenario: 'sequential-part-three-component-rigid-demo', phases, inputs, rotationCaptures,
    inputLimits: 'Actual CDP presses/releases and Tab. Visible native form setters declare numeric/name/select intent. Origin references use the existing explicit origin forms, not viewport picking. No app state, camera, reference, native result or Apply capability is injected.',
    limits: 'One original sequential part copied twice and one original 3x2x4 prism. Four origin relations and two captured rotation locks. Native V/A1e-5 and coordinates1e-6; quaternion comparison1e-8. Before the fourth mate, Pin axial Z is free; before its rotation capture, roll is free too. Those coordinates are recorded as observations and bounds consistency only. Final Pin position is literal and its orientation comes from the verified pre-capture input snapshot. Guía retains the checked identity seed branch before full closure, without a general uniqueness claim. No contact, collision, imported CAD, assembly export, human-demo or installed-platform claim.' };
  const near = (actual, wanted, tolerance, label) => check(Number.isFinite(actual) && Math.abs(actual - wanted) <= tolerance,
    label + ': actual=' + actual + ', expected=' + wanted + ', tolerance=' + tolerance);
  const vector = (actual, wanted, tolerance, label) => {
    check(Array.isArray(actual) && actual.length === wanted.length, label + ' dimensions');
    actual.forEach((value, axis) => near(value, wanted[axis], tolerance, label + '[' + axis + ']'));
  };
  const unitQuaternion = (q, label) => {
    check(Array.isArray(q) && q.length === 4 && q.every(Number.isFinite), label + ' finite quaternion');
    near(Math.hypot(...q), 1, 1e-9, label + ' unit quaternion');
  };
  const identity = (q, label) => {
    unitQuaternion(q, label);
    vector(q.slice(0, 3), [0, 0, 0], 1e-8, label + ' identity vector'); near(Math.abs(q[3]), 1, 1e-8, label + ' identity scalar');
  };
  // Hand-written Hamilton arithmetic is independent of the CAD pose helpers.
  const product = ([ax, ay, az, aw], [bx, by, bz, bw]) => [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
  const conjugate = ([x, y, z, w]) => [-x, -y, -z, w];
  const sameQuaternion = (actual, wanted, label) => {
    unitQuaternion(actual, label); unitQuaternion(wanted, label + ' expected');
    const sign = actual.reduce((sum, value, axis) => sum + value * wanted[axis], 0) < 0 ? -1 : 1;
    vector(actual.map(value => value * sign), wanted, 1e-8, label);
  };
  const rotatedPoint = (q, point) => product(product(q, [...point, 0]), conjugate(q)).slice(0, 3);
  function pinBounds(q, translation) {
    const corners = [0, 3].flatMap(x => [0, 2].flatMap(y => [0, 4].map(z =>
      rotatedPoint(q, [x, y, z]).map((value, axis) => value + translation[axis]))));
    return { min: [0, 1, 2].map(axis => Math.min(...corners.map(p => p[axis]))),
      max: [0, 1, 2].map(axis => Math.max(...corners.map(p => p[axis]))) };
  }
  const withoutStamp = doc => { const { updatedAt, ...rest } = doc; return rest; };
  const tree = id => '[data-assembly-tree-path=' + JSON.stringify(JSON.stringify([id])) + ']';
  const serial = async () => (await observe.counters()).serial;
  let rootId, baseId, guideId, pinId, partDefinition, pinDefinition, partDocument, pinDocument, committedScene;
  let positions = { base: [0, 0, 0], guide: [0, 0, 0], pin: null };
  const names = {};
  function occurrence(doc, id) {
    const matches = doc.occurrences.filter(value => value.id === id); check(matches.length === 1, 'One exact observed occurrence ' + id); return matches[0];
  }
  const component = id => ({ occurrencePath: [id], definition: { ...(id === pinId ? pinDefinition : partDefinition) } });
  const reference = (kind, id, value) => ({ kind, component: id ? component(id) : null,
    [kind === 'principal-axis' ? 'axis' : 'plane']: value });
  async function action(selector, text = '') {
    await navigation.reveal(selector, text);
    await waitFor('current enabled combined-demo control ' + (text || selector), () => page((selector, text) => {
      const matches = [...document.querySelectorAll(selector)].filter(e => !text || e.textContent.trim() === text);
      return matches.length === 1 && !matches[0].disabled && !matches[0].closest('[hidden]') && matches[0].getClientRects().length > 0;
    }, selector, text));
    await page((selector, text) => {
      const matches = [...document.querySelectorAll(selector)].filter(e => !text || e.textContent.trim() === text);
      if (matches.length !== 1) throw Error('One combined-demo control required');
      matches[0].scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    }, selector, text);
    await press(selector, text); inputs.push({ input: 'actual CDP left press/release', selector, text });
  }
  async function value(selector, supplied) {
    await navigation.reveal(selector);
    await waitFor('current enabled combined-demo field ' + selector, () => page(selector => {
      const fields = document.querySelectorAll(selector), e = fields[0];
      return document.querySelector('.assembly-app')?.getAttribute('aria-busy') === 'false'
        && fields.length === 1 && !e.disabled && !e.closest('[hidden]') && e.getClientRects().length > 0;
    }, selector));
    await field(selector, String(supplied)); inputs.push({ input: 'visible native field setter and bubbling event', selector, value: String(supplied) });
  }
  async function response(after, actionName) {
    return waitFor('actual combined-demo worker ' + actionName, async () => {
      const state = await observe.assemblyResponseAfter(after, actionName);
      check(!state.workerErrors.length && state.completedCount <= 1, 'One bounded combined-demo response without worker errors');
      if (!state.record) return false;
      check(state.record.response.ok, state.record.response.error || 'Combined-demo worker rejected ' + actionName); return state.record;
    });
  }
  async function recovery(doc) {
    await waitFor('exact idle committed combined-demo recovery', () => page(() => ({
      raw: localStorage.getItem('solidflow.autosave'), idle: document.querySelector('.assembly-app')?.getAttribute('aria-busy') === 'false',
    })).then(state => state.idle && state.raw && canonical(JSON.parse(state.raw)) === canonical(doc)));
  }
  function declarations(doc, guideX) {
    check(doc.mates.length === matePlans.length && new Set(doc.mates.map(m => m.id)).size === matePlans.length, 'Exactly the authored distinct relation identities');
    for (const plan of matePlans) {
      const actual = doc.mates.find(m => m.id === plan.id), wanted = { ...plan.intent };
      if (plan.role === 'guide-distance') wanted.distance = -guideX;
      check(actual && canonical(actual) === canonical({ id: plan.id, ...wanted }), 'Exact ordered relation, suppression, capture and numeric intent for ' + plan.role);
    }
  }
  function geometry(scene, doc, phase, expectedPositions = positions, guideX = 35, freshNativeMeasurement = true) {
    const count = pinId ? 3 : 2;
    check(doc.version === 2 && doc.kind === 'assembly' && doc.id === rootId && doc.units === 'mm'
      && doc.occurrences.length === count && doc.definitions.length === (pinId ? 2 : 1), 'Unchanged root with exact occurrence/definition inventory');
    const original = doc.definitions.filter(d => canonical({ id: d.id, revision: d.revision }) === canonical(partDefinition));
    check(original.length === 1 && original[0].kind === 'part' && canonical(original[0].document) === canonical(partDocument)
      && !Object.hasOwn(original[0], 'sourceLink'), 'Both original uses retain the exact independently copied sequential definition');
    if (pinId) {
      const imported = doc.definitions.filter(d => canonical({ id: d.id, revision: d.revision }) === canonical(pinDefinition));
      check(imported.length === 1 && imported[0].kind === 'part' && canonical(imported[0].document) === canonical(pinDocument)
        && !Object.hasOwn(imported[0], 'sourceLink') && pinDefinition.id !== partDefinition.id, 'Third use has its own exact original embedded prism definition');
    }
    check(scene.kind === 'assembly-scene' && scene.bodies.length === count && scene.solidCount === count
      && scene.prototypeCount === (pinId ? 2 : 1) && !scene.warnings.length, 'Exact native body/prototype counts without warnings');
    near(scene.volume, pinId ? 2184 : 2160, 1e-5, 'Independent component-sum volume');
    near(scene.area, pinId ? 1876 : 1824, 1e-5, 'Independent component-sum surface area');
    const bounds = [], poseOracles = [];
    const pinAxisActive = matePlans.some(plan => plan.role === 'pin-axis');
    const pinAxialFree = pinAxisActive && !matePlans.some(plan => plan.role === 'pin-distance');
    for (const [role, id] of [['base', baseId], ['guide', guideId], ...(pinId ? [['pin', pinId]] : [])]) {
      const member = occurrence(doc, id), definition = role === 'pin' ? pinDefinition : partDefinition, target = expectedPositions[role];
      check(canonical(member.definition) === canonical(definition) && member.name === names[role]
        && member.fixed === (role === 'base') && member.visible && !member.suppressed, 'Exact component identity and fixed/free/visible state for ' + role);
      let wantedPosition = target, wantedRotation = [0, 0, 0, 1];
      let oracle = 'literal-position-and-identity-orientation';
      if (role === 'pin' && pinAxisActive) {
        check(Array.isArray(member.pose.translation) && member.pose.translation.length === 3 && member.pose.translation.every(Number.isFinite),
          'Pin has a finite observed translation while its axial coordinate may remain free');
        unitQuaternion(member.pose.rotation, 'Pin observed unit orientation');
        vector(rotatedPoint(member.pose.rotation, [0, 0, 1]), [0, 0, 1], 1e-8, 'Pin remains coaxial with the literal Guía Z axis');
        if (pinAxialFree) wantedPosition = [target[0], target[1], member.pose.translation[2]];
        const capture = rotationCaptures['pin-axis'];
        if (capture) {
          // Both factors are immutable verified inputs retained before Capture.
          wantedRotation = product(capture.firstQuaternion, capture.relativeQuaternion);
          oracle = pinAxialFree ? 'literal-XY-and-captured-input-orientation; observed-free-Z-consistency'
            : 'literal-XYZ-and-captured-input-orientation';
        } else {
          check(pinAxialFree, 'A fully placed Pin requires its earlier immutable rotation-capture input');
          wantedRotation = member.pose.rotation.slice();
          oracle = 'literal-XY-and-coaxial-Z; observed-free-Z-and-roll-bounds-consistency';
        }
      }
      vector(member.pose.translation, wantedPosition, 1e-6, 'Component position oracle ' + role);
      if (role !== 'pin' || !pinAxisActive) identity(member.pose.rotation, 'Literal component orientation ' + role);
      else if (rotationCaptures['pin-axis']) sameQuaternion(member.pose.rotation, wantedRotation, 'Pin captured-input orientation oracle');
      const bodies = scene.bodies.filter(b => canonical(b.component) === canonical({ occurrencePath: [id], definition }));
      check(bodies.length === 1 && bodies[0].solidCount === 1, 'One native solid for exact occurrence and definition ' + role);
      const body = bodies[0];
      if (!Object.hasOwn(bodyOwners, role)) bodyOwners[role] = structuredClone(body.body);
      check(canonical(body.body) === canonical(bodyOwners[role]), 'Original material body reference remains exact for ' + role);
      if (role !== 'pin') check(body.body.bodyId === 'seq-body', 'Original explicit sequential material owner');
      vector(body.worldPose.translation, wantedPosition, 1e-6, 'Native world position ' + role);
      if (role !== 'pin' || !pinAxisActive) identity(body.worldPose.rotation, 'Native world orientation ' + role);
      else sameQuaternion(body.worldPose.rotation, wantedRotation, 'Native Pin world orientation oracle');
      near(body.volume, role === 'pin' ? 24 : 1080, 1e-5, 'Independent member volume ' + role);
      near(body.area, role === 'pin' ? 52 : 912, 1e-5, 'Independent member surface area ' + role);
      const { min: lo, max: hi } = role === 'pin' ? pinBounds(wantedRotation, wantedPosition)
        : { min: [-11, -6, 0].map((v, i) => v + target[i]), max: [11, 6, 9].map((v, i) => v + target[i]) };
      vector(body.bounds.min, lo, 1e-6, 'Native lower bounds from declared oracle ' + role); vector(body.bounds.max, hi, 1e-6, 'Native upper bounds from declared oracle ' + role);
      bounds.push({ min: lo, max: hi });
      poseOracles.push({ role, oracle, position: wantedPosition.slice(), rotation: wantedRotation.slice(),
        ...(role === 'pin' && pinAxialFree ? { freeAxialZObserved: member.pose.translation[2] } : {}) });
    }
    const unionOracle = pinAxialFree ? 'Union bounds consistency with the observed free Pin axial coordinate' : 'Independent union bounds';
    vector(scene.bounds.min, [0, 1, 2].map(i => Math.min(...bounds.map(b => b.min[i]))), 1e-6, unionOracle + ' minimum');
    vector(scene.bounds.max, [0, 1, 2].map(i => Math.max(...bounds.map(b => b.max[i]))), 1e-6, unionOracle + ' maximum');
    declarations(doc, guideX);
    phases.push({ phase, freshNativeMeasurement, documentSha256: digest(canonical(doc)), volume: scene.volume, area: scene.area,
      bounds: scene.bounds, poseOracles, mates: doc.mates, members: scene.bodies.map(b => ({ component: b.component, body: b.body, worldPose: b.worldPose,
        volume: b.volume, area: b.area, bounds: b.bounds })) });
    return scene;
  }
  function verified(row, baseline, phase, expectedPositions = positions, guideX = 35, rigid = false) {
    const value = row.response.value;
    check(canonical(row.current) === canonical(baseline) && value.status === 'ready' && value.hasToken,
      'Actual native preview is bound to the exact committed baseline with private Apply authority');
    check(value.checks.length === value.document.mates.length && value.checks.every(c => c.satisfied
      && Number.isFinite(c.lengthResidual) && c.lengthResidual <= c.lengthTolerance
      && Number.isFinite(c.angleResidual) && c.angleResidual <= c.angleTolerance), 'Each authored relation passes its existing native residual policy');
    check(value.scopes.length === 1, 'One explicit root solve scope');
    if (rigid) check(!value.scopes[0].temporaryAnchor && value.scopes[0].result.localDOF === 0, 'Four mates and two locks leave zero local DOF without a temporary anchor');
    geometry(value.scene, value.document, phase, expectedPositions, guideX);
    phases[phases.length - 1].nativeChecks = value.checks; phases[phases.length - 1].scopes = value.scopes;
    return value;
  }
  async function apply(candidate, phase, expectedPositions = positions, guideX = 35) {
    const before = await serial(); await action(APPLY); const row = await response(before, 'apply-assembly'), result = row.response.value;
    check(row.hasToken && result.kind === 'assembly-applied' && canonical(withoutStamp(result.document)) === canonical(withoutStamp(candidate.document)),
      'Apply consumes authority only for the exact verified candidate');
    geometry(result.scene, result.document, phase, expectedPositions, guideX); await recovery(result.document); committedScene = result.scene;
    return result.document;
  }
  async function build(before, phase, expectedPositions = positions, guideX = 35) {
    const row = await response(before, 'build-assembly'); geometry(row.response.value, row.document, phase, expectedPositions, guideX);
    await recovery(row.document); committedScene = row.response.value; return row.document;
  }
  async function select(id) {
    await action(tree(id));
    await waitFor('selected exact combined-demo component', () => page(selector => document.querySelector(selector)?.getAttribute('aria-selected') === 'true', tree(id)));
  }
  async function rename(doc, role, id, wanted) {
    if (occurrence(doc, id).name === wanted) return doc;
    await select(id); await action('[aria-label="Nombre del componente"]'); await value('[aria-label="Nombre del componente"]', wanted);
    const before = await serial(); await menuKey('Tab'); inputs.push({ input: 'actual CDP Tab commits component-name blur', role });
    names[role] = wanted; const result = await build(before, 'rename-' + role);
    const expected = structuredClone(doc); occurrence(expected, id).name = wanted; expected.updatedAt = result.updatedAt;
    check(canonical(result) === canonical(expected), 'Name blur changes only the intended occurrence name and document timestamp'); return result;
  }
  async function move(doc, role, id, translation) {
    await select(id);
    for (const [i, axis] of ['X', 'Y', 'Z'].entries()) await value('[aria-label="Destino local ' + axis + ' del componente"]', translation[i]);
    await value('[aria-label="Giro local del movimiento en grados"]', 0);
    const before = await serial(); await action('[aria-label="Vista previa del movimiento"]'); const row = await response(before, 'move-assembly-component-motion');
    check(canonical(row.motion.component) === canonical(component(id)) && canonical(row.motion.translation) === canonical(translation)
      && row.motion.rotation.angle === 0, 'Literal numeric movement intent targets only the exact selected occurrence');
    positions = { ...positions, [role]: translation };
    const candidate = verified(row, doc, 'move-' + role + '-preview');
    check(canonical(candidate.document.mates) === canonical(doc.mates) && canonical(candidate.document.definitions) === canonical(doc.definitions)
      && doc.occurrences.filter(o => o.id !== id).every(o => canonical(occurrence(candidate.document, o.id)) === canonical(o)),
    'Movement changes no source, persistent relation or other occurrence');
    await recovery(doc); return apply(candidate, 'move-' + role + '-applied');
  }
  async function origin(slot, kind, id, axisOrPlane) {
    await action('[aria-label="Referencia ' + slot + ' de la relación"]');
    const axis = kind === 'principal-axis', owner = axis ? 'Componente del eje de origen' : 'Componente del plano';
    const source = 'select[aria-label="' + owner + '"]', summary = axis ? 'Usar un eje de origen' : 'Usar un plano principal';
    const open = await page(selector => document.querySelector(selector)?.closest('details')?.open === true, source);
    if (!open) await action('#assembly-panel-relations summary', summary);
    await value(source, id ? JSON.stringify([id]) : 'scope');
    await value('select[aria-label="' + (axis ? 'Eje de origen' : 'Plano principal') + '"]', axisOrPlane);
    const before = await observe.counters();
    await action('#assembly-panel-relations button', (axis ? 'Usar eje en referencia ' : 'Usar en referencia ') + slot);
    const expected = reference(kind, id, axisOrPlane);
    await waitFor('exact explicit origin assigned to intended role', () => page((slot, expected) => {
      const raw = document.querySelector('[aria-label="Referencia ' + slot + ' de la relación"] span')?.getAttribute('title');
      return raw && JSON.stringify(JSON.parse(raw)) === JSON.stringify(expected);
    }, slot, expected));
    check(canonical(await observe.counters()) === canonical(before), 'Explicit origin selection performs no CAD work');
    inputs.push({ input: 'existing explicit origin form with actual pointer assignment', slot, reference: expected });
  }
  async function addMate(doc, role, type, name, first, second, distance) {
    await value(TYPE, type); await value(NAME, name); await value('select[aria-label="Orientación de la relación"]', 'aligned');
    if (type === 'distance') await value(DISTANCE, distance);
    await origin(1, first.kind, first.id, first.value); await origin(2, second.kind, second.id, second.value);
    const before = await serial(); await action('#assembly-panel-relations button', 'Vista previa de la nueva relación');
    const row = await response(before, 'preview-assembly'), proposed = row.response.value.document;
    const added = proposed.mates.filter(m => !doc.mates.some(old => old.id === m.id));
    check(added.length === 1 && doc.mates.every(old => canonical(proposed.mates.find(m => m.id === old.id)) === canonical(old)), 'Exactly one new relation preserves all earlier declarations');
    const intent = { name, suppressed: false, type, first: reference(first.kind, first.id, first.value), second: reference(second.kind, second.id, second.value),
      alignment: 'aligned', ...(type === 'concentric' ? { rotationLock: null } : { distance }) };
    matePlans.push({ role, id: added[0].id, intent });
    const candidate = verified(row, doc, role + '-preview', positions, 35, proposed.mates.length === 4);
    await recovery(doc); return apply(candidate, role + '-applied');
  }
  async function lock(doc, role) {
    const plan = matePlans.find(p => p.role === role); check(plan?.intent.type === 'concentric' && plan.intent.rotationLock === null, 'Saved free concentric selected for native capture');
    let before = await serial(); await action('[aria-label="Resolver ensamblaje"]');
    const free = await response(before, 'preview-assembly'), freeValue = verified(free, doc, role + '-free-solve'); await recovery(doc);
    const firstOwner = plan.intent.first.component?.occurrencePath[0] ?? null;
    const secondOwner = plan.intent.second.component?.occurrencePath[0] ?? null;
    const firstQuaternion = firstOwner ? occurrence(freeValue.document, firstOwner).pose.rotation.slice() : [0, 0, 0, 1];
    const secondQuaternion = secondOwner ? occurrence(freeValue.document, secondOwner).pose.rotation.slice() : [0, 0, 0, 1];
    unitQuaternion(firstQuaternion, 'Pre-capture first-owner input'); unitQuaternion(secondQuaternion, 'Pre-capture second-owner input');
    // Capture Current Orientation consumes this already verified free pose as
    // input. Freeze it before the button; final replies never supply its oracle.
    const snapshot = Object.freeze({ previewSerial: free.serial, firstOwner, secondOwner,
      firstQuaternion: Object.freeze(firstQuaternion), secondQuaternion: Object.freeze(secondQuaternion),
      relativeQuaternion: Object.freeze(product(conjugate(firstQuaternion), secondQuaternion)) });
    rotationCaptures[role] = snapshot;
    before = await serial();
    check(before === snapshot.previewSerial, 'No native request intervenes between the verified input snapshot and Capture');
    await action('button[aria-label=' + JSON.stringify('Bloquear giro ' + plan.intent.name) + ']');
    const row = await response(before, 'lock-assembly-rotation'), captured = row.response.value.document.mates.find(m => m.id === plan.id);
    check(row.hasToken && canonical(row.current) === canonical(doc) && row.mateId === plan.id, 'Capture consumes the current verified preview for the exact saved concentric identity');
    sameQuaternion(captured?.rotationLock, snapshot.relativeQuaternion, 'Rotation lock equals the independent pre-capture Hamilton product');
    // Retain payload bytes only for declaration identity; pose/bounds oracles
    // above use the earlier immutable input snapshot instead of this reply.
    plan.intent = { ...plan.intent, rotationLock: captured.rotationLock.slice() };
    const candidate = verified(row, doc, role + '-captured-preview'); await recovery(doc); return apply(candidate, role + '-locked-applied');
  }
  async function cancel(doc, phase, expectedPositions = positions, guideX = 35) {
    const before = await serial(); await action(CANCEL); const row = await response(before, 'discard-assembly');
    check(row.response.value === null, 'Cancel discards the exact current preview capability'); await recovery(doc);
    await waitFor('combined-demo confirmed scene restored', () => page(selector => document.querySelector(selector)?.disabled === true
      && document.querySelector('.assembly-canvas-label span')?.textContent === 'Componentes independientes · mm', APPLY));
    check(!(await observe()).assemblies.some(r => r.serial > before && r.action === 'build-assembly'), 'Cancel restores its unchanged confirmed scene without claiming a fresh native build');
    geometry(committedScene, doc, phase, expectedPositions, guideX, false);
  }
  return async function run(doc, part, firstId) {
    checks.push({ partAssemblyMates: evidence });
    const sourceBytes = await fsp.readFile(output), originalInputBytes = await fsp.readFile(input), pinBytes = await fsp.readFile(partAssemblyPinInput);
    pinDocument = JSON.parse(pinBytes.toString('utf8')); partDocument = part; rootId = doc.id; baseId = firstId;
    check(doc.occurrences.length === 2 && doc.definitions.length === 1 && doc.mates.length === 0 && doc.occurrences.filter(o => o.fixed).length === 1
      && occurrence(doc, baseId).fixed && canonical(doc.definitions[0].document) === canonical(part), 'Combined continuation begins after the exact original two-use mateless save/reopen');
    guideId = doc.occurrences.find(o => o.id !== baseId).id; partDefinition = { ...occurrence(doc, baseId).definition };
    names.base = occurrence(doc, baseId).name; names.guide = occurrence(doc, guideId).name;
    check(canonical(pinDocument) === canonical(require('./desktop-assembly-basic-authoring-original.cjs')()), 'Pin input is the unchanged tracked original 3x2x4 analytical prism');
    const startSerial = await serial(), observation = await observe();
    const original = observation.assemblies.filter(r => r.action === 'build-assembly' && r.response?.ok && canonical(r.document) === canonical(doc)).at(-1);
    check(!!original, 'Previously reopened two-use assembly has an actual retained native build');
    committedScene = geometry(original.response.value, doc, 'original-two-use-reopened'); await recovery(doc);
    doc = await rename(doc, 'base', baseId, 'Base'); doc = await rename(doc, 'guide', guideId, 'Guía');
    doc = await move(doc, 'guide', guideId, [35, 0, 0]);
    const importBefore = await serial(); await action('.assembly-app button', 'Importar componente'); const imported = await response(importBefore, 'build-assembly');
    const added = imported.document.occurrences.filter(o => !doc.occurrences.some(old => old.id === o.id));
    check(added.length === 1 && !added[0].fixed && canonical(added[0].pose) === canonical({ translation: [0, 0, 0], rotation: [0, 0, 0, 1] })
      && doc.occurrences.every(old => canonical(occurrence(imported.document, old.id)) === canonical(old)), 'Native Open imports one new free identity and preserves both earlier occurrences');
    pinId = added[0].id; pinDefinition = { ...added[0].definition }; names.pin = added[0].name; positions = { ...positions, pin: [0, 0, 0] };
    geometry(imported.response.value, imported.document, 'import-original-pin'); await recovery(imported.document); doc = imported.document; committedScene = imported.response.value;
    doc = await rename(doc, 'pin', pinId, 'Pin'); doc = await move(doc, 'pin', pinId, [60, 0, 20]);
    doc = await addMate(doc, 'guide-axis', 'concentric', 'Guía al eje X raíz', { kind: 'principal-axis', id: null, value: 'X' }, { kind: 'principal-axis', id: guideId, value: 'X' });
    doc = await lock(doc, 'guide-axis');
    doc = await addMate(doc, 'guide-distance', 'distance', 'Posición X de Guía', { kind: 'principal-plane', id: null, value: 'YZ' }, { kind: 'principal-plane', id: guideId, value: 'YZ' }, -35);
    positions = { ...positions, pin: [35, 0, 20] };
    doc = await addMate(doc, 'pin-axis', 'concentric', 'Pin al eje Z de Guía', { kind: 'principal-axis', id: guideId, value: 'Z' }, { kind: 'principal-axis', id: pinId, value: 'Z' });
    doc = await lock(doc, 'pin-axis');
    doc = await addMate(doc, 'pin-distance', 'distance', 'Separación Z del Pin', { kind: 'principal-plane', id: guideId, value: 'XY' }, { kind: 'principal-plane', id: pinId, value: 'XY' }, -20);
    const baseline = doc, baselinePositions = structuredClone(positions), editedPositions = { ...positions, guide: [40, 0, 0], pin: [40, 0, 20] };
    const distancePlan = matePlans.find(p => p.role === 'guide-distance');
    await action('button[aria-label=' + JSON.stringify('Editar distancia ' + distancePlan.intent.name) + ']');
    await value(DISTANCE, -40);
    const historyBefore = await page(() => ({ recovery: localStorage.getItem('solidflow.autosave'),
      undo: document.querySelector('[aria-label="Deshacer ensamblaje"]')?.disabled, redo: document.querySelector('[aria-label="Rehacer ensamblaje"]')?.disabled }));
    let before = await serial(); await action('[aria-label="Vista previa de la distancia editada"]');
    let row = await response(before, 'preview-assembly'), candidate = verified(row, baseline, 'distance-40-preview', editedPositions, 40, true);
    await recovery(baseline); await cancel(baseline, 'distance-preview-cancel-restores-35', baselinePositions, 35);
    await waitFor('saved distance draft retains -40 after Cancel', () => page((name, before) => {
      const raw = localStorage.getItem('solidflow.autosave');
      return document.querySelector('[aria-label="Distancia firmada"]')?.value === '-40'
        && document.querySelector('[aria-label="Nombre de la relación"]')?.value === name
        && document.querySelector('[aria-label="Tipo de relación"]')?.disabled === true
        && document.querySelector('[aria-label="Vista previa de la distancia editada"]')?.disabled === false
        && document.querySelector('[aria-label="Deshacer ensamblaje"]')?.disabled === before.undo
        && document.querySelector('[aria-label="Rehacer ensamblaje"]')?.disabled === before.redo && raw === before.recovery;
    }, distancePlan.intent.name, historyBefore));
    before = await serial(); await action('[aria-label="Vista previa de la distancia editada"]'); row = await response(before, 'preview-assembly');
    const retry = verified(row, baseline, 'distance-40-retry', editedPositions, 40, true);
    check(canonical(retry.document.mates) === canonical(candidate.document.mates), 'Retry retains the exact edited mate ID, references, locks and numeric intent');
    doc = await apply(retry, 'distance-40-applied', editedPositions, 40); positions = editedPositions;
    for (const [label, wanted, wantedPositions, x] of [['Deshacer ensamblaje', baseline, baselinePositions, 35], ['Rehacer ensamblaje', doc, editedPositions, 40]]) {
      before = await serial(); await action('[aria-label=' + JSON.stringify(label) + ']'); const restored = await build(before, label, wantedPositions, x);
      check(canonical(restored) === canonical(wanted), 'One distance-edit history step restores the entire exact combined document');
    }
    await action('.assembly-quickbar button[title="Guardar"]');
    await waitFor('normal third IPC write preserves assembly file association', async () => {
      if (dialogCounts().saves !== 2 || ipc.filter(e => e.channel === 'document:save' && e.completed).length !== 3) return false;
      try { return canonical(JSON.parse(await fsp.readFile(partAssemblyOutput, 'utf8'))) === canonical(doc)
        && await page(() => document.querySelector('.assembly-app')?.getAttribute('aria-busy') === 'false'
          && !document.querySelector('.assembly-shell-document > strong')?.textContent.includes('*')); } catch { return false; }
    });
    const saved = await fsp.readFile(partAssemblyOutput); before = await serial(); await action('.assembly-quickbar button[title="Abrir"]');
    const reopened = await build(before, 'saved-three-component-reopen', editedPositions, 40);
    check(canonical(reopened) === canonical(doc), 'Fresh file reopening preserves the exact complete four-mate assembly');
    before = await serial(); await action('[aria-label="Resolver ensamblaje"]'); row = await response(before, 'preview-assembly');
    candidate = verified(row, reopened, 'fresh-reopened-rigid-solve', editedPositions, 40, true);
    check(canonical(candidate.document.mates) === canonical(doc.mates), 'Fresh rigid solve retains all exact saved declarations');
    await recovery(reopened); await cancel(reopened, 'fresh-rigid-solve-cancel', editedPositions, 40);
    check((await fsp.readFile(input)).equals(originalInputBytes) && (await fsp.readFile(output)).equals(sourceBytes)
      && (await fsp.readFile(partAssemblyPinInput)).equals(pinBytes) && (await fsp.readFile(partAssemblyOutput)).equals(saved),
    'Source fixture, saved sequential part, original pin and final assembly bytes remain unchanged by solve/Cancel');
    check(dialogCounts().opens === 5 && dialogCounts().saves === 2 && canonical(ipc.map(e => e.channel)) === canonical([
      'document:open', 'document:save', 'document:open', 'document:save', 'document:open', 'document:open', 'document:save', 'document:open',
    ]) && ipc.every(e => e.completed), 'Exactly original routes, one pin import, normal third write and final reopen; no extra file authority');
    const finalObservation = await observe();
    check(!finalObservation.workerErrors.length && finalObservation.assemblies.filter(r => r.serial > startSerial).every(r => r.response?.ok === true), 'All combined-demo native requests completed successfully');
    Object.assign(evidence, { savedSha256: digest(saved), pinInputSha256: digest(pinBytes), sourceFileSha256: digest(sourceBytes),
      identities: { root: rootId, definitions: [partDefinition, pinDefinition], baseId, guideId, pinId, bodyOwners },
      finalDocument: reopened, finalScene: { volume: committedScene.volume, area: committedScene.area, bounds: committedScene.bounds },
      independentOracles: 'Two original sequential parts1080/A912 each plus original3*2*4pin24/A52 giveV2184/A1876. Base[-11,-6,0]..[11,6,9]. RootX/GuíaXconcentric+checked identity capture and rootYZ/GuíaYZdistance-35 fixGuía[35,0,0]. Pin seed[60,0,20] remains the declared move input; after its new concentric, Z and roll are free observations until constrained. The verified pose immediately before Capture supplies immutable qFirst/qSecond; handHamilton conj(qFirst)*qSecond predicts the lock. GuíaZ/PinZconcentric+that capture and GuíaXY/PinXYdistance-20 fixPin[35,0,20] with orientation checkedGuíaPreCaptureInput*capturedInputRelativeQ. Pin bounds use its eight literal corners and this earlier input quaternion, never its final native quaternion. Editing only-35→-40 givesGuía[40,0,0],Pin[40,0,20],union[-11,-6,0]..[51,6,24]. Areas are current native assembly results, not triangle estimates. Three-component component sums are not a fused material union.' });
    await navigation.panel('components');
    return { document: reopened, scene: committedScene, savedSha256: evidence.savedSha256, pinInputSha256: evidence.pinInputSha256, phases };
  };
};
