'use strict';
// Shared production-loader pattern regressions with statically selected workflows.
// Launches its own hidden test child; never attaches to an existing app/session.
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');
const { randomUUID, createHash } = require('node:crypto');
const { spawn } = require('node:child_process');
const { encodeJavaScriptString } = require('./desktop-ui-source.cjs');
const { emitDesktopCiFailure, markDesktopCiFailureReported } = require('./desktop-ci-diagnostics.cjs');
const SCENARIOS = Object.freeze({
  'assembly-configured-picking': Object.freeze({ originalRecipe: 'desktop-assembly-configured-picking-original.cjs', entry: 'desktop-assembly-configured-picking.cjs',
    test: 'production-renderer-configured-picking', caption: 'configured component and material reference picking' }),
  'assembly-configured-components': Object.freeze({ originalRecipe: 'desktop-assembly-configured-components-original.cjs', entry: 'desktop-assembly-configured-components.cjs',
    test: 'production-renderer-configured-components', caption: 'configured component insertion, reuse and fixing' }),
  'assembly-origin-axes': Object.freeze({ originAxes: 'standard', originalRecipe: 'desktop-assembly-origin-axes-original.cjs', entry: 'desktop-assembly-origin-axes.cjs',
    test: 'production-renderer-origin-axes', caption: 'origin axis relations' }),
  'assembly-configured-origin-axes': Object.freeze({ originAxes: 'configured', originalRecipe: 'desktop-assembly-origin-axes-original.cjs', entry: 'desktop-assembly-configured-origin-axes.cjs',
    test: 'production-renderer-configured-origin-axes', caption: 'configured origin axis relations' }),
  'part-fresh-sketch': Object.freeze({ originalRecipe: 'desktop-part-fresh-sketch-original.cjs', entry: 'desktop-part-fresh-sketch.cjs',
    test: 'production-renderer-part-fresh-sketch', caption: 'actual pointer face sketches and automatic body destinations' }),
  'part-sequence': Object.freeze({ fixture: 'part-sequence-original.json', entry: 'desktop-part-sequence.cjs',
    test: 'production-renderer-part-sequence', caption: 'successive cuts and additive bosses' }),
  all: Object.freeze({ fixture: 'pattern-all-original.json', entry: 'desktop-pattern-all.cjs',
    test: 'production-renderer-selected-to-ALL', caption: 'ALL' }),
  'assembly-configurations': Object.freeze({ originalRecipe: 'desktop-assembly-configurations-original.cjs', entry: 'desktop-assembly-configurations.cjs',
    test: 'production-renderer-assembly-configurations', caption: 'saved configured assembly states' }),
  'assembly-configured-relations': Object.freeze({ originalRecipe: 'desktop-assembly-configurations-original.cjs', entry: 'desktop-assembly-configured-relations.cjs',
    test: 'production-renderer-assembly-configured-relations', caption: 'configured relation authoring' }),
  'assembly-configured-profile-center': Object.freeze({ compoundFamily: 'profile-center', profileKind: 'rectangle', originalRecipe: 'desktop-assembly-configured-compound-original.cjs', entry: 'desktop-assembly-configured-profile-center.cjs', test: 'production-renderer-configured-profile-center', caption: 'configured rectangle profile centers' }),
  'assembly-configured-profile-circle': Object.freeze({ compoundFamily: 'profile-center', profileKind: 'circle', originalRecipe: 'desktop-assembly-configured-compound-original.cjs', entry: 'desktop-assembly-configured-profile-circle.cjs', test: 'production-renderer-configured-profile-circle', caption: 'configured free circle profile centers' }),
  'assembly-configured-line-path': Object.freeze({ compoundFamily: 'line-path', originalRecipe: 'desktop-assembly-configured-compound-original.cjs', entry: 'desktop-assembly-configured-line-path.cjs', test: 'production-renderer-configured-line-path', caption: 'configured material LINE path' }),
  'assembly-configured-circular-path': Object.freeze({ compoundFamily: 'circular-path', originalRecipe: 'desktop-assembly-configured-compound-original.cjs', entry: 'desktop-assembly-configured-circular-path.cjs', test: 'production-renderer-configured-circular-path', caption: 'configured material circular path' }),
  'assembly-configured-lock': Object.freeze({ mechanicalFamily: 'lock', originalRecipe: 'desktop-assembly-configured-mechanical-original.cjs', entry: 'desktop-assembly-configured-lock.cjs', test: 'production-renderer-configured-lock', caption: 'configured native lock' }),
  'assembly-configured-concentric': Object.freeze({ mechanicalFamily: 'concentric', originalRecipe: 'desktop-assembly-configured-mechanical-original.cjs', entry: 'desktop-assembly-configured-concentric.cjs', test: 'production-renderer-configured-concentric', caption: 'configured native concentric rotation lock' }),
  'assembly-configured-gear': Object.freeze({ mechanicalFamily: 'gear', originalRecipe: 'desktop-assembly-configured-mechanical-original.cjs', entry: 'desktop-assembly-configured-gear.cjs', test: 'production-renderer-configured-gear', caption: 'configured native gear' }),
  'assembly-configured-screw': Object.freeze({ mechanicalFamily: 'screw', originalRecipe: 'desktop-assembly-configured-mechanical-original.cjs', entry: 'desktop-assembly-configured-screw.cjs', test: 'production-renderer-configured-screw', caption: 'configured native screw' }),
  'assembly-configured-rack-pinion': Object.freeze({ mechanicalFamily: 'rack-pinion', originalRecipe: 'desktop-assembly-configured-mechanical-original.cjs', entry: 'desktop-assembly-configured-rack-pinion.cjs', test: 'production-renderer-configured-rack-pinion', caption: 'configured native rack-pinion' }),
  'imported-bodies': Object.freeze({ originalRecipe: 'desktop-imported-bodies-flow.cjs', entry: 'desktop-imported-bodies.cjs',
    test: 'production-renderer-imported-bodies', caption: 'autonomous imported STEP bodies' }),
  'assembly-step': Object.freeze({ originalRecipe: 'desktop-assembly-step-flow.cjs', entry: 'desktop-assembly-step.cjs',
    test: 'production-renderer-assembly-structural-step', caption: 'structural STEP editor interchange' }),
  'assembly-step-insertion': Object.freeze({ originalRecipe: 'desktop-assembly-step-insertion-flow.cjs', entry: 'desktop-assembly-step-insertion.cjs',
    test: 'production-renderer-assembly-structural-step-insertion', caption: 'structural STEP component insertion' }),
  'world-limit': Object.freeze({ fixture: 'pattern-world-limit-original.json', entry: 'desktop-pattern-world-limit.cjs',
    test: 'production-renderer-fixed-world-limit', caption: 'fixed world-limit' }),
  'until-next': Object.freeze({ fixture: 'pattern-until-next-cut-original.json', entry: 'desktop-pattern-until-next.cjs',
    test: 'production-renderer-until-next', caption: 'UntilNext',
    additionalFixtures: Object.freeze({ add: 'pattern-until-next-add-original.json', reject: 'pattern-until-next-partial-original.json' }) }),
  assembly: Object.freeze({ fixture: 'assembly-original.json', entry: 'desktop-assembly.cjs',
    test: 'production-renderer-assembly', caption: 'assembly',
    additionalFixtures: Object.freeze({ partUpdate: 'assembly-updated-pin-original.json', interference: 'assembly-interference-original.json', translation: 'assembly-translation-original.json', bom: 'assembly-bom-original.json' }) }),
  'assembly-import': Object.freeze({ fixture: 'assembly-import-parent-original.json', entry: 'desktop-assembly-import.cjs',
    test: 'production-renderer-assembly-import', caption: 'assembly document import',
    additionalFixtures: Object.freeze({ subassembly: 'assembly-import-subassembly-original.json' }) }),
  'assembly-source-revision': Object.freeze({ originalRecipe: 'desktop-assembly-linked-source-original.cjs', entry: 'desktop-assembly-source-revision.cjs',
    test: 'production-renderer-assembly-source-revision', caption: 'assembly source revision authoring and linked review' }),
  'assembly-linked-source': Object.freeze({ originalRecipe: 'desktop-assembly-linked-source-original.cjs', entry: 'desktop-assembly-linked-source.cjs',
    test: 'production-renderer-assembly-linked-source', caption: 'assembly read-only linked source grants and atomic review' }),
  'assembly-source-update': Object.freeze({ fixture: 'assembly-source-update-original.json', entry: 'desktop-assembly-source-update.cjs',
    test: 'production-renderer-assembly-source-update', caption: 'assembly source revision and descendant repair',
    additionalFixtures: Object.freeze({ incoming: 'assembly-source-update-incoming-original.json' }) }),
  'assembly-source-update-save-pending': Object.freeze({ fixture: 'assembly-source-update-original.json', entry: 'desktop-assembly-source-update-save-pending.cjs',
    test: 'production-renderer-assembly-source-update-save-pending', caption: 'source update after withheld native Save completion',
    additionalFixtures: Object.freeze({ incoming: 'assembly-source-update-incoming-original.json' }) }),
  'assembly-interference-grouping-scope': Object.freeze({ fixture: 'assembly-interference-grouping-scope-original.json', entry: 'desktop-assembly-interference-grouping-scope.cjs',
    test: 'production-renderer-assembly-interference-grouping-scope', caption: 'assembly grouped selection and exclusions' }),
  'assembly-interference-grouping-multibody': Object.freeze({ fixture: 'assembly-interference-grouping-multibody-original.json', entry: 'desktop-assembly-interference-grouping-multibody.cjs',
    test: 'production-renderer-assembly-interference-grouping-multibody', caption: 'assembly grouping with internal bodies' }),
  'assembly-interference-grouping': Object.freeze({ fixture: 'assembly-interference-grouping-original.json', entry: 'desktop-assembly-interference-grouping.cjs',
    test: 'production-renderer-assembly-interference-grouping', caption: 'assembly root-subassembly grouping' }),
  'assembly-interference-multibody': Object.freeze({ fixture: 'assembly-interference-multibody-original.json', entry: 'desktop-assembly-interference-multibody.cjs',
    test: 'production-renderer-assembly-interference-multibody', caption: 'assembly within-component interference' }),
  'assembly-screw': Object.freeze({ fixture: 'assembly-screw-original.json', entry: 'desktop-assembly-screw.cjs',
    test: 'production-renderer-assembly-screw', caption: 'assembly screw' }),
  'assembly-rack-pinion': Object.freeze({ fixture: 'assembly-rack-pinion-original.json', entry: 'desktop-assembly-rack-pinion.cjs',
    test: 'production-renderer-assembly-rack-pinion', caption: 'assembly rack and pinion' }),
  'assembly-export': Object.freeze({ fixture: 'assembly-flat-export-original.json', entry: 'desktop-assembly-export.cjs',
    test: 'production-renderer-assembly-flat-export', caption: 'assembly flat export' }),
  'assembly-direction': Object.freeze({ fixture: 'assembly-direction-mates-original.json', entry: 'desktop-assembly-direction.cjs',
    test: 'production-renderer-assembly-direction', caption: 'assembly parallel and perpendicular' }),
  'assembly-angle-measurement': Object.freeze({ fixture: 'assembly-direction-mates-original.json', entry: 'desktop-assembly-angle-measurement.cjs',
    test: 'production-renderer-assembly-angle-measurement', caption: 'assembly directed angle measurement' }),
  'assembly-directed-angle': Object.freeze({ fixture: 'assembly-direction-mates-original.json', entry: 'desktop-assembly-directed-angle.cjs',
    test: 'production-renderer-assembly-directed-angle', caption: 'assembly directed circular angle stops' }),
  'assembly-tangent': Object.freeze({ fixture: 'assembly-tangent-plane-cylinder-original.json', entry: 'desktop-assembly-tangent.cjs',
    test: 'production-renderer-assembly-tangent', caption: 'assembly plane and cylinder tangency' }),
  'assembly-cylinder-tangent': Object.freeze({ fixture: 'assembly-cylinder-tangent-skew-original.json', entry: 'desktop-assembly-cylinder-tangent.cjs',
    test: 'production-renderer-assembly-cylinder-tangent', caption: 'assembly cylinder support tangency',
    additionalFixtures: Object.freeze({ parallel: 'assembly-cylinder-tangent-parallel-original.json' }) }),
  'assembly-sphere-tangent': Object.freeze({ fixture: 'assembly-plane-sphere-tangent-original.json', entry: 'desktop-assembly-sphere-tangent.cjs',
    test: 'production-renderer-assembly-sphere-tangent', caption: 'assembly spherical support tangency',
    additionalFixtures: Object.freeze({ sphereSphere: 'assembly-sphere-sphere-tangent-original.json', cylinderSphere: 'assembly-cylinder-sphere-tangent-original.json' }) }),
  'assembly-limit-distance': Object.freeze({ fixture: 'assembly-limit-distance-original.json', entry: 'desktop-assembly-limit-distance.cjs',
    test: 'production-renderer-assembly-limit-distance', caption: 'assembly signed plane distance interval' }),
  'assembly-limit-distance-compact': Object.freeze({ fixture: 'assembly-limit-distance-original.json', entry: 'desktop-assembly-limit-distance-compact.cjs',
    test: 'production-renderer-assembly-limit-distance-compact', caption: 'assembly signed plane distance interval at fixed compact size' }),
  'assembly-hinge': Object.freeze({ fixture: 'assembly-hinge-original.json', entry: 'desktop-assembly-hinge.cjs',
    test: 'production-renderer-assembly-hinge', caption: 'assembly unlimited four-role hinge lifecycle' }),
  'assembly-hinge-limits': Object.freeze({ fixture: 'assembly-hinge-original.json', entry: 'desktop-assembly-hinge-limits.cjs',
    test: 'production-renderer-assembly-hinge-limits', caption: 'assembly six-role hinge angular stops lifecycle' }),
  'assembly-hinge-limits-picking': Object.freeze({ fixture: 'assembly-hinge-picking-original.json', entry: 'desktop-assembly-hinge-limits-picking.cjs',
    test: 'production-renderer-assembly-hinge-limits-picking', caption: 'assembly six-role hinge selection and stop pointer projection' }),
  'assembly-hinge-limits-repair': Object.freeze({ fixture: 'assembly-hinge-original.json', entry: 'desktop-assembly-hinge-limits-repair.cjs',
    test: 'production-renderer-assembly-hinge-limits-repair', caption: 'assembly six-role hinge stops source and replacement repair',
    additionalFixtures: Object.freeze({ updatedPart: 'assembly-hinge-updated-part-original.json', replacementPart: 'assembly-hinge-replacement-part-original.json' }) }),
  'assembly-hinge-picking': Object.freeze({ fixture: 'assembly-hinge-picking-original.json', entry: 'desktop-assembly-hinge-picking.cjs',
    test: 'production-renderer-assembly-hinge-picking', caption: 'assembly hinge viewport selection' }),
  'assembly-hinge-repair': Object.freeze({ fixture: 'assembly-hinge-original.json', entry: 'desktop-assembly-hinge-repair.cjs',
    test: 'production-renderer-assembly-hinge-repair', caption: 'assembly hinge four-role source and replacement repair',
    additionalFixtures: Object.freeze({ updatedPart: 'assembly-hinge-updated-part-original.json', replacementPart: 'assembly-hinge-replacement-part-original.json' }) }),
  'assembly-circular-path': Object.freeze({ fixture: 'assembly-material-arc-original.json', entry: 'desktop-assembly-circular-path.cjs',
    test: 'production-renderer-assembly-circular-path', caption: 'assembly explicit material circular path lifecycle' }),
  'assembly-line-path': Object.freeze({ fixture: 'assembly-line-path-up-original.json', entry: 'desktop-assembly-line-path.cjs',
    test: 'production-renderer-assembly-line-path', caption: 'assembly explicit material LINE path lifecycle' }),
  'assembly-profile-center': Object.freeze({ fixture: 'assembly-profile-center-original.json', entry: 'desktop-assembly-profile-center.cjs',
    test: 'production-renderer-assembly-profile-center', caption: 'assembly bounded profile-center lifecycle' }),
  'assembly-width': Object.freeze({ fixture: 'assembly-width-original.json', entry: 'desktop-assembly-width.cjs',
    test: 'production-renderer-assembly-width', caption: 'assembly centered width four planes' }),
  'assembly-symmetry': Object.freeze({ fixture: 'assembly-symmetry-original.json', entry: 'desktop-assembly-symmetry.cjs',
    test: 'production-renderer-assembly-symmetry', caption: 'assembly symmetry five native purposes' }),
  'assembly-symmetry-line-repair': Object.freeze({ fixture: 'assembly-symmetry-line-repair-original.json', entry: 'desktop-assembly-symmetry-line-repair.cjs',
    test: 'production-renderer-assembly-symmetry-line-repair', caption: 'assembly symmetry line source and replacement repair',
    additionalFixtures: Object.freeze({ updatedPart: 'assembly-symmetry-line-repair-updated-part-original.json', replacementPart: 'assembly-symmetry-line-repair-replacement-part-original.json' }) }),
  'assembly-symmetry-plane-repair': Object.freeze({ fixture: 'assembly-symmetry-plane-repair-original.json', entry: 'desktop-assembly-symmetry-plane-repair.cjs',
    test: 'production-renderer-assembly-symmetry-plane-repair', caption: 'assembly symmetry plane source and replacement repair',
    additionalFixtures: Object.freeze({ updatedPart: 'assembly-symmetry-plane-repair-updated-part-original.json', replacementPart: 'assembly-symmetry-plane-repair-replacement-part-original.json' }) }),
  'assembly-symmetry-sphere-repair': Object.freeze({ fixture: 'assembly-symmetry-sphere-repair-original.json', entry: 'desktop-assembly-symmetry-sphere-repair.cjs',
    test: 'production-renderer-assembly-symmetry-sphere-repair', caption: 'assembly symmetry sphere source and replacement repair',
    additionalFixtures: Object.freeze({ updatedPart: 'assembly-symmetry-sphere-repair-updated-part-original.json', replacementPart: 'assembly-symmetry-sphere-repair-replacement-part-original.json' }) }),
  'assembly-symmetry-cylinder-repair': Object.freeze({ fixture: 'assembly-symmetry-cylinder-repair-original.json', entry: 'desktop-assembly-symmetry-cylinder-repair.cjs',
    test: 'production-renderer-assembly-symmetry-cylinder-repair', caption: 'assembly symmetry cylinder source and replacement repair',
    additionalFixtures: Object.freeze({ updatedPart: 'assembly-symmetry-cylinder-repair-updated-part-original.json', replacementPart: 'assembly-symmetry-cylinder-repair-replacement-part-original.json' }) }),
  'assembly-symmetry-axisline-repair': Object.freeze({ fixture: 'assembly-symmetry-axisline-repair-original.json', entry: 'desktop-assembly-symmetry-axisline-repair.cjs',
    test: 'production-renderer-assembly-symmetry-axisline-repair', caption: 'assembly symmetry axisline source and replacement repair',
    additionalFixtures: Object.freeze({ updatedPart: 'assembly-symmetry-axisline-repair-updated-part-original.json', replacementPart: 'assembly-symmetry-axisline-repair-replacement-part-original.json' }) }),
  'assembly-symmetry-repair': Object.freeze({ fixture: 'assembly-symmetry-repair-original.json', entry: 'desktop-assembly-symmetry-repair.cjs',
    test: 'production-renderer-assembly-symmetry-repair', caption: 'assembly material vertex symmetry repair',
    additionalFixtures: Object.freeze({ updatedPart: 'assembly-symmetry-repair-updated-part-original.json', replacementPart: 'assembly-symmetry-repair-replacement-part-original.json' }) }),
  'assembly-symmetry-picking': Object.freeze({ fixture: 'assembly-symmetry-picking-original.json', entry: 'desktop-assembly-symmetry-picking.cjs',
    test: 'production-renderer-assembly-symmetry-picking', caption: 'assembly symmetry viewport selection' }),
  'assembly-symmetry-nested-selected': Object.freeze({ fixture: 'assembly-symmetry-nested-repair-original.json', entry: 'desktop-assembly-symmetry-nested-selected.cjs',
    test: 'production-renderer-assembly-symmetry-nested-selected', caption: 'assembly nested point symmetry selected replacement',
    additionalFixtures: Object.freeze({ replacementPart: 'assembly-symmetry-nested-repair-replacement-part-original.json' }) }),
  'assembly-symmetry-nested-source': Object.freeze({ fixture: 'assembly-symmetry-nested-repair-original.json', entry: 'desktop-assembly-symmetry-nested-source.cjs',
    test: 'production-renderer-assembly-symmetry-nested-source', caption: 'assembly nested point symmetry shared source update',
    additionalFixtures: Object.freeze({ updatedPart: 'assembly-symmetry-nested-repair-updated-part-original.json' }) }),
  'assembly-limit-angle': Object.freeze({ fixture: 'assembly-limit-angle-original.json', entry: 'desktop-assembly-limit-angle.cjs',
    test: 'production-renderer-assembly-limit-angle', caption: 'assembly principal direction-angle interval' }),
  'assembly-replacement': Object.freeze({ fixture: 'assembly-original.json', entry: 'desktop-assembly-replacement.cjs',
    test: 'production-renderer-assembly-part-replacement', caption: 'assembly part replacement',
    additionalFixtures: Object.freeze({ replacementPart: 'assembly-updated-pin-original.json' }) }),
});
let activeScenario = SCENARIOS.all, started = false;
const fixturePath = () => path.join(__dirname, '..', 'src', 'cad', 'fixtures', activeScenario.fixture);
const PATTERN_ID = 'ui-all-P';
const PROFILE_PREFIX = 'solidflow-pattern-all-test-';
const INITIAL_READY_MS = 35_000;
const STEP_MS = 35_000;
// Separate multi-operation test budget; the standard desktop smoke is unchanged.
const TEST_MS = 180_000;
const fail = message => { throw new Error(message); };
const check = (condition, message) => { if (!condition) fail(message); };
const digest = value => createHash('sha256').update(value).digest('hex');
function canonical(value) {
  return JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
}
function describeError(error) {
  return { name: error?.name ?? typeof error, message: error?.message ?? String(error),
    ...(error?.cause !== undefined ? { cause: describeError(error.cause) } : {}),
    ...(error instanceof AggregateError ? { errors: [...error.errors].map(describeError) } : {}) };
}
function under(directory, target) {
  const relative = path.relative(directory, target);
  return !!relative && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}
