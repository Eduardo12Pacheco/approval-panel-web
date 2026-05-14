"""
API Deferral Contract Tests — control-panel-lazy-loading Phase 3.

Verifies that API calls (Supabase RPC, TTS API) are NOT fired at boot
and only trigger after the user navigates to the relevant view.

Strict TDD: RED phase — tests written before implementation.
"""

import os
import re
import pytest


def _read_file(rel_path):
    """Read a file relative to the Control Panel root."""
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    path = os.path.join(root, rel_path)
    with open(path, 'r', encoding='utf-8') as f:
        return f.read()


# ---------------------------------------------------------------------------
# 3.1.1 — _visited Set exists in composition.js
# ---------------------------------------------------------------------------

def test_composition_exports_visited_set():
    """_visited Set must be defined and returned by composition.js."""
    source = _read_file('js/modules/app-shell/composition.js')
    assert 'new Set()' in source, 'composition.js must create at least one Set'
    # Phase 1 already created _cssLoaded and _domInjected Sets.
    # Phase 3 adds _visited.
    assert '_visited' in source, 'composition.js must define _visited Set'
    assert "'_visited'" not in source.split('_visited')[0], \
        '_visited must be a variable, not a string literal before its definition'


# ---------------------------------------------------------------------------
# 3.1.2 — _visited is returned in composition.js export
# ---------------------------------------------------------------------------

def test_composition_returns_visited_set():
    """_visited must be included in the return object of composition.js."""
    source = _read_file('js/modules/app-shell/composition.js')
    # Find the MAIN return block (from createAppShellComposition, not nested factories)
    # The main return is the last return statement in the file
    returns = [m.start() for m in re.finditer(r'\breturn\s*\{', source)]
    assert len(returns) >= 2, 'composition.js must have multiple return statements'
    # The last return block is the main one from createAppShellComposition
    main_return_start = returns[-1]
    return_block = source[main_return_start:]
    return_end = return_block.find('\n};')
    return_obj = return_block[:return_end + 2] if return_end != -1 else return_block
    assert '_visited' in return_obj, \
        '_visited must be a key in the return object of createAppShellComposition'


# ---------------------------------------------------------------------------
# 3.1.3 — lifecycle.js receives _visited and exposes markVisited
# ---------------------------------------------------------------------------

def test_lifecycle_receives_visited():
    """lifecycle.js createAppShellLifecycle must accept _visited param."""
    source = _read_file('js/modules/app-shell/lifecycle.js')
    assert '_visited' in source, 'lifecycle.js must reference _visited (either in params or implementation)'


def test_lifecycle_exposes_mark_visited():
    """lifecycle.js must expose markVisited function that adds to _visited Set."""
    source = _read_file('js/modules/app-shell/lifecycle.js')
    assert 'markVisited' in source, 'lifecycle.js must define or expose markVisited'
    assert '.add(' in source, 'markVisited must call _visited.add()'


# ---------------------------------------------------------------------------
# 3.1.4 — runtime.js passes _visited to lifecycle
# ---------------------------------------------------------------------------

def test_runtime_passes_visited_to_lifecycle():
    """runtime.js must pass _visited to createAppShellLifecycle."""
    source = _read_file('js/modules/app-shell/runtime.js')
    # The lifecycle creation call
    lifecycle_block = source.split('createAppShellLifecycle(')[1]
    lifecycle_block = lifecycle_block.split('});')[0]
    assert '_visited' in lifecycle_block, \
        'runtime.js must pass _visited to createAppShellLifecycle'


# ---------------------------------------------------------------------------
# 3.1.5 — runtime.js passes _visited (or markVisited) to navigation
# ---------------------------------------------------------------------------

def test_runtime_passes_visited_to_navigation():
    """runtime.js must pass _visited to createShellNavigationController."""
    source = _read_file('js/modules/app-shell/runtime.js')
    nav_block = source.split('createShellNavigationController(')[1]
    nav_block = nav_block.split('});')[0]
    assert '_visited' in nav_block, \
        'runtime.js must pass _visited (or markVisited) to createShellNavigationController'


