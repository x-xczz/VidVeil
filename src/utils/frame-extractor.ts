export type PreviewResult =
  | { status: 'ready'; image: string; time: number }
  | { status: 'unavailable' | 'error' | 'superseded'; message: string };

interface FrameRequest {
  source: string;
  time: number;
  promise: Promise<PreviewResult>;
  resolve: (result: PreviewResult) => void;
}

class PreviewError extends Error {
  constructor(message: string, readonly permanent = false) { super(message); }
}

interface StoryboardCue { start: number; end: number; image: string; crop?: number[] }

export class FrameExtractor {
  private readonly cache = new Map<number, string>();
  private readonly maxSize = 100;
  private readonly lifetime = new AbortController();
  private offscreenVideo: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private sourceUrl = '';
  private activeRequest: FrameRequest | null = null;
  private pendingRequest: FrameRequest | null = null;
  private destroyed = false;
  private unavailable = '';
  private storyboard: Promise<StoryboardCue[]> | null = null;
  private storyboardKey = '';
  private generation = new AbortController();

  constructor(private readonly sourceVideo: HTMLVideoElement) {}

  async getFrame(time: number): Promise<string | null> {
    const result = await this.getPreview(time);
    return result.status === 'ready' ? result.image : null;
  }

  getPreview(time: number): Promise<PreviewResult> {
    if (this.destroyed || !Number.isFinite(time) || time < 0) {
      return Promise.resolve({ status: 'superseded', message: '' });
    }
    const source = this.sourceVideo.currentSrc || this.sourceVideo.src;
    if (source !== this.sourceUrl) {
      this.generation.abort();
      this.generation = new AbortController();
      this.releaseVideo();
      this.cache.clear();
      this.sourceUrl = source;
      this.unavailable = '';
      this.storyboard = null;
    }
    const bucket = Math.floor(time / 2) * 2;
    if (this.pendingRequest?.source === source && this.pendingRequest.time === bucket) return this.pendingRequest.promise;
    this.pendingRequest?.resolve({ status: 'superseded', message: '' });
    this.pendingRequest = null;
    const cached = this.cache.get(bucket);
    if (cached !== undefined) {
      this.cache.delete(bucket);
      this.cache.set(bucket, cached);
      return Promise.resolve({ status: 'ready', image: cached, time: bucket });
    }
    if (this.activeRequest?.source === source && this.activeRequest.time === bucket) return this.activeRequest.promise;
    let resolve!: (result: PreviewResult) => void;
    const promise = new Promise<PreviewResult>((done) => { resolve = done; });
    const request = { source, time: bucket, promise, resolve };
    if (this.activeRequest) this.pendingRequest = request;
    else void this.process(request);
    return promise;
  }

  private async process(request: FrameRequest): Promise<void> {
    this.activeRequest = request;
    const signal = this.generation.signal;
    let result: PreviewResult;
    try {
      const image = await this.extract(request.time, signal);
      if (this.destroyed || signal.aborted || request.source !== this.sourceUrl
        || request.source !== (this.sourceVideo.currentSrc || this.sourceVideo.src)) {
        result = { status: 'superseded', message: '' };
      } else {
        this.cache.set(request.time, image);
        if (this.cache.size > this.maxSize) {
          const oldest = this.cache.keys().next().value;
          if (oldest !== undefined) this.cache.delete(oldest);
        }
        result = { status: 'ready', image, time: request.time };
      }
    } catch (error) {
      if (this.destroyed || signal.aborted) result = { status: 'superseded', message: '' };
      else {
        const message = error instanceof Error ? error.message : '预览加载失败，请移动鼠标重试';
        const permanent = error instanceof PreviewError && error.permanent;
        if (permanent) this.unavailable = message;
        // A failed media element must be recreated for a later retry.
        this.releaseVideo();
        result = { status: permanent ? 'unavailable' : 'error', message };
      }
    }
    request.resolve(result);
    this.activeRequest = null;
    const next = this.pendingRequest;
    this.pendingRequest = null;
    if (next && !this.destroyed) void this.process(next);
  }

