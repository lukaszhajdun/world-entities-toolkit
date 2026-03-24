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

  settingsRegistered = true;
}