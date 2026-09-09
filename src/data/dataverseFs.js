import { installDataverseFsHud } from './dataverseFsHud.js';
/**
 * @module dataverseFs
 * Dynamics 365 Field Service / Dataverse dispatch layer for God's Eye View.
 * Default path: GeoJSON sample or VITE_DATAVERSE_FS_GEOJSON_URL (adapter).
 * Browser does not call Dataverse OData by default — secrets stay in the adapter.
 */

import { createLocalGeoJsonLayer } from './localGeojson.js';

export const DATAVERSE_FS_OVERLAY_SOURCE_ID = 'dataverse-fs';

const ALLOWED_KINDS = new Set(['customer', 'site', 'asset', 'workorder', 'resource', 'contact', 'trail']);

/**
 * Normalize a GeoJSON FeatureCollection for the FS layer (unit-testable, no Cesium).
 * Drops features without finite lon/lat; keeps kind/id/name when present.
 * @param {object} collection
 * @returns {{type:string, features:object[]}}
 */

function firstString(...vals) {
  for (const v of vals) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return undefined;
}

/** Bill: href. Aliases dynamicsUrl, url */
export function resolveDynamicsHref(props = {}) {
  return firstString(props.href, props.dynamicsUrl, props.url);
}

/** Thumb. Aliases image, imageUrl, photo, avatar */
export function resolveFeatureImage(props = {}) {
  return firstString(props.image, props.imageUrl, props.photo, props.avatar);
}

export function normalizeDataverseFsCollection(collection) {
  if (!collection || collection.type !== 'FeatureCollection' || !Array.isArray(collection.features)) {
    return { type: 'FeatureCollection', features: [] };
  }
  const features = [];
  for (const f of collection.features) {
    const geom = f?.geometry;
    if (!geom || !Array.isArray(geom.coordinates)) continue;
    const props = f.properties && typeof f.properties === 'object' ? { ...f.properties } : {};
    const kind = props.kind ? String(props.kind) : 'site';
    if (props.kind && !ALLOWED_KINDS.has(kind)) continue;

    let geometry = null;
    if (geom.type === 'Point') {
      if (geom.coordinates.length < 2) continue;
      if (geom.coordinates[0] == null || geom.coordinates[1] == null) continue;
      const lon = Number(geom.coordinates[0]);
      const lat = Number(geom.coordinates[1]);
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
      geometry = { type: 'Point', coordinates: [lon, lat] };
    } else if (geom.type === 'LineString') {
      // GPS trails under resources (day-sim kind=trail)
      const coords = [];
      for (const c of geom.coordinates) {
        if (!Array.isArray(c) || c.length < 2) continue;
        const lon = Number(c[0]);
        const lat = Number(c[1]);
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
        coords.push([lon, lat]);
      }
      if (coords.length < 2) continue;
      geometry = { type: 'LineString', coordinates: coords };
    } else {
      continue;
    }

    features.push({
      type: 'Feature',
      geometry,
      properties: {
        kind,
        entity: props.entity ? String(props.entity) : 'unknown',
        id: props.id != null ? String(props.id) : undefined,
        name: props.name != null ? String(props.name) : 'Untitled',
        status: props.status,
        href: resolveDynamicsHref(props),
        image: resolveFeatureImage(props),
        priority: props.priority,
        updated: props.updated,
        staleSec: props.staleSec,
        resourceId: props.resourceId,
        color: props.color,
        title: props.title,
        wo: props.wo,
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
  name: 'Fleet · Resources · Assets',
  color: '#742774',
  icon: 'DV',
  source: 'NukaSoft Dispatch',
  labels: true,
  labelMax: 800,
  labelGridPx: 140,
  transformCollection: normalizeDataverseFsCollection,
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

if (typeof window !== 'undefined') installDataverseFsHud();
