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
  const pollTimerRef = useRef<number | null>(null);
  const hadControllerRef = useRef<boolean>(
    typeof navigator !== 'undefined' && 'serviceWorker' in navigator && Boolean(navigator.serviceWorker.controller)
  );

  const attachRegistrationListeners = useCallback((registration: ServiceWorkerRegistration) => {
    if (registration.waiting && navigator.serviceWorker?.controller) {
      setControllerUpdated(true);
      setLiveBannerDismissed(false);
    }

    registration.addEventListener('updatefound', () => {
      const installing = registration.installing;
      if (!installing) return;
      installing.addEventListener('statechange', () => {
        if (installing.state === 'installed' && navigator.serviceWorker?.controller) {
          setControllerUpdated(true);
          setLiveBannerDismissed(false);
        }
      });
    });
  }, []);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (registration) {
        swRegistrationRef.current = registration;
        attachRegistrationListeners(registration);

        if (navigator.onLine) {
          registration.update().catch(() => {});
        }
        if (pollTimerRef.current !== null) {
          window.clearInterval(pollTimerRef.current);
        }
        // Cek update berkala setiap 2 menit saat aplikasi terbuka di Desktop maupun HP
        pollTimerRef.current = window.setInterval(() => {
          if (navigator.onLine) {
            registration.update().catch(() => {});
          }
        }, 2 * 60 * 1000);
      }
    },
    onRegisterError(error) {
      console.warn('[PWA] Service Worker registration error:', error);
    },
  });

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
      if (pollTimerRef.current !== null) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
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
    // Saat user klik badge versi, cek sekalian apakah ada update SW terbaru
    if (navigator.onLine && swRegistrationRef.current) {
      swRegistrationRef.current.update().catch(() => {});
    }
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
