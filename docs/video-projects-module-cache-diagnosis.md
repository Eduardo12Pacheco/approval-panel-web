# Video Projects module/cache failure diagnosis

This document records the exact production failure where **Video Projects showed `0 PROYECTOS` even though the API returned one ready project**. Use this as the first checklist if the same symptom returns.

## Quick path

1. Open the deployed panel and go to **Proyectos de video**.
2. Check the browser console for an ESM error like:
   ```text
   Uncaught (in promise) SyntaxError: The requested module '../domain/status-labels.js' does not provide an export named 'getProjectPhaseLabel'
   ```
3. Verify the read model directly:
   ```js
   await fetch('https://api.automatizacionedun8n.me/panel/read-models/video-projects?limit=50', {
     credentials: 'include',
     cache: 'no-store'
   }).then(r => r.json())
   ```
4. If the API returns projects but the UI stays at `0 PROYECTOS`, inspect module loading before debugging n8n/Supabase again.

## What happened

| Area | Finding |
|------|---------|
| Backend data | n8n publish execution succeeded and Supabase/Gateway returned one ready video project. |
| Browser API | Manual `fetch('/panel/read-models/video-projects?limit=50')` returned `count: 1`. |
| UI state | The Video Projects view stayed at `0 PROYECTOS`. |
| Console error | `project-list-markup.js` imported `getProjectPhaseLabel` from `../domain/status-labels.js`, but the browser module graph resolved a `status-labels.js` version without that export. |
| Real failure | The feature failed during ESM module initialization, so the internal video projects refresh never ran. |

## Why it happened

The panel is a no-bundler browser ESM app. Some lazy entrypoints are versioned with `APP_CACHE_VERSION`, but their **static child imports are not rewritten by a bundler**.

That means this can happen after deploys:

1. A lazy parent module is loaded with a new `?v=...` cache key.
2. A static child import inside that module points to an unversioned path like `../domain/status-labels.js`.
3. The browser, CDN, or an intermediate cache can resolve an older copy of that child module.
4. If the parent expects a newly-added named export, ESM fails hard at parse/link time.
5. The entire lazy feature fails before it can fetch or render data.

This is why manual API tests looked healthy while the UI still showed zero projects. The data was fine; the module graph was broken.

## Evidence from the incident

The user's console diagnostic showed:

```json
{
  "sharedHasBadHeader": false,
  "sharedReturnsSimpleHeaders": true,
  "videoFetchCalls": [],
  "dom": {
    "textHasProjectTitle": false,
    "projectCounterText": "0 proyectos"
  },
  "moduleApi": {
    "ok": true,
    "count": 1,
    "projectsLen": 1,
    "firstTitle": "El mensaje del Bayern Munich para tranquilizar a Luis Díaz sobre el interés de Barcelona en Harry Kane"
  }
}
```

Interpretation:

- `moduleApi.count: 1` proved the shared read model worked.
- `videoFetchCalls: []` proved the app's Video Projects refresh did not even reach the fetch call.
- The console ESM error identified the module-linking failure.

## What was changed

Commit:

```text
44351 fix: stabilize video project list module
```

Files changed:

| File | Change |
|------|--------|
| `js/modules/features/video-projects/render/project-list-markup.js` | Removed the fragile named import from `../domain/status-labels.js` and made the project-card phase label helper local to the list markup module. |
| `js/modules/core/versioning/asset-version.js` | Bumped `APP_CACHE_VERSION` to `20260525-video-projects-module-v3`. |
| `index.html` | Bumped the root `js/main.js` query string to `20260525-video-projects-module-v3`. |

Focused verification run:

```powershell
python -m pytest tests/test_phase6_runtime_parity_and_boundaries.py::test_video_projects_read_model_hydrates_list_and_detail_from_bff_without_supabase_read_secret_headers -q
```

Result:

```text
1 passed
```

Deployed verification:

```js
{
  htmlMain: 'js/main.js?v=20260525-video-projects-module-v3',
  assetVersion: '20260525-video-projects-module-v3',
  listImportsStatusLabels: false,
  listHasLocalPhaseHelper: true
}
```

## Why this fix works

The card phase label is presentation-specific. Keeping it local avoids a named-export mismatch from breaking the entire lazy Video Projects feature.

The version bump forces the root app shell and lazy module graph to be requested under a new cache key, reducing mixed-version module loads after deployment.

## If this happens again

Use this console probe first:

```js
(async () => {
  const out = {};
  out.location = location.href;

  const html = await fetch('/', { cache: 'no-store' }).then(r => r.text());
  out.htmlMain = html.match(/js\/main\.js[^"]*/)?.[0] || null;

  const versionSrc = await fetch('/js/modules/core/versioning/asset-version.js?diag=' + Date.now(), { cache: 'no-store' }).then(r => r.text());
  out.assetVersion = versionSrc.match(/APP_CACHE_VERSION\s*=\s*['"]([^'"]+)/)?.[1] || 'not found';

  const listSrc = await fetch('/js/modules/features/video-projects/render/project-list-markup.js?diag=' + Date.now(), { cache: 'no-store' }).then(r => r.text());
  out.listImportsStatusLabels = listSrc.includes('../domain/status-labels.js');
  out.listHasLocalPhaseHelper = listSrc.includes('function getProjectCardPhaseLabel');

  const apiData = await fetch('https://api.automatizacionedun8n.me/panel/read-models/video-projects?limit=50', {
    credentials: 'include',
    cache: 'no-store'
  }).then(r => r.json());
  out.api = { ok: apiData.ok, count: apiData.count, firstTitle: apiData.projects?.[0]?.title || null };

  out.dom = {
    projectCounterText: [...document.querySelectorAll('*')]
      .map(el => el.textContent?.trim())
      .find(text => /^\d+\s+PROYECTO/i.test(text)) || null,
    textHasFirstTitle: apiData.projects?.[0]?.title ? document.body.innerText.includes(apiData.projects[0].title) : false,
  };

  console.log('VIDEO_PROJECTS_MODULE_DIAG ' + JSON.stringify(out, null, 2));
})();
```

Expected healthy result:

```json
{
  "listImportsStatusLabels": false,
  "listHasLocalPhaseHelper": true,
  "api": { "ok": true, "count": 1 },
  "dom": { "projectCounterText": "1 PROYECTO", "textHasFirstTitle": true }
}
```

## Prevention checklist

- [ ] When changing lazy-loaded ESM modules, bump `APP_CACHE_VERSION` and the root `index.html` `js/main.js?v=...` query string together.
- [ ] Avoid adding fragile named imports to critical lazy-render modules unless a focused runtime import test covers the deployed module path.
- [ ] If API data is healthy but the UI shows empty state, check console ESM errors before debugging n8n/Supabase.
- [ ] For live read models, keep browser GET requests simple: no unnecessary custom request headers.
- [ ] Prefer visible/render diagnostics over assuming backend failure when `moduleApi` can read data successfully.

## Related prior fix

Before this module failure, another issue was fixed:

```text
c2c2a fix: avoid preflight on shared reads
```

That removed the custom `x-control-panel-shell-version` request header from shared-read GETs. That was a real CORS/preflight risk, but it was not the final reason for `0 PROYECTOS`. The final blocker was the ESM named-export mismatch described above.
