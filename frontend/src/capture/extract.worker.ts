import { detectPaperQuad, extractCreature, type RgbaImage } from '@bwinkeler-aquarium/extractor';
import type { WorkerReply, WorkerRequest } from './client';

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: WorkerReply, transfer?: Transferable[]): void;
};

let photo: RgbaImage | null = null;

scope.onmessage = (event) => {
  const request = event.data;
  try {
    if (request.type === 'load') {
      photo = {
        width: request.width,
        height: request.height,
        data: new Uint8ClampedArray(request.buffer),
      };
      const detection = detectPaperQuad(photo);
      scope.postMessage({
        type: 'detected',
        id: request.id,
        quad: detection.quad,
        confident: detection.confident,
      });
      return;
    }
    if (!photo) throw new Error('No photo loaded');
    const result = extractCreature(photo, request.quad, request.options);
    if (!result) {
      scope.postMessage({ type: 'empty', id: request.id });
      return;
    }
    const buffer = result.image.data.buffer as ArrayBuffer;
    scope.postMessage(
      {
        type: 'extracted',
        id: request.id,
        width: result.image.width,
        height: result.image.height,
        buffer,
        coverage: result.coverage,
      },
      [buffer],
    );
  } catch (error) {
    scope.postMessage({
      type: 'error',
      id: request.id,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
