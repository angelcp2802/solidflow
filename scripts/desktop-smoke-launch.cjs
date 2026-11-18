// Node-side launch/cleanup only. Tests inject a child and timer; importing this
// module never loads Electron or launches a process.
async function runSmokeLaunch({ spawn, cleanup, setTimer = setTimeout, clearTimer = clearTimeout }) {
  const failures = [];
  let child;
  let timer;
  let closed = false;
  let exited = false;
  let finished = false;

  function captureExit(code, signal) {
    if (code === 0 && !signal) return;
    const error = new Error(signal
      ? `Electron terminó por la señal ${signal} (código ${code ?? 'null'}).`
      : `Electron terminó con código ${code ?? 'desconocido'}.`);
    error.exitCode = code;
    error.signal = signal;
    failures.push(error);
  }

  try {
    await new Promise(resolve => {
      function finish() {
        if (finished) return;
        finished = true;
        resolve();
      }
      function onError(error) {
        if (!finished) failures.push(error);
      }
      function onExit(code, signal) {
        exited = true;
        if (!finished && !failures.length) captureExit(code, signal);
      }
      function onClose(code, signal) {
        closed = true;
        child.removeListener('error', onError);
        child.removeListener('exit', onExit);
        if (!finished) {
          if (!exited && !failures.length) captureExit(code, signal);
          finish();
        }
      }

      try { child = spawn(); }
      catch (error) { failures.push(error); finish(); return; }
      child.on('error', onError);
      child.once('exit', onExit);
      child.once('close', onClose);
      timer = setTimer(() => {
        if (finished) return;
        // Capture the deadline before kill: even a synchronous close from a
        // child double (or a subsequent real close) cannot turn it into PASS.
        failures.push(new Error('Electron no terminó en 45 segundos.'));
        if (!closed && !exited) {
          try {
            if (child.kill() === false) failures.push(new Error('No se pudo enviar la señal de cierre a Electron.'));
          } catch (error) { failures.push(error); }
        }
        finish();
      }, 45_000);
    });
  } catch (error) {
    failures.push(error);
  } finally {
    clearTimer(timer);
  }

  if (child && !closed) {
    // A kill request does not establish close, nor does close establish that
    // every Chromium descendant has released its files. Never race rm against
    // an unconfirmed child close or wait indefinitely for that event.
    const error = new Error('No se observó el cierre de Electron; se conserva el directorio temporal aislado.');
    error.code = 'SMOKE_CLOSE_UNCONFIRMED';
    failures.push(error);
    // This releases the ChildProcess handle's hold on Node, not its descendants
    // or inherited streams. Late close/error events cannot change the outcome.
    try { child.unref(); }
    catch (unrefError) { failures.push(unrefError); }
  } else {
    try { await cleanup(); }
    catch (error) { failures.push(error); }
  }

  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) {
    const error = new AggregateError(failures, 'La prueba de Electron falló; se conservan el error original y los errores posteriores.', { cause: failures[0] });
    // Preserve a nonzero child result even when cleanup also failed.
    error.exitCode = failures[0]?.exitCode;
    error.signal = failures[0]?.signal;
    throw error;
  }
}

function launchFailureExitCode(error) {
  return Number.isInteger(error?.exitCode) && error.exitCode !== 0 ? error.exitCode : 1;
}

module.exports = { runSmokeLaunch, launchFailureExitCode };
