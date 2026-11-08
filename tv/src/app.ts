import { formatJoinCode, type EndReason, type ServerMessage } from '@bwinkeler-aquarium/shared';
import { SeaAmbience } from './ambience';
import {
  apiHost,
  createAquarium,
  disconnectPhones,
  endAquarium,
  issueJoinCode,
  joinUrl,
  socketUrl,
  TvApiError,
} from './api';
import { applyTexts, phonesText, text, type TextKey } from './i18n';
import type { TvKey, TvPlatform } from './platform';
import { drawQr } from './qr';
import { RelayClient, type Connection } from './relay';
import { AquariumScene } from './scene';

const STORAGE_KEY = 'aquarium.tv';
const SOUND_KEY = 'aquarium.sound';
const CODE_REFRESH_MARGIN_MS = 60 * 1000;
const TOAST_MS = 4000;
const IDLE_MS = 4000;

interface Credentials {
  aquariumId: string;
  token: string;
}

type Screen = 'home' | 'live' | 'ended';
type MenuAction = 'code' | 'sound' | 'disconnect' | 'end' | 'close';

function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error('Missing #' + id);
  return node as T;
}

type PrefixedDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => void;
};

function fullscreenElement(): Element | null {
  return (
    document.fullscreenElement || (document as PrefixedDocument).webkitFullscreenElement || null
  );
}

/** Chromium 53 only has the prefixed API, and some versions return no promise. */
function toggleFullscreen(): void {
  const page = document as PrefixedDocument;
  const root = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  let pending: Promise<void> | undefined;
  if (fullscreenElement()) {
    if (document.exitFullscreen) pending = document.exitFullscreen() as Promise<void> | undefined;
    else if (page.webkitExitFullscreen) page.webkitExitFullscreen();
  } else if (root.requestFullscreen) {
    pending = root.requestFullscreen() as Promise<void> | undefined;
  } else if (root.webkitRequestFullscreen) {
    root.webkitRequestFullscreen();
  }
  if (pending) pending.catch(() => undefined);
}

/** Screens, keys and the aquarium session of the TV client. */
export class TvApp {
  private screen: Screen = 'home';
  private credentials: Credentials | null = null;
  private relay: RelayClient | null = null;
  private connection: Connection = 'connecting';
  private phoneCount = 0;
  private joinCode: { code: string; expiresAt: number } | null = null;
  private codeTimer = 0;
  private panelOpen = false;
  /** Opened by the app itself: it closes when the first phone joins. */
  private panelAuto = false;
  private menuOpen = false;
  private debugOpen = false;
  private creating = false;
  private soundOn: boolean;
  private idleTimer = 0;
  private readonly ambience = new SeaAmbience();
  private readonly scene: AquariumScene;
  private readonly home = byId('home');
  private readonly createButton = byId<HTMLButtonElement>('create');
  private readonly homeError = byId('home-error');
  private readonly join = byId('join');
  private readonly joinClose = byId<HTMLButtonElement>('join-close');
  private readonly joinCodeText = byId('join-code');
  private readonly qr = byId<HTMLCanvasElement>('qr');
  private readonly chip = byId('chip');
  private readonly toolbar = byId('toolbar');
  private readonly toolCode = byId<HTMLButtonElement>('tool-code');
  private readonly toolSound = byId<HTMLButtonElement>('tool-sound');
  private readonly toolFullscreen = byId<HTMLButtonElement>('tool-fullscreen');
  private readonly toolMenu = byId<HTMLButtonElement>('tool-menu');
  private readonly menu = byId('menu');
  private readonly menuSound = byId<HTMLButtonElement>('menu-sound');
  private readonly ended = byId('ended');
  private readonly endedText = byId('ended-text');
  private readonly endedButton = byId<HTMLButtonElement>('ended-new');
  private readonly toasts = byId('toasts');
  private readonly offline = byId('offline');
  private readonly debug = byId('debug');

  constructor(private readonly platform: TvPlatform) {
    applyTexts(document);
    byId('join-open').textContent = text('joinOpen', { host: apiHost() });
    this.soundOn = platform.load(SOUND_KEY) !== 'off';
    this.scene = new AquariumScene(
      byId<HTMLCanvasElement>('scene'),
      () => (this.credentials ? this.credentials.token : null),
      (id) => {
        if (this.relay) this.relay.send({ type: 'displayed', id });
      },
    );
  }

