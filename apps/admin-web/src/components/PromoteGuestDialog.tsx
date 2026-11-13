import React, { useState } from "react";

type PromoteGender = "M" | "F";

interface PromoteGuestDialogProps {
  username: string;
  ratingExcludedMatchCount: number;
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: (gender: PromoteGender) => void;
}

/** 게스트를 정회원으로 승급하기 전 확인 창. 성별을 고르기 전에는 승급할 수 없다. */
const PromoteGuestDialog: React.FC<PromoteGuestDialogProps> = ({
  username,
  ratingExcludedMatchCount,
  isSubmitting,
  onCancel,
  onConfirm,
}) => {
  const [gender, setGender] = useState<PromoteGender | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="promote-guest-title"
        className="w-full max-w-md space-y-4 rounded-xl bg-white p-5 shadow-xl"
      >
        <h3
          id="promote-guest-title"
          className="text-base font-semibold text-slate-800"
        >
          {username} 님을 정회원으로 승급할까요?
        </h3>
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
          <li>승급한 뒤에 기록하는 경기부터 평점에 반영됩니다.</li>
          <li>
            게스트로 뛴 경기 {ratingExcludedMatchCount}개는 계속 평점에 반영되지
            않습니다.
          </li>
          <li>
            로그인 계정을 함께 발급하고, 초기 비밀번호는 한 번만 보여 줍니다.
          </li>
        </ul>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-700">
            성별 <span className="text-red-500">*</span>
          </legend>
          <div className="flex gap-6">
            {(
              [
                ["M", "남"],
                ["F", "여"],
              ] as const
            ).map(([value, label]) => (
              <label
                key={value}
                className="flex cursor-pointer items-center gap-2 text-sm"
              >
                <input
                  type="radio"
                  name="promote-guest-gender"
                  value={value}
                  checked={gender === value}
                  onChange={() => setGender(value)}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:text-slate-300"
          >
            취소
          </button>
          <button
            type="button"
            disabled={!gender || isSubmitting}
            onClick={() => gender && onConfirm(gender)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-slate-300"
          >
            {isSubmitting ? "승급 중..." : "승급하고 계정 발급"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PromoteGuestDialog;
