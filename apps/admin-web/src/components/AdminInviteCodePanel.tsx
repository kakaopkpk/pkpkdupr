import React, { useEffect, useState } from "react";
import type {
  CreatedInviteCode,
  InviteCodeSummary,
} from "@pkpkdupr/shared/auth";
import { apiFetch } from "../lib/api";

const formatDateTime = (value?: string | null) => {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

const getInviteStatus = (invite: InviteCodeSummary) => {
  if (invite.usedAt) {
    return {
      label: `사용됨 (${invite.usedByUsername ?? "알 수 없음"})`,
      className: "bg-slate-200 text-slate-700",
    };
  }
  if (new Date(invite.expiresAt).getTime() <= Date.now()) {
    return { label: "만료", className: "bg-red-100 text-red-700" };
  }
  return { label: "미사용", className: "bg-emerald-100 text-emerald-700" };
};

const readErrorMessage = async (res: Response, fallback: string) => {
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return data.error || fallback;
};

/** 관리자 초대 코드 발급과 발급 목록(사용 여부) */
const AdminInviteCodePanel: React.FC = () => {
  const [invites, setInvites] = useState<InviteCodeSummary[]>([]);
  const [createdInvite, setCreatedInvite] = useState<CreatedInviteCode | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadInvites = async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch("/api/admin/invite-codes");
      if (!res.ok) {
        throw new Error(
          await readErrorMessage(res, "초대 코드 목록을 불러오지 못했습니다."),
        );
      }
      setInvites((await res.json()) as InviteCodeSummary[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadInvites();
  }, []);

  const handleCreate = async () => {
    setError(null);
    setCopyMessage(null);
    setIsCreating(true);
    try {
      const res = await apiFetch("/api/admin/invite-codes", { method: "POST" });
      if (!res.ok) {
        throw new Error(await readErrorMessage(res, "초대 코드 발급 실패"));
      }
      setCreatedInvite((await res.json()) as CreatedInviteCode);
      await loadInvites();
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류");
    } finally {
      setIsCreating(false);
    }
  };

  const handleCopy = async () => {
    if (!createdInvite) {
      return;
    }
    try {
      await navigator.clipboard.writeText(createdInvite.code);
      setCopyMessage("복사했습니다.");
    } catch {
      setCopyMessage("복사하지 못했습니다. 코드를 직접 선택해 복사해 주세요.");
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-700">초대 코드</h2>
          <p className="mt-1 text-sm text-gray-500">
            1회용 코드(7일 만료)입니다. 코드는 발급 직후에만 볼 수 있으니 바로
            전달해 주세요.
          </p>
        </div>
        <button
          type="button"
          disabled={isCreating}
          onClick={() => void handleCreate()}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:bg-blue-300 transition-colors"
        >
          {isCreating ? "발급 중..." : "초대 코드 발급"}
        </button>
      </div>

      {error && (
        <div className="bg-error/10 border border-error/20 text-error px-4 py-2 rounded text-sm">
          {error}
        </div>
      )}

      {createdInvite && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
          <code className="select-all text-xl font-bold tracking-widest text-blue-700">
            {createdInvite.code}
          </code>
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="px-3 py-1.5 rounded-lg bg-white border text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            복사
          </button>
          <span className="text-xs text-slate-500">
            만료 {formatDateTime(createdInvite.expiresAt)}
          </span>
          {copyMessage && (
            <span className="text-xs text-slate-600">{copyMessage}</span>
          )}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] table-auto text-sm">
          <thead className="bg-slate-100">
            <tr className="text-left text-slate-600">
              <th className="px-4 py-3 whitespace-nowrap">발급자</th>
              <th className="px-4 py-3 whitespace-nowrap">발급 시각</th>
              <th className="px-4 py-3 whitespace-nowrap">만료 시각</th>
              <th className="px-4 py-3 whitespace-nowrap">사용 여부</th>
              <th className="px-4 py-3 whitespace-nowrap">사용 시각</th>
            </tr>
          </thead>
          <tbody>
            {invites.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                  {isLoading ? "불러오는 중..." : "발급한 초대 코드가 없습니다."}
                </td>
              </tr>
            ) : (
              invites.map((invite) => {
                const inviteStatus = getInviteStatus(invite);
                return (
                  <tr key={invite.id} className="border-b">
                    <td className="px-4 py-3 whitespace-nowrap">
                      {invite.createdByUsername}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {formatDateTime(invite.createdAt)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {formatDateTime(invite.expiresAt)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${inviteStatus.className}`}
                      >
                        {inviteStatus.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {formatDateTime(invite.usedAt)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
};

export default AdminInviteCodePanel;