  private async extract(bucket: number, signal: AbortSignal): Promise<string> {
    // Native thumbnail metadata is safe to reuse even when the main source is MSE.
    const storyboard = await this.getStoryboard(signal);
    if (signal.aborted) throw new Error('Aborted');
    const cue = storyboard.find((item) => bucket >= item.start && bucket < item.end);
    if (cue) {
      try { return await this.drawStoryboard(cue, signal); }
      catch { if (signal.aborted) throw new Error('Aborted'); }
    }
    if (this.unavailable) throw new PreviewError(this.unavailable, true);
    if (!this.sourceUrl) throw new PreviewError('尚未获得视频源，请播放后重试');
    if (this.sourceVideo.mediaKeys) throw new PreviewError('受保护视频暂不支持画面预览', true);
    if (this.sourceUrl.toLowerCase().startsWith('blob:')) {
      throw new PreviewError('此流媒体未提供可用缩略图，仅显示时间', true);
    }
    const video = this.prepareVideo();
    if (video.readyState < 1) await this.waitFor(video, () => video.readyState >= 1, signal);
    if (!Number.isFinite(video.duration) || video.duration <= 0) throw new PreviewError('直播或未知时长视频暂不支持预览', true);
    const target = Math.min(bucket, Math.max(0, video.duration - 0.05));
    if (video.currentTime !== target || video.readyState < 2) {
      await this.waitFor(video,
        () => !video.seeking && video.readyState >= 2 && Math.abs(video.currentTime - target) < 0.1,
        signal, () => { video.currentTime = target; });
    }
    if (signal.aborted) throw new Error('Aborted');
    try {
      const { canvas, context } = this.getCanvas();
      context.drawImage(video, 0, 0, 160, 90);
      return canvas.toDataURL('image/jpeg', 0.7);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'SecurityError') {
        throw new PreviewError('视频源不允许跨域取帧，仅显示时间', true);
      }
      throw new PreviewError('画面尚未解码，请移动鼠标重试');
    }
  }

  private prepareVideo(): HTMLVideoElement {
    if (this.offscreenVideo) return this.offscreenVideo;
    const video = this.sourceVideo.ownerDocument.createElement('video');
    video.muted = true;
    video.defaultMuted = true;
    video.preload = 'auto';
    video.crossOrigin = this.sourceVideo.crossOrigin === 'use-credentials' ? 'use-credentials' : 'anonymous';
    video.playsInline = true;
    video.hidden = true;
    video.src = this.sourceUrl;
    this.offscreenVideo = video;
    video.load();
    return video;
  }

  private getCanvas(): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } {
    this.canvas ??= this.sourceVideo.ownerDocument.createElement('canvas');
    this.canvas.width = 160;
    this.canvas.height = 90;
    const context = this.canvas.getContext('2d');
    if (!context) throw new PreviewError('浏览器无法创建预览画布', true);
    return { canvas: this.canvas, context };
  }

  private waitFor(video: HTMLVideoElement, ready: () => boolean, signal: AbortSignal, start?: () => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const events = ['loadedmetadata', 'loadeddata', 'canplay', 'seeked'];
      const cleanup = () => {
        clearTimeout(timer);
        for (const event of events) video.removeEventListener(event, check);
        video.removeEventListener('error', fail);
        signal.removeEventListener('abort', abort);
        this.lifetime.signal.removeEventListener('abort', abort);
      };
      const check = () => { if (ready()) { cleanup(); resolve(); } };
      const abort = () => { cleanup(); reject(new Error('Aborted')); };
      const fail = () => {
        cleanup();
        reject(new PreviewError(video.error?.code === 3 ? '预览视频解码失败，请重试'
          : '预览源无法加载（网络、跨域或鉴权限制），可重试'));
      };
      const timer = setTimeout(() => { cleanup(); reject(new PreviewError('预览加载超时，移动鼠标可重试')); }, 12_000);
      for (const event of events) video.addEventListener(event, check);
      video.addEventListener('error', fail);
      signal.addEventListener('abort', abort, { once: true });
      this.lifetime.signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted || this.destroyed) { abort(); return; }
      if (video.error) { fail(); return; }
      try { start?.(); check(); } catch { fail(); }
    });
  }

  private getStoryboard(signal: AbortSignal): Promise<StoryboardCue[]> {
    const tracks = [...this.sourceVideo.querySelectorAll('track[kind="metadata"][src]')];
    const track = tracks.find((item) => /thumb|storyboard|预览|缩略/i.test(`${item.getAttribute('label')} ${item.getAttribute('src')}`));
    const url = track instanceof HTMLTrackElement ? track.src : '';
    if (this.storyboard && this.storyboardKey === url) return this.storyboard;
    this.storyboardKey = url;
    if (!url) return Promise.resolve([]);
    this.storyboard = (async () => {
      try {
        const response = await fetch(url, { signal: AbortSignal.any([signal, this.lifetime.signal, AbortSignal.timeout(4000)]) });
        if (!response.ok) return [];
        const text = await response.text();
        if (text.length > 2_000_000) return [];
        const seconds = (value: string) => value.split(':').reduce((sum, part) => sum * 60 + Number(part), 0);
        const cues: StoryboardCue[] = [];
        for (const block of text.replace(/\r/g, '').split(/\n\s*\n/)) {
          const match = block.match(/([\d:.]+)\s+-->\s+([\d:.]+)[^\n]*\n([^\n]+)/);
          if (!match?.[1] || !match[2] || !match[3]) continue;
          const image = new URL(match[3].trim(), response.url || url);
          if (!['https:', 'http:'].includes(image.protocol)) continue;
          const crop = image.hash.match(/^#xywh=(\d+),(\d+),(\d+),(\d+)$/)?.slice(1).map(Number);
          image.hash = '';
          const start = seconds(match[1]);
          const end = seconds(match[2]);
          if (Number.isFinite(start) && end > start) cues.push({ start, end, image: image.href, crop });
        }
        return cues;
      } catch { return []; }
    })();
    return this.storyboard;
  }

  private async drawStoryboard(cue: StoryboardCue, signal: AbortSignal): Promise<string> {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); image.onload = null; image.onerror = null; signal.removeEventListener('abort', fail); };
      const fail = () => { cleanup(); image.removeAttribute('src'); reject(new Error('Thumbnail unavailable')); };
      const timer = setTimeout(fail, 6000);
      image.onload = () => { cleanup(); resolve(); };
      image.onerror = fail;
      signal.addEventListener('abort', fail, { once: true });
      if (signal.aborted) { fail(); return; }
      image.src = cue.image;
    });
    if (signal.aborted) throw new Error('Aborted');
    const { canvas, context } = this.getCanvas();
    const [x = 0, y = 0, width = image.naturalWidth, height = image.naturalHeight] = cue.crop ?? [];
    context.drawImage(image, x, y, width, height, 0, 0, 160, 90);
    return canvas.toDataURL('image/jpeg', 0.7);
  }

  private releaseVideo(): void {
    if (this.offscreenVideo) {
      this.offscreenVideo.pause();
      this.offscreenVideo.removeAttribute('src');
      this.offscreenVideo.load();
      this.offscreenVideo.remove();
      this.offscreenVideo = null;
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.lifetime.abort();
    this.generation.abort();
    this.activeRequest?.resolve({ status: 'superseded', message: '' });
    this.pendingRequest?.resolve({ status: 'superseded', message: '' });
    this.pendingRequest = null;
    this.cache.clear();
    this.releaseVideo();
    if (this.canvas) { this.canvas.width = 0; this.canvas.height = 0; this.canvas = null; }
    this.storyboard = null;
  }
}
