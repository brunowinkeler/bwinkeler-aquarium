import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { en } from './en';
import { ptBR, type MessageKey, type Messages } from './pt-BR';

export type Language = 'pt-BR' | 'en';
export type { MessageKey };
export type Translate = (key: MessageKey, params?: Record<string, string | number>) => string;

const CATALOGUES: Record<Language, Messages> = { 'pt-BR': ptBR, en };
const STORAGE_KEY = 'aquarium.language';

export function translate(
  catalogue: Messages,
  key: MessageKey,
  params?: Record<string, string | number>,
): string {
  const template = catalogue[key];
  if (!params) return template;
  return template.replace(/\{([a-z0-9]+)\}/gi, (match, token: string) => {
    const value = params[token];
    return value === undefined ? match : String(value);
  });
}

export function detectLanguage(candidates: readonly string[]): Language {
  for (const candidate of candidates) {
    const lower = candidate.toLowerCase();
    if (lower.startsWith('pt')) return 'pt-BR';
    if (lower.startsWith('en')) return 'en';
  }
  return 'pt-BR';
}

function initialLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'pt-BR' || stored === 'en') return stored;
  } catch {
    // Storage can be unavailable in private modes; fall back to the browser languages.
  }
  return detectLanguage(navigator.languages);
}

interface I18nValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: Translate;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(initialLanguage);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not persisted; the choice still applies to this visit.
    }
  }, []);

  const value = useMemo<I18nValue>(
    () => ({
      language,
      setLanguage,
      t: (key, params) => translate(CATALOGUES[language], key, params),
    }),
    [language, setLanguage],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n needs an I18nProvider');
  return value;
}
