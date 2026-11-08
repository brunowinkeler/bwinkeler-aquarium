import type { ExtractOptions, Quad, TemplateKind } from '@bwinkeler-aquarium/extractor';

/** `photo` keeps the cropped picture as it is instead of separating a drawing from paper. */
export type ExtractMode = 'drawing' | 'photo';

export type WorkerRequest =
  | { type: 'load'; id: number; width: number; height: number; buffer: ArrayBuffer }
  | { type: 'extract'; id: number; quad: Quad; options: ExtractOptions; mode: ExtractMode };

export type WorkerReply =
  | { type: 'detected'; id: number; quad: Quad; confident: boolean; template: TemplateKind | null }
  | {
      type: 'extracted';
      id: number;
      width: number;
      height: number;
      buffer: ArrayBuffer;
      coverage: number;
    }
  | { type: 'empty'; id: number }
  | { type: 'error'; id: number; message: string };

export interface Extracted {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  coverage: number;
}

export interface Detection {
  quad: Quad;
  confident: boolean;
  /** Set when the photo shows a printed template; its quad is then exact. */
  template: TemplateKind | null;
}

type Pending = { resolve: (reply: WorkerReply) => void; reject: (error: Error) => void };

/** Runs the extractor in a Web Worker; the photo stays in the worker between calls. */
export class ExtractorClient {
  private readonly worker: Worker;
  private readonly pending = new Map<number, Pending>();
  private next = 1;

  constructor() {
    this.worker = new Worker(new URL('./extract.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (event: MessageEvent<WorkerReply>) => {
      const pending = this.pending.get(event.data.id);
      if (!pending) return;
      this.pending.delete(event.data.id);
      if (event.data.type === 'error') pending.reject(new Error(event.data.message));
      else pending.resolve(event.data);
    };
    this.worker.onerror = (event) => this.failAll(new Error(event.message || 'Worker failed'));
  }

  private call(request: WorkerRequest, transfer: Transferable[] = []): Promise<WorkerReply> {
    return new Promise((resolve, reject) => {
      this.pending.set(request.id, { resolve, reject });
      this.worker.postMessage(request, transfer);
    });
  }

  private failAll(error: Error): void {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }

  /** Hands the photo to the worker and returns the template or sheet corners it found. */
  async load(pixels: ImageData): Promise<Detection> {
    const buffer = pixels.data.buffer as ArrayBuffer;
    const reply = await this.call(
      { type: 'load', id: this.next++, width: pixels.width, height: pixels.height, buffer },
      [buffer],
    );
    if (reply.type !== 'detected') throw new Error('Unexpected worker reply');
    return { quad: reply.quad, confident: reply.confident, template: reply.template };
  }

  async extract(
    quad: Quad,
    options: ExtractOptions,
    mode: ExtractMode = 'drawing',
  ): Promise<Extracted | null> {
    const reply = await this.call({ type: 'extract', id: this.next++, quad, options, mode });
    if (reply.type === 'empty') return null;
    if (reply.type !== 'extracted') throw new Error('Unexpected worker reply');
    return {
      width: reply.width,
      height: reply.height,
      data: new Uint8ClampedArray(reply.buffer),
      coverage: reply.coverage,
    };
  }

  dispose(): void {
    this.failAll(new Error('Extractor closed'));
    this.worker.terminate();
  }
}
