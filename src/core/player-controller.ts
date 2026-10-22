import { createApp, reactive, type App } from 'vue';
import PlayerOverlay, { playerOverlayStyles } from '../components/PlayerOverlay.vue';
import type { PlayerState } from '../types/rules';
import { NativeUiShield } from './native-ui-shield';

interface ContainerLease {
  count: number;
  position: string;
  priority: string;
  changedPosition: boolean;
  marker: string | null;
}

const containers = new Map<HTMLElement, ContainerLease>();
const controllers = new Set<VidVeilController>();
let activeController: VidVeilController | null = null;
let shieldStyle: HTMLStyleElement | null = null;

export function formatTime(time: number): string {
  if (!Number.isFinite(time) || time < 0) return '00:00';
  const seconds = Math.floor(time);
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export class VidVeilController {
  readonly state = reactive<PlayerState>({
    paused: true, ended: false, waiting: false, currentTime: 0, duration: 0,
    volume: 1, muted: false, playbackRate: 1, buffered: [],
    isFullscreen: false, isPictureInPicture: false,
  });
  readonly toast = reactive({ message: '' });
  readonly activity = reactive({ revision: 0 });
  readonly originalControlsState: boolean;
  readonly container: HTMLElement;
  readonly host: HTMLElement;
  private readonly abortController = new AbortController();
  private readonly resizeObserver: ResizeObserver;
  private app: App | null = null;
  private nativeUiShield: NativeUiShield | null = null;
  private destroyed = false;
  private frame = 0;
  private toastTimer: ReturnType<typeof setTimeout> | undefined;
  private keyTimer: ReturnType<typeof setTimeout> | undefined;
  private rightPressed = false;
  private rightBoosted = false;
  private savedRate = 1;
  private readonly boosts = new Set<string>();

  constructor(readonly video: HTMLVideoElement, private readonly onEject: () => void) {
    this.originalControlsState = video.controls;
    const parent = video.parentElement;
    if (!parent) throw new Error('Cannot mount a detached video.');
    const bounds = video.getBoundingClientRect();
    let candidate: HTMLElement | null = parent;
    let wrapper: HTMLElement | null = null;
    for (let depth = 0; candidate && depth < 3; depth++, candidate = candidate.parentElement) {
      if (candidate === document.body || candidate === document.documentElement) break;
      const rect = candidate.getBoundingClientRect();
      if (bounds.width > 0 && bounds.height > 0
        && Math.abs(rect.width - bounds.width) / bounds.width <= 0.15
        && Math.abs(rect.height - bounds.height) / bounds.height <= 0.15
        && candidate.querySelectorAll('video').length === 1) {
        wrapper = candidate;
        break;
      }
    }
    this.container = wrapper ?? parent;
    this.host = document.createElement('vidveil-host');
    this.host.style.cssText = 'all:initial!important;position:absolute!important;display:block!important;z-index:2147483646!important;pointer-events:auto!important;margin:0!important;padding:0!important;border:0!important;box-sizing:border-box!important;';
    this.resizeObserver = new ResizeObserver(() => this.scheduleBounds());

    try {
      this.acquireContainer(Boolean(wrapper));
      video.controls = false;
      this.container.append(this.host);
      const shadow = this.host.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = playerOverlayStyles;
      const mount = document.createElement('div');
      mount.className = 'vidveil-mount';
      shadow.append(style, mount);
      this.syncState();
      this.app = createApp(PlayerOverlay, { controller: this });
      this.app.mount(mount);
      this.nativeUiShield = new NativeUiShield(video, this.host);
      // Stop at the ShadowRoot bubble boundary, after Vue has handled the event.
      // Stopping at window capture would also break our own sliders and gestures.
      for (const event of ['mousedown', 'mouseup', 'mousemove', 'mouseover', 'mouseout',
        'pointerdown', 'pointerup', 'pointermove', 'pointerover', 'pointerout', 'pointercancel',
        'touchstart', 'touchmove', 'touchend', 'touchcancel', 'click', 'dblclick', 'auxclick',
        'wheel', 'contextmenu', 'keydown', 'keyup', 'keypress', 'focusin', 'focusout', 'input', 'change']) {
        shadow.addEventListener(event, (nativeEvent) => {
          if (event === 'pointerover' || event === 'mousedown') this.activate();
          nativeEvent.stopPropagation();
        }, { signal: this.abortController.signal });
      }
      controllers.add(this);
      const options = { signal: this.abortController.signal };
      for (const event of ['play', 'pause', 'ended', 'timeupdate', 'durationchange', 'loadedmetadata',
        'progress', 'volumechange', 'ratechange', 'seeking', 'seeked', 'canplay', 'playing', 'emptied']) {
        video.addEventListener(event, () => this.syncState(), options);
      }
      video.addEventListener('waiting', () => { this.state.waiting = true; }, options);
      video.addEventListener('error', () => this.notify('视频加载失败，请检查原始视频源'), options);
      document.addEventListener('fullscreenchange', () => { this.syncState(); this.scheduleBounds(); }, options);
      video.addEventListener('enterpictureinpicture', () => this.syncState(), options);
      video.addEventListener('leavepictureinpicture', () => this.syncState(), options);
      this.host.addEventListener('pointerenter', () => this.activate(), options);
      this.host.addEventListener('pointerdown', () => this.activate(), options);
      window.addEventListener('keydown', this.onKeyDown, { ...options, capture: true });
      window.addEventListener('keyup', this.onKeyUp, { ...options, capture: true });
      window.addEventListener('blur', () => this.cancelTemporarySpeed(), options);
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) this.cancelTemporarySpeed();
      }, options);
      window.addEventListener('resize', () => this.scheduleBounds(), options);
      window.addEventListener('scroll', () => this.scheduleBounds(), { ...options, capture: true, passive: true });
      this.resizeObserver.observe(video);
      this.resizeObserver.observe(this.container);
      this.syncBounds();
    } catch (error) {
      this.unmountAndRestore();
      throw error;
    }
  }

  private acquireContainer(shield: boolean): void {
    let lease = containers.get(this.container);
    if (!lease) {
      lease = {
        count: 0,
        position: this.container.style.getPropertyValue('position'),
        priority: this.container.style.getPropertyPriority('position'),
        changedPosition: getComputedStyle(this.container).position === 'static',
        marker: this.container.getAttribute('data-vidveil-container'),
      };
      containers.set(this.container, lease);
      if (lease.changedPosition) this.container.style.setProperty('position', 'relative', 'important');
    }
    lease.count++;
    if (shield) this.container.setAttribute('data-vidveil-container', 'true');
    if (!shieldStyle) {
      shieldStyle = document.createElement('style');
      shieldStyle.id = 'vidveil-shield-style';
      shieldStyle.textContent = `
        [data-vidveil-container="true"]:fullscreen {
          width: 100vw !important; height: 100vh !important; background: #000 !important;
        }
        [data-vidveil-container="true"]:fullscreen video,
        [data-vidveil-container="true"]:fullscreen :has(video) {
          width: 100% !important; height: 100% !important;
          max-width: none !important; max-height: none !important;
          object-fit: contain !important;
        }
      `;
      (document.head ?? document.documentElement).append(shieldStyle);
    }
  }

  activate(): void { activeController = this; }

  refreshBounds(): void { this.scheduleBounds(); }

  private scheduleBounds(): void {
    if (!this.destroyed && !this.frame) this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.syncBounds();
    });
  }

  private syncBounds(): void {
    const rect = this.video.getBoundingClientRect();
    const parent = this.container.getBoundingClientRect();
    const scaleX = this.container.offsetWidth ? parent.width / this.container.offsetWidth : 1;
    const scaleY = this.container.offsetHeight ? parent.height / this.container.offsetHeight : 1;
    const x = scaleX || 1;
    const y = scaleY || 1;
    this.host.style.setProperty('left', `${(rect.left - parent.left) / x - this.container.clientLeft + this.container.scrollLeft}px`, 'important');
    this.host.style.setProperty('top', `${(rect.top - parent.top) / y - this.container.clientTop + this.container.scrollTop}px`, 'important');
    this.host.style.setProperty('width', `${rect.width / x}px`, 'important');
    this.host.style.setProperty('height', `${rect.height / y}px`, 'important');
  }

  private syncState(): void {
    const video = this.video;
    const buffered = [];
    for (let i = 0; i < video.buffered.length; i++) {
      buffered.push({ start: video.buffered.start(i), end: video.buffered.end(i) });
    }
    Object.assign(this.state, {
      paused: video.paused, ended: video.ended,
      waiting: !video.paused && (video.seeking || video.readyState < 3),
      currentTime: video.currentTime,
      duration: Number.isFinite(video.duration) ? video.duration : 0,
      volume: video.volume, muted: video.muted, playbackRate: video.playbackRate, buffered,
      isFullscreen: document.fullscreenElement === this.container,
      isPictureInPicture: document.pictureInPictureElement === video,
    });
  }

  notify(message: string): void {
    if (this.destroyed) return;
    clearTimeout(this.toastTimer);
    this.toast.message = message;
    this.toastTimer = setTimeout(() => { this.toast.message = ''; }, 1600);
  }

  async togglePlayback(): Promise<void> {
    if (this.destroyed) return;
    try {
      if (this.video.paused) await this.video.play();
      else this.video.pause();
    } catch { this.notify('无法播放，请检查视频或网站限制'); }
  }

  seekTo(time: number): void {
    if (!Number.isFinite(time) || !Number.isFinite(this.video.duration) || this.video.duration <= 0) return;
    try {
      this.video.currentTime = Math.max(0, Math.min(time, this.video.duration));
      this.syncState();
    } catch { this.notify('当前视频暂不支持跳转'); }
  }

  seekBy(delta: number): void {
    this.seekTo(this.video.currentTime + delta);
    this.notify(`⏩ ${formatTime(this.video.currentTime)}`);
  }

  setVolume(value: number): void {
    this.video.volume = Math.max(0, Math.min(1, value));
    if (value > 0) this.video.muted = false;
    this.notify(`🔊 ${Math.round(this.video.volume * 100)}%`);
  }

  toggleMute(): void { this.video.muted = !this.video.muted; }

  setRate(rate: number): void {
    if (!Number.isFinite(rate) || rate <= 0) return;
    if (this.boosts.size) this.savedRate = rate;
    else this.video.playbackRate = rate;
  }

  startBoost(source: string): void {
    if (this.destroyed || this.boosts.has(source)) return;
    if (!this.boosts.size) this.savedRate = this.video.playbackRate;
    this.boosts.add(source);
    this.video.playbackRate = 3;
    this.notify('⚡ 3.0x Speed');
  }

  endBoost(source: string): void {
    if (this.boosts.delete(source) && !this.boosts.size) this.video.playbackRate = this.savedRate;
  }

  private cancelTemporarySpeed(): void {
    clearTimeout(this.keyTimer);
    this.rightPressed = false;
    this.rightBoosted = false;
    if (this.boosts.size) {
      this.boosts.clear();
      this.video.playbackRate = this.savedRate;
    }
  }

  async toggleFullscreen(): Promise<void> {
    try {
      if (document.fullscreenElement === this.container) await document.exitFullscreen();
      else {
        if (document.fullscreenElement) await document.exitFullscreen();
        await this.container.requestFullscreen();
      }
    } catch { this.notify('当前页面不允许全屏'); }
  }

  async togglePictureInPicture(): Promise<void> {
    try {
      if (document.pictureInPictureElement === this.video) await document.exitPictureInPicture();
      else if (document.pictureInPictureEnabled && !this.video.disablePictureInPicture) await this.video.requestPictureInPicture();
      else this.notify('当前浏览器或视频不支持画中画');
    } catch { this.notify('无法开启画中画，请先播放视频'); }
  }

  eject(): void { if (!this.destroyed) this.onEject(); }

  private ownsKeyboard(): boolean {
    const visible = (item: VidVeilController) => {
      const rect = item.video.getBoundingClientRect();
      return item.video.isConnected && rect.width > 0 && rect.height > 0
        && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
    };
    if (activeController && visible(activeController)) return activeController === this;
    const available = [...controllers].filter(visible);
    return (available.find((item) => !item.video.paused) ?? available[0]) === this;
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (!this.ownsKeyboard() || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return;
    const path = event.composedPath();
    if ([document.activeElement, ...path].some((element) => element instanceof HTMLElement
      && (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(element.tagName) || element.isContentEditable
        || element.getAttribute('role') === 'slider'))) return;
    if (!['Space', 'ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'KeyF'].includes(event.code)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.activity.revision++;
    if (event.code === 'ArrowRight') {
      if (!this.rightPressed) {
        this.rightPressed = true;
        this.keyTimer = setTimeout(() => {
          this.rightBoosted = true;
          this.startBoost('keyboard');
        }, 400);
      }
    } else if (event.code === 'ArrowLeft') this.seekBy(-5);
    else if (event.code === 'ArrowUp') this.setVolume(this.video.volume + 0.1);
    else if (event.code === 'ArrowDown') this.setVolume(this.video.volume - 0.1);
    else if (!event.repeat && event.code === 'Space') void this.togglePlayback();
    else if (!event.repeat && event.code === 'KeyF') void this.toggleFullscreen();
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    if (event.code !== 'ArrowRight' || !this.rightPressed) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    clearTimeout(this.keyTimer);
    this.rightPressed = false;
    if (this.rightBoosted) this.endBoost('keyboard');
    else this.seekBy(5);
    this.rightBoosted = false;
  };

  unmountAndRestore(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.abortController.abort();
    this.cancelTemporarySpeed();
    clearTimeout(this.toastTimer);
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.nativeUiShield?.destroy();
    this.nativeUiShield = null;
    this.app?.unmount();
    this.app = null;
    this.host.remove();
    this.video.controls = this.originalControlsState;
    if (document.fullscreenElement === this.container) void document.exitFullscreen().catch(() => undefined);
    const lease = containers.get(this.container);
    if (lease && --lease.count === 0) {
      if (lease.marker === null) this.container.removeAttribute('data-vidveil-container');
      else this.container.setAttribute('data-vidveil-container', lease.marker);
      if (lease.changedPosition && this.container.style.position === 'relative'
        && this.container.style.getPropertyPriority('position') === 'important') {
        if (lease.position) this.container.style.setProperty('position', lease.position, lease.priority);
        else this.container.style.removeProperty('position');
      }
      containers.delete(this.container);
    }
    controllers.delete(this);
    if (activeController === this) activeController = null;
    if (!containers.size) { shieldStyle?.remove(); shieldStyle = null; }
  }
}
