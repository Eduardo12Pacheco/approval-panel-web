from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[1]
INDEX_PATH = ROOT / "index.html"
TOKENS_PATH = ROOT / "styles" / "tokens.css"
LAYOUT_PATH = ROOT / "styles" / "layout.css"
RESPONSIVE_PATH = ROOT / "styles" / "responsive.css"
APPROVAL_PATH = ROOT / "styles" / "features" / "approval.css"
SCRIPTS_PATH = ROOT / "styles" / "features" / "scripts.css"
AUDIO_PATH = ROOT / "styles" / "features" / "audio.css"
FORMS_PATH = ROOT / "styles" / "components" / "forms.css"
BUTTONS_PATH = ROOT / "styles" / "components" / "buttons.css"
TOAST_PATH = ROOT / "styles" / "components" / "toast.css"
CUSTOM_DROPDOWNS_PATH = ROOT / "js" / "modules" / "core" / "ui" / "custom-dropdowns.js"
APP_SHELL_PATH = ROOT / "js" / "modules" / "app-shell.js"
QUEUE_MONITOR_PATH = ROOT / "js" / "modules" / "features" / "approval" / "queue-monitor.js"
SCRIPTS_FEATURE_PATH = ROOT / "js" / "modules" / "features" / "scripts" / "index.js"
SCRIPTS_RENDER_PATH = ROOT / "js" / "modules" / "features" / "scripts" / "render.js"


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _run_node(script: str):
    return subprocess.run(
        ["node", "--experimental-default-type=module", "-e", script],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )


def test_approval_screen_recomposes_search_queue_and_editor_into_single_workspace():
    source = _read(INDEX_PATH)

    for expected_fragment in [
        'class="view approval-screen"',
        'class="approval-controls panel-shell"',
        'class="control-group control-group--search approval-control approval-control--search"',
        'class="approval-shell-grid"',
        'class="approval-primary-column"',
        'class="approval-side-column"',
        'class="panel-shell news-panel"',
        'class="panel-shell script-workbench"',
        'class="panel-shell approval-side-panel"',
        'class="approval-side-section approval-side-section--queue"',
        'class="approval-side-section approval-side-section--scripts"',
        'id="queueMeta" class="section-counter hidden"',
        'id="queueList" class="queue-list queue-list--integrated"',
        'id="scriptCards" class="script-selection-list"',
        'id="scriptEditedArea" class="script-area script-area--workspace"',
        'id="closeScriptEditor" class="secondary button-icon script-remove-button" disabled',
        '<span>Quitar</span>',
        'M6.75 6.75l10.5 10.5',
        '<span>Ver copia del guion</span>',
        'id="publishDraftBtn" class="approve button-icon" disabled',
        '<span>Procesar</span>',
        'id="downloadDraftBtn" class="approve button-icon script-download-button" disabled',
        '<span>Descargar</span>',
        'M9 1.5H3.5v13h9V5M9 1.5L12.5 5M9 1.5V5h3.5M5 8h6M5 5h2.5M5 11h6',
    ]:
        assert expected_fragment in source

    publish_index = source.index('id="publishDraftBtn"')
    download_index = source.index('id="downloadDraftBtn"')
    assert publish_index < download_index


def test_download_button_uses_muted_green_until_docx_is_available():
    buttons_source = _read(BUTTONS_PATH)

    for expected_rule in [
        'button.script-download-button:disabled',
        'opacity: 1;',
        'background: rgba(0, 232, 143, 0.12);',
        'border-color: rgba(0, 232, 143, 0.32);',
        'color: rgba(185, 255, 224, 0.62);',
    ]:
        assert expected_rule in buttons_source


def test_remove_script_button_uses_red_quitar_contract():
    buttons_source = _read(BUTTONS_PATH)
    index_source = _read(INDEX_PATH)

    for expected_fragment in [
        'id="closeScriptEditor" class="secondary button-icon script-remove-button" disabled',
        '<span>Quitar</span>',
        'M6.75 6.75l10.5 10.5',
        'M17.25 6.75l-10.5 10.5',
    ]:
        assert expected_fragment in index_source

    assert '<span>Limpiar</span>' not in index_source

    for expected_rule in [
        'button.script-remove-button {',
        'border-color: rgba(217, 87, 100, 0.5);',
        'background: rgba(43, 11, 16, 0.34);',
        'color: #ffb4bf;',
        'button.script-remove-button:disabled {',
    ]:
        assert expected_rule in buttons_source


