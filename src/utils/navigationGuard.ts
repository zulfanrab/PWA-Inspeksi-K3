// src/utils/navigationGuard.ts

export type BackInterceptor = () => boolean; // return true if handled, false to let default proceed

const interceptors: BackInterceptor[] = [];

/**
 * Register an interceptor that will be called when a back action happens
 * (browser swipe-back, hardware back button, trackpad gesture, etc.).
 * Returns an unregister function.
 */
export function registerBackInterceptor(interceptor: BackInterceptor): () => void {
  interceptors.push(interceptor);
  return () => {
    const idx = interceptors.lastIndexOf(interceptor);
    if (idx !== -1) {
      interceptors.splice(idx, 1);
    }
  };
}

/**
 * Trigger topmost back interceptor.
 * Returns true if an interceptor handled the action.
 */
export function triggerBackAction(): boolean {
  if (interceptors.length > 0) {
    const active = interceptors[interceptors.length - 1];
    return active();
  }
  return false;
}

/**
 * Global Gesture Blocker:
 * Prevents mobile browser edge-swipe navigation (back/forward in Chrome/Safari/Edge)
 * and horizontal elastic dragging/rubber-banding across the entire application,
 * making the PWA behave like a truly native mobile app on Home, Form, and all views.
 */
export function initGlobalGestureBlocker(): () => void {
  let touchStartX = 0;
  let touchStartY = 0;
  let isHorizScrollable = false;

  const handleTouchStart = (e: TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;

    const target = e.target as HTMLElement | null;
    isHorizScrollable = !!target?.closest(
      '.overflow-x-auto, [data-allow-horizontal-scroll], input[type="range"]'
    );
  };

  const handleTouchMove = (e: TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;

    const deltaX = Math.abs(touch.clientX - touchStartX);
    const deltaY = Math.abs(touch.clientY - touchStartY);

    // 1. Jika di dalam container horizontal scroll (mis. preview dokumen di-zoom), biarkan pan bebas
    if (isHorizScrollable) return;

    // 2. Edge navigation prevention (Chrome/Safari back/forward gesture):
    const isNearEdge = touchStartX < 40 || touchStartX > window.innerWidth - 40;
    if (isNearEdge && deltaX > 2) {
      if (e.cancelable) e.preventDefault();
      return;
    }

    // 3. Prevent general horizontal page drag/swipe across entire app:
    if (deltaX > 4 && deltaX > deltaY) {
      if (e.cancelable) e.preventDefault();
    }
  };

  window.addEventListener('touchstart', handleTouchStart, { passive: true });
  window.addEventListener('touchmove', handleTouchMove, { passive: false });

  return () => {
    window.removeEventListener('touchstart', handleTouchStart);
    window.removeEventListener('touchmove', handleTouchMove);
  };
}
