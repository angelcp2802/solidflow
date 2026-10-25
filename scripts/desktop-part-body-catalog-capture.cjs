'use strict';
const fsp = require('node:fs/promises');
const path = require('node:path');
const { encodeJavaScriptString: quote } = require('./desktop-ui-source.cjs');

// Bounded visual evidence only; no geometry, input or application-state authority.
module.exports = ({ getWindow, evaluate, check, owned, digest, captures, STEP_MS, expected }) => async phase => {
  if (process.env.SOLIDFLOW_UI_CAPTURE !== '1') return;
  const window = getWindow();
  const phases = ['initial', 'details', 'final'];
  check(phase === phases[captures.length] && !window.isVisible(), 'Only three ordered hidden catalog captures allowed');
  const confirmed = () => evaluate(`(() => {
    const t=document.querySelector('.document-title')?.textContent ?? '';
    const details=document.querySelector('.body-catalog-entry details');
    return !document.querySelector('.property-manager') && t.includes(${quote(expected.name)}) && !t.includes('*')
      && document.querySelector('.statusbar')?.textContent.includes('Listo')
      && document.querySelector('.tree-document')?.getAttribute('aria-expanded')==='true'
      && document.querySelector('.part-body-catalog-toggle')?.getAttribute('aria-expanded')==='true'
      && !!details && details.open===${phase === 'details'};
  })()`);
  check(await confirmed(), 'Catalog capture requires its exact current browsing phase');
  await evaluate(`new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Catalog visual frame deadline')),${STEP_MS});
    requestAnimationFrame(()=>requestAnimationFrame(()=>{clearTimeout(timer);resolve();}));
  })`);
  let timer;
  try {
    await new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Catalog visual presentation deadline')), STEP_MS);
      window.webContents.beginFrameSubscription(false, resolve); window.webContents.invalidate();
    });
  } finally { clearTimeout(timer); if (!window.webContents.isDestroyed()) window.webContents.endFrameSubscription(); }
  check(await confirmed(), 'Catalog phase unchanged after presentation');
  const image = await window.webContents.capturePage(undefined, { stayHidden: true }), bytes = image.toPNG(), size = image.getSize();
  check(!image.isEmpty() && bytes.length <= 10 * 1024 * 1024 && !window.isVisible() && await confirmed(), 'Valid hidden unchanged catalog capture');
  const name = 'part-body-catalog-' + phase + '.png';
  await fsp.writeFile(path.join(owned, name), bytes, { flag: 'wx' });
  captures.push({ name, bytes: bytes.length, sha256: digest(bytes), width: size.width, height: size.height, phase,
    confirmedDocumentId: expected.id, presentationObserved: true });
};
