import { TvApp } from './app';
import { browserPlatform } from './platform';

const app = new TvApp(browserPlatform());
app.start();

// Read-only diagnostics hook for end-to-end tests.
(window as unknown as { aquariumTv: { getStatus(): object } }).aquariumTv = {
  getStatus: () => app.status(),
};
