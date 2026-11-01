/**
 * Tests for NEAHPLUS Live Watch Party backend additions.
 *
 * These tests extract the real validation functions from watchparty.js source
 * (not re-implementations) and run them in a sandbox via `new Function()`.
 * Source-inspection tests verify handler structure by checking the raw source
 * text for required socket handlers, constants, and serialization logic.
 *
 * Integration tests that require express/socket.io/socket.io-client/uuid are
 * SKIPPED — those dependencies are not available in the Bolt workspace.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SOURCE_PATH = resolve(__dirname, '../API/watchpartyAPI/watchparty.js');
const SOURCE = readFileSync(SOURCE_PATH, 'utf-8');

// ---------------------------------------------------------------------------
// Helpers: extract real functions from source via regex + sandbox eval
// ---------------------------------------------------------------------------

function extractFunctionSource(name) {
  const re = new RegExp(`function\\s+${name}\\s*\\([^)]*\\)\\s*\\{`);
  const match = SOURCE.match(re);
  if (!match) throw new Error(`Function ${name} not found in source`);
  const start = match.index;
  let depth = 0;
  let i = start;
  // Find opening brace
  while (i < SOURCE.length && SOURCE[i] !== '{') i++;
  depth = 1;
  i++;
  while (i < SOURCE.length && depth > 0) {
    if (SOURCE[i] === '{') depth++;
    else if (SOURCE[i] === '}') depth--;
    i++;
  }
  return SOURCE.slice(start, i);
}

function extractConstSource(name) {
  const re = new RegExp(`const\\s+${name}\\s*=`);
  const match = SOURCE.match(re);
  if (!match) throw new Error(`const ${name} not found in source`);
  const start = match.index;
  let i = start;
  while (i < SOURCE.length && SOURCE[i] !== '=') i++;
  i++; // skip =
  // Skip whitespace
  while (i < SOURCE.length && /\s/.test(SOURCE[i])) i++;
  if (SOURCE[i] === '/') {
    // It's a regex — find closing /
    i++; // skip opening /
    while (i < SOURCE.length && SOURCE[i] !== '/') i++;
    i++; // skip closing /
    // Skip flags
    while (i < SOURCE.length && /[a-z]/.test(SOURCE[i])) i++;
    // Find semicolon
    while (i < SOURCE.length && SOURCE[i] !== ';') i++;
    i++;
    return SOURCE.slice(start, i);
  }
  // Otherwise find semicolon at depth 0
  let depth = 0;
  i = start;
  while (i < SOURCE.length) {
    if (SOURCE[i] === '{' || SOURCE[i] === '[' || SOURCE[i] === '(') depth++;
    else if (SOURCE[i] === '}' || SOURCE[i] === ']' || SOURCE[i] === ')') depth--;
    else if (SOURCE[i] === ';' && depth === 0) { i++; break; }
    i++;
  }
  return SOURCE.slice(start, i);
}

// Build a sandbox with the dependencies the extracted functions need.
function buildSandbox() {
  const code = `
    const MAX_STRING_LENGTH = 2048;
    const MAX_SOURCES_PER_LIST = 30;
    ${extractFunctionSource('sanitizeString')}
    ${extractFunctionSource('sanitizeOptionalString')}
    ${extractFunctionSource('sanitizeNumber')}
    ${extractFunctionSource('sanitizeSourceList')}
    ${extractFunctionSource('sanitizeLiveMedia')}
    ${extractFunctionSource('sanitizeMedia')}
    ${extractConstSource('LIVE_CHANNEL_ID_PATTERN')}
    ${extractConstSource('LIVE_CHANNEL_ID_MAX')}
    return {
      sanitizeString, sanitizeOptionalString, sanitizeNumber,
      sanitizeLiveMedia, sanitizeMedia,
      LIVE_CHANNEL_ID_PATTERN, LIVE_CHANNEL_ID_MAX
    };
  `;
  const fn = new Function(code);
  return fn();
}

const sandbox = buildSandbox();
const {
  sanitizeString,
  sanitizeOptionalString,
  sanitizeNumber,
  sanitizeLiveMedia,
  sanitizeMedia,
  LIVE_CHANNEL_ID_PATTERN,
  LIVE_CHANNEL_ID_MAX
} = sandbox;

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;
let skipped = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  \x1b[32mPASS\x1b[0m ${name}`);
    passed++;
  } catch (e) {
    console.log(`  \x1b[31mFAIL\x1b[0m ${name}`);
    console.log(`         ${e.message}`);
    failed++;
  }
}

function skip(name, reason) {
  console.log(`  \x1b[33mSKIP\x1b[0m ${name} — ${reason}`);
  skipped++;
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg || 'Assertion failed'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertNull(actual, msg) {
  if (actual !== null) {
    throw new Error(`${msg || 'Expected null'}: got ${JSON.stringify(actual)}`);
  }
}

function assertNotNull(actual, msg) {
  if (actual === null || actual === undefined) {
    throw new Error(`${msg || 'Expected non-null'}: got ${JSON.stringify(actual)}`);
  }
}

function assertTrue(actual, msg) {
  if (actual !== true) {
    throw new Error(`${msg || 'Expected true'}: got ${JSON.stringify(actual)}`);
  }
}

// ---------------------------------------------------------------------------
// Tests: sanitizeLiveMedia
// ---------------------------------------------------------------------------
console.log('\n--- sanitizeLiveMedia ---');

test('valid channelId produces live media object', () => {
  const result = sanitizeLiveMedia({ kind: 'live', channelId: 'neahplus.ch1', title: 'Channel 1' });
  assertNotNull(result);
  assertEqual(result.kind, 'live', 'kind should be live');
  assertEqual(result.channelId, 'neahplus.ch1', 'channelId should match');
  assertEqual(result.mediaType, 'live', 'mediaType should be live');
});

test('no signed URL or src field stored in live media', () => {
  const result = sanitizeLiveMedia({
    kind: 'live',
    channelId: 'ch1',
    src: 'https://oha.to/live/play/ch1',
    url: 'https://signed.example.com/stream/ch1?sig=abc'
  });
  assertNotNull(result);
  assertTrue(!('src' in result), 'result must not contain src');
  assertTrue(!('url' in result), 'result must not contain url');
});

test('path traversal in channelId rejected', () => {
  assertNull(sanitizeLiveMedia({ kind: 'live', channelId: '../../../etc/passwd' }));
});

test('empty channelId rejected', () => {
  assertNull(sanitizeLiveMedia({ kind: 'live', channelId: '' }));
});

test('special characters in channelId rejected', () => {
  assertNull(sanitizeLiveMedia({ kind: 'live', channelId: 'ch;rm -rf /' }));
  assertNull(sanitizeLiveMedia({ kind: 'live', channelId: 'ch$HOME' }));
  assertNull(sanitizeLiveMedia({ kind: 'live', channelId: 'ch with spaces' }));
});

test('logo field handled correctly', () => {
  const result = sanitizeLiveMedia({ kind: 'live', channelId: 'ch1', logo: 'https://example.com/logo.png' });
  assertNotNull(result);
  assertEqual(result.logo, 'https://example.com/logo.png', 'logo should be preserved');
});

test('null media returns null', () => {
  assertNull(sanitizeLiveMedia(null));
  assertNull(sanitizeLiveMedia(undefined));
});

// ---------------------------------------------------------------------------
// Tests: sanitizeMedia dispatch for live
// ---------------------------------------------------------------------------
console.log('\n--- sanitizeMedia live dispatch ---');

test('sanitizeMedia dispatches to sanitizeLiveMedia for kind=live', () => {
  const result = sanitizeMedia({ kind: 'live', channelId: 'test.ch', title: 'Test Live' });
  assertNotNull(result);
  assertEqual(result.kind, 'live', 'kind should be live');
  assertEqual(result.channelId, 'test.ch', 'channelId should match');
});

test('sanitizeMedia still works for movie (non-regression)', () => {
  const result = sanitizeMedia({ src: 'https://example.com/movie.mp4', title: 'Movie', mediaType: 'movie' });
  assertNotNull(result);
  assertEqual(result.src, 'https://example.com/movie.mp4', 'src should be preserved');
  assertEqual(result.mediaType, 'movie', 'mediaType should be movie');
  assertTrue(!('kind' in result), 'movie media should not have kind field');
});

test('sanitizeMedia still works for tv (non-regression)', () => {
  const result = sanitizeMedia({ src: 'https://example.com/ep.mp4', title: 'Show', mediaType: 'tv', seasonNumber: 1, episodeNumber: 2 });
  assertNotNull(result);
  assertEqual(result.mediaType, 'tv', 'mediaType should be tv');
  assertEqual(result.seasonNumber, 1, 'seasonNumber should be preserved');
  assertEqual(result.episodeNumber, 2, 'episodeNumber should be preserved');
});

// ---------------------------------------------------------------------------
// Tests: LIVE_CHANNEL_ID_PATTERN
// ---------------------------------------------------------------------------
console.log('\n--- LIVE_CHANNEL_ID_PATTERN ---');

test('valid channel IDs match pattern', () => {
  assertTrue(LIVE_CHANNEL_ID_PATTERN.test('neahplus.ch1'));
  assertTrue(LIVE_CHANNEL_ID_PATTERN.test('abc'));
  assertTrue(LIVE_CHANNEL_ID_PATTERN.test('channel_123'));
  assertTrue(LIVE_CHANNEL_ID_PATTERN.test('ch-1.test'));
  assertTrue(LIVE_CHANNEL_ID_PATTERN.test('A'));
});

test('invalid channel IDs do not match pattern', () => {
  assertTrue(!LIVE_CHANNEL_ID_PATTERN.test(''));
  assertTrue(!LIVE_CHANNEL_ID_PATTERN.test('ch with spaces'));
  assertTrue(!LIVE_CHANNEL_ID_PATTERN.test('ch;semicolon'));
  assertTrue(!LIVE_CHANNEL_ID_PATTERN.test('ch$ dollar'));
  assertTrue(!LIVE_CHANNEL_ID_PATTERN.test('../../../etc/passwd'));
});

// ---------------------------------------------------------------------------
// Source-inspection tests: verify handler structure in the raw source
// ---------------------------------------------------------------------------
console.log('\n--- Source inspection ---');

function assertSourceContains(pattern, msg) {
  if (!SOURCE.includes(pattern)) {
    throw new Error(`Source does not contain: ${msg || pattern}`);
  }
}

test('voice:join handler enforces VOICE_MAX_PARTICIPANTS=6', () => {
  assertSourceContains("const VOICE_MAX_PARTICIPANTS = 6", 'VOICE_MAX_PARTICIPANTS constant');
  assertSourceContains("r.voiceParticipants.size >= VOICE_MAX_PARTICIPANTS", '6-participant limit check');
  assertSourceContains("voice:error", 'voice:error emission on limit');
});

test('voice:signal handler relays to target peer only', () => {
  assertSourceContains("socket.on('voice:signal'", 'voice:signal handler');
  assertSourceContains("targetSocket.emit('voice:signal'", 'signal relay to target');
  assertSourceContains("fromId: socket.id", 'fromId in relayed signal');
});

test('voice:leave handler removes from voiceParticipants and emits peer-left', () => {
  assertSourceContains("socket.on('voice:leave'", 'voice:leave handler');
  assertSourceContains("r.voiceParticipants.delete(socket.id)", 'delete from set');
  assertSourceContains("voice:peer-left", 'peer-left emission');
});

test('disconnect handler cleans up voiceParticipants', () => {
  assertSourceContains("r.voiceParticipants && r.voiceParticipants.has(socket.id)", 'voice cleanup check in disconnect');
  // Verify it's within the disconnect handler context
  const disconnectIdx = SOURCE.indexOf("socket.on('disconnect'");
  const voiceCleanupIdx = SOURCE.indexOf("r.voiceParticipants && r.voiceParticipants.has(socket.id)");
  assertTrue(voiceCleanupIdx > disconnectIdx, 'voice cleanup should be after disconnect handler start');
});

test('live:changeChannel handler is host-only', () => {
  assertSourceContains("socket.on('live:changeChannel'", 'live:changeChannel handler');
  assertSourceContains("if (socket.id !== r.hostId) return;", 'host-only check');
  assertSourceContains("if (r.media?.kind !== 'live') return;", 'live media check');
  assertSourceContains("live:channelChanged", 'channelChanged emission');
});

test('serializeRoom excludes voiceParticipants', () => {
  assertSourceContains("const { pauseVote, voiceParticipants, ...rest } = room", 'voiceParticipants destructured out');
});

test('loadRoomsFromDisk resets voiceParticipants to null', () => {
  assertSourceContains("room.voiceParticipants = null", 'voiceParticipants reset on load');
});

test('room creation initializes voiceParticipants: null', () => {
  assertSourceContains("voiceParticipants: null,  // Set<socketId>", 'voiceParticipants init in new room');
});

test('TURN servers configurable via WATCHPARTY_TURN_SERVER env var', () => {
  assertSourceContains("process.env.WATCHPARTY_TURN_SERVER", 'TURN env var read');
  assertSourceContains("TURN_SERVERS", 'TURN_SERVERS variable');
  assertSourceContains("getIceServers", 'getIceServers function');
});

test('voice:ready emits ICE servers and peer list', () => {
  assertSourceContains("voice:ready", 'voice:ready event');
  assertSourceContains("iceServers: getIceServers()", 'ICE servers sent in voice:ready');
  assertSourceContains("peerIds: peerList", 'peer list sent in voice:ready');
});

test('no signed URL fields stored in sanitizeLiveMedia output', () => {
  // Verify that sanitizeLiveMedia returns only kind, channelId, title, logo, mediaType, mediaId
  const fnSource = extractFunctionSource('sanitizeLiveMedia');
  assertTrue(!fnSource.includes('.src'), 'sanitizeLiveMedia should not reference .src');
  assertTrue(!fnSource.includes('.url'), 'sanitizeLiveMedia should not reference .url');
});

// ---------------------------------------------------------------------------
// Skipped integration tests (require server dependencies not in Bolt workspace)
// ---------------------------------------------------------------------------
console.log('\n--- Integration tests (SKIPPED) ---');

skip('voice:join rejects 7th participant', 'requires socket.io + socket.io-client + express + uuid');
skip('live:changeChannel broadcasts to all participants', 'requires socket.io server running');
skip('voice:signal does not relay to non-voice participants', 'requires socket.io server running');
skip('POST /api/watchparty/create accepts live media', 'requires express server running');
skip('disconnect cleans up voice and emits peer-left to room', 'requires socket.io server running');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log('\n-----------------------------------');
console.log(`Results: ${passed} passed, ${failed} failed, ${skipped} skipped`);
console.log('-----------------------------------');

if (failed > 0) {
  process.exit(1);
}