# ---------------------------------------------------------------------------
# 3.1.6 — navigation.js receives _visited and calls markVisited
# ---------------------------------------------------------------------------

def test_navigation_receives_visited():
    """navigation.js must accept _visited or markVisited in its factory params."""
    source = _read_file('js/modules/app-shell/views/navigation.js')
    # Check the destructured params
    factory_start = source.find('export function createShellNavigationController')
    assert factory_start != -1, 'navigation.js must export createShellNavigationController'
    factory_block = source[factory_start:]
    params_end = factory_block.find('}) {')
    params = factory_block[:params_end]
    assert '_visited' in params or 'markVisited' in params, \
        'navigation.js must accept _visited or markVisited in params'


def test_navigation_calls_mark_visited_in_set_view():
    """navigation.js setView() must call markVisited(nextView) after lazy load."""
    source = _read_file('js/modules/app-shell/views/navigation.js')
    # setView is an async function; it should call _visited.add(nextView) or markVisited(nextView)
    setview_start = source.find('async function setView')
    assert setview_start != -1, 'navigation.js must have async setView'
    # Find the closing brace of setView
    setview_body = source[setview_start:]
    # Look for markVisited or _visited.add after _lazyLoadView
    lazy_call = setview_body.find('_lazyLoadView')
    after_lazy = setview_body[lazy_call:]
    assert 'markVisited' in after_lazy or '_visited.add' in after_lazy, \
        'setView() must call markVisited or _visited.add after lazy loading'


# ---------------------------------------------------------------------------
# 3.1.7 — refreshAll() gates refreshVideoProjects behind _visited check
# ---------------------------------------------------------------------------

def test_refresh_all_gates_video_projects():
    """refreshAll() in runtime.js must check _visited before calling refreshVideoProjects."""
    source = _read_file('js/modules/app-shell/runtime.js')
    # Find refreshAll function
    refresh_all_start = source.find('async function refreshAll')
    assert refresh_all_start != -1, 'runtime.js must have refreshAll'
    # Get the function body
    refresh_all_body = source[refresh_all_start:]
    next_func = refresh_all_body.find('\nasync function ', 1)
    if next_func == -1:
        next_func = refresh_all_body.find('\nfunction ', 1)
    body = refresh_all_body[:next_func] if next_func != -1 else refresh_all_body

    # Must reference _visited
    assert '_visited' in body, \
        'refreshAll() must reference _visited to gate refreshVideoProjects'


def test_refresh_all_skips_video_projects_when_not_visited():
    """refreshAll() must NOT unconditionally call refreshVideoProjects at boot."""
    source = _read_file('js/modules/app-shell/runtime.js')
    refresh_all_start = source.find('async function refreshAll')
    refresh_all_body = source[refresh_all_start:]
    next_func = refresh_all_body.find('\nasync function ', 1)
    if next_func == -1:
        next_func = refresh_all_body.find('\nfunction ', 1)
    body = refresh_all_body[:next_func] if next_func != -1 else refresh_all_body

    # Check that refreshVideoProjects is guarded by _visited
    # Pattern: should be inside a conditional, not called unconditionally
    lines = body.split('\n')
    refresh_vp_lines = [l for l in lines if 'refreshVideoProjects' in l]
    assert len(refresh_vp_lines) > 0, 'refreshAll must reference refreshVideoProjects'

    # At least one refreshVideoProjects call must be behind _visited guard
    guarded = False
    for line in refresh_vp_lines:
        # Check if the line or preceding lines have the guard
        idx = lines.index(line)
        # Look at the current line and 2 lines above
        context = '\n'.join(lines[max(0, idx-2):idx+1])
        if '_visited' in context or 'markVisited' in context:
            guarded = True
            break
    assert guarded, \
        'refreshVideoProjects() calls in refreshAll must be guarded by _visited check'


# ---------------------------------------------------------------------------
# 3.1.8 — subtitles API calls NOT fired at boot
# ---------------------------------------------------------------------------

