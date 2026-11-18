import React from "react";
import { ChevronRightIcon } from "./Icons";

/**
 * 섹션 제목 13/700 + 오른쪽 슬롯. 오른쪽에 44px 링크가 와도 머리 높이는 28px로 같다
 * (링크가 위아래로 8px씩 겹친다).
 */
export const SectionLabel: React.FC<{
  children: React.ReactNode;
  right?: React.ReactNode;
}> = ({ children, right }) => (
  <div className="flex h-7 items-center justify-between px-1">
    <h2 className="text-pk-13 font-bold text-pk-sub">{children}</h2>
    {right ? <div className="-my-2 flex items-center">{right}</div> : null}
  </div>
);

/**
 * 섹션 하나(제목 + 내용). 부모는 세로 gap-2.5 목록이어야 한다.
 * 앞 요소 → 제목 줄 20px(부모 gap 10 + pt-2.5), 제목 줄 → 내용·내용 사이 10px이다.
 * 부모의 첫 요소(화면 머리·컨트롤 바로 아래)면 위 여백을 더하지 않는다.
 */
export const Section: React.FC<{
  title: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, right, children }) => (
  <section className="flex flex-col gap-2.5 pt-2.5 first:pt-0">
    <SectionLabel right={right}>{title}</SectionLabel>
    {children}
  </section>
);

/** 글자 높이 가운데에 맞춘 링크 꺽쇠 */
export const LinkChevron: React.FC = () => (
  <ChevronRightIcon className="size-[1em] shrink-0" />
);

/** 블루 13/700 텍스트 링크(터치 영역 44px) */
export const TextLink: React.FC<{
  children: React.ReactNode;
  onPress: () => void;
  /** true면 끝에 ChevronRightIcon을 글자 높이 가운데로 붙인다 */
  chevron?: boolean;
}> = ({ children, onPress, chevron = false }) => (
  <button
    type="button"
    onClick={onPress}
    className="inline-flex min-h-11 items-center gap-0.5 text-pk-13 font-bold text-pk-primary"
  >
    {children}
    {chevron ? <LinkChevron /> : null}
  </button>
);

/** 미리보기 섹션에 보이는 줄 수. 넘으면 제목 옆 "전체 보기"로 전체 화면을 연다 */
export const PREVIEW_COUNT = 3;

/**
 * 목록 앞 PREVIEW_COUNT개만 보이는 섹션. 더 있으면 제목 옆 "전체 보기"를 보인다. 빈 목록은 호출부가 그리지 않는다.
 */
export const PreviewSection = <T,>({
  title,
  items,
  renderPreview,
  onViewAll,
}: {
  title: string;
  items: readonly T[];
  renderPreview: (preview: readonly T[]) => React.ReactNode;
  onViewAll: () => void;
}): React.ReactElement => (
  <Section
    title={title}
    right={
      items.length > PREVIEW_COUNT ? (
        <TextLink onPress={onViewAll} chevron>
          전체 보기
        </TextLink>
      ) : undefined
    }
  >
    {renderPreview(items.slice(0, PREVIEW_COUNT))}
  </Section>
);
