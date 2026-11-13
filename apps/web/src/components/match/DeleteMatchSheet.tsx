import React from "react";
import BottomSheet from "@/components/BottomSheet";
import HoldToConfirmButton from "@/components/HoldToConfirmButton";
import { FooterError } from "@/components/record/RecordMatchParts";
import { PkButton } from "@/components/ui/Button";
import { MatchRow } from "@/components/ui/MatchRow";
import { SheetTitle } from "@/components/ui/SheetTitle";
import { GLOBAL_LAYER } from "@/context/AppNavigationContext";
import type { MatchInfo } from "@/types/match";

export interface DeleteMatchSheetProps {
  isOpen: boolean;
  isActive: boolean;
  /** 지울 경기. 닫히는 동안에도 마지막 경기를 그린다 */
  match: MatchInfo | null;
  isDeleting: boolean;
  /** 버튼 위에 보일 서버 문구(409 등) */
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

/** 경기 요약 상자. pk-bg 바탕 위에 날짜·시각 메타 줄과 팀 줄을 목록 줄 규칙대로 그린다 */
const MatchSummary: React.FC<{ match: MatchInfo }> = ({ match }) => (
  <div className="rounded-pk-lg bg-pk-bg px-4">
    <MatchRow
      match={match}
      timeLabel="date-time"
      avatarRingColor="var(--color-pk-bg)"
    />
  </div>
);

/** 경기 삭제 확인 시트. 경기 상세 화면 위에 뜨며, 1초 길게 눌러야 지운다 */
export default function DeleteMatchSheet({
  isOpen,
  isActive,
  match,
  isDeleting,
  error,
  onCancel,
  onConfirm,
}: DeleteMatchSheetProps): React.ReactElement {
  return (
    <BottomSheet
      isOpen={isOpen}
      isActive={isActive}
      onOpenChange={(nextIsOpen) => {
        if (!nextIsOpen && !isDeleting) onCancel();
      }}
      ariaLabel="경기 삭제"
      layer={GLOBAL_LAYER.sheet}
      isFixedHeight={false}
    >
      <BottomSheet.Header>
        <SheetTitle title="경기를 삭제할까요?" />
      </BottomSheet.Header>
      <BottomSheet.Body className="gap-3">
        {match ? <MatchSummary match={match} /> : null}
        <p className="px-1 text-pk-13 text-pk-sub">
          이 경기와 그 뒤 경기를 한 회원들의 평점이 다시 계산돼요. 삭제한 경기는
          되돌릴 수 없어요.
        </p>
      </BottomSheet.Body>
      <BottomSheet.Footer>
        <FooterError message={error} />
        <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2">
          <PkButton
            variant="ghost"
            size="lg"
            disabled={isDeleting}
            onClick={onCancel}
          >
            취소
          </PkButton>
          <HoldToConfirmButton
            variant="danger"
            isDisabled={isDeleting || !match}
            onComplete={onConfirm}
          >
            길게 눌러 삭제
          </HoldToConfirmButton>
        </div>
      </BottomSheet.Footer>
    </BottomSheet>
  );
}
