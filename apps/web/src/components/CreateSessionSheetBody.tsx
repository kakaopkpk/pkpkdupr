import React, { useState } from "react";
import { Button } from "@heroui/react";
import { rememberRecentInputValue } from "@pkpkdupr/shared/recentInputHistory";
import { DEFAULT_MATCH_LOCATION } from "@pkpkdupr/shared/session";
import {
  createMatchSession,
  type MatchSessionDetailInfo,
} from "@/lib/matchSessions";
import BottomSheet from "./BottomSheet";
import BottomSheetSection from "./BottomSheetSection";
import RecentValueComboBox from "./RecentValueComboBox";

interface CreateSessionSheetBodyProps {
  isOnline?: boolean;
  onCancel: () => void;
  onCreated: (session: MatchSessionDetailInfo) => void;
}

const inputClassName =
  "app-mobile-input w-full rounded-2xl border border-border bg-white px-4 py-2 text-base text-pkpk-sub-font outline-none";

const CreateSessionSheetBody: React.FC<CreateSessionSheetBodyProps> = ({
  isOnline = true,
  onCancel,
  onCreated,
}) => {
  const [name, setName] = useState("");
  const [location, setLocation] = useState(DEFAULT_MATCH_LOCATION);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmedName = name.trim();
  const trimmedLocation = location.trim();
  const canSave = !!trimmedName && !!trimmedLocation && isOnline && !isSaving;

  const handleSave = async () => {
    if (!canSave) return;

    setIsSaving(true);
    setError(null);
    try {
      const session = await createMatchSession({
        name: trimmedName,
        location: trimmedLocation,
      });
      rememberRecentInputValue("web.match.location", trimmedLocation);
      onCreated(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "세션을 만들지 못했어요.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <BottomSheet.Header>
        <h2 className="bs-text-head text-left text-pkpk-main-font">
          세션 만들기
        </h2>
      </BottomSheet.Header>
      <BottomSheet.Body className="min-w-0 pb-4">
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSave();
          }}
        >
          <BottomSheetSection>
            <label
              htmlFor="create-session-name"
              className="bs-text-title text-pkpk-sub-font"
            >
              이름
            </label>
            <input
              id="create-session-name"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setError(null);
              }}
              required
              maxLength={50}
              placeholder="예: 번개, 클럽 대회"
              className={inputClassName}
            />
          </BottomSheetSection>
          <BottomSheetSection>
            <label
              htmlFor="create-session-location"
              className="bs-text-title text-pkpk-sub-font"
            >
              장소
            </label>
            <RecentValueComboBox
              id="create-session-location"
              fieldKey="web.match.location"
              value={location}
              onChange={(nextValue) => {
                setLocation(nextValue);
                setError(null);
              }}
              required
              placeholder="장소 입력"
              className="w-full"
              inputClassName={inputClassName}
            />
          </BottomSheetSection>
        </form>

        <div className="flex flex-col gap-2">
          {error ? <p className="bs-text-body text-error">{error}</p> : null}
          <div className="grid w-full grid-cols-3 gap-2">
            <Button
              className="app-action-button w-full rounded-2xl bg-red-50 py-3 text-base font-semibold text-red-500"
              isDisabled={isSaving}
              onPress={onCancel}
            >
              취소
            </Button>
            <Button
              className="app-action-button col-span-2 w-full rounded-2xl bg-[#409eff] py-3 text-base font-semibold text-white disabled:bg-slate-200 disabled:text-slate-400"
              isDisabled={!canSave}
              onPress={() => void handleSave()}
            >
              {!isOnline ? "온라인 연결 필요" : isSaving ? "만드는 중…" : "만들기"}
            </Button>
          </div>
        </div>
      </BottomSheet.Body>
    </>
  );
};

export default CreateSessionSheetBody;
