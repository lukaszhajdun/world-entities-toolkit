import {
  ACTOR_TYPES,
  qualifyModuleActorType
} from "../core/constants.js";
import {
  createActorReference,
  getActorTypeLabel,
  resolveActorReference
} from "./actor-ref.service.js";

const EMPTY_ACTOR_REFERENCE = Object.freeze({
  uuid: "",
  id: "",
  name: "",
  img: "",
  type: ""
});

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

export function getVehicleOwnerReference(actor) {
  const reference = actor?.system?.owner?.actor;
  if (!hasStoredActorReference(reference)) return null;
  return reference;
}

export async function prepareVehicleOwner(actor) {
  const reference = getVehicleOwnerReference(actor);
  if (!reference) return null;

  const resolved = await resolveActorReference(reference);

  return {
    uuid: reference.uuid ?? "",
    id: reference.id ?? "",
    name: resolved?.name ?? reference.name ?? game.i18n.localize("WET.Vehicle.Owner.UnknownName"),
    img: resolved?.img ?? reference.img ?? "icons/svg/mystery-man.svg",
    type: resolved?.type ?? reference.type ?? "",
    typeLabel: getActorTypeLabel(resolved?.type ?? reference.type ?? ""),
    exists: Boolean(resolved)
  };
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