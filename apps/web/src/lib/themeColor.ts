import { useLayoutEffect } from "react";

export const DEFAULT_THEME_COLOR = "#f3f5f9";
/** 딤 색. index.css `--color-pk-ink`와 같다 */
const DIM_INK_COLOR = "#0f1726";

const parseHex = (hex: string) =>
  [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));

/** 투명도 alphas인 딤들을 차례로 겹쳤을 때의 전체 투명도 */
export const combineDimAlphas = (alphas: readonly number[]) =>
  1 - alphas.reduce((rest, alpha) => rest * (1 - alpha), 1);

/** DEFAULT_THEME_COLOR 위에 딤들을 겹친 색. 딤이 없으면 기본색이다 */
export const getDimmedThemeColor = (alphas: readonly number[]) => {
  if (alphas.length === 0) return DEFAULT_THEME_COLOR;
  const alpha = combineDimAlphas(alphas);
  const base = parseHex(DEFAULT_THEME_COLOR);
  const ink = parseHex(DIM_INK_COLOR);
  return `#${base
    .map((channel, index) =>
      Math.round(channel * (1 - alpha) + ink[index] * alpha)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
};

/** 지금 화면에 깔린 딤들. 열린 순서와 상관없이 모두 겹쳐 상태바 색을 정한다 */
const activeDims = new Set<{ alpha: number }>();

const applyThemeColor = () => {
  document
    .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    ?.setAttribute(
      "content",
      getDimmedThemeColor([...activeDims].map((dim) => dim.alpha)),
    );
};

/**
 * 화면 전체를 덮는 딤이 깔린 동안 상단 상태바(theme-color)도 같은 투명도로 어둡게 한다.
 * alpha는 그 딤의 pk-ink 투명도(0~1)다.
 */
export const useDimmedThemeColor = (active: boolean, alpha: number) => {
  useLayoutEffect(() => {
    if (!active || typeof document === "undefined") return undefined;
    const dim = { alpha };
    activeDims.add(dim);
    applyThemeColor();
    return () => {
      activeDims.delete(dim);
      applyThemeColor();
    };
  }, [active, alpha]);
};
