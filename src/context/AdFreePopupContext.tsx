import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { isUserVip } from '../utils/vipUtils';

interface AdFreePopupContextType {
  showAdFreePopup: boolean;
  adType: 'ad1' | 'ad2';
  playerToShow: string | null;
  shouldLoadIframe: boolean;
  isSpecialPlayer: boolean;
  isVoVostfrOnly: boolean;
  is_vip: boolean;
  showPopupForPlayer: (playerType: string, additionalInfo?: unknown) => void;
  handlePopupClose: () => void;
  handlePopupAccept: () => void;
  resetVipStatus: () => void;
}

const AdFreePopupContext = createContext<AdFreePopupContextType | undefined>(undefined);

/**
 * Compatibility provider retained for existing player consumers.
 * Advertising intermissions are permanently disabled: selecting a source always
 * authorizes its iframe/player immediately and never opens a popup or a tab.
 */
export const AdFreePopupProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isVip, setIsVip] = useState(() => isUserVip());

  const showPopupForPlayer = useCallback((_playerType: string, _additionalInfo?: unknown) => {
    // Intentionally a no-op. This API remains so the player selection flow and
    // FStream integrations keep their existing contract without ad gating.
  }, []);
  const handlePopupClose = useCallback(() => {}, []);
  const handlePopupAccept = useCallback(() => {}, []);
  const resetVipStatus = useCallback(() => setIsVip(isUserVip()), []);

  const value = useMemo<AdFreePopupContextType>(() => ({
    showAdFreePopup: false,
    adType: 'ad2',
    playerToShow: null,
    shouldLoadIframe: true,
    isSpecialPlayer: false,
    isVoVostfrOnly: false,
    is_vip: isVip,
    showPopupForPlayer,
    handlePopupClose,
    handlePopupAccept,
    resetVipStatus,
  }), [handlePopupAccept, handlePopupClose, isVip, resetVipStatus, showPopupForPlayer]);

  return <AdFreePopupContext.Provider value={value}>{children}</AdFreePopupContext.Provider>;
};

export const useAdFreePopup = () => {
  const context = useContext(AdFreePopupContext);
  if (context === undefined) throw new Error('useAdFreePopup must be used within an AdFreePopupProvider');
  return context;
};
