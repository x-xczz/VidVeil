<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { browser } from 'wxt/browser';
import { createReactiveConfig } from '../../utils/storage';
import { getDomainDecision, matchesDomain } from '../../utils/rule-engine';
import type { ConfigMutationMessage, ConfigMutationResponse, RuleConfig } from '../../types/rules';

const store = createReactiveConfig();
const { config, isReady, error: storageError } = store;
const hostname = ref('');
const tabId = ref<number | null>(null);
const loadingTab = ref(true);
const busy = ref(false);
const error = ref('');
const notice = ref('');
let disposed = false;
const decision = computed(() => hostname.value ? getDomainDecision(hostname.value, config.value) : null);
const available = computed(() => isReady.value && !storageError.value && !loadingTab.value && Boolean(hostname.value) && tabId.value !== null);
const statusText = computed(() => {
  if (loadingTab.value || !isReady.value) return '正在读取网站状态';
  if (storageError.value) return '配置读取失败';
  if (!decision.value) return '此页面不支持接管';
  return decision.value.status === 'enabled' ? '已接管当前网站'
    : decision.value.status === 'user-blocked' ? '已手动禁用' : '默认大厂豁免中';
});
const ruleLists = [
  { key: 'userWhitelist', title: '强制接管', description: '优先级最高，可覆盖默认豁免。', empty: '尚未添加强制接管的网站。' },
  { key: 'userBlocklist', title: '手动禁用', description: '保留这些网站的原版播放器。', empty: '尚未手动禁用任何网站。' },
] as const;
const hasBroadWhitelist = computed(() => config.value.userWhitelist.some((pattern) => pattern.startsWith('*.') && matchesDomain(hostname.value, pattern)));

onMounted(async () => {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (disposed) return;
    if (tab?.id !== undefined && tab.url) {
      const url = new URL(tab.url);
      if (['http:', 'https:'].includes(url.protocol)) {
        hostname.value = url.hostname;
        tabId.value = tab.id;
      }
    }
  } catch { if (!disposed) error.value = '无法读取当前标签页，请重新打开弹窗。'; }
  finally { if (!disposed) loadingTab.value = false; }
});

async function notifyCurrentTab(next: RuleConfig): Promise<void> {
  if (tabId.value === null || !hostname.value) return;
  try {
    const response: { ok?: boolean } | undefined = await browser.tabs.sendMessage(tabId.value, {
      type: 'TOGGLE_SITE_STATUS',
      hostname: hostname.value,
      enabled: getDomainDecision(hostname.value, next).shouldHijack,
    });
    if (!response?.ok) throw new Error('No content script response');
  } catch {
    notice.value = '规则已保存；当前页面无法连接扩展。若是安装前已打开的页面，请刷新一次。';
  }
}

async function mutate(message: ConfigMutationMessage): Promise<void> {
  if (busy.value || !isReady.value || storageError.value) return;
  busy.value = true;
  error.value = '';
  notice.value = '';
  try {
    const response: ConfigMutationResponse = await browser.runtime.sendMessage(message);
    if (!response?.ok) throw new Error(response?.error ?? '扩展后台未响应');
    if (!disposed) await notifyCurrentTab(response.config);
  } catch (cause) {
    if (!disposed) error.value = cause instanceof Error ? cause.message : '保存失败，请重试。';
  } finally { if (!disposed) busy.value = false; }
}

function toggleSite(): void {
  if (!available.value || !decision.value) return;
  if (decision.value.shouldHijack && hasBroadWhitelist.value
    && !window.confirm('当前域名匹配通配符白名单。禁用此网站会移除匹配的白名单规则，并影响这些规则覆盖的其他子域名。继续吗？')) return;
  void mutate({ type: 'SET_SITE_ENABLED', hostname: hostname.value, enabled: !decision.value.shouldHijack });
}

onBeforeUnmount(() => { disposed = true; store.dispose(); });
</script>

