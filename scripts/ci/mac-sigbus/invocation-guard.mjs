// Original bounded initial-push gate. Never print webhook payloads or paths.
import { lstatSync, readFileSync } from 'node:fs';

export const maximumEventBytes = 512 * 1024;
export const diagnosticInvocation = Object.freeze({
  repository: 'angelcp2802/solidflow', ref: 'refs/heads/diagnostic/pr35-mac-sigbus',
  before: '0000000000000000000000000000000000000000', attempt: '1',
});
const reject = code => { throw Object.assign(new Error(code), { code }); };
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const commit = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);

// Inputs are process.env and JSON-decoded event data, not arbitrary objects/getters.
export function validateInitialPushContext(env, event) {
  const expected = diagnosticInvocation;
  if (env.GITHUB_EVENT_NAME !== 'push' || env.GITHUB_REPOSITORY !== expected.repository ||
      env.GITHUB_REF !== expected.ref || env.GITHUB_RUN_ATTEMPT !== expected.attempt ||
      !/^[1-9][0-9]{0,19}$/.test(env.GITHUB_RUN_ID ?? '') ||
      !commit(env.GITHUB_SHA) || env.GITHUB_SHA === expected.before) reject('INITIAL_PUSH_ENV_REQUIRED');
  if (!record(event) || event.repository?.full_name !== expected.repository || event.ref !== expected.ref ||
      event.created !== true || event.deleted !== false || event.forced !== false ||
      event.before !== expected.before || !commit(event.after) || event.after !== env.GITHUB_SHA ||
      !record(event.head_commit) || event.head_commit.id !== event.after) reject('INITIAL_PUSH_EVENT_REQUIRED');
  return Object.freeze({ mode: 'ISOLATED_INITIAL_PUSH', harnessCommit: event.after });
}

export function assertInitialPushInvocation(env = process.env) {
  if (env.GITHUB_EVENT_NAME !== 'push' || env.GITHUB_REPOSITORY !== diagnosticInvocation.repository ||
      env.GITHUB_REF !== diagnosticInvocation.ref || env.GITHUB_RUN_ATTEMPT !== diagnosticInvocation.attempt) {
    reject('INITIAL_PUSH_ENV_REQUIRED');
  }
  if (typeof env.GITHUB_EVENT_PATH !== 'string' || !env.GITHUB_EVENT_PATH) reject('PUSH_EVENT_FILE_REQUIRED');
  const stat = lstatSync(env.GITHUB_EVENT_PATH);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maximumEventBytes) reject('PUSH_EVENT_SIZE_OR_TYPE');
  const bytes = readFileSync(env.GITHUB_EVENT_PATH);
  if (bytes.length > maximumEventBytes) reject('PUSH_EVENT_SIZE_OR_TYPE');
  let event;
  try { event = JSON.parse(bytes.toString('utf8')); }
  catch { reject('PUSH_EVENT_JSON_INVALID'); }
  return validateInitialPushContext(env, event);
}
