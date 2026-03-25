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

export function createActorReference(actor) {
  if (!(actor instanceof Actor)) {
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

export async function resolveActorReference(reference) {
  if (!isActorReference(reference)) return null;

  if (reference.uuid) {
    try {
      const document = await fromUuid(reference.uuid);
      if (document instanceof Actor) return document;
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