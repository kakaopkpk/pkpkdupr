import React, { useRef } from "react";
import { cx } from "./cx";

type NativeInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "onChange" | "className"
>;

export interface SearchFieldProps extends NativeInputProps {
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
}

const SearchIcon: React.FC = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    className="shrink-0"
  >
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4 4" />
  </svg>
);

/** 회색 원 안의 흰 X */
const ClearIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="10" fill="currentColor" />
    <path
      d="M8.5 8.5l7 7M15.5 8.5l-7 7"
      fill="none"
      stroke="white"
      strokeWidth="2.2"
      strokeLinecap="round"
    />
  </svg>
);

/** 44px 검색칸. 검색어가 있으면 오른쪽 X로 비우고, 포커스 때 테두리를 그리지 않는다 */
export const SearchField: React.FC<SearchFieldProps> = ({
  value,
  onValueChange,
  className,
  ...rest
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  // 아이콘·여백을 눌러도 입력칸에 포커스가 가도록 label로 감싼다
  return (
    <label
      className={cx(
        "flex h-11 items-center gap-2 rounded-pk-sm bg-pk-bg pl-3.5 text-pk-muted",
        className,
      )}
    >
      <SearchIcon />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        // 16px 미만이면 iOS가 포커스 때 화면을 확대한다
        className="pk-search-input min-w-0 flex-1 appearance-none bg-transparent text-[16px] text-pk-ink outline-none placeholder:text-pk-muted"
        {...rest}
      />
      {value ? (
        <button
          type="button"
          aria-label="검색어 지우기"
          // 누르는 동안 입력칸 포커스가 빠지면 모바일 키보드가 내려갔다 다시 올라온다
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => {
            onValueChange("");
            inputRef.current?.focus();
          }}
          className="flex h-full w-11 shrink-0 items-center justify-center text-pk-quiet"
        >
          <ClearIcon />
        </button>
      ) : (
        <span aria-hidden="true" className="w-1.5 shrink-0" />
      )}
    </label>
  );
};
