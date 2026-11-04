// Tests ciblés du regroupement des chaînes NEAHPLUS (`src/components/neahplus`).
// Les modules TypeScript sont transpilés à la volée, comme pour httpCache.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const loadTs = (path) => {
  const js = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', js)(require, mod, mod.exports);
  return mod.exports;
};

const DIR = 'src/components/neahplus';
const catalog = loadTs(`${DIR}/neahplusCatalog.ts`);
const utils = loadTs(`${DIR}/neahplusTvUtils.ts`);

const channel = (id, name, countries = ['France'], logo = null) => ({
  id, name, countries, categories: [], logo, programs: [],
});

const installStorage = (initial = {}) => {
  const store = new Map(Object.entries(initial));
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
  };
  return store;
};

test('des homonymes de pays différents restent deux groupes distincts', () => {
  const groups = utils.groupChannelVariants([
    channel('fr-tf1', 'TF1', ['France']),
    channel('be-tf1', 'TF1', ['Belgique']),
  ]);

  assert.equal(groups.length, 2);
  const belgian = groups.find((g) => g.countries.includes('Belgique'));
  assert.equal(belgian.key, 'tf1@belgique');
  assert.deepEqual(belgian.variants.map((v) => v.id), ['be-tf1']);
});

test('les variantes qualité d\'une même chaîne et d\'un même pays sont regroupées', () => {
  const groups = utils.groupChannelVariants([
    channel('a', 'TF1', ['France']),
    channel('b', 'TF1 HD', ['France']),
    channel('c', 'TF1 FHD', ['France'], 'https://logo.test/tf1.png'),
  ]);

  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].variants.map((v) => v.id), ['a', 'b', 'c']);
  assert.equal(groups[0].displayName, 'TF1');
  assert.equal(groups[0].logo, 'https://logo.test/tf1.png');
  assert.equal(groups[0].key, 'tf1');
});

test('des chaînes aux noms différents ne sont pas fusionnées artificiellement', () => {
  const groups = utils.groupChannelVariants([
    channel('a', 'TF1', ['France']),
    channel('b', 'TF1 Séries Films', ['France']),
  ]);

  assert.equal(groups.length, 2);
});

test('le nom complet d\'une chaîne unique est conservé', () => {
  const [group] = utils.groupChannelVariants([channel('x', 'Canal+ Sport HD', ['France'])]);
  assert.equal(group.displayName, 'Canal+ Sport HD');
});

test('le pays principal France garde la clé historique et les autres pays sont suffixés', () => {
  const groups = utils.groupChannelVariants([
    channel('be', 'RTL', ['Belgique']),
    channel('fr', 'RTL', ['France']),
  ]);
  const keys = groups.map((g) => g.key).sort();
  assert.deepEqual(keys, ['rtl', 'rtl@belgique']);
});

test('France Sport est une catégorie et non un pays', () => {
  assert.deepEqual(catalog.splitChannelTags(['France', 'France Sport']), {
    countries: ['France'],
    categories: ['France Sport'],
  });
  assert.deepEqual(catalog.splitChannelTags(['Belgique']), {
    countries: ['Belgique'],
    categories: [],
  });
});

test('les anciens favoris restent lisibles et aucune clé stockée n\'est supprimée', () => {
  installStorage({ 'neahplus:favorites': JSON.stringify(['tf1', 'tf1@belgique', 'cle-inconnue']) });

  const favorites = utils.loadFavorites();
  assert.deepEqual([...favorites].sort(), ['cle-inconnue', 'tf1', 'tf1@belgique']);

  const groups = utils.groupChannelVariants([
    channel('fr', 'TF1', ['France']),
    channel('be', 'TF1', ['Belgique']),
  ]);
  assert.ok(groups.some((g) => favorites.has(g.key) && g.key === 'tf1'));
  assert.ok(groups.some((g) => favorites.has(g.key) && g.key === 'tf1@belgique'));
});

test('un favori stocké avec une clé ambiguë est conservé à l\'enregistrement', () => {
  const store = installStorage();
  utils.saveFavorites(new Set(['tf1', 'cle-inconnue']));
  assert.deepEqual(JSON.parse(store.get('neahplus:favorites')).sort(), ['cle-inconnue', 'tf1']);
});

test('une chaîne historique déjà présente dans le catalogue réel n\'est pas dupliquée', () => {
  const real = utils.groupChannelVariants([channel('d', 'Disney Channel HD', ['France'])]);
  const historical = utils.historicalChannelsWithoutDuplicates(real).map((g) => g.displayName);

  assert.ok(!historical.includes('Disney Channel'));
  assert.ok(historical.includes('Disney Junior'));
  assert.ok(historical.includes('National Geographic'));
});

test('une chaîne historique sans correspondance réelle est conservée', () => {
  const real = utils.groupChannelVariants([channel('be', 'National Geographic', ['Belgique'])]);
  const historical = utils.historicalChannelsWithoutDuplicates(real).map((g) => g.displayName);

  assert.ok(historical.includes('National Geographic'));
  assert.equal(historical.length, utils.HISTORICAL_CHANNELS.length);
});
