const MAX_FRAME_SECONDS = 0.25;

/** requestAnimationFrame loop with a clamped delta; returns a stop function. */
export function startAnimation(frame: (seconds: number) => void): () => void {
  let handle = 0;
  let last = 0;
  let running = true;
  const tick = (now: number): void => {
    if (!running) return;
    const seconds = last === 0 ? 0 : Math.min((now - last) / 1000, MAX_FRAME_SECONDS);
    last = now;
    frame(seconds);
    handle = requestAnimationFrame(tick);
  };
  const onVisibility = (): void => {
    last = 0;
  };
  document.addEventListener('visibilitychange', onVisibility);
  handle = requestAnimationFrame(tick);
  return () => {
    running = false;
    cancelAnimationFrame(handle);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}
