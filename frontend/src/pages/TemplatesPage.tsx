import type { TemplateKind } from '@bwinkeler-aquarium/extractor';
import { Link } from 'react-router';
import { useI18n, type MessageKey } from '../i18n';

const NAMES: Record<TemplateKind, MessageKey> = {
  generic: 'templates.generic',
  swim: 'kind.swim',
  pulse: 'kind.pulse',
  walk: 'kind.walk',
  glide: 'kind.glide',
};
const KINDS = Object.keys(NAMES) as TemplateKind[];

export function TemplatesPage() {
  const { t, language } = useI18n();
  return (
    <section className="page" aria-labelledby="templates-title">
      <h1 id="templates-title">{t('templates.title')}</h1>
      <p>{t('templates.intro')}</p>
      <p className="hint">{t('templates.tip')}</p>
      <ul className="templates">
        {KINDS.map((kind) => (
          <li key={kind}>
            <a className="template" href={`/templates/${language}/${kind}.pdf`} download>
              <img
                className="template__preview"
                src={`/templates/${language}/${kind}.svg`}
                alt=""
                width="297"
                height="210"
              />
              <span className="template__name">{t(NAMES[kind])}</span>
              <span className="template__action">{t('templates.pdf')}</span>
            </a>
          </li>
        ))}
      </ul>
      <Link to="/" className="button">
        {t('common.back')}
      </Link>
    </section>
  );
}
