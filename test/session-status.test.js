const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const HOOK = path.join(__dirname, '..', 'hooks', 'session-status.js');

function runHook(status, stdin, statusFile) {
  execFileSync(process.execPath, [HOOK, status], {
    input: stdin,
    env: { ...process.env, CLAUDE_SESSION_STATUS_FILE: statusFile },
  });
}

function tempFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-dot-'));
  return path.join(dir, 'session-statuses.json');
}

function read(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

test('records a session as working', () => {
  const file = tempFile();
  runHook('working', JSON.stringify({ session_id: 'abc-123' }), file);

  const statuses = read(file);
  assert.equal(statuses['abc-123'].status, 'working');
  assert.ok(Number.isFinite(statuses['abc-123'].updatedAt));
});

test('flips an existing session to done without dropping the others', () => {
  const file = tempFile();
  runHook('working', JSON.stringify({ session_id: 'one' }), file);
  runHook('working', JSON.stringify({ session_id: 'two' }), file);
  runHook('done', JSON.stringify({ session_id: 'one' }), file);

  const statuses = read(file);
  assert.equal(statuses.one.status, 'done');
  assert.equal(statuses.two.status, 'working');
});

test('advances updatedAt so the tree can sort by recency', async () => {
  const file = tempFile();
  runHook('working', JSON.stringify({ session_id: 'x' }), file);
  const first = read(file).x.updatedAt;

  await new Promise((resolve) => setTimeout(resolve, 5));
  runHook('done', JSON.stringify({ session_id: 'x' }), file);

  assert.ok(read(file).x.updatedAt >= first);
});

test('ignores payloads with no session id', () => {
  const file = tempFile();
  runHook('working', JSON.stringify({ cwd: '/somewhere' }), file);
  assert.equal(fs.existsSync(file), false);
});

test('survives malformed stdin without writing anything', () => {
  const file = tempFile();
  runHook('working', 'not json at all', file);
  assert.equal(fs.existsSync(file), false);
});

test('does not clobber the file when the existing one is corrupt', () => {
  const file = tempFile();
  fs.writeFileSync(file, '{ truncated');
  runHook('working', JSON.stringify({ session_id: 'fresh' }), file);

  // A corrupt file is treated as empty and replaced, not appended to.
  assert.equal(read(file).fresh.status, 'working');
});
