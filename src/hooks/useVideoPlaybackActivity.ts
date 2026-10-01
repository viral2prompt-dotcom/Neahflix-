import { useEffect, useState } from 'react';

/**
 * Reports whether a native media element managed by Neahflix is playing.
 *
 * Media events do not bubble, so this listener deliberately uses the capture
 * phase. It therefore covers every existing player implementation without
 * coupling the screen saver to HLS, FStream, ProxyBridge, or a given source.
 */
export function useVideoPlaybackActivity() {
  const [isVideoPlaybackActive, setIsVideoPlaybackActive] = useState(false);

  useEffect(() => {
    const activeVideos = new Set<HTMLVideoElement>();

    const sync = () => setIsVideoPlaybackActive(activeVideos.size > 0);
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

    // A player can already be playing when this hook is mounted after a route
    // transition, so seed the set from the current document as well.
    document.querySelectorAll<HTMLVideoElement>('video').forEach(add);
    const observer = new MutationObserver(() => {
      activeVideos.forEach((video) => {
        if (!video.isConnected) remove(video);
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('play', handlePlaying, true);
    document.addEventListener('playing', handlePlaying, true);
    ['pause', 'ended', 'abort', 'emptied'].forEach((eventName) => {
      document.addEventListener(eventName, handleStopped, true);
    });

    return () => {
      observer.disconnect();
      document.removeEventListener('play', handlePlaying, true);
      document.removeEventListener('playing', handlePlaying, true);
      ['pause', 'ended', 'abort', 'emptied'].forEach((eventName) => {
        document.removeEventListener(eventName, handleStopped, true);
      });
    };
  }, []);

  return { isVideoPlaybackActive };
}
