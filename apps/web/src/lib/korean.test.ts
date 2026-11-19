import { describe, expect, it } from "vitest";
import { getObjectParticle } from "@/lib/korean";

describe("getObjectParticle", () => {
  it("받침 있는 끝 글자면 '을'", () => {
    expect(getObjectParticle("3연승")).toBe("을");
    expect(getObjectParticle("첫 승")).toBe("을");
  });

  it("받침 없는 끝 글자면 '를'", () => {
    expect(getObjectParticle("힘겹게 쟁취한 승리")).toBe("를");
    expect(getObjectParticle("환영 인사")).toBe("를");
  });

  it("한글이 아닌 끝 글자면 '를'", () => {
    expect(getObjectParticle("MVP")).toBe("를");
    expect(getObjectParticle("10")).toBe("를");
    expect(getObjectParticle("")).toBe("를");
  });
});
