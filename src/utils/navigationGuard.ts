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
