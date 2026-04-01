export function isActorReference(reference) {
  if (!reference || typeof reference !== "object") return false;

  return [
    typeof reference.uuid === "string",
    typeof reference.id === "string",
    typeof reference.name === "string",
    typeof reference.img === "string",
    typeof reference.type === "string"
  ].every(Boolean);
}

function isActorReferenceLike(reference) {
  if (!reference || typeof reference !== "object") return false;

  const uuid = typeof reference.uuid === "string" ? reference.uuid.trim() : "";
  const id = typeof reference.id === "string" ? reference.id.trim() : "";
  return uuid.length > 0 || id.length > 0;
}

export function createActorReference(actor) {
  if (!actor || actor.documentName !== "Actor") {
    throw new Error("createActorReference expected an Actor document.");
  }

  return {
    uuid: actor.uuid ?? "",
    id: actor.id ?? "",
    name: actor.name ?? "",
    img: actor.img ?? "",
    type: actor.type ?? ""
  };
}

export function isSameActorReference(left, right) {
  if (!isActorReferenceLike(left) || !isActorReferenceLike(right)) return false;

  const leftUuid = typeof left.uuid === "string" ? left.uuid.trim() : "";
  const rightUuid = typeof right.uuid === "string" ? right.uuid.trim() : "";
  if (leftUuid && rightUuid) return leftUuid === rightUuid;

  const leftId = typeof left.id === "string" ? left.id.trim() : "";
  const rightId = typeof right.id === "string" ? right.id.trim() : "";
  if (leftId && rightId) return leftId === rightId;

  return false;
}

export async function resolveActorReference(reference) {
  if (!isActorReferenceLike(reference)) return null;

  if (reference.uuid) {
    try {
      const document = await fromUuid(reference.uuid);
      if (document?.documentName === "Actor") return document;
    } catch (_error) {
      // Fallback below.
    }
  }

  if (reference.id) {
    return game.actors?.get(reference.id) ?? null;
  }

  return null;
}

export async function openActorReference(reference) {
  const actor = await resolveActorReference(reference);
  if (!actor?.sheet) return null;

  actor.sheet.render(true, { focus: true });
  return actor;
}

export function getActorTypeLabel(type) {
  if (!type || typeof type !== "string") return "";

  const localizationKey = `TYPES.Actor.${type}`;
  const localized = game.i18n.localize(localizationKey);

  if (localized !== localizationKey) return localized;
  return type;
}