import React from "react";

export const PageHeader: React.FC<{
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}> = ({ title, subtitle, actions }) => (
  <header className="mb-6 flex items-end justify-between gap-4">
    <div className="min-w-0">
      <h1 className="text-pk-26 font-bold text-pk-ink">{title}</h1>
      {subtitle && <p className="mt-1 text-pk-15 text-pk-sub">{subtitle}</p>}
    </div>
    {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
  </header>
);
