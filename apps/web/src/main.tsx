import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";

const routerBaseName =
  import.meta.env.BASE_URL === "/"
    ? undefined
    : import.meta.env.BASE_URL.replace(/\/$/, "");

// GitHub Pages는 없는 경로에 루트 404.html을 돌려준다. 404.html이 원래 경로를 sessionStorage에 남기고
// 이 앱의 base로 보내면, 라우터를 만들기 전에 주소를 원래 경로로 되돌린다(딥링크 새로고침).
const PAGES_REDIRECT_STORAGE_KEY = "pkpkdupr:pages-redirect";

const restorePagesRedirect = () => {
  let target: string | null;
  try {
    target = window.sessionStorage.getItem(PAGES_REDIRECT_STORAGE_KEY);
    window.sessionStorage.removeItem(PAGES_REDIRECT_STORAGE_KEY);
  } catch {
    return;
  }
  if (target?.startsWith(import.meta.env.BASE_URL)) {
    window.history.replaceState(null, "", target);
  }
};

restorePagesRedirect();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter basename={routerBaseName}>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
