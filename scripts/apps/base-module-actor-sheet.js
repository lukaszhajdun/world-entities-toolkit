import {
  ACTOR_FLAGS,
  CSS_CLASSES,
  LOCALIZATION_PREFIX,
  MODULE_ID
} from "../core/constants.js";
import { logger } from "../core/logger.js";
import {
  createActorRoleTransferDragDataForActor,
  getActorRoleTransferData,
  getActorRoleTransferSourceFromElement,
  getActorRoleTransferTargetFromEvent,
  isActorRoleTransferEventForHost
} from "../services/actor-role-transfer.service.js";
import {
  getDragDataFromEvent,
  isActorDragData,
  isDragLeavingDropZone,
  resolveActorFromDragData,
  setDropZoneActive
} from "../services/dragdrop.service.js";

const { ActorSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin } = foundry.applications.api;
function debugRoleDnD(...args) {
  void args;
}

export class BaseModuleActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  #listenerController = null;
  #isInternalRoleDragActive = false;
  #handledDropEvents = new WeakSet();
  #activeRoleTransferDragData = null;
  #lastInternalRoleTransferTarget = null;
  #lastInternalPointerPosition = null;
  #dropHandledForActiveInternalDrag = false;

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
    root.addEventListener("dragend", event => {
      void this._onBaseDragEnd(event);
    }, { signal });
    root.addEventListener("dragenter", event => this._onBaseDragEnter(event), { signal, capture: true });
    root.addEventListener("dragover", event => this._onBaseDragOver(event), { signal, capture: true });
    root.addEventListener("dragleave", event => this._onBaseDragLeave(event), { signal, capture: true });
    root.addEventListener("drop", event => {
      void this._onBaseDrop(event).catch(error => {
        debugRoleDnD("drop handler error", {
          actorId: this.actor?.id ?? null,
          message: error?.message ?? String(error)
        });
      });
    }, { signal, capture: true });

    // Fallback for browsers/hosts where sheet-level drop listeners are preempted.
    document.addEventListener("dragover", event => this._onDocumentDragOver(event), { signal, capture: true });
    document.addEventListener("drop", event => {
      void this._onDocumentDrop(event).catch(error => {
        debugRoleDnD("document drop handler error", {
          actorId: this.actor?.id ?? null,
          message: error?.message ?? String(error)
        });
      });
    }, { signal, capture: true });
    document.addEventListener("pointerup", event => {
      void this._onDocumentPointerUp(event).catch(error => {
        debugRoleDnD("document pointerup handler error", {
          actorId: this.actor?.id ?? null,
          message: error?.message ?? String(error)
        });
      });
    }, { signal, capture: true });
    document.addEventListener("mouseup", event => {
      void this._onDocumentPointerUp(event).catch(error => {
        debugRoleDnD("document mouseup handler error", {
          actorId: this.actor?.id ?? null,
          message: error?.message ?? String(error)
        });
      });
    }, { signal, capture: true });

    for (const dragSource of root.querySelectorAll("[data-role-transfer-source]")) {
      dragSource.addEventListener("dragstart", event => {
        void this._onBaseDragStart(event);
      }, { signal });

      dragSource.addEventListener("dragend", () => {
        void this._onBaseDragEnd();
      }, { signal });
    }

    const dropTargets = new Set([
      ...root.querySelectorAll("[data-drop-zone]"),
      ...root.querySelectorAll("[data-role-transfer-target]")
    ]);

    debugRoleDnD("bound listeners", {
      actorId: this.actor?.id ?? null,
      sheet: this.constructor.name,
      dragSources: root.querySelectorAll("[data-role-transfer-source]").length,
      dropTargets: dropTargets.size
    });

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
    debugRoleDnD("dragstart received", {
      actorId: this.actor?.id ?? null,
      target: event.target instanceof Element ? event.target.outerHTML.slice(0, 120) : null,
      dragSourceFound: Boolean(dragSource),
      canEdit: this.canEditDocument
    });

    if (!dragSource) return false;
    if (!this.canEditDocument) return false;

    const handled = await this._onDelegatedDragStart(event, dragSource);
    debugRoleDnD("dragstart handled", {
      actorId: this.actor?.id ?? null,
      handled
    });
    if (!handled) return false;

    this.#isInternalRoleDragActive = true;
    this.#dropHandledForActiveInternalDrag = false;
    this.#lastInternalRoleTransferTarget = null;
    this.#activeRoleTransferDragData = getDragDataFromEvent(event);

    if (!this.#activeRoleTransferDragData) {
      const source = getActorRoleTransferSourceFromElement(dragSource);
      if (source) {
        this.#activeRoleTransferDragData = createActorRoleTransferDragDataForActor(this.actor, source);
      }
    }

    event.stopPropagation();
    event.stopImmediatePropagation();
    return true;
  }

  async _onBaseDragEnd(event) {
    try {
      await this._finalizeInternalDragFallback("dragend", event);
    } finally {
      this.#isInternalRoleDragActive = false;
      this.#activeRoleTransferDragData = null;
      this.#lastInternalRoleTransferTarget = null;
      this.#lastInternalPointerPosition = null;
      this.#dropHandledForActiveInternalDrag = false;
      this._clearDropZoneHighlights();
    }
  }

  async _onDragStart(event) {
    const handled = await this._onBaseDragStart(event);
    if (handled) return;
    return super._onDragStart(event);
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

    for (const transferTarget of root.querySelectorAll("[data-role-transfer-target].is-dragover")) {
      setDropZoneActive(transferTarget, false);
    }
  }

  _activateDropZone(dropZone) {
    this._clearDropZoneHighlights();
    setDropZoneActive(dropZone, true);
  }

  _getRoleTransferTargetElement(event) {
    const transferTarget = event?.target instanceof Element
      ? event.target.closest("[data-role-transfer-target]")
      : null;

    return transferTarget instanceof Element ? transferTarget : null;
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
    // Browsers often do not expose dataTransfer payload during dragover.
    // Keep drop enabled while an internal role drag is active.
    if (this.#isInternalRoleDragActive) {
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
      }
    }

    const dropZone = this._getDropZoneElementFromSource(event);
    if (!dropZone) {
      const transferTarget = this._getRoleTransferTargetElement(event);
      if (!transferTarget || !getActorRoleTransferTargetFromEvent(event)) {
        this.#lastInternalRoleTransferTarget = null;
        this.#lastInternalPointerPosition = {
          clientX: Number(event?.clientX ?? NaN),
          clientY: Number(event?.clientY ?? NaN)
        };
        this._clearDropZoneHighlights();
        return;
      }

      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
      }

      this.#lastInternalRoleTransferTarget = transferTarget;
      this.#lastInternalPointerPosition = {
        clientX: Number(event?.clientX ?? NaN),
        clientY: Number(event?.clientY ?? NaN)
      };
      this._activateDropZone(transferTarget);
      return;
    }

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

  _isEventWithinSheetRoot(event) {
    const root = this._getDropZoneRoot();
    if (!(root instanceof Element)) return false;

    const path = typeof event?.composedPath === "function" ? event.composedPath() : [];
    if (Array.isArray(path) && path.includes(root)) return true;

    const target = event?.target;
    if (target instanceof Node && root.contains(target)) return true;

    const clientX = Number(event?.clientX);
    const clientY = Number(event?.clientY);
    if (Number.isFinite(clientX) && Number.isFinite(clientY)) {
      const bounds = root.getBoundingClientRect();
      if (
        clientX >= bounds.left
        && clientX <= bounds.right
        && clientY >= bounds.top
        && clientY <= bounds.bottom
      ) {
        return true;
      }
    }

    return false;
  }

  _onDocumentDragOver(event) {
    if (!this.#isInternalRoleDragActive) return;
    if (!this._isEventWithinSheetRoot(event)) {
      this.#lastInternalRoleTransferTarget = null;
      this.#lastInternalPointerPosition = {
        clientX: Number(event?.clientX ?? NaN),
        clientY: Number(event?.clientY ?? NaN)
      };
      this._clearDropZoneHighlights();
      return;
    }
    debugRoleDnD("document dragover", {
      actorId: this.actor?.id ?? null,
      target: event?.target instanceof Element ? event.target.tagName : null,
      clientX: Number(event?.clientX ?? NaN),
      clientY: Number(event?.clientY ?? NaN)
    });
    this._onBaseDragOver(event);

    const pointerTarget = this._getRoleTransferTargetElementAtPoint(event?.clientX, event?.clientY);
    if (pointerTarget) {
      this.#lastInternalRoleTransferTarget = pointerTarget;
      this.#lastInternalPointerPosition = {
        clientX: Number(event?.clientX ?? NaN),
        clientY: Number(event?.clientY ?? NaN)
      };
    }
  }

  async _onDocumentDrop(event) {
    if (!this.#isInternalRoleDragActive) return;
    if (!this._isEventWithinSheetRoot(event)) return;
    debugRoleDnD("document drop", {
      actorId: this.actor?.id ?? null,
      target: event?.target instanceof Element ? event.target.tagName : null,
      clientX: Number(event?.clientX ?? NaN),
      clientY: Number(event?.clientY ?? NaN)
    });
    await this._onBaseDrop(event);
  }

  async _onDocumentPointerUp(event) {
    if (!this.#isInternalRoleDragActive) return;
    if (this.#dropHandledForActiveInternalDrag) return;

    const pointerTarget = this._getRoleTransferTargetElementAtPoint(event?.clientX, event?.clientY);
    if (pointerTarget instanceof Element) {
      this.#lastInternalRoleTransferTarget = pointerTarget;
      this.#lastInternalPointerPosition = {
        clientX: Number(event?.clientX ?? NaN),
        clientY: Number(event?.clientY ?? NaN)
      };
    }

    await this._finalizeInternalDragFallback("pointerup", event);
  }

  _getRoleTransferTargetElementAtPoint(clientX, clientY) {
    const x = Number(clientX);
    const y = Number(clientY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

    const elementAtPoint = document.elementFromPoint(x, y);
    if (!(elementAtPoint instanceof Element)) return null;

    const root = this._getDropZoneRoot();
    if (!(root instanceof Element)) return null;
    if (!root.contains(elementAtPoint)) return null;

    const transferTarget = elementAtPoint.closest("[data-role-transfer-target]");
    return transferTarget instanceof Element ? transferTarget : null;
  }

  async _finalizeInternalDragFallback(reason, event = null) {
    if (!this.#isInternalRoleDragActive) return;
    if (this.#dropHandledForActiveInternalDrag) return;
    if (!this.#activeRoleTransferDragData) return;

    const pointerClientX = Number(event?.clientX ?? NaN);
    const pointerClientY = Number(event?.clientY ?? NaN);
    const hasPointerCoordinates = Number.isFinite(pointerClientX) && Number.isFinite(pointerClientY);

    // Prefer the actual release point. If unavailable (common with dragend),
    // fall back to the last valid hovered target captured during dragover.
    let target = this._getRoleTransferTargetElementAtPoint(pointerClientX, pointerClientY);
    if (!(target instanceof Element) && !hasPointerCoordinates) {
      target = this.#lastInternalRoleTransferTarget;
    }

    if (!(target instanceof Element)) return;

    debugRoleDnD(`${reason} fallback transfer`, {
      actorId: this.actor?.id ?? null,
      targetRole: target.dataset.roleTransferTargetRole ?? null,
      targetType: target.dataset.roleTransferTargetType ?? null
    });

    const payload = JSON.stringify(this.#activeRoleTransferDragData);
    const root = this._getDropZoneRoot();

    const syntheticEvent = {
      target,
      dataTransfer: {
        types: ["text/plain"],
        getData: type => (type === "text/plain" ? payload : "")
      },
      preventDefault() {},
      stopPropagation() {},
      stopImmediatePropagation() {},
      composedPath() {
        return root instanceof Element ? [target, root] : [target];
      }
    };

    const dragData = this.#activeRoleTransferDragData;
    if (!dragData || typeof dragData !== "object") return;

    this.#dropHandledForActiveInternalDrag = true;

    let actor = null;
    const transferData = getActorRoleTransferData(dragData);

    if (transferData?.actorUuid) {
      try {
        const resolved = await fromUuid(transferData.actorUuid);
        actor = resolved?.documentName === "Actor" ? resolved : null;
      } catch (_error) {
        actor = null;
      }
    }

    if (!actor && isActorDragData(dragData)) {
      actor = await resolveActorFromDragData(dragData);
    }

    await this._onDropActor(syntheticEvent, actor ?? null);
  }

  async _onBaseDrop(event) {
    debugRoleDnD("base drop entry", {
      actorId: this.actor?.id ?? null,
      target: event?.target instanceof Element ? event.target.outerHTML.slice(0, 120) : null
    });

    if (this.#handledDropEvents.has(event)) return;
    this.#handledDropEvents.add(event);

    this.#isInternalRoleDragActive = false;
    this.#dropHandledForActiveInternalDrag = true;

    const dropZone = this._getDropZoneElementFromSource(event);
    if (dropZone) {
      event.preventDefault();
      setDropZoneActive(dropZone, false);
    }

    this._clearDropZoneHighlights();

    const dragData = getDragDataFromEvent(event);
    debugRoleDnD("drop received", {
      actorId: this.actor?.id ?? null,
      target: event.target instanceof Element ? event.target.outerHTML.slice(0, 120) : null,
      hasDragData: Boolean(dragData),
      dragDataType: dragData?.type ?? null,
      isInternalTransfer: isActorRoleTransferEventForHost(event, this.actor)
    });
    if (!dragData) return;

    event.stopPropagation();
    event.stopImmediatePropagation();
    await this._onDrop(event);
  }

  async _onDrop(event) {
    const dragData = getDragDataFromEvent(event);
    debugRoleDnD("_onDrop invoked", {
      actorId: this.actor?.id ?? null,
      dragDataType: dragData?.type ?? null
    });
    if (isActorRoleTransferEventForHost(event, this.actor)) {
      event.preventDefault();
      const transferData = getActorRoleTransferData(dragData);

      let actor = null;
      if (transferData?.actorUuid) {
        try {
          const resolved = await fromUuid(transferData.actorUuid);
          actor = resolved?.documentName === "Actor" ? resolved : null;
        } catch (_error) {
          actor = null;
        }
      }

      return this._onDropActor(event, actor ?? null);
    }

    if (isActorDragData(dragData)) {
      event.preventDefault();
      const actor = await resolveActorFromDragData(dragData);
      debugRoleDnD("resolved actor from drop", {
        actorId: this.actor?.id ?? null,
        resolvedActorUuid: actor?.uuid ?? null
      });
      return this._onDropActor(event, actor ?? null);
    }

    return super._onDrop(event);
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