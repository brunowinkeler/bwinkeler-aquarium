import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

interface DraftValue {
  /** The photo chosen on the home screen, waiting for the create flow. */
  photo: File | null;
  setPhoto: (photo: File | null) => void;
}

const DraftContext = createContext<DraftValue | null>(null);

export function DraftProvider({ children }: { children: ReactNode }) {
  const [photo, setPhoto] = useState<File | null>(null);
  const value = useMemo(() => ({ photo, setPhoto }), [photo]);
  return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>;
}

export function useDraft(): DraftValue {
  const value = useContext(DraftContext);
  if (!value) throw new Error('useDraft needs a DraftProvider');
  return value;
}