def test_detail_modal_and_audio_screen_use_new_industrial_technical_shell_classes():
    index_source = _read(INDEX_PATH)
    tokens_source = _read(TOKENS_PATH)
    layout_source = _read(LAYOUT_PATH)
    approval_source = _read(APPROVAL_PATH)
    scripts_source = _read(SCRIPTS_PATH)
    audio_source = _read(AUDIO_PATH)

    for expected_fragment in [
        'class="sidebar sidebar--rail"',
        '<title>Editorial system</title>',
        '<link rel="icon" type="image/svg+xml" href="./favicon.svg" />',
        '<strong>Editorial system</strong>',
        'brand-icon--editorial-system',
        'class="topic-dialog-shell"',
        'class="topic-dialog-body"',
        'class="audio-screen"',
        'class="audio-screen__grid"',
        'id="audioQueueMeta" class="section-counter"',
        'id="audioQueueMeta" class="section-counter"></span>',
        'id="audioQueueList" class="audio-queue-list is-empty"',
        'class="audio-queue-empty">Sin jobs todavía.</p>',
        '<option value="balanced_default">Voz Balanceada</option>',
        '<option value="pelotazo_emotivo">Voz Emotivo</option>',
        '<option value="pelotazo_informativo">Voz Informativa</option>',
        'class="audio-panel audio-panel--queue panel-shell"',
    ]:
        assert expected_fragment in index_source

    for expected_rule in [
        '.sidebar--rail',
        '--sidebar-collapsed: 82px;',
        '--sidebar-expanded: clamp(248px, 22vw, 272px);',
        '.sidebar-rail__label',
        '.approval-shell-grid',
        '.queue-item__dismiss',
        '.topic-dialog-shell',
        '.script-selection-list',
        '.audio-screen__grid',
        '.approval-stats-sr',
        '.audio-queue-header',
        '.audio-queue-list.is-empty',
        'overflow-x: hidden;',
        'overflow-wrap: anywhere;',
    ]:
        joined_css = "\n".join([tokens_source, layout_source, approval_source, scripts_source, audio_source])
        assert expected_rule in joined_css


def test_search_refresh_requires_promote_success_before_panel_updated_copy():
    app_shell_source = _read(APP_SHELL_PATH)

    assert 'assertSearchRefreshSucceeded(result);' in app_shell_source
    assert "promoteStatus !== 'succeeded'" in app_shell_source
    assert 'El panel actual se mantiene sin cambios' in app_shell_source
    assert 'Panel actualizado' in app_shell_source


def test_search_refresh_controls_align_with_filter_row_and_visual_separator():
    index_source = _read(INDEX_PATH)
    forms_source = _read(FORMS_PATH)
    responsive_source = _read(RESPONSIVE_PATH)

    for expected_fragment in [
        'class="approval-controls__actions"',
        'class="control-group approval-control approval-control--search-refresh"',
        'id="searchRefreshWindow" data-custom-dropdown',
        'id="searchRefreshBtn" class="approval-search-refresh__button"',
        'id="searchRefreshStatus" class="approval-search-refresh__status"',
    ]:
        assert expected_fragment in index_source

    for expected_rule in [
        'grid-template-columns: minmax(320px, 1fr) minmax(150px, 176px) minmax(150px, 184px) minmax(340px, 420px);',
        'align-items: start;',
        'grid-template-areas:',
        '"window button"',
        '"status status"',
        'border-left: 1px solid rgba(148, 163, 184, 0.24);',
        'grid-area: window;',
        'grid-area: button;',
        'grid-area: status;',
    ]:
        assert expected_rule in forms_source

    for expected_rule in [
        'border-top: 1px solid rgba(148, 163, 184, 0.22);',
        'border-left: 0;',
        '"window"',
        '"button"',
        '"status"',
    ]:
        assert expected_rule in responsive_source


