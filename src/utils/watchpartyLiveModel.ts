export const LIVE_MAX_PARTICIPANTS = 6;
export const LIVE_CHANNEL_ID_PATTERN = /^[A-Za-z0-9._~-]{1,128}$/;

export interface LiveMedia {
  kind: 'live';
  provider: 'neahplus';
  channelId: string;
  title: string;
  logo: string | null;
}

export interface LiveChannelSource {
  id: string;
  name: string;
  logo?: string | null;
}

export const isLiveMedia = (media: unknown): media is LiveMedia => {
  if (!media || typeof media !== 'object') return false;
  const candidate = media as { kind?: unknown; channelId?: unknown };
  return candidate.kind === 'live' && typeof candidate.channelId === 'string' && LIVE_CHANNEL_ID_PATTERN.test(candidate.channelId);
};

export const buildLiveMedia = (channel: LiveChannelSource): LiveMedia => ({
  kind: 'live',
  provider: 'neahplus',
  channelId: channel.id,
  title: channel.name,
  logo: channel.logo ?? null,
});

export const buildLiveInviteLink = (origin: string, code: string): string =>
  `${origin.replace(/\/+$/, '')}/watchparty/join/${encodeURIComponent(code)}`;

export const LIVE_REACTIONS = ['heart', 'clap', 'fire', 'laugh'] as const;
export type LiveReaction = (typeof LIVE_REACTIONS)[number];
