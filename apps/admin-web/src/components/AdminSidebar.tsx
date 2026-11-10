import React from "react";

export type AdminSection = "members" | "ratings" | "sessions" | "matches";

interface AdminSidebarProps {
  activeSection: AdminSection;
  onSectionChange: (section: AdminSection) => void;
}

export const adminSectionInfo: Record<
  AdminSection,
  {
    label: string;
    description: string;
  }
> = {
  members: {
    label: "회원 관리",
    description: "회원 추가, 초대 코드 발급과 성별, 상태 및 계정 로그를 관리합니다.",
  },
  ratings: {
    label: "레이팅 관리",
    description:
      "레이팅 알고리즘별 결과를 비교하고 전체 재계산과 공식 DUPR 반영을 관리합니다.",
  },
  sessions: {
    label: "세션 관리",
    description:
      "세션을 만들고 참여자, 예정 경기, 경기 결과를 관리합니다.",
  },
  matches: {
    label: "매치 관리",
    description: "경기를 일괄 등록하고 기존 매치와 세션 정보를 관리합니다.",
  },
};

const menuItems: Array<{
  id: AdminSection;
  label: string;
}> = [
  {
    id: "members",
    label: adminSectionInfo.members.label,
  },
  {
    id: "ratings",
    label: adminSectionInfo.ratings.label,
  },
  {
    id: "sessions",
    label: adminSectionInfo.sessions.label,
  },
  {
    id: "matches",
    label: adminSectionInfo.matches.label,
  },
];

const AdminSidebar: React.FC<AdminSidebarProps> = ({
  activeSection,
  onSectionChange,
}) => (
  <aside className="w-full shrink-0 border-b border-slate-200 bg-white lg:min-h-[calc(100vh-73px)] lg:w-60 lg:border-b-0 lg:border-r">
    <nav className="sticky top-0 py-4">
      <p className="px-5 pb-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
        관리 메뉴
      </p>
      <div className="flex overflow-x-auto lg:flex-col lg:overflow-visible">
        {menuItems.map((item) => {
          const isActive = item.id === activeSection;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSectionChange(item.id)}
              className={`min-w-36 border-b-2 px-5 py-3 text-left text-sm font-semibold transition-colors lg:min-w-0 lg:border-b-0 lg:border-l-4 ${
                isActive
                  ? "border-blue-600 bg-blue-50 text-blue-700"
                  : "border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </nav>
  </aside>
);

export default AdminSidebar;
