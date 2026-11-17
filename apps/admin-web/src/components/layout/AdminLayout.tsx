import React from "react";
import { Outlet } from "react-router-dom";
import { AdminSideNav } from "./AdminSideNav";

/** 로그인 뒤 PC 전용 레이아웃(최소 폭 1280px): 왼쪽 사이드바 + pk-bg 본문 */
export const AdminLayout: React.FC = () => (
  <div className="flex min-h-screen min-w-[1280px] bg-pk-bg text-pk-ink">
    <AdminSideNav />
    <main className="min-w-0 flex-1 px-8 pb-10 pt-7">
      <Outlet />
    </main>
  </div>
);
