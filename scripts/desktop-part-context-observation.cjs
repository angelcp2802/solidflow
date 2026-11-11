'use strict';

const { randomUUID } = require('node:crypto');

// Test-owned, original right-drag case only. No application/preload API is added.
module.exports = async function observePartContextDrag({ page, pointer, checks, records, check }, point) {
  const key = '__solidflowPartContextObservation_' + randomUUID().replaceAll('-', '');
  const popup = '.part-feature-context-menu[role="menu"]';
  const report = { phase: 'right-context-drag', schema: 1, status: 'RUNNING', outbound: [],
    observation: null, oracle: null, observerErrors: [],
    limits: '64 renderer records; 512 characters per face reference. Capture listeners precede application handlers; mutation records are batched. Outbound arguments are calls to the unchanged pointer adapter, not intercepted CDP messages.' };
  // Retain this owner before any observation/input can fail. The final workflow
  // also includes records, but failure reports already retain checks.
  checks.push({ partContextDragObservation: report }); records.push(report);
  function observationError(phase, error) {
    let message = 'Unreadable observation error';
    try { message = String(error?.message ?? error).slice(0, 240); } catch {}
    if (report.observerErrors.length < 4) report.observerErrors.push({ phase, message });
  }
  let attempted = false, primary, failed = false, incomplete = false;
  try {
    try {
      attempted = true;
      report.before = await page((key, popup) => {
        if (Object.hasOwn(window, key)) throw Error('Context observation owner already exists');
        const hosts = document.querySelectorAll('.viewport-canvas');
        // The separate orientation triad is also a canvas, with role="img".
        if (hosts.length !== 1 || hosts[0].querySelectorAll('canvas:not([role="img"])').length !== 1) throw Error('One original part viewport required');
        const host = hosts[0], entries = [], registered = [], origin = performance.now();
        const eventTypes = ['pointerdown', 'pointermove', 'pointerup', 'contextmenu', 'pointercancel', 'pointerleave', 'mousedown', 'mouseup'];
        const tags = ['CANVAS', 'DIV', 'BUTTON', 'BODY', 'HTML', 'SVG', 'SPAN'];
        const classes = ['viewport-canvas', 'part-feature-context-menu', 'part-feature-context-heading', 'part-feature-context-icon'];
        let dropped = 0, faults = 0, observer, stopped = false, cleaned = false;
        const time = () => { try { return performance.now() - origin; } catch { faults++; return null; } };
        const finite = value => Number.isFinite(value) ? value : null;
        const state = () => {
          try {
            const live = document.querySelector('.viewport-canvas'), face = live?.dataset.partSelectedFace;
            return { viewportPresent: !!live, sameViewport: live === host, popupPresent: !!document.querySelector(popup),
              selectedFace: typeof face === 'string' ? face.slice(0, 512) : null,
              selectedFaceLength: typeof face === 'string' ? face.length : null, faceTruncated: typeof face === 'string' && face.length > 512 };
          } catch { faults++; return { stateError: true }; }
        };
        const append = value => {
          if (entries.length < 64) entries.push({ sequence: entries.length + 1, atMs: time(), ...value });
          else dropped = Math.min(1000000, dropped + 1);
        };
        const before = state(); let previous = JSON.stringify(before);
        const changed = () => {
          try {
            const value = state(), serialized = JSON.stringify(value);
            if (serialized !== previous) { previous = serialized; append({ kind: 'state', state: value }); }
          } catch { faults++; }
        };
        const event = value => {
          try {
            const target = value.target instanceof Element ? value.target : null;
            const tag = target?.tagName.toUpperCase(), menu = document.querySelector(popup);
            append({ kind: 'event', type: value.type, eventTimeStamp: finite(value.timeStamp),
              button: finite(value.button), buttons: finite(value.buttons), pointerId: finite(value.pointerId),
              clientX: finite(value.clientX), clientY: finite(value.clientY), isTrusted: value.isTrusted,
              target: { tag: tags.includes(tag) ? tag : 'OTHER', classes: classes.filter(name => target?.classList.contains(name)),
                inViewport: !!target && host.contains(target), inPopup: !!target && !!menu?.contains(target) }, state: state() });
          } catch { faults++; }
        };
        const stop = () => {
          if (!stopped) {
            stopped = true;
            try { changed(); } finally {
              // Attempt each independent cleanup even if another one fails.
              for (const type of registered) { try { document.removeEventListener(type, event, true); } catch { faults++; } }
              try { observer?.disconnect(); } catch { faults++; }
              try {
                if (Object.getOwnPropertyDescriptor(window, key)?.value === stop) cleaned = delete window[key];
                else faults++;
              } catch { faults++; }
            }
          }
          return { before, after: state(), entries, dropped, faults, cleaned, stopped };
        };
        try {
          Object.defineProperty(stop, 'owner', { value: key });
          Object.defineProperty(window, key, { value: stop, configurable: true });
          for (const type of eventTypes) { document.addEventListener(type, event, { capture: true, passive: true }); registered.push(type); }
          observer = new MutationObserver(changed);
          observer.observe(host, { attributes: true, attributeFilter: ['data-part-selected-face'] });
          // The shared popup is portaled directly into body. No subtree/text observation.
          observer.observe(document.body, { childList: true });
          return before;
        } catch (error) { stop(); throw error; }
      }, key, popup);
    } catch (error) { observationError('install', error); }

    const send = async (...args) => {
      const row = { sequence: report.outbound.length + 1,
        arguments: args.map(value => typeof value === 'object' ? { x: value.x, y: value.y } : value), status: 'PENDING' };
      report.outbound.push(row);
      try { await pointer(...args); row.status = 'ACKNOWLEDGED'; }
      catch (error) { row.status = 'FAILED'; throw error; }
    };
    // Exactly the original four calls, without observation evaluations or waits between them.
    await send('mouseMoved', point); await send('mousePressed', point, 2);
    const end = { x: point.x + 12, y: point.y };
    await send('mouseMoved', end, 2); await send('mouseReleased', end, 2);
    report.oracle = await page(selector => {
      // Preserve the existing predicate at the same post-release evaluation.
      const accepted = !document.querySelector(selector) && document.querySelector('.viewport-canvas').dataset.partSelectedFace === '';
      try {
        const face = document.querySelector('.viewport-canvas')?.dataset.partSelectedFace;
        return { accepted, popupPresent: !!document.querySelector(selector),
          selectedFace: typeof face === 'string' ? face.slice(0, 512) : null,
          selectedFaceLength: typeof face === 'string' ? face.length : null, faceTruncated: typeof face === 'string' && face.length > 512 };
      } catch { return { accepted, detailError: true }; }
    }, popup);
  } catch (error) { primary = error; failed = true; }
  finally {
    if (attempted) {
      try {
        report.observation = await page(key => {
          const owner = Object.getOwnPropertyDescriptor(window, key)?.value;
          if (typeof owner !== 'function' || owner.owner !== key) throw Error('Context observation owner missing or replaced');
          return owner();
        }, key);
      } catch (error) { observationError('cleanup', error); }
    }
    incomplete = !!(report.observerErrors.length || report.oracle?.detailError || !report.observation?.cleaned
      || report.observation.faults || report.observation.dropped);
    report.status = failed ? 'INPUT_OR_ORACLE_ERROR' : !report.oracle?.accepted ? 'REJECTED' : incomplete ? 'OBSERVATION_ERROR' : 'PASS';
  }
  if (failed) throw primary;
  // The original failure wins over any diagnostic failure; its report is already retained.
  check(report.oracle.accepted, 'A right drag neither opens a context nor selects its release target');
  if (incomplete) throw Error('Part context observation incomplete; see retained diagnostic');
  return report;
};
