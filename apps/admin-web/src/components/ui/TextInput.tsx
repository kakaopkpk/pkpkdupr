import React from "react";
import { cx } from "./cx";

export const textInputClassName =
  "h-10 w-full rounded-pk-sm border-0 bg-pk-bg px-3.5 text-pk-15 text-pk-ink placeholder:text-pk-muted outline-none focus-visible:ring-2 focus-visible:ring-pk-primary-line disabled:text-pk-muted";

export const TextInput: React.FC<
  React.InputHTMLAttributes<HTMLInputElement> & { ref?: React.Ref<HTMLInputElement> }
> = ({ className, ...rest }) => (
  <input className={cx(textInputClassName, className)} {...rest} />
);
