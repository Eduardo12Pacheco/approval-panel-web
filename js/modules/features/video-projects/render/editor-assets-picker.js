import { escapeHtmlCore } from '../../../core/ui/escape-html.js';

function buildAssetCard({ asset, rowId }) {
  const title = escapeHtmlCore(asset.title || 'Asset');
  const source = escapeHtmlCore(asset.source || 'Asset');
  const dimensions = asset.dimensions ? ` · ${escapeHtmlCore(asset.dimensions)}` : '';
  const url = escapeHtmlCore(asset.url || '');
  const selectedClass = asset.isSelected ? 'is-selected' : '';

  return `
    <button
      class="video-editor-assets-card ${selectedClass}"
      type="button"
      data-action="assign-row-asset"
      data-row-id="${escapeHtmlCore(rowId || '')}"
      data-asset-url="${url}"
      aria-pressed="${asset.isSelected ? 'true' : 'false'}"
      title="Asignar ${title}"
    >
      <span class="video-editor-assets-card__media">
        ${asset.url
          ? `<img src="${url}" alt="${title}" loading="lazy" decoding="async" referrerpolicy="no-referrer" />`
          : '<span>Sin preview</span>'}
      </span>
      <span class="video-editor-assets-card__meta">
        <strong>${title}</strong>
        <small>${source}${dimensions}</small>
      </span>
    </button>
  `;
}

export function buildEditorAssetsPicker({ row, assets = [], uploading = false } = {}) {
  if (!row) {
    return '<p class="video-projects-empty">Seleccioná una fila para asignarle una imagen.</p>';
  }

  const rowId = row.id || '';
  const hasAssets = Array.isArray(assets) && assets.length > 0;

  return `
    <div class="video-editor-assets-picker">
      <div class="video-editor-assets-picker__header">
        <div>
          <span class="video-editor-control__label">Assets</span>
          <p>Elegí una imagen existente para esta fila o subí una nueva.</p>
        </div>
        <label class="video-editor-assets-picker__upload">
          <input type="file" accept="image/jpeg,image/png,image/webp" data-action="upload-assets-image" data-row-id="${escapeHtmlCore(rowId)}" ${uploading ? 'disabled' : ''} />
          <span>${uploading ? 'Subiendo…' : 'Subir'}</span>
        </label>
      </div>
      ${hasAssets
        ? `<div class="video-editor-assets-grid">${assets.map((asset) => buildAssetCard({ asset, rowId })).join('')}</div>`
        : '<p class="video-projects-empty">No hay imágenes seleccionadas ni uploads custom todavía.</p>'}
    </div>
  `;
}
