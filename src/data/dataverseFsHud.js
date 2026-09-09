/**
 * Pick HUD for Fleet · Resources · Assets (dataverse-fs).
 * Shows name + thumb + Open in Dynamics (href / dynamicsUrl / url).
 */
let installed = false;
let root = null;

function ensureRoot() {
  if (root && document.body.contains(root)) return root;
  root = document.createElement('aside');
  root.id = 'dataverse-fs-hud';
  root.setAttribute('aria-live', 'polite');
  root.hidden = true;
  root.innerHTML = `
    <button type="button" class="dv-hud-close" aria-label="Close">×</button>
    <div class="dv-hud-row">
      <img class="dv-hud-pic" alt="" hidden />
      <div class="dv-hud-meta">
        <div class="dv-hud-kind"></div>
        <div class="dv-hud-name"></div>
        <div class="dv-hud-status"></div>
      </div>
    </div>
    <a class="dv-hud-link" target="_blank" rel="noopener noreferrer">Open in Dynamics</a>
  `;
  document.body.appendChild(root);
  root.querySelector('.dv-hud-close').addEventListener('click', () => {
    root.hidden = true;
  });
  return root;
}

function propsFromDetail(detail) {
  const raw = detail?.properties || {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const out = {};
    for (const [k, v] of Object.entries(raw)) {
      out[k] = v && typeof v.getValue === 'function' ? v.getValue() : v;
    }
    return out;
  }
  return {};
}

function show(detail) {
  if (!detail || detail.layerId !== 'dataverse-fs') return;
  const el = ensureRoot();
  const props = propsFromDetail(detail);
  const name = detail.label || props.name || props.title || 'Untitled';
  const kind = props.kind || 'feature';
  const status = props.status || '';
  const href = props.href || props.dynamicsUrl || props.url || '';
  const image = props.image || props.imageUrl || props.photo || props.avatar || '';

  el.querySelector('.dv-hud-name').textContent = name;
  el.querySelector('.dv-hud-kind').textContent = String(kind).toUpperCase();
  el.querySelector('.dv-hud-status').textContent = status ? String(status) : '';

  const pic = el.querySelector('.dv-hud-pic');
  if (image) {
    pic.hidden = false;
    pic.src = image;
    pic.alt = name;
  } else {
    pic.hidden = true;
    pic.removeAttribute('src');
  }

  const link = el.querySelector('.dv-hud-link');
  if (href) {
    link.hidden = false;
    link.href = href;
    link.textContent = 'Open in Dynamics';
  } else {
    link.hidden = true;
    link.removeAttribute('href');
  }
  el.hidden = false;
}

export function installDataverseFsHud() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const style = document.createElement('style');
  style.textContent = `
    #dataverse-fs-hud {
      position: fixed; z-index: 40; right: 18px; bottom: 110px;
      width: min(320px, calc(100vw - 32px));
      padding: 12px 14px 14px;
      border: 1px solid rgba(116, 39, 116, 0.65);
      border-radius: 10px;
      background: rgba(10, 12, 18, 0.92);
      color: #e8eef8;
      font: 12px/1.35 ui-sans-serif, system-ui, sans-serif;
      box-shadow: 0 8px 28px rgba(0,0,0,0.45);
      backdrop-filter: blur(8px);
    }
    #dataverse-fs-hud[hidden] { display: none !important; }
    #dataverse-fs-hud .dv-hud-close {
      position: absolute; top: 6px; right: 8px;
      border: 0; background: transparent; color: #9ab; font-size: 18px; cursor: pointer;
    }
    #dataverse-fs-hud .dv-hud-row { display: flex; gap: 12px; align-items: center; }
    #dataverse-fs-hud .dv-hud-pic {
      width: 56px; height: 56px; border-radius: 8px; object-fit: cover;
      background: #1a2030; border: 1px solid rgba(255,255,255,0.12);
    }
    #dataverse-fs-hud .dv-hud-kind {
      font-size: 10px; letter-spacing: 0.08em; color: #c9a0c9; margin-bottom: 2px;
    }
    #dataverse-fs-hud .dv-hud-name { font-size: 14px; font-weight: 600; }
    #dataverse-fs-hud .dv-hud-status { color: #8fa3bf; margin-top: 2px; text-transform: lowercase; }
    #dataverse-fs-hud .dv-hud-link {
      display: inline-block; margin-top: 10px; padding: 7px 10px;
      border-radius: 6px; background: #742774; color: #fff; text-decoration: none; font-weight: 600;
    }
    #dataverse-fs-hud .dv-hud-link[hidden] { display: none !important; }
  `;
  document.head.appendChild(style);
  window.addEventListener('gev:entity-selected', (ev) => show(ev.detail));
}
