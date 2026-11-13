import { extendTailwindMerge } from "tailwind-merge";

// index.css @theme에 등록한 토큰. tailwind-merge는 커스텀 토큰의 종류를 모르므로
// 여기 등록해야 text-pk-15(글자 크기)와 text-pk-ink(색)처럼 접두가 같은 클래스를 구분한다.
// @theme에 토큰을 추가하거나 바꾸면 이 목록도 함께 고친다.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      color: [
        "error",
        "border",
        "divider",
        "pk-bg",
        "pk-ink",
        "pk-sub",
        "pk-muted",
        "pk-divider",
        "pk-quiet",
        "pk-line",
        "pk-neutral",
        "pk-up",
        "pk-down",
        "pk-primary",
        "pk-primary-soft",
        "pk-primary-line",
        "pk-hl",
        "pk-gold",
        "pk-silver",
        "pk-bronze",
        "pk-sky",
        "pk-primary-mid",
        "pk-flame-core",
        "pk-flame",
        "pk-flame-hot",
      ],
      font: ["num"],
      ease: ["pk-spring", "pk-move", "pk-pop"],
      animate: [
        "nav-icon-pop",
        "plus-menu-pop",
        "pk-fade-in",
        "pk-fade-up",
        "pk-pop",
        "pk-draw",
        "pk-sheen",
        "pk-ping",
        "pk-spin-slow",
        "pk-rise-in",
        "pk-sink-out",
        "pk-wobble",
        "pk-fade-out",
        "pk-celebrate-pop",
        "pk-rays-pulse",
        "pk-slide-away",
      ],
      radius: ["pk-sm", "pk-lg"],
      text: ["pk-12", "pk-13", "pk-15", "pk-17", "pk-22", "pk-26"],
    },
  },
});

export const cx = (...classNames: Array<string | false | null | undefined>) => twMerge(classNames);
