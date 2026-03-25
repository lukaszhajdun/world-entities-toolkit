import {
  ACTOR_FLAGS,
  CSS_CLASSES,
  LOCALIZATION_PREFIX,
  MODULE_ID
} from "../core/constants.js";
import { logger } from "../core/logger.js";

const { ActorSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin } = foundry.applications.api;

export class BaseModuleActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static get DEFAULT_OPTIONS() {
    const options = foundry.utils.deepClone(super.DEFAULT_OPTIONS);

    options.classes = Array.from(new Set([
      ...(options.classes ?? []),
      "actor",
      "standard-form",
      CSS_CLASSES.ROOT,
      "wet-sheet-app",
      "wet-actor-sheet"
    ]));

    options.form = foundry.utils.mergeObject(
      options.form ?? {},
      {
        submitOnChange: false,
        closeOnSubmit: false
      },
      { inplace: false }
    );

    options.position = foundry.utils.mergeObject(
      options.position ?? {},
      { width: 720 },
      { inplace: false }
    );

    options.window = foundry.utils.mergeObject(
      options.window ?? {},
      {
        icon: "fa-solid fa-shapes",
        resizable: true
      },
      { inplace: false }
    );

    return options;
  }

  get title() {
    const name = this.document?.name?.trim();
    if (name) return name;
    return game.i18n.localize(`${LOCALIZATION_PREFIX}.Sheets.Common.Unnamed`);
  }

  get isSheetLocked() {
    const explicitLockState = this.document?.getFlag(MODULE_ID, ACTOR_FLAGS.EDIT_LOCKED);
    if (typeof explicitLockState === "boolean") return explicitLockState;
    return false;
  }

  get canEditDocument() {
    return this.isEditable && !this.isSheetLocked;
  }

  get canToggleLock() {
    return this.isEditable;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const lockToggleKey = this.isSheetLocked
      ? `${LOCALIZATION_PREFIX}.Sheets.Common.Actions.UnlockEditing`
      : `${LOCALIZATION_PREFIX}.Sheets.Common.Actions.LockEditing`;

    return foundry.utils.mergeObject(
      context,
      {
        moduleId: MODULE_ID,
        cssClass: CSS_CLASSES.ROOT,
        rootId: this.id,
        actor: this.actor,
        system: this.actor.system,
        owner: this.actor.isOwner,
        editable: this.canEditDocument,
        canEdit: this.canEditDocument,
        canToggleLock: this.canToggleLock,
        isLocked: this.isSheetLocked,
        lockToggleLabel: game.i18n.localize(lockToggleKey),
        lockToggleTitle: game.i18n.localize(lockToggleKey),
        lockToggleIcon: this.isSheetLocked ? "fa-solid fa-lock" : "fa-solid fa-lock-open",
        title: this.title
      },
      { inplace: false }
    );
  }

  _getHeaderControls() {
    const controls = super._getHeaderControls();

    const seen = new Set();
    const filtered = [];

    for (const control of controls) {
      const action = control?.action ?? "";
      const label = control?.label ?? "";
      const key = action || label;

      if (!key) continue;
      if (action === "configureToken") continue;
      if (seen.has(key)) continue;

      seen.add(key);
      filtered.push(control);
    }

    return filtered;
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this._attachCommonListeners();
    this._attachAutoSaveListeners();
  }

  _attachCommonListeners() {
    const form = this.form;
    if (!form) return;

    const lockToggle = form.querySelector("[data-lock-toggle]");
    if (lockToggle) {
      lockToggle.addEventListener("click", this._onToggleEditLock.bind(this));
    }
  }

  async _onToggleEditLock(event) {
    event.preventDefault();

    if (!this.canToggleLock) return;

    const nextLockedState = !this.isSheetLocked;

    try {
      await this.document.setFlag(MODULE_ID, ACTOR_FLAGS.EDIT_LOCKED, nextLockedState);
    } catch (error) {
      logger.error("Failed to toggle edit lock state.", error);
      ui.notifications?.error(game.i18n.localize(`${LOCALIZATION_PREFIX}.Errors.EditLockToggleFailed`));
    }
  }

  _attachAutoSaveListeners() {
    if (!this.canEditDocument) return;

    const form = this.form;
    if (!form) return;

    const fields = form.querySelectorAll("input[name], textarea[name], select[name]");
    for (const field of fields) {
      field.addEventListener("change", this._onAutoSaveFieldChange.bind(this));
    }
  }

  async _onAutoSaveFieldChange(event) {
    const element = event.currentTarget;
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) {
      return;
    }

    const fieldName = element.name?.trim();
    if (!fieldName) return;

    const value = this._getAutoSaveFieldValue(element);
    const updateData = foundry.utils.expandObject({ [fieldName]: value });

    try {
      await this.document.update(updateData);
    } catch (error) {
      logger.error(`Failed to auto-save field "${fieldName}".`, error);
      ui.notifications?.error(game.i18n.localize(`${LOCALIZATION_PREFIX}.Errors.AutoSaveFailed`));
    }
  }

  _getAutoSaveFieldValue(element) {
    if (element instanceof HTMLInputElement) {
      if (element.type === "checkbox") return element.checked;
      if (element.type === "number") {
        if (element.value === "") return null;
        return Number(element.value);
      }
    }

    return element.value;
  }
}