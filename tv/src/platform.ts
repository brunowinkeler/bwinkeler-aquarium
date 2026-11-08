export type TvKey = 'ok' | 'back' | 'up' | 'down' | 'left' | 'right' | 'red';

/** Everything that differs between TV platforms (DESIGN §13.3). */
export interface TvPlatform {
  readonly name: string;
  onKey(handler: (key: TvKey, event: KeyboardEvent) => void): void;
  keepAwake(): void;
  canExit: boolean;
  exit(): void;
  load(key: string): string | null;
  save(key: string, value: string | null): void;
}

const KEY_NAMES: { [name: string]: TvKey } = {
  Enter: 'ok',
  NumpadEnter: 'ok',
  Escape: 'back',
  Backspace: 'back',
  BrowserBack: 'back',
  GoBack: 'back',
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ColorF0Red: 'red',
  F2: 'red',
};

// webOS remotes report these key codes, often with an unidentified `key`.
const KEY_CODES: { [code: number]: TvKey } = {
  13: 'ok',
  461: 'back',
  8: 'back',
  27: 'back',
  37: 'left',
  38: 'up',
  39: 'right',
  40: 'down',
  403: 'red',
};

interface WakeLockNavigator {
  wakeLock?: { request(type: 'screen'): Promise<unknown> };
}

/** The `/tv/` build in any browser: keyboard keys, Screen Wake Lock, localStorage. */
export function browserPlatform(): TvPlatform {
  return {
    name: 'browser',
    canExit: false,
    onKey(handler) {
      document.addEventListener('keydown', (event) => {
        const key = KEY_NAMES[event.key] || KEY_CODES[event.keyCode];
        if (!key) return;
        if (key === 'back') event.preventDefault();
        handler(key, event);
      });
    },
    keepAwake() {
      const request = () => {
        const wakeLock = (navigator as WakeLockNavigator).wakeLock;
        if (wakeLock && document.visibilityState === 'visible') {
          wakeLock.request('screen').catch(() => undefined);
        }
      };
      request();
      document.addEventListener('visibilitychange', request);
    },
    exit() {
      window.close();
    },
    load(key) {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    save(key, value) {
      try {
        if (value === null) window.localStorage.removeItem(key);
        else window.localStorage.setItem(key, value);
      } catch {
        // Without storage the TV simply starts on the home screen next time.
      }
    },
  };
}