def test_sidebar_rail_keeps_collapsed_state_contained_and_removes_scripts_segmentation():
    index_source = _read(INDEX_PATH)
    layout_source = _read(LAYOUT_PATH)
    buttons_source = _read(BUTTONS_PATH)

    assert 'data-view="scripts"' not in index_source
    assert 'nav-item__meta' not in index_source

    for expected_rule in [
        '.sidebar--rail:hover .sidebar-brand',
        '.sidebar--rail:hover .nav-item__copy',
        '.sidebar--rail:hover .nav-item',
        'overflow: hidden;',
        'max-height: 0;',
        'max-width: min(100vw, var(--sidebar-expanded));',
        'justify-content: center;',
        'justify-content: flex-start;',
        'max-width: 180px;',
    ]:
        assert expected_rule in "\n".join([layout_source, buttons_source])


def test_script_selection_highlight_uses_unique_card_identity_instead_of_shared_cluster():
    scripts_render_source = _read(SCRIPTS_RENDER_PATH)
    scripts_source = _read(SCRIPTS_FEATURE_PATH)
    approval_source = _read(APPROVAL_PATH)

    assert 'currentKey === selectedKey' in scripts_render_source
    assert 'resolveScriptListKey(item) === selectedKey' in scripts_source
    assert 'currentIds.cluster_id === selectedIds.cluster_id' not in scripts_render_source
    assert "border-color: rgba(244, 183, 64, 0.58) rgba(244, 183, 64, 0.16);" in approval_source
    assert '0 16px 28px -24px rgba(244, 183, 64, 0.36)' in approval_source
    assert '0 -16px 28px -24px rgba(244, 183, 64, 0.28)' in approval_source


def test_processed_script_editor_switches_process_button_to_secondary_style():
    scripts_render_source = _read(SCRIPTS_RENDER_PATH)

    assert 'function setProcessButtonStyle(button, { processed = false } = {})' in scripts_render_source
    assert 'const isProcessed = isScriptProcessed(selected);' in scripts_render_source
    assert "button?.classList?.toggle('approve', !processed);" in scripts_render_source
    assert "button?.classList?.toggle('secondary', processed);" in scripts_render_source
    assert 'setProcessButtonStyle(el.publishDraftBtn, { processed: isProcessed });' in scripts_render_source
    assert 'el.downloadDraftBtn.disabled = !selected.doc_id;' in scripts_render_source


def test_script_editor_uses_individual_news_headline_before_cluster_title():
    scripts_source = _read(SCRIPTS_FEATURE_PATH)
    scripts_render_source = _read(SCRIPTS_RENDER_PATH)
    app_shell_source = _read(APP_SHELL_PATH)

    assert 'export function resolveScriptTitle(row = {}, fallback = \'Sin tema\')' in scripts_source
    assert 'row.titulo_noticia,' in scripts_source
    assert 'row.titular,' in scripts_source
    assert 'row.tema_principal,' in scripts_source
    assert 'const title = escapeHtmlCore(resolveScriptTitle(item));' in scripts_source
    assert 'const base = [row.jugador, resolveScriptTitle(row, \'\')]' in scripts_source
    assert 'resolveScriptTitle(selected)' in scripts_render_source
    assert 'selected.tema_principal || \'Sin tema\'' not in scripts_render_source
    assert 'resolveScriptTitle(state.selectedScript)' in app_shell_source
    assert 'state.selectedScript.tema_principal || \'Sin tema\'' not in app_shell_source


def test_script_queue_cards_prefer_individual_headline_before_cluster_title():
    queue_source = _read(QUEUE_MONITOR_PATH)

    assert 'item.titulo_noticia, item.titular, item.headline, item.tema_principal' in queue_source
    assert 'item.tema_principal, item.titular' not in queue_source


