import { TvApp } from './app';
import { browserPlatform } from './platform';

const pointer = document.documentElement.getAttribute('data-input') === 'pointer';

/** The site root used to be the phone app: phones and copies installed from it still open it. */
function isPhone(): boolean {
  const installed =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const smallTouch =
    window.matchMedia('(pointer: coarse)').matches &&
    Math.min(window.screen.width, window.screen.height) < 600;
  return installed || smallTouch;
}

if (pointer && isPhone()) {
  window.location.replace('/join/');
} else {
  const app = new TvApp(browserPlatform(pointer));
  app.start();

  // Read-only diagnostics hook for end-to-end tests.
  (window as unknown as { aquariumTv: { getStatus(): object } }).aquariumTv = {
    getStatus: () => app.status(),
  };
}
