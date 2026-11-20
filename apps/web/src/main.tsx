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

// 안드로이드는 이미지·링크를 길게 누르면 저장·복사 메뉴를 띄운다. CSS로는 못 막아 메뉴 이벤트를 끈다.
// 데스크톱 우클릭 메뉴는 남기도록 터치가 주 입력인 기기에서만 막는다.
const coarsePointerQuery = window.matchMedia("(pointer: coarse)");
document.addEventListener("contextmenu", (event) => {
  if (
    coarsePointerQuery.matches &&
    event.target instanceof Element &&
    event.target.closest("img, a")
  ) {
    event.preventDefault();
  }
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter basename={routerBaseName}>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
