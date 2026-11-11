'use strict';
const fs = require('node:fs/promises');
const { withNavigation } = require('./desktop-assembly-navigation.cjs');
const { encodeJavaScriptString } = require('./desktop-ui-source.cjs');

const PRISMS = [
  { id: 'a', halfWidth: 4, height: 3, area: 96, normals: [[-.6, .8, 0], [.6, .8, 0]], pairDot: .28 },
  { id: 'b', halfWidth: 3, height: 4, area: 88, normals: [[-.8, .6, 0], [.8, .6, 0]], pairDot: -.28 },
];
const NAME = 'Anchura entre caras inclinadas';
const ROLES = ['Anchura · plano 1', 'Anchura · plano 2', 'Pestaña · plano 1', 'Pestaña · plano 2'];
const selectByLabel = label => 'select[aria-label="' + label + '"]';
const APPLY = 'button[aria-label="Aplicar ensamblaje"]';
const CANCEL = 'button[aria-label="Cancelar vista previa del ensamblaje"]';
const SUMMARY = '[aria-label="Anchura centrada verificada"]';
const dot = (a, b) => a.reduce((sum, value, axis) => sum + value * b[axis], 0);
const cross = ([a, b, c], [x, y, z]) => [b*z-c*y, c*x-a*z, a*y-b*x];
const minus = (a, b) => a.map((value, axis) => value - b[axis]);
function rotate([x, y, z, w], point) {
  const vector = [x, y, z], a = cross(vector, point), b = cross(vector, a);
  const scale = 2 / (x*x + y*y + z*z + w*w);
  return point.map((value, axis) => value + scale * (w * a[axis] + b[axis]));
}
const position = (pose, point) => rotate(pose.rotation, point).map((value, axis) => value + pose.translation[axis]);
const reference = face => ({ kind: 'face', ...face.selection, support: 'plane' });
function optionKey({ selection: { component, body, face } }) {
  return JSON.stringify([JSON.stringify([component.occurrencePath, component.definition.id, component.definition.revision]),
    [body.bodyId, body.sourceFeatureId], face.sourceFeatureId, face.key]);
}

