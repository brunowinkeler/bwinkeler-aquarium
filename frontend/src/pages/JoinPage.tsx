import { normalizeJoinCode } from '@bwinkeler-aquarium/shared';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { api, ApiError, errorMessageKey } from '../api';
import { codeFromQr, QrScanner } from '../components/QrScanner';
import { useI18n, type MessageKey } from '../i18n';
import { useSession } from '../session';

export function JoinPage() {
  const { t } = useI18n();
  const { state, joined } = useSession();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const linkedCode = params.get('code');
  const [code, setCode] = useState(linkedCode ?? '');
  const [error, setError] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);

  if (state.status === 'joined' && !linkedCode) return <Navigate to="/" replace />;

  const join = async (value: string) => {
    const normalized = normalizeJoinCode(value);
    if (!normalized) {
      setError('join.invalidCode');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.join(normalized);
      await joined();
      void navigate('/', { replace: true });
    } catch (failure) {
      setError(
        failure instanceof ApiError && failure.code === 'not_found'
          ? 'join.badCode'
          : errorMessageKey(failure),
      );
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void join(code);
  };

  const notice =
    state.status === 'guest' && state.notice === 'ended'
      ? 'join.ended'
      : state.status === 'guest' && state.notice === 'left'
        ? 'join.left'
        : null;

  return (
    <section className="page join" aria-labelledby="join-title">
      <h1 id="join-title">{t('join.title')}</h1>
      {notice && (
        <p className="notice" role="status">
          {t(notice)}
        </p>
      )}
      <p>{t('join.intro')}</p>
      <form className="join__form" onSubmit={onSubmit} noValidate>
        <label htmlFor="join-code">{t('join.codeLabel')}</label>
        <input
          id="join-code"
          className="join__code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          maxLength={9}
          aria-describedby="join-code-hint"
          aria-invalid={error === 'join.invalidCode' || error === 'join.badCode'}
        />
        <p id="join-code-hint" className="hint">
          {t('join.codeHint')}
        </p>
        <button type="submit" className="button button--primary" disabled={busy}>
          {busy ? t('join.joining') : t('join.submit')}
        </button>
      </form>
      {error && (
        <p className="error" role="alert">
          {t(error)}
        </p>
      )}
      {scanning ? (
        <>
          <QrScanner
            onCode={(text) => {
              setScanning(false);
              const scanned = codeFromQr(text);
              setCode(scanned);
              void join(scanned);
            }}
            onError={() => {
              setScanning(false);
              setError('join.cameraError');
            }}
          />
          <button type="button" className="button" onClick={() => setScanning(false)}>
            {t('join.scanStop')}
          </button>
        </>
      ) : (
        <button type="button" className="button" onClick={() => setScanning(true)}>
          {t('join.scan')}
        </button>
      )}
      <Link to="/templates" className="button button--quiet">
        {t('templates.link')}
      </Link>
    </section>
  );
}
