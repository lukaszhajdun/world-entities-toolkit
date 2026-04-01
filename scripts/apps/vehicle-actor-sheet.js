import {
  ACTOR_TYPES,
  MODULE_ID
} from "../core/constants.js";
import { getQualifiedActorType } from "../model/register-models.js";
import { getDragDataFromEvent } from "../services/dragdrop.service.js";
import {
  addVehiclePassenger,
  assignVehicleDriver,
  assignVehicleDriverFromPassengerIndex,
  assignVehicleOwner,
  clearVehicleDriver,
  clearVehicleOwner,
  createVehiclePassengerTransferDragData,
  getVehicleDriverReference,
  getVehicleOccupancyCount,
  getVehicleOwnerReference,
  getVehiclePassengerCapacity,
  isVehiclePassengerTransferDragData,
  prepareVehicleDriver,
  prepareVehicleOwner,
  prepareVehiclePassengers,
  removeVehiclePassengerByIndex
} from "../services/vehicle-actor.service.js";
import { getClosestDropZoneId } from "../services/dragdrop.service.js";
import { openActorReference } from "../services/actor-ref.service.js";
import { BaseModuleActorSheet } from "./base-module-actor-sheet.js";
import { DropZoneMixin } from "./mixins/drop-zone-mixin.js";

const { FilePicker } = foundry.applications.apps;
const VEHICLE_TYPE = getQualifiedActorType(ACTOR_TYPES.VEHICLE);

export class VehicleActorSheet extends DropZoneMixin(BaseModuleActorSheet) {
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

