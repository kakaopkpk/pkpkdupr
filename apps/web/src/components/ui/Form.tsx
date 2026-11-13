import React, { useId } from "react";
import { ChevronRightIcon } from "./Icons";
import { cx } from "./cx";

/** 52px 입력칸. #f3f5f9 바탕, error면 1.5px 빨강 안쪽 테두리 */
export const TextField: React.FC<
  React.InputHTMLAttributes<HTMLInputElement> & {
    label?: string;
    error?: boolean;
    ref?: React.Ref<HTMLInputElement>;
  }
> = ({ label, error = false, className, id, ...rest }) => {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const input = (
    <input
      id={inputId}
      aria-invalid={error || undefined}
      className={cx(
        // 16px 미만이면 iOS가 포커스 때 화면을 확대하므로 입력 글자는 16px
        "h-[52px] w-full rounded-pk-sm bg-pk-bg px-4 text-[16px] text-pk-ink outline-none placeholder:text-pk-muted",
        "focus-visible:shadow-[inset_0_0_0_1.5px_var(--color-pk-primary)]",
        error && "shadow-[inset_0_0_0_1.5px_var(--color-pk-down)]",
        className,
      )}
      {...rest}
    />
  );

  if (!label) return input;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-pk-13 font-bold text-pk-sub">
        {label}
      </label>
      {input}
    </div>
  );
};

/** 52px 설정형 행 */
export const ListRow: React.FC<{
  label: string;
  value?: React.ReactNode;
  onPress?: () => void;
  showChevron?: boolean;
}> = ({ label, value, onPress, showChevron = !!onPress }) => {
  const content = (
    <>
      <span className="min-w-0 flex-1 truncate text-pk-15 font-medium text-pk-ink">
        {label}
      </span>
      {value !== undefined ? (
        <span className="shrink-0 text-pk-15 text-pk-sub">{value}</span>
      ) : null}
      {showChevron ? <ChevronRightIcon /> : null}
    </>
  );
  const className =
    "flex min-h-[52px] w-full items-center gap-3 text-left not-last:border-b not-last:border-pk-divider";

  return onPress ? (
    <button type="button" onClick={onPress} className={className}>
      {content}
    </button>
  ) : (
    <div className={className}>{content}</div>
  );
};
