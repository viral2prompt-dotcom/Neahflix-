import { WATCHPARTY_API } from '@/config/runtime';
import { storeRoomToken } from '@/utils/watchparty';
import { buildLiveMedia, LIVE_MAX_PARTICIPANTS, type LiveChannelSource } from '@/utils/watchpartyLiveModel';

export interface CreateLiveRoomResult {
  roomId: string;
  roomCode: string;
  hostToken: string;
}

export const createLiveWatchParty = async (
  nickname: string,
  channel: LiveChannelSource,
  signal?: AbortSignal,
): Promise<CreateLiveRoomResult> => {
  const response = await fetch(`${WATCHPARTY_API}/api/watchparty/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nickname,
      maxParticipants: LIVE_MAX_PARTICIPANTS,
      media: buildLiveMedia(channel),
      isPublic: false,
      syncMode: 'classic',
    }),
    signal,
  });
  const data = (await response.json().catch(() => null)) as
    | { success?: boolean; roomId?: string; roomCode?: string; hostToken?: string; message?: string }
    | null;
  if (!response.ok || !data?.success || !data.roomId || !data.roomCode || !data.hostToken) {
    throw new Error(data?.message || 'La Watch Party n\'a pas pu être créée.');
  }
  storeRoomToken(data.roomId, data.hostToken);
  return { roomId: data.roomId, roomCode: data.roomCode, hostToken: data.hostToken };
};
