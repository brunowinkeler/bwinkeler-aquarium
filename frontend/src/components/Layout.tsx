import { useEffect, useState } from 'react';
import { Link, Outlet } from 'react-router';
import { useI18n } from '../i18n';
import { applyPendingUpdate, subscribeToUpdates } from '../pwa';

function UpdateBanner() {
  const { t } = useI18n();
  const [available, setAvailable] = useState(false);
  useEffect(() => subscribeToUpdates(setAvailable), []);
  if (!available) return null;
  return (
    <div className="banner" role="status">
      <span>{t('update.available')}</span>
      <button
        type="button"
        className="button button--small"
        onClick={() => void applyPendingUpdate()}
      >
        {t('update.reload')}
      </button>
    </div>
  );
}

export function Layout() {
  const { t, language, setLanguage } = useI18n();
  return (
    <>
      <a className="skip-link" href="#main">
        {t('app.skipToContent')}
      </a>
      <header className="header">
        <Link to="/" className="header__title">
          <img src="/favicon.svg" alt="" width="28" height="28" />
          {t('app.name')}
        </Link>
        <button
          type="button"
          className="header__language"
          aria-label={t('app.languageSwitchLabel')}
          onClick={() => setLanguage(language === 'pt-BR' ? 'en' : 'pt-BR')}
        >
          {t('app.languageSwitch')}
        </button>
      </header>
      <UpdateBanner />
      <main id="main" className="main" tabIndex={-1}>
        <Outlet />
      </main>
    </>
  );
}
