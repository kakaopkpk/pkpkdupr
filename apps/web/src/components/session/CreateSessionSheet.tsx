import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_MATCH_LOCATION,
  formatSessionTimeRange,
  isOvernightSessionTimeRange,
  kstDateKeyToDate,
  MATCH_SESSION_LOCATION_MAX_LENGTH,
  MATCH_SESSION_NAME_MAX_LENGTH,
  minutesToSessionTime,
  sessionTimeToMinutes,
  toKstDateKey,
} from "@pkpkdupr/shared/session";
import BottomSheet from "@/components/BottomSheet";
import { PkButton } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Form";
import { SheetTitle } from "@/components/ui/SheetTitle";
import { GLOBAL_LAYER } from "@/context/AppNavigationContext";
import { useSystemNotice } from "@/context/SystemNoticeContext";
import {
  type TabKey,
  useTabNavigation,
} from "@/context/TabNavigationContext";
import { useLayerDepth } from "@/hooks/useLayerDepth";
import { formatKstShortDate } from "@/lib/format";
import {
  createMatchSession,
  type MatchSessionDetailInfo,
} from "@/lib/matchSessions";
import { getErrorMessage, isNetworkError } from "./saveError";
import {
  AnimatedHeight,
  isPastSessionStart,
  SessionCalendar,
  SessionDurationPicker,
  SessionStartTimePicker,
  StepSummaryRow,
} from "./SessionSchedulePicker";

export interface CreateSessionSheetProps {
  isOpen: boolean;
  tabKey: TabKey;
  onClose: () => void;
  onCreated: (session: MatchSessionDetailInfo) => void;
}

const DEPTH_ID = "global-create-session-sheet";
const DAY_MS = 24 * 60 * 60 * 1000;

/** 날짜 → 시작 → 길이 → 이름·장소 순서로 하나씩 연다. fields는 이름·장소 */
const STEPS = ["date", "start", "duration", "fields"] as const;
type PickerStep = Exclude<(typeof STEPS)[number], "fields">;

/** 접힌 날짜 줄. "오늘 · 11월 14일 금" | "내일 · 11월 15일 토" | "11월 17일 월" */
const formatDateSummary = (dateKey: string, todayKey: string) => {
  const label = formatKstShortDate(kstDateKeyToDate(dateKey));
  if (dateKey === todayKey) return `오늘 · ${label}`;
  const tomorrowKey = toKstDateKey(
    new Date(kstDateKeyToDate(todayKey).getTime() + DAY_MS),
  );
  if (dateKey === tomorrowKey) return `내일 · ${label}`;
  return label;
};

/** 시작 시각과 길이로 종료 시각("HH:MM")을 구한다. 자정을 넘기면 다음 날 시각이다 */
const getEndTime = (startTime: string, durationMinutes: number) =>
  minutesToSessionTime(
    (sessionTimeToMinutes(startTime) + durationMinutes) % (24 * 60),
  );

interface CreateSessionFormProps {
  onCancel: () => void;
  onCreated: (session: MatchSessionDetailInfo) => void;
}