def test_sidebar_icons_and_custom_dropdown_stack_track_industrial_resources_more_closely():
    index_source = _read(INDEX_PATH)
    forms_source = _read(FORMS_PATH)
    buttons_source = _read(BUTTONS_PATH)
    custom_dropdowns_source = _read(CUSTOM_DROPDOWNS_PATH)

    for expected_fragment in [
        'class="sidebar-brand__mark" aria-hidden="true">',
        'class="nav-item__icon" aria-hidden="true">',
        'class="control-input-shell control-input-shell--search"',
        'class="control-input-icon" aria-hidden="true">',
        'id="countryFilter" data-custom-dropdown',
        'id="sourcesFilter" data-custom-dropdown',
        'id="audioPresetSelect" data-custom-dropdown',
        'id="subtitle2SourceLanguagePicker" class="subtitle-lang-select" data-custom-dropdown',
    ]:
        assert expected_fragment in index_source

    assert '⌘' not in index_source
    assert '▤' not in index_source
    assert '◉' not in index_source
    assert '≣' not in index_source
    assert 'Operations Core' not in index_source

    for expected_rule in [
        '.ui-dropdown',
        '.ui-dropdown__trigger',
        '.ui-dropdown__menu',
        '.ui-dropdown__option.is-selected',
        '.control-input-shell--search',
        '.control-input-icon',
        'radial-gradient(circle at left center, rgba(0, 232, 143, 0.16), transparent 34%)',
        'border-color: rgba(0, 232, 143, 0.32);',
        '.approval-control--search input::placeholder',
        'padding-left: 42px;',
        'margin-inline: 0;',
        'background: transparent;',
        'border: 0;',
        '.nav-item__icon svg',
    ]:
        assert expected_rule in "\n".join([forms_source, buttons_source])

    assert 'M13.75 4.75v4h4' in index_source

    for expected_token in [
        'select[data-custom-dropdown]',
        'dispatchEvent(new Event(\'input\'',
        'dispatchEvent(new Event(\'change\'',
        'focusout',
        'queueMicrotask',
        'ui-dropdown__option-check',
    ]:
        assert expected_token in custom_dropdowns_source


def test_sidebar_navigation_icons_keep_centered_alignment_at_30px():
    buttons_source = _read(BUTTONS_PATH)

    for expected_rule in [
        '.nav-item__icon {',
        'width: 30px;',
        'height: 30px;',
        'flex: 0 0 30px;',
        'margin-inline: 0;',
        '.nav-item__icon svg {',
    ]:
        assert expected_rule in buttons_source


def test_expanded_sidebar_separates_branding_from_nav_with_divider():
    layout_source = _read(LAYOUT_PATH)

    for expected_rule in [
        '.sidebar-rail__inner {',
        'gap: 16px;',
        'padding: 20px 10px 18px;',
        '.sidebar-nav {',
        'margin-top: auto;',
    ]:
        assert expected_rule in layout_source


def test_approval_header_removes_manual_refresh_buttons_and_runtime_wiring():
    index_source = _read(INDEX_PATH)
    selectors_source = _read(ROOT / 'js' / 'modules' / 'shared' / 'dom' / 'selectors.js')
    bootstrap_source = _read(ROOT / 'js' / 'modules' / 'core' / 'bootstrap.js')

    for removed_fragment in [
        'id="refreshBtn"',
        'id="refreshScriptsBtn"',
        'Actualizar noticias',
        'Actualizar guiones',
        'refreshBtn:',
        'refreshScriptsBtn:',
        'el.refreshBtn',
        'el.refreshScriptsBtn',
    ]:
        assert removed_fragment not in "\n".join([index_source, selectors_source, bootstrap_source])


