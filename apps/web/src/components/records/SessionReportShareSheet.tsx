import React, { useEffect, useState } from "react";
import BottomSheet from "@/components/BottomSheet";
import SkeletonBlock from "@/components/SkeletonBlock";
import { FooterError } from "@/components/record/RecordMatchParts";
import { buttonPressClassName, PkButton } from "@/components/ui/Button";
import { ShareIcon } from "@/components/ui/Icons";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { SheetTitle } from "@/components/ui/SheetTitle";
import { cx } from "@/components/ui/cx";
import { GLOBAL_LAYER } from "@/context/AppNavigationContext";
import { useSessionReportShare } from "@/hooks/useSessionReportShare";
import type {
  MyRecordShareTarget,
  SessionReportShareKind,
  SessionSummaryShareTarget,
} from "@/lib/sessionReportShare";

const KIND_OPTIONS = [
  { value: "summary", label: "세션 요약" },
  { value: "mine", label: "내 기록" },
] as const;

const PREVIEW_LABEL: Record<SessionReportShareKind, string> = {
  summary: "세션 요약 이미지 미리보기",
  mine: "내 기록 이미지 미리보기",
};

/** 끝난 세션 상세 머리 오른쪽 위 공유 아이콘 버튼 */
export const SessionShareHeaderButton: React.FC<{ onPress: () => void }> = ({ onPress }) => (
  <button
    type="button"
    aria-label="세션 리포트 공유"
    onClick={onPress}
    className={cx(
      "flex size-11 shrink-0 items-center justify-center rounded-full text-pk-ink",
      buttonPressClassName,
    )}
  >
    <ShareIcon size={22} />
  </button>
);

/** 만들어 둔 PNG 파일을 미리보기 주소로 바꾼다. 파일이 바뀌거나 없어지면 주소를 푼다 */
const useObjectUrl = (file: File | null) => {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      setUrl(null);
      return undefined;
    }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url;
};

export interface SessionReportShareSheetProps {
  isOpen: boolean;
  isActive: boolean;
  summary: SessionSummaryShareTarget;
  /** 내가 그 세션에서 경기하지 않았으면 null이라 "내 기록" 전환을 뺀다 */
  mine: MyRecordShareTarget | null;
  onClose: () => void;
}

/**
 * 세션 리포트 공유 시트: "세션 요약 / 내 기록" 전환 → 이미지 미리보기 → "이미지 공유".
 * 처음 열 때 두 이미지를 함께 만들어 두고(iOS Safari는 누른 직후에만 공유 시트가 열린다) 세션 상세가 열려 있는 동안 둔다
 */
export default function SessionReportShareSheet({
  isOpen,
  isActive,
  summary,
  mine,
  onClose,
}: SessionReportShareSheetProps): React.ReactElement {
  const [kind, setKind] = useState<SessionReportShareKind>("summary");
  const [hasOpened, setHasOpened] = useState(isOpen);
  if (isOpen && !hasOpened) setHasOpened(true);

  const summaryShare = useSessionReportShare(hasOpened ? summary : null);
  const mineShare = useSessionReportShare(hasOpened ? mine : null);
  const selectedKind = mine ? kind : "summary";
  const share = selectedKind === "mine" ? mineShare : summaryShare;
  const previewUrl = useObjectUrl(share.file);

  return (
    <BottomSheet
      isOpen={isOpen}
      isActive={isActive}
      onOpenChange={(nextIsOpen) => {
        if (!nextIsOpen) onClose();
      }}
      ariaLabel="세션 리포트 공유"
      layer={GLOBAL_LAYER.sheet}
    >
      <BottomSheet.Header className="flex flex-col gap-3">
        <SheetTitle title="리포트 공유" />
        {mine ? (
          <SegmentedControl
            options={KIND_OPTIONS}
            value={selectedKind}
            onChange={setKind}
            ariaLabel="공유할 이미지"
          />
        ) : null}
      </BottomSheet.Header>
      <BottomSheet.Body>
        <div className="flex justify-center rounded-pk-lg bg-pk-bg p-4">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt={PREVIEW_LABEL[selectedKind]}
              draggable={false}
              className="block h-auto w-full max-w-[280px] rounded-pk-sm shadow-[0_2px_12px] shadow-pk-ink/10"
            />
          ) : share.isAvailable ? (
            <SkeletonBlock className="aspect-[4/5] w-full max-w-[280px] rounded-pk-sm" />
          ) : null}
        </div>
      </BottomSheet.Body>
      <BottomSheet.Footer>
        <FooterError message={share.isAvailable ? null : "이미지를 만들지 못했어요."} />
        <PkButton size="lg" fullWidth disabled={!share.canShare} onClick={share.share}>
          <ShareIcon />
          이미지 공유
        </PkButton>
      </BottomSheet.Footer>
    </BottomSheet>
  );
}
