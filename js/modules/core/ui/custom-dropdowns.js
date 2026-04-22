const CHEVRON_ICON = `
  <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
    <path d="m7 10 5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"></path>
  </svg>
`;

const CHECK_ICON = `
  <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
    <path d="m5 12 4.2 4.2L19 6.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"></path>
  </svg>
`;

export function createCustomDropdownController({ root = document } = {}) {
  const instances = new Map();
  let activeInstance = null;

  function isConnected(node) {
    if (!node) return false;
    if (typeof node.isConnected === 'boolean') return node.isConnected;
    return !!node.parentNode;
  }

  function getSelectKey(select) {
    return select.id || select.name || select.dataset.dropdownLabel || `dropdown-${instances.size}`;
  }

  function getSelectOptions(select) {
    const currentValue = select.value;
    return Array.from(select.options).map((option) => ({
      value: option.value,
      label: option.textContent || option.label || option.value,
      disabled: option.disabled,
      selected: option.value === currentValue,
    }));
  }

  function getTriggerLabel(select, options) {
    const selectedOption = options.find((option) => option.selected) || options[0];
    const placeholder = select.dataset.dropdownPlaceholder || select.dataset.dropdownLabel || selectedOption?.label || 'Seleccionar';
    if (!selectedOption) return placeholder;
    return selectedOption.label || placeholder;
  }

  function close(instance) {
    if (!instance) return;
    instance.wrapper.classList.remove('is-open');
    instance.trigger.setAttribute('aria-expanded', 'false');
    instance.menu.hidden = true;
    if (activeInstance === instance) {
      activeInstance = null;
    }
  }

  function closeAll(except = null) {
    instances.forEach((instance) => {
      if (instance !== except) close(instance);
    });
  }

  function open(instance) {
    if (!isConnected(instance?.select) || !isConnected(instance?.wrapper)) return;
    closeAll(instance);
    instance.wrapper.classList.add('is-open');
    instance.trigger.setAttribute('aria-expanded', 'true');
    instance.menu.hidden = false;
    activeInstance = instance;
  }

  function destroyInstance(instance) {
    if (!instance) return;
    close(instance);
    if (instance.wrapper.parentNode) {
      instance.wrapper.parentNode.removeChild(instance.wrapper);
    }
    if (instances.get(instance.key) === instance) {
      instances.delete(instance.key);
    }
  }

  function pruneDisconnectedInstances() {
    Array.from(instances.values()).forEach((instance) => {
      if (isConnected(instance.select) && isConnected(instance.wrapper)) return;
      destroyInstance(instance);
    });
  }

  function syncInstance(instance) {
    const options = getSelectOptions(instance.select);
    const label = getTriggerLabel(instance.select, options);
    instance.value.textContent = label;
    instance.trigger.dataset.value = label;
    instance.menu.innerHTML = options.map((option) => {
      const stateClass = option.selected ? ' is-selected' : '';
      return `
        <button
          type="button"
          class="ui-dropdown__option${stateClass}"
          data-value="${escapeAttribute(option.value)}"
          ${option.disabled ? 'disabled' : ''}
        >
          <span class="ui-dropdown__option-label">${escapeHtml(option.label)}</span>
          <span class="ui-dropdown__option-check" aria-hidden="true">${CHECK_ICON}</span>
        </button>
      `;
    }).join('');

    instance.menu.querySelectorAll('.ui-dropdown__option').forEach((button) => {
      button.addEventListener('click', () => {
        const nextValue = button.dataset.value ?? '';
        instance.select.value = nextValue;
        instance.select.dispatchEvent(new Event('input', { bubbles: true }));
        instance.select.dispatchEvent(new Event('change', { bubbles: true }));
        syncInstance(instance);
        close(instance);
      });
    });
  }

  function closeIfFocusLeaves(instance) {
    queueMicrotask(() => {
      const activeElement = root.activeElement || document.activeElement;
      if (instance.wrapper.contains(activeElement)) return;
      close(instance);
    });
  }

  function ensureInstance(select) {
    const key = getSelectKey(select);
    const existing = instances.get(key);
    if (existing && existing.select === select) {
      syncInstance(existing);
      return existing;
    }

    if (existing) {
      destroyInstance(existing);
    }

    const wrapper = root.createElement('div');
    wrapper.className = 'ui-dropdown';
    wrapper.dataset.dropdownFor = key;

    const trigger = root.createElement('button');
    trigger.type = 'button';
    trigger.className = 'ui-dropdown__trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.innerHTML = `
      <span class="ui-dropdown__value"></span>
      <span class="ui-dropdown__chevron" aria-hidden="true">${CHEVRON_ICON}</span>
    `;

    const menu = root.createElement('div');
    menu.className = 'ui-dropdown__menu';
    menu.hidden = true;

    select.classList.add('ui-native-select');
    select.hidden = true;
    select.insertAdjacentElement('afterend', wrapper);
    wrapper.append(trigger, menu);

    const instance = {
      key,
      select,
      wrapper,
      trigger,
      value: trigger.querySelector('.ui-dropdown__value'),
      menu,
    };

    trigger.addEventListener('click', () => {
      if (wrapper.classList.contains('is-open')) {
        close(instance);
        return;
      }
      open(instance);
    });

    trigger.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        open(instance);
      }
      if (event.key === 'Escape') {
        close(instance);
      }
    });

    wrapper.addEventListener('focusout', () => {
      closeIfFocusLeaves(instance);
    });

    select.addEventListener('change', () => {
      syncInstance(instance);
      close(instance);
    });
    instances.set(key, instance);
    syncInstance(instance);
    return instance;
  }

  function mountAll() {
    pruneDisconnectedInstances();
    root.querySelectorAll('select[data-custom-dropdown]').forEach((select) => {
      ensureInstance(select);
    });
  }

  function refreshAll() {
    pruneDisconnectedInstances();
    closeAll();
    root.querySelectorAll('select[data-custom-dropdown]').forEach((select) => {
      const instance = ensureInstance(select);
      close(instance);
    });
  }

  root.addEventListener('click', (event) => {
    if (!activeInstance) return;
    if (activeInstance.wrapper.contains(event.target) || activeInstance.select.contains(event.target)) return;
    close(activeInstance);
  });

  root.addEventListener('focusin', (event) => {
    if (!activeInstance) return;
    if (activeInstance.wrapper.contains(event.target) || activeInstance.select.contains(event.target)) return;
    close(activeInstance);
  });

  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeAll();
    }
  });

  return {
    mountAll,
    refreshAll,
    closeAll,
  };
}

function escapeHtml(value) {
  return (value || '')
    .toString()
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll('`', '&#96;');
}
