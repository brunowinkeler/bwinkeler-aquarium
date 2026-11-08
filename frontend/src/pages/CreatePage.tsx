import {
  DEFAULT_EXTRACT_OPTIONS,
  type Quad,
  type TemplateKind,
} from '@bwinkeler-aquarium/extractor';
import {
  CREATURE_KINDS,
  createUlid,
  MAX_AUTHOR_LENGTH,
  MAX_IMAGE_BYTES,
  type CreatureKind,
  type Facing,
} from '@bwinkeler-aquarium/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { api, ApiError, errorMessageKey, isGone } from '../api';
import { ExtractorClient, type Extracted } from '../capture/client';
import { CornerEditor } from '../capture/CornerEditor';
import { canvasToPng, decodePhoto, imageToCanvas, rotateCanvas } from '../capture/photo';
import { PreviewStage } from '../capture/PreviewStage';
import { useDraft } from '../draft';
import { useI18n, type MessageKey } from '../i18n';
import { useSession } from '../session';

type Step = 'loading' | 'corners' | 'processing' | 'preview' | 'sending' | 'sent' | 'failed';

interface Adjustments {
  sensitivity: number;
  closeOutlines: number;
  includeLooseParts: boolean;
}

const INITIAL_ADJUSTMENTS: Adjustments = {
  sensitivity: DEFAULT_EXTRACT_OPTIONS.sensitivity,
  closeOutlines: DEFAULT_EXTRACT_OPTIONS.closeOutlines,
  includeLooseParts: DEFAULT_EXTRACT_OPTIONS.includeLooseParts,
};

const POLL_MS = 1500;
const POLL_ATTEMPTS = 40;

async function retrying<T>(action: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await action();
    } catch (error) {
      const network = error instanceof ApiError && error.code === 'network';
      if (!network || attempt >= 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }
}

