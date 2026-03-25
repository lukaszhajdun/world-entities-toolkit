import {
  getActorTypeLabel,
  resolveActorReference
} from "./actor-ref.service.js";

export async function prepareGroupMembers(actor) {
  const members = Array.isArray(actor?.system?.members) ? actor.system.members : [];

  return Promise.all(
    members.map(async (member, index) => {
      const resolved = await resolveActorReference(member);

      return {
        index,
        uuid: member?.uuid ?? "",
        id: member?.id ?? "",
        name: resolved?.name ?? member?.name ?? game.i18n.localize("WET.Group.Members.UnknownName"),
        img: resolved?.img ?? member?.img ?? "icons/svg/mystery-man.svg",
        type: resolved?.type ?? member?.type ?? "",
        typeLabel: getActorTypeLabel(resolved?.type ?? member?.type ?? ""),
        exists: Boolean(resolved)
      };
    })
  );
}

export async function removeGroupMemberByIndex(actor, memberIndex) {
  const members = Array.isArray(actor?.system?.members) ? [...actor.system.members] : [];
  if (!Number.isInteger(memberIndex)) return;
  if (memberIndex < 0 || memberIndex >= members.length) return;

  members.splice(memberIndex, 1);
  await actor.update({ "system.members": members });
}