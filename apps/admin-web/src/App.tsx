import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AdminLayout } from "./components/layout/AdminLayout";
import { ToastProvider } from "./components/ui/Toast";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Login from "./pages/Login";
import HomePage from "./pages/home/HomePage";
import MatchesPage from "./pages/matches/MatchesPage";
import MembersPage from "./pages/members/MembersPage";
import RatingsPage from "./pages/ratings/RatingsPage";
import SessionsPage from "./pages/sessions/SessionsPage";

function AppRoutes() {
  const { status } = useAuth();

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-pk-bg text-pk-15 text-pk-sub">
        로그인 상태를 확인하는 중…
      </div>
    );
  }

  if (status === "signedOut") {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route index element={<HomePage />} />
        <Route path="members" element={<MembersPage />} />
        <Route path="matches" element={<MatchesPage />} />
        <Route path="sessions" element={<SessionsPage />} />
        <Route path="ratings" element={<RatingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AppRoutes />
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;
