import { createSpecialMatchShareImage } from "@/components/record/specialMatchShareImage";
import { type PreparedShareImageState, usePreparedShareImage } from "@/hooks/usePreparedShareImage";
import {
  getSpecialMatchShareKey,
  getSpecialMatchShareText,
  type SpecialMatchShareTarget,
} from "@/lib/specialMatchShare";

/**
 * 특수 매치 큰 연출의 "이미지로 공유". 연출을 열 때 이미지를 미리 만들어 두고 누르면 공유한다.
 * target이 null이면 만들지 않는다
 */
export function useSpecialMatchShare(target: SpecialMatchShareTarget | null): PreparedShareImageState {
  return usePreparedShareImage(
    target ? getSpecialMatchShareKey(target) : null,
    () =>
      target
        ? createSpecialMatchShareImage(target)
        : Promise.reject(new Error("공유할 경기가 없어요")),
    target ? getSpecialMatchShareText(target) : "",
  );
}