export function CreatePage() {
  const { t } = useI18n();
  const { photo: file, setPhoto: setDraft } = useDraft();
  const { state, lost } = useSession();
  const navigate = useNavigate();
  const client = useRef<ExtractorClient | null>(null);
  const extraction = useRef(0);
  const debounce = useRef<number | undefined>(undefined);

  const [step, setStep] = useState<Step>('loading');
  const [error, setError] = useState<MessageKey | null>(null);
  const [photo, setPhoto] = useState<HTMLCanvasElement | null>(null);
  const [detected, setDetected] = useState<Quad | null>(null);
  const [quad, setQuad] = useState<Quad | null>(null);
  const [template, setTemplate] = useState<TemplateKind | null>(null);
  const [adjustments, setAdjustments] = useState<Adjustments>(INITIAL_ADJUSTMENTS);
  const [extracted, setExtracted] = useState<Extracted | null>(null);
  const [refining, setRefining] = useState(false);
  const [id, setId] = useState(() => createUlid());
  const [kind, setKind] = useState<CreatureKind>('swim');
  const [facing, setFacing] = useState<Facing>('right');
  const [turns, setTurns] = useState(0);
  const [author, setAuthor] = useState('');
  const [sentId, setSentId] = useState<string | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!file) return undefined;
    const extractor = new ExtractorClient();
    client.current = extractor;
    let cancelled = false;
    void (async () => {
      try {
        const decoded = await decodePhoto(file);
        const detection = await extractor.load(decoded.pixels);
        if (cancelled) return;
        setPhoto(decoded.canvas);
        setDetected(detection.quad);
        setQuad(detection.quad);
        if (!detection.template) {
          setStep('corners');
          return;
        }
        // A printed template fixes the corners, and maybe the kind: straight to the preview.
        setTemplate(detection.template);
        if (detection.template !== 'generic') setKind(detection.template);
        setStep('processing');
        const result = await extractor.extract(detection.quad, INITIAL_ADJUSTMENTS);
        if (cancelled) return;
        setExtracted(result);
        setStep('preview');
      } catch {
        if (cancelled) return;
        setError('create.decodeError');
        setStep('failed');
      }
    })();
    return () => {
      cancelled = true;
      window.clearTimeout(debounce.current);
      extractor.dispose();
      client.current = null;
    };
  }, [file]);

  const extract = useCallback(async (corners: Quad, options: Adjustments) => {
    const extractor = client.current;
    if (!extractor) return;
    const request = ++extraction.current;
    setRefining(true);
    try {
      const result = await extractor.extract(corners, options);
      if (request === extraction.current) setExtracted(result);
    } catch {
      if (request === extraction.current) setError('error.generic');
    } finally {
      if (request === extraction.current) setRefining(false);
    }
  }, []);

  const adjust = (next: Adjustments) => {
    setAdjustments(next);
    window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => {
      if (quad) void extract(quad, next);
    }, 250);
  };

  const image = useMemo(
    () => (extracted ? rotateCanvas(imageToCanvas(extracted), turns) : null),
    [extracted, turns],
  );

  useEffect(() => {
    if (step !== 'sent' || !sentId || shown) return undefined;
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts++;
      if (attempts >= POLL_ATTEMPTS) window.clearInterval(timer);
      api.creature(sentId).then(
        ({ creature }) => {
          if (creature.displayedAt !== null) setShown(true);
        },
        (failure: unknown) => {
          if (isGone(failure)) lost();
          else if (failure instanceof ApiError && failure.status === 404)
            window.clearInterval(timer);
        },
      );
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [step, sentId, shown, lost]);

  if (!file && step !== 'sent') return <Navigate to="/" replace />;

  const confirmCorners = async () => {
    if (!quad) return;
    setError(null);
    setStep('processing');
    await extract(quad, adjustments);
    setStep('preview');
  };

  const send = async () => {
    if (!image) return;
    setError(null);
    setStep('sending');
    try {
      const blob = await canvasToPng(image);
      if (blob.size > MAX_IMAGE_BYTES) throw new ApiError(413, 'payload_too_large');
      const name = author.trim().slice(0, MAX_AUTHOR_LENGTH);
      const metadata = {
        kind,
        facing,
        author: name ? name : null,
        width: image.width,
        height: image.height,
      };
      let creatureId = id;
      try {
        await retrying(() => api.reserve({ id: creatureId, ...metadata }));
      } catch (failure) {
        // An earlier attempt reserved this ID with other settings: start over with a new one.
        if (!(failure instanceof ApiError && failure.code === 'conflict')) throw failure;
        creatureId = createUlid();
        setId(creatureId);
        await retrying(() => api.reserve({ id: creatureId, ...metadata }));
      }
      await retrying(() => api.upload(creatureId, blob));
      setSentId(creatureId);
      setStep('sent');
      setDraft(null);
    } catch (failure) {
      if (isGone(failure)) {
        lost();
        return;
      }
      setError(errorMessageKey(failure));
      setStep('preview');
    }
  };

  const retake = () => {
    setDraft(null);
    void navigate('/');
  };

  const tvOnline = state.status === 'joined' && state.session.tvConnected;

  if (step === 'loading' || step === 'processing' || step === 'sending') {
    const message =
      step === 'loading'
        ? 'create.loading'
        : step === 'processing'
          ? 'processing.text'
          : 'send.sending';
    return (
      <section className="page">
        <p className="status status--busy" role="status">
          {t(message)}
        </p>
      </section>
    );
  }

  if (step === 'failed' || !photo || !quad) {
    return (
      <section className="page">
        <p className="error" role="alert">
          {t(error ?? 'create.decodeError')}
        </p>
        <Link to="/" className="button">
          {t('common.back')}
        </Link>
      </section>
    );
  }

  if (step === 'sent') {
    const message = shown ? 'send.shown' : tvOnline ? 'send.waitingDisplay' : 'send.waitingTv';
    return (
      <section className="page sent" aria-labelledby="sent-title">
        <div role="status">
          <h1 id="sent-title" className={shown ? 'sent__title sent__title--shown' : 'sent__title'}>
            {t(message)}
          </h1>
        </div>
        <Link to="/" className="button button--primary button--large">
          {t('send.another')}
        </Link>
        <Link to="/creatures" className="button">
          {t('send.list')}
        </Link>
      </section>
    );
  }

  if (step === 'corners') {
    return (
      <section className="page" aria-labelledby="corners-title">
        <h1 id="corners-title">{t('corners.title')}</h1>
        <p className="hint">{t('corners.hint')}</p>
        <CornerEditor photo={photo} quad={quad} onChange={setQuad} />
        <div className="actions">
          <button type="button" className="button" onClick={() => detected && setQuad(detected)}>
            {t('corners.reset')}
          </button>
          <button
            type="button"
            className="button button--primary"
            onClick={() => void confirmCorners()}
          >
            {t('corners.continue')}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="page preview" aria-labelledby="preview-title">
      <h1 id="preview-title">{t('preview.title')}</h1>
      {template && <p className="hint">{t('preview.template')}</p>}
      {image ? (
        <PreviewStage
          id={id}
          image={image}
          kind={kind}
          facing={facing}
          label={t('preview.canvasLabel')}
        />
      ) : (
        <p className="notice" role="status">
          {t('preview.empty')}
        </p>
      )}
      {refining && (
        <p className="hint" role="status">
          {t('processing.text')}
        </p>
      )}
      <fieldset className="kinds">
        <legend>{t('preview.kind')}</legend>
        {CREATURE_KINDS.map((value) => (
          <label key={value} className={value === kind ? 'chip chip--selected' : 'chip'}>
            <input
              type="radio"
              name="kind"
              value={value}
              checked={value === kind}
              onChange={() => setKind(value)}
              className="visually-hidden"
            />
            {t(`kind.${value}`)}
          </label>
        ))}
      </fieldset>
      <div className="actions">
        <button
          type="button"
          className="button"
          onClick={() => setFacing(facing === 'right' ? 'left' : 'right')}
          disabled={!image}
        >
          ⇄ {t('preview.flip')}
        </button>
        <button
          type="button"
          className="button"
          onClick={() => setTurns((turns + 1) % 4)}
          disabled={!image}
        >
          ⟳ {t('preview.rotate')}
        </button>
      </div>
      <details className="adjustments" open={!image}>
        <summary>{t('preview.adjustments')}</summary>
        <label className="field">
          <span>{t('preview.sensitivity')}</span>
          <input
            type="range"
            min={-1}
            max={1}
            step={0.1}
            value={adjustments.sensitivity}
            onChange={(event) =>
              adjust({ ...adjustments, sensitivity: Number(event.target.value) })
            }
          />
        </label>
        <label className="field">
          <span>{t('preview.closeOutlines')}</span>
          <input
            type="range"
            min={0.002}
            max={0.02}
            step={0.002}
            value={adjustments.closeOutlines}
            onChange={(event) =>
              adjust({ ...adjustments, closeOutlines: Number(event.target.value) })
            }
          />
        </label>
        <label className="field field--inline">
          <input
            type="checkbox"
            checked={adjustments.includeLooseParts}
            onChange={(event) =>
              adjust({ ...adjustments, includeLooseParts: event.target.checked })
            }
          />
          <span>{t('preview.looseParts')}</span>
        </label>
        <button type="button" className="button button--small" onClick={() => setStep('corners')}>
          {t('preview.corners')}
        </button>
      </details>
      <label className="field">
        <span>{t('preview.name')}</span>
        <input
          type="text"
          value={author}
          maxLength={MAX_AUTHOR_LENGTH}
          autoComplete="off"
          onChange={(event) => setAuthor(event.target.value)}
        />
      </label>
      {error && (
        <p className="error" role="alert">
          {t(error)}
        </p>
      )}
      <div className="actions">
        <button type="button" className="button" onClick={retake}>
          {t('preview.retake')}
        </button>
        <button
          type="button"
          className="button button--primary"
          onClick={() => void send()}
          disabled={!image || refining}
        >
          {t('preview.send')}
        </button>
      </div>
    </section>
  );
}
