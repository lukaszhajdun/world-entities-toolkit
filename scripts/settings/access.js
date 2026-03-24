import { MODULE_ID } from "../core/constants.js";

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