import { useState, useEffect, useCallback, useRef } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { APP_VERSION, LAST_SEEN_VERSION_KEY } from '../config/changelog';

export function useAppUpdate() {
  const [showChangelogModal, setShowChangelogModal] = useState<boolean>(() => {
    try {
      const lastSeen = localStorage.getItem(LAST_SEEN_VERSION_KEY);
      return lastSeen !== APP_VERSION;
    } catch {
      return false;
    }
  });

  const [previousVersion] = useState<string | null>(() => {
    try {
      const lastSeen = localStorage.getItem(LAST_SEEN_VERSION_KEY);
      return lastSeen && lastSeen !== APP_VERSION ? lastSeen : null;
    } catch {
      return null;
    }
  });

  const [liveBannerDismissed, setLiveBannerDismissed] = useState(false);
  const swRegistrationRef = useRef<ServiceWorkerRegistration | null>(null);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (registration) {
        swRegistrationRef.current = registration;
        // Cek update berkala setiap 30 menit saat aplikasi terbuka
        setInterval(() => {
          if (navigator.onLine) {
            registration.update().catch(() => {});
          }
        }, 30 * 60 * 1000);
      }
    },
    onRegisterError(error) {
      console.warn('[PWA] Service Worker registration error:', error);
    },
  });

  // Cek update SW saat user kembali ke tab/aplikasi atau saat kembali online
  useEffect(() => {
    const checkForUpdate = () => {
      if (navigator.onLine && swRegistrationRef.current) {
        swRegistrationRef.current.update().catch(() => {});
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkForUpdate();
      }
    };

    window.addEventListener('online', checkForUpdate);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('online', checkForUpdate);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  const dismissChangelog = useCallback(() => {
    try {
      localStorage.setItem(LAST_SEEN_VERSION_KEY, APP_VERSION);
    } catch {
      // Ignore storage errors
    }
    setShowChangelogModal(false);
  }, []);

  const openChangelog = useCallback(() => {
    setShowChangelogModal(true);
  }, []);

  const applyLiveUpdate = useCallback(() => {
    void updateServiceWorker(true);
  }, [updateServiceWorker]);

  const dismissLiveBanner = useCallback(() => {
    setLiveBannerDismissed(true);
    setNeedRefresh(false);
  }, [setNeedRefresh]);

  return {
    appVersion: APP_VERSION,
    previousVersion,
    showChangelogModal,
    dismissChangelog,
    openChangelog,
    hasLiveUpdate: needRefresh && !liveBannerDismissed,
    applyLiveUpdate,
    dismissLiveBanner,
  };
}