  start(): void {
    this.scene.start();
    this.platform.keepAwake();
    this.platform.onKey((key, event) => this.onKey(key, event));
    this.createButton.addEventListener('click', () => this.create());
    this.endedButton.addEventListener('click', () => this.create());
    const buttons = this.menu.querySelectorAll('[data-action]');
    for (let i = 0; i < buttons.length; i++) {
      const button = buttons[i] as HTMLButtonElement;
      button.addEventListener('click', () =>
        this.menuAction(button.getAttribute('data-action') as MenuAction),
      );
    }
    window.setInterval(() => this.renderDebug(), 1000);
    if (this.platform.pointer) this.setUpPointer();
    this.renderSound();
    const saved = this.loadCredentials();
    if (saved) this.goLive(saved, false);
    else this.showHome();
  }

  /** Read-only diagnostics for tests and the debug overlay. */
  status(): object {
    return {
      screen: this.screen,
      aquariumId: this.credentials ? this.credentials.aquariumId : null,
      connection: this.connection,
      phoneCount: this.phoneCount,
      panelOpen: this.panelOpen,
      joinCode: this.joinCode ? this.joinCode.code : null,
      creatures: this.scene.creatures(),
      fps: this.scene.fps,
      pointer: this.platform.pointer,
      sound: this.soundOn ? this.ambience.state : 'off',
    };
  }

  /** /pc/: clickable controls that fade out while the mouse rests. */
  private setUpPointer(): void {
    const hint = this.join.querySelector('.join__hint');
    if (hint instanceof HTMLElement) hint.hidden = true;
    this.joinClose.hidden = false;
    this.joinClose.addEventListener('click', () => this.closePanel());
    this.toolCode.addEventListener('click', () =>
      this.panelOpen ? this.closePanel() : this.openPanel(false),
    );
    this.toolSound.addEventListener('click', () => this.toggleSound());
    this.toolFullscreen.addEventListener('click', () => toggleFullscreen());
    this.toolMenu.addEventListener('click', () =>
      this.menuOpen ? this.closeMenu() : this.openMenu(),
    );
    for (const type of ['mousemove', 'mousedown', 'touchstart', 'keydown']) {
      document.addEventListener(type, () => this.wake(), true);
    }
    for (const type of ['fullscreenchange', 'webkitfullscreenchange']) {
      document.addEventListener(type, () => this.renderTools());
    }
  }

  private wake(): void {
    document.body.classList.remove('idle');
    window.clearTimeout(this.idleTimer);
    this.idleTimer = window.setTimeout(() => {
      if (this.screen === 'live' && !this.menuOpen) document.body.classList.add('idle');
    }, IDLE_MS);
  }

  private renderTools(): void {
    this.toolbar.hidden = !this.platform.pointer || this.screen !== 'live';
    this.toolCode.textContent = text(this.panelOpen ? 'toolHideCode' : 'toolCode');
    this.toolFullscreen.textContent = text(
      fullscreenElement() ? 'toolExitFullscreen' : 'toolFullscreen',
    );
  }

  private renderSound(): void {
    const label = text(this.soundOn ? 'soundOn' : 'soundOff');
    this.toolSound.textContent = label;
    this.menuSound.textContent = label;
  }

  private toggleSound(): void {
    this.soundOn = !this.soundOn;
    this.platform.save(SOUND_KEY, this.soundOn ? null : 'off');
    this.renderSound();
    if (this.soundOn && this.screen === 'live') this.ambience.start();
    else this.ambience.stop();
  }

  private loadCredentials(): Credentials | null {
    const raw = this.platform.load(STORAGE_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Partial<Credentials>;
      return typeof parsed.aquariumId === 'string' && typeof parsed.token === 'string'
        ? { aquariumId: parsed.aquariumId, token: parsed.token }
        : null;
    } catch {
      return null;
    }
  }

  private saveCredentials(credentials: Credentials | null): void {
    this.platform.save(STORAGE_KEY, credentials ? JSON.stringify(credentials) : null);
  }

