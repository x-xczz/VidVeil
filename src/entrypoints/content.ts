import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { VidVeilController } from '../core/player-controller';
import { PlayerLauncher } from '../core/player-launcher';
import { isEligibleVideo, shouldHijackDomain } from '../utils/rule-engine';
import { getConfig, watchConfig } from '../utils/storage';
import type { ConfigMutationResponse, RuleConfig, SiteContextResponse, ToggleSiteStatusMessage } from '../types/rules';

export default defineContentScript({
  matches: ['<all_urls>'],
  allFrames: true,
  matchAboutBlank: true,
  matchOriginAsFallback: true,
  runAt: 'document_idle',
  main(ctx) {
    const controllers = new Map<HTMLVideoElement, VidVeilController>();
    const launchers = new Map<HTMLVideoElement, PlayerLauncher>();
    let observer: MutationObserver | null = null;
    let events: AbortController | null = null;
    let interval: ReturnType<typeof setInterval> | undefined;
    let scanTimer: ReturnType<typeof setTimeout> | undefined;
    let enabled = false;
    let disposed = false;
    let sessionEjected = false;
    let revision = 0;
    let operation = 0;
    let siteHostname: string | null = window.top === window ? location.hostname : null;
    let latestConfig: RuleConfig | null = null;

    function stop(): void {
      enabled = false;
      observer?.disconnect();
      observer = null;
      events?.abort();
      events = null;
      clearInterval(interval);
      clearTimeout(scanTimer);
      scanTimer = undefined;
      for (const [video, controller] of controllers) {
        controller.unmountAndRestore();
        if (!disposed && video.isConnected && isEligibleVideo(video) && !launchers.has(video)) {
          launchers.set(video, new PlayerLauncher(video, enableFromPage));
        }
      }
      controllers.clear();
    }

    function clearLaunchers(): void {
      for (const launcher of launchers.values()) launcher.destroy();
      launchers.clear();
    }

    async function enableFromPage(): Promise<void> {
      const currentOperation = ++operation;
      const response: ConfigMutationResponse = await browser.runtime.sendMessage({
        type: 'SET_SITE_ENABLED', hostname: siteHostname, enabled: true,
      });
      if (!response?.ok) throw new Error(response?.error ?? '扩展后台未响应');
      if (disposed || currentOperation !== operation) return;
      sessionEjected = false;
      applyConfig(response.config);
      if (!enabled) throw new Error('嵌入播放器域名仍被豁免，请在扩展弹窗中检查网站规则');
    }

    function scan(): void {
      if (!enabled || disposed) return;
      for (const [video, controller] of controllers) {
        if (!video.isConnected || !controller.container.contains(video) || !controller.host.isConnected
          || video.duration === Infinity || (video.duration > 0 && video.duration < 15)) {
          controller.unmountAndRestore();
          controllers.delete(video);
        } else {
          controller.refreshBounds();
        }
      }
      for (const video of document.querySelectorAll('video')) {
        if (controllers.has(video) || !isEligibleVideo(video)) continue;
        try {
          controllers.set(video, new VidVeilController(video, eject));
        } catch (error) { console.warn('[VidVeil] Could not mount video controls', error); }
      }
    }

    function scheduleScan(): void {
      if (!enabled || scanTimer !== undefined) return;
      scanTimer = setTimeout(() => { scanTimer = undefined; scan(); }, 80);
    }

    function start(): void {
      if (enabled || disposed) return;
      enabled = true;
      clearLaunchers();
      events = new AbortController();
      observer = new MutationObserver(scheduleScan);
      observer.observe(document.documentElement, {
        subtree: true, childList: true, attributes: true, attributeFilter: ['src', 'loop', 'muted'],
      });
      document.addEventListener('loadedmetadata', scheduleScan, { capture: true, signal: events.signal });
      document.addEventListener('durationchange', scheduleScan, { capture: true, signal: events.signal });
      // Also discover videos whose size/visibility changes without DOM insertion.
      interval = setInterval(scan, 1500);
      scan();
    }

    function applyConfig(config: RuleConfig): void {
      latestConfig = config;
      if (disposed) return;
      if (siteHostname === null) return;
      // The popup governs the address-bar site; embedded major platforms still
      // retain their own exemptions, rather than being hijacked on every embed.
      const frameAllowed = !location.hostname || location.hostname === siteHostname
        || shouldHijackDomain(location.hostname, config);
      if (!sessionEjected && shouldHijackDomain(siteHostname, config) && frameAllowed) start();
      else stop();
    }

    function eject(): void {
      sessionEjected = true;
      const currentOperation = ++operation;
      stop();
      void (async () => {
        try {
          const response: ConfigMutationResponse = await browser.runtime.sendMessage({
            type: 'SET_SITE_ENABLED', hostname: siteHostname, enabled: false,
          });
          if (!response?.ok) throw new Error(response?.error ?? '扩展后台未响应');
          if (disposed || currentOperation !== operation) return;
          sessionEjected = false;
          applyConfig(response.config);
        } catch (error) {
          console.error('[VidVeil] Site preference could not be saved', error);
          if (!disposed && currentOperation === operation) {
            window.alert('已恢复本页原版播放器，但网站禁用规则保存失败。请在扩展弹窗中重试。');
          }
        }
      })();
    }

    const stopWatching = watchConfig((config) => { revision++; applyConfig(config); });
    if (siteHostname === null) {
      void (async () => {
        const response: SiteContextResponse = await browser.runtime.sendMessage({ type: 'GET_SITE_CONTEXT' });
        if (!response?.ok) throw new Error(response?.error ?? '无法读取顶层网站');
        if (disposed) return;
        siteHostname = response.hostname;
        if (latestConfig) applyConfig(latestConfig);
      })().catch((error: unknown) => console.error('[VidVeil] Cannot resolve frame site', error));
    }
    const initialRevision = revision;
    void getConfig().then((config) => {
      if (revision === initialRevision) applyConfig(config);
    }).catch((error: unknown) => console.error('[VidVeil] Cannot read configuration', error));

    const onMessage: Parameters<typeof browser.runtime.onMessage.addListener>[0] = (message: unknown) => {
      if (!message || typeof message !== 'object') return;
      const data = message as Partial<ToggleSiteStatusMessage>;
      if (data.type !== 'TOGGLE_SITE_STATUS' || data.hostname !== siteHostname || typeof data.enabled !== 'boolean') return;
      ++operation;
      ++revision;
      sessionEjected = false;
      if (!data.enabled) { stop(); return Promise.resolve({ ok: true }); }
      const currentRevision = revision;
      return getConfig().then((config) => {
        if (revision === currentRevision) applyConfig(config);
        scan();
        return { ok: true };
      }).catch(() => ({ ok: false }));
    };
    browser.runtime.onMessage.addListener(onMessage);

    ctx.onInvalidated(() => {
      disposed = true;
      ++operation;
      stop();
      clearLaunchers();
      stopWatching();
      browser.runtime.onMessage.removeListener(onMessage);
    });
  },
});
