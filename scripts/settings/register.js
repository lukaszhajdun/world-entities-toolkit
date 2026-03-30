import {
  DEFAULT_SETTINGS,
  LOCALIZATION_PREFIX,
  MODULE_ID,
  SETTINGS_KEYS
} from "../core/constants.js";

let settingsRegistered = false;

export function registerSettings() {
  if (settingsRegistered) return;

  game.settings.register(MODULE_ID, SETTINGS_KEYS.DEBUG, {
    name: `${LOCALIZATION_PREFIX}.Settings.Debug.Name`,
    hint: `${LOCALIZATION_PREFIX}.Settings.Debug.Hint`,
    scope: "client",
    config: true,
    type: Boolean,
    default: DEFAULT_SETTINGS[SETTINGS_KEYS.DEBUG]
  });

  game.settings.register(MODULE_ID, SETTINGS_KEYS.DEFAULT_LINK_ACTOR_DATA, {
    name: `${LOCALIZATION_PREFIX}.Settings.DefaultLinkActorData.Name`,
    hint: `${LOCALIZATION_PREFIX}.Settings.DefaultLinkActorData.Hint`,
    scope: "world",
    config: true,
    type: Boolean,
    default: DEFAULT_SETTINGS[SETTINGS_KEYS.DEFAULT_LINK_ACTOR_DATA]
  });

  game.settings.register(MODULE_ID, SETTINGS_KEYS.DEFAULT_LOCK_ARTWORK_ROTATION, {
    name: `${LOCALIZATION_PREFIX}.Settings.DefaultLockArtworkRotation.Name`,
    hint: `${LOCALIZATION_PREFIX}.Settings.DefaultLockArtworkRotation.Hint`,
    scope: "world",
    config: true,
    type: Boolean,
    default: DEFAULT_SETTINGS[SETTINGS_KEYS.DEFAULT_LOCK_ARTWORK_ROTATION]
  });

  settingsRegistered = true;
}