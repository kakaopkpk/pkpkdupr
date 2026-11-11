import React, { useState } from "react";

export interface IssuedCredential {
  username: string;
  password: string;
  /** 회원 추가로 발급(initial)했는지, 비밀번호 초기화로 발급(reset)했는지 */
  kind: "initial" | "reset";
}

interface IssuedPasswordNoticeProps {
  credential: IssuedCredential;
  onClose: () => void;
}

/**
 * 서버가 한 번만 돌려주는 발급 비밀번호를 아이디와 함께 보여 준다.
 * 화면 상태에만 두며 저장하지 않으므로 닫거나 새로고침하면 다시 볼 수 없다.
 */
const IssuedPasswordNotice: React.FC<IssuedPasswordNoticeProps> = ({
  credential,
  onClose,
}) => {
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(
        `아이디: ${credential.username}\n비밀번호: ${credential.password}`,
      );
      setCopyMessage("복사했습니다.");
    } catch {
      setCopyMessage("복사하지 못했습니다. 직접 선택해 복사해 주세요.");
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
      <p className="text-sm font-semibold text-blue-800">
        {credential.kind === "initial"
          ? "회원 계정을 발급했습니다."
          : "임시 비밀번호를 발급했습니다."}
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-slate-500">아이디</dt>
        <dd>
          <code className="select-all font-bold text-blue-700">
            {credential.username}
          </code>
        </dd>
        <dt className="text-slate-500">비밀번호</dt>
        <dd>
          <code className="select-all font-bold tracking-wider text-blue-700">
            {credential.password}
          </code>
        </dd>
      </dl>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="px-3 py-1.5 rounded-lg bg-white border text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          복사
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-500 hover:bg-white"
        >
          닫기
        </button>
        {copyMessage && (
          <span className="text-xs text-slate-600">{copyMessage}</span>
        )}
      </div>
      <ul className="list-disc space-y-0.5 pl-5 text-xs text-slate-600">
        <li>이 비밀번호는 다시 볼 수 없습니다. 지금 회원에게 전달해 주세요.</li>
        <li>
          {credential.kind === "initial"
            ? "회원은 첫 로그인 때 비밀번호를 바꾸게 됩니다."
            : "회원은 다음 로그인 때 비밀번호를 바꾸게 됩니다."}
        </li>
      </ul>
    </div>
  );
};

export default IssuedPasswordNotice;