  private showHome(error?: TextKey): void {
    this.screen = 'home';
    this.home.hidden = false;
    this.ended.hidden = true;
    this.chip.hidden = true;
    this.homeError.textContent = error ? text(error) : '';
    this.ambience.stop();
    this.renderTools();
    this.createButton.focus();
  }

  private create(): void {
    if (this.creating) return;
    this.creating = true;
    const button = this.screen === 'ended' ? this.endedButton : this.createButton;
    button.disabled = true;
    button.textContent = text('creating');
    const reset = () => {
      this.creating = false;
      button.disabled = false;
      button.textContent = text('newAquarium');
    };
    createAquarium(this.credentials ? this.credentials.token : null).then(
      (created) => {
        reset();
        const credentials = { aquariumId: created.aquariumId, token: created.token };
        this.saveCredentials(credentials);
        this.goLive(credentials, true);
      },
      (error: unknown) => {
        reset();
        const status = error instanceof TvApiError ? error.status : 0;
        this.showHome(status === 429 ? 'errorLimit' : status === 503 ? 'errorBusy' : 'errorCreate');
      },
    );
  }

  private goLive(credentials: Credentials, fresh: boolean): void {
    this.credentials = credentials;
    this.screen = 'live';
    this.phoneCount = 0;
    this.joinCode = null;
    this.home.hidden = true;
    this.ended.hidden = true;
    this.updateChip();
    this.renderTools();
    if (this.platform.pointer) this.wake();
    if (this.soundOn) this.ambience.start();
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    if (this.relay) this.relay.stop();
    this.relay = new RelayClient(socketUrl(credentials.aquariumId), credentials.token, {
      onMessage: (message) => this.onMessage(message),
      onConnection: (state) => this.onConnection(state),
      onEnded: (reason) => this.onEnded(reason),
    });
    this.relay.start();
    if (fresh) this.openPanel(true);
  }

  private onMessage(message: ServerMessage): void {
    switch (message.type) {
      case 'snapshot':
        this.scene.sync(message.creatures);
        this.setPhones(message.phoneCount, false);
        if (message.phoneCount === 0 && !this.panelOpen && !this.menuOpen) this.openPanel(true);
        break;
      case 'creature_added':
        this.scene.add(message.creature, true);
        this.toast(
          message.creature.author
            ? text('toastCreature', { name: message.creature.author })
            : text('toastCreatureAnonymous'),
        );
        break;
      case 'creature_removed':
        this.scene.remove(message.id, message.reason);
        break;
      case 'phones_changed':
        this.setPhones(message.phoneCount, true);
        break;
      case 'aquarium_ended':
        this.onEnded(message.reason);
        break;
      default:
        break;
    }
  }

  private onConnection(state: Connection): void {
    this.connection = state;
    this.offline.hidden = state !== 'offline';
  }

  private onEnded(reason: EndReason | 'unauthorized' | 'replaced'): void {
    if (this.relay) this.relay.stop();
    this.relay = null;
    this.credentials = null;
    this.saveCredentials(null);
    this.closePanel();
    this.closeMenu();
    this.chip.hidden = true;
    this.offline.hidden = true;
    this.scene.clear();
    this.ambience.stop();
    if (reason === 'unauthorized') {
      this.showHome();
      return;
    }
    this.screen = 'ended';
    this.renderTools();
    document.body.classList.remove('idle');
    this.endedText.textContent = text(
      reason === 'expired' ? 'expired' : reason === 'replaced' ? 'replaced' : 'ended',
    );
    this.ended.hidden = false;
    this.endedButton.focus();
  }

  private setPhones(count: number, announce: boolean): void {
    if (announce && count > this.phoneCount) this.toast(text('toastPhone'));
    this.phoneCount = count;
    this.updateChip();
    if (count > 0 && this.panelOpen && this.panelAuto) this.closePanel();
  }

  private updateChip(): void {
    const phones = phonesText(this.phoneCount);
    this.chip.textContent = this.platform.pointer ? phones : text('chip', { phones });
    this.chip.hidden = this.screen !== 'live' || this.panelOpen;
  }