<template>
  <main :aria-busy="busy || loadingTab || !isReady">
    <header class="masthead">
      <div class="wordmark"><span class="logo" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m4 5 8 15L20 5M10 6l5 3-5 3Z" /></svg></span>VidVeil<span class="edition">01</span></div>
      <p>一个界面，专注每一次播放。</p>
    </header>

    <section class="site-card" aria-labelledby="site-heading">
      <div class="eyebrow"><span>当前网站</span><span class="live-dot" :class="{ enabled: decision?.shouldHijack && available }" /></div>
      <h1 id="site-heading" :title="hostname">{{ hostname || (loadingTab ? '读取中…' : '浏览器内部页面') }}</h1>
      <div class="status" :class="decision?.status" role="status">{{ statusText }}</div>
      <div class="site-switch">
        <div><strong>统一播放器</strong><p>{{ decision?.shouldHijack ? '自动接管符合条件的视频' : '保留网站原生播放体验' }}</p></div>
        <button class="switch" type="button" role="switch" aria-label="在当前网站启用 VidVeil"
          :aria-checked="Boolean(decision?.shouldHijack && available)" :disabled="!available || busy" @click="toggleSite"><span /></button>
      </div>
      <p class="site-note">即时生效，无需刷新。视频源与播放进度保持不变。</p>
    </section>

    <p v-if="error || storageError" class="feedback error" role="alert">{{ error || storageError?.message }}</p>
    <p v-if="notice" class="feedback notice" role="status">{{ notice }}</p>

    <section class="rules-section" aria-labelledby="rules-heading">
      <div class="section-title"><h2 id="rules-heading">网站规则</h2><span>你的偏好，优先</span></div>
      <label class="builtin"><span><strong>默认大厂豁免</strong><small>YouTube、哔哩哔哩、Netflix 等</small></span>
        <input type="checkbox" :checked="config.enableBuiltinIgnore" :disabled="busy || !isReady || Boolean(storageError)"
          @change="mutate({ type: 'SET_BUILTIN_IGNORE', enabled: ($event.target as HTMLInputElement).checked })" />
      </label>
      <details v-for="list in ruleLists" :key="list.key" class="rule-list">
        <summary><span>{{ list.title }}</span><span class="count">{{ config[list.key].length }}</span><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 8 4 4 4-4" /></svg></summary>
        <div class="rule-body">
          <p class="description">{{ list.description }}</p>
          <p v-if="!config[list.key].length" class="empty">{{ list.empty }}</p>
          <ul v-else>
            <li v-for="pattern in config[list.key]" :key="pattern">
              <code :title="pattern">{{ pattern }}</code>
              <button type="button" class="remove" :disabled="busy" :aria-label="`从${list.title}移除 ${pattern}`" title="移除此规则"
                @click="mutate({ type: 'REMOVE_RULE', list: list.key, pattern })"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 6 8 8m0-8-8 8" /></svg></button>
            </li>
          </ul>
        </div>
      </details>
    </section>

    <footer><span class="footer-mark">VID / VEIL</span><span>原视频 · 零搬运 · 随时恢复</span></footer>
  </main>
</template>

