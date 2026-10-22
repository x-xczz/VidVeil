<script lang="ts">
// Export CSS as text so the controller injects it only into its Shadow Root.
export const playerOverlayStyles = `
:host { color-scheme: dark; font-family: "Segoe UI Variable", "Microsoft YaHei", sans-serif; }
.vidveil-mount { width:100%; height:100%; }
*, *::before, *::after { box-sizing:border-box; }
button, input, select { font:inherit; }
button { cursor:pointer; }
button:focus-visible, select:focus-visible, input:focus-visible, .gesture:focus-visible {
  outline:2px solid #9cf1d4; outline-offset:3px;
}
.player { --accent:#9cf1d4; position:relative; width:100%; height:100%; overflow:hidden;
  color:#f6f8fb; font-size:13px; line-height:1.4; isolation:isolate; user-select:none; container-type:inline-size; }
.player.is-idle { cursor:none; }
.gesture { position:absolute; inset:0; z-index:0; touch-action:none; outline:none; }
.topbar, .bottom { position:absolute; z-index:2; left:0; right:0; transition:opacity .22s ease, transform .22s ease; }
.topbar { top:0; display:flex; align-items:center; justify-content:space-between; gap:10px;
  padding:6px 8px; background:transparent; pointer-events:none; }
.brand { font-size:10px; letter-spacing:.22em; font-weight:700; text-shadow:0 1px 5px #000; }
.eject { display:flex; align-items:center; gap:6px; padding:7px 10px; border:1px solid #ffffff29;
  border-radius:8px; color:#f5f6fa; background:transparent; font-size:11px; pointer-events:auto; margin-left:auto; text-shadow:0 1px 3px #000; }
.eject:hover { background:#65352ee6; border-color:#efb1a2; }
.bottom { bottom:0; padding:0 8px 6px; background:transparent; }
.panel { padding:0; border:0; background:transparent; text-shadow:0 1px 3px #000,0 0 5px #0009; }
.hidden { opacity:0; pointer-events:none; }
.topbar.hidden { transform:translateY(-7px); }
.bottom.hidden { transform:translateY(7px); }
.progress { position:relative; height:18px; margin:0 3px 2px; }
.track { position:absolute; left:0; right:0; top:8px; height:4px; border-radius:4px; background:#ffffff50; box-shadow:0 1px 3px #0008; overflow:hidden; }
.buffer, .elapsed { position:absolute; top:0; bottom:0; }
.buffer { background:#ffffff40; }
.elapsed { left:0; background:var(--accent); }
.progress input { appearance:none; position:absolute; inset:0; width:100%; height:20px; margin:0; background:transparent; cursor:pointer; }
.progress input::-webkit-slider-runnable-track { height:4px; background:transparent; }
.progress input::-moz-range-track { height:4px; background:transparent; }
.progress input::-webkit-slider-thumb { appearance:none; width:12px; height:12px; margin-top:-4px;
  border-radius:50%; background:var(--accent); box-shadow:0 0 0 3px #9cf1d422; }
.progress input::-moz-range-thumb { width:12px; height:12px; border:0; border-radius:50%; background:var(--accent); }
.preview { position:absolute; bottom:30px; transform:translateX(-50%); width:174px; padding:6px;
  border:1px solid #ffffff38; border-radius:9px; background:#0d1421ed; box-shadow:0 6px 24px #0006;
  text-align:center; pointer-events:none; font-variant-numeric:tabular-nums; }
.preview img { width:160px; height:90px; display:block; margin-bottom:5px; border-radius:4px; object-fit:cover; }
.preview time { font-size:12px; }
.row { display:flex; align-items:center; gap:8px; min-height:28px; }
.icon { display:grid; place-items:center; flex-shrink:0; width:30px; height:30px; padding:5px;
  border:0; border-radius:7px; color:inherit; background:transparent; }
.icon:hover { background:#ffffff20; color:var(--accent); }
.icon[aria-pressed="true"] { color:var(--accent); background:#9cf1d417; }
.icon svg { filter:drop-shadow(0 1px 2px #000) drop-shadow(0 0 1px #000); }
svg { width:20px; height:20px; fill:none; stroke:currentColor; stroke-width:1.7; stroke-linecap:round; stroke-linejoin:round; }
.time { white-space:nowrap; font-size:12px; font-variant-numeric:tabular-nums; color:#c6ceda; }
.time strong { color:#f6f8fb; font-weight:500; }
.spacer { flex:1; }
.speed { color:#f6f8fb; border:1px solid #ffffff1c; border-radius:6px; background:#151d29; padding:4px; font-size:12px; max-width:76px; }
.speed-wrap { position:relative; }
.speed-menu { position:absolute; bottom:36px; right:0; display:grid; gap:2px; padding:5px; border-radius:6px; background:#14201ded; min-width:80px; }
.speed-menu button { color:white; border:0; background:transparent; padding:5px; border-radius:3px; }
.speed-menu button:hover, .speed-menu button[aria-checked="true"] { background:#9cf1d433; }
.volume { display:flex; align-items:center; gap:2px; }
.volume input { width:65px; height:4px; margin:0 4px; accent-color:var(--accent); cursor:pointer; }
.toast { position:absolute; z-index:4; left:10px; top:10px; max-width:65%;
  padding:4px 6px; border:0; background:transparent; text-shadow:0 1px 4px #000,0 0 6px #000;
  text-align:left; font-size:13px; pointer-events:none; }
.loading-state { position:absolute; left:12px; top:12px; pointer-events:none; }
.preview-status { display:block; font-size:11px; color:#d4dddf; padding:8px 3px; }
.spinner { display:block; width:25px; height:25px; border:2px solid #ffffff33; border-top-color:var(--accent);
  border-radius:50%; animation:spin .8s linear infinite; }
.toast-enter-active, .toast-leave-active { transition:opacity .15s ease; }
.toast-enter-from, .toast-leave-to { opacity:0; }
@keyframes spin { to { transform:rotate(360deg); } }
@container (max-width:440px) {
  .topbar { padding:6px; } .brand { display:none; } .eject { margin-left:auto; font-size:11px; }
  .bottom { padding:0 6px 5px; } .panel { padding:0; }
  .row { gap:3px; } .volume input { display:none; } .time { font-size:10px; }
  .icon { width:26px; height:28px; } .speed { font-size:11px; max-width:62px; }
}
@container (max-width:320px) { .row { gap:1px; } .time { font-size:9px; } .speed { max-width:53px; padding:3px 0; } }
@media (prefers-reduced-motion:reduce) { *, *::before, *::after { transition:none!important; animation-duration:2s!important; } }
`;
</script>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { formatTime, type VidVeilController } from '../core/player-controller';
import { FrameExtractor } from '../utils/frame-extractor';

