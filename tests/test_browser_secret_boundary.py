import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
WORKSPACE = ROOT.parent


def _run_node(script: str):
    return subprocess.run(
        ["node", "--experimental-default-type=module", "-e", script],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )


def test_browser_bundle_sources_do_not_contain_server_owned_secret_tokens():
    browser_paths = [
        ROOT / "index.html",
        *sorted((ROOT / "js").rglob("*.js")),
        *sorted((ROOT / "js").rglob("*.mjs")),
    ]
    banned_tokens = [
        "service_role",
        "SUPABASE_SERVICE_ROLE_KEY",
        "sb_secret_",
        "CONTROL_PANEL_SESSION_SECRET",
        "PANEL_SESSION_SECRET",
        "SESSION_SECRET=",
    ]

    findings = []
    for path in browser_paths:
        relative = path.relative_to(WORKSPACE).as_posix()
        if "/legacy/" in relative or "/__checks__/" in relative:
            continue
        source = path.read_text(encoding="utf-8")
        for token in banned_tokens:
            if token in source:
                findings.append(f"{relative}: {token}")

    assert findings == []


def test_gateway_auth_boundary_returns_typed_failure_without_storage_secret_recovery():
    script = r"""
import { hydrateGatewaySession, readSessionStatus } from './js/modules/core/auth/session-gate.js';

globalThis.__CONTROL_PANEL_SESSION__ = null;
Object.defineProperty(globalThis, 'location', { value: { hostname: 'approval-panel-web.pages.dev' }, configurable: true });

const failed = await hydrateGatewaySession({
  endpoint: 'https://api.example.test/panel/session',
  fetchImpl: async () => ({
    ok: false,
    status: 403,
    text: async () => JSON.stringify({ code: 'forbidden', message: 'No panel session' }),
  }),
});

if (failed.status !== 'anonymous') throw new Error(`expected anonymous status, got ${JSON.stringify(failed)}`);
if (failed.kind !== 'gateway_auth') throw new Error(`expected typed gateway auth failure, got ${JSON.stringify(failed)}`);
if (failed.http_status !== 403 || failed.code !== 'forbidden') throw new Error(`expected failure metadata, got ${JSON.stringify(failed)}`);

const storageReads = [];
const restored = readSessionStatus({
  storage: { getItem(key) { storageReads.push(key); return 'stale-browser-ok'; } },
  cookieJar: { cookie: 'approval-panel-session-v1=stale-cookie-ok' },
  sessionKey: 'approval-panel-session-v1',
});

if (restored !== null) throw new Error(`remote failed gateway session must not trust browser fallback, got ${restored}`);
if (storageReads.length !== 0) throw new Error(`failed remote session should not read browser storage fallback: ${JSON.stringify(storageReads)}`);
"""
    result = _run_node(script)
    assert result.returncode == 0, result.stderr
