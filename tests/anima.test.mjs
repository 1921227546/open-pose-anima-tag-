import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';

const vite = await createServer({
  server: { middlewareMode: true, hmr: false, ws: false },
  optimizeDeps: { noDiscovery: true, include: [] },
  appType: 'custom',
});
const api = await vite.ssrLoadModule('/src/anima.ts');
after(() => vite.close());

const catalog = JSON.parse(await readFile(new URL('../public/data/catalog.json', import.meta.url)));
const byId = new Map(catalog.items.map((item) => [item.id, item]));
const pose = byId.get('full_single_P001');
const costume = byId.get('SPR-0001');
const pairPose = byId.get('pair60_P053');
const sideLying = byId.get('full_single_P050');

test('pose tags describe stance and gesture', () => {
  const tags = api.poseTags(pose);
  assert.ok(tags.includes('sitting'));
  assert.ok(tags.includes('arched back'));
  assert.ok(tags.includes('one knee up'));
});

test('the viewing angle adds a composition tag', () => {
  assert.ok(api.poseTags(pose, 'low').includes('from below'));
  assert.ok(api.poseTags(pose, 'high').includes('from above'));
  assert.ok(!api.poseTags(pose, 'front').some((tag) => tag.startsWith('from ')));
});

test('a category never overrides the stance named in the title', () => {
  const tags = api.poseTags(sideLying);
  assert.ok(tags.includes('lying'));
  assert.ok(!tags.includes('sitting'));
});

test('costume modifiers stay attached to their garment', () => {
  const tags = api.costumeTags(costume);
  assert.ok(tags.includes('mini skirt'));
  assert.ok(!tags.includes('mini'));
  assert.ok(!tags.includes('skirt'));
  assert.ok(tags.includes('coat'));
  assert.ok(tags.includes('sneakers'));
});

test('two-figure poses use a matching subject tag', () => {
  assert.ok(api.animaTagPrompt({ pose: pairPose }).includes('2girls'));
  assert.ok(!api.animaTagPrompt({ pose: pairPose }).includes('1girl'));
  assert.ok(api.animaTagPrompt({ pose }).includes('1girl, solo'));
});

test('the tag prompt follows the Anima 1.0 conventions', () => {
  const text = api.animaTagPrompt({ pose, costume, angle: 'low' });
  assert.ok(text.startsWith('masterpiece, best quality, score_7'));
  assert.match(text, /score_7/);
  const underscored = text
    .split(', ')
    .filter((tag) => tag.includes('_') && !/^score_\d$/.test(tag));
  assert.deepEqual(underscored, [], 'Anima tags use spaces, not underscores');
  assert.equal(/\n/.test(text), false);
  assert.ok(text.includes('from below'));
  assert.ok(text.endsWith('clean lineart, soft shading'));
  const tags = text.split(', ');
  assert.equal(new Set(tags).size, tags.length, 'tags are deduplicated');
});

test('the mixed prompt appends natural language to the tags', () => {
  const text = api.animaHybridPrompt({ pose, costume, angle: 'low' });
  const [tags, prose] = text.split('\n\n');
  assert.equal(tags, api.animaTagPrompt({ pose, costume, angle: 'low' }));
  assert.match(prose, /^A young anime woman/);
  assert.match(prose, /wearing a knit denim mini skirt and a coat/);
  assert.match(prose, /Low-angle shot/);
  assert.equal(prose.includes('simple background'), false, 'the negative prompt forbids it');
});

test('the negative prompt is not empty and matches the profile', () => {
  const negative = api.animaNegativePrompt();
  assert.ok(negative.includes('worst quality'));
  assert.equal(
    negative.split(', ').some((tag) => tag.includes('_') && !/^score_\d$/.test(tag)),
    false,
  );
});

test('every pose in the catalog yields prompt tags', () => {
  const poses = catalog.items.filter((item) => item.kind === 'pose');
  assert.ok(poses.length > 0);
  const thin = poses.filter((item) => api.poseTags(item).length < 1);
  assert.deepEqual(
    thin.map((item) => item.id),
    [],
  );
  const withAngle = poses.filter((item) => api.poseTags(item, 'side').includes('from side'));
  assert.equal(withAngle.length, poses.length);
});
