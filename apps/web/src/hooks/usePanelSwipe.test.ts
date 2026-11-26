import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { attachPanelSwipe, PANEL_SETTLE_DURATION_MS, type PanelSwipeStep } from "./usePanelSwipe";

const AREA_WIDTH = 390;
const PANEL_WIDTH = 340;
const CARD_COUNT = 15;

/** 판 넘기기 리스너가 읽는 만큼만 흉내 낸 트랙. transform은 바로 최종 값이 된다 */
const createTrack = () => ({
  style: { transform: "", transition: "" },
  getBoundingClientRect: () => ({}),
});

const parseTranslateX = (transform: string) => {
  const match = /translate3d\((-?[\d.]+)px/.exec(transform);
  return match ? Number(match[1]) : 0;
};

const touchEvent = (type: string, time: number, x?: number, y = 300) => {
  const event = new Event(type, { cancelable: true });
  Object.defineProperty(event, "timeStamp", { value: time });
  Object.defineProperty(event, "touches", {
    value: x === undefined ? [] : [{ clientX: x, clientY: y }],
  });
  return event;
};

/** 규칙 안내처럼 지금 카드 번호를 들고, 손가락 이벤트를 차례로 보낸다 */
const setup = () => {
  const area = Object.assign(new EventTarget(), { clientWidth: AREA_WIDTH });
  const track = createTrack();
  let index = 0;
  const onSwipe = vi.fn((step: PanelSwipeStep) => {
    index += step;
  });
  const { detach, slideIn } = attachPanelSwipe(
    area as unknown as HTMLElement,
    track as unknown as HTMLElement,
    {
      onSwipe,
      canSwipe: (step) => index + step >= 0 && index + step < CARD_COUNT,
      getPanelWidth: () => PANEL_WIDTH,
      onSlidingChange: () => {},
    },
  );
  let time = 0;
  const send = (type: string, x?: number, y?: number) => {
    const event = touchEvent(type, time, x, y);
    area.dispatchEvent(event);
    return event;
  };
  /** startX에서 endX까지 16ms 간격 touchmove로 끌고 뗀다 */
  const swipe = (startX: number, endX: number, moves = 10) => {
    send("touchstart", startX);
    for (let i = 1; i <= moves; i += 1) {
      time += 16;
      send("touchmove", startX + ((endX - startX) * i) / moves);
    }
    send("touchend");
  };
  return {
    track,
    onSwipe,
    detach,
    slideIn,
    send,
    swipe,
    getIndex: () => index,
    wait: (ms: number) => {
      time += ms;
      vi.advanceTimersByTime(ms);
    },
  };
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("getComputedStyle", (element: { style: { transform: string } }) => ({
    transform: element.style.transform || "none",
  }));
  vi.stubGlobal(
    "DOMMatrixReadOnly",
    class {
      m41: number;
      constructor(transform: string) {
        this.m41 = parseTranslateX(transform);
      }
    },
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("attachPanelSwipe", () => {
  it("끄는 동안에는 번호를 바꾸지 않고, 놓을 때 한 번만 넘긴다", () => {
    const { onSwipe, send, getIndex } = setup();
    send("touchstart", 300);
    for (let x = 290; x >= 20; x -= 10) send("touchmove", x);
    expect(onSwipe).not.toHaveBeenCalled();
    send("touchend");
    expect(onSwipe).toHaveBeenCalledTimes(1);
    expect(getIndex()).toBe(1);
  });

  it("한 칸보다 멀리 끌어도 트랙은 한 칸까지만 따라오고 한 장만 넘긴다", () => {
    const { track, send, getIndex } = setup();
    send("touchstart", 380);
    send("touchmove", 370);
    send("touchmove", -400);
    expect(parseTranslateX(track.style.transform)).toBe(-PANEL_WIDTH);
    send("touchend");
    expect(getIndex()).toBe(1);
  });

  it("넘김이 정착하기 전에 연달아 밀어도 스와이프마다 한 장씩 넘긴다", () => {
    const { onSwipe, swipe, getIndex, wait } = setup();
    swipe(300, 150);
    wait(50);
    swipe(300, 150);
    wait(50);
    swipe(300, 150);
    expect(onSwipe).toHaveBeenCalledTimes(3);
    expect(getIndex()).toBe(3);
    wait(PANEL_SETTLE_DURATION_MS);
    swipe(300, 150);
    expect(getIndex()).toBe(4);
  });

  it("살짝 끌었다 놓으면 넘기지 않고, 탭·세로 스크롤도 넘기지 않는다", () => {
    const { onSwipe, swipe, send } = setup();
    swipe(300, 280);
    send("touchstart", 200);
    send("touchend");
    send("touchstart", 200, 300);
    send("touchmove", 205, 200);
    send("touchmove", 120, 100);
    send("touchend");
    expect(onSwipe).not.toHaveBeenCalled();
  });

  it("첫·마지막 카드 바깥으로는 넘기지 않는다", () => {
    const { onSwipe, swipe } = setup();
    swipe(50, 300);
    expect(onSwipe).not.toHaveBeenCalled();
  });

  it("버튼 넘김(slideIn) 직후의 스와이프도 한 장만 넘긴다", () => {
    const { slideIn, onSwipe, swipe, getIndex } = setup();
    slideIn(1);
    swipe(300, 150);
    expect(onSwipe).toHaveBeenCalledTimes(1);
    expect(getIndex()).toBe(1);
  });

  it("떼고 나면 리스너가 남지 않는다", () => {
    const { swipe, detach, onSwipe, send } = setup();
    swipe(300, 150);
    detach();
    swipe(300, 150);
    send("touchend");
    expect(onSwipe).toHaveBeenCalledTimes(1);
  });
});
