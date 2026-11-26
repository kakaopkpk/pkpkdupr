import { useEffect, useState } from "react";
import type { SpecialMatch } from "@pkpkdupr/shared/specialMatch";
import { fetchSpecialMatchPreview } from "@/lib/matchSessions";

/**
 * 기록 시트에서 자리가 다 찬 팀 구성의 특수 매치 미리보기. teams가 null(자리가 덜 참)이면 묻지 않는다.
 * 팀 구성·세션이 같으면 다시 묻지 않고, 응답 전·실패면 null이다. 저장할 때 서버가 다시 판정하므로 실패를 알리지 않는다.
 */
export const useSpecialMatchPreview = (
  teams: readonly [readonly string[], readonly string[]] | null,
  sessionId: string | undefined,
): SpecialMatch | null => {
  const key = teams
    ? `${teams.map((team) => team.join(",")).join("|")}|${sessionId ?? ""}`
    : null;
  const [preview, setPreview] = useState<{
    key: string;
    specialMatch: SpecialMatch | null;
  } | null>(null);

  useEffect(() => {
    if (!key || !teams) return;
    let isCurrent = true;
    fetchSpecialMatchPreview(teams, sessionId)
      .catch(() => null)
      .then((specialMatch) => {
        if (isCurrent) setPreview({ key, specialMatch });
      });
    return () => {
      isCurrent = false;
    };
    // teams는 key가 같으면 같은 구성이라 key만 본다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return preview && preview.key === key ? preview.specialMatch : null;
};
