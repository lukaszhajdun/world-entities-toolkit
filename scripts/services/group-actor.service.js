import {
  createActorReference,
  getActorTypeLabel,
  isSameActorReference,
  resolveActorReference
} from "./actor-ref.service.js";

function getGroupMembersArray(actor) {
  return Array.isArray(actor?.system?.members) ? [...actor.system.members] : [];
}

export async function prepareGroupMembers(actor) {
  const members = getGroupMembersArray(actor);

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

export function hasGroupMember(actor, candidateActor) {
  if (!candidateActor || candidateActor.documentName !== "Actor") return false;

  const candidateReference = createActorReference(candidateActor);
  const members = getGroupMembersArray(actor);

  return members.some(member => isSameActorReference(member, candidateReference));
}

export async function addGroupMember(actor, candidateActor) {
  if (!actor || actor.documentName !== "Actor") {
    return { status: "invalid" };
  }

  if (!candidateActor || candidateActor.documentName !== "Actor") {
    return { status: "invalid" };
  }

  if (actor.id === candidateActor.id) {
    return { status: "self" };
  }

  if (hasGroupMember(actor, candidateActor)) {
    return { status: "duplicate" };
  }

  const members = getGroupMembersArray(actor);
  members.push(createActorReference(candidateActor));

  await actor.update({ "system.members": members });

  return {
    status: "added",
    member: candidateActor
  };
}

export async function removeGroupMemberByIndex(actor, memberIndex) {
  const members = getGroupMembersArray(actor);
  if (!Number.isInteger(memberIndex)) return;
  if (memberIndex < 0 || memberIndex >= members.length) return;

  members.splice(memberIndex, 1);
  await actor.update({ "system.members": members });
}