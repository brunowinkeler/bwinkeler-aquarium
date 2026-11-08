import { useEffect, useRef } from 'react';
import { useI18n } from '../i18n';

const SCAN_SIDE = 640;

interface QrScannerProps {
  onCode: (text: string) => void;
  onError: () => void;
}

/** Live camera view that reports the first QR code it reads. */
export function QrScanner({ onCode, onError }: QrScannerProps) {
  const { t } = useI18n();
  const video = useRef<HTMLVideoElement>(null);
  const callbacks = useRef({ onCode, onError });

  useEffect(() => {
    callbacks.current = { onCode, onError };
  }, [onCode, onError]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let frame = 0;
    let stopped = false;
    let decode: typeof import('jsqr').default | null = null;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });

    const scan = () => {
      if (stopped) return;
      const element = video.current;
      if (decode && element && context && element.readyState >= element.HAVE_ENOUGH_DATA) {
        const scale = Math.min(1, SCAN_SIDE / Math.max(element.videoWidth, element.videoHeight));
        canvas.width = Math.round(element.videoWidth * scale);
        canvas.height = Math.round(element.videoHeight * scale);
        context.drawImage(element, 0, 0, canvas.width, canvas.height);
        const image = context.getImageData(0, 0, canvas.width, canvas.height);
        const result = decode(image.data, image.width, image.height, {
          inversionAttempts: 'dontInvert',
        });
        if (result?.data) {
          stopped = true;
          callbacks.current.onCode(result.data);
          return;
        }
      }
      frame = requestAnimationFrame(scan);
    };

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then(async (media) => {
        if (stopped) {
          media.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = media;
        decode = (await import('jsqr')).default;
        const element = video.current;
        if (!element) return;
        element.srcObject = media;
        await element.play();
        frame = requestAnimationFrame(scan);
      })
      .catch(() => {
        if (!stopped) callbacks.current.onError();
      });

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return (
    <div className="scanner">
      <video
        ref={video}
        className="scanner__video"
        muted
        playsInline
        aria-label={t('join.scanVideoLabel')}
      />
      <p className="hint">{t('join.scanHint')}</p>
    </div>
  );
}

/** Accepts the join URL from the TV's QR code or a bare code. */
export function codeFromQr(text: string): string {
  try {
    const url = new URL(text, window.location.origin);
    const code = url.searchParams.get('code');
    if (code) return code;
  } catch {
    // Not a URL: treat the text itself as the code.
  }
  return text;
}
