# Claude Session Status

A VS Code sidebar listing your Claude Code sessions, marking the ones that have
stopped and are waiting on you.

```
⚡  add retry logic to the webhook handler     Working…
🟢  why does the build fail on arm64           Done — needs attention
```

If you run several Claude Code sessions at once, the problem is not starting
them — it is noticing when one finishes. A session that has been waiting nine
minutes looks exactly like one still thinking. This surfaces that difference
without switching tabs to check.

Click a row to jump to that session. Remove one from the list with the inline
`×`, or clear them all from the view title — either way the matching editor
tabs close too, so dismissing a finished session actually tidies up.

## Two parts

The extension renders state; it does not detect it. A hook does that.

`hooks/session-status.js` is a Claude Code hook that records the session id and
a status into `~/.claude/session-statuses.json`. Wire it to the events that
mark the boundaries of a run, in `~/.claude/settings.json`:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      { "hooks": [{ "type": "command",
                    "command": "node ~/.claude/hooks/session-status.js working" }] }
    ],
    "Stop": [
      { "hooks": [{ "type": "command",
                    "command": "node ~/.claude/hooks/session-status.js done" }] }
    ]
  }
}
```

Splitting it this way keeps the detection outside the editor. The hook fires
whether or not VS Code is open, and the same status file would drive a
different front end — a status bar, a menu-bar app — without touching it.

## Design notes

**The hook never blocks a run.** Every failure path is swallowed and it exits
`0` regardless: unparseable stdin, a missing session id, a corrupt status file,
an unwritable path. A status indicator that can wedge your actual work is worse
than no status indicator. The tests cover each of those paths.

**A corrupt status file is treated as empty and replaced,** not repaired. The
file is disposable — worst case you lose the list until each session next
reports in.

**The extension watches the directory, not the file.** A watcher bound to the
file itself stops firing after an atomic replace, because the inode it was
holding is gone. That failure is silent, which is the annoying kind.

**Session labels come from the transcript.** Rather than showing a UUID, the
extension scans `~/.claude/projects/*/<id>.jsonl` for the first user message
and truncates it to 45 characters. Malformed lines are skipped, and it falls
back to the first 8 characters of the id if nothing readable turns up.

## Install

```bash
npm install
npm run compile
npm test          # exercises the hook
npm run package   # -> claude-session-dot-*.vsix
```

Install the `.vsix` via **Extensions: Install from VSIX…**, copy
`hooks/session-status.js` to `~/.claude/hooks/`, and add the settings above.

Requires VS Code 1.80+ and Claude Code.

## License

MIT
