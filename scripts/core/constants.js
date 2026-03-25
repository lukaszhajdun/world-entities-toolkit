export const MODULE_ID = "world-entities-toolkit";
export const MODULE_TITLE = "World Entities Toolkit";
export const LOCALIZATION_PREFIX = "WET";

export const SETTINGS_KEYS = Object.freeze({
  DEBUG: "debug"
});

export const DEFAULT_SETTINGS = Object.freeze({
  [SETTINGS_KEYS.DEBUG]: false
});

export const ACTOR_TYPES = Object.freeze({
  GROUP: "group",
  VEHICLE: "vehicle",
  FACTION: "faction"
});

export const MODULE_ACTOR_TYPES = Object.freeze(Object.values(ACTOR_TYPES));

export function qualifyModuleActorType(type) {
  return `${MODULE_ID}.${type}`;
}

export function isModuleActorType(type) {
  if (typeof type !== "string" || !type.length) return false;
  return MODULE_ACTOR_TYPES.some(moduleType => qualifyModuleActorType(moduleType) === type);
}

export const FLAGS = Object.freeze({
  ACTOR_REF: `${MODULE_ID}.actorRef`,
  UI_STATE: `${MODULE_ID}.uiState`
});

export const ACTOR_FLAGS = Object.freeze({
  EDIT_LOCKED: "editLocked"
});

export const CSS_CLASSES = Object.freeze({
  ROOT: MODULE_ID
});