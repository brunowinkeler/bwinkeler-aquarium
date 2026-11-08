import { registerSW } from 'virtual:pwa-register';

type UpdateListener = (needsRefresh: boolean) => void;

let needsRefresh = false;
let applyUpdate: ((reload?: boolean) => Promise<void>) | null = null;
const listeners = new Set<UpdateListener>();

export function subscribeToUpdates(listener: UpdateListener): () => void {
  listeners.add(listener);
  listener(needsRefresh);
  return () => {
    listeners.delete(listener);
  };
}

/** Updates wait for a tap, so a reload never interrupts a drawing being sent. */
export async function applyPendingUpdate(): Promise<void> {
  await applyUpdate?.(true);
}

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  applyUpdate = registerSW({
    immediate: true,
    onNeedRefresh() {
      needsRefresh = true;
      for (const listener of listeners) listener(needsRefresh);
    },
  });
}
