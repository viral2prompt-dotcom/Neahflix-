import React from 'react';

interface AdFreePlayerAdsProps {
  onClose?: () => void;
  onAccept?: () => void;
  adType?: 'ad1' | 'ad2';
  onAdClick?: () => void;
  variant?: 'player' | 'download' | 'livetv';
}

/**
 * Compatibility component for existing call sites.
 * The platform no longer injects advertising popups or opens ad destinations.
 * Playback continues through the selected provider; provider-owned redirects
 * inside cross-origin embeds cannot be controlled by this component.
 */
const AdFreePlayerAds: React.FC<AdFreePlayerAdsProps> = () => null;

export default AdFreePlayerAds;
