import {
  ACTOR_ROLE_TRANSFER_SOURCE_TYPES,
  ACTOR_ROLE_TRANSFER_TARGET_TYPES,
  isSameActorRoleTransferHost
} from "./actor-role-transfer.service.js";
import {
  EMPTY_ACTOR_REFERENCE,
  VEHICLE_ROLE_KEYS,
  doesVehicleRoleSourceMatchActor,
  getVehicleDriverReference,
  getVehiclePassengerReferenceByIndex,
  getVehiclePassengersArray
} from "./vehicle-actor.service.js";

function clampPassengerIndex(index, max) {
  const normalized = Number(index);
  if (!Number.isInteger(normalized)) return null;
  return Math.max(0, Math.min(max, normalized));
}

function isActorDocument(actor) {
  return actor?.documentName === "Actor";
}

async function assignVehicleOwnerReference(actor, ownerReference) {
  await actor.update({
    "system.owner.actor": ownerReference
  });

  return { status: "ownerAssigned" };
}

async function assignVehicleDriverFromPassengerIndex(actor, passengerIndex) {
  if (!isActorDocument(actor)) {
    return { status: "invalid" };
  }

  if (!Number.isInteger(passengerIndex)) {
    return { status: "invalid" };
  }

  const passengers = getVehiclePassengersArray(actor);
  if (passengerIndex < 0 || passengerIndex >= passengers.length) {
    return { status: "missingPassenger" };
  }

  const passengerReference = getVehiclePassengerReferenceByIndex(actor, passengerIndex);
  if (!passengerReference) {
    return { status: "missingPassenger" };
  }

  const currentDriver = getVehicleDriverReference(actor);

  if (currentDriver) {
    passengers[passengerIndex] = currentDriver;

    await actor.update({
      "system.driver.actor": passengerReference,
      "system.passengers": passengers
    });

    return {
      status: "swapped",
      driver: passengerReference
    };
  }

  passengers.splice(passengerIndex, 1);

  await actor.update({
    "system.driver.actor": passengerReference,
    "system.passengers": passengers
  });

  return {
    status: "assigned",
    driver: passengerReference
  };
}

async function moveVehicleDriverToPassengers(actor, targetIndex = null) {
  if (!isActorDocument(actor)) {
    return { status: "invalid" };
  }

  const driverReference = getVehicleDriverReference(actor);
  if (!driverReference) {
    return { status: "missingDriver" };
  }

  const passengers = getVehiclePassengersArray(actor);
  const insertIndex = clampPassengerIndex(targetIndex, passengers.length) ?? passengers.length;

  passengers.splice(insertIndex, 0, driverReference);

  await actor.update({
    "system.driver.actor": { ...EMPTY_ACTOR_REFERENCE },
    "system.passengers": passengers
  });

  return {
    status: "movedToPassengers",
    passengers
  };
}

async function swapVehicleDriverWithPassengerIndex(actor, passengerIndex) {
  if (!isActorDocument(actor)) {
    return { status: "invalid" };
  }

  if (!Number.isInteger(passengerIndex)) {
    return { status: "invalid" };
  }

  const currentDriver = getVehicleDriverReference(actor);
  if (!currentDriver) {
    return { status: "missingDriver" };
  }

  const passengers = getVehiclePassengersArray(actor);
  if (passengerIndex < 0 || passengerIndex >= passengers.length) {
    return { status: "missingPassenger" };
  }

  const passengerReference = getVehiclePassengerReferenceByIndex(actor, passengerIndex);
  if (!passengerReference) {
    return { status: "missingPassenger" };
  }

  passengers[passengerIndex] = currentDriver;

  await actor.update({
    "system.driver.actor": passengerReference,
    "system.passengers": passengers
  });

  return {
    status: "swapped",
    driver: passengerReference
  };
}

async function swapVehiclePassengersByIndex(actor, sourceIndex, targetIndex) {
  if (!isActorDocument(actor)) {
    return { status: "invalid" };
  }

  if (!Number.isInteger(sourceIndex) || !Number.isInteger(targetIndex)) {
    return { status: "invalid" };
  }

  const passengers = getVehiclePassengersArray(actor);
  if (
    sourceIndex < 0
    || sourceIndex >= passengers.length
    || targetIndex < 0
    || targetIndex >= passengers.length
  ) {
    return { status: "missingPassenger" };
  }

  if (sourceIndex === targetIndex) {
    return { status: "noop" };
  }

  const sourceReference = passengers[sourceIndex];
  const targetReference = passengers[targetIndex];

  passengers[sourceIndex] = targetReference;
  passengers[targetIndex] = sourceReference;

  await actor.update({
    "system.passengers": passengers
  });

  return {
    status: "reordered",
    passengers
  };
}