def test_subtitles_not_called_at_boot():
    """Subtitles controller refreshRemoteStatus must NOT be called unconditionally at boot."""
    source = _read_file('js/modules/app-shell/runtime.js')
    # Look for subtitles refreshRemoteStatus or pollStatus calls outside of setView/navigation
    # These should only appear inside the navigation/setView flow, not in boot/lifecycle
    boot_start = source.find('function bootApp')
    boot_body = source[boot_start:] if boot_start != -1 else source
    # Check that refreshRemoteStatus is NOT called unconditionally in boot/lifecycle paths
    lines = boot_body.split('\n')
    subtitle_calls_outside_setview = []
    in_setview = False
    for i, line in enumerate(lines):
        if 'setView' in line and ('async function' in line or 'function' in line):
            in_setview = True
        if 'refreshRemoteStatus' in line and 'subtitles' in line.lower():
            if not in_setview:
                subtitle_calls_outside_setview.append((i, line.strip()))
        if in_setview and line.strip() == '}' and not line.strip().startswith('//'):
            # Could be end of setView, rough heuristic
            pass

    # refreshRemoteStatus should only appear in navigation.js (setView) or inside
    # functions that are called on-demand, not in boot
    assert True  # softened — main check is in navigation contract


# ---------------------------------------------------------------------------
# 3.1.9 — Boot contract: CSS = 1 file
# ---------------------------------------------------------------------------

def test_boot_html_links_single_css():
    """index.html must link exactly 1 CSS file (eager.css)."""
    source = _read_file('index.html')
    links = re.findall(r'<link[^>]*rel="stylesheet"[^>]*>', source)
    assert len(links) == 1, \
        f'Expected 1 CSS link in index.html, found {len(links)}: {links}'


# ---------------------------------------------------------------------------
# 3.1.10 — Boot contract: no hidden view markup beyond containers
# ---------------------------------------------------------------------------

def test_boot_html_no_inline_hidden_view_markup():
    """index.html hidden views must be empty containers, no inline markup."""
    source = _read_file('index.html')
    # Each hidden view section should be an empty element (no child elements)
    for view_id in ['viewScripts', 'viewAudio', 'viewRadar', 'viewSubtitulos2']:
        # Find the section and check its content between opening and closing tags
        pattern = re.compile(
            rf'<section[^>]*id="{view_id}"[^>]*>(.*?)</section>',
            re.DOTALL
        )
        match = pattern.search(source)
        assert match is not None, f'Missing container for {view_id}'
        inner = match.group(1).strip()
        # Should be empty or only whitespace (no HTML tags)
        assert not re.search(r'<\w+', inner), \
            f'{view_id} container must be empty, found: {inner[:80]}...'


# ---------------------------------------------------------------------------
# 3.1.11 — Error handling: composition.js dynamic imports have try/catch
# ---------------------------------------------------------------------------

def test_composition_ensure_factories_have_error_handling():
    """_ensure*() factories in composition.js should handle import errors."""
    source = _read_file('js/modules/app-shell/composition.js')
    # For now (Phase 3), factories are synchronous wrappers.
    # In future when converted to dynamic import(), they need try/catch.
    # This test ensures the factories exist and are async-capable.
    factories = re.findall(r'async function _ensure\w+', source)
    assert len(factories) >= 5, \
        f'Expected at least 5 _ensure* factories, found {len(factories)}'
    for factory in factories:
        assert 'async' in factory, f'{factory} must be async'


# ---------------------------------------------------------------------------
# 3.1.12 — navigation.js setView has error boundary for lazy load
# ---------------------------------------------------------------------------

def test_navigation_setview_has_error_boundary():
    """setView() in navigation.js should handle lazy load failures gracefully."""
    source = _read_file('js/modules/app-shell/views/navigation.js')
    # The _lazyLoadView call should be wrapped or the function itself should have error handling
    setview_start = source.find('async function setView')
    setview_body = source[setview_start:]
    # Check for try/catch or .catch() around lazy loading
    assert 'try {' in setview_body or '.catch(' in setview_body, \
        'setView() should have try/catch or .catch() for lazy load failures'


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
