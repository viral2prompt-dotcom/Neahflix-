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

const channel = (id, name, countries = ['France'], logo = null, categories = []) => ({
  id, name, countries, categories, logo, programs: [],
});

const installStorage = (initial = {}) => {
  const store = new Map(Object.entries(initial));
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
  };
  return store;
};

const favoriteGroups = (groups, favorites) => groups.filter((g) => favorites.has(g.key));

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

test('le nom complet et le logo d\'une chaîne sont conservés', () => {
  const [group] = utils.groupChannelVariants([
    channel('x', 'Canal+ Sport HD', ['France'], 'https://logo.test/sport.png'),
  ]);
  assert.equal(group.displayName, 'Canal+ Sport HD');
  assert.equal(group.logo, 'https://logo.test/sport.png');
});

test('le pays principal France garde la clé historique et les autres pays sont suffixés', () => {
  const groups = utils.groupChannelVariants([
    channel('be', 'RTL', ['Belgique']),
    channel('fr', 'RTL', ['France']),
  ]);
  assert.deepEqual(groups.map((g) => g.key).sort(), ['rtl', 'rtl@belgique']);
});

test('un canal multi-pays reçoit la même clé quel que soit l\'ordre de ses tags', () => {
  const a = utils.groupChannelVariants([channel('m', 'Arte', ['Belgique', 'France'])]);
  const b = utils.groupChannelVariants([channel('m', 'Arte', ['France', 'Belgique'])]);
  assert.equal(a[0].key, b[0].key);
  assert.deepEqual(a[0].countries, ['Belgique', 'France']);
});

test('les clés restent identiques quel que soit l\'ordre du catalogue', () => {
  const channels = [
    channel('be', 'TF1', ['Belgique']),
    channel('fr', 'TF1', ['France']),
    channel('ch', 'TF1', ['Suisse']),
  ];
  const keysOf = (list) => Object.fromEntries(
    utils.groupChannelVariants(list).flatMap((g) => g.variants.map((v) => [v.id, g.key])),
  );
  assert.deepEqual(keysOf(channels), keysOf([...channels].reverse()));
});

test('les favoris belges sont retrouvés avec la même clé dans toutes les vues', () => {
  const channels = [
    channel('fr', 'TF1', ['France']),
    channel('be', 'TF1', ['Belgique']),
  ];
  const groups = utils.groupChannelVariants(channels);
  const belgianKey = groups.find((g) => g.countries.includes('Belgique')).key;
  const favorites = new Set([belgianKey]);

  const inFavorites = favoriteGroups(groups, favorites);
  assert.equal(inFavorites.length, 1);
  assert.deepEqual(inFavorites[0].variants.map((v) => v.id), ['be']);

  const homeChannelIds = inFavorites.map((g) => g.variants[0].id);
  assert.deepEqual(homeChannelIds, ['be']);
  assert.equal(groups.find((g) => g.variants.some((v) => v.id === 'be')).key, belgianKey);
});

test('les favoris français restent liés au groupe France', () => {
  const groups = utils.groupChannelVariants([
    channel('fr', 'TF1', ['France']),
    channel('be', 'TF1', ['Belgique']),
  ]);
  const inFavorites = favoriteGroups(groups, new Set(['tf1']));
  assert.equal(inFavorites.length, 1);
  assert.deepEqual(inFavorites[0].countries, ['France']);
});

test('les anciens favoris restent lisibles et aucune clé stockée n\'est supprimée', () => {
  installStorage({ 'neahplus:favorites': JSON.stringify(['tf1', 'tf1@belgique', 'cle-inconnue']) });

  const favorites = utils.loadFavorites();
  assert.deepEqual([...favorites].sort(), ['cle-inconnue', 'tf1', 'tf1@belgique']);

  const groups = utils.groupChannelVariants([
    channel('fr', 'TF1', ['France']),
    channel('be', 'TF1', ['Belgique']),
  ]);
  assert.equal(favoriteGroups(groups, favorites).length, 2);
});

test('un favori stocké avec une clé inconnue est conservé à l\'enregistrement', () => {
  const store = installStorage();
  utils.saveFavorites(new Set(['tf1', 'cle-inconnue']));
  assert.deepEqual(JSON.parse(store.get('neahplus:favorites')).sort(), ['cle-inconnue', 'tf1']);
});

test('une chaîne France Sport sans pays reste visible dans la vue France par défaut', () => {
  const split = catalog.splitChannelTags(['France Sport']);
  assert.deepEqual(split.countries, []);
  assert.deepEqual(split.categories, ['France Sport']);

  const [group] = utils.groupChannelVariants([
    channel('sport', 'Eurosport Sport', split.countries, null, split.categories),
  ]);
  assert.deepEqual(group.countries, []);
  assert.deepEqual(group.categories, ['France Sport']);
  assert.equal(utils.groupMatchesCountry(group, 'France'), true);
  assert.equal(utils.groupMatchesCountry(group, 'Belgique'), false);
});

test('France Sport n\'ajoute jamais une catégorie dans les pays', () => {
  assert.deepEqual(catalog.splitChannelTags(['France', 'France Sport']), {
    countries: ['France'],
    categories: ['France Sport'],
  });
  assert.deepEqual(catalog.splitChannelTags(['Belgique']), {
    countries: ['Belgique'],
    categories: [],
  });
});

test('une chaîne historique déjà présente dans le catalogue réel n\'est pas dupliquée', () => {
  const real = utils.groupChannelVariants([channel('d', 'Disney Channel HD', ['France'])]);
  const historical = utils.historicalChannelsWithoutDuplicates(real).map((g) => g.displayName);

  assert.ok(!historical.includes('Disney Channel'));
  assert.ok(historical.includes('Disney Junior'));
  assert.ok(historical.includes('National Geographic'));
});

test('une chaîne historique sans correspondance réelle reste visible', () => {
  const real = utils.groupChannelVariants([channel('be', 'National Geographic', ['Belgique'])]);
  const historical = utils.historicalChannelsWithoutDuplicates(real);

  assert.ok(historical.some((g) => g.displayName === 'National Geographic'));
  assert.equal(historical.length, utils.HISTORICAL_CHANNELS.length);
  assert.ok(historical.every((g) => utils.groupMatchesCountry(g, 'France')));
});