<style>
:root { color-scheme:light; --ink:#25352e; --muted:#6b776c; --accent:#26654f; --line:#d9ded2; font-family:"Segoe UI Variable", "Microsoft YaHei", sans-serif; }
* { box-sizing:border-box; }
body { margin:0; width:380px; min-width:300px; color:var(--ink); background:radial-gradient(ellipse at 100% 0,#e1ead5 0,transparent 55%),linear-gradient(145deg,#f8f6ed,#edf0e6); font-size:13px; }
button, input { font:inherit; }
button { cursor:pointer; }
button:disabled, input:disabled { cursor:not-allowed; opacity:.5; }
button:focus-visible, input:focus-visible, summary:focus-visible { outline:2px solid #307b60; outline-offset:4px; }
main { padding:24px 22px 17px; }
.masthead { margin-bottom:22px; }
.wordmark { display:flex; align-items:center; gap:9px; font-family:Georgia, "Times New Roman", serif; font-size:28px; letter-spacing:-1px; }
.logo { display:grid; place-items:center; width:31px; height:34px; border-radius:9px 9px 13px 13px; background:var(--accent); color:#f3f8e8; }
svg { width:20px; height:20px; fill:none; stroke:currentColor; stroke-width:1.6; stroke-linecap:round; stroke-linejoin:round; }
.logo svg { width:23px; height:23px; }
.edition { margin-left:auto; font:11px "Courier New", monospace; border:1px solid #b7c6b3; padding:4px 6px; border-radius:5px; letter-spacing:1px; }
.masthead p { margin:9px 0 0; color:var(--muted); font-size:12px; letter-spacing:.04em; }
.site-card { position:relative; border:1px solid #ccd6c4; border-radius:15px; padding:18px; background:#ffffffa6; box-shadow:0 9px 26px #25352e06; animation:arrive .32s ease-out; }
.eyebrow { display:flex; justify-content:space-between; align-items:center; font-size:10px; letter-spacing:.15em; color:var(--muted); }
.live-dot { width:7px; height:7px; background:#a9b0a5; border-radius:50%; }
.live-dot.enabled { background:#3d8664; box-shadow:0 0 0 4px #3d866414; }
h1 { font-family:Georgia, "Microsoft YaHei", serif; margin:9px 0 12px; font-size:23px; font-weight:500; overflow-wrap:anywhere; letter-spacing:-.5px; }
.status { display:inline-flex; padding:4px 8px; border:1px solid #dce2d5; background:#f0f2eb; border-radius:5px; color:#63705d; font-size:11px; }
.status.enabled { color:#2d6a51; background:#e6f0e5; border-color:#caddc9; }
.status.user-blocked { color:#9c583c; background:#f6e9de; border-color:#ead6c8; }
.site-switch { display:flex; align-items:center; justify-content:space-between; gap:16px; margin-top:21px; padding-top:17px; border-top:1px solid var(--line); }
strong { font-size:13px; font-weight:600; }
.site-switch p { margin:4px 0 0; font-size:11px; color:var(--muted); }
.switch { flex-shrink:0; width:44px; height:25px; border:0; padding:3px; background:#bbc2b5; border-radius:20px; transition:background .18s; }
.switch span { display:block; width:19px; height:19px; border-radius:50%; background:#fffef8; box-shadow:0 1px 3px #0002; transition:transform .18s; }
.switch[aria-checked="true"] { background:var(--accent); }
.switch[aria-checked="true"] span { transform:translateX(19px); }
.site-note { margin:16px 0 0; color:#7a8575; font-size:10px; line-height:1.7; }
.rules-section { margin-top:23px; }
.section-title { display:flex; align-items:baseline; justify-content:space-between; margin-bottom:13px; }
h2 { margin:0; font-size:13px; font-weight:600; }
.section-title>span { font-size:10px; color:#7b8676; }
.builtin { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:13px 12px; border:1px solid var(--line); border-radius:9px; background:#ffffff48; margin-bottom:10px; cursor:pointer; }
.builtin strong { font-size:12px; }
.builtin small { display:block; margin-top:4px; font-size:10px; color:var(--muted); }
.builtin input { accent-color:var(--accent); width:16px; height:16px; }
.rule-list { border-bottom:1px solid var(--line); }
summary { display:flex; align-items:center; gap:8px; padding:13px 2px; cursor:pointer; list-style:none; font-size:12px; }
summary::-webkit-details-marker { display:none; }
summary .count { margin-left:auto; min-width:22px; text-align:center; padding:1px 5px; border-radius:4px; background:#e3e8db; font:10px/1.7 "Courier New", monospace; }
summary svg { width:16px; height:16px; color:#7c8a74; transition:transform .16s; }
details[open] summary svg { transform:rotate(180deg); }
.rule-body { padding:0 2px 12px; }
.description { color:var(--muted); font-size:10px; margin:0 0 8px; }
.empty { margin:0; padding:10px; color:#7a8673; font-size:11px; background:#ffffff50; border-radius:6px; }
ul { margin:0; padding:0; list-style:none; max-height:160px; overflow:auto; }
li { display:flex; gap:8px; justify-content:space-between; align-items:center; padding:5px 0; }
code { min-width:0; overflow:hidden; text-overflow:ellipsis; font:11px "Courier New", monospace; }
.remove { display:grid; place-items:center; flex-shrink:0; width:25px; height:25px; border:0; color:#7a8373; background:transparent; border-radius:5px; }
.remove:hover { background:#f0dfd4; color:#9c583c; }
.remove svg { width:15px; height:15px; }
.feedback { margin:12px 0 0; padding:10px 12px; font-size:11px; line-height:1.7; border-radius:8px; overflow-wrap:anywhere; }
.error { color:#953c2b; background:#f8e5de; border:1px solid #e8c9bc; }
.notice { color:#725b28; background:#f4edcf; border:1px solid #e3d8aa; }
footer { display:flex; gap:10px; justify-content:space-between; margin-top:21px; color:#88917f; font-size:9px; }
.footer-mark { font:9px "Courier New", monospace; letter-spacing:.1em; }
@keyframes arrive { from { opacity:0; transform:translateY(5px); } to { opacity:1; transform:translateY(0); } }
@media (max-width:350px) { body { width:320px; } main { padding:18px 15px; } }
@media (prefers-reduced-motion:reduce) { *, *::before, *::after { animation:none!important; transition:none!important; } }
</style>
