// This entry point never changes native controls, media state or keyboard events.
export class PlayerLauncher {
  private readonly host = document.createElement('vidveil-launcher');
  private readonly timer: ReturnType<typeof setInterval>;
  private readonly lifetime = new AbortController();
  private destroyed = false;

  constructor(private readonly video: HTMLVideoElement, onEnable: () => Promise<void>) {
    this.host.style.cssText = 'all:initial!important;position:fixed!important;display:block!important;z-index:2147483647!important;width:max-content!important;height:auto!important;pointer-events:auto!important;';
    const root = this.host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      :host { color-scheme:dark; }
      button { font:12px/1.4 "Segoe UI", "Microsoft YaHei", sans-serif; color:white;
        border:1px solid #ffffff50; border-radius:6px; padding:6px 9px;
        background:#13251b99; text-shadow:0 1px 3px black; cursor:pointer; }
      button:hover, button:focus-visible { background:#215c45; outline:2px solid #9cf1d4; }
      button:disabled { opacity:.6; cursor:wait; }
      p { max-width:220px; margin:5px 0 0; padding:6px; border-radius:4px;
        background:#341b17ed; color:#fff; font:11px/1.5 "Microsoft YaHei",sans-serif; }
      p:empty { display:none; }
    `;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = '启用 VidVeil';
    button.title = '重新启用当前网站的统一播放器';
    const error = document.createElement('p');
    error.setAttribute('role', 'status');
    root.append(style, button, error);
    button.addEventListener('click', async (event) => {
      event.stopPropagation();
      button.disabled = true;
      error.textContent = '';
      try { await onEnable(); }
      catch (cause) {
        if (!this.destroyed) error.textContent = cause instanceof Error ? cause.message : '启用失败，请在扩展弹窗中重试';
      } finally { if (!this.destroyed) button.disabled = false; }
    }, { signal: this.lifetime.signal });
    this.host.addEventListener('pointerdown', (event) => event.stopPropagation(), { signal: this.lifetime.signal });
    (document.body ?? document.documentElement).append(this.host);
    this.timer = setInterval(() => this.sync(), 400);
    window.addEventListener('scroll', () => this.sync(), { capture: true, passive: true, signal: this.lifetime.signal });
    window.addEventListener('resize', () => this.sync(), { signal: this.lifetime.signal });
    this.sync();
  }

  private sync(): void {
    if (!this.video.isConnected) { this.destroy(); return; }
    const rect = this.video.getBoundingClientRect();
    const visible = rect.width >= 280 && rect.height >= 160 && rect.bottom > 0
      && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
    this.host.style.setProperty('display', visible ? 'block' : 'none', 'important');
    this.host.style.setProperty('top', `${Math.max(6, rect.top + 6)}px`, 'important');
    this.host.style.setProperty('right', `${Math.max(6, innerWidth - rect.right + 6)}px`, 'important');
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    clearInterval(this.timer);
    this.lifetime.abort();
    this.host.remove();
  }
}