  private openPanel(auto: boolean): void {
    if (this.screen !== 'live' || !this.credentials) return;
    this.panelOpen = true;
    this.panelAuto = auto;
    this.join.hidden = false;
    this.updateChip();
    this.renderTools();
    this.refreshCode();
  }

  private closePanel(): void {
    this.panelOpen = false;
    this.join.hidden = true;
    window.clearTimeout(this.codeTimer);
    this.updateChip();
    this.renderTools();
  }

  /** Shows a valid code and asks for a new one shortly before it expires. */
  private refreshCode(): void {
    window.clearTimeout(this.codeTimer);
    const credentials = this.credentials;
    if (!this.panelOpen || !credentials) return;
    const current = this.joinCode;
    if (current && current.expiresAt - Date.now() > CODE_REFRESH_MARGIN_MS) {
      this.renderCode(current.code);
      this.codeTimer = window.setTimeout(
        () => this.refreshCode(),
        current.expiresAt - Date.now() - CODE_REFRESH_MARGIN_MS,
      );
      return;
    }
    issueJoinCode(credentials.token).then(
      (issued) => {
        if (this.credentials !== credentials) return;
        this.joinCode = issued;
        this.refreshCode();
      },
      (error: unknown) => {
        if (error instanceof TvApiError && error.status === 410) this.onEnded('ended');
        else this.codeTimer = window.setTimeout(() => this.refreshCode(), 5000);
      },
    );
  }

  private renderCode(code: string): void {
    this.joinCodeText.textContent = formatJoinCode(code);
    drawQr(this.qr, joinUrl(code));
  }

  private openMenu(): void {
    this.menuOpen = true;
    this.menu.hidden = false;
    const first = this.menu.querySelector('button');
    if (first) first.focus();
  }

  private closeMenu(): void {
    this.menuOpen = false;
    this.menu.hidden = true;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }

  private menuAction(action: MenuAction): void {
    if (action === 'sound') {
      this.toggleSound();
      return;
    }
    const credentials = this.credentials;
    this.closeMenu();
    if (!credentials) return;
    if (action === 'code') {
      this.openPanel(false);
    } else if (action === 'disconnect') {
      disconnectPhones(credentials.token).then(
        () => this.toast(text('toastDisconnected')),
        () => undefined,
      );
    } else if (action === 'end') {
      endAquarium(credentials.token).then(
        () => this.onEnded('ended'),
        (error: unknown) => {
          if (error instanceof TvApiError && error.status === 410) this.onEnded('ended');
        },
      );
    }
  }

  private moveMenuFocus(step: number): void {
    const buttons = this.menu.querySelectorAll('button');
    let index = -1;
    for (let i = 0; i < buttons.length; i++) if (buttons[i] === document.activeElement) index = i;
    const next = buttons[(index + step + buttons.length) % buttons.length];
    if (next) next.focus();
  }

  private onKey(key: TvKey, event: KeyboardEvent): void {
    if (key === 'red') {
      this.debugOpen = !this.debugOpen;
      this.debug.hidden = !this.debugOpen;
      this.renderDebug();
      return;
    }
    if (this.menuOpen) {
      if (key === 'up' || key === 'left') this.moveMenuFocus(-1);
      else if (key === 'down' || key === 'right') this.moveMenuFocus(1);
      else if (key === 'back') this.closeMenu();
      else if (key === 'ok' && !(document.activeElement instanceof HTMLButtonElement)) {
        this.moveMenuFocus(1);
      }
      if (key !== 'ok') event.preventDefault();
      return;
    }
    if (this.screen !== 'live') {
      if (key === 'back' && this.platform.canExit) this.platform.exit();
      return;
    }
    if (key === 'ok') {
      event.preventDefault();
      this.openPanel(false);
    } else if (key === 'back') {
      if (this.panelOpen) this.closePanel();
      else this.openMenu();
    }
  }

  private toast(message: string): void {
    const node = document.createElement('div');
    node.className = 'toast';
    node.textContent = message;
    this.toasts.appendChild(node);
    window.setTimeout(() => {
      if (node.parentNode) node.parentNode.removeChild(node);
    }, TOAST_MS);
  }

  private renderDebug(): void {
    if (!this.debugOpen) return;
    this.debug.textContent = JSON.stringify(this.status(), null, 1);
  }
}
