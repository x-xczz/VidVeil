import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { getDomainDecision, matchesDomain } from '../utils/rule-engine';
import { getConfig, initializeConfig, updateConfig, watchConfig } from '../utils/storage';
import type { ConfigMutationMessage, ConfigMutationResponse, RuleConfig, SiteContextResponse } from '../types/rules';

function webHostname(url?: string): string | null {
  try {
    const parsed = new URL(url ?? '');
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.hostname.toLowerCase().replace(/\.+$/, '') : null;
  } catch { return null; }
}

function isMutation(message: unknown): message is ConfigMutationMessage {
  if (!message || typeof message !== 'object') return false;
  const data = message as Record<string, unknown>;
  if (data.type === 'SET_SITE_ENABLED') return typeof data.hostname === 'string' && typeof data.enabled === 'boolean';
  if (data.type === 'SET_BUILTIN_IGNORE') return typeof data.enabled === 'boolean';
  return data.type === 'REMOVE_RULE' && ['userWhitelist', 'userBlocklist'].includes(String(data.list)) && typeof data.pattern === 'string';
}

export default defineBackground(() => {
  // Register handlers synchronously; all mutations await this shared initialization.
  const initialized = initializeConfig();
  void initialized.catch((error: unknown) => console.error('[VidVeil] Storage initialization failed', error));
  let badgeQueue: Promise<void> = Promise.resolve();

  async function renderBadge(tabId: number, url: string | undefined, config: RuleConfig): Promise<void> {
    const hostname = webHostname(url);
    const decision = hostname ? getDomainDecision(hostname, config) : null;
    const text = !decision ? '' : decision.shouldHijack ? 'ON' : decision.status === 'user-blocked' ? 'OFF' : 'PASS';
    const title = !decision ? 'VidVeil · 此页面不可用'
      : decision.shouldHijack ? 'VidVeil · 已启用，自动接管符合条件的视频'
        : decision.status === 'user-blocked' ? 'VidVeil · 已手动禁用' : 'VidVeil · 默认大厂豁免中';
    try {
      await browser.action.setBadgeText({ tabId, text });
      await browser.action.setBadgeBackgroundColor({ tabId, color: decision?.shouldHijack ? '#246b55' : '#626974' });
      await browser.action.setTitle({ tabId, title });
    } catch { /* The tab can close while a badge update is in flight. */ }
  }

  function refreshBadges(): void {
    badgeQueue = badgeQueue.catch(() => undefined).then(async () => {
      await initialized;
      const [tabs, config] = await Promise.all([browser.tabs.query({}), getConfig()]);
      await Promise.all(tabs.map((tab) => tab.id === undefined ? Promise.resolve() : renderBadge(tab.id, tab.url, config)));
    }).catch((error: unknown) => console.warn('[VidVeil] Badge update failed', error));
  }

  browser.runtime.onMessage.addListener((message: unknown, sender) => {
    if (message && typeof message === 'object' && 'type' in message && message.type === 'GET_SITE_CONTEXT') {
      return (async (): Promise<SiteContextResponse> => {
        try {
          if (sender.id !== browser.runtime.id || sender.tab?.id === undefined) throw new Error('无效的内容脚本上下文');
          const tab = await browser.tabs.get(sender.tab.id);
          const hostname = webHostname(tab.url);
          if (!hostname) throw new Error('无法确定顶层网站域名');
          return { ok: true, hostname };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : String(error) };
        }
      })();
    }
    if (!isMutation(message)) return;
    const mutation = message;
    return (async (): Promise<ConfigMutationResponse> => {
      try {
        if (sender.id !== browser.runtime.id) throw new Error('不可信的扩展消息');
        // Extension pages can also have sender.tab when opened in a browser tab.
        // Child frames may only mutate the top-level site owning their browser tab.
        const isExtensionPage = sender.url?.startsWith(browser.runtime.getURL('/')) === true;
        if (!isExtensionPage) {
          const tab = sender.tab?.id === undefined ? null : await browser.tabs.get(sender.tab.id);
          if (mutation.type !== 'SET_SITE_ENABLED' || !tab
            || webHostname(tab.url) !== mutation.hostname.toLowerCase().replace(/\.+$/, '')) {
            throw new Error('内容脚本只能修改当前网站的状态');
          }
        }
        await initialized;
        const config = await updateConfig((current) => {
          if (mutation.type === 'SET_SITE_ENABLED') {
            const host = mutation.hostname.trim().toLowerCase().replace(/\.+$/, '');
            if (!host || webHostname(`https://${host}`) !== host || /[\s/*?#@]/.test(host)) {
              throw new Error('无效的网站域名');
            }
            // Whitelist has the highest priority. Disabling a domain must also
            // remove any matching wildcard whitelist, not just its exact entry.
            current.userWhitelist = current.userWhitelist.filter((rule) => mutation.enabled ? rule !== host : !matchesDomain(host, rule));
            current.userBlocklist = current.userBlocklist.filter((rule) => rule !== host);
            (mutation.enabled ? current.userWhitelist : current.userBlocklist).push(host);
          } else if (mutation.type === 'REMOVE_RULE') {
            current[mutation.list] = current[mutation.list].filter((rule) => rule !== mutation.pattern);
          } else {
            current.enableBuiltinIgnore = mutation.enabled;
          }
          return current;
        });
        return { ok: true, config };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    })();
  });

  watchConfig(refreshBadges);
  browser.tabs.onActivated.addListener(refreshBadges);
  browser.tabs.onUpdated.addListener((_tabId, change) => {
    if (change.url || change.status === 'complete') refreshBadges();
  });
  browser.runtime.onInstalled.addListener(refreshBadges);
  browser.runtime.onStartup.addListener(refreshBadges);
  refreshBadges();
});
