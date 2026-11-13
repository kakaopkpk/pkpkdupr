import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_MATCH_LOCATION,
  formatSessionTimeRange,
  kstDateKeyToDate,
  MATCH_SESSION_LOCATION_MAX_LENGTH,
  MATCH_SESSION_NAME_MAX_LENGTH,
  minutesToSessionTime,
  REGULAR_SESSION_START_HOUR,
  toKstDateKey,
  toKstMinutesOfDay,
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
  SESSION_LAST_END_MINUTES,
  SESSION_LAST_START_MINUTES,
  SESSION_TIME_STEP_MINUTES,
  SessionDatePicker,
  SessionTimePicker,
} from "./SessionSchedulePicker";

export interface CreateSessionSheetProps {
  isOpen: boolean;
  tabKey: TabKey;
  onClose: () => void;
  onCreated: (session: MatchSessionDetailInfo) => void;
}

const DEPTH_ID = "global-create-session-sheet";
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_START_MINUTES = REGULAR_SESSION_START_HOUR * 60;
const DEFAULT_DURATION_MINUTES = 2 * 60;

/**
 * 기본 시각 18:00~20:00. 이미 18시를 넘긴 오늘이면 지금 이후 첫 30분 단위 시각부터 2시간이며,
 * 고를 수 있는 마지막 시각을 넘지 않는다
 */
const getDefaultTimeRange = (now: Date) => {
  const nextSlot =
    Math.ceil(toKstMinutesOfDay(now) / SESSION_TIME_STEP_MINUTES) *
    SESSION_TIME_STEP_MINUTES;
  const start = Math.min(
    Math.max(DEFAULT_START_MINUTES, nextSlot),
    SESSION_LAST_START_MINUTES,
  );
  const end = Math.min(start + DEFAULT_DURATION_MINUTES, SESSION_LAST_END_MINUTES);
  return {
    startTime: minutesToSessionTime(start),
    endTime: minutesToSessionTime(end),
  };
};

/** 시트 부제의 날짜 부분. "오늘 · 11월 14일 금" | "내일 · 11월 15일 토" | "11월 17일 월" */
const formatDateSubtitle = (dateKey: string, todayKey: string) => {
  const label = formatKstShortDate(kstDateKeyToDate(dateKey));
  if (dateKey === todayKey) return `오늘 · ${label}`;
  const tomorrowKey = toKstDateKey(
    new Date(kstDateKeyToDate(todayKey).getTime() + DAY_MS),
  );
  if (dateKey === tomorrowKey) return `내일 · ${label}`;
  return label;
};

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
  const [dateKey, setDateKey] = useState(todayKey);
  const [timeRange, setTimeRange] = useState(() =>
    getDefaultTimeRange(new Date()),
  );
  const [name, setName] = useState("");
  const [location, setLocation] = useState(DEFAULT_MATCH_LOCATION);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmedName = name.trim();
  const trimmedLocation = location.trim();
  // YYYY-MM-DD 문자열은 사전순이 날짜순이다
  const isDateValid = !!dateKey && dateKey >= todayKey;
  const canSave =
    !!trimmedName && !!trimmedLocation && isDateValid && !isSaving;

  const save = useCallback(async () => {
    setIsSaving(true);
    setError(null);
    try {
      const session = await createMatchSession({
        name: trimmedName,
        location: trimmedLocation,
        dateKey,
        startTime: timeRange.startTime,
        endTime: timeRange.endTime,
      });
      // 시트가 닫힐 때까지 다시 누르지 못하게 성공 후에도 저장 중 상태를 유지한다
      onCreated(session);
    } catch (err) {
      setIsSaving(false);
      if (isNetworkError(err)) throw err;
      setError(getErrorMessage(err, "세션을 만들지 못했어요."));
    }
  }, [dateKey, onCreated, timeRange, trimmedLocation, trimmedName]);

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

  const clearError = () => setError(null);

  // 이름·장소 두 칸이라 폼의 암묵적 제출이 일어나지 않으므로 한 줄 입력의
  // 완료/Enter를 직접 저장으로 잇는다. 한글 조합 중 Enter는 조합 확정이다
  const handleEnterToSave = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void handleSave();
  };

  return (
    <>
      <BottomSheet.Header>
        <SheetTitle
          title="세션 만들기"
          sub={
            isDateValid
              ? `${formatDateSubtitle(dateKey, todayKey)} · ${formatSessionTimeRange(timeRange)}`
              : undefined
          }
        />
      </BottomSheet.Header>
      <BottomSheet.Body className="min-w-0">
        <form
          className="flex flex-col gap-5 px-1"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSave();
          }}
        >
          <SessionDatePicker
            todayKey={todayKey}
            value={dateKey}
            onChange={(nextDateKey) => {
              setDateKey(nextDateKey);
              clearError();
            }}
          />
          <SessionTimePicker
            startTime={timeRange.startTime}
            endTime={timeRange.endTime}
            onChange={(nextRange) => {
              setTimeRange(nextRange);
              clearError();
            }}
          />
          <TextField
            label="이름"
            value={name}
            maxLength={MATCH_SESSION_NAME_MAX_LENGTH}
            placeholder="예: 번개, 클럽 대회"
            required
            enterKeyHint="done"
            onKeyDown={handleEnterToSave}
            onChange={(event) => {
              setName(event.target.value);
              clearError();
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
              clearError();
            }}
          />
        </form>
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

/** 전역 세션 만들기 시트. 날짜(기본 오늘)·시작·종료 시각·이름·장소로 세션을 만든다 */
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
