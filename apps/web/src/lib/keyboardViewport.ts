/**
 * 보이는 높이가 기준 높이보다 이만큼 이상 줄어야 키보드가 열렸다고 본다.
 * 주소창 접힘·펼침 같은 작은 변화는 열림으로 보지 않는다.
 */
export const KEYBOARD_OPEN_MIN_SHRINK_PX = 150;

export interface KeyboardViewportState {
  /** 키보드가 없을 때의 보이는 높이. 아직 모르면 null */
  baselineHeight: number | null;
  /** 기준 높이를 잰 때의 화면 너비. 너비가 바뀌면(회전) 기준 높이를 다시 잰다 */
  baselineWidth: number | null;
}

export interface KeyboardViewportSample {
  /** 키보드를 띄우는 입력칸에 포커스가 있는지 */
  inputFocused: boolean;
  width: number;
  innerHeight: number;
  visualHeight: number;
  visualOffsetTop: number;
}

export interface KeyboardViewportResult {
  state: KeyboardViewportState;
  open: boolean;
  /** 레이아웃 아래쪽이 키보드에 가려지는 양(px). 레이아웃이 키보드만큼 줄어드는 브라우저에서는 0이다 */
  offset: number;
}

export const INITIAL_KEYBOARD_VIEWPORT_STATE: KeyboardViewportState = {
  baselineHeight: null,
  baselineWidth: null,
};

/**
 * 키보드 열림 여부와 가려지는 양을 계산한다.
 *
 * `innerHeight - visualViewport.height`만으로는 판정할 수 없다. 안드로이드 Chrome은
 * `interactive-widget=resizes-content`라 레이아웃도 같이 줄어 차이가 0이고, iOS는 입력칸을
 * 보이려고 visual viewport를 밀어 올리면 `offsetTop`만큼 차이가 사라진다. 그래서 입력칸
 * 포커스가 없을 때의 보이는 높이를 기준으로 두고, 포커스 중 그보다 충분히 줄었으면 열림으로 본다.
 */
export const measureKeyboardViewport = (
  prev: KeyboardViewportState,
  sample: KeyboardViewportSample,
): KeyboardViewportResult => {
  const { inputFocused, width, innerHeight, visualHeight, visualOffsetTop } =
    sample;
  let { baselineHeight, baselineWidth } = prev;

  if (baselineWidth !== width) {
    // 포커스 중 회전하면 키보드가 열린 높이일 수 있어 기준을 모르는 상태로 둔다
    baselineWidth = width;
    baselineHeight = inputFocused ? null : visualHeight;
  } else if (!inputFocused) {
    baselineHeight = visualHeight;
  } else if (baselineHeight !== null) {
    // 포커스 중 주소창이 접히는 등으로 커지면 기준도 올린다
    baselineHeight = Math.max(baselineHeight, visualHeight);
  }

  const offset = inputFocused
    ? Math.max(0, Math.round(innerHeight - visualHeight - visualOffsetTop))
    : 0;
  const open =
    inputFocused &&
    (baselineHeight !== null
      ? baselineHeight - visualHeight >= KEYBOARD_OPEN_MIN_SHRINK_PX
      : offset > 0);

  return { state: { baselineHeight, baselineWidth }, open, offset };
};