function closeError(code, signal) {
  const error = new Error(`Isolated Electron child closed with code=${String(code)}, signal=${String(signal)}.`);
  error.childCode = code; error.childSignal = signal;
  error.launcherExitCode = Number.isInteger(code) && code > 0 ? code : 1;
  return error;
}
function applicationRoot(configured) {
  check(typeof configured === 'string' && path.isAbsolute(configured), 'Expected an explicit absolute test application root.');
  const root = fs.realpathSync(configured), packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  check(packageJson.name === 'solidflow' && packageJson.main === 'electron/main.cjs', 'Unexpected test application root.');
  check(!process.env.SOLIDFLOW_DEV_URL, 'This test requires the production loader; do not supply a development URL.');
  return root;
}
async function productionHashes(root) {
  const files = ['electron/main.cjs', 'electron/preload.cjs', 'dist/index.html'];
  async function walk(directory) {
    for (const item of await fsp.readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, item.name);
      if (item.isDirectory()) await walk(absolute);
      else if (item.isFile()) files.push(path.relative(root, absolute).split(path.sep).join('/'));
      else fail('Unexpected non-file production asset.');
    }
  }
  await walk(path.join(root, 'dist/assets'));
  return Object.fromEntries(await Promise.all([...new Set(files)].sort().map(async relative => [relative, digest(await fsp.readFile(path.join(root, relative)))])));
}
async function launch() {
  const root = applicationRoot(path.resolve(__dirname, '..')), requireFromRoot = createRequire(path.join(root, 'package.json'));
  const before = await productionHashes(root);
  const temporaryRoot = await fsp.realpath(os.tmpdir());
  const temporary = await fsp.mkdtemp(path.join(temporaryRoot, PROFILE_PREFIX)), token = randomUUID();
  let child, timer, closed = false, spawned = false, spawnError = false, primary, report;
  const teardown = [];
  try {
    for (const name of ['profile', 'session', 'logs', 'crashes']) await fsp.mkdir(path.join(temporary, name));
    await fsp.writeFile(path.join(temporary, '.test-owned.json'), JSON.stringify({ token }), { flag: 'wx' });
    if (activeScenario === SCENARIOS['assembly-configured-picking']) {
      await fsp.writeFile(path.join(temporary, 'input.solidflow'), JSON.stringify(require('./desktop-assembly-configured-picking-original.cjs')()), { flag: 'wx' });
    } else if (activeScenario === SCENARIOS['part-fresh-sketch']) {
      await fsp.writeFile(path.join(temporary, 'input.solidflow'), JSON.stringify(require('./desktop-part-fresh-sketch-original.cjs')()), { flag: 'wx' });
    } else if (activeScenario === SCENARIOS['assembly-configured-components']) {
      for (const [name, value] of Object.entries(require('./desktop-assembly-configured-components-original.cjs')()))
        await fsp.writeFile(path.join(temporary, name + '.solidflow'), JSON.stringify(value), { flag: 'wx' });
    } else if (activeScenario.compoundFamily) {
      const original = require('./desktop-assembly-configured-compound-original.cjs')(activeScenario.compoundFamily, activeScenario.profileKind);
      await fsp.writeFile(path.join(temporary, 'input.solidflow'), JSON.stringify(original), { flag: 'wx' });
    } else if (activeScenario.mechanicalFamily) {
      const original = require('./desktop-assembly-configured-mechanical-original.cjs')(activeScenario.mechanicalFamily);
      await fsp.writeFile(path.join(temporary, 'input.solidflow'), JSON.stringify(original), { flag: 'wx' });
    } else if (activeScenario.originAxes) {
      const original = require('./desktop-assembly-origin-axes-original.cjs')(activeScenario.originAxes === 'configured');
      await fsp.writeFile(path.join(temporary, 'input.solidflow'), JSON.stringify(original), { flag: 'wx' });
    } else if ([SCENARIOS['assembly-configurations'], SCENARIOS['assembly-configured-relations']].includes(activeScenario)) {
      const original = require('./desktop-assembly-configurations-original.cjs')();
      await fsp.writeFile(path.join(temporary, 'input.solidflow'), JSON.stringify(original), { flag: 'wx' });
    } else if (activeScenario === SCENARIOS['imported-bodies']) {
      const original = require('./desktop-imported-bodies-flow.cjs').createOriginalDocument(root);
      await fsp.writeFile(path.join(temporary, 'input.solidflow'), JSON.stringify(original), { flag: 'wx' });
    } else if ([SCENARIOS['assembly-step'], SCENARIOS['assembly-step-insertion']].includes(activeScenario)) {
      // A fixed pure-source reader is bundled only for this test-owned child.
      // Vite is a declared/pinned dev dependency; no TypeScript compiler API,
      // selected neutral filename, worker handle or arbitrary entry is used.
      const pureInputs = ['src/cad/kernel.step-structure.ts', 'src/cad/kernel.step-part21.ts',
        'src/cad/kernel.step-units.ts', 'src/model/rigidPose.ts'].map(name => path.normalize(path.join(root, name)));
      const parsed = new Set();
      const bundle = await (await import('vite')).build({ configFile: false, root, logLevel: 'silent',
        plugins: [{ name: 'test-owned-structural-reader-boundary', moduleParsed(info) {
          if (info.id === '\0rolldown/runtime.js') return;
          const id = path.normalize(info.id);
          check(pureInputs.includes(id), 'Unexpected module in fixed structural reader bundle: ' + info.id); parsed.add(id);
        } }],
        build: { outDir: temporary, emptyOutDir: false, write: false, minify: false,
          lib: { entry: pureInputs[0], formats: ['cjs'], name: 'SolidFlowTestStructuralReader', fileName: () => 'structure-reader.cjs' } } });
      const bundles = Array.isArray(bundle) ? bundle : [bundle];
      check(bundles.length === 1 && bundles[0].output.length === 1 && parsed.size === pureInputs.length,
        'The test reader must contain exactly the four declared pure source modules.');
      const reader = bundles[0].output[0];
      check(reader.type === 'chunk' && reader.fileName === 'structure-reader.cjs' && reader.imports.length === 0
        && reader.dynamicImports.length === 0, 'Expected one autonomous fixed CommonJS structural reader.');
      await fsp.writeFile(path.join(temporary, 'structure-reader.cjs'), reader.code, { flag: 'wx' });
      if (activeScenario === SCENARIOS['assembly-step-insertion']) {
        const original = require('./desktop-assembly-step-insertion-flow.cjs').createOriginalDocuments();
        await fsp.writeFile(path.join(temporary, 'input.solidflow'), JSON.stringify(original.source), { flag: 'wx' });
        await fsp.writeFile(path.join(temporary, 'insertion-parent.solidflow'), JSON.stringify(original.parent), { flag: 'wx' });
      } else {
        const original = require('./desktop-assembly-step-flow.cjs').createOriginalDocuments();
        await fsp.writeFile(path.join(temporary, 'input.solidflow'), JSON.stringify(original.assembly), { flag: 'wx' });
        await fsp.writeFile(path.join(temporary, 'original-part.solidflow'), JSON.stringify(original.part), { flag: 'wx' });
      }
      await fsp.writeFile(path.join(temporary, 'malformed.step'), 'ISO-10303-21; HEADER; ENDSEC; DATA; #1=PRODUCT(', { flag: 'wx' });
    } else if (activeScenario === SCENARIOS['assembly-source-revision']) {
      const original = require('./desktop-assembly-linked-source-original.cjs')();
      for (const [name, value] of Object.entries({ input: original.assemblyBefore, 'revision-parent': original.assemblyParent }))
        await fsp.writeFile(path.join(temporary, name + '.solidflow'), JSON.stringify(value), { flag: 'wx' });
    } else if (activeScenario === SCENARIOS['assembly-linked-source']) {
      const original = require('./desktop-assembly-linked-source-original.cjs')();
      for (const [name, value] of Object.entries({ input: original.partParent, 'linked-v2-parent': original.assemblyParent, 'linked-part': original.partBefore, 'linked-subassembly': original.assemblyBefore }))
        await fsp.writeFile(path.join(temporary, name + '.solidflow'), JSON.stringify(value), { flag: 'wx' });
    } else await fsp.copyFile(fixturePath(), path.join(temporary, 'input.solidflow'), fs.constants.COPYFILE_EXCL);
    for (const [name, fixture] of Object.entries(activeScenario.additionalFixtures ?? {})) {
      await fsp.copyFile(path.join(__dirname, '..', 'src', 'cad', 'fixtures', fixture),
        path.join(temporary, 'input-' + name + '.solidflow'), fs.constants.COPYFILE_EXCL);
    }
    const environment = { ...process.env, SOLIDFLOW_PATTERN_UI_TEST_ROOT: root, SOLIDFLOW_PATTERN_UI_TEST_TEMP: temporary, SOLIDFLOW_PATTERN_UI_TEST_TOKEN: token };
    delete environment.ELECTRON_RUN_AS_NODE; delete environment.SOLIDFLOW_DEV_URL;
    const entry = path.join(__dirname, activeScenario.entry);
    const args = process.platform === 'linux' && environment.CI === 'true' ? ['--ignore-gpu-blocklist', entry] : [entry];
    await new Promise((resolve, reject) => {
      const rejectPrimary = error => { primary ??= error; reject(primary); };
      try { child = spawn(requireFromRoot('electron'), args, { cwd: root, env: environment, stdio: 'inherit', windowsHide: true }); }
      catch (error) { rejectPrimary(error); return; }
      spawned = !!child.pid;
      child.once('spawn', () => { spawned = true; });
      child.on('error', error => {
        spawnError = true;
        if (primary && primary !== error && !teardown.includes(error)) teardown.push(error);
        rejectPrimary(error);
      });
      child.once('close', (code, signal) => {
        closed = true;
        if (primary) { reject(primary); return; }
        if (code !== 0 || signal !== null) rejectPrimary(closeError(code, signal));
        else resolve();
      });
      timer = setTimeout(() => {
        // Capture timeout first: synchronous close during kill cannot win PASS.
        rejectPrimary(new Error(`Isolated ${activeScenario.caption} UI test exceeded ${TEST_MS} milliseconds; child close not yet observed.`));
        try { if (child.exitCode === null && child.signalCode === null) child.kill(); } catch (error) { teardown.push(error); }
      }, TEST_MS);
    });
    report = JSON.parse(await fsp.readFile(path.join(temporary, 'workflow-result.json'), 'utf8'));
    check(report.workflowStatus === 'PASS', 'The child did not record a successful complete UI workflow.');
    if ((activeScenario === SCENARIOS['assembly-configured-picking'] || activeScenario.originAxes || activeScenario === SCENARIOS['assembly-configured-components'] || activeScenario === SCENARIOS['part-fresh-sketch'] || activeScenario === SCENARIOS['part-sequence'] || activeScenario.mechanicalFamily || activeScenario.compoundFamily || [SCENARIOS['assembly-configurations'], SCENARIOS['assembly-configured-relations'], SCENARIOS.assembly, SCENARIOS['assembly-import'], SCENARIOS['assembly-linked-source'], SCENARIOS['assembly-source-revision'], SCENARIOS['assembly-interference-multibody'], SCENARIOS['assembly-interference-grouping'], SCENARIOS['assembly-interference-grouping-multibody'], SCENARIOS['assembly-interference-grouping-scope'], SCENARIOS['assembly-screw'], SCENARIOS['assembly-rack-pinion'], SCENARIOS['assembly-export'], SCENARIOS['assembly-direction'], SCENARIOS['assembly-angle-measurement'], SCENARIOS['assembly-directed-angle'], SCENARIOS['assembly-tangent'], SCENARIOS['assembly-cylinder-tangent'], SCENARIOS['assembly-sphere-tangent'], SCENARIOS['assembly-limit-distance'], SCENARIOS['assembly-limit-distance-compact'], SCENARIOS['assembly-limit-angle'], SCENARIOS['assembly-width'], SCENARIOS['assembly-line-path'], SCENARIOS['assembly-circular-path'], SCENARIOS['assembly-hinge'], SCENARIOS['assembly-hinge-picking'], SCENARIOS['assembly-hinge-repair'], SCENARIOS['assembly-hinge-limits'], SCENARIOS['assembly-hinge-limits-repair'], SCENARIOS['assembly-hinge-limits-picking'], SCENARIOS['assembly-profile-center'], SCENARIOS['assembly-symmetry'], SCENARIOS['assembly-symmetry-line-repair'], SCENARIOS['assembly-symmetry-plane-repair'], SCENARIOS['assembly-symmetry-sphere-repair'], SCENARIOS['assembly-symmetry-cylinder-repair'], SCENARIOS['assembly-symmetry-axisline-repair'], SCENARIOS['assembly-symmetry-repair'], SCENARIOS['assembly-symmetry-picking'], SCENARIOS['assembly-symmetry-nested-selected'], SCENARIOS['assembly-symmetry-nested-source'], SCENARIOS['assembly-replacement']].includes(activeScenario)) && process.env.SOLIDFLOW_UI_CAPTURE === '1') {
      check(report.captures?.length === 1 && report.captures[0].name === 'assembly-final.png', 'Expected one test-owned assembly capture.');
      const png = await fsp.readFile(path.join(temporary, 'assembly-final.png'));
      check(png.length <= 10 * 1024 * 1024 && digest(png) === report.captures[0].sha256, 'Assembly capture bytes changed.');
      report.captureImage = { ...report.captures[0], base64: png.toString('base64') };
      if (activeScenario === SCENARIOS['assembly-configured-picking'] || activeScenario === SCENARIOS['part-fresh-sketch'] || activeScenario === SCENARIOS['part-sequence'] || activeScenario.originAxes || activeScenario === SCENARIOS['assembly-configured-components']) {
        const bytes = await fsp.readFile(path.join(temporary, 'saved.solidflow'));
        const proof = report.checks.find(item => item && typeof item === 'object' && item.savedSha256);
        check(bytes.length <= 1024 * 1024 && proof?.savedSha256 === digest(bytes), 'The original demo must retain the exact verified native Save bytes.');
        report.demoDocument = { name: activeScenario === SCENARIOS['assembly-configured-picking'] ? 'seleccion-configurada.solidflow' : activeScenario === SCENARIOS['part-fresh-sketch'] ? 'croquis-nuevos-en-caras.solidflow' : activeScenario === SCENARIOS['assembly-configured-components'] ? 'componentes-configurados.solidflow' : activeScenario.originAxes ? 'relaciones-ejes-origen.solidflow' : 'secuencia-operaciones.solidflow', sha256: digest(bytes), content: bytes.toString('utf8') };
      }
    }
  } catch (error) {
    primary ??= error;
    // A completed child's FAIL evidence means finish already emitted its
    // primary assertion. Keep the parent close/teardown error unchanged, but
    // do not replace that annotation with a less useful generic exit message.
    if (closed) {
      try {
        const childReport = JSON.parse(await fsp.readFile(path.join(temporary, 'workflow-result.json'), 'utf8'));
        if (childReport.workflowStatus === 'FAIL' && typeof childReport.error?.message === 'string') markDesktopCiFailureReported(primary);
      } catch { /* Missing child evidence requires the outer failure fallback. */ }
    }
  }
  finally {
    clearTimeout(timer);
    if (child && !closed && !(spawnError && !spawned && !child.pid)) {
      try { if (!child.killed && child.exitCode === null && child.signalCode === null) child.kill(); } catch (error) { teardown.push(error); }
      // No close grace extends the deadline. Retain isolated files if close is
      // unconfirmed; unref this owned child, never a shared stream/user process.
      if (!closed) {
        try { child.unref(); } catch (error) { teardown.push(error); }
        teardown.push(new Error('Child close was not observed. Isolated temporary profile retained; process-tree closure is not established.'));
      }
    }
    try {
      const after = await productionHashes(root);
      check(JSON.stringify(before) === JSON.stringify(after), 'Production main/preload/assets changed during the workflow.');
    } catch (error) { teardown.push(error); }
    if (!child || closed || spawnError && !spawned && !child.pid) {
      try {
        const resolved = await fsp.realpath(temporary), guard = JSON.parse(await fsp.readFile(path.join(resolved, '.test-owned.json'), 'utf8'));
        check(under(temporaryRoot, resolved) && path.basename(resolved).startsWith(PROFILE_PREFIX) && guard.token === token,
          'Unexpected temporary target; refuse cleanup.');
        await fsp.rm(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      } catch (error) { teardown.push(error); }
    }
  }
  if (primary || teardown.length) {
    if (teardown.length) throw new AggregateError(primary ? [primary, ...teardown] : teardown, `Isolated ${activeScenario.caption} workflow and/or teardown failed.`, { cause: primary ?? teardown[0] });
    throw primary;
  }
  console.log(JSON.stringify({ test: activeScenario.test, status: 'PASS', productionInputHashes: before, ...report,
    childCloseObserved: true, isolatedTemporaryDeleted: true }, null, 2));
}

// Runs before any app bundle. This only observes/forwards the real Worker API;
// no CAD response, React state, document or IPC result is supplied by the test.
function installWorkerObserver(importedBodyDetails = false, structuralStep = false, structuralInsertion = false, configurations = false) {
  const NativeWorker = globalThis.Worker;
  const observations = { serial: 0, eventSerial: 0, builds: [], ui: [], assemblies: [], assemblyUi: [], workerErrors: [] };
  const copy = value => JSON.parse(JSON.stringify(value));
  // Observation of the actual display mesh, not a native BRep-area capability.
  // Original planar imported-box checks compare this independent triangle sum.
  const meshArea = (vertices, triangles) => {
    if (!Array.isArray(vertices) || !Array.isArray(triangles) || vertices.length % 3 || triangles.length % 3) return null;
    let area = 0;
    for (let i = 0; i < triangles.length; i += 3) {
      const indices = triangles.slice(i, i + 3);
      if (indices.some(v => !Number.isInteger(v) || v < 0 || 3 * v + 2 >= vertices.length)) return null;
      const [a, b, c] = indices.map(index => vertices.slice(3 * index, 3 * index + 3));
      if (![...a, ...b, ...c].every(Number.isFinite)) return null;
      const u = b.map((v, j) => v - a[j]), v = c.map((x, j) => x - a[j]);
      area += .5 * Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]);
    }
    return Number.isFinite(area) ? area : null;
  };
  const compactScene = scene => scene && ({ kind: scene.kind, sceneId: scene.sceneId, volume: scene.volume,
    area: scene.area, solidCount: scene.solidCount, prototypeCount: scene.prototypeCount,
    bounds: copy(scene.bounds), visibleBounds: copy(scene.visibleBounds), warnings: copy(scene.warnings),
    bodies: scene.bodies.map(body => ({ component: copy(body.component), body: copy(body.body), name: body.name,
      visible: body.visible, worldPose: copy(body.worldPose), ...(configurations ? { configurationAncestry: copy(body.configurationAncestry) } : {}), volume: body.volume, area: body.area,
      solidCount: body.solidCount, bounds: copy(body.bounds), ...(structuralStep || structuralInsertion ? { meshAreaMm2: meshArea(body.vertices, body.triangles) } : {}), faces: body.faces.map(face => ({
        selection: copy(face.selection), support: copy(face.support), worldSupport: copy(face.worldSupport),
        ...(face.sphereSurface ? { sphereSurface: copy(face.sphereSurface) } : {}),
        ...(face.worldSphereSurface ? { worldSphereSurface: copy(face.worldSphereSurface) } : {}),
        vertexCount: face.vertices.length / 3, triangleCount: face.triangles.length / 3 })),
      vertexPoints: copy(body.vertexPoints ?? []),
      edges: (body.edges ?? []).map(edge => ({ selection: copy(edge.selection), support: copy(edge.support),
        worldSupport: copy(edge.worldSupport), ...(edge.circularPathOrigins ? { circularPathOrigins: copy(edge.circularPathOrigins) } : {}), lines: copy(edge.lines) })) })) });
  const compactAnalysis = report => ({ kind: report.kind, analysisId: report.analysisId, options: copy(report.options), hasToken: Object.hasOwn(report, 'token'),
    scopeSummary: copy(report.scopeSummary), bodyCount: report.bodyCount, componentCount: report.componentCount, potentialPairCount: report.potentialPairCount,
    testedPairCount: report.testedPairCount, broadPhaseExcludedCount: report.broadPhaseExcludedCount, warnings: copy(report.warnings),
    pairs: report.pairs.map(pair => {
      const { intersectionMesh: mesh, ...values } = pair;
      let bounds = null;
      if (mesh?.vertices.length) {
        const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
        for (let i = 0; i < mesh.vertices.length; i++) { const axis = i % 3; min[axis] = Math.min(min[axis], mesh.vertices[i]); max[axis] = Math.max(max[axis], mesh.vertices[i]); }
        bounds = { min, max };
      }
      return { ...copy(values), intersectionMesh: mesh ? { vertexCount: mesh.vertices.length / 3,
        normalCount: mesh.normals.length / 3, triangleCount: mesh.triangles.length / 3, bounds } : null };
    }) });
  const compactReplacement = review => ({ kind: review.kind, reviewId: review.reviewId, hasToken: Object.hasOwn(review, 'token'),
    document: copy(review.document), scene: compactScene(review.scene), source: copy(review.source), replacement: copy(review.replacement),
    occurrences: copy(review.occurrences), expandedPaths: copy(review.expandedPaths), scopeMap: copy(review.scopeMap),
    endpoints: copy(review.endpoints), replacementCatalog: compactScene(review.replacementCatalog), mechanicalMates: copy(review.mechanicalMates) });
  const compactDocumentUpdate = review => ({ kind: review.kind, reviewId: review.reviewId, hasToken: Object.hasOwn(review, 'token'),
    document: copy(review.document), scene: compactScene(review.scene), source: copy(review.source), replacement: copy(review.replacement),
    occurrences: copy(review.occurrences), endpoints: copy(review.endpoints), unresolvedEndpoints: copy(review.unresolvedEndpoints),
    capturedMates: copy(review.capturedMates), replacementCatalog: compactScene(review.replacementCatalog), components: copy(review.components) });
  let previousUi, previousAssemblyUi;
  new MutationObserver(() => {
    const scope = document.querySelector('select[aria-label="Alcance de los cuerpos de la repetición"]');
    const apply = document.querySelector('button[title="Aceptar operación"]');
    const method = document.querySelector('select[aria-label="Método de repetición de operaciones"]');
    const worldLimit = document.querySelector('input[aria-label^="Mantener plano límite fijo de "]');
    const sample = { scope: scope?.value ?? null, applyDisabled: apply ? apply.disabled : null,
      method: method?.value ?? null, worldLimitChecked: worldLimit ? worldLimit.checked : null }, key = JSON.stringify(sample);
    if (key !== previousUi && observations.ui.length < 512) {
      previousUi = key; observations.ui.push({ eventSerial: ++observations.eventSerial, ...sample });
    }
    const toolbar = document.querySelector('.assembly-toolbar');
    if (toolbar) {
      const buttons = [...toolbar.querySelectorAll('button')], apply = buttons.find(button => button.textContent.trim() === 'Aplicar');
      const sample = { applyDisabled: apply?.disabled ?? null,
        saveDisabled: buttons.find(button => button.textContent.trim() === 'Guardar')?.disabled ?? null,
        stepExportDisabled: document.querySelector('button[aria-label="Exportar STEP plano del ensamblaje"]')?.disabled ?? null,
        stlExportDisabled: document.querySelector('button[aria-label="Exportar STL del ensamblaje"]')?.disabled ?? null,
        busy: !!document.querySelector('.assembly-spinner'), preview: document.querySelector('.assembly-canvas-label span')?.textContent ?? null };
      const key = JSON.stringify(sample);
      if (key !== previousAssemblyUi && observations.assemblyUi.length < 512) {
        previousAssemblyUi = key; observations.assemblyUi.push({ eventSerial: ++observations.eventSerial, ...sample });
      }
    }
  }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['disabled'] });
  function compactConfigured(value) { return { kind: value.kind, context: copy(value.context), scene: compactScene(value.scene), referenceDiagnostics: copy(value.referenceDiagnostics) }; }
  globalThis.Worker = new Proxy(NativeWorker, { construct(Target, args, newTarget) {
    const worker = Reflect.construct(Target, args, newTarget), send = worker.postMessage, pending = new Map();
    worker.postMessage = function(message, ...rest) {
      if (message?.action === 'build') {
        const record = { serial: ++observations.serial, eventSerial: ++observations.eventSerial, id: message.id, features: copy(message.features), response: null };
        if (observations.builds.length >= 256) observations.workerErrors.push('Observer build envelope exceeded256.');
        else { observations.builds.push(record); pending.set(message.id, record); }
      }
      if ((configurations && ['build-configured-assembly', 'preview-configured-assembly', 'preview-configured-assembly-relation-edit', 'preview-configured-assembly-mechanical-edit', 'preview-configured-assembly-occurrence-edit', 'apply-configured-assembly', 'discard-configured-assembly'].includes(message?.action))
        || (structuralStep && ['import-assembly-step', 'export-assembly-step'].includes(message?.action))
        || (structuralInsertion && ['insert-assembly-step', 'export-assembly-step'].includes(message?.action)) || ['build-assembly', 'preview-assembly', 'preview-assembly-root-revision', 'apply-assembly', 'discard-assembly',
        'lock-assembly-rotation', 'lock-assembly-components', 'capture-assembly-gear', 'capture-assembly-screw', 'capture-assembly-rack-pinion', 'review-assembly-part-update', 'preview-assembly-part-update', 'discard-assembly-part-update',
        'review-assembly-part-replacement', 'preview-assembly-part-replacement', 'discard-assembly-part-replacement',
        'review-assembly-document-update', 'preview-assembly-document-update', 'discard-assembly-document-update',
        'measure-assembly-directed-angle', 'inspect-assembly-interferences', 'move-assembly-component', 'move-assembly-component-motion', 'move-assembly-world-component', 'project-assembly-component', 'translate-assembly-until-contact', 'export-assembly'].includes(message?.action)) {
        const record = { serial: ++observations.serial, eventSerial: ++observations.eventSerial, id: message.id,
          action: message.action, response: null };
        for (const field of ['document', 'current', 'edit', 'intent', 'proposed', 'mateId', 'scope', 'first', 'second', 'source', 'part', 'incoming', 'revision', 'sourceLink', 'options', 'move', 'motion', 'drag', 'translation', 'stopOptions', 'request', 'format', 'reviewId', 'decisions']) {
          if (message[field] !== undefined) record[field] = copy(message[field]);
        }
        if (message.token !== undefined) record.hasToken = typeof message.token === 'string' && message.token.length > 0;
        if (observations.assemblies.length >= 256) observations.workerErrors.push('Observer assembly envelope exceeded256.');
        else { observations.assemblies.push(record); pending.set(message.id, record); }
      }
      return Reflect.apply(send, this, [message, ...rest]);
    };
    worker.addEventListener('message', event => {
      const record = pending.get(event.data?.id);
      if (!record) return;
      pending.delete(event.data.id);
      record.responseEventSerial = ++observations.eventSerial;
      if (!event.data.ok) record.response = { ok: false, error: event.data.error };
      else if (record.action) {
        const value = event.data.value;
        record.response = { ok: true, value: value === null ? null : value instanceof Blob ? { size: value.size, type: value.type }
          : (structuralStep && record.action === 'import-assembly-step') || (structuralInsertion && record.action === 'insert-assembly-step') ? copy(value)
          : configurations && value.kind === 'configured-assembly-scene' ? compactConfigured(value)
          : configurations && ['configured-assembly-preview', 'configured-assembly-applied'].includes(value.kind) ? {
            kind: value.kind, generation: value.generation, candidateGeneration: value.candidateGeneration, document: copy(value.document),
            scene: compactConfigured(value.scene), ...(value.states ? { states: copy(value.states) } : {}), ...(value.verification ? { verification: copy(value.verification) } : {}), changed: value.changed,
            hasToken: typeof value.token === 'string' && value.token.length > 0 }
          : value.kind === 'assembly-scene' ? compactScene(value)
          : value.kind === 'assembly-interference-report' ? compactAnalysis(value)
          : record.action === 'measure-assembly-directed-angle' ? copy(value)
          : value.kind === 'assembly-document-source-review' ? compactDocumentUpdate(value)
          : value.kind === 'assembly-replacement-review' ? compactReplacement(value) : {
          kind: value.kind, ...(typeof value.reviewId === 'string' ? { reviewId: value.reviewId } : {}), ...(value.status !== undefined ? { status: value.status } : {}),
          ...(value.reason !== undefined ? { reason: value.reason, message: value.message } : {}),
          ...(value.document ? { document: copy(value.document) } : {}),
          ...(value.movement ? { movement: copy(value.movement) } : {}),
          ...(value.motion ? { motion: copy(value.motion) } : {}),
          ...(value.projection ? { projection: copy(value.projection) } : {}),
          ...(value.translation ? { translation: copy(value.translation) } : {}),
          ...(value.tangencies ? { tangencies: copy(value.tangencies) } : {}),
          ...(value.cylinderTangencies ? { cylinderTangencies: copy(value.cylinderTangencies) } : {}),
          ...(value.sphericalTangencies ? { sphericalTangencies: copy(value.sphericalTangencies) } : {}),
          ...(value.limitDistances ? { limitDistances: copy(value.limitDistances) } : {}),
          ...(value.linePaths ? { linePaths: copy(value.linePaths) } : {}),
          ...(value.circularPaths ? { circularPaths: copy(value.circularPaths) } : {}),
          ...(value.hinges ? { hinges: copy(value.hinges) } : {}),
          ...(value.profileCenters ? { profileCenters: copy(value.profileCenters) } : {}),
          ...(value.widthCentered ? { widthCentered: copy(value.widthCentered) } : {}),
          ...(value.symmetries ? { symmetries: copy(value.symmetries) } : {}),
          ...(value.limitAngles ? { limitAngles: copy(value.limitAngles) } : {}),
          ...(value.limitDirectedAngles ? { limitDirectedAngles: copy(value.limitDirectedAngles) } : {}),
          ...(value.scene ? { scene: compactScene(value.scene) } : {}),
          ...(value.scopes ? { scopes: copy(value.scopes) } : {}),
          ...(value.checks ? { checks: copy(value.checks) } : {}),
          ...(value.source ? { source: copy(value.source), replacement: copy(value.replacement),
            occurrences: copy(value.occurrences), endpoints: copy(value.endpoints) } : {}),
          ...(value.token !== undefined ? { hasToken: typeof value.token === 'string' && value.token.length > 0 } : {}),
        } };
      }
      else {
        const result = event.data.value;
        record.response = { ok: true, value: { bodyCatalogActive: result.bodyCatalogActive,
          ...(importedBodyDetails ? { volume: result.volume, bounds: copy(result.bounds), meshVertexCount: result.vertices.length / 3, meshTriangleCount: result.triangles.length / 3 } : {}),
          bodies: result.bodies?.map(body => ({ ref: copy(body.ref), createdByFeatureId: body.createdByFeatureId,
            volume: body.volume, bounds: copy(body.bounds), ...(importedBodyDetails ? { meshAreaMm2: meshArea(body.vertices, body.triangles),
              meshVertexCount: body.vertices.length / 3, meshTriangleCount: body.triangles.length / 3 } : {}) })), featureErrors: copy(result.featureErrors), warnings: copy(result.warnings) } };
      }
    });
    worker.addEventListener('error', event => observations.workerErrors.push(event.message || 'Worker error'));
    return worker;
  } });
  Object.defineProperty(globalThis, '__solidflowUiTestObservation', { value: Object.freeze({ snapshot: () => copy(observations) }), configurable: false });
}
async function runInElectron() {
  const electron = require('electron'), { app } = electron, root = applicationRoot(process.env.SOLIDFLOW_PATTERN_UI_TEST_ROOT);
  const temporary = process.env.SOLIDFLOW_PATTERN_UI_TEST_TEMP, token = process.env.SOLIDFLOW_PATTERN_UI_TEST_TOKEN;
  check(temporary && path.isAbsolute(temporary) && token, 'Launch this test through its Node parent.');
  const owned = fs.realpathSync.native(temporary), guard = JSON.parse(fs.readFileSync(path.join(owned, '.test-owned.json'), 'utf8'));
  check(under(fs.realpathSync.native(os.tmpdir()), owned) && path.basename(owned).startsWith(PROFILE_PREFIX) && guard.token === token, 'Unexpected isolated profile.');
  app.setPath('userData', path.join(owned, 'profile')); app.setPath('sessionData', path.join(owned, 'session'));
  app.setPath('crashDumps', path.join(owned, 'crashes')); app.setAppLogsPath(path.join(owned, 'logs'));
  const input = path.join(owned, 'input.solidflow'), output = path.join(owned, 'saved.solidflow');
  const projectionOutput = path.join(owned, 'saved-projection.solidflow');
  const translationOutput = path.join(owned, 'saved-translation.solidflow');
  const gearOutput = path.join(owned, 'saved-gear.solidflow');
  const expected = JSON.parse(fs.readFileSync(input, 'utf8')), expectedIds = expected.features?.map(feature => feature.id);
  const untilNext = activeScenario === SCENARIOS['until-next'];
  const freshSketch = activeScenario === SCENARIOS['part-fresh-sketch'];
  const partSequence = activeScenario === SCENARIOS['part-sequence'];
  const originAxes = activeScenario.originAxes;
  const configuredRelations = activeScenario === SCENARIOS['assembly-configured-relations'];
  const configuredComponents = activeScenario === SCENARIOS['assembly-configured-components'];
  const configuredPicking = activeScenario === SCENARIOS['assembly-configured-picking'];
  const configuredMechanical = activeScenario.mechanicalFamily;
  const configuredCompound = activeScenario.compoundFamily;
  const configurations = activeScenario === SCENARIOS['assembly-configurations'] || configuredRelations || configuredComponents || configuredPicking || !!configuredMechanical || !!configuredCompound || originAxes === 'configured';
  const importedBodies = activeScenario === SCENARIOS['imported-bodies'];
  const structuralStep = activeScenario === SCENARIOS['assembly-step'];
  const structuralInsertion = activeScenario === SCENARIOS['assembly-step-insertion'];
  const structuralFiles = structuralStep ? { part: path.join(owned, 'original-part.solidflow'), malformed: path.join(owned, 'malformed.step'),
    canceled: path.join(owned, 'canceled-structure.step'), exported: path.join(owned, 'original-structure.step'), reexported: path.join(owned, 'reopened-structure.step') } : null;
  const insertionFiles = structuralInsertion ? { parent: path.join(owned, 'insertion-parent.solidflow'), malformed: path.join(owned, 'malformed.step'),
    exported: path.join(owned, 'insertion-source.step'), reexported: path.join(owned, 'inserted-parent.step') } : null;
  const assembly = activeScenario === SCENARIOS.assembly;
  const assemblyImport = activeScenario === SCENARIOS['assembly-import'];
  const importBaselinePath = assemblyImport ? path.join(owned, 'baseline-parent.solidflow') : null;
  const importRejectedPath = assemblyImport ? path.join(owned, 'input-rejected-subassembly.solidflow') : null;
  const importSourcePath = assemblyImport ? path.join(owned, 'input-subassembly.solidflow') : null;
  const importSource = assemblyImport ? JSON.parse(fs.readFileSync(importSourcePath, 'utf8')) : null;
  const sourceRevision = activeScenario === SCENARIOS['assembly-source-revision'];
  const sourceRevisionOriginal = sourceRevision ? require('./desktop-assembly-linked-source-original.cjs')() : null;
  const sourceRevisionFiles = sourceRevision ? { source: input, parent: path.join(owned, 'revision-parent.solidflow'), output } : null;
  const linkedSource = activeScenario === SCENARIOS['assembly-linked-source'];
  const linkedSourceOriginal = linkedSource ? require('./desktop-assembly-linked-source-original.cjs')() : null;
  const linkedSourceFiles = linkedSource ? { part: path.join(owned, 'linked-part.solidflow'), assembly: path.join(owned, 'linked-subassembly.solidflow'),
    assemblyParent: path.join(owned, 'linked-v2-parent.solidflow'), partOutput: output, assemblyOutput: path.join(owned, 'linked-v2-saved.solidflow') } : null;
  const sourceUpdateSavePending = activeScenario === SCENARIOS['assembly-source-update-save-pending'];
  const assemblySourceUpdate = activeScenario === SCENARIOS['assembly-source-update'] || sourceUpdateSavePending;
  const documentUpdateFiles = assemblySourceUpdate ? { source: path.join(owned, 'input-incoming.solidflow'),
    baseline: path.join(owned, 'source-update-baseline.solidflow'), rejected: path.join(owned, 'source-update-rejected.solidflow') } : null;
  const interferenceMultibody = activeScenario === SCENARIOS['assembly-interference-multibody'];
  const interferenceGrouping = activeScenario === SCENARIOS['assembly-interference-grouping'];
  const interferenceGroupingScope = activeScenario === SCENARIOS['assembly-interference-grouping-scope'];
  const interferenceGroupingMultibody = activeScenario === SCENARIOS['assembly-interference-grouping-multibody'];
  const screw = activeScenario === SCENARIOS['assembly-screw'];
  const rackPinion = activeScenario === SCENARIOS['assembly-rack-pinion'];
  const assemblyExport = activeScenario === SCENARIOS['assembly-export'];
  const direction = activeScenario === SCENARIOS['assembly-direction'];
  const angleMeasurement = activeScenario === SCENARIOS['assembly-angle-measurement'];
  const directedAngle = activeScenario === SCENARIOS['assembly-directed-angle'];
  const directedGuideFiles = directedAngle ? { input: path.join(owned, 'directed-guide-input.solidflow'),
    part: path.join(owned, 'directed-guide-update.solidflow'), output: path.join(owned, 'directed-guide-saved.solidflow') } : null;
  const tangent = activeScenario === SCENARIOS['assembly-tangent'];
  const cylinderTangent = activeScenario === SCENARIOS['assembly-cylinder-tangent'];
  const cylinderTangentInputs = cylinderTangent ? { skew: input, parallel: path.join(owned, 'input-parallel.solidflow') } : null;
  const cylinderTangentFixtures = cylinderTangent ? Object.fromEntries(Object.entries(cylinderTangentInputs).map(([name, file]) =>
    [name, JSON.parse(fs.readFileSync(file, 'utf8'))])) : null;
  const cylinderTangentOutputs = cylinderTangent ? { skew: output, parallel: path.join(owned, 'saved-parallel.solidflow') } : null;
  const sphereTangent = activeScenario === SCENARIOS['assembly-sphere-tangent'];
  const limitDistanceCompact = activeScenario === SCENARIOS['assembly-limit-distance-compact'];
  const limitDistance = activeScenario === SCENARIOS['assembly-limit-distance'] || limitDistanceCompact;
  const hinge = activeScenario === SCENARIOS['assembly-hinge'];
  const hingePicking = activeScenario === SCENARIOS['assembly-hinge-picking'];
  const hingeLimitsPicking = activeScenario === SCENARIOS['assembly-hinge-limits-picking'];
  const hingeLimits = activeScenario === SCENARIOS['assembly-hinge-limits'];
  const hingeLimitsRepair = activeScenario === SCENARIOS['assembly-hinge-limits-repair'];
  const hingeRepair = activeScenario === SCENARIOS['assembly-hinge-repair'] || hingeLimitsRepair;
  const hingeRepairFiles = hingeRepair ? { updatedPart: path.join(owned, 'input-updatedPart.solidflow'),
    replacementPart: path.join(owned, 'input-replacementPart.solidflow'), baselineSaved: path.join(owned, 'hinge-baseline.solidflow'),
    updatedSaved: path.join(owned, 'hinge-updated.solidflow'), selectedSaved: path.join(owned, 'hinge-selected.solidflow'),
    replacementSaved: path.join(owned, 'hinge-replaced.solidflow') } : null;
  const hingeRepairUpdatedPart = hingeRepair ? JSON.parse(fs.readFileSync(hingeRepairFiles.updatedPart, 'utf8')) : null;
  const hingeRepairReplacementPart = hingeRepair ? JSON.parse(fs.readFileSync(hingeRepairFiles.replacementPart, 'utf8')) : null;
  const circularPath = activeScenario === SCENARIOS['assembly-circular-path'];
  const linePath = activeScenario === SCENARIOS['assembly-line-path'];
  const profileCenter = activeScenario === SCENARIOS['assembly-profile-center'];
  const width = activeScenario === SCENARIOS['assembly-width'];
  const symmetry = activeScenario === SCENARIOS['assembly-symmetry'];
  const symmetrySurfaceRepair = [SCENARIOS['assembly-symmetry-line-repair'], SCENARIOS['assembly-symmetry-plane-repair'], SCENARIOS['assembly-symmetry-sphere-repair'], SCENARIOS['assembly-symmetry-cylinder-repair'], SCENARIOS['assembly-symmetry-axisline-repair']].includes(activeScenario);
  const symmetryRadialRepair = activeScenario === SCENARIOS['assembly-symmetry-sphere-repair'] || activeScenario === SCENARIOS['assembly-symmetry-cylinder-repair'];
  const symmetryAxisRepair = activeScenario === SCENARIOS['assembly-symmetry-axisline-repair'];
  const surfaceRepairFiles = symmetrySurfaceRepair ? { updatedPart: path.join(owned, 'input-updatedPart.solidflow'),
    replacementPart: path.join(owned, 'input-replacementPart.solidflow'), baselineSaved: path.join(owned, 'surface-symmetry-baseline.solidflow'),
    updatedSaved: path.join(owned, 'surface-symmetry-updated.solidflow'), replacementSaved: path.join(owned, 'surface-symmetry-replaced.solidflow'),
    axisSelectedSaved: path.join(owned, 'surface-symmetry-axis-selected.solidflow') } : null;
  const surfaceRepairUpdatedPart = symmetrySurfaceRepair ? JSON.parse(fs.readFileSync(surfaceRepairFiles.updatedPart, 'utf8')) : null;
  const surfaceRepairReplacementPart = symmetrySurfaceRepair ? JSON.parse(fs.readFileSync(surfaceRepairFiles.replacementPart, 'utf8')) : null;
  const symmetryRepair = activeScenario === SCENARIOS['assembly-symmetry-repair'];
  const symmetryPicking = activeScenario === SCENARIOS['assembly-symmetry-picking'];
  const symmetryNestedSelected = activeScenario === SCENARIOS['assembly-symmetry-nested-selected'];
  const symmetryNestedSource = activeScenario === SCENARIOS['assembly-symmetry-nested-source'];
  const symmetryNestedRepair = symmetryNestedSelected || symmetryNestedSource;
  const nestedRepairFiles = symmetryNestedRepair ? {
    part: path.join(owned, symmetryNestedSource ? 'input-updatedPart.solidflow' : 'input-replacementPart.solidflow'),
    baselineSaved: path.join(owned, 'nested-symmetry-baseline.solidflow'),
    operationSaved: path.join(owned, 'nested-symmetry-operation.solidflow'),
    activeSaved: path.join(owned, 'nested-symmetry-active.solidflow'),
  } : null;
  const symmetryNestedUpdatedPart = symmetryNestedSource ? JSON.parse(fs.readFileSync(nestedRepairFiles.part, 'utf8')) : null;
  const symmetryNestedReplacementPart = symmetryNestedSelected ? JSON.parse(fs.readFileSync(nestedRepairFiles.part, 'utf8')) : null;
  const repairFiles = symmetryRepair ? { updatedPart: path.join(owned, 'input-updatedPart.solidflow'),
    replacementPart: path.join(owned, 'input-replacementPart.solidflow'), baselineSaved: path.join(owned, 'symmetry-baseline.solidflow'),
    updatedSaved: path.join(owned, 'symmetry-updated.solidflow'), replacementSaved: path.join(owned, 'symmetry-replaced.solidflow') } : null;
  const symmetryRepairUpdatedPart = symmetryRepair ? JSON.parse(fs.readFileSync(repairFiles.updatedPart, 'utf8')) : null;
  const symmetryRepairReplacementPart = symmetryRepair ? JSON.parse(fs.readFileSync(repairFiles.replacementPart, 'utf8')) : null;
  const limitAngle = activeScenario === SCENARIOS['assembly-limit-angle'];
  const replacement = activeScenario === SCENARIOS['assembly-replacement'];
  const replacementFiles = replacement ? { part: path.join(owned, 'input-replacementPart.solidflow'),
    mated: path.join(owned, 'replacement-mated.solidflow'), allInput: path.join(owned, 'replacement-all-input.solidflow'),
    allOutput: path.join(owned, 'replacement-all-saved.solidflow') } : null;
  const replacementPart = replacement ? JSON.parse(fs.readFileSync(replacementFiles.part, 'utf8')) : null;
  const sphereTangentInputs = sphereTangent ? { planeSphere: input, sphereSphere: path.join(owned, 'input-sphereSphere.solidflow'), cylinderSphere: path.join(owned, 'input-cylinderSphere.solidflow') } : null;
  const sphereTangentFixtures = sphereTangent ? Object.fromEntries(Object.entries(sphereTangentInputs).map(([name, file]) =>
    [name, JSON.parse(fs.readFileSync(file, 'utf8'))])) : null;
  const sphereTangentOutputs = sphereTangent ? { planeSphere: output, sphereSphere: path.join(owned, 'saved-sphereSphere.solidflow'), cylinderSphere: path.join(owned, 'saved-cylinderSphere.solidflow') } : null;
  const partUpdatePath = assembly ? path.join(owned, 'input-partUpdate.solidflow') : null;
  const updatedPart = assembly ? JSON.parse(fs.readFileSync(partUpdatePath, 'utf8')) : null;
  const interferencePath = assembly ? path.join(owned, 'input-interference.solidflow') : null;
  const interferenceFixture = assembly ? JSON.parse(fs.readFileSync(interferencePath, 'utf8')) : null;
  const translationPath = assembly ? path.join(owned, 'input-translation.solidflow') : null;
  const translationFixture = assembly ? JSON.parse(fs.readFileSync(translationPath, 'utf8')) : null;
  const bomPath = assembly ? path.join(owned, 'input-bom.solidflow') : null;
  const bomFixture = assembly ? JSON.parse(fs.readFileSync(bomPath, 'utf8')) : null;
  const bomCsvOutputs = assembly ? ['parts', 'top', 'indented'].map(name => path.join(owned, 'bom-' + name + '.csv')) : [];
  const configuredBomCsvOutputs = configurations ? ['failure-directory', 'root', 'scoped'].map(name => path.join(owned, 'configured-bom-' + name + '.csv')) : [];
  if (configurations) fs.mkdirSync(configuredBomCsvOutputs[0]);
  const configuredCsvBarrier = { pending: false, release: null };
  const assemblyExportFormats = assemblyExport ? ['step', 'step', 'stl', 'step', 'stl', 'step', 'stl'] : [];
  const assemblyExportOutputs = assemblyExportFormats.map((format, index) => path.join(owned, 'assembly-export-' + (index + 1) + '.' + format));
  const inputPaths = untilNext ? { cut: input, add: path.join(owned, 'input-add.solidflow'),
    reject: path.join(owned, 'input-reject.solidflow') } : null;
  const fixtures = untilNext ? Object.fromEntries(Object.entries(inputPaths).map(([name, file]) =>
    [name, JSON.parse(fs.readFileSync(file, 'utf8'))])) : null;
  const outputs = untilNext ? { cutSelected: path.join(owned, 'saved-cut-selected.solidflow'),
    cutAll: path.join(owned, 'saved-cut-all.solidflow'), add: path.join(owned, 'saved-add-selected.solidflow') } : null;
  const openPaths = configuredComponents ? [input, null, path.join(owned, 'incoming.solidflow'), path.join(owned, 'incoming.solidflow'), output] : structuralInsertion ? [input, insertionFiles.parent, output] : structuralStep ? [input, structuralFiles.part, output] : untilNext ? [inputPaths.cut, outputs.cutSelected, outputs.cutAll,
    inputPaths.add, outputs.add, inputPaths.reject] : assembly ? [input, output, partUpdatePath, partUpdatePath, output, output, output, projectionOutput, output, interferencePath, translationPath, translationOutput, bomPath, input, gearOutput]
    : assemblyImport ? [input, importSourcePath, importRejectedPath, importSourcePath, output]
    : sourceRevision ? [input, sourceRevisionFiles.parent, output]
    : linkedSource ? [input, output, linkedSourceFiles.assemblyParent, linkedSourceFiles.assemblyOutput]
    : assemblySourceUpdate ? [input, documentUpdateFiles.source, documentUpdateFiles.source, documentUpdateFiles.rejected, output]
    : interferenceMultibody || interferenceGrouping || interferenceGroupingMultibody || interferenceGroupingScope ? [input]
    : sphereTangent ? [sphereTangentInputs.planeSphere, sphereTangentOutputs.planeSphere, sphereTangentInputs.sphereSphere, sphereTangentOutputs.sphereSphere, sphereTangentInputs.cylinderSphere, sphereTangentOutputs.cylinderSphere]
    : cylinderTangent ? [cylinderTangentInputs.skew, cylinderTangentOutputs.skew, cylinderTangentInputs.parallel, cylinderTangentOutputs.parallel]
    : replacement ? [input, replacementFiles.mated, replacementFiles.part, replacementFiles.part, output, replacementFiles.allInput, replacementFiles.allOutput]
    : directedAngle ? [input, output, directedGuideFiles.input, directedGuideFiles.part, directedGuideFiles.part, directedGuideFiles.output]
    : hingeRepair ? [input, hingeRepairFiles.updatedPart, hingeRepairFiles.updatedPart, hingeRepairFiles.updatedSaved,
      hingeRepairFiles.baselineSaved, hingeRepairFiles.replacementPart, hingeRepairFiles.selectedSaved,
      hingeRepairFiles.baselineSaved, hingeRepairFiles.replacementPart, hingeRepairFiles.replacementPart, hingeRepairFiles.replacementSaved]
    : symmetrySurfaceRepair ? (symmetryAxisRepair
      ? [input, surfaceRepairFiles.updatedPart, surfaceRepairFiles.updatedPart, surfaceRepairFiles.updatedSaved, surfaceRepairFiles.replacementPart, surfaceRepairFiles.replacementPart, surfaceRepairFiles.axisSelectedSaved, surfaceRepairFiles.updatedSaved, surfaceRepairFiles.replacementPart, surfaceRepairFiles.replacementPart, surfaceRepairFiles.replacementSaved]
      : [input, surfaceRepairFiles.updatedPart, surfaceRepairFiles.updatedPart, surfaceRepairFiles.updatedSaved, ...(symmetryRadialRepair ? [surfaceRepairFiles.replacementPart] : []), surfaceRepairFiles.replacementPart, surfaceRepairFiles.replacementPart, surfaceRepairFiles.replacementSaved])
    : symmetryNestedRepair ? [input, nestedRepairFiles.part, nestedRepairFiles.part, nestedRepairFiles.operationSaved, nestedRepairFiles.activeSaved]
    : symmetryRepair ? [input, repairFiles.updatedPart, repairFiles.updatedPart, repairFiles.updatedSaved, repairFiles.baselineSaved,
      repairFiles.replacementPart, repairFiles.replacementPart, repairFiles.replacementSaved]
    : symmetryPicking ? [input, ...Array(6).fill(output)]
    : symmetry ? [input, ...Array(5).fill(output)] : configuredRelations || configuredPicking || configuredMechanical || configuredCompound ? [input, output] : configurations ? [input, output, output] : [input, output];
  const savePaths = configurations ? [null, output] : untilNext ? [outputs.cutSelected, outputs.cutAll, outputs.add] : assembly ? [output, projectionOutput, translationOutput, gearOutput]
    : assemblyImport ? [importBaselinePath, output]
    : sourceRevision ? [null, output]
    : linkedSource ? [output, linkedSourceFiles.assemblyOutput]
    : assemblySourceUpdate ? [documentUpdateFiles.baseline, output]
    : interferenceMultibody || interferenceGrouping || interferenceGroupingMultibody || interferenceGroupingScope ? []
    : sphereTangent ? [sphereTangentOutputs.planeSphere, sphereTangentOutputs.sphereSphere, sphereTangentOutputs.cylinderSphere]
    : cylinderTangent ? [cylinderTangentOutputs.skew, cylinderTangentOutputs.parallel] : replacement ? [output, replacementFiles.allOutput]
    : directedAngle ? [output, directedGuideFiles.output]
    : hingeRepair ? [hingeRepairFiles.baselineSaved, hingeRepairFiles.updatedSaved, hingeRepairFiles.selectedSaved, hingeRepairFiles.replacementSaved]
    : symmetrySurfaceRepair ? [surfaceRepairFiles.baselineSaved, surfaceRepairFiles.updatedSaved, ...(symmetryAxisRepair ? [surfaceRepairFiles.axisSelectedSaved] : []), surfaceRepairFiles.replacementSaved]
    : symmetryNestedRepair ? [nestedRepairFiles.baselineSaved, nestedRepairFiles.operationSaved, nestedRepairFiles.activeSaved]
    : symmetryRepair ? [repairFiles.baselineSaved, repairFiles.updatedSaved, repairFiles.replacementSaved]
    : symmetryPicking ? Array(6).fill(output) : symmetry ? Array(5).fill(output) : [output];
  const sourceChoosePaths = sourceRevision ? [input, input, input] : linkedSource ? [...Array(4).fill(linkedSourceFiles.part), ...Array(5).fill(linkedSourceFiles.assembly)] : [];
  const stepImportPaths = structuralInsertion ? [null, insertionFiles.malformed, insertionFiles.exported] : structuralStep ? [null, structuralFiles.malformed, structuralFiles.exported, structuralFiles.exported] : [];
  const structuredExportPaths = structuralInsertion ? [insertionFiles.exported, insertionFiles.reexported] : structuralStep ? [structuralFiles.canceled, structuralFiles.exported, structuralFiles.reexported] : [];
  let sourceOpens = 0, stepImports = 0;
  const protocolResponses = [], consoleErrors = [], failedRequests = [], ipc = [], checks = [], captures = [];
  // One statically selected successful Save per owned child. The real main
  // handler writes/validates the file; only its unchanged return is withheld.
  const saveCompletion = { enabled: sourceUpdateSavePending || !!configuredMechanical || !!configuredCompound, ordinal: configuredMechanical || configuredCompound ? 2 : 1,
    armed: false, pending: false, releasedBy: null, nativeReady: null, ready: null, release: null, observation: null, samples: [] };
  function releaseSaveCompletion(by) {
    if (!saveCompletion.pending) return;
    saveCompletion.pending = false; saveCompletion.releasedBy = by;
    const resolve = saveCompletion.release; saveCompletion.release = null; resolve();
  }
  async function samplePendingSave(phase) {
    check(saveCompletion.pending && saveCompletion.samples.length < 4 && !window.isVisible(), 'Bounded owned pending-save sample.');
    const snapshot = await window.webContents.executeJavaScript(`(() => {
      const configured = !!document.querySelector('.configured-assembly-workspace');
      const root = document.querySelector(configured ? '.configured-assembly-workspace' : '.assembly-app');
      const toolbar = document.querySelector(configured ? '[aria-label="Archivo del ensamblaje configurado"]' : '.assembly-toolbar');
      const button = text => { const rows = [...(toolbar?.querySelectorAll('button') ?? [])].filter(b => b.textContent.trim() === text); return { count: rows.length, disabled: rows.length === 1 ? rows[0].disabled : null }; };
      const update = document.querySelector('button[aria-label="Actualizar subensamblaje"]');
      return { configured, busy: root?.getAttribute('aria-busy') ?? null,
        header: (document.querySelector(configured ? '.configured-assembly-workspace header' : '.assembly-header')?.textContent ?? '').slice(0, 300),
        file: (document.querySelector('.assembly-file')?.textContent ?? '').slice(0, 100),
        open: button('Abrir'), save: button('Guardar'), update: { present: !!update, disabled: update?.disabled ?? null } };
    })()`, false);
    const sample = { phase, ordinal: saveCompletion.ordinal, nativeCompleted: saveCompletion.observation.completed,
      ipcReturnReleased: saveCompletion.observation.ipcReturnReleased, ...snapshot };
    saveCompletion.samples.push(sample); return sample;
  }
  const completePendingSave = async () => {
    if (!saveCompletion.enabled || !saveCompletion.armed || saveCompletion.releasedBy) return;
    await saveCompletion.nativeReady;
    check(saveCompletion.pending, 'Expected the selected native Save return to remain withheld.');
    await samplePendingSave('saved-controls-fence'); releaseSaveCompletion('saved-controls-fence');
  };
  let opens = 0, saves = 0, csvExports = 0, geometryExports = 0, finished = false, window;
  const timeout = setTimeout(() => finish(new Error('The isolated UI workflow did not finish before its child deadline.')), TEST_MS - 10_000);
  function finish(error) {
    if (finished) return;
    if (!error && saveCompletion.enabled && (!saveCompletion.armed || saveCompletion.pending
      || saveCompletion.releasedBy !== 'saved-controls-fence' || saveCompletion.observation?.ipcReturnReleased !== true)) {
      error = new Error('The selected real Save did not complete its pending-return acceptance.');
    }
    releaseSaveCompletion('cleanup');
    finished = true; clearTimeout(timeout);
    if (error) emitDesktopCiFailure(error);
    const report = { workflowStatus: error ? 'FAIL' : 'PASS', checks, protocolResponses, consoleErrors, failedRequests, captures,
      dialogSubstitutions: { opens, saves, csvExports, ...(linkedSource || sourceRevision ? { sourceOpens } : {}), ...(assemblyExport || structuralStep || structuralInsertion ? { geometryExports } : {}), ...(structuralStep || structuralInsertion ? { stepImports } : {}) }, ipc,
      ...(saveCompletion.enabled ? { saveCompletion: { ordinal: saveCompletion.ordinal, armed: saveCompletion.armed, releasedBy: saveCompletion.releasedBy, samples: saveCompletion.samples } } : {}),
      ...(error ? { error: describeError(error) } : {}) };
    try { fs.writeFileSync(path.join(owned, 'workflow-result.json'), JSON.stringify(report, null, 2)); }
    catch (writeError) { if (!error) emitDesktopCiFailure(writeError); console.error(new AggregateError(error ? [error, writeError] : [writeError], 'Workflow evidence could not be written.', { cause: error ?? writeError })); process.exitCode = 1; }
    if (error) { console.error(error); process.exitCode = 1; }
    const encoded = JSON.stringify({ test: activeScenario.test, ...report });
    if (error || process.exitCode === 1) {
      // This process owns a token-checked hidden test profile. Preserve evidence
      // synchronously and exit failure without a dirty-fixture close prompt.
      fs.writeSync(1, encoded + '\n');
      app.exit(1);
      return;
    }
    console.log(encoded);
    // Successful workflow still requires the parent to observe close/code0.
    app.quit();
  }
  const evaluate = async source => {
    // Capture the request's initial state: clicking Save itself must not consume
    // a gate that its subsequent IPC call will create.
    const pendingAtStart = saveCompletion.enabled && saveCompletion.armed && !saveCompletion.releasedBy;
    if (pendingAtStart) {
      await saveCompletion.nativeReady;
      if (saveCompletion.pending && !saveCompletion.samples.some(s => s.phase === 'before-next-evaluation')) await samplePendingSave('before-next-evaluation');
    }
    return window.webContents.executeJavaScript(source, false);
  };
  const pointer = async (type, point, buttons = 0) => {
    check((freshSketch || configuredPicking || assembly || rackPinion || direction || tangent || cylinderTangent || sphereTangent || limitDistance || limitAngle || directedAngle || width || symmetryPicking || hingePicking || hingeLimitsPicking) && !window.isVisible() && window.webContents.debugger.isAttached()
      && ['mouseMoved', 'mousePressed', 'mouseReleased'].includes(type)
      && Number.isFinite(point.x) && Number.isFinite(point.y) && point.x >= 0 && point.y >= 0
      && [0, 1].includes(buttons), 'Expected actual pointer input in the hidden test-owned assembly window.');
    await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {
      type, x: point.x, y: point.y, button: type === 'mouseMoved' && !buttons ? 'none' : 'left', buttons,
      clickCount: type === 'mouseMoved' ? 0 : 1, pointerType: 'mouse',
    });
  };
  const wheel = async (point, deltaY) => {
    check((limitDistance || freshSketch) && !window.isVisible() && window.webContents.debugger.isAttached()
      && Number.isFinite(point.x) && Number.isFinite(point.y) && point.x >= 0 && point.y >= 0
      && Number.isFinite(deltaY) && deltaY !== 0 && Math.abs(deltaY) <= 1000,
    'Expected a bounded actual wheel input in the hidden test-owned interval window.');
    await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {
      type: 'mouseWheel', x: point.x, y: point.y, deltaX: 0, deltaY, button: 'none', buttons: 0,
      clickCount: 0, pointerType: 'mouse',
    });
  };
  const capture = async (expectedCapture = expected, widthPreview = false) => {
    if ((!originAxes && !freshSketch && !partSequence && !configurations && !sourceRevision && !linkedSource && !assembly && !assemblyImport && !interferenceMultibody && !interferenceGrouping && !interferenceGroupingMultibody && !interferenceGroupingScope && !screw && !rackPinion && !assemblyExport && !direction && !angleMeasurement && !directedAngle && !tangent && !cylinderTangent && !sphereTangent && !limitDistance && !limitAngle && !width && !linePath && !circularPath && !hinge && !hingeLimits && !hingePicking && !hingeLimitsPicking && !hingeRepair && !profileCenter && !symmetry && !symmetryRepair && !symmetrySurfaceRepair && !symmetryPicking && !symmetryNestedRepair && !replacement) || process.env.SOLIDFLOW_UI_CAPTURE !== '1') return;
    check(!widthPreview || width, 'Preview capture is restricted to the fixed Width scenario.');
    check(captures.length === 0 && !window.isVisible(), 'Expected one hidden test-owned capture.');
    const confirmed = () => partSequence || freshSketch
      ? evaluate(`(() => { const t=document.querySelector('.document-title')?.textContent ?? ''; return !document.querySelector('.property-manager') && t.includes(${encodeJavaScriptString(expectedCapture.name)}) && !t.includes('*') && document.querySelector('.statusbar')?.textContent.includes('Listo'); })()`)
      : configurations
      ? evaluate(`(() => document.querySelector('.configured-assembly-workspace')?.getAttribute('aria-busy') === 'false'
        && document.querySelector('.configured-assembly-workspace header strong')?.textContent === ${encodeJavaScriptString('SolidFlow · ' + expectedCapture.source?.name)}
        && [...document.querySelectorAll('.configured-assembly-workspace button')].some(b => b.textContent.trim() === 'Aplicar configuración' && b.disabled))()` )
      : evaluate(`(() => {
      const save = [...document.querySelectorAll('.assembly-toolbar button')].find(button => button.textContent.trim() === 'Guardar');
      return document.querySelector('.assembly-app')?.getAttribute('aria-busy') === 'false'
        && document.querySelector('.assembly-header > strong')?.textContent === ${encodeJavaScriptString(expectedCapture.name + (widthPreview ? ' *' : ''))}
        && (${widthPreview ? 'true' : 'false'}
          ? document.querySelector('.assembly-canvas-label span')?.textContent === 'Vista previa · todavía sin aplicar'
            && document.querySelector('button[aria-label="Aplicar ensamblaje"]')?.disabled === false
            && document.querySelector('[aria-label="Anchura centrada verificada"]')?.textContent.includes('planos infinitos')
            && ['Anchura · plano 1','Anchura · plano 2','Pestaña · plano 1','Pestaña · plano 2'].every(role => document.querySelector('select[aria-label="'+role+'"]')?.disabled === true)
          : document.querySelector('.assembly-canvas-label span')?.textContent === 'Componentes independientes · mm'
            && !!save && !save.disabled && document.querySelector('button[aria-label="Aplicar ensamblaje"]')?.disabled === true);
    })()`);
    check(await confirmed(), widthPreview ? 'Capture requires the reopened assembly and its fresh unapplied Width preview.' : 'Capture requires the reopened clean committed assembly.');
    // Hidden windows can retain an earlier compositor frame after React/DOM
    // readiness. Observe renderer frames and a real presentation before capture;
    // neither this barrier nor the resulting PNG is CAD/interaction authority.
    await evaluate(`new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Assembly visual renderer frame deadline.')), ${STEP_MS});
      requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(timer); resolve(); }));
    })`);
    let frameTimer;
    try {
      await new Promise((resolve, reject) => {
        frameTimer = setTimeout(() => reject(new Error('Assembly visual presentation deadline.')), STEP_MS);
        window.webContents.beginFrameSubscription(false, () => resolve());
        window.webContents.invalidate();
      });
    } finally {
      clearTimeout(frameTimer);
      if (!window.webContents.isDestroyed()) window.webContents.endFrameSubscription();
    }
    check(await confirmed(), 'The confirmed assembly changed during visual capture.');
    const image = await window.webContents.capturePage(undefined, { stayHidden: true }), png = image.toPNG(), size = image.getSize();
    check(!image.isEmpty() && png.length <= 10 * 1024 * 1024 && !window.isVisible(), 'The isolated page capture is empty, oversized or visible.');
    check(await confirmed(), 'The confirmed assembly changed while capturing the presented page.');
    await fsp.writeFile(path.join(owned, 'assembly-final.png'), png, { flag: 'wx' });
    captures.push({ name: 'assembly-final.png', bytes: png.length, sha256: digest(png), width: size.width, height: size.height,
      phase: widthPreview ? 'reopened/fresh-width-preview-unapplied' : 'committed/analysis-or-reopen', confirmedDocumentId: configurations ? expectedCapture.source.id : expectedCapture.id, presentationObserved: true });
  };
  const observe = () => evaluate('globalThis.__solidflowUiTestObservation.snapshot()');
  async function waitFor(description, inspect, budget = STEP_MS) {
    const started = Date.now(); let last;
    while (Date.now() - started < budget) {
      last = await inspect();
      if (last) { checks.push(description); return last; }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Timed out waiting for ${description}; last observation=${JSON.stringify(last)}.`);
  }
  async function click(selector) {
    await evaluate(`(() => { const elements=[...document.querySelectorAll(${encodeJavaScriptString(selector)})]; if(elements.length!==1||elements[0].disabled) throw Error('Expected one enabled control: '+${encodeJavaScriptString(selector)}); elements[0].click(); })()`);
  }
  async function menu(label) {
    await evaluate(`(() => { const find=(selector,text)=>[...document.querySelectorAll(selector)].filter(x=>x.textContent.trim()===text); const top=find('nav .menu-wrap > button','Archivo'); if(top.length!==1) throw Error('Archivo menu is ambiguous'); top[0].click(); })()`);
    await evaluate(`(() => { const buttons=[...document.querySelectorAll('.dropdown button')].filter(x=>x.textContent.trim().startsWith(${encodeJavaScriptString(label)})); if(buttons.length!==1||buttons[0].disabled) throw Error('Expected one enabled file menu action'); buttons[0].click(); })()`);
  }
  async function buildAfter(serial, scope) {
    return waitFor('healthy worker build for ' + scope, async () => {
      const state = await observe(); check(!state.workerErrors.length, 'Observed a real worker error.');
      const matches = state.builds.filter(record => record.serial > serial && record.features.map(feature => feature.id).join('|') === expectedIds.join('|')
        && record.features.at(-1)?.featurePattern?.scope === scope && record.response);
      const record = matches.at(-1); if (!record) return false;
      check(record.response.ok, record.response.error || 'Worker build rejected.');
      check(record.response.value.featureErrors.length === 0, 'Worker build returned feature errors.');
      check(record.response.value.bodyCatalogActive && record.response.value.bodies?.length === 4, 'Expected four independently owned current bodies.');
      return record;
    });
  }
  function assertBodies(record, all) {
    const actual = new Map(record.response.value.bodies.map(body => [body.ref.bodyId, body]));
    const desired = { S: ['seed-cut', 'create-S', 400 - 4 * Math.PI, [0, 0, 0], [10, 10, 4]],
      A: [PATTERN_ID, 'create-A', 800 - 8 * Math.PI, [20, 0, 0], [30, 10, 8]],
      B: [all ? PATTERN_ID : 'create-B', 'create-B', all ? 800 - 8 * Math.PI : 800, [20, 0, 0], [30, 10, 8]],
      C: ['create-C', 'create-C', 800, [50, 0, 0], [60, 10, 8]] };
    for (const [id, [source, creator, volume, min, max]] of Object.entries(desired)) {
      const body = actual.get(id); check(body?.ref.sourceFeatureId === source && body.createdByFeatureId === creator, 'Unexpected exact ref/creator for ' + id);
      check(Number.isFinite(body.volume) && Math.abs(body.volume - volume) < 1e-5, 'Unexpected independent volume for ' + id);
      for (const [side, expectedSide] of [['min', min], ['max', max]]) expectedSide.forEach((coordinate, index) =>
        check(Number.isFinite(body.bounds[side][index]) && Math.abs(body.bounds[side][index] - coordinate) < 1e-6, 'Unexpected independent bounds for ' + id));
    }
  }
  function assertAllDocument(document) {
    check(document.id === expected.id && document.features.map(feature => feature.id).join('|') === expectedIds.join('|'), 'Unexpected saved identities/prefix.');
    check(canonical(document.features.slice(0, -1)) === canonical(expected.features.slice(0, -1)), 'The original source/targets changed during the UI scope edit.');
    const feature = document.features.at(-1), operation = feature.featurePattern;
    check(feature.id === PATTERN_ID && feature.source.geometryPattern === false && operation.mode === 'regenerate' && operation.scope === 'all'
      && operation.reevaluateAt === 'patternInput' && !Object.hasOwn(operation, 'targets'), 'Saved ALL reverted to a selected target snapshot.');
    check(canonical(operation.bindings) === canonical([{ source: { bodyId: 'S', sourceFeatureId: 'seed-cut' }, targetBodyIds: 'scope' }]), 'The exact historical source or scope route changed.');
  }
  async function workflow() {
    await waitFor('initial renderer readiness', async () => evaluate(`(() => { const s=document.querySelector('.statusbar')?.textContent||''; return s.includes('Listo')&&s.includes('Sólido')&&document.querySelectorAll('canvas').length>0&&typeof window.solidflow?.openDocument==='function'&&typeof window.require==='undefined'&&typeof window.process==='undefined'; })()`), INITIAL_READY_MS);
    let serial = (await observe()).serial;
    await click('button[aria-label="Abrir (Ctrl+O)"]');
    // The fresh test-owned production document starts dirty. Accept its actual
    // React discard dialog; never seed/replace renderer or persistence state.
    await waitFor('fresh isolated document asks to discard', () => evaluate(
      `document.querySelectorAll('[role="dialog"][aria-labelledby="discard-title"]').length === 1`));
    await evaluate(`(() => { const button=document.querySelector('[role="dialog"][aria-labelledby="discard-title"] .primary-button'); if(!button||button.disabled||button.textContent.trim()!=='Continuar sin guardar') throw Error('Expected exact enabled discard confirmation'); button.click(); })()`);
    await waitFor('fresh isolated discard dialog closes', () => evaluate(
      `!document.querySelector('[role="dialog"][aria-labelledby="discard-title"]')`));
    const selected = await buildAfter(serial, 'selected'); assertBodies(selected, false);
    await waitFor('loaded original document', () => evaluate(`document.querySelector('.document-title')?.textContent.includes('Original isolated ALL interaction')`));
    await evaluate(`(() => { const rows=[...document.querySelectorAll('.tree-row')].filter(row=>[...row.querySelectorAll('span')].some(span=>span.textContent==='UI ALL pattern original')); if(rows.length!==1) throw Error('Original pattern row missing/ambiguous'); rows[0].dispatchEvent(new MouseEvent('dblclick',{bubbles:true})); })()`);
    await waitFor('selected editor and exact A selection', () => evaluate(`(() => {const s=document.querySelector('select[aria-label="Alcance de los cuerpos de la repetición"]'); const a=document.querySelector('input[aria-label="Aplicar repetición a Original A"]'); return s?.value==='selected'&&!s.disabled&&a?.checked;})()`));
    const beforeScopeChange = await observe(); serial = beforeScopeChange.serial;
    await evaluate(`(() => { const select=document.querySelector('select[aria-label="Alcance de los cuerpos de la repetición"]'); if(!select||select.disabled||select.value!=='selected') throw Error('Selected scope is not editable'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,'all'); select.dispatchEvent(new Event('change',{bubbles:true})); })()`);
    const preview = await buildAfter(serial, 'all'); assertBodies(preview, true); assertAllDocument({ ...expected, features: preview.features });
    const pendingUi = (await observe()).ui.filter(sample => sample.eventSerial > beforeScopeChange.eventSerial
      && sample.eventSerial < preview.responseEventSerial && sample.scope === 'all');
    check(pendingUi.some(sample => sample.applyDisabled === true) && pendingUi.every(sample => sample.applyDisabled === true),
      'The real ALL editor did not keep Apply disabled before its observed worker response.');
    checks.push('observed ALL Apply disabled before the actual preview response');
    await waitFor('fresh ALL preview enables Apply without stale manual selection', () => evaluate(`(() => {const s=document.querySelector('select[aria-label="Alcance de los cuerpos de la repetición"]');const b=document.querySelector('button[title="Aceptar operación"]');return s?.value==='all'&&!b?.disabled&&!!b&&!document.querySelector('input[aria-label="Aplicar repetición a Original A"]');})()`));
    serial = (await observe()).serial;
    await click('button[title="Aceptar operación"]');
    await waitFor('React Apply leaves the property manager', () => evaluate(`!document.querySelector('.property-manager')`));
    const committed = await buildAfter(serial, 'all'); assertBodies(committed, true);
    await waitFor('committed ALL reaches autosave', async () => {
      const value = await evaluate(`localStorage.getItem('solidflow.autosave')`); if (!value) return false;
      const parsed = JSON.parse(value); if (parsed.id !== expected.id || parsed.features.at(-1)?.featurePattern?.scope !== 'all') return false;
      assertAllDocument(parsed); return true;
    });
    await menu('Guardar como…');
    await waitFor('real preload/IPC save completes', () => saves === 1 && ipc.some(event => event.channel === 'document:save' && event.completed));
    await waitFor('renderer records the completed save', () => evaluate(`(() => {const title=document.querySelector('.document-title')?.textContent||'';return title.includes('Original isolated ALL interaction')&&!title.includes('*');})()`));
    const saved = JSON.parse(await fsp.readFile(output, 'utf8')); assertAllDocument(saved);
    serial = (await observe()).serial;
    await click('button[aria-label="Abrir (Ctrl+O)"]');
    const reopened = await buildAfter(serial, 'all'); assertBodies(reopened, true);
    check(canonical(reopened.features) === canonical(saved.features), 'Reopened worker input differs from the actually saved file.');
    check(opens === 2 && saves === 1, 'Expected only fixture-open, isolated Save As and saved-output reopen.');
    check(!consoleErrors.length && !failedRequests.length, 'Renderer console/request failure occurred.');
    check(protocolResponses.some(asset => /kernel\.worker-[\w-]+\.js$/.test(asset.url) && asset.status === 200)
      && protocolResponses.some(asset => asset.url.endsWith('.wasm') && asset.status === 200), 'Real production worker/WASM loads were not observed.');
    checks.push({ independentBodyOracles: 'S400-4pi,A/B800-8pi,C800; bounds1e-6, volume1e-5',
      workerBuilds: [['selected', selected], ['preview', preview], ['committed', committed], ['reopened', reopened]].map(([phase, record]) => ({
        phase, requestId: record.id, serial: record.serial, featuresSha256: digest(canonical(record.features)), bodies: record.response.value.bodies })),
      savedPattern: saved.features.at(-1),
      savedContentSha256: digest(await fsp.readFile(output)), savedFeaturesSha256: digest(JSON.stringify(saved.features)) });
  }
  // The extra workflow is a fixed tracked module, never a caller/env-selected script.
  const actualWorkflow = freshSketch
    ? require('./desktop-part-fresh-sketch-flow.cjs')({ expected, input, output, evaluate, observe, waitFor, click, pointer, wheel, menu, capture,
      checks, protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest,
      initialReadyMs: INITIAL_READY_MS, dialogCounts: () => ({ opens, saves }) })
    : partSequence
    ? require('./desktop-part-sequence-flow.cjs')({ expected, input, output, evaluate, observe, waitFor, click, menu, capture,
      checks, protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest,
      initialReadyMs: INITIAL_READY_MS, dialogCounts: () => ({ opens, saves }) })
    : originAxes
    ? require('./desktop-assembly-origin-axes-flow.cjs')({ configured: originAxes === 'configured', expected, input, output, evaluate, observe, waitFor, click, capture, checks, consoleErrors, failedRequests, ipc, check, canonical, digest, initialReadyMs: INITIAL_READY_MS, dialogCounts: () => ({ opens, saves, csvExports }) })
    : configuredCompound
    ? require('./desktop-assembly-configured-compound-flow.cjs')({ family: configuredCompound, profileKind: activeScenario.profileKind, expected, input, output, evaluate, observe, waitFor, click, capture, checks, consoleErrors, failedRequests, ipc, check, canonical, digest, completePendingSave, initialReadyMs: INITIAL_READY_MS, dialogCounts: () => ({ opens, saves, csvExports }) })
    : configuredMechanical
    ? require('./desktop-assembly-configured-mechanical-flow.cjs')({ family: configuredMechanical, expected, input, output, evaluate, observe, waitFor, click, capture, checks, consoleErrors, failedRequests, ipc, check, canonical, digest, completePendingSave, initialReadyMs: INITIAL_READY_MS, dialogCounts: () => ({ opens, saves, csvExports }) })
    : configuredPicking
    ? require('./desktop-assembly-configured-picking-flow.cjs')({ expected, input, output, evaluate, observe, waitFor, click, pointer, capture, checks, consoleErrors, failedRequests, ipc, check, canonical, digest, initialReadyMs: INITIAL_READY_MS, dialogCounts: () => ({ opens, saves }) })
    : configuredComponents
    ? require('./desktop-assembly-configured-components-flow.cjs')({ expected, input, output, evaluate, observe, waitFor, click, capture, checks, consoleErrors, failedRequests, ipc, check, canonical, digest, initialReadyMs: INITIAL_READY_MS, dialogCounts: () => ({ opens, saves }) })
    : configuredRelations
    ? require('./desktop-assembly-configured-relations-flow.cjs')({ expected, input, output, evaluate, observe, waitFor, click, capture, checks, consoleErrors, failedRequests, ipc, check, canonical, digest, initialReadyMs: INITIAL_READY_MS, dialogCounts: () => ({ opens, saves, csvExports }) })
    : configurations
    ? require('./desktop-assembly-configurations-flow.cjs')({ expected, input, output, bomCsvOutputs: configuredBomCsvOutputs, csvBarrier: configuredCsvBarrier, evaluate, observe, waitFor, click, capture, checks, protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest, initialReadyMs: INITIAL_READY_MS, dialogCounts: () => ({ opens, saves, csvExports }) })
    : importedBodies
    ? require('./desktop-imported-bodies-flow.cjs')({ expected, input, output, evaluate, observe, waitFor, click, menu,
      checks, protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest,
      initialReadyMs: INITIAL_READY_MS, dialogCounts: () => ({ opens, saves, csvExports }) })
    : structuralInsertion
    ? require('./desktop-assembly-step-insertion-flow.cjs')({ expected, input, output, insertionFiles, evaluate, observe, waitFor, click,
      checks, protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest,
      initialReadyMs: INITIAL_READY_MS, dialogCounts: () => ({ opens, saves, csvExports, geometryExports, stepImports }) })
    : structuralStep
    ? require('./desktop-assembly-step-flow.cjs')({ expected, input, output, structuralFiles, evaluate, observe, waitFor, click, menu,
      checks, protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest,
      initialReadyMs: INITIAL_READY_MS, dialogCounts: () => ({ opens, saves, csvExports, geometryExports, stepImports }) })
    : sourceRevision
    ? require('./desktop-assembly-source-revision-flow.cjs')({ expected, input, files: sourceRevisionFiles, original: sourceRevisionOriginal,
      evaluate, observe, waitFor, click, capture, checks, consoleErrors, failedRequests, ipc, check, canonical, digest,
      initialReadyMs: INITIAL_READY_MS, dialogCounts: () => ({ opens, saves, csvExports, sourceOpens }) })
    : linkedSource
    ? require('./desktop-assembly-linked-source-flow.cjs')({ expected, input, files: linkedSourceFiles, original: linkedSourceOriginal,
      evaluate, observe, waitFor, click, capture, checks, consoleErrors, failedRequests, ipc, check, canonical, digest,
      initialReadyMs: INITIAL_READY_MS, dialogCounts: () => ({ opens, saves, csvExports, sourceOpens }) })
    : activeScenario === SCENARIOS['assembly-symmetry-line-repair']
    ? require('./desktop-assembly-symmetry-line-repair-flow.cjs')({ expected, input, files: surfaceRepairFiles, updatedPart: surfaceRepairUpdatedPart, replacementPart: surfaceRepairReplacementPart,
      evaluate, observe, waitFor, click, capture, checks, protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest,
      initialReadyMs: INITIAL_READY_MS, dialogCounts: () => ({ opens, saves, csvExports }) })
    : activeScenario === SCENARIOS['assembly-symmetry-plane-repair']
    ? require('./desktop-assembly-symmetry-plane-repair-flow.cjs')({ expected, input, files: surfaceRepairFiles, updatedPart: surfaceRepairUpdatedPart, replacementPart: surfaceRepairReplacementPart,
      evaluate, observe, waitFor, click, capture, checks, protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest,
      initialReadyMs: INITIAL_READY_MS, dialogCounts: () => ({ opens, saves, csvExports }) })
    : activeScenario === SCENARIOS['assembly-symmetry-sphere-repair']
    ? require('./desktop-assembly-symmetry-sphere-repair-flow.cjs')({ expected, input, files: surfaceRepairFiles, updatedPart: surfaceRepairUpdatedPart, replacementPart: surfaceRepairReplacementPart,
      evaluate, observe, waitFor, click, capture, checks, protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest,
      initialReadyMs: INITIAL_READY_MS, dialogCounts: () => ({ opens, saves, csvExports }) })
    : activeScenario === SCENARIOS['assembly-symmetry-cylinder-repair']
    ? require('./desktop-assembly-symmetry-cylinder-repair-flow.cjs')({ expected, input, files: surfaceRepairFiles, updatedPart: surfaceRepairUpdatedPart, replacementPart: surfaceRepairReplacementPart,
      evaluate, observe, waitFor, click, capture, checks, protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest,
      initialReadyMs: INITIAL_READY_MS, dialogCounts: () => ({ opens, saves, csvExports }) })
    : activeScenario === SCENARIOS['assembly-symmetry-axisline-repair']
    ? require('./desktop-assembly-symmetry-axisline-repair-flow.cjs')({ expected, input, files: surfaceRepairFiles, updatedPart: surfaceRepairUpdatedPart, replacementPart: surfaceRepairReplacementPart,
      evaluate, observe, waitFor, click, capture, checks, protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest,
      initialReadyMs: INITIAL_READY_MS, dialogCounts: () => ({ opens, saves, csvExports }) })
    : symmetryNestedSelected
    ? require('./desktop-assembly-symmetry-nested-selected-flow.cjs')({ expected, input, files: nestedRepairFiles,
      updatedPart: symmetryNestedUpdatedPart, replacementPart: symmetryNestedReplacementPart,
      evaluate, observe, waitFor, click, capture, checks, protocolResponses, consoleErrors, failedRequests, check, canonical, digest,
      initialReadyMs: INITIAL_READY_MS, dialogCounts: () => ({ opens, saves, csvExports }) })
    : symmetryNestedSource
    ? require('./desktop-assembly-symmetry-nested-source-flow.cjs')({ expected, input, files: nestedRepairFiles,
      updatedPart: symmetryNestedUpdatedPart, replacementPart: symmetryNestedReplacementPart,
      evaluate, observe, waitFor, click, capture, checks, protocolResponses, consoleErrors, failedRequests, check, canonical, digest,
      initialReadyMs: INITIAL_READY_MS, dialogCounts: () => ({ opens, saves, csvExports }) })
    : symmetryPicking
    ? require('./desktop-assembly-symmetry-picking-flow.cjs')({ expected, input, output, evaluate, observe, waitFor, click, capture, pointer,
      checks, protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest,
      initialReadyMs: INITIAL_READY_MS, dialogCounts: () => ({ opens, saves, csvExports }) })
    : symmetryRepair
    ? require('./desktop-assembly-symmetry-repair-flow.cjs')({ expected, input, output, repairFiles,
      updatedPart: symmetryRepairUpdatedPart, replacementPart: symmetryRepairReplacementPart,
      evaluate, observe, waitFor, click, capture, checks, protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest,
      initialReadyMs: INITIAL_READY_MS, dialogCounts: () => ({ opens, saves, csvExports }) })
    : hingeLimitsPicking
    ? require('./desktop-assembly-hinge-limits-picking-flow.cjs')({ expected, input, output, evaluate, observe, waitFor, click, capture, pointer,
      checks, protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest, initialReadyMs: INITIAL_READY_MS, dialogCounts: () => ({ opens, saves, csvExports }) })
    : hingePicking
    ? require('./desktop-assembly-hinge-picking-flow.cjs')({ expected, input, output, evaluate, observe, waitFor, click, capture, pointer,
      checks, protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest,
      initialReadyMs: INITIAL_READY_MS, dialogCounts: () => ({ opens, saves, csvExports }) })
    : hingeRepair
    ? require(hingeLimitsRepair ? './desktop-assembly-hinge-limits-repair-flow.cjs' : './desktop-assembly-hinge-repair-flow.cjs')({ expected, input, repairFiles: hingeRepairFiles,
      updatedPart: hingeRepairUpdatedPart, replacementPart: hingeRepairReplacementPart,
      evaluate, observe, waitFor, click, capture, checks, protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest,
      initialReadyMs: INITIAL_READY_MS, dialogCounts: () => ({ opens, saves, csvExports }) })
    : hingeLimits
    ? require('./desktop-assembly-hinge-limits-flow.cjs')({ expected, input, output, evaluate, observe, waitFor, click, capture, checks, protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest, initialReadyMs: INITIAL_READY_MS, dialogCounts: () => ({ opens, saves, csvExports }) })
    : hinge
    ? require('./desktop-assembly-hinge-flow.cjs')({ expected, input, output, evaluate, observe, waitFor, click, capture, checks, protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest, initialReadyMs: INITIAL_READY_MS, dialogCounts: () => ({ opens, saves, csvExports }) })
    : circularPath
    ? require('./desktop-assembly-circular-path-flow.cjs')({ expected, input, output, evaluate, observe, waitFor, click, capture, checks, protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest, initialReadyMs: INITIAL_READY_MS, dialogCounts: () => ({ opens, saves, csvExports }) })
    : linePath
    ? require('./desktop-assembly-line-path-flow.cjs')({ expected, input, output, evaluate, observe, waitFor, click, capture, checks, protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest, initialReadyMs: INITIAL_READY_MS, dialogCounts: () => ({ opens, saves, csvExports }) })
    : profileCenter
    ? require('./desktop-assembly-profile-center-flow.cjs')({ expected, input, output, evaluate, observe, waitFor, click, capture, checks, protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest, initialReadyMs: INITIAL_READY_MS, dialogCounts: () => ({ opens, saves, csvExports }) })
    : symmetry
    ? require('./desktop-assembly-symmetry-flow.cjs')({ expected, input, output, evaluate, observe, waitFor, click, capture, pointer, checks, protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest, initialReadyMs: INITIAL_READY_MS, dialogCounts: () => ({ opens, saves, csvExports }) })
    : width
    ? require('./desktop-assembly-width-flow.cjs')({ expected, input, output, evaluate, observe, waitFor, click, capture, pointer, checks, protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest, initialReadyMs: INITIAL_READY_MS, dialogCounts: () => ({ opens, saves, csvExports }) })
    : directedAngle
    ? async () => {
      const context = { expected, input, output, evaluate, observe, waitFor, click, capture, pointer, checks,
        protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest,
        initialReadyMs: INITIAL_READY_MS, dialogCounts: () => ({ opens, saves, csvExports }) };
      await require('./desktop-assembly-directed-angle-flow.cjs')({ ...context, captureAtEnd: false })();
      await require('./desktop-assembly-directed-guide-flow.cjs')({ ...context, files: directedGuideFiles });
    }
    : angleMeasurement
    ? require('./desktop-assembly-angle-measurement-flow.cjs')({ expected, input, output,
      evaluate, observe, waitFor, click, capture, checks, protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest,
      initialReadyMs: INITIAL_READY_MS, dialogCounts: () => ({ opens, saves, csvExports }) })
    : replacement
    ? require('./desktop-assembly-replacement-flow.cjs')({ expected, input, output, replacementFiles, replacementPart,
      evaluate, observe, waitFor, click, capture, checks, protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest,
      initialReadyMs: INITIAL_READY_MS, dialogCounts: () => ({ opens, saves, csvExports }) })
    : limitAngle
    ? require('./desktop-assembly-limit-angle-flow.cjs')({ expected, input, output,
      evaluate, observe, waitFor, click, capture, pointer, checks, protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest,
      initialReadyMs: INITIAL_READY_MS, dialogCounts: () => ({ opens, saves, csvExports }) })
    : limitDistance
    ? require('./desktop-assembly-limit-distance-flow.cjs')({ expected, input, output,
      evaluate, observe, waitFor, click, capture, pointer, wheel, checks, protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest, compactViewport: limitDistanceCompact,
      initialReadyMs: INITIAL_READY_MS, dialogCounts: () => ({ opens, saves, csvExports }) })
    : sphereTangent
    ? require('./desktop-assembly-sphere-tangent-flow.cjs')({ expected, input, output, sphereTangentFixtures, sphereTangentInputs, sphereTangentOutputs,
      evaluate, observe, waitFor, click, capture, pointer, checks, protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest,
      initialReadyMs: INITIAL_READY_MS, dialogCounts: () => ({ opens, saves, csvExports }) })
    : cylinderTangent
    ? require('./desktop-assembly-cylinder-tangent-flow.cjs')({ expected, input, output, cylinderTangentFixtures, cylinderTangentInputs, cylinderTangentOutputs,
      evaluate, observe, waitFor, click, capture, pointer, checks, protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest,
      initialReadyMs: INITIAL_READY_MS, dialogCounts: () => ({ opens, saves, csvExports }) })
    : tangent
    ? require('./desktop-assembly-tangent-flow.cjs')({ expected, input, output, evaluate, observe, waitFor, click, capture, pointer,
      checks, protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest,
      initialReadyMs: INITIAL_READY_MS, dialogCounts: () => ({ opens, saves, csvExports }) })
    : direction
    ? require('./desktop-assembly-direction-flow.cjs')({ expected, input, output, evaluate, observe, waitFor, click, capture, pointer,
      checks, protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest,
      initialReadyMs: INITIAL_READY_MS, dialogCounts: () => ({ opens, saves, csvExports }) })
    : assemblyExport
    ? require('./desktop-assembly-export-flow.cjs')({ expected, input, output, assemblyExportOutputs, evaluate, observe, waitFor, click, capture,
      checks, protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest,
      initialReadyMs: INITIAL_READY_MS, dialogCounts: () => ({ opens, saves, csvExports, geometryExports }) })
    : rackPinion
    ? require('./desktop-assembly-rack-pinion-flow.cjs')({ expected, input, output, evaluate, observe, waitFor, click, capture, pointer,
      checks, protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest,
      initialReadyMs: INITIAL_READY_MS, dialogCounts: () => ({ opens, saves, csvExports }) })
    : screw
    ? require('./desktop-assembly-screw-flow.cjs')({ expected, input, output, evaluate, observe, waitFor, click, capture,
      checks, protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest,
      initialReadyMs: INITIAL_READY_MS, dialogCounts: () => ({ opens, saves, csvExports }) })
    : assemblyImport
    ? require('./desktop-assembly-import-flow.cjs')({ expected, input, output, baselinePath: importBaselinePath, sourcePath: importSourcePath, rejectedPath: importRejectedPath, source: importSource, evaluate, observe, waitFor, click, capture,
      checks, protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest,
      initialReadyMs: INITIAL_READY_MS, dialogCounts: () => ({ opens, saves, csvExports }) })
    : assemblySourceUpdate
    ? require('./desktop-assembly-source-update-flow.cjs')({ expected, input, output, files: documentUpdateFiles,
      evaluate, observe, waitFor, click, checks, ipc, consoleErrors, failedRequests, check, canonical, digest, completePendingSave,
      initialReadyMs: INITIAL_READY_MS, dialogCounts: () => ({ opens, saves, csvExports }) })
    : interferenceGroupingScope
    ? require('./desktop-assembly-interference-grouping-scope-flow.cjs')({ expected, input, evaluate, observe, waitFor, click, capture,
      checks, protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest,
      initialReadyMs: INITIAL_READY_MS, dialogCounts: () => ({ opens, saves, csvExports }) })
    : interferenceGroupingMultibody
    ? require('./desktop-assembly-interference-grouping-multibody-flow.cjs')({ expected, input, evaluate, observe, waitFor, click, capture,
      checks, protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest,
      initialReadyMs: INITIAL_READY_MS, dialogCounts: () => ({ opens, saves, csvExports }) })
    : interferenceGrouping
    ? require('./desktop-assembly-interference-grouping-flow.cjs')({ expected, input, evaluate, observe, waitFor, click, capture,
      checks, protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest,
      initialReadyMs: INITIAL_READY_MS, dialogCounts: () => ({ opens, saves, csvExports }) })
    : interferenceMultibody
    ? require('./desktop-assembly-interference-multibody-flow.cjs')({ expected, input, evaluate, observe, waitFor, click, capture,
      checks, protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest,
      initialReadyMs: INITIAL_READY_MS, dialogCounts: () => ({ opens, saves, csvExports }) })
    : assembly
    ? require('./desktop-assembly-flow.cjs')({ expected, input, output, projectionOutput, partUpdatePath, updatedPart, interferencePath, interferenceFixture, translationPath, translationFixture, translationOutput, bomPath, bomFixture, bomCsvOutputs, gearOutput, evaluate, observe, waitFor, click, capture, pointer,
      checks, protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest,
      initialReadyMs: INITIAL_READY_MS, dialogCounts: () => ({ opens, saves, csvExports }) })
    : untilNext
    ? require('./desktop-pattern-until-next-flow.cjs')({ fixtures, outputs, inputPaths, evaluate, observe, waitFor, click, menu,
      checks, protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest,
      initialReadyMs: INITIAL_READY_MS, dialogCounts: () => ({ opens, saves }) })
    : activeScenario === SCENARIOS['world-limit']
    ? require('./desktop-pattern-world-limit-flow.cjs')({ expected, expectedIds, evaluate, observe, waitFor, click, menu, checks,
      protocolResponses, consoleErrors, failedRequests, ipc, input, output, check, canonical, digest,
      initialReadyMs: INITIAL_READY_MS, dialogCounts: () => ({ opens, saves }) }) : workflow;
  check(typeof actualWorkflow === 'function', 'Expected the statically selected test workflow.');
  class HiddenWindow extends electron.BrowserWindow {
    constructor(options) {
      super({ ...options, ...(limitDistanceCompact ? { width: 1040, height: 700 } : {}), show: false }); check(!window, 'Unexpected second test application window.'); window = this;
      if (limitDistanceCompact) {
        check(options.minWidth === 1040 && options.minHeight === 700, 'Compact scenario must use the unchanged production minimum window size.');
        checks.push({ compactViewport: { requestedWindow: { width: 1040, height: 700 }, actualBounds: this.getBounds(), actualContentSize: this.getContentSize() } });
      }
      const preferences = this.webContents.getLastWebPreferences();
      check(preferences.contextIsolation && !preferences.nodeIntegration && preferences.sandbox && preferences.webSecurity && !preferences.webviewTag,
        'The actual production security preferences changed.');
      // Electron44 SaveLastPreferences omits the preload path. Check the exact
      // original constructor security input, unchanged security options and empty session
      // preload registry; the workflow separately requires the real bridge/IPC.
      const originalPreload = options?.webPreferences?.preload;
      check(typeof originalPreload === 'string' && path.isAbsolute(originalPreload)
        && path.resolve(originalPreload) === path.join(root, 'electron/preload.cjs'), 'The real production preload constructor path was replaced.');
      check(this.webContents.session.getPreloadScripts().length === 0, 'Unexpected additional session preload scripts.');
      this.webContents.on('preload-error', (_event, _preloadPath, error) =>
        finish(new Error('The actual production preload failed.', { cause: error })));
      checks.push({ productionSecurity: { contextIsolation: preferences.contextIsolation, nodeIntegration: preferences.nodeIntegration,
        sandbox: preferences.sandbox, webSecurity: preferences.webSecurity, webviewTag: preferences.webviewTag, originalPreload: true } });
      this.webContents.on('console-message', details => { if (details.level === 'error' || details.level === 3) consoleErrors.push(details.message); });
      this.webContents.on('render-process-gone', (_event, details) => finish(new Error('Renderer stopped: ' + details.reason)));
      this.webContents.on('did-fail-load', (_event, code, detail) => finish(new Error(`Renderer load failed: ${code} ${detail}`)));
      this.instrumentation = null;
    }
    show() { check(!this.isVisible(), 'The isolated test window became visible.'); }
    async loadURL(...args) {
      check(!this.instrumentation, 'Unexpected second production navigation in the test.');
      this.instrumentation = (async () => {
        // Initialize this test-owned target before awaiting renderer CDP calls.
        // The original preload also runs on this blank bootstrap; no app bundle,
        // worker or file IPC is supplied or invoked by this page.
        await super.loadURL('about:blank');
        this.webContents.debugger.attach('1.3');
        await this.webContents.debugger.sendCommand('Page.enable');
        await this.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: '(' + installWorkerObserver.toString() + ')(' + (importedBodies || freshSketch ? 'true' : 'false') + ',' + (structuralStep ? 'true' : 'false') + ',' + (structuralInsertion ? 'true' : 'false') + ',' + (configurations ? 'true' : 'false') + ');' });
        checks.push('test-owned blank target initialized before CDP observation');
      })();
      await this.instrumentation;
      this.webContents.once('did-finish-load', () => { actualWorkflow().then(() => finish(), finish); });
      return super.loadURL(...args);
    }
  }
  const testingProtocol = new Proxy(electron.protocol, { get(target, member) {
    if (member === 'handle') return (scheme, handler) => target.handle(scheme, async request => {
      const response = await handler(request); protocolResponses.push({ url: request.url, status: response.status });
      if (response.status >= 400) failedRequests.push({ url: request.url, status: response.status }); return response;
    });
    const value = Reflect.get(target, member); return typeof value === 'function' ? value.bind(target) : value;
  } });
  const testingIpc = new Proxy(electron.ipcMain, { get(target, member) {
    if (member === 'handle') return (channel, handler) => target.handle(channel, async (event, payload) => {
      const observation = { channel, completed: false }; ipc.push(observation);
      if (channel === 'document:export' && payload?.format === 'csv') {
        check(payload.data instanceof Uint8Array, 'CSV export must use actual byte transport.');
        observation.csv = { name: payload.name, bytes: payload.data.byteLength,
          sha256: digest(Buffer.from(payload.data.buffer, payload.data.byteOffset, payload.data.byteLength)) };
      }
      if ((assemblyExport || structuralStep || structuralInsertion) && channel === 'document:export' && ['step', 'stl'].includes(payload?.format)) {
        check(payload.data instanceof Uint8Array, 'Geometry export must use actual byte transport.');
        observation.geometry = { name: payload.name, format: payload.format, bytes: payload.data.byteLength,
          sha256: digest(Buffer.from(payload.data.buffer, payload.data.byteOffset, payload.data.byteLength)) };
      }
      if ((sourceRevision || configurations || assemblySourceUpdate) && channel === 'document:save') observation.documentWrite = { name: payload?.name, hasPath: typeof payload?.filePath === 'string', ...(configurations || assemblySourceUpdate ? { filePath: payload?.filePath } : {}), sha256: typeof payload?.content === 'string' ? digest(payload.content) : null };
      const selectedSave = saveCompletion.enabled && channel === 'document:save'
        && ipc.filter(row => row.channel === 'document:save').length === saveCompletion.ordinal;
      if (selectedSave) {
        check(!saveCompletion.armed, 'Only one fixed native Save completion may be withheld.');
        saveCompletion.armed = true; saveCompletion.observation = observation; observation.ipcReturnReleased = false;
        saveCompletion.nativeReady = new Promise(resolve => { saveCompletion.ready = resolve; });
      }
      let result;
      try { result = await handler(event, payload); observation.completed = true; }
      catch (error) { if (configurations && observation.csv) observation.failed = true; if (selectedSave) saveCompletion.ready(); throw error; }
      if ((sourceRevision || configurations || assemblySourceUpdate) && channel === 'document:save') observation.documentWrite.chosen = result !== null;
      if (selectedSave) {
        try {
          check(typeof result === 'string' && under(owned, result) && savePaths.includes(result), 'Selected Save must return its actual test-owned granted path.');
          const written = await fsp.readFile(result);
          check(digest(written) === observation.documentWrite.sha256, 'Selected native Save bytes must match its actual request.');
          observation.actualWrite = { name: path.basename(result), bytes: written.length, sha256: digest(written) };
          saveCompletion.pending = true;
          const held = new Promise(resolve => { saveCompletion.release = resolve; });
          saveCompletion.ready(); await held; observation.ipcReturnReleased = true;
        } catch (error) { saveCompletion.ready(); throw error; }
      }
      if ((linkedSource || sourceRevision) && ['source:choose', 'source:read'].includes(channel) && result) observation.source = { name: result.name, sha256: result.sha256, hasGrant: typeof result.grantId === 'string', noPath: !Object.hasOwn(result, 'path') };
      return result;
    });
    const value = Reflect.get(target, member); return typeof value === 'function' ? value.bind(target) : value;
  } });
  const testingDialog = new Proxy(electron.dialog, { get(target, member) {
    if (member === 'showOpenDialog') return async (_window, options) => {
      if ((structuralStep || structuralInsertion) && options.title === 'Importar sólido STEP') {
        check(++stepImports <= stepImportPaths.length && options.properties?.length === 1 && options.properties[0] === 'openFile'
          && options.filters?.length === 1 && options.filters[0].name === 'Sólido STEP' && options.filters[0].extensions?.join(',') === 'step,stp', 'Exact existing read-only STEP picker policy.');
        const file = stepImportPaths[stepImports - 1]; return file === null ? { canceled: true, filePaths: [] } : { canceled: false, filePaths: [file] };
      }
      if ((linkedSource || sourceRevision) && options.title === 'Elegir fuente enlazada de SolidFlow') {
        check(++sourceOpens <= sourceChoosePaths.length && options.properties?.length === 1 && options.properties[0] === 'openFile'
          && options.filters?.length === 1 && options.filters[0].extensions?.length === 1 && options.filters[0].extensions[0] === 'solidflow', 'Exact linked-source read-only picker policy');
        return { canceled: false, filePaths: [sourceChoosePaths[sourceOpens - 1]] };
      }
      check(options.title === 'Abrir documento de SolidFlow' && ++opens <= openPaths.length, 'Unexpected native open dialog request.');
      if (configuredComponents && openPaths[opens - 1] === null) return { canceled: true, filePaths: [] };
      return { canceled: false, filePaths: [openPaths[opens - 1]] };
    };
    if (member === 'showSaveDialog') return async (_window, options) => {
      if ((structuralStep || structuralInsertion) && options.title === 'Exportar geometría') {
        check(++geometryExports <= structuredExportPaths.length && options.filters?.length === 1 && options.filters[0].name === 'STEP'
          && options.filters[0].extensions?.length === 1 && options.filters[0].extensions[0] === 'step'
          && path.basename(options.defaultPath) === (structuralInsertion && geometryExports === 2 ? 'Original structural insertion parent.step' : 'Conjunto _Árbol_ Ω.step'), 'Exact structured STEP export uses the existing plain STEP file bridge and literal sanitized original name.');
        return !structuralInsertion && geometryExports === 1 ? { canceled: true } : { canceled: false, filePath: structuredExportPaths[geometryExports - 1] };
      }
      if (assemblyExport && options.title === 'Exportar geometría') {
        check(++geometryExports <= assemblyExportFormats.length && options.filters?.length === 1
          && options.filters[0].extensions?.length === 1 && options.filters[0].extensions[0] === assemblyExportFormats[geometryExports - 1]
          && options.filters[0].name === assemblyExportFormats[geometryExports - 1].toUpperCase()
          && path.basename(options.defaultPath) === expected.name + '.' + assemblyExportFormats[geometryExports - 1],
          'Unexpected flat geometry export native-dialog policy.');
        return geometryExports === 1 ? { canceled: true } : { canceled: false, filePath: assemblyExportOutputs[geometryExports - 1] };
      }
      if ((assembly || configurations) && options.title === 'Exportar lista de materiales') {
        check(++csvExports <= 4 && options.filters?.length === 1 && options.filters[0].extensions?.length === 1
          && options.filters[0].extensions[0] === 'csv', 'Unexpected CSV export native-dialog policy.');
        if (configurations) {
          check(path.basename(options.defaultPath) === 'Original configured prisms-materiales-configurados.csv', 'Exact configured CSV default name.');
          if (csvExports === 3) {
            await new Promise(resolve => { configuredCsvBarrier.release = resolve; configuredCsvBarrier.pending = true; });
            configuredCsvBarrier.pending = false;
          }
          return csvExports === 1 ? { canceled: true } : { canceled: false, filePath: configuredBomCsvOutputs[csvExports - 2] };
        }
        return csvExports === 1 ? { canceled: true } : { canceled: false, filePath: bomCsvOutputs[csvExports - 2] };
      }
      if (structuralStep || structuralInsertion) check(path.basename(options.defaultPath) === (structuralInsertion ? 'Original structural insertion parent.solidflow' : 'Conjunto _Árbol_ Ω.solidflow'), 'Structural Save As uses the literal sanitized original name.');
      check(options.title === (configurations ? 'Guardar ensamblaje configurado' : originAxes || structuralInsertion || structuralStep || assembly || assemblyImport || assemblySourceUpdate || linkedSource || sourceRevision || screw || rackPinion || assemblyExport || direction || angleMeasurement || directedAngle || tangent || cylinderTangent || sphereTangent || limitDistance || limitAngle || width || linePath || circularPath || hinge || hingeLimits || hingePicking || hingeLimitsPicking || hingeRepair || profileCenter || symmetry || symmetryRepair || symmetrySurfaceRepair || symmetryPicking || symmetryNestedRepair || replacement ? 'Guardar ensamblaje' : 'Guardar pieza') && ++saves <= savePaths.length, 'Unexpected native save/export dialog request.');
      if ((sourceRevision || configurations) && savePaths[saves - 1] === null) return { canceled: true };
      return { canceled: false, filePath: savePaths[saves - 1] };
    };
    if (member === 'showErrorBox') return (title, message) => finish(new Error(title + ': ' + message));
    const value = Reflect.get(target, member); return typeof value === 'function' ? () => fail('Unexpected native dialog method: ' + String(member)) : value;
  } });
  const testingElectron = new Proxy(electron, { get(target, member) {
    if (member === 'BrowserWindow') return HiddenWindow;
    if (member === 'dialog') return testingDialog;
    if (member === 'protocol') return testingProtocol;
    if (member === 'ipcMain') return testingIpc;
    return Reflect.get(target, member);
  } });
  const Module = require('node:module'), load = Module._load, main = path.join(root, 'electron/main.cjs');
  app.whenReady().then(() => {
    electron.session.defaultSession.webRequest.onErrorOccurred({ urls: ['solidflow://*/*'] }, details => {
      failedRequests.push({ url: details.url, error: details.error });
    });
  });
  Module._load = function(request, parent, ...rest) {
    return request === 'electron' && parent?.filename === main ? testingElectron : Reflect.apply(load, this, [request, parent, ...rest]);
  };
  try { require(main); } finally { Module._load = load; }
}
function runScenario(name) {
  check(!started && typeof name === 'string' && Object.hasOwn(SCENARIOS, name), 'Expected one statically allowlisted test scenario.');
  started = true; activeScenario = SCENARIOS[name];
  if (process.versions.electron) return runInElectron().catch(error => { emitDesktopCiFailure(error); console.error(error); process.exitCode = 1; require('electron').app.quit(); });
  return launch().catch(error => { emitDesktopCiFailure(error); console.error(error); process.exitCode = error?.launcherExitCode ?? error?.cause?.launcherExitCode ?? 1; });
}
module.exports = Object.freeze({ runScenario });
