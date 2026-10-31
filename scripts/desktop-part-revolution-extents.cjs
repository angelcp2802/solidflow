'use strict';

// Original radius 0..4 mm, height 10 mm profile. Literal angular extrema below
// are independent of the application's extent resolver and native construction.
module.exports = function revolutionExtents(context) {
  const { page, press, change, built, observe, ready, recovery, originalRecovery, check, canonical, records } = context;
  const angle = 'input[aria-label="Ángulo"]';
  const second = 'input[aria-label="Ángulo de dirección 2"]';
  const direction = 'input[aria-label="Dirección 2"]';
  const reverse = 'input[aria-label="Invertir dirección"]';
  const mode = 'select[aria-label="Condición final de revolución"]';
  const full = { min: [-4, -5, -4], max: [4, 5, 4] };
  const last = row => row.features.at(-1);
  const authored = (row, first, secondAngle, reversed) => last(row).type === 'revolve'
    && last(row).angle === first && last(row).extent?.kind === 'two-directions'
    && last(row).extent.secondAngle === secondAngle && !!last(row).reversed === reversed;
  async function staged() {
    let serial = (await observe()).serial;
    await change(angle, 60);
    await built(serial, row => last(row).angle === 60 && last(row).reversed === true && !last(row).extent,
      80 * Math.PI / 3, { min: [0, -5, 0], max: [4, 5, 2 * Math.sqrt(3)] }, 'extent-reversed-sixty');
    await ready();
    serial = (await observe()).serial;
    await press(direction); await change(second, 0);
    await built(serial, row => authored(row, 60, 0, true), 80 * Math.PI / 3,
      { min: [0, -5, 0], max: [4, 5, 2 * Math.sqrt(3)] }, 'extent-zero-second-side');
    await ready();
    serial = (await observe()).serial; await change(second, 30);
    await built(serial, row => authored(row, 60, 30, true), 40 * Math.PI,
      { min: [0, -5, -2], max: [4, 5, 2 * Math.sqrt(3)] }, 'extent-asymmetric-reversed');
    await ready();
    serial = (await observe()).serial; await press(reverse);
    await built(serial, row => authored(row, 60, 30, false), 40 * Math.PI,
      { min: [0, -5, -2 * Math.sqrt(3)], max: [4, 5, 2] }, 'extent-asymmetric-forward');
    await ready();
    serial = (await observe()).serial; await change(mode, 'mid-plane'); await change(angle, 90);
    await built(serial, row => last(row).extent?.kind === 'mid-plane' && last(row).angle === 90,
      40 * Math.PI, { min: [0, -5, -2 * Math.sqrt(2)], max: [4, 5, 2 * Math.sqrt(2)] }, 'extent-mid-plane-total-ninety');
    await ready();
    check(await page((reverse, direction) => document.querySelector(reverse)?.disabled === true
      && !document.querySelector(direction), reverse, direction),
    'Mid-plane has one total-angle field, disables reversal and hides second direction');
    serial = (await observe()).serial; await change(mode, 'angle');
    await built(serial, row => last(row).angle === 90 && !Object.hasOwn(last(row), 'extent') && last(row).reversed === false,
      40 * Math.PI, { min: [0, -5, -4], max: [4, 5, 0] }, 'extent-return-to-single');
    await ready();
    serial = (await observe()).serial; await change(angle, 270); await press(direction); await change(second, 100);
    const invalid = await context.waitFor('over-full revolution is rejected by current native build', async () => {
      const state = await observe();
      check(!state.workerErrors.length, 'Invalid extent does not cause a worker transport error');
      return state.builds.filter(row => row.serial > serial && authored(row, 270, 100, false) && row.response).at(-1);
    });
    check(invalid.response.ok && invalid.response.value.featureErrors.some(error => error.id === last(invalid).id),
      'An explicit total over 360 degrees fails at its authored operation');
    await context.waitFor('invalid extent keeps Apply disabled', () => page(() => document.querySelector('button[title="Aceptar operación"]')?.disabled === true));
    records.push({ phase: 'extent-invalid-total', serial: invalid.serial, errors: invalid.response.value.featureErrors });
    serial = (await observe()).serial; await change(second, 90);
    await built(serial, row => authored(row, 270, 90, false), 160 * Math.PI, full, 'extent-corrected-full-turn');
    await ready();
    check(await recovery() === originalRecovery, 'All extent previews and invalid edits preserve committed recovery exactly');
  }
  async function persistentFull() {
    const serial = (await observe()).serial;
    await change(angle, 270); await press(direction); await change(second, 90);
    const result = await built(serial, row => authored(row, 270, 90, true), 160 * Math.PI, full, 'extent-two-direction-persistent-preview');
    await ready();
    check(await recovery() === originalRecovery, 'Persistent extent draft has not committed before Apply');
    return result;
  }
  async function reopened(feature) {
    const values = await page((mode, direction, second, angle) => ({ mode: document.querySelector(mode)?.value,
      secondEnabled: document.querySelector(direction)?.checked, second: document.querySelector(second)?.value,
      first: document.querySelector(angle)?.value }), mode, direction, second, angle);
    check(canonical(values) === canonical({ mode: 'angle', secondEnabled: true, second: '90', first: '270' })
      && canonical(feature.extent) === canonical({ kind: 'two-directions', secondAngle: 90 }),
    'Saved two-direction controls reopen with both independently authored angles');
  }
  return { staged, persistentFull, reopened };
};
