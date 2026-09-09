/**
 * Pick HUD for Fleet · Resources · Assets (dataverse-fs).
 * Bill lock: name · imageUrl · dynamicsUrl (do NOT use `pic`).
 * Rich extras by kind: contact/asset/workorder/customer/resource/site.
 */
let installed = false;
let root = null;

const RICH_FIELDS = {
  contact: [
    ['title', 'Title'],
    ['phone', 'Phone'],
    ['email', 'Email'],
  ],
  asset: [
    ['assetNumber', 'Asset #'],
    ['accountName', 'Account'],
    ['siteName', 'Site'],
  ],
  workorder: [
    ['customerName', 'Customer'],
    ['siteName', 'Site'],
    ['priority', 'Priority'],
    ['title', 'Title'],
  ],
  customer: [
    ['title', 'Title'],
    ['phone', 'Phone'],
  ],
  resource: [
    ['title', 'Title'],
    ['status', 'Status'],
  ],
  site: [
    ['status', 'Status'],
  ],
};

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
    <dl class="dv-hud-fields"></dl>
    <div class="dv-hud-actions">
      <a class="dv-hud-link" target="_blank" rel="noopener noreferrer">Open in Dynamics</a>
      <a class="dv-hud-link secondary" target="_blank" rel="noopener noreferrer" hidden></a>
    </div>
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

/** Canonical Bill props — imageUrl / dynamicsUrl first; never `pic`. */
function resolveImage(props) {
  for (const k of ['imageUrl', 'image', 'photo', 'avatar']) {
    const v = props[k];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return '';
}

function resolveDynamics(props) {
  for (const k of ['dynamicsUrl', 'href', 'url']) {
    const v = props[k];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return '';
}

function fillFields(el, kind, props) {
  const dl = el.querySelector('.dv-hud-fields');
  dl.innerHTML = '';
  const spec = RICH_FIELDS[kind] || [];
  for (const [key, label] of spec) {
    const val = props[key];
    if (val == null || String(val).trim() === '') continue;
    if (key === 'status' && props.status) continue; // already in header for some
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = String(val);
    dl.append(dt, dd);
  }
}

function setLink(anchor, href, label) {
  if (href) {
    anchor.hidden = false;
    anchor.href = href;
    anchor.textContent = label;
  } else {
    anchor.hidden = true;
    anchor.removeAttribute('href');
  }
}

function show(detail) {
  if (!detail || detail.layerId !== 'dataverse-fs') return;
  const el = ensureRoot();
  const props = propsFromDetail(detail);
  const kind = String(props.kind || 'feature');
  if (kind === 'trail') {
    el.hidden = true;
    return;
  }
  const name = detail.label || props.name || 'Untitled';
  const status = props.status || '';
  const image = resolveImage(props);
  const dynamicsUrl = resolveDynamics(props);

  el.querySelector('.dv-hud-name').textContent = name;
  el.querySelector('.dv-hud-kind').textContent = kind.toUpperCase();
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

  fillFields(el, kind, props);

  const primary = el.querySelector('.dv-hud-link:not(.secondary)');
  const secondary = el.querySelector('.dv-hud-link.secondary');
  setLink(primary, dynamicsUrl, 'Open in Dynamics');

  // Extra deep links when Bill ships them
  if (kind === 'workorder' && props.customerDynamicsUrl) {
    setLink(secondary, String(props.customerDynamicsUrl), 'Open customer');
  } else if (kind === 'contact' && props.bookableResourceUrl) {
    setLink(secondary, String(props.bookableResourceUrl), 'Open resource');
  } else if (kind === 'asset' && props.accountDynamicsUrl) {
    setLink(secondary, String(props.accountDynamicsUrl), 'Open account');
  } else {
    setLink(secondary, '', '');
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
      width: min(340px, calc(100vw - 32px));
      padding: 12px 14px 14px;
      border: 1px solid rgba(116, 39, 116, 0.65);
      border-radius: 10px;
      background: rgba(10, 12, 18, 0.94);
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
      width: 64px; height: 64px; border-radius: 8px; object-fit: cover;
      background: #1a2030; border: 1px solid rgba(255,255,255,0.12); flex: 0 0 auto;
    }
    #dataverse-fs-hud .dv-hud-kind {
      font-size: 10px; letter-spacing: 0.08em; color: #c9a0c9; margin-bottom: 2px;
    }
    #dataverse-fs-hud .dv-hud-name { font-size: 15px; font-weight: 650; }
    #dataverse-fs-hud .dv-hud-status { color: #8fa3bf; margin-top: 2px; text-transform: lowercase; }
    #dataverse-fs-hud .dv-hud-fields {
      display: grid; grid-template-columns: auto 1fr; gap: 4px 10px;
      margin: 10px 0 0; padding: 0; 
    }
    #dataverse-fs-hud .dv-hud-fields dt { color: #8fa3bf; margin: 0; }
    #dataverse-fs-hud .dv-hud-fields dd { margin: 0; color: #e8eef8; }
    #dataverse-fs-hud .dv-hud-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
    #dataverse-fs-hud .dv-hud-link {
      display: inline-block; padding: 7px 10px;
      border-radius: 6px; background: #742774; color: #fff; text-decoration: none; font-weight: 600;
    }
    #dataverse-fs-hud .dv-hud-link.secondary { background: transparent; border: 1px solid #742774; color: #e0b0e0; }
    #dataverse-fs-hud .dv-hud-link[hidden] { display: none !important; }
  `;
  document.head.appendChild(style);
  window.addEventListener('gev:entity-selected', (ev) => show(ev.detail));
}
