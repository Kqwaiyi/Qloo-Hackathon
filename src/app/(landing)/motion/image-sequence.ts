// A rendered turntable drawn frame by frame on a canvas, as the scroll asks for each frame. Frames
// load progressively: the first, then every 8th, every 4th, every 2nd, then the rest, so a coarse
// turn is ready early and fills in. Until the frame asked for has loaded, the nearest loaded one is
// drawn. The canvas sits over a poster image, so nothing shows blank while it loads.

/** A turntable's frames: `${base}/000.webp` … `${base}/${count - 1}.webp`. */
export interface Sequence {
  base: string;
  count: number;
}

export function frameUrl({ base }: Sequence, index: number): string {
  return `${base}/${String(index).padStart(3, "0")}.webp`;
}

/** The order frames load in: coarse to fine. */
function loadOrder(count: number): number[] {
  const order: number[] = [];
  for (const step of [count, 8, 4, 2, 1]) {
    for (let index = 0; index < count; index += step) if (!order.includes(index)) order.push(index);
  }
  return order;
}

export class ImageSequence {
  private readonly frames: (HTMLImageElement | null)[];
  private readonly context: CanvasRenderingContext2D | null;
  private readonly resizeObserver: ResizeObserver;
  private wanted = 0;
  private drawn = -1;
  private loading = false;
  private disposed = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly sequence: Sequence,
  ) {
    this.frames = Array.from({ length: sequence.count }, () => null);
    this.context = canvas.getContext("2d");
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
  }

  /** Starts loading the frames, at most a few at a time. */
  load(): void {
    if (this.loading || this.disposed) return;
    this.loading = true;
    const queue = loadOrder(this.sequence.count);
    const next = () => {
      const index = queue.shift();
      if (index === undefined || this.disposed) return;
      const image = new Image();
      image.decoding = "async";
      image.src = frameUrl(this.sequence, index);
      image
        .decode()
        .then(() => {
          if (this.disposed) return;
          this.frames[index] = image;
          if (this.nearestLoaded(this.wanted) === index) this.draw(this.wanted);
        })
        .catch(() => undefined)
        .finally(next);
    };
    for (let lane = 0; lane < 4; lane += 1) next();
  }

  /** Draws the frame asked for, or the nearest one that has loaded. */
  draw(index: number): void {
    this.wanted = Math.max(0, Math.min(this.sequence.count - 1, Math.round(index)));
    const nearest = this.nearestLoaded(this.wanted);
    if (nearest < 0 || nearest === this.drawn || !this.context) return;
    const image = this.frames[nearest];
    if (!image) return;
    const { width, height } = this.canvas;
    this.context.clearRect(0, 0, width, height);
    // The frames and the canvas share an aspect ratio; contain it anyway in case they don't.
    const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
    const drawWidth = image.naturalWidth * scale;
    const drawHeight = image.naturalHeight * scale;
    this.context.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
    this.drawn = nearest;
  }

  dispose(): void {
    this.disposed = true;
    this.resizeObserver.disconnect();
  }

  private resize(): void {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(this.canvas.clientWidth * ratio);
    const height = Math.round(this.canvas.clientHeight * ratio);
    if (width === this.canvas.width && height === this.canvas.height) return;
    this.canvas.width = width;
    this.canvas.height = height;
    this.drawn = -1;
    this.draw(this.wanted);
  }

  private nearestLoaded(index: number): number {
    for (let distance = 0; distance < this.sequence.count; distance += 1) {
      for (const candidate of [index - distance, index + distance]) {
        if (candidate >= 0 && candidate < this.sequence.count && this.frames[candidate]) return candidate;
      }
    }
    return -1;
  }
}
