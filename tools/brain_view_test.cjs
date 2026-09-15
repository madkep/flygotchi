const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');
const assert = require('node:assert/strict');
const sample = runInNewContext(readFileSync('web/brain-view.js', 'utf8') + '; sampleBrainView;');
const frame = {
  nodes: Array.from({ length: 800 }, (_, i) => ({ id: String(i), side: i % 2 ? 'L' : 'R', super_class: i % 3 ? 'optic' : 'motor', activity: i / 800 })),
  edges: Array.from({ length: 900 }, (_, i) => ({ from: i % 800, to: (i + 2) % 800, weight: 1 })),
};
const original = JSON.stringify(frame);
const view = sample(frame);
assert.equal(view.nodes.length, 160);
assert.ok(view.edges.length <= 180);
const ids = new Set(view.nodes.map(n => n.sourceIndex));
assert.equal(ids.size, 160);
assert.ok(view.edges.every(e => ids.has(e.from) && ids.has(e.to)));
assert.equal(new Set(view.nodes.map(n => `${n.super_class}:${n.side}`)).size, 4);
assert.equal(JSON.stringify(frame), original, 'sampling must not alter simulation telemetry');
assert.equal(JSON.stringify(sample(frame)), JSON.stringify(view), 'sampling must stay stable between frames');
assert.equal(sample(null).nodes.length, 0);
assert.equal(sample({ nodes: frame.nodes.slice(0, 4), edges: [] }).nodes.length, 4);
console.log('Brain view: limits, endpoint mapping, anatomical groups, stability and source preservation passed.');
