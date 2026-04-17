import type { ReactNode } from "react";

type SectionBlockProps = {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
};

export function SectionBlock({
  title,
  description,
  children,
  action,
  className,
}: SectionBlockProps) {
  return (
    <section className={`flex flex-col gap-5 ${className ?? ""}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="type-section-title">{title}</h2>
          {description && (
            <p className="type-section-description">{description}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}
