/**
 * @module dataverseFs
 * Dynamics 365 Field Service / Dataverse dispatch layer for God's Eye View.
 * Default path: GeoJSON sample or VITE_DATAVERSE_FS_GEOJSON_URL (adapter).
 * Browser does not call Dataverse OData by default — secrets stay in the adapter.
 */

import { createLocalGeoJsonLayer } from './localGeojson.js';

export const DATAVERSE_FS_OVERLAY_SOURCE_ID = 'dataverse-fs';

const ALLOWED_KINDS = new Set(['customer', 'site', 'asset', 'workorder', 'resource', 'contact']);

/**
 * Normalize a GeoJSON FeatureCollection for the FS layer (unit-testable, no Cesium).
 * Drops features without finite lon/lat; keeps kind/id/name when present.
 * @param {object} collection
 * @returns {{type:string, features:object[]}}
 */
export function normalizeDataverseFsCollection(collection) {
  if (!collection || collection.type !== 'FeatureCollection' || !Array.isArray(collection.features)) {
    return { type: 'FeatureCollection', features: [] };
  }
  const features = [];
  for (const f of collection.features) {
    const coords = f?.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) continue;
    if (coords[0] == null || coords[1] == null) continue;
    const lon = Number(coords[0]);
    const lat = Number(coords[1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    const props = f.properties && typeof f.properties === 'object' ? { ...f.properties } : {};
    if (props.kind && !ALLOWED_KINDS.has(String(props.kind))) {
      // keep unknown kinds out of semantic success counts, but still allow render if coords valid
      // for v1 we skip unknown kinds to avoid false greens
      continue;
    }
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lon, lat] },
      properties: {
        kind: props.kind ? String(props.kind) : 'site',
        entity: props.entity ? String(props.entity) : 'unknown',
        id: props.id != null ? String(props.id) : undefined,
        name: props.name != null ? String(props.name) : 'Untitled',
        status: props.status,
        priority: props.priority,
        href: props.href,
        updated: props.updated,
        staleSec: props.staleSec,
      },
    });
  }
  return { type: 'FeatureCollection', features };
}

function resolveGeoJsonUrl() {
  const fromEnv = typeof import.meta !== 'undefined' && import.meta.env
    ? import.meta.env.VITE_DATAVERSE_FS_GEOJSON_URL
    : undefined;
  if (fromEnv && String(fromEnv).trim()) return String(fromEnv).trim();
  return '/samples/dataverse-fs-ww-demo.geojson';
}

const dataverseFsLayer = createLocalGeoJsonLayer({
  id: DATAVERSE_FS_OVERLAY_SOURCE_ID,
  url: resolveGeoJsonUrl(),
  name: 'Dynamics Field Service',
  color: '#742774',
  icon: 'DV',
  source: 'Dataverse FS',
  labels: true,
  labelMax: 800,
  labelGridPx: 140,
});

export function getDataverseFsLayer() {
  return dataverseFsLayer;
}

export async function setDataverseFsEnabled(viewer, enabled) {
  if (!viewer) return;
  if (enabled) await dataverseFsLayer.enable(viewer);
  else await dataverseFsLayer.disable(viewer);
}

export async function refreshDataverseFs(viewer) {
  if (!viewer) return;
  await dataverseFsLayer.disable(viewer);
  await dataverseFsLayer.enable(viewer);
}

export default dataverseFsLayer;