const props = defineProps<{ controller: VidVeilController }>();
const controller = props.controller;
const state = controller.state;
const extractor = new FrameExtractor(controller.video);
const visible = ref(true);
const focused = ref(false);
const menuOpen = ref(false);
let keyboardMode = false;
const interacting = ref(false);
const progress = ref<HTMLElement | null>(null);
const preview = ref<{ time: number; left: number; image: string | null; status: string; bucket: number } | null>(null);
let previewTimer: ReturnType<typeof setTimeout> | undefined;
let requestedBucket: number | null = null;
let requestedSource = '';
let requestedAt = 0;
const showControls = computed(() => visible.value || focused.value || interacting.value || menuOpen.value
  || preview.value?.status === '正在加载预览…');
const percent = computed(() => state.duration > 0 ? Math.min(100, state.currentTime / state.duration * 100) : 0);
const speeds = [0.5, 1, 1.25, 1.5, 2];
let hideTimer: ReturnType<typeof setTimeout> | undefined;
let holdTimer: ReturnType<typeof setTimeout> | undefined;
let clickTimer: ReturnType<typeof setTimeout> | undefined;
let previewRevision = 0;
let pointer: { id: number; x: number; y: number; time: number; dragging: boolean; held: boolean; moved: boolean } | null = null;
let suppressClick = false;
const lifetime = new AbortController();

