import type { Point, Quad } from '@bwinkeler-aquarium/extractor';
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useI18n } from '../i18n';

const DISPLAY_SIDE = 1024;
const LOUPE = 120;
const ZOOM = 2.5;

interface CornerEditorProps {
  photo: HTMLCanvasElement;
  quad: Quad;
  onChange: (quad: Quad) => void;
}

function clampPoint(point: Point, width: number, height: number): Point {
  return {
    x: Math.min(Math.max(point.x, 0), width),
    y: Math.min(Math.max(point.y, 0), height),
  };
}

/** The photo with four draggable corner handles and a magnifier while dragging. */
export function CornerEditor({ photo, quad, onChange }: CornerEditorProps) {
  const { t } = useI18n();
  const frame = useRef<HTMLDivElement>(null);
  const display = useRef<HTMLCanvasElement>(null);
  const loupe = useRef<HTMLCanvasElement>(null);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const canvas = display.current;
    if (!canvas) return;
    const scale = Math.min(1, DISPLAY_SIDE / Math.max(photo.width, photo.height));
    canvas.width = Math.round(photo.width * scale);
    canvas.height = Math.round(photo.height * scale);
    canvas.getContext('2d')?.drawImage(photo, 0, 0, canvas.width, canvas.height);
  }, [photo]);

  const activePoint = active === null ? null : quad[active];
  useEffect(() => {
    const canvas = loupe.current;
    const box = frame.current;
    if (!canvas || !box || !activePoint) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const span = LOUPE / (ZOOM * (box.clientWidth / photo.width));
    context.fillStyle = '#000';
    context.fillRect(0, 0, LOUPE, LOUPE);
    context.drawImage(
      photo,
      activePoint.x - span / 2,
      activePoint.y - span / 2,
      span,
      span,
      0,
      0,
      LOUPE,
      LOUPE,
    );
    context.strokeStyle = '#ff5d8f';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(LOUPE / 2, LOUPE / 2 - 14);
    context.lineTo(LOUPE / 2, LOUPE / 2 + 14);
    context.moveTo(LOUPE / 2 - 14, LOUPE / 2);
    context.lineTo(LOUPE / 2 + 14, LOUPE / 2);
    context.stroke();
  }, [activePoint, photo]);

  const move = (index: number, point: Point) => {
    const next = quad.slice() as Quad;
    next[index] = clampPoint(point, photo.width, photo.height);
    onChange(next);
  };

  const onPointerMove = (index: number, event: PointerEvent<HTMLButtonElement>) => {
    const box = frame.current;
    if (active !== index || !box) return;
    const rect = box.getBoundingClientRect();
    move(index, {
      x: ((event.clientX - rect.left) / rect.width) * photo.width,
      y: ((event.clientY - rect.top) / rect.height) * photo.height,
    });
  };

  const onKeyDown = (index: number, event: KeyboardEvent<HTMLButtonElement>) => {
    const step = (event.shiftKey ? 0.05 : 0.01) * Math.max(photo.width, photo.height);
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const shift = delta[event.key];
    const point = quad[index];
    if (!shift || !point) return;
    event.preventDefault();
    move(index, { x: point.x + shift[0], y: point.y + shift[1] });
  };

  const percent = (point: Point) => ({
    left: `${(point.x / photo.width) * 100}%`,
    top: `${(point.y / photo.height) * 100}%`,
  });

  return (
    <div
      className="corners"
      ref={frame}
      style={{ aspectRatio: `${photo.width} / ${photo.height}` }}
    >
      <canvas
        ref={display}
        className="corners__photo"
        role="img"
        aria-label={t('corners.photoLabel')}
      />
      <svg
        className="corners__frame"
        viewBox={`0 0 ${photo.width} ${photo.height}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <polygon points={quad.map((point) => `${point.x},${point.y}`).join(' ')} />
      </svg>
      {quad.map((point, index) => (
        <button
          key={index}
          type="button"
          className="corners__handle"
          style={percent(point)}
          aria-label={t('corners.handle', { number: index + 1 })}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            setActive(index);
          }}
          onPointerMove={(event) => onPointerMove(index, event)}
          onPointerUp={() => setActive(null)}
          onPointerCancel={() => setActive(null)}
          onKeyDown={(event) => onKeyDown(index, event)}
        />
      ))}
      {activePoint && (
        <canvas
          ref={loupe}
          className="corners__loupe"
          width={LOUPE}
          height={LOUPE}
          style={percent(activePoint)}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
