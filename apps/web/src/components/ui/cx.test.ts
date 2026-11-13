import { describe, expect, it } from "vitest";
import { cx } from "./cx";

describe("cx", () => {
  it("거짓 값을 걸러 클래스를 합친다", () => {
    expect(cx("a", false, null, undefined, "b")).toBe("a b");
  });

  it("pk 글자 크기와 pk 색은 서로 다른 종류로 둘 다 남긴다", () => {
    expect(cx("text-pk-15", "text-pk-ink")).toBe("text-pk-15 text-pk-ink");
  });

  it("pk 글자 크기끼리는 뒤의 것만 남긴다", () => {
    expect(cx("text-pk-15", "text-pk-22")).toBe("text-pk-22");
  });

  it("pk 색끼리는 뒤의 것만 남긴다", () => {
    expect(cx("text-pk-muted", "text-pk-up")).toBe("text-pk-up");
    expect(cx("bg-pk-neutral", "bg-error")).toBe("bg-error");
    expect(cx("border-pk-line", "border-divider")).toBe("border-divider");
  });

  it("px·py 뒤의 p는 둘 다 덮는다", () => {
    expect(cx("px-4 py-1", "p-4")).toBe("p-4");
  });

  it("높이는 뒤의 것만 남긴다", () => {
    expect(cx("h-[52px]", "h-14")).toBe("h-14");
  });

  it("둥글기는 pk 토큰을 포함해 뒤의 것만 남긴다", () => {
    expect(cx("rounded", "rounded-pk-lg")).toBe("rounded-pk-lg");
    expect(cx("rounded-pk-sm", "rounded-full")).toBe("rounded-full");
  });

  it("굵기는 뒤의 것만 남기고 font-num 글꼴과는 충돌하지 않는다", () => {
    expect(cx("font-extrabold", "font-bold")).toBe("font-bold");
    expect(cx("font-num font-extrabold", "font-bold")).toBe("font-num font-bold");
  });
});
