import {
  ACTOR_TYPES,
  LOCALIZATION_PREFIX,
  MODULE_ID,
  MODULE_TITLE
} from "./core/constants.js";
import { logger } from "./core/logger.js";
import { registerGroupActorSheet } from "./apps/group-actor-sheet.js";
import { registerActorDataModels } from "./model/register-models.js";
import * as settingsApi from "./settings/access.js";
import { registerSettings } from "./settings/register.js";

function buildApi() {
  return Object.freeze({
    constants: Object.freeze({
      MODULE_ID,
      MODULE_TITLE,
      ACTOR_TYPES
    }),
    settings: Object.freeze({
      get: settingsApi.getSetting,
      set: settingsApi.setSetting,
      has: settingsApi.hasSetting
    })
  });
}

function registerApi() {
  const module = game.modules.get(MODULE_ID);
  if (!module) return;
  module.api = buildApi();
}

Hooks.once("init", () => {
  registerActorDataModels();
  registerGroupActorSheet();
  logger.info(game.i18n.localize(`${LOCALIZATION_PREFIX}.Log.Init`));
  registerSettings();
});

Hooks.once("setup", () => {
  registerApi();
  logger.debug("Module API registered.");
});

Hooks.once("ready", () => {
  logger.info(game.i18n.localize(`${LOCALIZATION_PREFIX}.Log.Ready`));
});