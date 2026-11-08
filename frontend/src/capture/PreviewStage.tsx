import { Canvas2DRenderer, startAnimation, World } from '@bwinkeler-aquarium/engine';
import type { CreatureKind, CreatureSize, Facing } from '@bwinkeler-aquarium/shared';
import { useEffect, useRef } from 'react';

interface PreviewStageProps {
  id: string;
  image: HTMLCanvasElement;
  kind: CreatureKind;
  size: CreatureSize;
  facing: Facing;
  label: string;
}

/** The creature swimming in a small aquarium, driven by the same engine as the TV. */
export function PreviewStage({ id, image, kind, size, facing, label }: PreviewStageProps) {
  const holder = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const box = holder.current;
    const target = canvas.current;
    if (!box || !target) return undefined;
    const renderer = new Canvas2DRenderer(target);
    const world = new World({ width: 400, height: 300, preview: true });
    const fit = () => {
      const width = Math.max(1, box.clientWidth);
      const height = Math.round(width * 0.75);
      world.resize(width, height);
      renderer.resize(width, height, Math.min(2, window.devicePixelRatio || 1));
    };
    fit();
    renderer.setImage(id, image, image.width, image.height);
    world.add({ id, kind, facing, size, width: image.width, height: image.height });
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    const stop = startAnimation((seconds) => {
      world.step(seconds);
      renderer.render(world);
    });
    return () => {
      stop();
      observer.disconnect();
    };
  }, [id, image, kind, size, facing]);

  return (
    <div ref={holder} className="stage">
      <canvas ref={canvas} className="stage__canvas" role="img" aria-label={label} />
    </div>
  );
}
