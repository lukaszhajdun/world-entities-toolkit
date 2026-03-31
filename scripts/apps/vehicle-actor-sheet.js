import {
  ACTOR_TYPES,
  MODULE_ID
} from "../core/constants.js";
import { getQualifiedActorType } from "../model/register-models.js";
import {
  addVehiclePassenger,
  assignVehicleOwner,
  clearVehicleOwner,
  getVehicleOwnerReference,
  getVehiclePassengerCapacity,
  prepareVehicleOwner,
  prepareVehiclePassengers,
  removeVehiclePassengerByIndex
} from "../services/vehicle-actor.service.js";
import { openActorReference } from "../services/actor-ref.service.js";
import { BaseModuleActorSheet } from "./base-module-actor-sheet.js";

const { FilePicker } = foundry.applications.apps;
const VEHICLE_TYPE = getQualifiedActorType(ACTOR_TYPES.VEHICLE);

export class VehicleActorSheet extends BaseModuleActorSheet {
  static get DEFAULT_OPTIONS() {
    const options = foundry.utils.deepClone(super.DEFAULT_OPTIONS);

    options.classes = Array.from(new Set([
      ...(options.classes ?? []),
      "wet-vehicle-sheet"
    ]));

    options.position = foundry.utils.mergeObject(
      options.position ?? {},
      { width: 960 },
      { inplace: false }
    );

    options.window = foundry.utils.mergeObject(
      options.window ?? {},
      {
        icon: "fa-solid fa-car-side"
      },
      { inplace: false }
    );

    delete options.window.controls;

    return options;
  }

  static get PARTS() {
    return {
      form: {
        template: `modules/${MODULE_ID}/templates/actors/vehicle-sheet.hbs`
      }
    };
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const [ownerData, passengers] = await Promise.all([
      prepareVehicleOwner(this.actor),
      prepareVehiclePassengers(this.actor)
    ]);

    const passengerCapacity = getVehiclePassengerCapacity(this.actor);
    const passengersCount = passengers.length;

    return foundry.utils.mergeObject(
      context,
      {
        ownerData,
        hasOwner: Boolean(ownerData),
        passengers,
        hasPassengers: passengersCount > 0,
        passengersCount,
        passengerCapacity
      },
      { inplace: false }
    );
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this._attachPortraitListeners();
    this._attachOwnerListeners();
    this._attachPassengerListeners();
    this._attachDropZoneListeners();
  }

  _attachPortraitListeners() {
    const form = this.form;
    if (!form) return;

    const portraitButton = form.querySelector("[data-edit-image]");
    if (portraitButton) {
      portraitButton.addEventListener("click", this._onPortraitEdit.bind(this));
    }
  }

  _attachOwnerListeners() {
    const form = this.form;
    if (!form) return;

    for (const button of form.querySelectorAll("[data-owner-open]")) {
      button.addEventListener("click", this._onOwnerOpen.bind(this));
    }

    for (const button of form.querySelectorAll("[data-owner-clear]")) {
      button.addEventListener("click", this._onOwnerClear.bind(this));
    }
  }

  _attachPassengerListeners() {
    const form = this.form;
    if (!form) return;

    for (const button of form.querySelectorAll("[data-passenger-open]")) {
      button.addEventListener("click", this._onPassengerOpen.bind(this));
    }

    for (const button of form.querySelectorAll("[data-passenger-remove]")) {
      button.addEventListener("click", this._onPassengerRemove.bind(this));
    }
  }

  _attachDropZoneListeners() {
    const form = this.form;
    if (!form) return;

    for (const dropZone of form.querySelectorAll("[data-drop-zone]")) {
      dropZone.addEventListener("dragenter", this._onDropZoneDragEnter.bind(this));
      dropZone.addEventListener("dragover", this._onDropZoneDragOver.bind(this));
      dropZone.addEventListener("dragleave", this._onDropZoneDragLeave.bind(this));
      dropZone.addEventListener("drop", this._onDropZoneDropUI.bind(this));
    }
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

  _onDropZoneDragEnter(event) {
    if (!this.canEditDocument) return;
    event.currentTarget.classList.add("is-dragover");
  }

  _onDropZoneDragOver(event) {
    if (!this.canEditDocument) return;

    event.preventDefault();

    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }

    event.currentTarget.classList.add("is-dragover");
  }

  _onDropZoneDragLeave(event) {
    const dropZone = event.currentTarget;
    const relatedTarget = event.relatedTarget;

    if (relatedTarget instanceof Node && dropZone.contains(relatedTarget)) return;
    dropZone.classList.remove("is-dragover");
  }

