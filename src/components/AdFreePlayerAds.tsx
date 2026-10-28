import React from "react";

interface AdFreePlayerAdsProps {
  onClose?: () => void;
  onAccept?: () => void;
  adType?: "ad1" | "ad2";
  onAdClick?: () => void;
  variant?: "player" | "download" | "livetv";
}

/**
 * Compatibility boundary for existing callers.
 * Advertising popups, ad destinations, and third-party ad scripts are disabled.
 * The player flow is released by AdFreePopupContext; this component must not
 * synthesize acceptance or alter VIP/session state.
 */
const AdFreePlayerAds: React.FC<AdFreePlayerAdsProps> = () => null;

export default AdFreePlayerAds;
