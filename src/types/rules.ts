export interface RuleConfig {
  enableBuiltinIgnore: boolean;
  userWhitelist: string[];
  userBlocklist: string[];
}

export type SiteStatus = 'enabled' | 'builtin-ignored' | 'user-blocked';

export interface DomainDecision {
  shouldHijack: boolean;
  status: SiteStatus;
  source: 'user-whitelist' | 'user-blocklist' | 'builtin-ignore' | 'default';
}

export interface BufferedRange {
  start: number;
  end: number;
}

export interface PlayerState {
  paused: boolean;
  ended: boolean;
  waiting: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  playbackRate: number;
  buffered: BufferedRange[];
  isFullscreen: boolean;
  isPictureInPicture: boolean;
}

export interface ToggleSiteStatusMessage {
  type: 'TOGGLE_SITE_STATUS';
  hostname: string;
  enabled: boolean;
}

export type ConfigMutationMessage =
  | { type: 'SET_SITE_ENABLED'; hostname: string; enabled: boolean }
  | { type: 'REMOVE_RULE'; list: 'userWhitelist' | 'userBlocklist'; pattern: string }
  | { type: 'SET_BUILTIN_IGNORE'; enabled: boolean };

export type ConfigMutationResponse =
  | { ok: true; config: RuleConfig }
  | { ok: false; error: string };

export type SiteContextResponse =
  | { ok: true; hostname: string }
  | { ok: false; error: string };
