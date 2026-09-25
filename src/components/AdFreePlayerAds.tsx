import React, { useEffect } from 'react';

interface AdFreePlayerAdsProps {
  onClose?: () => void;
  onAccept?: () => void;
  adType?: 'ad1' | 'ad2';
  onAdClick?: () => void;
  variant?: 'player' | 'download' | 'livetv';
}

/**
 * Legacy compatibility boundary for former advertising gates.
 * It immediately continues the requested flow and deliberately renders no UI,
 * opens no destination, and loads no third-party script.
 */
const AdFreePlayerAds: React.FC<AdFreePlayerAdsProps> = ({ onAccept }) => {
  useEffect(() => {
    onAccept?.();
  }, [onAccept]);

  return null;
};

export default AdFreePlayerAds;
