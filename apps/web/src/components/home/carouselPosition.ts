/**
 * 가로 스크롤 위치에서 지금 카드 번호를 고른다. 각 카드의 맞춤 위치(왼쪽 끝 - 스크롤 여백)에
 * 가장 가까운 카드이고, 끝까지 넘겼으면 마지막 카드다(마지막 카드는 왼쪽 끝까지 오지 못한다).
 * 넘길 거리가 없으면(숨은 탭이라 크기가 0인 경우 포함) 첫 카드다
 */
export const getActiveSlideIndex = ({
  scrollLeft,
  maxScrollLeft,
  slideOffsets,
}: {
  scrollLeft: number;
  maxScrollLeft: number;
  /** 각 카드의 맞춤 위치 */
  slideOffsets: readonly number[];
}) => {
  if (slideOffsets.length === 0 || maxScrollLeft <= 0) return 0;
  if (scrollLeft >= maxScrollLeft - 1) return slideOffsets.length - 1;
  let nearest = 0;
  slideOffsets.forEach((offset, index) => {
    if (Math.abs(offset - scrollLeft) < Math.abs(slideOffsets[nearest] - scrollLeft)) {
      nearest = index;
    }
  });
  return nearest;
};
