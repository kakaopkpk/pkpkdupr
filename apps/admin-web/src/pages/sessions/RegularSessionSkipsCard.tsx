import React, { useEffect, useId, useState } from "react";
import type { ManagedMatchSession } from "@pkpkdupr/shared/match";
import {
  getKstWeekday,
  REGULAR_SESSION_WEEKDAYS,
  type AdminRegularSessionSkip,
} from "@pkpkdupr/shared/session";
import { addRegularSessionSkip, revertRegularSessionSkip } from "../../api/sessions";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Chip } from "../../components/ui/Chip";
import { Dialog } from "../../components/ui/Dialog";
import { InlineError } from "../../components/ui/InlineError";
import { TextInput } from "../../components/ui/TextInput";
import { useToast } from "../../components/ui/Toast";
import {
  formatShortDateWithWeekday,
  formatWeekdaySuffix,
  getSessionDateKey,
} from "./sessionDates";
import { reportMutationError } from "./sessionErrors";

const AddSkipDialog: React.FC<{
  open: boolean;
  todayKey: string;
  sessions: ManagedMatchSession[];
  onClose: () => void;
  onAdded: () => void;
}> = ({ open, todayKey, sessions, onClose, onAdded }) => {
  const { showToast } = useToast();
  const inputId = useId();
  const [dateKey, setDateKey] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDateKey("");
      setPending(false);
      setError(null);
    }
  }, [open]);

  const dateError = !dateKey
    ? null
    : dateKey < todayKey
      ? "오늘이나 이후 날짜만 고를 수 있어요"
      : !REGULAR_SESSION_WEEKDAYS.includes(getKstWeekday(dateKey))
        ? "정기 세션 요일(월·목)만 고를 수 있어요"
        : null;
  const regularSession =
    dateKey && !dateError
      ? sessions.find(
          (session) =>
            session.kind === "regular" && getSessionDateKey(session) === dateKey,
        )
      : undefined;
  const canSubmit = !!dateKey && !dateError && !pending;

  const handleConfirm = async () => {
    if (!canSubmit) return;
    setPending(true);
    setError(null);
    try {
      await addRegularSessionSkip(dateKey);
      showToast(`${formatShortDateWithWeekday(dateKey)} 쉬는 날을 추가했어요`);
      onAdded();
      onClose();
    } catch (err) {
      reportMutationError(err, setError, showToast);
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      title="쉬는 날 추가"
      onClose={onClose}
      dismissDisabled={pending}
      footer={
        <>
          <Button variant="soft" disabled={pending} onClick={onClose}>
            취소
          </Button>
          <Button disabled={!canSubmit} onClick={() => void handleConfirm()}>
            {pending ? "처리 중…" : "쉬는 날로 정하기"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label htmlFor={inputId} className="mb-1.5 block text-pk-13 font-bold text-pk-sub">
            날짜
          </label>
          <div className="flex items-center gap-2">
            <TextInput
              id={inputId}
              type="date"
              min={todayKey}
              value={dateKey}
              disabled={pending}
              onChange={(event) => {
                setDateKey(event.target.value);
                setError(null);
              }}
              className="flex-1"
            />
            {dateKey && (
              <span className="shrink-0 text-pk-15 font-semibold text-pk-sub">
                {formatWeekdaySuffix(dateKey)}
              </span>
            )}
          </div>
          {dateError && (
            <p className="mt-1.5 text-pk-13 font-semibold text-pk-down">{dateError}</p>
          )}
        </div>
        <p className="text-pk-13 text-pk-sub">
          {regularSession
            ? `그날 정기 세션(참여 신청 ${regularSession.participantIds.length}명)이 지워지고 구글 캘린더 일정도 지워져요.`
            : "그날 정기 세션이 이미 있으면 참여 신청과 함께 지워져요."}{" "}
          경기가 있는 날은 쉬는 날로 정할 수 없어요.
        </p>
        <InlineError message={error} />
      </div>
    </Dialog>
  );
};

/** 정기 세션 쉬는 날(취소·공휴일) 목록. 날짜 내림차순 */
export const RegularSessionSkipsCard: React.FC<{
  skips: AdminRegularSessionSkip[];
  loadError: string | null;
  todayKey: string;
  sessions: ManagedMatchSession[];
  onChanged: () => void;
}> = ({ skips, loadError, todayKey, sessions, onChanged }) => {
  const { showToast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [revertingDateKey, setRevertingDateKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRevert = async (dateKey: string) => {
    setRevertingDateKey(dateKey);
    setError(null);
    try {
      const { session } = await revertRegularSessionSkip(dateKey);
      const label = formatShortDateWithWeekday(dateKey);
      showToast(
        session
          ? `${label}요 정기운동을 다시 만들었어요`
          : `${label} 쉬는 날을 되돌렸어요`,
      );
      onChanged();
    } catch (err) {
      reportMutationError(err, setError, showToast);
    } finally {
      setRevertingDateKey(null);
    }
  };

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-pk-17 font-bold text-pk-ink">정기 세션 쉬는 날</h2>
          <p className="mt-1 text-pk-13 text-pk-sub">
            이 날짜에는 월·목 정기 세션을 만들지 않아요. 공휴일은 매일 새벽 구글
            공휴일 캘린더에서 가져와요.
          </p>
        </div>
        <Button variant="soft" size="sm" onClick={() => setAddOpen(true)}>
          + 쉬는 날 추가
        </Button>
      </div>

      <div className="mt-3">
        <InlineError message={error ?? loadError} />
      </div>

      {skips.length === 0 && !loadError ? (
        <p className="mt-2 text-pk-13 text-pk-muted">쉬는 날이 없어요.</p>
      ) : (
        <ul className="mt-2 divide-y divide-pk-divider">
          {skips.map((skip) => {
            const canceled = skip.reason === "canceled";
            const revertable = canceled && skip.dateKey >= todayKey;
            return (
              <li key={skip.dateKey} className="flex items-center gap-3 py-3">
                <Chip
                  className={canceled ? "bg-pk-primary-soft text-pk-primary" : undefined}
                >
                  {canceled ? "취소" : "공휴일"}
                </Chip>
                <span className="w-16 shrink-0 text-pk-15 font-bold text-pk-ink tabular-nums">
                  {formatShortDateWithWeekday(skip.dateKey)}
                </span>
                <span className="min-w-0 flex-1 text-pk-13 text-pk-sub">
                  {canceled
                    ? "되돌리면 그 자리에서 정기 세션을 다시 만들어요. 지워진 참여 신청은 돌아오지 않아요."
                    : "자동으로 가져온 날이라 되돌릴 수 없어요. 그날 운동하려면 회원 세션을 만들어요."}
                </span>
                {revertable && (
                  <Button
                    variant="soft"
                    size="sm"
                    disabled={revertingDateKey !== null}
                    onClick={() => void handleRevert(skip.dateKey)}
                  >
                    {revertingDateKey === skip.dateKey ? "처리 중…" : "되돌리기"}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <AddSkipDialog
        open={addOpen}
        todayKey={todayKey}
        sessions={sessions}
        onClose={() => setAddOpen(false)}
        onAdded={onChanged}
      />
    </Card>
  );
};
