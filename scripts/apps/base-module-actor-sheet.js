import {
  ACTOR_FLAGS,
  CSS_CLASSES,
  LOCALIZATION_PREFIX,
  MODULE_ID
} from "../core/constants.js";
import { logger } from "../core/logger.js";
import {
  isDragLeavingDropZone,
  setDropZoneActive
} from "../services/dragdrop.service.js";

const { ActorSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin } = foundry.applications.api;

export class BaseModuleActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  #listenerController = null;

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

  _canDragStart(_selector) {
    return this.canEditDocument;
  }

  _canDragDrop(_selector) {
    return this.canEditDocument;
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this._bindBaseListeners();
  }

  async close(options = {}) {
    this._unbindBaseListeners();
    return super.close(options);
  }

  _getDropZoneRoot() {
    return this.form;
  }

  _getDropZoneIds() {
    return [];
  }

  _isTrackedDropZone(dropZoneId) {
    return this._getDropZoneIds().includes(dropZoneId);
  }

  _canDragOverDropZone(dropZoneId, _event) {
    return this.canEditDocument && this._isTrackedDropZone(dropZoneId);
  }

  _getDropZoneDropEffect(_dropZoneId, _event) {
    return "copy";
  }

  _getDelegatedDragStartElement(source) {
    const target = source?.target instanceof Element
      ? source.target
      : source instanceof Element
        ? source
        : null;

    if (!(target instanceof Element)) return null;
    return target.closest("[data-role-transfer-source]");
  }

  async _onDelegatedDragStart(_event, _dragSource) {
    return false;
  }

  _unbindBaseListeners() {
    this.#listenerController?.abort();
    this.#listenerController = null;
  }

  _bindBaseListeners() {
    this._unbindBaseListeners();

    const root = this._getDropZoneRoot();
    if (!(root instanceof Element)) return;

    const controller = new AbortController();
    const { signal } = controller;

    root.addEventListener("click", event => this._onBaseClick(event), { signal });
    root.addEventListener("change", event => this._onBaseChange(event), { signal });
    root.addEventListener("dragstart", event => void this._onBaseDragStart(event), { signal });
    root.addEventListener("dragenter", event => this._onBaseDragEnter(event), { signal });
    root.addEventListener("dragover", event => this._onBaseDragOver(event), { signal });
    root.addEventListener("dragleave", event => this._onBaseDragLeave(event), { signal });
    root.addEventListener("drop", event => this._onBaseDrop(event), { signal });

    this.#listenerController = controller;
  }

  _onBaseClick(event) {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const lockToggle = target.closest("[data-lock-toggle]");
    if (!lockToggle) return;

    void this._onToggleEditLock(event);
  }

  _onBaseChange(event) {
    if (!this.canEditDocument) return;

    const element = event.target;
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) {
      return;
    }

    if (!element.name?.trim()) return;
    void this._onAutoSaveFieldChangeForElement(element);
  }

  async _onBaseDragStart(event) {
    const dragSource = this._getDelegatedDragStartElement(event);
    if (!dragSource) return;
    if (!this.canEditDocument) return;

    const handled = await this._onDelegatedDragStart(event, dragSource);
    if (!handled) return;

    event.stopPropagation();
    event.stopImmediatePropagation();
  }

  _getDropZoneElementFromSource(source) {
    const target = source?.target instanceof Element
      ? source.target
      : source instanceof Element
        ? source
        : null;

    const dropZone = target?.closest("[data-drop-zone]") ?? null;
    if (!dropZone) return null;

    const dropZoneId = String(dropZone.dataset.dropZone ?? "");
    return this._isTrackedDropZone(dropZoneId) ? dropZone : null;
  }

  _clearDropZoneHighlights() {
    const root = this._getDropZoneRoot();
    if (!(root instanceof Element)) return;

    for (const dropZone of root.querySelectorAll("[data-drop-zone].is-dragover")) {
      setDropZoneActive(dropZone, false);
    }
  }

  _activateDropZone(dropZone) {
    this._clearDropZoneHighlights();
    setDropZoneActive(dropZone, true);
  }

  _onBaseDragEnter(event) {
    const dropZone = this._getDropZoneElementFromSource(event);
    if (!dropZone) return;

    const dropZoneId = String(dropZone.dataset.dropZone ?? "");
    if (!this._canDragOverDropZone(dropZoneId, event)) return;

    event.preventDefault();
    this._activateDropZone(dropZone);
  }

  _onBaseDragOver(event) {
    const dropZone = this._getDropZoneElementFromSource(event);
    if (!dropZone) return;

    const dropZoneId = String(dropZone.dataset.dropZone ?? "");
    if (!this._canDragOverDropZone(dropZoneId, event)) return;

    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = this._getDropZoneDropEffect(dropZoneId, event);
    }

    this._activateDropZone(dropZone);
  }

  _onBaseDragLeave(event) {
    const dropZone = this._getDropZoneElementFromSource(event);
    if (!dropZone) return;
    if (!isDragLeavingDropZone(event, dropZone)) return;

    setDropZoneActive(dropZone, false);
  }

  _onBaseDrop(event) {
    const dropZone = this._getDropZoneElementFromSource(event);
    if (dropZone) {
      event.preventDefault();
      setDropZoneActive(dropZone, false);
    }

    this._clearDropZoneHighlights();
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

  async _onAutoSaveFieldChange(event) {
    const element = event?.currentTarget ?? event?.target ?? null;
    return this._onAutoSaveFieldChangeForElement(element);
  }

  async _onAutoSaveFieldChangeForElement(element) {
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