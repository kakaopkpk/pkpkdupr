import { describe, expect, it } from "vitest";
import {
  INITIAL_KEYBOARD_VIEWPORT_STATE,
  measureKeyboardViewport,
  type KeyboardViewportResult,
  type KeyboardViewportSample,
} from "./keyboardViewport";

const sample = (
  overrides: Partial<KeyboardViewportSample> = {},
): KeyboardViewportSample => ({
  inputFocused: false,
  width: 390,
  innerHeight: 800,
  visualHeight: 800,
  visualOffsetTop: 0,
  ...overrides,
});

/** 여러 측정을 차례로 적용하고 마지막 결과를 돌려준다 */
const run = (samples: KeyboardViewportSample[]) => {
  let state = INITIAL_KEYBOARD_VIEWPORT_STATE;
  let result!: KeyboardViewportResult;
  for (const next of samples) {
    result = measureKeyboardViewport(state, next);
    state = result.state;
  }
  return result;
};

describe("measureKeyboardViewport", () => {
  it("안드로이드처럼 레이아웃도 같이 줄면 열림이고 가려지는 양은 0이다", () => {
    const result = run([
      sample(),
      sample({ inputFocused: true }),
      sample({ inputFocused: true, innerHeight: 480, visualHeight: 480 }),
    ]);

    expect(result.open).toBe(true);
    expect(result.offset).toBe(0);
  });

  it("iOS처럼 보이는 높이만 줄면 열림이고 가려지는 양을 준다", () => {
    const result = run([
      sample(),
      sample({ inputFocused: true, visualHeight: 500 }),
    ]);

    expect(result.open).toBe(true);
    expect(result.offset).toBe(300);
  });

  it("iOS가 visual viewport를 밀어 올려도 열림이다", () => {
    const result = run([
      sample(),
      sample({ inputFocused: true, visualHeight: 500, visualOffsetTop: 300 }),
    ]);

    expect(result.open).toBe(true);
    expect(result.offset).toBe(0);
  });

  it("포커스가 빠지면 높이가 줄어 있어도 닫힘이다", () => {
    const result = run([
      sample(),
      sample({ inputFocused: true, innerHeight: 480, visualHeight: 480 }),
      sample({ innerHeight: 480, visualHeight: 480 }),
    ]);

    expect(result.open).toBe(false);
    expect(result.offset).toBe(0);
  });

  it("키보드가 닫히기 전에 다시 포커스하면 그대로 열림이다", () => {
    const result = run([
      sample(),
      sample({ inputFocused: true, innerHeight: 480, visualHeight: 480 }),
      sample({ innerHeight: 480, visualHeight: 480 }),
      sample({ inputFocused: true, innerHeight: 480, visualHeight: 480 }),
    ]);

    expect(result.state.baselineHeight).toBe(800);
    expect(result.open).toBe(true);
  });

  it("포커스 중 키보드를 내리면 닫힘이다", () => {
    const result = run([
      sample(),
      sample({ inputFocused: true, innerHeight: 480, visualHeight: 480 }),
      sample({ inputFocused: true }),
    ]);

    expect(result.open).toBe(false);
  });

  it("주소창 접힘 정도의 작은 변화는 열림으로 보지 않는다", () => {
    const result = run([
      sample(),
      sample({ inputFocused: true, innerHeight: 740, visualHeight: 740 }),
    ]);

    expect(result.open).toBe(false);
  });

  it("포커스 중 보이는 높이가 커지면 기준도 올린다", () => {
    const result = run([
      sample({ visualHeight: 740, innerHeight: 740 }),
      sample({ inputFocused: true, innerHeight: 860, visualHeight: 860 }),
      sample({ inputFocused: true, innerHeight: 700, visualHeight: 700 }),
    ]);

    expect(result.state.baselineHeight).toBe(860);
    expect(result.open).toBe(true);
  });

  it("포커스 없이 회전하면 새 너비의 높이를 기준으로 삼는다", () => {
    const result = run([
      sample(),
      sample({ width: 800, innerHeight: 360, visualHeight: 360 }),
      sample({
        inputFocused: true,
        width: 800,
        innerHeight: 200,
        visualHeight: 200,
      }),
    ]);

    expect(result.state.baselineHeight).toBe(360);
    expect(result.open).toBe(true);
  });

  it("기준 높이를 모르면 레이아웃 아래로 가려지는 양으로 판정한다", () => {
    expect(
      run([sample({ inputFocused: true, visualHeight: 500 })]).open,
    ).toBe(true);
    expect(
      run([
        sample({ inputFocused: true, innerHeight: 480, visualHeight: 480 }),
      ]).open,
    ).toBe(false);
  });
});
