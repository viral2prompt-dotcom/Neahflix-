import { useEffect, useState } from 'react';

/**
 * Reports whether a video playing in Neahflix is active.
 *
 * Media events do not bubble, so this listener deliberately uses the capture
 * phase. It therefore covers every existing player implementation without
 * coupling the screen saver to HLS, FStream, ProxyBridge, or a given source.
 */
export function useVideoPlaybackActivity() {
  const [isVideoPlaybackActive, setIsVideoPlaybackActive] = useState(false);

  useEffect(() => {
    const activeVideos = new Set<HTMLVideoElement>();
    const activeYoutubeFrames = new Set<HTMLIFrameElement>();

    const sync = () => setIsVideoPlaybackActive(activeVideos.size + activeYoutubeFrames.size > 0);
    const isTrackedVideo = (video: HTMLVideoElement) => video.dataset.screensaverIgnore !== 'true';
    const remove = (video: HTMLVideoElement) => {
      if (activeVideos.delete(video)) sync();
    };
    const add = (video: HTMLVideoElement) => {
      if (isTrackedVideo(video) && !video.ended && !video.paused) {
        activeVideos.add(video);
        sync();
      }
    };
    const getVideo = (event: Event) => event.target instanceof HTMLVideoElement ? event.target : null;
    const handlePlaying = (event: Event) => {
      const video = getVideo(event);
      if (video) add(video);
    };
    const handleStopped = (event: Event) => {
      const video = getVideo(event);
      if (video) remove(video);
    };
    const getYoutubeFrame = (source: MessageEventSource | null) => {
      if (!source) return null;

      return Array.from(document.querySelectorAll<HTMLIFrameElement>('iframe[data-screensaver-youtube-player="true"]'))
        .find((frame) => frame.contentWindow === source) ?? null;
    };
    const handleYoutubeStateChange = (event: MessageEvent) => {
      if (event.origin !== 'https://www.youtube.com' && event.origin !== 'https://www.youtube-nocookie.com') return;

      let message: unknown = event.data;
      if (typeof message === 'string') {
        try {
          message = JSON.parse(message);
        } catch {
          return;
        }
      }
      if (!message || typeof message !== 'object') return;

      const payload = message as { event?: string; info?: number | string };
      if (payload.event !== 'onStateChange') return;

      const frame = getYoutubeFrame(event.source);
      if (!frame) return;

      // YouTube's IFrame API emits 1 only after playback has genuinely begun.
      // 0 (ended), 2 (paused) and -1 (unstarted) all release the screen saver.
      if (Number(payload.info) === 1) {
        activeYoutubeFrames.add(frame);
        sync();
      } else {
        if (activeYoutubeFrames.delete(frame)) sync();
      }
    };

    // A player can already be playing when this hook is mounted after a route
    // transition, so seed the set from the current document as well.
    document.querySelectorAll<HTMLVideoElement>('video').forEach(add);
    const observer = new MutationObserver(() => {
      activeVideos.forEach((video) => {
        if (!video.isConnected) remove(video);
      });
      activeYoutubeFrames.forEach((frame) => {
        if (!frame.isConnected && activeYoutubeFrames.delete(frame)) sync();
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('playing', handlePlaying, true);
    window.addEventListener('message', handleYoutubeStateChange);
    ['pause', 'ended', 'abort', 'emptied'].forEach((eventName) => {
      document.addEventListener(eventName, handleStopped, true);
    });

    return () => {
      observer.disconnect();
      document.removeEventListener('playing', handlePlaying, true);
      ['pause', 'ended', 'abort', 'emptied'].forEach((eventName) => {
        document.removeEventListener(eventName, handleStopped, true);
      });
      window.removeEventListener('message', handleYoutubeStateChange);
    };
  }, []);

  return { isVideoPlaybackActive };
}
