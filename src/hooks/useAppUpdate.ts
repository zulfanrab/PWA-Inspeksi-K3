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
  const [controllerUpdated, setControllerUpdated] = useState(false);
  const swRegistrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const hadControllerRef = useRef<boolean>(
    typeof navigator !== 'undefined' && 'serviceWorker' in navigator && Boolean(navigator.serviceWorker.controller)
  );

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (registration) {
        swRegistrationRef.current = registration;
        // Cek update langsung saat SW terdaftar (penting untuk PWA iOS Safari)
        if (navigator.onLine) {
          registration.update().catch(() => {});
        }
        // Cek update berkala setiap 15 menit saat aplikasi terbuka
        setInterval(() => {
          if (navigator.onLine) {
            registration.update().catch(() => {});
          }
        }, 15 * 60 * 1000);
      }
    },
    onRegisterError(error) {
      console.warn('[PWA] Service Worker registration error:', error);
    },
  });

  // Cek update SW saat user kembali ke tab/aplikasi atau saat kembali online,
  // serta deteksi controllerchange (skipWaiting) agar iOS PWA langsung memunculkan prompt muat ulang
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

    const handleControllerChange = () => {
      if (hadControllerRef.current) {
        setControllerUpdated(true);
        setLiveBannerDismissed(false);
      } else {
        hadControllerRef.current = true;
      }
    };

    window.addEventListener('online', checkForUpdate);
    window.addEventListener('focus', checkForUpdate);
    document.addEventListener('visibilitychange', handleVisibility);
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
    }
    return () => {
      window.removeEventListener('online', checkForUpdate);
      window.removeEventListener('focus', checkForUpdate);
      document.removeEventListener('visibilitychange', handleVisibility);
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
      }
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
    if (controllerUpdated && !needRefresh) {
      window.location.reload();
      return;
    }
    void updateServiceWorker(true);
  }, [controllerUpdated, needRefresh, updateServiceWorker]);

  const dismissLiveBanner = useCallback(() => {
    setLiveBannerDismissed(true);
    setNeedRefresh(false);
    setControllerUpdated(false);
  }, [setNeedRefresh]);

  return {
    appVersion: APP_VERSION,
    previousVersion,
    showChangelogModal,
    dismissChangelog,
    openChangelog,
    hasLiveUpdate: (needRefresh || controllerUpdated) && !liveBannerDismissed,
    applyLiveUpdate,
    dismissLiveBanner,
  };
}
