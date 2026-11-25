import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PraisedAvatarFrame } from "./PraisedAvatarFrame";

const render = (praiseCount: number) =>
  renderToStaticMarkup(
    <PraisedAvatarFrame praiseCount={praiseCount}>
      <span data-avatar="" />
    </PraisedAvatarFrame>,
  );

describe("PraisedAvatarFrame", () => {
  it("칭찬 5개 미만이면 아바타만 그린다", () => {
    expect(render(4)).toBe('<span data-avatar=""></span>');
  });

  it("칭찬 5개 이상이면 앰버 링·빛과 튀는 엄지 배지를 붙인다", () => {
    const html = render(5);
    expect(html).toContain("0_0_0_2px_var(--color-pk-hl)");
    expect(html).toContain("0_0_14px_5px_color-mix(in_srgb,var(--color-pk-hl)_55%,transparent)");
    expect(html).toContain("pk-praise-badge");
  });
});
