import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDataverseFsCollection, resolveDynamicsHref, resolveFeatureImage } from './dataverseFs.js';

test('normalize drops null coords and empty input', () => {
  assert.deepEqual(normalizeDataverseFsCollection(null).features, []);
  assert.deepEqual(normalizeDataverseFsCollection({ type: 'FeatureCollection', features: [] }).features, []);
  const bad = {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', geometry: { type: 'Point', coordinates: [null, 1] }, properties: { kind: 'site', id: '1', name: 'x' } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [-85.67, 42.96] }, properties: { kind: 'site', id: '2', name: 'ok' } },
    ],
  };
  const out = normalizeDataverseFsCollection(bad);
  assert.equal(out.features.length, 1);
  assert.equal(out.features[0].properties.id, '2');
  assert.equal(out.features[0].properties.name, 'ok');
  assert.equal(out.features[0].properties.kind, 'site');
});

test('normalize skips unknown kinds', () => {
  const fc = {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', geometry: { type: 'Point', coordinates: [1, 2] }, properties: { kind: 'spaceship', id: '9', name: 'nope' } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [3, 4] }, properties: { kind: 'workorder', id: '8', name: 'WO' } },
    ],
  };
  const out = normalizeDataverseFsCollection(fc);
  assert.equal(out.features.length, 1);
  assert.equal(out.features[0].properties.kind, 'workorder');
});

test('normalize keeps trail LineStrings and drops short trails', () => {
  const out = normalizeDataverseFsCollection({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [[-85.67, 42.96], [-85.66, 42.97]] },
        properties: { kind: 'trail', id: 'trail-a', name: 'Alpha trail', status: 'traveling' },
      },
      {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [[-85.67, 42.96]] },
        properties: { kind: 'trail', id: 'bad', name: 'short' },
      },
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [-85.67, 42.96] },
        properties: { kind: 'workorder', id: 'wo-1', name: 'WW-DEMO-101', status: 'inprogress' },
      },
    ],
  });
  assert.equal(out.features.length, 2);
  assert.equal(out.features[0].geometry.type, 'LineString');
  assert.equal(out.features[0].properties.kind, 'trail');
  assert.equal(out.features[1].properties.status, 'inprogress');
});


test('resolveDynamicsHref and image aliases', () => {
  assert.equal(resolveDynamicsHref({ dynamicsUrl: 'https://example/d' }), 'https://example/d');
  assert.equal(resolveDynamicsHref({ href: 'https://example/h' }), 'https://example/h');
  assert.equal(resolveFeatureImage({ imageUrl: 'https://img/a.png' }), 'https://img/a.png');
  const out = normalizeDataverseFsCollection({
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-85.67, 42.96] },
      properties: {
        kind: 'workorder',
        id: 'WO-1',
        name: 'Test WO',
        status: 'inprogress',
        dynamicsUrl: 'https://nukasoft.crm.dynamics.com/main.aspx?etn=msdyn_workorder&id=1',
        imageUrl: 'https://ui-avatars.com/api/?name=WO',
      },
    }],
  });
  assert.equal(out.features[0].properties.href.includes('msdyn_workorder'), true);
  assert.ok(out.features[0].properties.image);
});