const CreateSessionForm: React.FC<CreateSessionFormProps> = ({
  onCancel,
  onCreated,
}) => {
  const { showSaveFailure } = useSystemNotice();
  // 시트를 여는 순간의 오늘(KST). 열 때마다 폼이 새로 마운트된다
  const [todayKey] = useState(() => toKstDateKey(new Date()));
  // 기본값 없이 시작한다. 고른 값만 칸에 칠해진다
  const [dateKey, setDateKey] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<string | null>(null);
  const [durationMinutes, setDurationMinutes] = useState<number | null>(null);
  // 지금까지 나타난 마지막 단계와 지금 펼친 단계
  const [reachedIndex, setReachedIndex] = useState(0);
  const [openStep, setOpenStep] = useState<PickerStep | null>("date");
  const [name, setName] = useState("");
  const [location, setLocation] = useState(DEFAULT_MATCH_LOCATION);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const trimmedName = name.trim();
  const trimmedLocation = location.trim();
  const endTime =
    startTime && durationMinutes ? getEndTime(startTime, durationMinutes) : null;
  const timeRangeLabel =
    startTime && endTime ? formatSessionTimeRange({ startTime, endTime }) : null;
  // 길이 칸 오른쪽 "다음 날 01:30 종료"의 시각 부분
  const endLabel =
    startTime && endTime
      ? isOvernightSessionTimeRange({ startTime, endTime })
        ? `다음 날 ${endTime}`
        : endTime
      : null;
  const isFieldsShown = reachedIndex >= STEPS.indexOf("fields");
  const canSave =
    !!dateKey &&
    !!startTime &&
    !!endTime &&
    !!trimmedName &&
    !!trimmedLocation &&
    !isSaving;

  /** 값을 고른 뒤 아직 안 고른 첫 단계를 열고, 다 골랐으면 모두 접는다 */
  const advance = (values: {
    dateKey: string | null;
    startTime: string | null;
    durationMinutes: number | null;
  }) => {
    const firstMissing = [
      values.dateKey,
      values.startTime,
      values.durationMinutes,
    ].findIndex((value) => value == null);
    const nextIndex = firstMissing < 0 ? STEPS.indexOf("fields") : firstMissing;
    setReachedIndex((reached) => Math.max(reached, nextIndex));
    setOpenStep(firstMissing < 0 ? null : (STEPS[firstMissing] as PickerStep));
    setError(null);
  };

  // 이름·장소 칸이 처음 나타나면 이름 칸으로 바로 이어 쓴다
  useEffect(() => {
    if (isFieldsShown) nameInputRef.current?.focus({ preventScroll: true });
  }, [isFieldsShown]);

  const isStartDisabled = (time: string) =>
    !!dateKey && isPastSessionStart(dateKey, time, todayKey, new Date());

  const save = useCallback(async () => {
    if (!dateKey || !startTime || !endTime) return;
    setIsSaving(true);
    setError(null);
    try {
      const session = await createMatchSession({
        name: trimmedName,
        location: trimmedLocation,
        dateKey,
        startTime,
        endTime,
      });
      // 시트가 닫힐 때까지 다시 누르지 못하게 성공 후에도 저장 중 상태를 유지한다
      onCreated(session);
    } catch (err) {
      setIsSaving(false);
      if (isNetworkError(err)) throw err;
      setError(getErrorMessage(err, "세션을 만들지 못했어요."));
    }
  }, [dateKey, endTime, onCreated, startTime, trimmedLocation, trimmedName]);

  // 토스트의 "다시 시도"는 그 시점의 입력으로 다시 저장한다
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const handleSave = async () => {
    if (!canSave) return;
    try {
      await save();
    } catch {
      showSaveFailure({ onRetry: () => saveRef.current() });
    }
  };

  // 이름·장소 두 칸이라 폼의 암묵적 제출이 일어나지 않으므로 한 줄 입력의
  // 완료/Enter를 직접 저장으로 잇는다. 한글 조합 중 Enter는 조합 확정이다
  const handleEnterToSave = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void handleSave();
  };

  const renderStep = (step: PickerStep) => {
    if (openStep === step) {
      // key가 접힌 줄과 달라 펼칠 때마다 새로 마운트되며 등장 모션이 재생된다
      const panelClassName = "animate-pk-fade-up motion-reduce:animate-none";
      if (step === "date") {
        return (
          <div key="date-open" className={panelClassName}>
            <SessionCalendar
              todayKey={todayKey}
              value={dateKey}
              onChange={(nextDateKey) => {
                setDateKey(nextDateKey);
                // 오늘로 바꿔 이미 고른 시작 시각이 지났으면 시작을 다시 고르게 한다
                const nextStartTime =
                  startTime &&
                  isPastSessionStart(nextDateKey, startTime, todayKey, new Date())
                    ? null
                    : startTime;
                setStartTime(nextStartTime);
                advance({
                  dateKey: nextDateKey,
                  startTime: nextStartTime,
                  durationMinutes,
                });
              }}
            />
          </div>
        );
      }
      if (step === "start") {
        return (
          <div key="start-open" className={panelClassName}>
            <SessionStartTimePicker
              value={startTime}
              isDisabled={isStartDisabled}
              onChange={(nextStartTime) => {
                setStartTime(nextStartTime);
                advance({ dateKey, startTime: nextStartTime, durationMinutes });
              }}
            />
          </div>
        );
      }
      return (
        <div key="duration-open" className={panelClassName}>
          <SessionDurationPicker
            value={durationMinutes}
            endLabel={endLabel}
            onChange={(nextDuration) => {
              setDurationMinutes(nextDuration);
              advance({ dateKey, startTime, durationMinutes: nextDuration });
            }}
          />
        </div>
      );
    }

    const summary =
      step === "date"
        ? {
            label: "날짜",
            value: dateKey ? formatDateSummary(dateKey, todayKey) : "고르기",
          }
        : step === "start"
          ? { label: "시작", value: startTime ?? "고르기" }
          : {
              label: "길이",
              value: durationMinutes
                ? [`${durationMinutes / 60}시간`, timeRangeLabel]
                    .filter(Boolean)
                    .join(" · ")
                : "고르기",
            };
    return (
      <StepSummaryRow
        key={`${step}-row`}
        label={summary.label}
        value={summary.value}
        onPress={() => setOpenStep(step)}
        className="animate-pk-fade-up motion-reduce:animate-none"
      />
    );
  };

  return (
    <>
      <BottomSheet.Header>
        <SheetTitle title="세션 만들기" />
      </BottomSheet.Header>
      <BottomSheet.Body className="min-w-0">
        <AnimatedHeight>
          <form
            className="flex flex-col gap-3 px-1 pb-1"
            onSubmit={(event) => {
              event.preventDefault();
              void handleSave();
            }}
          >
            {(["date", "start", "duration"] as const)
              .filter((step) => STEPS.indexOf(step) <= reachedIndex)
              .map(renderStep)}
            {isFieldsShown ? (
              <div className="mt-2 flex animate-pk-fade-up flex-col gap-5 motion-reduce:animate-none">
                <TextField
                  ref={nameInputRef}
                  label="이름"
                  value={name}
                  maxLength={MATCH_SESSION_NAME_MAX_LENGTH}
                  placeholder="예: 번개, 클럽 대회"
                  required
                  enterKeyHint="done"
                  onKeyDown={handleEnterToSave}
                  onChange={(event) => {
                    setName(event.target.value);
                    setError(null);
                  }}
                />
                <TextField
                  label="장소"
                  value={location}
                  maxLength={MATCH_SESSION_LOCATION_MAX_LENGTH}
                  placeholder="장소 입력"
                  required
                  enterKeyHint="done"
                  onKeyDown={handleEnterToSave}
                  onChange={(event) => {
                    setLocation(event.target.value);
                    setError(null);
                  }}
                />
              </div>
            ) : null}
          </form>
        </AnimatedHeight>
      </BottomSheet.Body>
      <BottomSheet.Footer className="flex flex-col gap-2">
        {error ? (
          <p role="alert" className="px-1 text-pk-13 text-pk-down">
            {error}
          </p>
        ) : null}
        <div className="flex items-center gap-2">
          <PkButton
            variant="ghost"
            size="lg"
            disabled={isSaving}
            onClick={onCancel}
          >
            취소
          </PkButton>
          <PkButton
            size="lg"
            className="flex-1"
            disabled={!canSave}
            onClick={() => void handleSave()}
          >
            {isSaving ? "만드는 중…" : "만들기"}
          </PkButton>
        </div>
      </BottomSheet.Footer>
    </>
  );
};

