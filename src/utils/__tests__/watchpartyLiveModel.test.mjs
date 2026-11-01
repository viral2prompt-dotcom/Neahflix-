import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLiveInviteLink, buildLiveMedia, isLiveMedia, LIVE_MAX_PARTICIPANTS } from '../watchpartyLiveModel.ts';
import { computeAudioLevel, describeMicrophoneError, isSpeakingLevel } from '../watchpartyVoice.ts';

test('a channel becomes live media with its identifier and no stream URL', () => {
  const media = buildLiveMedia({ id: '42', name: 'Canal 42', logo: '/api/neahplus/live2/x.png' });
  assert.deepEqual(media, { kind: 'live', provider: 'neahplus', channelId: '42', title: 'Canal 42', logo: '/api/neahplus/live2/x.png' });
  assert.equal(Object.keys(media).some((key) => /url|src/i.test(key)), false);
});

test('live media validation rejects anything that is not a plain channel identifier', () => {
  assert.equal(isLiveMedia({ kind: 'live', channelId: '42' }), true);
  assert.equal(isLiveMedia({ kind: 'live', channelId: '../x' }), false);
  assert.equal(isLiveMedia({ kind: 'file', channelId: '42' }), false);
  assert.equal(isLiveMedia(null), false);
});

test('six is the participant cap for live rooms', () => {
  assert.equal(LIVE_MAX_PARTICIPANTS, 6);
});

test('invite links point to the join route and strip trailing slashes', () => {
  assert.equal(buildLiveInviteLink('https://example.com/', 'ABC234'), 'https://example.com/watchparty/join/ABC234');
});

test('audio level is zero for silence and rises with signal amplitude', () => {
  const silence = new Uint8Array(256).fill(128);
  const loud = new Uint8Array(256).map((_, i) => (i % 2 ? 255 : 0));
  assert.equal(computeAudioLevel(silence), 0);
  assert.equal(isSpeakingLevel(computeAudioLevel(silence)), false);
  assert.equal(isSpeakingLevel(computeAudioLevel(loud)), true);
  assert.equal(computeAudioLevel(new Uint8Array(0)), 0);
});

test('microphone errors are mapped to actionable messages', () => {
  assert.equal(describeMicrophoneError(Object.assign(new Error('x'), { name: 'NotAllowedError' })).code, 'denied');
  assert.equal(describeMicrophoneError(Object.assign(new Error('x'), { name: 'NotFoundError' })).code, 'missing');
  assert.equal(describeMicrophoneError(Object.assign(new Error('x'), { name: 'NotReadableError' })).code, 'busy');
  assert.equal(describeMicrophoneError(new Error('boom')).code, 'unknown');
  assert.match(describeMicrophoneError(Object.assign(new Error('x'), { name: 'NotAllowedError' })).message, /autorisez/i);
});
