import {
  applyCopyDropEffect,
  getDropZoneElement,
  isDragLeavingDropZone,
  setDropZoneActive
} from "../../services/dragdrop.service.js";

export const DropZoneMixin = Base => class extends Base {
  #dropZoneController = null;

  async _onRender(context, options) {
    await super._onRender(context, options);
    this._attachDropZoneListeners();
  }

  async close(options = {}) {
    this._detachDropZoneListeners();
    return super.close(options);
  }

  _getDropZoneRoot() {
    return this.form;
  }

  _getDropZoneIds() {
    return [];
  }

  _canDragOverDropZone(_dropZoneId, _event) {
    return this.canEditDocument;
  }

  _onDropZoneUiDrop(_dropZoneId, _event) {}

  _attachDropZoneListeners() {
    this._detachDropZoneListeners();

    const root = this._getDropZoneRoot();
    const dropZoneIds = this._getDropZoneIds();

    if (!(root instanceof Element) || !Array.isArray(dropZoneIds) || dropZoneIds.length === 0) {
      return;
    }

    const controller = new AbortController();
    const { signal } = controller;

    for (const dropZoneId of dropZoneIds) {
      const dropZone = getDropZoneElement(root, dropZoneId);
      if (!dropZone) continue;

      dropZone.addEventListener("dragenter", event => this._handleDropZoneDragEnter(dropZoneId, event), { signal });
      dropZone.addEventListener("dragover", event => this._handleDropZoneDragOver(dropZoneId, event), { signal });
      dropZone.addEventListener("dragleave", event => this._handleDropZoneDragLeave(dropZoneId, event), { signal });
      dropZone.addEventListener("drop", event => this._handleDropZoneDrop(dropZoneId, event), { signal });
    }

    this.#dropZoneController = controller;
  }

  _detachDropZoneListeners() {
    this.#dropZoneController?.abort();
    this.#dropZoneController = null;
  }

  _handleDropZoneDragEnter(dropZoneId, event) {
    if (!this._canDragOverDropZone(dropZoneId, event)) return;
    setDropZoneActive(event.currentTarget, true);
  }

  _handleDropZoneDragOver(dropZoneId, event) {
    if (!this._canDragOverDropZone(dropZoneId, event)) return;

    event.preventDefault();
    applyCopyDropEffect(event);
    setDropZoneActive(event.currentTarget, true);
  }

  _handleDropZoneDragLeave(_dropZoneId, event) {
    const dropZone = event.currentTarget;
    if (!isDragLeavingDropZone(event, dropZone)) return;
    setDropZoneActive(dropZone, false);
  }

  _handleDropZoneDrop(dropZoneId, event) {
    event.preventDefault();
    setDropZoneActive(event.currentTarget, false);
    this._onDropZoneUiDrop(dropZoneId, event);
  }
};