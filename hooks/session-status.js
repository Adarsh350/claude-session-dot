const fs = require('fs');
const path = require('path');

const statusArg = process.argv[2]; // "working" or "done"

// Overridable so the test suite can point at a temp file instead of the real one.
const statusFile = process.env.CLAUDE_SESSION_STATUS_FILE || path.join(
  process.env.USERPROFILE || process.env.HOME,
  '.claude',
  'session-statuses.json'
);

let input = '';
process.stdin.on('data', d => (input += d));
process.stdin.on('end', () => {
  try {
    const { session_id } = JSON.parse(input || '{}');
    if (!session_id) process.exit(0);

    let statuses = {};
    try { statuses = JSON.parse(fs.readFileSync(statusFile, 'utf8')); } catch {}

    statuses[session_id] = { status: statusArg, updatedAt: Date.now() };
    fs.writeFileSync(statusFile, JSON.stringify(statuses, null, 2));
  } catch {}
  process.exit(0);
});
