import React, { useEffect, useId, useState } from "react";
import type { ManagedMatchSession } from "@pkpkdupr/shared/match";
import {
  isValidSessionTimeRange,
  MATCH_SESSION_LOCATION_MAX_LENGTH,
  MATCH_SESSION_NAME_MAX_LENGTH,
  REGULAR_SESSION_LOCATION,
  type AdminUpdateMatchSessionRequest,
  type CreateMatchSessionRequest,
} from "@pkpkdupr/shared/session";
import { createSession, updateSession } from "../../api/sessions";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { InlineError } from "../../components/ui/InlineError";
import { TextInput } from "../../components/ui/TextInput";
import { useToast } from "../../components/ui/Toast";
import { formatWeekdaySuffix, getSessionDateKey } from "./sessionDates";
import { reportMutationError } from "./sessionErrors";

interface FormValues {
  name: string;
  dateKey: string;
  startTime: string;
  endTime: string;
  location: string;
}

/** 시간 입력 칸 오류. 둘 다 비었거나 서로 다른 두 시각이면 null */
const getTimeError = (startTime: string, endTime: string): string | null => {
  if (!startTime && !endTime) return null;
  if (!startTime || !endTime) return "시작과 종료 시각을 함께 넣거나 함께 비워 주세요";
  if (!isValidSessionTimeRange(startTime, endTime)) {
    return "시작과 종료 시각이 같을 수 없어요";
  }
  return null;
};

const FieldLabel: React.FC<{ htmlFor?: string; children: React.ReactNode }> = ({
  htmlFor,
  children,
}) => (
  <label htmlFor={htmlFor} className="mb-1.5 block text-pk-13 font-bold text-pk-sub">
    {children}
  </label>
);

export type SessionFormDialogMode =
  | { kind: "create"; dateKey: string }
  | { kind: "edit"; session: ManagedMatchSession };

/**
 * 세션 만들기·회원 세션 수정 대화상자. 만들기는 회원과 같은 규칙(`createSession`)이고,
 * 수정은 바뀐 필드만 `updateSession`으로 보낸다. 경기가 있는 세션은 날짜를 바꿀 수 없다.
 */
