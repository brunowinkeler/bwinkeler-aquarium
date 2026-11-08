import { useState, type ChangeEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { errorMessageKey } from '../api';
import { useDraft } from '../draft';
import { useI18n, type MessageKey } from '../i18n';
import { useSession } from '../session';

export function HomePage() {
  const { t, language } = useI18n();
  const { state, leave } = useSession();
  const { setPhoto } = useDraft();
  const navigate = useNavigate();
  const [error, setError] = useState<MessageKey | null>(null);
  const [confirmingLeave, setConfirmingLeave] = useState(false);

  if (state.status !== 'joined') return null;
  const { session } = state;

  const choose = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setPhoto(file);
    void navigate('/new');
  };

  const onLeave = async () => {
    try {
      await leave();
      void navigate('/join', { replace: true });
    } catch (failure) {
      setError(errorMessageKey(failure));
    }
  };

  const waitingUntil =
    !session.tvConnected && session.expiresAt !== null
      ? new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit' }).format(
          session.expiresAt,
        )
      : null;

  return (
    <section className="page home" aria-labelledby="home-title">
      <h1 id="home-title" className="visually-hidden">
        {t('app.name')}
      </h1>
      <div className="status-card">
        <p className={session.tvConnected ? 'tv tv--online' : 'tv'} data-testid="tv-status">
          <span className="tv__dot" aria-hidden="true" />
          {session.tvConnected ? t('home.tvOnline') : t('home.tvOffline')}
        </p>
        {waitingUntil && <p className="hint">{t('home.tvWaiting', { time: waitingUntil })}</p>}
        <p className="counts">
          {t('home.creatures', { count: session.creatureCount, capacity: session.capacity })}
          {' · '}
          {session.phoneCount === 1
            ? t('home.phonesOne')
            : t('home.phonesMany', { count: session.phoneCount })}
        </p>
      </div>
      <p className="lead">{t('home.prompt')}</p>
      <label className="button button--primary button--large">
        {t('home.takePhoto')}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="visually-hidden"
          data-testid="camera-input"
          onChange={choose}
        />
      </label>
      <label className="button button--large">
        {t('home.gallery')}
        <input
          type="file"
          accept="image/*"
          className="visually-hidden"
          data-testid="gallery-input"
          onChange={choose}
        />
      </label>
      <Link to="/creatures" className="button">
        {t('home.list')}
      </Link>
      <Link to="/templates" className="button">
        {t('templates.link')}
      </Link>
      {error && (
        <p className="error" role="alert">
          {t(error)}
        </p>
      )}
      {confirmingLeave ? (
        <div className="panel confirm">
          <p>{t('home.leaveConfirm')}</p>
          <div className="actions">
            <button type="button" className="button button--danger" onClick={() => void onLeave()}>
              {t('home.leaveYes')}
            </button>
            <button type="button" className="button" onClick={() => setConfirmingLeave(false)}>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="button button--quiet"
          onClick={() => setConfirmingLeave(true)}
        >
          {t('home.leave')}
        </button>
      )}
    </section>
  );
}
