import { readonly, shallowRef } from 'vue';
import { browser } from 'wxt/browser';
import type { RuleConfig } from '../types/rules';

export const CONFIG_STORAGE_KEY = 'vidveil:config';
// Compatibility only: preserve existing preferences when upgrading in place.
const LEGACY_CONFIG_STORAGE_KEY = 'uniplayer:config';

export function createDefaultConfig(): RuleConfig {
  return {
    enableBuiltinIgnore: true,
    userWhitelist: [],
    userBlocklist: [],
  };
}

function normalizePatterns(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return [...new Set(value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().toLowerCase().replace(/\.+$/, ''))
    .filter(Boolean))];
}

export function normalizeConfig(value: unknown): RuleConfig {
  const source = value !== null && typeof value === 'object'
    ? value as Partial<RuleConfig>
    : {};

  return {
    enableBuiltinIgnore: typeof source.enableBuiltinIgnore === 'boolean'
      ? source.enableBuiltinIgnore
      : true,
    userWhitelist: normalizePatterns(source.userWhitelist),
    userBlocklist: normalizePatterns(source.userBlocklist),
  };
}

export async function getConfig(): Promise<RuleConfig> {
  const stored = await browser.storage.local.get([CONFIG_STORAGE_KEY, LEGACY_CONFIG_STORAGE_KEY]);
  return normalizeConfig(stored[CONFIG_STORAGE_KEY] ?? stored[LEGACY_CONFIG_STORAGE_KEY]);
}

export async function saveConfig(config: RuleConfig): Promise<RuleConfig> {
  const normalized = normalizeConfig(config);
  await browser.storage.local.set({ [CONFIG_STORAGE_KEY]: normalized });
  return normalized;
}

// Call from the background entrypoint, not from every content script.
export async function initializeConfig(): Promise<RuleConfig> {
  const stored = await browser.storage.local.get([CONFIG_STORAGE_KEY, LEGACY_CONFIG_STORAGE_KEY]);
  if (stored[CONFIG_STORAGE_KEY] === undefined) {
    return saveConfig(normalizeConfig(stored[LEGACY_CONFIG_STORAGE_KEY]));
  }
  return normalizeConfig(stored[CONFIG_STORAGE_KEY]);
}

// Serialize read-modify-write operations in this extension context. Cross-context
// mutations should be routed through the background script for atomic ordering.
let mutationQueue: Promise<void> = Promise.resolve();

export function updateConfig(
  updater: (current: RuleConfig) => RuleConfig,
): Promise<RuleConfig> {
  const operation = mutationQueue.then(async () => saveConfig(updater(await getConfig())));
  mutationQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

export function watchConfig(callback: (config: RuleConfig) => void): () => void {
  const listener: Parameters<typeof browser.storage.onChanged.addListener>[0] = (
    changes,
    areaName,
  ) => {
    if (areaName !== 'local' || !Object.hasOwn(changes, CONFIG_STORAGE_KEY)) return;
    callback(normalizeConfig(changes[CONFIG_STORAGE_KEY]?.newValue));
  };

  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}

export function createReactiveConfig() {
  const config = shallowRef<RuleConfig>(createDefaultConfig());
  const isReady = shallowRef(false);
  const error = shallowRef<Error | null>(null);
  let revision = 0;
  let disposed = false;

  const stopWatching = watchConfig((next) => {
    if (disposed) return;
    revision += 1;
    config.value = next;
  });

  const initialRevision = revision;
  const ready = getConfig()
    .then((initial) => {
      // A storage event received during the initial read is newer than its snapshot.
      if (!disposed && revision === initialRevision) config.value = initial;
    })
    .catch((cause: unknown) => {
      if (!disposed) error.value = cause instanceof Error ? cause : new Error(String(cause));
    })
    .finally(() => {
      if (!disposed) isReady.value = true;
    });

  return {
    config: readonly(config),
    isReady: readonly(isReady),
    error: readonly(error),
    ready,
    update: updateConfig,
    dispose() {
      disposed = true;
      stopWatching();
    },
  };
}
