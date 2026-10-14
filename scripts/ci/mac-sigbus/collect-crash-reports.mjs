// Original bounded parser: raw reports are never returned to the public logger.
import { createHash } from 'node:crypto';
import { copyFileSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { homedir } from 'node:os';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const errorCode = error => typeof error?.code === 'string' && /^[A-Z0-9_]{1,40}$/.test(error.code) ? error.code : 'DIAGNOSTIC_ERROR';
const integer = value => Number.isSafeInteger(value) && value >= 0 ? value : undefined;
const token = value => typeof value === 'string' && /^[A-Za-z0-9_.+, ()-]{1,180}$/.test(value) ? value : undefined;
const uuid = value => typeof value === 'string' && /^[a-fA-F0-9-]{32,36}$/.test(value) ? value : undefined;
export function safeBasename(value) {
  if (typeof value !== 'string') return undefined;
  const name = basename(value.replaceAll('\\', '/'));
  return /^[A-Za-z0-9_.+ -]{1,180}$/.test(name) ? name : '[redacted-basename]';
}
export function safeSymbol(value) {
  if (typeof value !== 'string') return undefined;
  // Never redact pieces of a suspect path: spaces/quotes/Unicode can hide its end.
  // The complete field is hashed whenever it is not a bounded ASCII symbol form.
  const nativeSymbol = /^(?:[A-Za-z_][A-Za-z0-9_.~<>]*(?:::[A-Za-z_][A-Za-z0-9_.~<>]*)*(?:\([A-Za-z0-9_.:~<>,* &\[\]()+-]*\))?|wasm-function\[\d+\])(?: \+ \d+)?$/;
  const sensitiveMarker = /\b(?:TOKEN|SECRET|PASSWORD|AUTHORIZATION|COOKIE|API_KEY)\b/i;
  return value.length <= 600 && nativeSymbol.test(value) && !sensitiveMarker.test(value) ? value
    : '[redacted-symbol-sha256:' + sha256(value) + ']';
}
function parseIps(text) {
  try { return JSON.parse(text); } catch {
    const newline = text.indexOf('\n');
    if (newline < 0) throw new Error('Unsupported crash JSON.');
    return JSON.parse(text.slice(newline + 1));
  }
}
function ipsSummary(value) {
  const images = Array.isArray(value.usedImages) ? value.usedImages : [];
  const allThreads = Array.isArray(value.threads) ? value.threads : [];
  const index = integer(value.faultingThread);
  const selected = allThreads.map((thread, i) => ({ thread, index: i }))
    .sort((a, b) => Number(b.thread.triggered === true || b.index === index) - Number(a.thread.triggered === true || a.index === index));
  let frameBudget = 2048, truncated = selected.length > 128 || images.length > 512;
  const threads = selected.slice(0, 128).map(({ thread, index: threadIndex }) => {
    const source = Array.isArray(thread.frames) ? thread.frames : [];
    const count = Math.min(source.length, 256, frameBudget); frameBudget -= count;
    if (count !== source.length) truncated = true;
    return { index: threadIndex, nativeThreadId: integer(thread.id), crashed: thread.triggered === true || threadIndex === index,
      frames: source.slice(0, count).map(frame => {
        const imageIndex = integer(frame.imageIndex), image = images[imageIndex] ?? {};
        return { image: safeBasename(image.name ?? image.path), imageUUID: uuid(image.uuid),
          imageOffset: integer(frame.imageOffset), symbol: safeSymbol(frame.symbol), symbolOffset: integer(frame.symbolLocation) };
      }) };
  });
  return { format: 'ips', victimPID: integer(value.pid), victim: safeBasename(value.procName),
    exception: { type: token(value.exception?.type), signal: token(value.exception?.signal),
      subtype: token(value.exception?.subtype), codes: token(value.exception?.codes) },
    termination: { namespace: token(value.termination?.namespace), code: integer(value.termination?.code) },
    crashedThreadIndex: index, threads,
    images: images.slice(0, 512).map(image => ({ basename: safeBasename(image.name ?? image.path), uuid: uuid(image.uuid) })), truncated };
}
function textCrashSummary(text) {
  const process = /^Process:\s+(.+?)\s+\[(\d+)\]/m.exec(text);
  const triggered = /^(?:Crashed Thread|Triggered by Thread):\s*(\d+)/m.exec(text);
  const threads = [], images = []; let active, frameBudget = 2048, truncated = false;
  for (const line of text.split(/\r?\n/)) {
    const start = /^Thread (\d+)(?: Crashed)?::?(?:.*)$/.exec(line);
    if (start) {
      active = { index: Number(start[1]), crashed: / Crashed/.test(line) || Number(start[1]) === Number(triggered?.[1]), frames: [] };
      if (threads.length < 128) threads.push(active); else { active = undefined; truncated = true; }
      continue;
    }
    if (!line.trim()) { active = undefined; continue; }
    if (/^(?:Binary Images:|Thread \d+ crashed with|External Modification Summary:)/.test(line)) active = undefined;
    const frame = /^\s*\d+\s+(\S+)\s+(0x[a-fA-F0-9]+)\s+(.+)$/.exec(line);
    if (active && frame) {
      if (active.frames.length < 256 && frameBudget-- > 0) active.frames.push({ image: safeBasename(frame[1]), symbol: safeSymbol(frame[3]) });
      else truncated = true;
    }
    const image = /^\s*0x[a-fA-F0-9]+\s+-\s+0x[a-fA-F0-9]+\s+(.+?)\s+(?:arm64e?|x86_64)\s+<([a-fA-F0-9-]+)>\s+(.+)$/.exec(line);
    if (image) {
      if (images.length < 512) images.push({ basename: safeBasename(image[3]), uuid: uuid(image[2]) }); else truncated = true;
    }
  }
  if (!process) throw new Error('Unsupported text crash header.');
  const field = name => token(new RegExp('^' + name + ':\\s*(.+)$', 'm').exec(text)?.[1]);
  return { format: 'crash', victimPID: Number(process[2]), victim: safeBasename(process[1]),
    exception: { type: field('Exception Type'), codes: field('Exception Codes') },
    termination: { namespace: token(/^Termination Reason:\s*Namespace ([A-Za-z0-9_]+)/m.exec(text)?.[1]),
      code: integer(Number(/^Termination Reason:.*\bCode (\d+)/m.exec(text)?.[1])) },
    crashedThreadIndex: triggered ? Number(triggered[1]) : undefined, threads, images, truncated };
}
export function summarizeCrashText(text, extension) {
  return extension === '.ips' ? ipsSummary(parseIps(text)) : textCrashSummary(text);
}
export function crashInventory(errors) {
  const files = new Map();
  for (const [scope, directory] of [['user', join(homedir(), 'Library/Logs/DiagnosticReports')], ['system', '/Library/Logs/DiagnosticReports']]) {
    for (const [subscope, path] of [[scope, directory], [scope + '-retired', join(directory, 'Retired')]]) {
      try {
        for (const name of readdirSync(path)) {
          if (!/^(?:node|npm|vitest)(?:[-_. ]|$)/i.test(name) || !/\.(?:ips|crash)$/.test(name)) continue;
          const filename = join(path, name), stat = lstatSync(filename);
          if (stat.isFile() && !stat.isSymbolicLink()) files.set(filename, { scope: subscope, size: stat.size, mtimeMs: stat.mtimeMs });
        }
      } catch (error) { if (error.code !== 'ENOENT') errors.push({ operation: 'inventory', scope: subscope, code: errorCode(error) }); }
    }
  }
  return files;
}
export async function collectCrashReports(before, directory, pids, errors) {
  // At most ten seconds of report-generation grace; never a changed test timeout.
  for (let poll = 0; poll < 5; poll++) await new Promise(resolve => setTimeout(resolve, 2000));
  const after = crashInventory(errors), inventory = []; let copied = 0;
  for (const [filename, metadata] of after) {
    const prior = before.get(filename);
    if (prior && prior.size === metadata.size && prior.mtimeMs === metadata.mtimeMs) continue;
    if (inventory.length >= 16) { errors.push({ operation: 'collect', code: 'REPORT_COUNT_LIMIT' }); break; }
    const extension = filename.endsWith('.ips') ? '.ips' : '.crash';
    const item = { basename: safeBasename(filename), scope: metadata.scope, bytes: metadata.size,
      modifiedUtc: new Date(metadata.mtimeMs).toISOString() };
    inventory.push(item);
    try {
      if (metadata.size > 20 * 1024 * 1024) throw Object.assign(new Error(), { code: 'REPORT_SIZE_LIMIT' });
      const bytes = readFileSync(filename); item.sha256 = sha256(bytes);
      const summary = summarizeCrashText(bytes.toString('utf8'), extension);
      if (!pids.has(summary.victimPID)) { item.status = 'PID_UNMATCHED'; continue; }
      copyFileSync(filename, join(directory, 'os-report-' + (++copied) + extension));
      item.status = 'MATCHED'; item.summary = summary;
    } catch (error) { item.status = 'COLLECTOR_ERROR'; errors.push({ operation: 'parse-or-copy', code: errorCode(error) }); }
  }
  return { inventory, matched: copied, status: copied ? 'MATCHED_REPORTS' : 'NO_MATCHING_REPORT_AVAILABLE' };
}
export function collectNodeReports(directory, pids, errors) {
  const inventory = [];
  for (const name of readdirSync(directory).filter(name => /^report\..+\.json$/.test(name)).slice(0, 16)) {
    const filename = join(directory, name), item = { basename: safeBasename(name) }; inventory.push(item);
    try {
      const stat = lstatSync(filename);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 20 * 1024 * 1024) throw Object.assign(new Error(), { code: 'REPORT_SIZE_OR_TYPE' });
      const bytes = readFileSync(filename), value = JSON.parse(bytes); item.bytes = bytes.length; item.sha256 = sha256(bytes);
      const pid = integer(value.header?.processId);
      if (!pids.has(pid)) { item.status = 'PID_UNMATCHED'; continue; }
      item.status = 'MATCHED';
      item.summary = { victimPID: pid, nativeStack: (Array.isArray(value.nativeStack) ? value.nativeStack : []).slice(0, 256)
        .map(frame => ({ symbol: safeSymbol(frame.symbol) })),
        sharedImages: (Array.isArray(value.sharedObjects) ? value.sharedObjects : []).slice(0, 512).map(safeBasename),
        resources: Object.fromEntries(['rss', 'maxRss', 'free_memory', 'available_memory'].map(key => [key,
          /^\d+$/.test(String(value.resourceUsage?.[key])) ? String(value.resourceUsage[key]) : undefined])) };
    } catch (error) { item.status = 'COLLECTOR_ERROR'; errors.push({ operation: 'node-report', code: errorCode(error) }); }
  }
  return inventory;
}
