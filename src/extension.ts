import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const STATUS_FILE = path.join(os.homedir(), '.claude', 'session-statuses.json');
const PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');

interface SessionEntry {
  status: 'working' | 'done';
  updatedAt: number;
}

type Statuses = Record<string, SessionEntry>;

function getSessionLabel(sessionId: string): string {
  try {
    if (!fs.existsSync(PROJECTS_DIR)) return sessionId.slice(0, 8);

    for (const projectDir of fs.readdirSync(PROJECTS_DIR)) {
      const sessionFile = path.join(PROJECTS_DIR, projectDir, `${sessionId}.jsonl`);
      if (!fs.existsSync(sessionFile)) continue;

      const lines = fs.readFileSync(sessionFile, 'utf8').trim().split('\n');
      for (const line of lines) {
        try {
          const msg = JSON.parse(line);
          if (msg.type !== 'user') continue;

          const content = msg.message?.content;
          let text = '';
          if (Array.isArray(content)) {
            text = content.find((c: { type: string; text?: string }) => c.type === 'text')?.text ?? '';
          } else if (typeof content === 'string') {
            text = content;
          }

          text = text.trim();
          if (text) return text.length > 45 ? text.slice(0, 42) + '…' : text;
        } catch { /* skip malformed line */ }
      }
    }
  } catch { /* fall through to default */ }

  return sessionId.slice(0, 8);
}

class SessionItem extends vscode.TreeItem {
  constructor(public readonly sessionId: string, entry: SessionEntry) {
    const isDone = entry.status === 'done';
    const label = getSessionLabel(sessionId);
    super(isDone ? `🟢  ${label}` : `⚡  ${label}`);
    this.tooltip = sessionId;
    this.description = isDone ? 'Done — needs attention' : 'Working…';
    this.contextValue = entry.status;
    this.command = {
      command: 'claude-vscode.primaryEditor.open',
      title: 'Open Session',
      arguments: [sessionId],
    };
  }
}

class SessionStatusProvider implements vscode.TreeDataProvider<SessionItem> {
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChange.event;

  refresh() { this._onDidChange.fire(); }

  getTreeItem(el: SessionItem) { return el; }

  getChildren(): SessionItem[] {
    let statuses: Statuses = {};
    try { statuses = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8')); } catch {}

    return Object.entries(statuses)
      .sort(([, a], [, b]) => b.updatedAt - a.updatedAt)
      .map(([id, entry]) => new SessionItem(id, entry));
  }
}

function readStatuses(): Statuses {
  try { return JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8')); } catch { return {}; }
}

function writeStatuses(statuses: Statuses): void {
  fs.writeFileSync(STATUS_FILE, JSON.stringify(statuses, null, 2), 'utf8');
}

async function closeSessionTabs(sessionIds: string[]): Promise<void> {
  if (sessionIds.length === 0) return;
  const tabsToClose: vscode.Tab[] = [];
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      const input = tab.input;
      let uriStr = '';
      if (input instanceof vscode.TabInputText) uriStr = input.uri.toString();
      else if (input instanceof vscode.TabInputCustom) uriStr = input.uri.toString();
      if (uriStr && sessionIds.some(id => uriStr.includes(id))) {
        tabsToClose.push(tab);
      }
    }
  }
  if (tabsToClose.length > 0) {
    await vscode.window.tabGroups.close(tabsToClose);
  }
}

export function activate(ctx: vscode.ExtensionContext) {
  const provider = new SessionStatusProvider();

  ctx.subscriptions.push(
    vscode.window.registerTreeDataProvider('claudeSessionStatus', provider)
  );

  const dir = path.dirname(STATUS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // Watch the directory rather than the file: an atomic replace swaps the inode
  // out from under a file watcher, which then stops firing silently.
  const watcher = fs.watch(dir, (_, filename) => {
    if (filename !== 'session-statuses.json') return;
    provider.refresh();
  });

  ctx.subscriptions.push({ dispose: () => watcher.close() });

  ctx.subscriptions.push(
    vscode.commands.registerCommand('claudeSessionStatus.removeSession', async (item: SessionItem) => {
      const statuses = readStatuses();
      delete statuses[item.sessionId];
      writeStatuses(statuses);
      provider.refresh();
      await closeSessionTabs([item.sessionId]);
    })
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand('claudeSessionStatus.clearAll', async () => {
      const sessionIds = Object.keys(readStatuses());
      writeStatuses({});
      provider.refresh();
      await closeSessionTabs(sessionIds);
    })
  );
}

export function deactivate() {}
