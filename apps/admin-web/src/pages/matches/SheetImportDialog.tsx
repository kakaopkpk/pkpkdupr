import React, { useMemo, useState } from "react";
import type { MatchType } from "@pkpkdupr/shared/match";
import type { AdminPlayer } from "@pkpkdupr/shared/player";
import { DEFAULT_MATCH_LOCATION } from "@pkpkdupr/shared/session";
import { createAdminMatches } from "../../api/matches";
import { isClientError } from "../../api/client";
import { Button } from "../../components/ui/Button";
import { Chip } from "../../components/ui/Chip";
import { cx } from "../../components/ui/cx";
import { Dialog } from "../../components/ui/Dialog";
import { InlineError } from "../../components/ui/InlineError";
import { textInputClassName } from "../../components/ui/TextInput";
import { useToast } from "../../components/ui/Toast";
import type { SessionOption } from "./sessionOptions";
import {
  buildImportedPreview,
  DEFAULT_IMPORT_TIME,
  REQUIRED_IMPORT_HEADERS,
} from "./sheetImport";

const NO_SESSION_VALUE = "";

const MATCH_TYPE_LABELS: Partial<Record<MatchType, string>> = {
  "mixed-doubles": "혼합 복식",
  "men-doubles": "남자 복식",
  "women-doubles": "여자 복식",
  "unrestricted-doubles": "복식",
};

const headerCellClassName = "px-3 pb-3 text-left text-pk-12 font-semibold text-pk-sub";
const cellClassName = "p-3 align-top";

