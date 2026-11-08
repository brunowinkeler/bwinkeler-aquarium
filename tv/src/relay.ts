import {
  parseServerMessage,
  WS_CLOSE,
  WS_PING,
  WS_PING_INTERVAL_MS,
  type EndReason,
  type ServerMessage,
  type TvMessage,
} from '@bwinkeler-aquarium/shared';

export type Connection = 'connecting' | 'online' | 'offline';

export interface RelayHandlers {
  onMessage(message: ServerMessage): void;
  onConnection(state: Connection): void;
  /** The aquarium is gone, or this token no longer opens it. */
  onEnded(reason: EndReason | 'unauthorized' | 'replaced'): void;
}

const MIN_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30000;

/** TV WebSocket: first-message auth, ping, reconnection with jitter and revision-gap resync. */
export class RelayClient {
  private socket: WebSocket | null = null;
  private stopped = false;
  private attempts = 0;
  private revision = -1;
  private pingTimer = 0;
  private retryTimer = 0;

  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly handlers: RelayHandlers,
  ) {}

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    window.clearInterval(this.pingTimer);
    window.clearTimeout(this.retryTimer);
    if (this.socket) {
      this.socket.onclose = null;
      this.socket.close();
      this.socket = null;
    }
  }

  send(message: TvMessage): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }

  private connect(): void {
    this.handlers.onConnection('connecting');
    let socket: WebSocket;
    try {
      socket = new WebSocket(this.url);
    } catch {
      this.retry();
      return;
    }
    this.socket = socket;
    socket.onopen = () => {
      socket.send(JSON.stringify({ type: 'auth', token: this.token }));
      window.clearInterval(this.pingTimer);
      this.pingTimer = window.setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) socket.send(WS_PING);
      }, WS_PING_INTERVAL_MS);
    };
    socket.onmessage = (event) => {
      const message = parseServerMessage(String(event.data));
      if (!message || message.type === 'pong') return;
      if (message.type === 'snapshot') {
        this.attempts = 0;
        this.revision = message.revision;
        this.handlers.onConnection('online');
      } else if ('revision' in message) {
        if (message.revision !== this.revision + 1) {
          // Missed events: ask for a fresh snapshot instead of applying a gap.
          this.send({ type: 'sync' });
        }
        this.revision = message.revision;
      }
      this.handlers.onMessage(message);
    };
    socket.onclose = (event) => {
      window.clearInterval(this.pingTimer);
      this.socket = null;
      if (this.stopped) return;
      if (event.code === WS_CLOSE.ended) this.handlers.onEnded('ended');
      else if (event.code === WS_CLOSE.unauthorized) this.handlers.onEnded('unauthorized');
      else if (event.code === WS_CLOSE.replaced) this.handlers.onEnded('replaced');
      else this.retry();
    };
  }

  private retry(): void {
    this.handlers.onConnection('offline');
    const base = Math.min(MAX_BACKOFF_MS, MIN_BACKOFF_MS * Math.pow(2, this.attempts));
    this.attempts++;
    const delay = base / 2 + Math.random() * (base / 2);
    this.retryTimer = window.setTimeout(() => this.connect(), delay);
  }
}
