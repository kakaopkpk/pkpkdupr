import { createSessionReportShareImage } from "@/components/records/sessionReportShareImage";
import {
  type PreparedShareImageState,
  type ShareImageSource,
  usePreparedShareImage,
} from "@/hooks/usePreparedShareImage";
import {
  getSessionReportShareKey,
  getSessionReportShareText,
  type SessionReportShareTarget,
} from "@/lib/sessionReportShare";

const SESSION_REPORT_SHARE_SOURCE: ShareImageSource<SessionReportShareTarget> = {
  getKey: getSessionReportShareKey,
  create: createSessionReportShareImage,
  getText: getSessionReportShareText,
};

/**
 * 세션 리포트 공유 이미지(세션 요약·내 기록). 공유 시트를 열 때 미리 만들어 두고 누르면 공유한다.
 * target이 null이면 만들지 않는다
 */
export function useSessionReportShare(
  target: SessionReportShareTarget | null,
): PreparedShareImageState {
  return usePreparedShareImage(target, SESSION_REPORT_SHARE_SOURCE);
}