/** 시트에서 복사한 표로 경기를 한꺼번에 넣는 대화상자. 열 때마다 새로 마운트한다 */
export const SheetImportDialog: React.FC<{
  players: AdminPlayer[];
  sessionOptions: SessionOption[];
  onClose: () => void;
  /** 넣은 뒤 목록을 다시 읽는다 */
  onCreated: () => void;
}> = ({ players, sessionOptions, onClose, onCreated }) => {
  const { showToast } = useToast();
  const [sessionId, setSessionId] = useState(NO_SESSION_VALUE);
  const [pastedText, setPastedText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const session = sessionOptions.find((option) => option.id === sessionId);
  const location = session?.location || DEFAULT_MATCH_LOCATION;
  const preview = useMemo(
    () => buildImportedPreview(pastedText, players, location),
    [pastedText, players, location],
  );

  const blockedReason = !preview
    ? "시트에서 복사한 표를 붙여 넣어 주세요."
    : preview.headerIssues.length > 0
      ? preview.headerIssues[0]
      : preview.rows.length === 0
        ? "넣을 경기 줄이 없어요."
        : preview.errorCount > 0
          ? "오류가 있는 줄을 모두 고친 뒤 넣어 주세요."
          : null;

  const handleSubmit = async () => {
    if (blockedReason || !preview) return;
    setSaving(true);
    setError(null);
    try {
      const result = await createAdminMatches({
        ...(session && { sessionId: session.id }),
        matches: preview.validMatches,
      });
      showToast(
        `${result.createdCount}경기를 넣었어요 · 평점이 바뀐 회원 ${result.changedPlayerCount}명`,
      );
    } catch (err) {
      if (isClientError(err)) {
        setError(err.message);
      } else {
        showToast(err instanceof Error ? err.message : "경기를 넣지 못했어요.");
      }
      setSaving(false);
      return;
    }
    onClose();
    onCreated();
  };

  return (
    <Dialog
      open
      title="시트로 한꺼번에 넣기"
      width={1080}
      onClose={onClose}
      dismissDisabled={saving}
      footer={
        <>
          <Button variant="ghost" disabled={saving} onClick={onClose}>
            닫기
          </Button>
          <Button
            disabled={Boolean(blockedReason) || saving}
            onClick={() => void handleSubmit()}
          >
            {saving
              ? "넣는 중…"
              : `${preview?.validMatches.length ?? 0}경기 넣기`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block space-y-2">
          <span className="block text-pk-12 font-bold text-pk-muted">세션(선택)</span>
          <select
            value={sessionId}
            disabled={saving}
            onChange={(event) => setSessionId(event.target.value)}
            className={cx(textInputClassName, "w-80 cursor-pointer")}
          >
            <option value={NO_SESSION_VALUE}>세션 없음</option>
            {sessionOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <span className="block text-pk-12 text-pk-muted">
            고르면 모든 경기를 그 세션에 넣고 선수들을 참여자로 넣어요. 장소는 세션 장소,
            세션이 없으면 {DEFAULT_MATCH_LOCATION}예요.
          </span>
        </label>

        <label className="block space-y-2">
          <span className="block text-pk-12 font-bold text-pk-muted">시트 표 붙여 넣기</span>
          <textarea
            value={pastedText}
            disabled={saving}
            onChange={(event) => {
              setPastedText(event.target.value);
              setError(null);
            }}
            rows={8}
            placeholder="구글 시트에서 머리 줄까지 복사한 표를 그대로 붙여 넣어요."
            className={cx(textInputClassName, "h-auto py-3 font-mono text-pk-13")}
          />
          <span className="block text-pk-12 text-pk-muted">
            필수 머리: {REQUIRED_IMPORT_HEADERS.join(" · ")}
            <br />
            선택 머리: 시간(HH:mm, 없으면 {DEFAULT_IMPORT_TIME}) · 코트명
          </span>
        </label>

        {preview && (
          <section aria-label="미리보기" className="space-y-3">
            <p className="text-pk-13 font-semibold text-pk-sub">
              {preview.rows.length}줄 · 넣을 수 있는 경기 {preview.validMatches.length} · 오류{" "}
              {preview.errorCount}
            </p>
            {preview.headerIssues.length > 0 && (
              <div className="space-y-1">
                {preview.headerIssues.map((issue) => (
                  <InlineError key={issue} message={issue} />
                ))}
              </div>
            )}
            {preview.rows.length > 0 && (
              <div className="overflow-x-auto rounded-pk-sm bg-pk-bg p-3">
                <table className="w-full min-w-[880px] text-pk-13 text-pk-ink">
                  <thead>
                    <tr className="border-b border-pk-divider">
                      <th className={headerCellClassName}>줄</th>
                      <th className={headerCellClassName}>경기번호</th>
                      <th className={headerCellClassName}>날짜</th>
                      <th className={headerCellClassName}>시간</th>
                      <th className={headerCellClassName}>코트명</th>
                      <th className={headerCellClassName}>선수</th>
                      <th className={headerCellClassName}>분류</th>
                      <th className={headerCellClassName}>점수</th>
                      <th className={headerCellClassName}>상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row) => (
                      <tr
                        key={row.sourceRowNumber}
                        className="border-b border-pk-divider last:border-b-0"
                      >
                        <td className={cx(cellClassName, "tabular-nums text-pk-muted")}>
                          {row.sourceRowNumber}
                        </td>
                        <td className={cellClassName}>{row.matchNumber || "–"}</td>
                        <td className={cellClassName}>{row.dateLabel || "–"}</td>
                        <td className={cx(cellClassName, "tabular-nums")}>
                          {row.timeLabel || DEFAULT_IMPORT_TIME}
                        </td>
                        <td className={cellClassName}>{row.courtName || "–"}</td>
                        <td className={cellClassName}>
                          <div>
                            {row.usernames[0] || "–"} · {row.usernames[1] || "–"}
                          </div>
                          <div>
                            {row.usernames[2] || "–"} · {row.usernames[3] || "–"}
                          </div>
                        </td>
                        <td className={cellClassName}>
                          {(row.inferredType && MATCH_TYPE_LABELS[row.inferredType]) || "–"}
                        </td>
                        <td className={cx(cellClassName, "font-bold tabular-nums")}>
                          {row.scoreLabel}
                        </td>
                        <td className={cellClassName}>
                          {row.issues.length === 0 ? (
                            <Chip>넣을 수 있음</Chip>
                          ) : (
                            <ul className="space-y-1 text-pk-12 font-semibold text-pk-down">
                              {row.issues.map((issue) => (
                                <li key={issue}>{issue}</li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {preview && blockedReason && preview.headerIssues.length === 0 && (
          <p className="text-pk-13 font-semibold text-pk-sub">{blockedReason}</p>
        )}
        <InlineError message={error} />
      </div>
    </Dialog>
  );
};