async function moveVehiclePassengerToEnd(actor, sourceIndex) {
  if (!isActorDocument(actor)) {
    return { status: "invalid" };
  }

  if (!Number.isInteger(sourceIndex)) {
    return { status: "invalid" };
  }

  const passengers = getVehiclePassengersArray(actor);
  if (sourceIndex < 0 || sourceIndex >= passengers.length) {
    return { status: "missingPassenger" };
  }

  if (sourceIndex === passengers.length - 1) {
    return { status: "noop" };
  }

  const [reference] = passengers.splice(sourceIndex, 1);
  passengers.push(reference);

  await actor.update({
    "system.passengers": passengers
  });

  return {
    status: "reordered",
    passengers
  };
}

function isVehicleRoleTransferSourceValid(actor, transferData, draggedActor) {
  if (!isSameActorRoleTransferHost(transferData, actor)) return false;
  return doesVehicleRoleSourceMatchActor(actor, transferData.sourceRole, transferData.sourceIndex, draggedActor);
}

export async function transferVehicleActorRole(actor, draggedActor, transferData, target) {
  if (!isActorDocument(actor) || !isActorDocument(draggedActor)) {
    return { status: "invalid" };
  }

  if (!transferData || typeof transferData !== "object") {
    return { status: "invalid" };
  }

  if (!target || typeof target !== "object") {
    return { status: "invalid" };
  }

  if (!isVehicleRoleTransferSourceValid(actor, transferData, draggedActor)) {
    return { status: "invalidSourceActor" };
  }

  const { sourceRole, sourceType, sourceIndex } = transferData;
  const { targetRole, targetType, targetIndex } = target;

  switch (sourceRole) {
    case VEHICLE_ROLE_KEYS.DRIVER: {
      if (sourceType !== ACTOR_ROLE_TRANSFER_SOURCE_TYPES.SLOT) {
        return { status: "invalid" };
      }

      const driverReference = getVehicleDriverReference(actor);
      if (!driverReference) {
        return { status: "missingDriver" };
      }

      if (targetRole === VEHICLE_ROLE_KEYS.OWNER && targetType === ACTOR_ROLE_TRANSFER_TARGET_TYPES.SLOT) {
        return assignVehicleOwnerReference(actor, driverReference);
      }

      if (targetRole === VEHICLE_ROLE_KEYS.PASSENGERS && targetType === ACTOR_ROLE_TRANSFER_TARGET_TYPES.LIST) {
        return moveVehicleDriverToPassengers(actor);
      }

      if (targetRole === VEHICLE_ROLE_KEYS.PASSENGERS && targetType === ACTOR_ROLE_TRANSFER_TARGET_TYPES.LIST_ITEM) {
        return swapVehicleDriverWithPassengerIndex(actor, targetIndex);
      }

      return { status: "invalidTarget" };
    }

    case VEHICLE_ROLE_KEYS.PASSENGERS: {
      if (sourceType !== ACTOR_ROLE_TRANSFER_SOURCE_TYPES.LIST_ITEM) {
        return { status: "invalid" };
      }

      const passengerReference = getVehiclePassengerReferenceByIndex(actor, sourceIndex);
      if (!passengerReference) {
        return { status: "missingPassenger" };
      }

      if (targetRole === VEHICLE_ROLE_KEYS.OWNER && targetType === ACTOR_ROLE_TRANSFER_TARGET_TYPES.SLOT) {
        return assignVehicleOwnerReference(actor, passengerReference);
      }

      if (targetRole === VEHICLE_ROLE_KEYS.DRIVER && targetType === ACTOR_ROLE_TRANSFER_TARGET_TYPES.SLOT) {
        return assignVehicleDriverFromPassengerIndex(actor, sourceIndex);
      }

      if (targetRole === VEHICLE_ROLE_KEYS.PASSENGERS && targetType === ACTOR_ROLE_TRANSFER_TARGET_TYPES.LIST) {
        return moveVehiclePassengerToEnd(actor, sourceIndex);
      }

      if (targetRole === VEHICLE_ROLE_KEYS.PASSENGERS && targetType === ACTOR_ROLE_TRANSFER_TARGET_TYPES.LIST_ITEM) {
        return swapVehiclePassengersByIndex(actor, sourceIndex, targetIndex);
      }

      return { status: "invalidTarget" };
    }

    default:
      return { status: "invalidSource" };
  }
}