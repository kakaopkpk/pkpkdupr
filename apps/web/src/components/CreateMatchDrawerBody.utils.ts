import type {
  MatchTopLevelType,
  MatchType,
} from "@pkpkdupr/shared/match";
import { isSinglesMatchType } from "@pkpkdupr/shared/match";
import type { Player } from "@pkpkdupr/shared/player";

export type MatchMember = Pick<
  Player,
  "id" | "username" | "gender" | "avatarUrl"
> & {
  duprRating?: Player["duprRating"];
};
export type MatchTeams = [MatchMember[], MatchMember[]];
export type TeamIndex = 0 | 1;
export const normalizeMatchMember = (
  value:
    | Partial<
        Pick<Player, "id" | "username" | "gender" | "avatarUrl" | "duprRating">
      >
    | null
    | undefined,
): MatchMember | null => {
  if (!value?.id || (value.gender !== "M" && value.gender !== "F")) {
    return null;
  }

  return {
    id: value.id,
    username: value.username || value.id,
    gender: value.gender,
    avatarUrl: value.avatarUrl,
    duprRating: "duprRating" in value ? value.duprRating : undefined,
  };
};

export const mergeUniqueMembers = (members: MatchMember[]) => {
  const seen = new Set<string>();

  return members.filter((member) => {
    if (seen.has(member.id)) {
      return false;
    }
    seen.add(member.id);
    return true;
  });
};

export const areSameMatchMembers = (a: MatchMember[], b: MatchMember[]) =>
  a.length === b.length &&
  a.every((member, index) => {
    const target = b[index];

    return (
      !!target &&
      member.id === target.id &&
      member.username === target.username &&
      member.gender === target.gender &&
      member.avatarUrl === target.avatarUrl
    );
  });

export const areSameMatchTeams = (a: MatchTeams, b: MatchTeams) =>
  areSameMatchMembers(a[0], b[0]) && areSameMatchMembers(a[1], b[1]);

export const resolveMatchTopLevelType = (
  members: MatchMember[],
): MatchTopLevelType | null => {
  if (members.length === 2) {
    return "singles";
  }

  return members.length === 4 ? "doubles" : null;
};

export const resolveDefaultMatchType = (
  members: MatchMember[],
  topLevelType: MatchTopLevelType | null,
): MatchType | null => {
  if (!topLevelType) {
    return null;
  }

  if (topLevelType === "singles") {
    return "singles";
  }

  const menCount = members.filter((member) => member.gender === "M").length;
  const womenCount = members.filter((member) => member.gender === "F").length;

  if (menCount === 2 && womenCount === 2) {
    return "mixed-doubles";
  }

  if (menCount === 4) {
    return "men-doubles";
  }

  if (womenCount === 4) {
    return "women-doubles";
  }

  return "unrestricted-doubles";
};

export const resolveSelectedMatchType = (members: MatchMember[]) =>
  resolveDefaultMatchType(members, resolveMatchTopLevelType(members));

export const createEmptyTeams = (): MatchTeams => [[], []];

export const buildPreviewTeams = (
  members: MatchMember[],
  teams: MatchTeams,
  matchType: MatchType | null,
): MatchTeams => {
  if (matchType) {
    return teams;
  }

  if (members.length <= 1) {
    return [
      [members[0]].filter((member): member is MatchMember => !!member),
      [],
    ];
  }

  if (members.length === 2) {
    return [
      [members[0]].filter((member): member is MatchMember => !!member),
      [members[1]].filter((member): member is MatchMember => !!member),
    ];
  }

  return [
    [members[0], members[1]].filter((member): member is MatchMember => !!member),
    [members[2], members[3]].filter((member): member is MatchMember => !!member),
  ];
};

export const getPreviewTeamSlotCount = (
  members: MatchMember[],
  matchType: MatchType | null,
) => {
  if (matchType) {
    return isSinglesMatchType(matchType) ? 1 : 2;
  }

  return members.length >= 3 ? 2 : 1;
};

export const buildInitialTeams = (
  members: MatchMember[],
  matchType: MatchType | null,
): MatchTeams => {
  if (!matchType) {
    return createEmptyTeams();
  }

  if (matchType === "singles") {
    return [[members[0]], [members[1]]];
  }

  if (matchType === "mixed-doubles") {
    const men = members.filter((member) => member.gender === "M");
    const women = members.filter((member) => member.gender === "F");

    if (men.length !== 2 || women.length !== 2) {
      return [
        [members[0], members[1]].filter(Boolean),
        [members[2], members[3]].filter(Boolean),
      ] as MatchTeams;
    }

    return [
      [men[0], women[0]],
      [men[1], women[1]],
    ];
  }

  return [
    [members[0], members[1]],
    [members[2], members[3]],
  ];
};

const isMixedDoublesTeamValid = (team: MatchMember[]) =>
  team.length === 2 &&
  team.some((member) => member.gender === "M") &&
  team.some((member) => member.gender === "F");

export const areTeamsValid = (teams: MatchTeams, matchType: MatchType | null) => {
  if (!matchType) {
    return false;
  }

  if (isSinglesMatchType(matchType)) {
    return teams[0].length === 1 && teams[1].length === 1;
  }

  if (matchType === "mixed-doubles") {
    return teams.every(isMixedDoublesTeamValid);
  }

  if (matchType === "men-doubles") {
    return teams.every(
      (team) =>
        team.length === 2 && team.every((member) => member.gender === "M"),
    );
  }

  if (matchType === "women-doubles") {
    return teams.every(
      (team) =>
        team.length === 2 && team.every((member) => member.gender === "F"),
    );
  }

  return teams.every((team) => team.length === 2);
};

const findMemberTeamIndex = (
  teams: MatchTeams,
  memberId: string,
): TeamIndex | null => {
  if (teams[0].some((member) => member.id === memberId)) {
    return 0;
  }

  if (teams[1].some((member) => member.id === memberId)) {
    return 1;
  }

  return null;
};

const findTeamMember = (teams: MatchTeams, memberId: string) =>
  teams.flat().find((member) => member.id === memberId) ?? null;

export const canSwapMembers = (
  teams: MatchTeams,
  matchType: MatchType | null,
  sourceMemberId: string | null,
  targetMember: MatchMember,
) => {
  if (!matchType || !sourceMemberId) {
    return false;
  }

  const sourceTeamIndex = findMemberTeamIndex(teams, sourceMemberId);
  const targetTeamIndex = findMemberTeamIndex(teams, targetMember.id);
  const sourceMember = findTeamMember(teams, sourceMemberId);

  if (
    sourceTeamIndex === null ||
    targetTeamIndex === null ||
    !sourceMember ||
    sourceTeamIndex === targetTeamIndex ||
    sourceMember.id === targetMember.id
  ) {
    return false;
  }

  if (matchType === "mixed-doubles") {
    return sourceMember.gender === targetMember.gender;
  }

  return true;
};
