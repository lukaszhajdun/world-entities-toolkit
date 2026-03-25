import {
  ACTOR_TYPES,
  MODULE_ID
} from "../core/constants.js";
import {
  openActorReference
} from "../services/actor-ref.service.js";
import {
  prepareGroupMembers,
  removeGroupMemberByIndex
} from "../services/group-actor.service.js";
import { getQualifiedActorType } from "../model/register-models.js";
import { BaseModuleActorSheet } from "./base-module-actor-sheet.js";

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

  async _onPortraitEdit(event) {
    event.preventDefault();
    if (!this.canEditDocument) return;
    await this._onEditImage(event);
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