function wake(): void {
  visible.value = true;
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => { visible.value = false; if (!showControls.value) hidePreview(); }, 2500);
}

function pointerDown(event: PointerEvent): void {
  if (event.button !== 0 || !event.isPrimary || pointer) return;
  controller.activate();
  menuOpen.value = false;
  wake();
  clearTimeout(clickTimer);
  suppressClick = false;
  interacting.value = true;
  pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, time: controller.video.currentTime,
    dragging: false, held: false, moved: false };
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  holdTimer = setTimeout(() => {
    if (pointer && !pointer.moved) {
      pointer.held = true;
      controller.startBoost('pointer');
    }
  }, 400);
}

function pointerMove(event: PointerEvent): void {
  wake();
  if (!pointer || event.pointerId !== pointer.id) return;
  const dx = event.clientX - pointer.x;
  const dy = event.clientY - pointer.y;
  if (Math.hypot(dx, dy) > 15) {
    pointer.moved = true;
    clearTimeout(holdTimer);
  }
  if (Math.abs(dx) > 15 && !pointer.held) pointer.dragging = true;
  if (pointer.dragging) {
    controller.seekTo(pointer.time + dx / 5);
    controller.notify(`⏩ ${formatTime(controller.video.currentTime)}`);
  }
}

function finishPointer(event?: PointerEvent): void {
  if (event && pointer && event.pointerId !== pointer.id) return;
  if (!pointer) return;
  suppressClick = pointer.moved || pointer.held || event?.type !== 'pointerup';
  clearTimeout(holdTimer);
  controller.endBoost('pointer');
  pointer = null;
  interacting.value = false;
  wake();
}

function singleClick(event: MouseEvent): void {
  if (suppressClick) { suppressClick = false; return; }
  if (event.detail > 1) return;
  clearTimeout(clickTimer);
  clickTimer = setTimeout(() => { void controller.togglePlayback(); }, 280);
}

function doubleClick(): void {
  clearTimeout(clickTimer);
  if (!suppressClick) void controller.toggleFullscreen();
  suppressClick = false;
}

function wheel(event: WheelEvent): void {
  wake();
  const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 200 : 1);
  controller.setVolume(controller.video.volume - Math.max(-0.1, Math.min(0.1, delta / 1500)));
}

function updatePreview(event: PointerEvent): void {
  if (!progress.value || state.duration <= 0) return;
  const rect = progress.value.getBoundingClientRect();
  if (!rect.width) return;
  const position = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
  const time = position / rect.width * state.duration;
  const bucket = Math.floor(time / 2) * 2;
  const source = controller.video.currentSrc || controller.video.src;
  const left = Math.max(Math.min(87, rect.width / 2), Math.min(rect.width - Math.min(87, rect.width / 2), position));
  if (preview.value?.bucket === bucket && requestedSource === source) {
    preview.value.time = time;
    preview.value.left = left;
    if (requestedBucket === bucket && (preview.value.image || performance.now() - requestedAt < 1500)) return;
  } else {
    preview.value = { time, left, image: null, status: '正在加载预览…', bucket };
  }
  requestedSource = source;
  const revision = ++previewRevision;
  clearTimeout(previewTimer);
  requestedBucket = bucket;
  requestedAt = performance.now();
  previewTimer = setTimeout(async () => {
    const result = await extractor.getPreview(time);
    if (revision !== previewRevision || !preview.value) return;
    if (result.status === 'ready') {
      preview.value.image = result.image;
      preview.value.status = '';
    } else {
      preview.value.status = result.status === 'superseded' ? '移动鼠标重试' : result.message;
    }
    wake();
  }, 150);
}