/** 전역 세션 만들기 시트. 날짜·시작 시각·길이·이름·장소를 한 단계씩 골라 세션을 만든다 */
export default function CreateSessionSheet({
  isOpen,
  tabKey,
  onClose,
  onCreated,
}: CreateSessionSheetProps): React.ReactElement {
  const { closeDepth, selectedTab } = useTabNavigation();
  // 열 때마다 올려서 입력을 초기화한다
  const [sheetKey, setSheetKey] = useState(0);
  const isLayerOpen = useLayerDepth({
    isOpen,
    tabKey,
    depthId: DEPTH_ID,
    kind: "bottom-sheet",
    onClose,
  });

  useEffect(() => {
    if (isOpen) setSheetKey((key) => key + 1);
  }, [isOpen]);

  const close = useCallback(
    (afterClose?: () => void) => {
      if (!closeDepth(tabKey, DEPTH_ID, afterClose)) {
        onClose();
        afterClose?.();
      }
    },
    [closeDepth, onClose, tabKey],
  );

  const handleCreated = useCallback(
    (session: MatchSessionDetailInfo) => close(() => onCreated(session)),
    [close, onCreated],
  );

  return (
    <BottomSheet
      isOpen={isLayerOpen}
      isActive={tabKey === selectedTab}
      onOpenChange={(nextIsOpen) => {
        if (!nextIsOpen) close();
      }}
      ariaLabel="세션 만들기"
      layer={GLOBAL_LAYER.createSession}
      isFixedHeight={false}
    >
      <CreateSessionForm
        key={sheetKey}
        onCancel={() => close()}
        onCreated={handleCreated}
      />
    </BottomSheet>
  );
}
