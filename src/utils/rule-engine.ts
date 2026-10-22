import defaultIgnore from '../presets/default-ignore.json';
import type { DomainDecision } from '../types/rules';

type DomainConfig = {
  readonly enableBuiltinIgnore: boolean;
  readonly userWhitelist: readonly string[];
  readonly userBlocklist: readonly string[];
};

export function matchesDomain(hostname: string, pattern: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.+$/, '');
  const rule = pattern.trim().toLowerCase().replace(/\.+$/, '');
  if (!host || !rule) return false;

  if (rule.startsWith('*.')) {
    const base = rule.slice(2);
    return Boolean(base) && !base.includes('*')
      && (host === base || host.endsWith(`.${base}`));
  }

  return !rule.includes('*') && host === rule;
}

export function getDomainDecision(hostname: string, config: DomainConfig): DomainDecision {
  const matches = (patterns: readonly string[]) => patterns.some((rule) => matchesDomain(hostname, rule));

  if (matches(config.userWhitelist)) {
    return { shouldHijack: true, status: 'enabled', source: 'user-whitelist' };
  }
  if (matches(config.userBlocklist)) {
    return { shouldHijack: false, status: 'user-blocked', source: 'user-blocklist' };
  }
  if (config.enableBuiltinIgnore && matches(defaultIgnore)) {
    return { shouldHijack: false, status: 'builtin-ignored', source: 'builtin-ignore' };
  }
  return { shouldHijack: true, status: 'enabled', source: 'default' };
}

export function shouldHijackDomain(hostname: string, config: DomainConfig): boolean {
  return getDomainDecision(hostname, config).shouldHijack;
}

export function isEligibleVideo(video: HTMLVideoElement): boolean {
  const { width, height } = video.getBoundingClientRect();
  if (width < 280 || height < 160) return false;
  if (video.loop && video.muted && !video.controls) return false;
  if (video.duration === Infinity || (video.duration > 0 && video.duration < 15)) return false;
  return true;
}
