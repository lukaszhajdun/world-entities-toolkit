import {
  ACTOR_TYPES,
  LOCALIZATION_PREFIX,
  MODULE_ID,
  MODULE_TITLE,
  isModuleActorType,
  qualifyModuleActorType
} from "./core/constants.js";
import { logger } from "./core/logger.js";
import { registerGroupActorSheet } from "./apps/group-actor-sheet.js";
import { registerVehicleActorSheet } from "./apps/vehicle-actor-sheet.js";
import { registerActorDataModels } from "./model/register-models.js";
import * as settingsApi from "./settings/access.js";
import { registerSettings } from "./settings/register.js";

const GROUP_ACTOR_PLACEHOLDER = `modules/${MODULE_ID}/assets/placeholders/group-actor.webp`;

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

function isDefaultActorImage(imagePath, actor) {
  const defaultIcon = actor?.constructor?.DEFAULT_ICON ?? "icons/svg/mystery-man.svg";
  return !imagePath || imagePath === defaultIcon;
}

Hooks.on("preCreateActor", actor => {
  if (!isModuleActorType(actor.type)) return;

  const updateData = {
    prototypeToken: {
      actorLink: settingsApi.getDefaultLinkActorDataForActorType(actor.type),
      lockRotation: settingsApi.getDefaultLockArtworkRotationForActorType(actor.type)
    }
  };

  const isGroupActor = actor.type === qualifyModuleActorType(ACTOR_TYPES.GROUP);
  const currentImage = foundry.utils.getProperty(actor._source, "img");
  const currentTokenImage = foundry.utils.getProperty(actor._source, "prototypeToken.texture.src");

  if (isGroupActor && isDefaultActorImage(currentImage, actor)) {
    updateData.img = GROUP_ACTOR_PLACEHOLDER;
  }

  if (isGroupActor && isDefaultActorImage(currentTokenImage, actor)) {
    updateData.prototypeToken.texture = {
      src: GROUP_ACTOR_PLACEHOLDER
    };
  }

  actor.updateSource(updateData);
});

Hooks.once("init", () => {
  registerActorDataModels();
  registerGroupActorSheet();
  registerVehicleActorSheet();
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