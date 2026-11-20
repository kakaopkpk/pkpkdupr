/**
 * Tab·Shift+Tab을 container 안의 selector 요소 사이에서만 돌린다(모달 포커스 가두기).
 * 안에 포커스가 없으면 Tab은 첫 요소, Shift+Tab은 마지막 요소로 간다
 */
export const cycleFocusWithin = (
  container: HTMLElement | null,
  selector: string,
  isBackward: boolean,
) => {
  const items = Array.from(container?.querySelectorAll<HTMLElement>(selector) ?? []);
  if (items.length === 0) return;
  const index = items.indexOf(document.activeElement as HTMLElement);
  const nextIndex =
    index === -1
      ? isBackward
        ? items.length - 1
        : 0
      : (index + (isBackward ? -1 : 1) + items.length) % items.length;
  items[nextIndex].focus({ preventScroll: true });
};