def test_custom_dropdown_controller_closes_cleanly_and_prunes_stale_wrappers_on_refresh():
    script = r"""
import { createCustomDropdownController } from './js/modules/core/ui/custom-dropdowns.js';

class MockClassList {
  constructor(node) {
    this.node = node;
    this.tokens = new Set();
  }

  setFromString(value) {
    this.tokens = new Set(String(value || '').split(/\s+/).filter(Boolean));
    this._sync();
  }

  add(...tokens) {
    tokens.filter(Boolean).forEach((token) => this.tokens.add(token));
    this._sync();
  }

  remove(...tokens) {
    tokens.forEach((token) => this.tokens.delete(token));
    this._sync();
  }

  contains(token) {
    return this.tokens.has(token);
  }

  _sync() {
    this.node._className = Array.from(this.tokens).join(' ');
  }
}

class MockElement {
  constructor(tagName, ownerDocument) {
    this.tagName = String(tagName || '').toUpperCase();
    this.ownerDocument = ownerDocument;
    this.parentNode = null;
    this.children = [];
    this.dataset = {};
    this.eventListeners = new Map();
    this.attributes = new Map();
    this.classList = new MockClassList(this);
    this._className = '';
    this.hidden = false;
    this.disabled = false;
    this.id = '';
    this.name = '';
    this.value = '';
    this.textContent = '';
    this.options = [];
  }

  get className() {
    return this._className;
  }

  set className(value) {
    this.classList.setFromString(value);
  }

  get isConnected() {
    let current = this;
    while (current) {
      if (current === this.ownerDocument) return true;
      current = current.parentNode;
    }
    return false;
  }

  append(...nodes) {
    nodes.forEach((node) => {
      node.parentNode = this;
      this.children.push(node);
    });
  }

  removeChild(node) {
    const index = this.children.indexOf(node);
    if (index >= 0) {
      this.children.splice(index, 1);
      node.parentNode = null;
    }
  }

  insertAdjacentElement(position, element) {
    if (position !== 'afterend' || !this.parentNode) {
      throw new Error('Unsupported insertAdjacentElement usage in test');
    }

    const siblings = this.parentNode.children;
    const currentIndex = siblings.indexOf(this);
    if (currentIndex === -1) throw new Error('Missing parent linkage');
    element.parentNode = this.parentNode;
    siblings.splice(currentIndex + 1, 0, element);
  }

  setAttribute(name, value) {
    const normalized = String(name);
    const nextValue = String(value);
    this.attributes.set(normalized, nextValue);
    if (normalized === 'class') this.className = nextValue;
    if (normalized === 'id') this.id = nextValue;
    if (normalized.startsWith('data-')) {
      const dataKey = normalized.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      this.dataset[dataKey] = nextValue;
    }
  }

  getAttribute(name) {
    return this.attributes.get(String(name));
  }

  addEventListener(type, handler) {
    const handlers = this.eventListeners.get(type) || [];
    handlers.push(handler);
    this.eventListeners.set(type, handlers);
  }

  dispatchEvent(event) {
    if (!event.target) {
      Object.defineProperty(event, 'target', { value: this, configurable: true });
    }
    Object.defineProperty(event, 'currentTarget', { value: this, configurable: true });

    const handlers = this.eventListeners.get(event.type) || [];
    handlers.forEach((handler) => handler(event));

    if (event.bubbles && this.parentNode) {
      this.parentNode.dispatchEvent(event);
    }
    return true;
  }

  focus() {
    const previous = this.ownerDocument.activeElement;
    if (previous && previous !== this) {
      previous.dispatchEvent(new Event('focusout', { bubbles: true }));
    }
    this.ownerDocument.activeElement = this;
    this.dispatchEvent(new Event('focusin', { bubbles: true }));
  }

  blur() {
    if (this.ownerDocument.activeElement === this) {
      this.ownerDocument.activeElement = null;
    }
  }

  contains(node) {
    if (!node) return false;
    if (node === this) return true;
    return this.children.some((child) => child.contains(node));
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const matcher = createMatcher(selector);
    const results = [];
    const visit = (node) => {
      node.children.forEach((child) => {
        if (matcher(child)) results.push(child);
        visit(child);
      });
    };
    visit(this);
    return results;
  }

  set innerHTML(value) {
    this.children = [];
    this._innerHTML = String(value || '');

    if (this.classList.contains('ui-dropdown__menu')) {
      const pattern = /class="ui-dropdown__option([^"]*)"\s+data-value="([^"]*)"([^>]*)>/g;
      let match;
      while ((match = pattern.exec(this._innerHTML)) !== null) {
        const button = new MockElement('button', this.ownerDocument);
        button.className = `ui-dropdown__option${match[1] || ''}`.trim();
        button.dataset.value = decodeHtml(match[2] || '');
        button.disabled = /disabled/.test(match[3] || '');
        button.parentNode = this;
        this.children.push(button);
      }
      return;
    }

    if (this.classList.contains('ui-dropdown__trigger')) {
      const valueNode = new MockElement('span', this.ownerDocument);
      valueNode.className = 'ui-dropdown__value';
      const chevronNode = new MockElement('span', this.ownerDocument);
      chevronNode.className = 'ui-dropdown__chevron';
      this.append(valueNode, chevronNode);
    }
  }

  get innerHTML() {
    return this._innerHTML || '';
  }
}

class MockDocument {
  constructor() {
    this.eventListeners = new Map();
    this.activeElement = null;
    this.body = new MockElement('body', this);
    this.body.parentNode = this;
  }

  createElement(tagName) {
    return new MockElement(tagName, this);
  }

  addEventListener(type, handler) {
    const handlers = this.eventListeners.get(type) || [];
    handlers.push(handler);
    this.eventListeners.set(type, handlers);
  }

  dispatchEvent(event) {
    const handlers = this.eventListeners.get(event.type) || [];
    handlers.forEach((handler) => handler(event));
    return true;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    return this.body.querySelectorAll(selector);
  }

  contains(node) {
    return this.body.contains(node);
  }
}

function createMatcher(selector) {
  if (selector === '.ui-dropdown') {
    return (node) => node.classList.contains('ui-dropdown');
  }
  if (selector === '.ui-dropdown__option') {
    return (node) => node.classList.contains('ui-dropdown__option');
  }
  if (selector === '.ui-dropdown__value') {
    return (node) => node.classList.contains('ui-dropdown__value');
  }
  if (selector === 'select[data-custom-dropdown]') {
    return (node) => node.tagName === 'SELECT' && Object.hasOwn(node.dataset, 'customDropdown');
  }
  throw new Error(`Unsupported selector in test: ${selector}`);
}

function decodeHtml(value) {
  return String(value || '')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&gt;', '>')
    .replaceAll('&lt;', '<')
    .replaceAll('&amp;', '&');
}

function createOption({ value, label, selected = false, disabled = false }) {
  return {
    value,
    label,
    textContent: label,
    selected,
    disabled,
  };
}

function createSelect(document, id, options) {
  const select = document.createElement('select');
  let currentValue = '';
  select.id = id;
  select.dataset.customDropdown = '';
  select.dataset.dropdownLabel = id;
  select.dataset.dropdownPlaceholder = id;
  select.options = options;
  Object.defineProperty(select, 'value', {
    get() {
      return currentValue;
    },
    set(nextValue) {
      currentValue = String(nextValue ?? '');
      select.options.forEach((option) => {
        option.selected = String(option.value ?? '') === currentValue;
      });
    },
    configurable: true,
  });
  const selected = options.find((option) => option.selected) || options[0] || { value: '' };
  select.value = selected.value;
  return select;
}

const document = new MockDocument();
globalThis.document = document;

const firstSelect = createSelect(document, 'countryFilter', [
  createOption({ value: '', label: 'Países', selected: true }),
  createOption({ value: 'ar', label: 'Argentina' }),
]);
const secondSelect = createSelect(document, 'sourcesFilter', [
  createOption({ value: '0', label: 'Todas las fuentes', selected: true }),
  createOption({ value: '3', label: '3+ fuentes' }),
]);

document.body.append(firstSelect, secondSelect);

const controller = createCustomDropdownController({ root: document });
controller.mountAll();

const wrappers = document.querySelectorAll('.ui-dropdown');
if (wrappers.length !== 2) throw new Error(`expected 2 wrappers after mount, got ${wrappers.length}`);

const [firstWrapper, secondWrapper] = wrappers;
const firstTrigger = firstWrapper.querySelector('.ui-dropdown__value').parentNode;
const secondTrigger = secondWrapper.querySelector('.ui-dropdown__value').parentNode;

firstTrigger.dispatchEvent(new Event('click', { bubbles: true }));
if (!firstWrapper.classList.contains('is-open')) throw new Error('first dropdown should open on trigger click');

secondTrigger.dispatchEvent(new Event('click', { bubbles: true }));
if (firstWrapper.classList.contains('is-open')) throw new Error('opening second dropdown must close the first one');
if (!secondWrapper.classList.contains('is-open')) throw new Error('second dropdown should be the only open wrapper');

const secondOption = secondWrapper.querySelectorAll('.ui-dropdown__option')[1];
secondOption.focus();
secondOption.dispatchEvent(new Event('click', { bubbles: true }));

if (secondWrapper.classList.contains('is-open')) throw new Error('dropdown must close after selecting an option');
if (!secondWrapper.querySelectorAll('.ui-dropdown__option')[1].classList.contains('is-selected')) {
  throw new Error('selected option should be synced after change');
}
if (document.activeElement === secondTrigger) throw new Error('selection should not force trigger focus and keep an open-looking visual state');

document.body.removeChild(firstSelect);
document.body.removeChild(firstWrapper);

const replacementSelect = createSelect(document, 'countryFilter', [
  createOption({ value: '', label: 'Países', selected: true }),
  createOption({ value: 'uy', label: 'Uruguay' }),
]);
document.body.append(replacementSelect);

controller.refreshAll();

const wrappersAfterRefresh = document.querySelectorAll('.ui-dropdown');
if (wrappersAfterRefresh.length !== 2) {
  throw new Error(`expected stale wrappers to be pruned on refresh, got ${wrappersAfterRefresh.length}`);
}
if (wrappersAfterRefresh.some((wrapper) => wrapper.classList.contains('is-open'))) {
  throw new Error('refreshAll must leave every dropdown closed');
}
"""
    result = _run_node(script)
    assert result.returncode == 0, result.stderr


