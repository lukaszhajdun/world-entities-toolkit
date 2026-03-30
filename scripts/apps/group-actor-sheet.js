import {
  ACTOR_TYPES,
  MODULE_ID
} from "../core/constants.js";
import {
  openActorReference
} from "../services/actor-ref.service.js";
import {
  addGroupMember,
  prepareGroupMembers,
  removeGroupMemberByIndex
} from "../services/group-actor.service.js";
import { getQualifiedActorType } from "../model/register-models.js";
import { BaseModuleActorSheet } from "./base-module-actor-sheet.js";

const { FilePicker } = foundry.applications.apps;
const GROUP_TYPE = getQualifiedActorType(ACTOR_TYPES.GROUP);

export class GroupActorSheet extends BaseModuleActorSheet {
  static get DEFAULT_OPTIONS() {
    const options = foundry.utils.deepClone(super.DEFAULT_OPTIONS);

    options.classes = Array.from(new Set([
      ...(options.classes ?? []),
      "wet-group-sheet"
    ]));

    options.position = foundry.utils.mergeObject(
      options.position ?? {},
      { width: 760 },
      { inplace: false }
    );

    options.window = foundry.utils.mergeObject(
      options.window ?? {},
      {
        icon: "fa-solid fa-people-group"
      },
      { inplace: false }
    );

    delete options.window.controls;

    return options;
  }

  static get PARTS() {
    return {
      form: {
        template: `modules/${MODULE_ID}/templates/actors/group-sheet.hbs`
      }
    };
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const members = await prepareGroupMembers(this.actor);

    return foundry.utils.mergeObject(
      context,
      {
        members,
        membersCount: members.length,
        hasMembers: members.length > 0
      },
      { inplace: false }
    );
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this._attachMemberListeners();
    this._attachPortraitListeners();
    this._attachDropZoneListeners();
  }

  _attachMemberListeners() {
    const form = this.form;
    if (!form) return;

    for (const button of form.querySelectorAll("[data-member-open]")) {
      button.addEventListener("click", this._onMemberOpen.bind(this));
    }

    for (const button of form.querySelectorAll("[data-member-remove]")) {
      button.addEventListener("click", this._onMemberRemove.bind(this));
    }
  }

  _attachPortraitListeners() {
    const form = this.form;
    if (!form) return;

    const portraitButton = form.querySelector("[data-edit-image]");
    if (portraitButton) {
      portraitButton.addEventListener("click", this._onPortraitEdit.bind(this));
    }
  }

  _attachDropZoneListeners() {
    const form = this.form;
    if (!form) return;

    const dropZone = form.querySelector("[data-drop-zone='members']");
    if (!dropZone) return;

    dropZone.addEventListener("dragenter", this._onMembersDragEnter.bind(this));
    dropZone.addEventListener("dragover", this._onMembersDragOver.bind(this));
    dropZone.addEventListener("dragleave", this._onMembersDragLeave.bind(this));
    dropZone.addEventListener("drop", this._onMembersDropUI.bind(this));
  }

  async _onPortraitEdit(event) {
    event.preventDefault();
    if (!this.canEditDocument) return;

    const current = this.actor.img ?? "";
    const initialTarget = current.includes("/") ? current.split("/").slice(0, -1).join("/") : "";

    const picker = new FilePicker({
      type: "image",
      current,
      callback: async path => {
        if (!path || path === this.actor.img) return;
        await this.actor.update({ img: path });
      }
    });

    await picker.browse(initialTarget);
  }

  _onMembersDragEnter(event) {
    if (!this.canEditDocument) return;
    const dropZone = event.currentTarget;
    dropZone.classList.add("is-dragover");
  }

  _onMembersDragOver(event) {
    if (!this.canEditDocument) return;

    event.preventDefault();

    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }

    const dropZone = event.currentTarget;
    dropZone.classList.add("is-dragover");
  }

  _onMembersDragLeave(event) {
    const dropZone = event.currentTarget;
    const relatedTarget = event.relatedTarget;

    if (relatedTarget instanceof Node && dropZone.contains(relatedTarget)) return;
    dropZone.classList.remove("is-dragover");
  }

  _onMembersDropUI(event) {
    event.preventDefault();
    const dropZone = event.currentTarget;
    dropZone.classList.remove("is-dragover");
  }

  async _onDropActor(event, actor) {
    const target = event.target instanceof HTMLElement ? event.target : null;
    const dropZone = target?.closest("[data-drop-zone='members']");

    if (!dropZone) return null;

    if (!this.canEditDocument) {
      ui.notifications?.warn(game.i18n.localize("WET.Group.Members.Notifications.DropLocked"));
      return null;
    }

    const result = await addGroupMember(this.actor, actor);

    switch (result.status) {
      case "added":
        ui.notifications?.info(game.i18n.localize("WET.Group.Members.Notifications.Added"));
        return actor;

      case "duplicate":
        ui.notifications?.warn(game.i18n.localize("WET.Group.Members.Notifications.AlreadyAdded"));
        return null;

      case "self":
        ui.notifications?.warn(game.i18n.localize("WET.Group.Members.Notifications.CannotAddSelf"));
        return null;

      default:
        ui.notifications?.warn(game.i18n.localize("WET.Group.Members.Notifications.InvalidDrop"));
        return null;
    }
  }

  async _onMemberOpen(event) {
    event.preventDefault();

    const button = event.currentTarget;
    const index = Number(button.dataset.memberIndex);
    if (!Number.isInteger(index)) return;

    const member = this.actor.system.members?.[index];
    if (!member) return;

    const opened = await openActorReference(member);
    if (!opened) {
      ui.notifications?.warn(game.i18n.localize("WET.Group.Members.Notifications.MissingActor"));
    }
  }

  async _onMemberRemove(event) {
    event.preventDefault();

    if (!this.canEditDocument) return;

    const button = event.currentTarget;
    const index = Number(button.dataset.memberIndex);
    if (!Number.isInteger(index)) return;

    await removeGroupMemberByIndex(this.actor, index);
  }
}

let sheetRegistered = false;

export function registerGroupActorSheet() {
  if (sheetRegistered) return;

  foundry.documents.collections.Actors.registerSheet(MODULE_ID, GroupActorSheet, {
    types: [GROUP_TYPE],
    makeDefault: true,
    label: game.i18n.localize("WET.Sheets.Group.Label")
  });

  sheetRegistered = true;
}