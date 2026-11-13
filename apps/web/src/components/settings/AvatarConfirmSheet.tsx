import React from "react";
import BottomSheet from "@/components/BottomSheet";
import { PkButton } from "@/components/ui/Button";
import { SheetTitle } from "@/components/ui/SheetTitle";

interface AvatarConfirmSheetBodyProps {
  /** 줄인 사진 data URL. 고른 파일을 읽지 못했으면 null */
  previewUrl: string | null;
  error: string | null;
  isSaving: boolean;
  onPickAgain: () => void;
  onConfirm: () => void;
}

/** 고른 사진 확인. "이 사진으로 변경"을 눌러야 저장한다 */
export const AvatarConfirmSheetBody: React.FC<AvatarConfirmSheetBodyProps> = ({
  previewUrl,
  error,
  isSaving,
  onPickAgain,
  onConfirm,
}) => (
  <>
    <BottomSheet.Header>
      <SheetTitle title="프로필 사진" />
    </BottomSheet.Header>
    <BottomSheet.Body className="items-center justify-center">
      {previewUrl ? (
        <img
          src={previewUrl}
          alt="고른 사진 미리보기"
          className="size-[180px] rounded-full object-cover"
        />
      ) : (
        <span className="size-[180px] rounded-full bg-pk-neutral" />
      )}
    </BottomSheet.Body>
    <BottomSheet.Footer className="flex flex-col gap-2">
      {error ? (
        <p role="alert" className="px-1 text-pk-13 font-bold text-pk-down">
          {error}
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <PkButton
          variant="ghost"
          size="lg"
          disabled={isSaving}
          onClick={onPickAgain}
        >
          다시 고르기
        </PkButton>
        <PkButton
          size="lg"
          className="flex-1"
          disabled={!previewUrl || isSaving}
          onClick={onConfirm}
        >
          {isSaving ? "변경 중..." : "이 사진으로 변경"}
        </PkButton>
      </div>
    </BottomSheet.Footer>
  </>
);
