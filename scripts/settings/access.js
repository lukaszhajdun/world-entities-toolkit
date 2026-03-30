import {
  DEFAULT_SETTINGS,
  MODULE_ID,
  SETTINGS_KEYS
} from "../core/constants.js";

export function hasSetting(key) {
  return game?.settings?.settings?.has(`${MODULE_ID}.${key}`) ?? false;
}

export function getSetting(key, fallback = null) {
  if (!hasSetting(key)) return fallback;

  try {
    return game.settings.get(MODULE_ID, key);
  } catch (error) {
    console.warn(`[${MODULE_ID}] Failed to read setting "${key}".`, error);
    return fallback;
  }
}

export async function setSetting(key, value) {
  if (!hasSetting(key)) {
    throw new Error(`[${MODULE_ID}] Unknown setting "${key}".`);
  }

  return game.settings.set(MODULE_ID, key, value);
}

export function getDefaultLinkActorData() {
  return getSetting(
    SETTINGS_KEYS.DEFAULT_LINK_ACTOR_DATA,
    DEFAULT_SETTINGS[SETTINGS_KEYS.DEFAULT_LINK_ACTOR_DATA]
  ) === true;
}

export function getDefaultLockArtworkRotation() {
  return getSetting(
    SETTINGS_KEYS.DEFAULT_LOCK_ARTWORK_ROTATION,
    DEFAULT_SETTINGS[SETTINGS_KEYS.DEFAULT_LOCK_ARTWORK_ROTATION]
  ) === true;
}