  _onDropZoneDropUI(event) {
    event.preventDefault();
    event.currentTarget.classList.remove("is-dragover");
  }

  async _onDropActor(event, actor) {
    const target = event.target instanceof HTMLElement ? event.target : null;
    const ownerDropZone = target?.closest("[data-drop-zone='owner']");
    const passengersDropZone = target?.closest("[data-drop-zone='passengers']");

    if (ownerDropZone) {
      return this._handleOwnerDrop(actor);
    }

    if (passengersDropZone) {
      return this._handlePassengerDrop(actor);
    }

    return null;
  }

  async _handleOwnerDrop(actor) {
    if (!this.canEditDocument) {
      ui.notifications?.warn(game.i18n.localize("WET.Vehicle.Owner.Notifications.DropLocked"));
      return null;
    }

    const result = await assignVehicleOwner(this.actor, actor);

    switch (result.status) {
      case "assigned":
        ui.notifications?.info(game.i18n.localize("WET.Vehicle.Owner.Notifications.Assigned"));
        return actor;

      case "invalidType":
        ui.notifications?.warn(game.i18n.localize("WET.Vehicle.Owner.Notifications.InvalidType"));
        return null;

      default:
        ui.notifications?.warn(game.i18n.localize("WET.Vehicle.Owner.Notifications.InvalidDrop"));
        return null;
    }
  }

  async _handlePassengerDrop(actor) {
    if (!this.canEditDocument) {
      ui.notifications?.warn(game.i18n.localize("WET.Vehicle.Passengers.Notifications.DropLocked"));
      return null;
    }

    const result = await addVehiclePassenger(this.actor, actor);

    switch (result.status) {
      case "added":
        ui.notifications?.info(game.i18n.localize("WET.Vehicle.Passengers.Notifications.Added"));
        return actor;

      case "groupAdded":
        ui.notifications?.info(game.i18n.localize("WET.Vehicle.Passengers.Notifications.GroupAdded"));
        return actor;

      case "duplicate":
        ui.notifications?.warn(game.i18n.localize("WET.Vehicle.Passengers.Notifications.AlreadyAdded"));
        return null;

      case "groupNoEligible":
        ui.notifications?.warn(game.i18n.localize("WET.Vehicle.Passengers.Notifications.GroupNoEligible"));
        return null;

      case "invalidType":
        ui.notifications?.warn(game.i18n.localize("WET.Vehicle.Passengers.Notifications.InvalidType"));
        return null;

      case "full":
        ui.notifications?.warn(game.i18n.localize("WET.Vehicle.Passengers.Notifications.Full"));
        return null;

      case "groupFull":
        ui.notifications?.warn(game.i18n.localize("WET.Vehicle.Passengers.Notifications.GroupFull"));
        return null;

      default:
        ui.notifications?.warn(game.i18n.localize("WET.Vehicle.Passengers.Notifications.InvalidDrop"));
        return null;
    }
  }

  async _onOwnerOpen(event) {
    event.preventDefault();

    const ownerReference = getVehicleOwnerReference(this.actor);
    if (!ownerReference) return;

    const opened = await openActorReference(ownerReference);
    if (!opened) {
      ui.notifications?.warn(game.i18n.localize("WET.Vehicle.Owner.Notifications.MissingActor"));
    }
  }

  async _onOwnerClear(event) {
    event.preventDefault();
    if (!this.canEditDocument) return;

    await clearVehicleOwner(this.actor);
  }

  async _onPassengerOpen(event) {
    event.preventDefault();

    const button = event.currentTarget;
    const index = Number(button.dataset.passengerIndex);
    if (!Number.isInteger(index)) return;

    const passenger = this.actor.system.passengers?.[index];
    if (!passenger) return;

    const opened = await openActorReference(passenger);
    if (!opened) {
      ui.notifications?.warn(game.i18n.localize("WET.Vehicle.Passengers.Notifications.MissingActor"));
    }
  }

  async _onPassengerRemove(event) {
    event.preventDefault();
    if (!this.canEditDocument) return;

    const button = event.currentTarget;
    const index = Number(button.dataset.passengerIndex);
    if (!Number.isInteger(index)) return;

    await removeVehiclePassengerByIndex(this.actor, index);
  }
}

let sheetRegistered = false;

export function registerVehicleActorSheet() {
  if (sheetRegistered) return;

  foundry.documents.collections.Actors.registerSheet(MODULE_ID, VehicleActorSheet, {
    types: [VEHICLE_TYPE],
    makeDefault: true,
    label: game.i18n.localize("WET.Sheets.Vehicle.Label")
  });

  sheetRegistered = true;
}