import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDataverseFsCollection } from './dataverseFs.js';

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