function hidePreview(): void {
  clearTimeout(previewTimer);
  previewRevision++;
  requestedBucket = null;
  preview.value = null;
}

function pointerActivity(): void {
  keyboardMode = false;
  focused.value = false;
  wake();
}

function leavePlayer(): void {
  if (interacting.value || menuOpen.value || focused.value) return;
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => { visible.value = false; hidePreview(); }, 500);
}

function releaseControls(): void { interacting.value = false; wake(); }

function inputNumber(event: Event): number { return Number((event.target as HTMLInputElement).value); }
function focusOut(event: FocusEvent): void {
  focused.value = keyboardMode && event.relatedTarget instanceof HTMLElement
    && (event.currentTarget as HTMLElement).contains(event.relatedTarget)
    && Boolean(event.relatedTarget.closest('.panel, .topbar'));
  if (showControls.value) wake();
}

function focusIn(event: FocusEvent): void {
  focused.value = keyboardMode && event.target instanceof HTMLElement && Boolean(event.target.closest('.panel, .topbar'));
  wake();
}

watch(() => controller.activity.revision, wake);

onMounted(() => {
  wake();
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Tab') keyboardMode = true;
  }, { capture: true, signal: lifetime.signal });
  window.addEventListener('pointerdown', (event) => {
    if (!event.composedPath().some((item) => item instanceof HTMLElement && item.classList.contains('speed-wrap'))) {
      menuOpen.value = false;
    }
  }, { capture: true, signal: lifetime.signal });
  window.addEventListener('pointerup', () => { if (interacting.value) releaseControls(); }, { signal: lifetime.signal });
  window.addEventListener('pointercancel', () => { if (interacting.value) releaseControls(); }, { signal: lifetime.signal });
  window.addEventListener('blur', () => { finishPointer(); clearTimeout(clickTimer); focused.value = false; menuOpen.value = false; interacting.value = false; wake(); }, { signal: lifetime.signal });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { finishPointer(); clearTimeout(clickTimer); }
  }, { signal: lifetime.signal });
});

onBeforeUnmount(() => {
  lifetime.abort();
  clearTimeout(hideTimer);
  clearTimeout(holdTimer);
  clearTimeout(clickTimer);
  controller.endBoost('pointer');
  hidePreview();
  extractor.destroy();
});
</script>

