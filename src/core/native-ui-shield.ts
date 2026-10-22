const CAPTIONS = '.art-subtitle, .dplayer-subtitle, .vjs-text-track-display, .plyr__captions, .jw-captions';
const PROPERTIES = ['opacity', 'visibility', 'pointer-events'] as const;
let sequence = 0;

interface Snapshot {
  marker: string | null;
  inert: string | null;
  styles: Array<{ name: string; value: string; priority: string }>;
}

// Keep the media engine running. Suppress only its presentation layer, including
// updates triggered by capture listeners that ran before our extension loaded.
export class NativeUiShield {
  private readonly id = `shield-${++sequence}`;
  private readonly root: HTMLElement;
  private readonly canShield: boolean;
  private readonly hidden = new Map<HTMLElement, Snapshot>();
  private readonly branches = new Map<HTMLElement, string | null>();
  private readonly style = document.createElement('style');
  private readonly observer: MutationObserver;
  private destroyed = false;

  constructor(private readonly video: HTMLVideoElement, private readonly host: HTMLElement) {
    let root = video.parentElement!;
    let matched = false;
    const bounds = video.getBoundingClientRect();
    let parent: HTMLElement | null = root;
    for (let depth = 0; parent && depth < 3; depth++, parent = parent.parentElement) {
      if (parent === document.body || parent === document.documentElement) break;
      const rect = parent.getBoundingClientRect();
      if (bounds.width > 0 && bounds.height > 0 && parent.querySelectorAll('video').length === 1
        && Math.abs(rect.width - bounds.width) / bounds.width <= 0.15
        && Math.abs(rect.height - bounds.height) / bounds.height <= 0.15) {
        root = parent;
        matched = true;
      }
    }
    this.root = root;
    this.canShield = matched;
    this.style.textContent = `
      [data-vidveil-native-ui="${this.id}"],
      [data-vidveil-native-ui="${this.id}"] * {
        visibility: hidden !important; pointer-events: none !important;
      }
      [data-vidveil-native-ui="${this.id}"] { opacity: 0 !important; }
      [data-vidveil-video-branch="${this.id}"]::before,
      [data-vidveil-video-branch="${this.id}"]::after {
        opacity: 0 !important; visibility: hidden !important; pointer-events: none !important;
      }
    `;
    (document.head ?? document.documentElement).append(this.style);
    this.observer = new MutationObserver(() => this.refresh());
    this.refresh();
    this.observer.observe(root, { subtree: true, childList: true, attributes: true,
      attributeFilter: ['controls', 'class', 'style', 'inert', 'data-vidveil-native-ui', 'data-vidveil-video-branch'] });
  }

  refresh(): void {
    if (this.destroyed) return;
    if (this.video.controls) this.video.controls = false;
    const keep = [this.video, this.host, ...this.root.querySelectorAll<HTMLElement>(CAPTIONS)];
    const hidden = new Set<HTMLElement>();
    const branches = new Set<HTMLElement>();
    const walk = (node: HTMLElement) => {
      if (keep.includes(node)) return;
      if (keep.some((item) => node.contains(item))) {
        branches.add(node);
        for (const child of node.children) if (child instanceof HTMLElement) walk(child);
      } else if (!node.matches('script, style, link, template, source, track, vidveil-host, vidveil-launcher')
        && !node.querySelector('video, audio, vidveil-host')) {
        hidden.add(node);
      }
    };
    // A shared page container is not a player: do not hide unrelated page content.
    if (this.canShield && this.root !== document.body && this.root !== document.documentElement
      && this.root.querySelectorAll('video').length === 1) walk(this.root);

    for (const [node, snapshot] of this.hidden) {
      if (!hidden.has(node)) { this.restoreNode(node, snapshot); this.hidden.delete(node); }
    }
    for (const [node, original] of this.branches) {
      if (!branches.has(node)) {
        this.restoreAttribute(node, 'data-vidveil-video-branch', original);
        this.branches.delete(node);
      }
    }
    for (const node of branches) {
      if (!this.branches.has(node)) this.branches.set(node, node.getAttribute('data-vidveil-video-branch'));
      if (node.getAttribute('data-vidveil-video-branch') !== this.id) node.setAttribute('data-vidveil-video-branch', this.id);
    }
    for (const node of hidden) {
      if (!this.hidden.has(node)) this.hidden.set(node, {
        marker: node.getAttribute('data-vidveil-native-ui'), inert: node.getAttribute('inert'),
        styles: PROPERTIES.map((name) => ({ name, value: node.style.getPropertyValue(name), priority: node.style.getPropertyPriority(name) })),
      });
      if (node.getAttribute('data-vidveil-native-ui') !== this.id) node.setAttribute('data-vidveil-native-ui', this.id);
      if (!node.inert) node.inert = true;
      for (const [name, value] of [['opacity', '0'], ['visibility', 'hidden'], ['pointer-events', 'none']] as const) {
        if (node.style.getPropertyValue(name) !== value || node.style.getPropertyPriority(name) !== 'important') {
          node.style.setProperty(name, value, 'important');
        }
      }
    }
  }

  private restoreAttribute(node: HTMLElement, name: string, original: string | null): void {
    if (original === null) node.removeAttribute(name);
    else node.setAttribute(name, original);
  }

  private restoreNode(node: HTMLElement, snapshot: Snapshot): void {
    this.restoreAttribute(node, 'data-vidveil-native-ui', snapshot.marker);
    this.restoreAttribute(node, 'inert', snapshot.inert);
    for (const { name, value, priority } of snapshot.styles) {
      if (value) node.style.setProperty(name, value, priority);
      else node.style.removeProperty(name);
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.observer.disconnect();
    for (const [node, snapshot] of this.hidden) this.restoreNode(node, snapshot);
    for (const [node, original] of this.branches) this.restoreAttribute(node, 'data-vidveil-video-branch', original);
    this.hidden.clear();
    this.branches.clear();
    this.style.remove();
  }
}
