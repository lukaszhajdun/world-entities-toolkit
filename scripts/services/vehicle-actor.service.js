import {
  ACTOR_TYPES,
  qualifyModuleActorType,
  toModuleActorKey
} from "../core/constants.js";
import {
  createActorReference,
  getActorTypeLabel,
  isSameActorReference,
  resolveActorReference
} from "./actor-ref.service.js";

const EMPTY_ACTOR_REFERENCE = Object.freeze({
  uuid: "",
  id: "",
  name: "",
  img: "",
  type: ""
});

const DISALLOWED_PASSENGER_TYPES = Object.freeze(new Set([
  ACTOR_TYPES.GROUP,
  ACTOR_TYPES.FACTION,
  ACTOR_TYPES.VEHICLE
]));

function hasStoredActorReference(reference) {
  if (!reference || typeof reference !== "object") return false;

  return [
    reference.uuid,
    reference.id,
    reference.name,
    reference.img,
    reference.type
  ].some(value => typeof value === "string" && value.trim().length > 0);
}

function isVehicleActorDocument(actor) {
  if (!actor || actor.documentName !== "Actor") return false;

  const actorType = actor.type ?? "";
  return actorType === ACTOR_TYPES.VEHICLE || actorType === qualifyModuleActorType(ACTOR_TYPES.VEHICLE);
}

function normalizeActorTypeKey(actorType) {
  if (typeof actorType !== "string" || !actorType.length) return "";

  const moduleActorKey = toModuleActorKey(actorType);
  if (moduleActorKey) return moduleActorKey;

  return actorType;
}

function isPassengerDisallowedActor(actor) {
  if (!actor || actor.documentName !== "Actor") return true;
  return DISALLOWED_PASSENGER_TYPES.has(normalizeActorTypeKey(actor.type));
}

function getVehiclePassengersArray(actor) {
  return Array.isArray(actor?.system?.passengers) ? [...actor.system.passengers] : [];
}

function getResolvedActorPresentation(reference, resolved, fallbackNameKey) {
  const actorType = resolved?.type ?? reference?.type ?? "";

  return {
    uuid: reference?.uuid ?? "",
    id: reference?.id ?? "",
    name: resolved?.name ?? reference?.name ?? game.i18n.localize(fallbackNameKey),
    img: resolved?.img ?? reference?.img ?? "icons/svg/mystery-man.svg",
    type: actorType,
    typeLabel: getActorTypeLabel(actorType),
    exists: Boolean(resolved)
  };
}

export function getVehiclePassengerCapacity(actor) {
  const seats = Number(actor?.system?.details?.seats);
  if (!Number.isFinite(seats)) return 0;
  return Math.max(0, Math.floor(seats));
}

export function getVehicleOwnerReference(actor) {
  const reference = actor?.system?.owner?.actor;
  if (!hasStoredActorReference(reference)) return null;
  return reference;
}

export async function prepareVehicleOwner(actor) {
  const reference = getVehicleOwnerReference(actor);
  if (!reference) return null;

  const resolved = await resolveActorReference(reference);
  return getResolvedActorPresentation(reference, resolved, "WET.Vehicle.Owner.UnknownName");
}

export async function assignVehicleOwner(actor, candidateActor) {
  if (!actor || actor.documentName !== "Actor") {
    return { status: "invalid" };
  }

  if (!candidateActor || candidateActor.documentName !== "Actor") {
    return { status: "invalid" };
  }

  if (isVehicleActorDocument(candidateActor)) {
    return { status: "invalidType" };
  }

  await actor.update({
    "system.owner.actor": createActorReference(candidateActor)
  });

  return {
    status: "assigned",
    owner: candidateActor
  };
}

export async function clearVehicleOwner(actor) {
  if (!actor || actor.documentName !== "Actor") return;

  await actor.update({
    "system.owner.actor": { ...EMPTY_ACTOR_REFERENCE }
  });
}

export async function prepareVehiclePassengers(actor) {
  const passengers = getVehiclePassengersArray(actor);

  return Promise.all(
    passengers.map(async (passenger, index) => {
      const resolved = await resolveActorReference(passenger);

      return {
        index,
        ...getResolvedActorPresentation(passenger, resolved, "WET.Vehicle.Passengers.UnknownName")
      };
    })
  );
}

export function hasVehiclePassenger(actor, candidateActor) {
  if (!candidateActor || candidateActor.documentName !== "Actor") return false;

  const candidateReference = createActorReference(candidateActor);
  const passengers = getVehiclePassengersArray(actor);

  return passengers.some(passenger => isSameActorReference(passenger, candidateReference));
}

export async function addVehiclePassenger(actor, candidateActor) {
  if (!actor || actor.documentName !== "Actor") {
    return { status: "invalid" };
  }

  if (!candidateActor || candidateActor.documentName !== "Actor") {
    return { status: "invalid" };
  }

  if (isPassengerDisallowedActor(candidateActor)) {
    return { status: "invalidType" };
  }

  if (hasVehiclePassenger(actor, candidateActor)) {
    return { status: "duplicate" };
  }

  const passengers = getVehiclePassengersArray(actor);
  const capacity = getVehiclePassengerCapacity(actor);

  if (passengers.length >= capacity) {
    return {
      status: "full",
      capacity,
      count: passengers.length
    };
  }

  passengers.push(createActorReference(candidateActor));

  await actor.update({ "system.passengers": passengers });

  return {
    status: "added",
    passenger: candidateActor,
    capacity,
    count: passengers.length
  };
}

export async function removeVehiclePassengerByIndex(actor, passengerIndex) {
  const passengers = getVehiclePassengersArray(actor);
  if (!Number.isInteger(passengerIndex)) return;
  if (passengerIndex < 0 || passengerIndex >= passengers.length) return;

  passengers.splice(passengerIndex, 1);
  await actor.update({ "system.passengers": passengers });
}