def test_news_list_matches_compact_web_pen_copy_and_scrollbar_tokens_more_closely():
    index_source = _read(INDEX_PATH)
    cards_source = _read(ROOT / "styles" / "components" / "cards.css")
    approval_source = _read(APPROVAL_PATH)

    assert 'Solo titulares, rápidos de escanear y seleccionar.' in index_source
    assert 'Solo titulares, medios de origen y resumen para accionar rápido.' not in index_source

    joined_css = "\n".join([cards_source, approval_source])
    for expected_rule in [
        '.news-panel .section-heading p',
        'color: var(--muted);',
        '.cards--news::-webkit-scrollbar',
        '.cards--news::-webkit-scrollbar-thumb',
        'scrollbar-color:',
        'justify-content: space-between;',
    ]:
        assert expected_rule in joined_css


def test_compact_news_card_markup_exposes_only_country_player_and_sources_meta():
    script = r"""
import { buildApprovalNewsCardMarkup } from './js/modules/features/approval/cards.js';

const markup = buildApprovalNewsCardMarkup({
  cluster_id: 'cluster-7',
  seleccion: 'Argentina',
  jugador: 'Messi',
  tema_principal: 'Messi vuelve a romper marcas en una noche histórica',
  cantidad_fuentes: 9,
  resumen_cluster: 'Texto que ya no debería aparecer en la tarjeta compacta.',
  updated_at: '2026-04-21T20:15:00Z',
});

if (!markup.includes('class="card-title">Messi vuelve a romper marcas en una noche histórica</div>')) {
  throw new Error(`missing compact title markup: ${markup}`);
}

if (!markup.includes('class="card-meta-row"><span>Argentina · Messi · 9 fuentes</span></div>')) {
  throw new Error(`meta row does not match compact contract: ${markup}`);
}

for (const forbidden of ['summary', 'último update', 'ultimo update', 'Ver detalle', 'chip']) {
  if (markup.includes(forbidden)) {
    throw new Error(`unexpected legacy fragment still present: ${forbidden} :: ${markup}`);
  }
}
"""
    result = _run_node(script)
    assert result.returncode == 0, result.stderr


