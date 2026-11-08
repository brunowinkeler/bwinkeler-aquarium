import type { CreatureListResponse } from '@bwinkeler-aquarium/shared';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api, errorMessageKey, isGone } from '../api';
import { useI18n, type MessageKey } from '../i18n';
import { useSession } from '../session';

export function CreaturesPage() {
  const { t } = useI18n();
  const { lost } = useSession();
  const [list, setList] = useState<CreatureListResponse | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  // An in-page question: some browsers silently suppress window.confirm.
  const [confirming, setConfirming] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  const fail = useCallback(
    (failure: unknown) => {
      if (isGone(failure)) lost();
      else setError(errorMessageKey(failure));
    },
    [lost],
  );

  const show = useCallback(
    (loading: Promise<CreatureListResponse>) =>
      loading.then((result) => {
        setList(result);
        setError(null);
      }, fail),
    [fail],
  );

  useEffect(() => {
    void show(api.creatures());
  }, [show]);

  const remove = async (id: string) => {
    setRemoving(true);
    try {
      await api.remove(id);
      setConfirming(null);
      await show(api.creatures());
    } catch (failure) {
      fail(failure);
    } finally {
      setRemoving(false);
    }
  };

  return (
    <section className="page" aria-labelledby="list-title">
      <h1 id="list-title">{t('list.title')}</h1>
      {error && (
        <p className="error" role="alert">
          {t(error)}
        </p>
      )}
      {!list ? (
        <p className="status" role="status">
          {t('common.loading')}
        </p>
      ) : list.creatures.length === 0 ? (
        <p>{t('list.empty')}</p>
      ) : (
        <>
          <p className="hint">{t('list.capacity', { capacity: list.capacity })}</p>
          <ul className="creatures">
            {list.creatures.map((creature) => (
              <li key={creature.id} className="creature">
                {creature.status === 'active' ? (
                  <img
                    className="creature__image"
                    src={api.imageUrl(creature.id)}
                    alt={t('list.imageAlt', { kind: t(`kind.${creature.kind}`) })}
                    width={creature.width}
                    height={creature.height}
                    loading="lazy"
                  />
                ) : (
                  <span className="creature__image creature__image--pending">
                    {t('list.uploading')}
                  </span>
                )}
                <span className="creature__text">
                  <strong>{t(`kind.${creature.kind}`)}</strong>
                  {creature.author && <span>{t('list.by', { name: creature.author })}</span>}
                  {creature.mine && <span className="badge">{t('list.mine')}</span>}
                </span>
                {confirming === creature.id ? (
                  <span className="creature__confirm">
                    <span>{t('list.removeConfirm')}</span>
                    <button
                      type="button"
                      className="button button--small button--danger"
                      onClick={() => void remove(creature.id)}
                      disabled={removing}
                    >
                      {t('list.removeYes')}
                    </button>
                    <button
                      type="button"
                      className="button button--small"
                      onClick={() => setConfirming(null)}
                    >
                      {t('common.cancel')}
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="button button--small"
                    onClick={() => setConfirming(creature.id)}
                  >
                    {t('list.remove')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      <Link to="/" className="button">
        {t('common.back')}
      </Link>
    </section>
  );
}