<template>
  <div class="player" :class="{ 'is-idle': !showControls }" @pointermove.stop="pointerActivity" @pointerleave="leavePlayer"
    @focusin="focusIn" @focusout="focusOut" @click.stop @dblclick.stop
    @pointerdown.stop="pointerActivity" @pointerup.stop @wheel.stop @contextmenu.stop>
    <div class="gesture" tabindex="0" role="group" aria-label="视频手势区域：单击播放，双击全屏，长按三倍速"
      @pointerdown="pointerDown" @pointermove="pointerMove" @pointerup="finishPointer"
      @pointercancel="finishPointer" @lostpointercapture="finishPointer"
      @click="singleClick" @dblclick="doubleClick" @wheel.prevent="wheel" />

    <div v-if="state.waiting && !state.paused && showControls" class="loading-state" aria-hidden="true">
      <span class="spinner" />
    </div>

    <header class="topbar" :class="{ hidden: !showControls }" :inert="!showControls">
      <button class="eject" type="button" title="恢复原生控件并禁用当前网站" @click="controller.eject()">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" /></svg>
        恢复原版播放器
      </button>
    </header>

    <Transition name="toast">
      <div v-if="controller.toast.message && showControls" class="toast" role="status" aria-live="polite">{{ controller.toast.message }}</div>
    </Transition>

    <footer class="bottom" :class="{ hidden: !showControls }" :inert="!showControls">
      <div class="panel" @pointerdown="interacting = true" @pointerup="releaseControls" @pointercancel="releaseControls">
        <div ref="progress" class="progress" @pointermove="updatePreview" @pointerleave="hidePreview">
          <div class="track" aria-hidden="true">
            <span v-for="(range, index) in state.buffered" :key="index" class="buffer"
              :style="{ left: `${state.duration ? range.start / state.duration * 100 : 0}%`, width: `${state.duration ? (range.end - range.start) / state.duration * 100 : 0}%` }" />
            <span class="elapsed" :style="{ width: `${percent}%` }" />
          </div>
          <input type="range" min="0" :max="state.duration || 1" step="0.1" :value="state.currentTime"
            :disabled="state.duration <= 0" aria-label="播放进度" :aria-valuetext="`${formatTime(state.currentTime)} / ${formatTime(state.duration)}`"
            @input="controller.seekTo(inputNumber($event))" @pointerdown="interacting = true"
            @pointerup="interacting = false; wake()" @pointercancel="interacting = false"
            @lostpointercapture="interacting = false" />
          <div v-if="preview" class="preview" :style="{ left: `${preview.left}px` }">
            <img v-if="preview.image" :src="preview.image" alt="视频帧预览" width="160" height="90" />
            <span v-else class="preview-status" role="status">{{ preview.status }}</span>
            <time>{{ formatTime(preview.time) }}</time>
          </div>
        </div>

        <div class="row">
          <button class="icon" type="button" :aria-label="state.paused ? '播放' : '暂停'" :title="state.paused ? '播放 (Space)' : '暂停 (Space)'" @click="controller.togglePlayback()">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path v-if="state.paused" d="m8 4 12 8-12 8Z" fill="currentColor" stroke="none" /><path v-else d="M8 5v14M16 5v14" stroke-width="4" /></svg>
          </button>
          <span class="time"><strong>{{ formatTime(state.currentTime) }}</strong> / {{ formatTime(state.duration) }}</span>
          <span class="spacer" />
          <div class="speed-wrap" @keydown.esc.stop="menuOpen = false; wake()"
            @focusout="menuOpen = Boolean($event.relatedTarget && ($event.currentTarget as HTMLElement).contains($event.relatedTarget as Node)) && menuOpen">
            <button class="speed" type="button" aria-label="播放速度" :aria-expanded="menuOpen" aria-controls="speed-options"
              @click="menuOpen = !menuOpen; wake()">{{ state.playbackRate }}x</button>
            <div v-if="menuOpen" id="speed-options" class="speed-menu" role="group" aria-label="选择播放速度">
              <button v-for="rate in speeds" :key="rate" type="button" role="radio" :aria-checked="state.playbackRate === rate"
                @click="controller.setRate(rate); menuOpen = false; wake()">{{ Number.isInteger(rate) ? rate.toFixed(1) : rate }}x</button>
            </div>
          </div>
          <div class="volume">
            <button class="icon" type="button" :aria-label="state.muted ? '取消静音' : '静音'" :title="state.muted ? '取消静音' : '静音'" :aria-pressed="state.muted" @click="controller.toggleMute()">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 4 6 8H3v8h3l5 4Z" /><path v-if="state.muted || state.volume === 0" d="m16 9 5 6m0-6-5 6" /><path v-else d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" /></svg>
            </button>
            <input type="range" min="0" max="1" step="0.01" :value="state.muted ? 0 : state.volume" aria-label="音量" @input="controller.setVolume(inputNumber($event))" />
          </div>
          <button class="icon" type="button" aria-label="画中画" title="画中画" :aria-pressed="state.isPictureInPicture" @click="controller.togglePictureInPicture()">
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M12 11h7v6h-7Z" fill="currentColor" stroke="none" /></svg>
          </button>
          <button class="icon" type="button" :aria-label="state.isFullscreen ? '退出全屏' : '全屏'" title="全屏 (F)" :aria-pressed="state.isFullscreen" @click="controller.toggleFullscreen()">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path v-if="state.isFullscreen" d="M3 8h5V3m8 0v5h5M3 16h5v5m8 0v-5h5" /><path v-else d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" /></svg>
          </button>
        </div>
      </div>
    </footer>
  </div>
</template>
