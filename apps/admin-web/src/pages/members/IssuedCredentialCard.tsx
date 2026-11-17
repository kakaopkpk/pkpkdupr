import React from "react";
import { ADMIN_ISSUED_PASSWORD } from "@pkpkdupr/shared/auth";
import { Button } from "../../components/ui/Button";
import { useToast } from "../../components/ui/Toast";
import type { IssuedCredential } from "./memberModel";

// 임시 비밀번호는 늘 ADMIN_ISSUED_PASSWORD라 응답 값 대신 상수를 보이고, 다시 볼 수 없다는 재확인도 두지 않는다
export const IssuedCredentialCard: React.FC<{
  credential: IssuedCredential;
  onDismiss: () => void;
}> = ({ credential, onDismiss }) => {
  const { showToast } = useToast();
  const { username, kind } = credential;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(
        `아이디 ${username} / 임시 비밀번호 ${ADMIN_ISSUED_PASSWORD}`,
      );
      showToast("아이디와 임시 비밀번호를 복사했어요");
    } catch {
      showToast("복사하지 못했어요. 직접 적어 주세요.");
    }
  };

  return (
    <div className="sticky top-0 z-10 rounded-pk-sm border border-pk-primary-line bg-pk-primary-soft p-4">
      <p className="text-pk-15 font-bold text-pk-ink">
        {kind === "created"
          ? `${username} 계정을 만들었어요`
          : `${username} 비밀번호를 초기화했어요`}
      </p>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-pk-13">
        <dt className="text-pk-sub">아이디</dt>
        <dd className="font-semibold text-pk-ink">{username}</dd>
        <dt className="text-pk-sub">임시 비밀번호</dt>
        <dd className="font-semibold tabular-nums text-pk-ink">{ADMIN_ISSUED_PASSWORD}</dd>
      </dl>
      <p className="mt-3 text-pk-12 text-pk-sub">
        첫 로그인하면 비밀번호를 바꾸게 돼요. 잃어버리면 비밀번호 초기화로 다시{" "}
        {ADMIN_ISSUED_PASSWORD}로 돌려요.
      </p>
      <div className="mt-3 flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={() => void handleCopy()}>
          아이디·비밀번호 함께 복사
        </Button>
        <Button size="sm" onClick={onDismiss}>
          확인
        </Button>
      </div>
    </div>
  );
};
