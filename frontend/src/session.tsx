import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { SessionResponse } from '@bwinkeler-aquarium/shared';
import { api, ApiError, isGone } from './api';

export type Notice = 'ended' | 'left' | null;

export type SessionState =
  | { status: 'loading' }
  | { status: 'joined'; session: SessionResponse }
  | { status: 'guest'; notice: Notice }
  | { status: 'offline' };

interface SessionValue {
  state: SessionState;
  refresh: () => Promise<void>;
  /** Call after any request answered 401 or 410: the aquarium is gone for this phone. */
  lost: () => void;
  joined: () => Promise<void>;
  leave: () => Promise<void>;
}

const POLL_MS = 10_000;
const SessionContext = createContext<SessionValue | null>(null);

type Outcome =
  | { kind: 'joined'; session: SessionResponse }
  | { kind: 'ended' }
  | { kind: 'guest' }
  | { kind: 'offline' };

async function checkSession(): Promise<Outcome> {
  try {
    return { kind: 'joined', session: await api.session() };
  } catch (error) {
    if (error instanceof ApiError && error.status === 410) return { kind: 'ended' };
    if (isGone(error)) return { kind: 'guest' };
    return { kind: 'offline' };
  }
}

function next(current: SessionState, outcome: Outcome): SessionState {
  switch (outcome.kind) {
    case 'joined':
      return { status: 'joined', session: outcome.session };
    case 'ended':
      return { status: 'guest', notice: 'ended' };
    case 'guest':
      return current.status === 'guest' ? current : { status: 'guest', notice: null };
    case 'offline':
      // A joined phone keeps its last known state through short network losses.
      return current.status === 'joined' ? current : { status: 'offline' };
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: 'loading' });

  const apply = useCallback(
    (outcome: Outcome) => setState((current) => next(current, outcome)),
    [],
  );
  const refresh = useCallback(() => checkSession().then(apply), [apply]);

  useEffect(() => {
    void checkSession().then(apply);
  }, [apply]);

  const joinedNow = state.status === 'joined';
  useEffect(() => {
    if (!joinedNow) return undefined;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [joinedNow, refresh]);

  const lost = useCallback(() => setState({ status: 'guest', notice: 'ended' }), []);

  const leave = useCallback(async () => {
    try {
      await api.leave();
    } catch (error) {
      if (!isGone(error)) throw error;
    }
    setState({ status: 'guest', notice: 'left' });
  }, []);

  const value = useMemo<SessionValue>(
    () => ({ state, refresh, lost, joined: refresh, leave }),
    [state, refresh, lost, leave],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession needs a SessionProvider');
  return value;
}
