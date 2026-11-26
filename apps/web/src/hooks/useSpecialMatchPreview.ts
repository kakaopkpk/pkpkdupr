import { useEffect, useState } from "react";
import type {
  SpecialMatch,
  SpecialMatchPreviewResponse,
} from "@pkpkdupr/shared/specialMatch";
import { apiFetch } from "@/lib/api";

/** 미리보기 요청 키. 팀 구성·세션이 같으면 다시 묻지 않는다 */
const toPreviewKey = (
  teams: readonly (readonly string[])[],
  sessionId: string | undefined,
) => `${teams.map((team) => team.join(",")).join("|")}|${sessionId ?? ""}`;

const fetchSpecialMatchPreview = async (
  teams: readonly [readonly string[], readonly string[]],
  sessionId: string | undefined,
): Promise<SpecialMatch | null> => {
  const params = new URLSearchParams({
    teamA: teams[0].join(","),
    teamB: teams[1].join(","),
  });
  if (sessionId) params.set("sessionId", sessionId);
  const res = await apiFetch(`/api/special-match-preview?${params}`);
  if (!res.ok) throw new Error(`GET /api/special-match-preview ${res.status}`);
  return ((await res.json()) as SpecialMatchPreviewResponse).specialMatch;
};

/**
 * 기록 시트에서 자리가 다 찬 팀 구성의 특수 매치 미리보기. teams가 null(자리가 덜 참)이면 묻지 않는다.
 * 응답 전·실패면 null이고, 저장할 때 서버가 다시 판정하므로 실패를 알리지 않는다.
 */
export const useSpecialMatchPreview = (
  teams: readonly [readonly string[], readonly string[]] | null,
  sessionId: string | undefined,
): SpecialMatch | null => {
  const key = teams ? toPreviewKey(teams, sessionId) : null;
  const [preview, setPreview] = useState<{
    key: string;
    specialMatch: SpecialMatch | null;
  } | null>(null);

  useEffect(() => {
    if (!key || !teams) return;
    let isCurrent = true;
    fetchSpecialMatchPreview(teams, sessionId)
      .then((specialMatch) => {
        if (isCurrent) setPreview({ key, specialMatch });
      })
      .catch(() => {
        if (isCurrent) setPreview({ key, specialMatch: null });
      });
    return () => {
      isCurrent = false;
    };
    // teams는 key가 같으면 같은 구성이라 key만 본다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return preview && preview.key === key ? preview.specialMatch : null;
};