export const SessionFormDialog: React.FC<{
  mode: SessionFormDialogMode | null;
  todayKey: string;
  onClose: () => void;
  onSaved: (sessionId: string, dateKey: string) => void;
}> = ({ mode, todayKey, onClose, onSaved }) => {
  const { showToast } = useToast();
  const fieldId = useId();
  const [values, setValues] = useState<FormValues>({
    name: "",
    dateKey: todayKey,
    startTime: "",
    endTime: "",
    location: REGULAR_SESSION_LOCATION,
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mode) return;
    setPending(false);
    setError(null);
    setValues(
      mode.kind === "create"
        ? {
            name: "",
            dateKey: mode.dateKey,
            startTime: "",
            endTime: "",
            location: REGULAR_SESSION_LOCATION,
          }
        : {
            name: mode.session.name,
            dateKey: getSessionDateKey(mode.session),
            startTime: mode.session.startTime ?? "",
            endTime: mode.session.endTime ?? "",
            location: mode.session.location,
          },
    );
  }, [mode]);

  const editingSession = mode?.kind === "edit" ? mode.session : null;
  const dateLocked = !!editingSession && editingSession.matchCount > 0;
  const name = values.name.trim();
  const location = values.location.trim();
  const timeError = getTimeError(values.startTime, values.endTime);
  const dateError =
    !values.dateKey
      ? "날짜를 골라 주세요"
      : !dateLocked && values.dateKey < todayKey
        ? "오늘이나 이후 날짜만 고를 수 있어요"
        : null;
  const canSubmit = !!name && !!location && !timeError && !dateError && !pending;

  const update = (patch: Partial<FormValues>) => {
    setValues((current) => ({ ...current, ...patch }));
    setError(null);
  };

  const submitCreate = async () => {
    const body: CreateMatchSessionRequest = {
      name,
      location,
      dateKey: values.dateKey,
      ...(values.startTime && values.endTime
        ? { startTime: values.startTime, endTime: values.endTime }
        : {}),
    };
    const created = await createSession(body);
    showToast(`'${created.name}' 세션을 만들었어요`);
    onSaved(created.id, created.dateKey);
  };

  const submitEdit = async (session: ManagedMatchSession) => {
    const body: AdminUpdateMatchSessionRequest = {};
    if (name !== session.name) body.name = name;
    if (location !== session.location) body.location = location;
    const currentDateKey = getSessionDateKey(session);
    if (!dateLocked && values.dateKey !== currentDateKey) body.dateKey = values.dateKey;
    const startTime = values.startTime || null;
    const endTime = values.endTime || null;
    if (startTime !== session.startTime || endTime !== session.endTime) {
      body.startTime = startTime;
      body.endTime = endTime;
    }
    if (Object.keys(body).length === 0) {
      onClose();
      return;
    }
    const updated = await updateSession(session.id, body);
    showToast(`'${updated.name}' 세션을 고쳤어요`);
    onSaved(updated.id, getSessionDateKey(updated));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || !mode) return;
    setPending(true);
    setError(null);
    try {
      if (mode.kind === "create") await submitCreate();
      else await submitEdit(mode.session);
    } catch (err) {
      reportMutationError(err, setError, showToast);
      setPending(false);
    }
  };

  const formId = `${fieldId}-form`;

  return (
    <Dialog
      open={!!mode}
      title={mode?.kind === "edit" ? "세션 수정" : "세션 만들기"}
      onClose={onClose}
      dismissDisabled={pending}
      width={480}
      footer={
        <>
          <Button variant="soft" disabled={pending} onClick={onClose}>
            취소
          </Button>
          <Button type="submit" form={formId} disabled={!canSubmit}>
            {pending ? "저장 중…" : mode?.kind === "edit" ? "저장" : "만들기"}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
        <div>
          <FieldLabel htmlFor={`${fieldId}-name`}>이름</FieldLabel>
          <TextInput
            id={`${fieldId}-name`}
            value={values.name}
            maxLength={MATCH_SESSION_NAME_MAX_LENGTH}
            placeholder="예: 주말 번개"
            onChange={(event) => update({ name: event.target.value })}
          />
        </div>

        <div>
          <FieldLabel htmlFor={`${fieldId}-date`}>날짜</FieldLabel>
          <div className="flex items-center gap-2">
            <TextInput
              id={`${fieldId}-date`}
              type="date"
              value={values.dateKey}
              min={dateLocked ? undefined : todayKey}
              disabled={dateLocked || pending}
              onChange={(event) => update({ dateKey: event.target.value })}
              className="flex-1"
            />
            {values.dateKey && (
              <span className="shrink-0 text-pk-15 font-semibold text-pk-sub">
                {formatWeekdaySuffix(values.dateKey)}
              </span>
            )}
          </div>
          {dateLocked && (
            <p className="mt-1.5 text-pk-13 text-pk-muted">
              경기가 있어 날짜는 바꿀 수 없어요
            </p>
          )}
          {dateError && values.dateKey && (
            <p className="mt-1.5 text-pk-13 font-semibold text-pk-down">{dateError}</p>
          )}
        </div>

        <div>
          <FieldLabel>시간 (선택)</FieldLabel>
          <div className="flex items-center gap-2">
            <TextInput
              type="time"
              aria-label="시작 시각"
              value={values.startTime}
              disabled={pending}
              onChange={(event) => update({ startTime: event.target.value })}
            />
            <span aria-hidden="true" className="text-pk-15 text-pk-muted">
              ~
            </span>
            <TextInput
              type="time"
              aria-label="종료 시각"
              value={values.endTime}
              disabled={pending}
              onChange={(event) => update({ endTime: event.target.value })}
            />
          </div>
          <p className="mt-1.5 text-pk-13 text-pk-muted">
            종료가 시작보다 이르면 다음 날 끝나요. 시간을 비우면 그날 하루 세션이에요.
          </p>
          {timeError && (
            <p className="mt-1 text-pk-13 font-semibold text-pk-down">{timeError}</p>
          )}
        </div>

        <div>
          <FieldLabel htmlFor={`${fieldId}-location`}>장소</FieldLabel>
          <TextInput
            id={`${fieldId}-location`}
            value={values.location}
            maxLength={MATCH_SESSION_LOCATION_MAX_LENGTH}
            onChange={(event) => update({ location: event.target.value })}
          />
        </div>

        <InlineError message={error} />
      </form>
    </Dialog>
  );
};