module.exports = function intersectingWidthWorkflow(context) {
  const { assemblyNavigation, expected, input, output, evaluate, observe, waitFor, click, checks,
    protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest, initialReadyMs, dialogCounts } = withNavigation(context);
  const page = (fn, ...args) => evaluate('(' + fn.toString() + ')(' + args.map(value =>
    'JSON.parse(' + encodeJavaScriptString(JSON.stringify(value)) + ')').join(',') + ')');
  const same = (actual, wanted, label) => check(canonical(actual) === canonical(wanted), label);
  const near = (actual, wanted, tolerance, label) => check(Number.isFinite(actual) && Math.abs(actual - wanted) <= tolerance,
    label + ' (observed ' + actual + ', expected ' + wanted + ')');
  const evidence = { scenario: 'original-intersecting-triangular-centered-width', phases: [] };
  checks.push(evidence);

  async function button(label, scope) {
    await assemblyNavigation.button(label, scope);
    await page((label, scope) => {
      const buttons = [...document.querySelectorAll(scope + ' button')].filter(element => element.textContent.trim() === label);
      if (buttons.length !== 1 || buttons[0].disabled) throw Error('Enabled button required: ' + label);
      buttons[0].click();
    }, label, scope);
  }
  async function select(label, value) {
    const selector = selectByLabel(label);
    await assemblyNavigation.reveal(selector);
    await page((selector, value) => {
      const field = document.querySelector(selector);
      if (!(field instanceof HTMLSelectElement) || field.disabled ||
          [...field.options].filter(option => option.value === value && !option.disabled).length !== 1) {
        throw Error('Unique enabled select option required: ' + selector);
      }
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(field, value);
      field.dispatchEvent(new Event('change', { bubbles: true }));
    }, selector, value);
    await waitFor('rendered choice: ' + label, () => page((selector, value) =>
      document.querySelector(selector)?.value === value, selector, value));
  }
  async function worker(action, trigger) {
    const { serial } = await observe();
    await trigger();
    return waitFor('actual worker ' + action, async () => {
      const state = await observe();
      check(state.workerErrors.length === 0, 'No actual worker errors');
      const found = state.assemblies.filter(event => event.serial > serial && event.action === action && event.response);
      if (!found.length) return false;
      check(found.length === 1 && found[0].response.ok, 'Unique successful ' + action + ': ' + found[0].response.error);
      return found[0];
    });
  }
  const recovery = (document, label) => waitFor(label + ' committed recovery', async () => {
    const state = await page(() => ({
      idle: document.querySelector('.assembly-app')?.getAttribute('aria-busy') === 'false',
      recovery: localStorage.getItem('solidflow.autosave'),
    }));
    return state.idle && canonical(JSON.parse(state.recovery)) === canonical(document);
  });

  function inspect(scene, document, solved, label, expectedRefs) {
    same(document.definitions, expected.definitions, label + ' preserves both original part recipes');
    same(document.occurrences[0], expected.occurrences[0], label + ' preserves fixed width owner');
    const moving = document.occurrences[1];
    same({ ...moving, pose: expected.occurrences[1].pose }, expected.occurrences[1], label + ' preserves tab occurrence identity');
    check(scene.solidCount === 2 && scene.prototypeCount === 2 && scene.bodies.length === 2 && !scene.warnings.length,
      label + ' builds two original solids without scene warnings');
    near(scene.volume, 96, 1e-5, label + ' total volume');
    near(scene.area, 184, 1e-5, label + ' total area');
    const faces = [], planes = [];
    for (const [index, prism] of PRISMS.entries()) {
      const occurrence = document.occurrences[index];
      const bodies = scene.bodies.filter(body => canonical(body.component.occurrencePath) === canonical([prism.id]));
      check(bodies.length === 1, label + ' exact owner ' + prism.id);
      const [body] = bodies;
      same(body.component.definition, occurrence.definition, label + ' original source revision');
      same(body.body, { bodyId: 'box', sourceFeatureId: 'solid' }, label + ' original body');
      same(body.worldPose, occurrence.pose, label + ' scene pose matches document');
      check(body.solidCount === 1 && body.faces.length === 5 && body.faces.every(face => face.triangleCount > 0),
        label + ' one tessellated solid with five faces per prism');
      near(body.volume, 48, 1e-5, label + ' prism volume');
      near(body.area, prism.area, 1e-5, label + ' prism area');
      const corners = [[-prism.halfWidth, 0], [prism.halfWidth, 0], [0, prism.height]]
        .flatMap(([x, y]) => [0, 4].map(z => position(occurrence.pose, [x, y, z])));
      for (let axis = 0; axis < 3; axis++) {
        near(body.bounds.min[axis], Math.min(...corners.map(corner => corner[axis])), 1e-6, label + ' lower bound');
        near(body.bounds.max[axis], Math.max(...corners.map(corner => corner[axis])), 1e-6, label + ' upper bound');
      }
      const pair = prism.normals.map((localNormal, side) => {
        const matching = body.faces.filter(face => face.support?.kind === 'plane' && dot(face.support.normal, localNormal) > .999999);
        check(matching.length === 1, label + ' exact inclined material face ' + prism.id + '/' + side);
        const [face] = matching, support = face.worldSupport;
        check(support?.kind === 'plane', label + ' current native world plane');
        faces.push(face);
        const wantedNormal = rotate(occurrence.pose.rotation, localNormal);
        near(Math.hypot(...minus(support.normal, wantedNormal)), 0, 1e-10, label + ' measured normal');
        const offset = dot(support.normal, support.point);
        near(offset, dot(wantedNormal, position(occurrence.pose, [0, prism.height, 0])), 1e-6, label + ' measured plane offset');
        return { normal: support.normal, offset };
      });
      near(dot(pair[0].normal, pair[1].normal), prism.pairDot, 1e-10, label + ' nonparallel pair dot product');
      const difference = minus(pair[0].normal, pair[1].normal), length = Math.hypot(...difference);
      planes.push({ normal: difference.map(value => value / length), offset: (pair[0].offset - pair[1].offset) / length, length });
    }
    const [width, tab] = planes;
    const angle = Math.atan2(Math.hypot(...cross(width.normal, tab.normal)), dot(width.normal, tab.normal));
    const offset = tab.offset - width.offset;
    near(angle, solved ? 0 : .27, 1e-8, label + ' measured bisector angle');
    near(offset, solved ? 0 : -3 * Math.cos(.27), 1e-6, label + ' measured signed bisector offset');
    const refs = faces.map(reference);
    if (expectedRefs) same(refs, expectedRefs, label + ' rebuilt the same ordered material faces');
    return { faces, refs, angle, offset, planes };
  }
  function intent(document, refs, id) {
    const [mate] = document.mates;
    check(document.mates.length === 1 && mate.id && (!id || mate.id === id) && mate.type === 'width' &&
      mate.mode === 'centered' && mate.widthBranch === 'difference' && mate.tabBranch === 'difference' &&
      mate.alignment === 'aligned' && mate.name === NAME && mate.suppressed === false, 'Exact ordered Centered Width intent');
    same(mate.width, refs.slice(0, 2), 'Exact width owner and faces in role order');
    same(mate.tab, refs.slice(2), 'Exact tab owner and faces in role order');
    return mate.id;
  }
  async function preview(trigger, base, refs, label, id) {
    const event = await worker('preview-assembly', trigger), value = event.response.value;
    same(event.current, base, label + ' uses exact committed document');
    check(value.status === 'ready' && value.hasToken && value.checks.length === 1 && value.checks[0].satisfied,
      label + ' actual ready native preview with Apply capability');
    const mateId = intent(event.proposed, refs, id);
    intent(value.document, refs, mateId);
    const actual = inspect(value.scene, value.document, true, label, refs);
    const [report] = value.widthCentered;
    check(value.widthCentered.length === 1 && report.mateId === mateId && report.supportOnly &&
      report.widthBranch === 'difference' && report.tabBranch === 'difference' && report.alignment === 'aligned', label + ' fresh support report');
    near(report.branchLengths.width, 1.2, 1e-10, label + ' width normal-difference length');
    near(report.branchLengths.tab, 1.6, 1e-10, label + ' tab normal-difference length');
    near(report.angleRadians, actual.angle, 1e-8, label + ' reported/measured angle');
    near(report.offsetMm, 0, 1e-6, label + ' reported zero offset');
    near(Math.abs(report.offsetMm), Math.abs(actual.offset), 1e-6, label + ' reported/measured offset');
    await recovery(base, label + ' leaves the preview unapplied');
    await waitFor(label + ' summary and Apply visible', () => page((summary, apply, name) =>
      document.querySelector(summary)?.textContent.includes(name) && document.querySelector(apply)?.disabled === false, SUMMARY, APPLY, NAME));
    evidence.phases.push({ label, serial: event.serial, report, angle: actual.angle, offset: actual.offset, planes: actual.planes });
    return { mateId, occurrences: value.document.occurrences };
  }
  async function cancel(base, label) {
    const event = await worker('discard-assembly', () => click(CANCEL));
    check(event.hasToken, label + ' revokes the actual preview capability');
    await recovery(base, label);
    check(await page((apply, summary) => document.querySelector(apply)?.disabled === true && !document.querySelector(summary),
      APPLY, SUMMARY), label + ' clears summary and Apply');
  }

  return async () => {
    const originalBytes = await fs.readFile(input);
    check(expected.id === 'native-width-intersecting-original' && !expected.mates.length && expected.occurrences.length === 2,
      'Shared original two-prism input with no preauthored mate');
    await waitFor('initial production readiness', () => page(() =>
      document.querySelector('.statusbar')?.textContent.includes('Listo') && typeof window.solidflow?.openDocument === 'function'), initialReadyMs);
    let event = await worker('build-assembly', async () => {
      await click('button[aria-label="Abrir (Ctrl+O)"]');
      const dialog = '[role="dialog"][aria-labelledby="discard-title"]';
      await waitFor('initial discard confirmation', () => page(dialog => !!document.querySelector(dialog), dialog));
      await button('Continuar sin guardar', dialog);
    });
    same(event.document, expected, 'Opened exact original input');
    await recovery(expected, 'original input');
    const original = inspect(event.response.value, expected, false, 'before Width');
    const { refs } = original, keys = original.faces.map(optionKey);
    check(new Set(keys).size === 4, 'Four unique ordered material faces');
    const beforeForm = await observe();
    await select('Tipo de relación', 'width');
    for (const [index, role] of ROLES.entries()) await select(role, keys[index]);
    const name = 'input[aria-label="Nombre de anchura"]';
    await assemblyNavigation.reveal(name);
    await page((selector, value) => {
      const input = document.querySelector(selector);
      if (!(input instanceof HTMLInputElement) || input.disabled) throw Error('Enabled width name required');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, name, NAME);
    await select('Bisectriz de anchura', 'difference');
    await select('Bisectriz de pestaña', 'difference');
    await select('Orientación de bisectrices', 'aligned');
    same(await page(roles => roles.map(role => document.querySelector('select[aria-label="' + role + '"]')?.value), ROLES),
      keys, 'All four chosen role values remain in the rendered draft');
    check((await observe()).serial === beforeForm.serial, 'Selecting roles and branches did not perform native work');
    await recovery(expected, 'draft role selection');
    const authorPreview = () => button('Vista previa de anchura centrada', '.assembly-width-panel');
    await preview(authorPreview, expected, refs, 'first preview');
    await cancel(expected, 'first Cancel');
    const pending = await preview(authorPreview, expected, refs, 'second preview');
    event = await worker('apply-assembly', () => click(APPLY));
    const applied = event.response.value;
    same(event.current, expected, 'Apply uses the exact pre-preview document');
    check(event.hasToken && applied.kind === 'assembly-applied', 'Actual capability-backed Apply');
    const accepted = applied.document;
    intent(accepted, refs, pending.mateId);
    same(accepted.occurrences, pending.occurrences, 'Apply uses exactly the previewed poses');
    inspect(applied.scene, accepted, true, 'applied Width', refs);
    await recovery(accepted, 'applied Width');
    for (const [label, document, solved] of [['Deshacer', expected, false], ['Rehacer', accepted, true]]) {
      event = await worker('build-assembly', () => click('button[aria-label="' + label + ' ensamblaje"]'));
      same(event.document, document, label + ' restores the exact document in one step');
      inspect(event.response.value, event.document, solved, label, refs);
      await recovery(document, label);
    }
    const toolbar = ':is(.assembly-toolbar, .assembly-quickbar)';
    await button('Guardar como', toolbar);
    await waitFor('completed Save As and exact persisted document', async () =>
      dialogCounts().saves === 1 && ipc.some(event => event.channel === 'document:save' && event.completed) &&
      canonical(JSON.parse(await fs.readFile(output, 'utf8'))) === canonical(accepted));
    const savedBytes = await fs.readFile(output);
    event = await worker('build-assembly', () => button('Abrir', toolbar));
    same(event.document, accepted, 'Reopened exact persisted Width document');
    intent(event.document, refs, pending.mateId);
    inspect(event.response.value, event.document, true, 'reopened Width', refs);
    await recovery(accepted, 'reopened Width');
    await click('button[aria-label="Editar anchura ' + NAME + '"]');
    same(await page(roles => roles.map(role => {
      const field = document.querySelector('select[aria-label="' + role + '"]');
      return field && !field.disabled && !field.closest('[hidden]') && !field.selectedOptions[0]?.disabled ? field.value : null;
    }), ROLES),
      keys, 'Saved four ordered roles resolve to current enabled choices');
    await preview(() => click('button[aria-label="Resolver ensamblaje"]'), accepted, refs, 'fresh Solve', pending.mateId);
    await cancel(accepted, 'reopened Solve Cancel');
    same(dialogCounts(), { opens: 2, saves: 1 }, 'Exact test-owned file dialog count');
    check((await fs.readFile(input)).equals(originalBytes) && (await fs.readFile(output)).equals(savedBytes),
      'Input and output bytes unchanged after reopen and Cancel');
    check(!consoleErrors.length && !failedRequests.length && protocolResponses.every(event => event.status >= 200 && event.status < 400),
      'Healthy production renderer and asset requests');
    Object.assign(evidence, { originalSha256: digest(originalBytes), savedSha256: digest(savedBytes), refs,
      originalBisectors: { angle: original.angle, offset: original.offset }, mateId: pending.mateId,
      limits: 'Two original triangular prisms, four exact scripted dropdown choices, difference/difference/aligned, one fixed owner. Actual worker and file IPC. No viewport picking, finite contact, packaged UI, or platform breadth.' });
  };
};
