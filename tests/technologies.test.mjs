import test from 'node:test';
import assert from 'node:assert/strict';
import { TECHNOLOGIES } from '../lib/technologies.mjs';

test('technology prerequisites reference distinct existing nodes and form an acyclic graph', () => {
  const catalog = new Map(TECHNOLOGIES.map(t => [t.name, t]));
  assert.equal(catalog.size, TECHNOLOGIES.length);
  assert.equal(new Set(TECHNOLOGIES.map(t => t.id)).size, TECHNOLOGIES.length);
  const done = new Set(), visiting = new Set();
  function visit(name) {
    assert.ok(catalog.has(name), `missing prerequisite ${name}`);
    assert.ok(!visiting.has(name), `cycle at ${name}`);
    if (done.has(name)) return;
    visiting.add(name);
    for (const parent of catalog.get(name).prerequisites) visit(parent);
    visiting.delete(name); done.add(name);
  }
  for (const t of TECHNOLOGIES) visit(t.name);
});