def test_dropdown_styles_no_longer_make_hovered_triggers_look_open():
    forms_source = _read(FORMS_PATH)

    assert '.ui-dropdown__trigger:hover:not(:disabled) {' in forms_source
    assert '.ui-dropdown.is-open .ui-dropdown__trigger {' in forms_source
    assert '.ui-dropdown__trigger:hover:not(:disabled),\n.ui-dropdown.is-open .ui-dropdown__trigger {' not in forms_source


def test_script_selection_cards_keep_only_country_player_title_and_premium_selected_style():
    script = r"""
import { buildScriptSelectionCardMarkup } from './js/modules/features/scripts/index.js';

const markup = buildScriptSelectionCardMarkup({
  draft_id: 'draft-77',
  seleccion: 'Argentina',
  jugador: 'Messi',
  tema_principal: 'Editar guion premium sin ruido visual',
  estado: 'borrador_generado',
  guion_draft: 'Este resumen ya no debería verse en la card.',
  tag_editorial: 'emotividad',
}, { selected: true });

for (const expected of [
  'class="script-selection-card is-selected"',
  'class="meta script-selection-card__eyebrow">Argentina · Messi</div>',
  'class="topic">Editar guion premium sin ruido visual</div>',
]) {
  if (!markup.includes(expected)) {
    throw new Error(`missing selected script card fragment: ${expected} :: ${markup}`);
  }
}

for (const forbidden of ['summary', 'chip', 'Estado:', 'borrador_generado', 'Este resumen ya no debería verse']) {
  if (markup.includes(forbidden)) {
    throw new Error(`script selection card should stay minimal: ${forbidden} :: ${markup}`);
  }
}
"""
    result = _run_node(script)
    assert result.returncode == 0, result.stderr

    approval_source = _read(APPROVAL_PATH)
    toast_source = _read(TOAST_PATH)

    for expected_rule in [
        '.script-selection-list {',
        'padding: 0 8px 2px;',
        'scrollbar-width: none !important;',
        '.script-selection-list::-webkit-scrollbar {',
        '.script-selection-card {',
        'justify-self: center;',
        'width: 100%;',
        'border-radius: 0;',
        '.script-selection-card.is-selected {',
        'radial-gradient(circle at top left',
        'rgba(255, 214, 133, 0.32)',
        'box-shadow:',
        '.script-selection-card.is-processed {',
        'rgba(0, 232, 143, 0.24)',
        'border-color: rgba(0, 232, 143, 0.46) rgba(0, 232, 143, 0.14);',
        'inset 0 1px 0 rgba(158, 247, 207, 0.1)',
        '0 14px 24px -22px rgba(0, 232, 143, 0.22)',
        '.script-selection-card__dismiss {',
        '.script-selection-card__status {',
    ]:
        assert expected_rule in approval_source

    for expected_rule in [
        '.toast {',
        'border-radius: 0;',
        "font-family: 'JetBrains Mono', monospace;",
        'border-left: 3px solid var(--accent);',
        'text-transform: uppercase;',
    ]:
        assert expected_rule in toast_source


def test_processed_script_selection_card_gets_green_state_and_manual_dismiss_button():
    script = r"""
import { buildScriptSelectionCardMarkup } from './js/modules/features/scripts/index.js';

const markup = buildScriptSelectionCardMarkup({
  draft_id: 'draft-processed',
  seleccion: 'Argentina',
  jugador: 'Messi',
  tema_principal: 'Guion listo para descargar',
  estado_guion: 'publicado',
  doc_id: 'doc-1',
}, { selected: true });

for (const expected of [
  'class="script-selection-card is-selected is-processed"',
  'class="script-selection-card__status">Procesado</span>',
  'data-action="dismiss-processed-script"',
  'aria-label="Ocultar guion procesado"',
  'data-script-id="draft-processed"',
]) {
  if (!markup.includes(expected)) {
    throw new Error(`missing processed card fragment: ${expected} :: ${markup}`);
  }
}
"""
    result = _run_node(script)
    assert result.returncode == 0, result.stderr