  _getDropZoneIds() {
    return ["owner", "driver", "passengers"];
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const [ownerData, driverData, passengers] = await Promise.all([
      prepareVehicleOwner(this.actor),
      prepareVehicleDriver(this.actor),
      prepareVehiclePassengers(this.actor)
    ]);

    const passengerCapacity = getVehiclePassengerCapacity(this.actor);
    const passengersCount = passengers.length;
    const occupancyCount = getVehicleOccupancyCount(this.actor);

    return foundry.utils.mergeObject(
      context,
      {
        ownerData,
        hasOwner: Boolean(ownerData),
        driverData,
        hasDriver: Boolean(driverData),
        passengers,
        hasPassengers: passengersCount > 0,
        passengersCount,
        passengerCapacity,
        occupancyCount
      },
      { inplace: false }
    );
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this._attachPortraitListeners();
    this._attachOwnerListeners();
    this._attachDriverListeners();
    this._attachPassengerListeners();
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

  _attachDriverListeners() {
    const form = this.form;
    if (!form) return;

    for (const button of form.querySelectorAll("[data-driver-open]")) {
      button.addEventListener("click", this._onDriverOpen.bind(this));
    }

    for (const button of form.querySelectorAll("[data-driver-clear]")) {
      button.addEventListener("click", this._onDriverClear.bind(this));
    }
  }

  _attachPassengerListeners() {
    const form = this.form;
    if (!form) return;

    for (const row of form.querySelectorAll("[data-passenger-drag]")) {
      row.addEventListener("dragstart", this._onPassengerDragStart.bind(this));
    }

    for (const button of form.querySelectorAll("[data-passenger-open]")) {
      button.addEventListener("click", this._onPassengerOpen.bind(this));
    }

    for (const button of form.querySelectorAll("[data-passenger-remove]")) {
      button.addEventListener("click", this._onPassengerRemove.bind(this));
    }
  }

  _onDropZoneUiDrop(dropZoneId, event) {
    if (dropZoneId !== "driver") return;

    const dragData = getDragDataFromEvent(event);
    if (!isVehiclePassengerTransferDragData(dragData)) return;

    event.stopPropagation();
    void this._handlePassengerTransferToDriver(dragData);
  }

  async _handlePassengerTransferToDriver(dragData) {
    if (!this.canEditDocument) {
      ui.notifications?.warn(game.i18n.localize("WET.Vehicle.Driver.Notifications.DropLocked"));
      return null;
    }

    const transfer = dragData?.wetVehiclePassengerTransfer;
    if (!transfer || typeof transfer !== "object") {
      ui.notifications?.warn(game.i18n.localize("WET.Vehicle.Driver.Notifications.InvalidDrop"));
      return null;
    }

    const sameActor = transfer.sourceActorUuid
      ? transfer.sourceActorUuid === this.actor?.uuid
      : transfer.sourceActorId === this.actor?.id;

    if (!sameActor) {
      ui.notifications?.warn(game.i18n.localize("WET.Vehicle.Driver.Notifications.InvalidDrop"));
      return null;
    }

    const result = await assignVehicleDriverFromPassengerIndex(this.actor, Number(transfer.passengerIndex));

    switch (result.status) {
      case "assigned":
      case "swapped":
        ui.notifications?.info(game.i18n.localize("WET.Vehicle.Driver.Notifications.Assigned"));
        return this.actor;

      default:
        ui.notifications?.warn(game.i18n.localize("WET.Vehicle.Driver.Notifications.InvalidDrop"));
        return null;
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

  _onPassengerDragStart(event) {
    if (!this.canEditDocument || !event.dataTransfer) return;

    const row = event.currentTarget;
    const index = Number(row.dataset.passengerIndex);
    if (!Number.isInteger(index)) return;

    const dragData = createVehiclePassengerTransferDragData(this.actor, index);

    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", JSON.stringify(dragData));
  }

  async _onDropActor(event, actor) {
    const dropZoneId = getClosestDropZoneId(event);

    switch (dropZoneId) {
      case "owner":
        return this._handleOwnerDrop(actor);

      case "driver":
        return this._handleDriverDrop(actor);

      case "passengers":
        return this._handlePassengerDrop(actor);

      default:
        return null;
    }
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

  async _handleDriverDrop(actor) {
    if (!this.canEditDocument) {
      ui.notifications?.warn(game.i18n.localize("WET.Vehicle.Driver.Notifications.DropLocked"));
      return null;
    }

    const result = await assignVehicleDriver(this.actor, actor);

    switch (result.status) {
      case "assigned":
      case "swapped":
        ui.notifications?.info(game.i18n.localize("WET.Vehicle.Driver.Notifications.Assigned"));
        return actor;

      case "alreadyDriver":
        ui.notifications?.warn(game.i18n.localize("WET.Vehicle.Driver.Notifications.AlreadyAssigned"));
        return null;

      case "alreadyPassenger":
        ui.notifications?.warn(game.i18n.localize("WET.Vehicle.Driver.Notifications.AlreadyPassenger"));
        return null;

      case "occupied":
        ui.notifications?.warn(game.i18n.localize("WET.Vehicle.Driver.Notifications.Occupied"));
        return null;

      case "invalidType":
        ui.notifications?.warn(game.i18n.localize("WET.Vehicle.Driver.Notifications.InvalidType"));
        return null;

      case "full":
        ui.notifications?.warn(game.i18n.localize("WET.Vehicle.Driver.Notifications.Full"));
        return null;

      default:
        ui.notifications?.warn(game.i18n.localize("WET.Vehicle.Driver.Notifications.InvalidDrop"));
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

      case "driverDuplicate":
        ui.notifications?.warn(game.i18n.localize("WET.Vehicle.Passengers.Notifications.AlreadyDriver"));
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

  async _onDriverOpen(event) {
    event.preventDefault();

    const driverReference = getVehicleDriverReference(this.actor);
    if (!driverReference) return;

    const opened = await openActorReference(driverReference);
    if (!opened) {
      ui.notifications?.warn(game.i18n.localize("WET.Vehicle.Driver.Notifications.MissingActor"));
    }
  }

  async _onDriverClear(event) {
    event.preventDefault();
    if (!this.canEditDocument) return;

    await clearVehicleDriver(this.actor);
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