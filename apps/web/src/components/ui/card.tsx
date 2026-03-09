import type { HTMLAttributes, PropsWithChildren } from "react";

export function Card({
  children,
  className = "",
  ...props
}: PropsWithChildren<HTMLAttributes<HTMLDivElement>>) {
  return (
    <section className={`card ${className}`.trim()} {...props}>
      {children}
    </section>
  );
}

export function CardHeader({
  children,
  className = "",
  ...props
}: PropsWithChildren<HTMLAttributes<HTMLDivElement>>) {
  return (
    <header className={`card-header ${className}`.trim()} {...props}>
      {children}
    </header>
  );
}

export function CardTitle({
  children,
  className = "",
  ...props
}: PropsWithChildren<HTMLAttributes<HTMLHeadingElement>>) {
  return (
    <h2 className={`card-title ${className}`.trim()} {...props}>
      {children}
    </h2>
  );
}

export function CardDescription({
  children,
  className = "",
  ...props
}: PropsWithChildren<HTMLAttributes<HTMLParagraphElement>>) {
  return (
    <p className={`card-description ${className}`.trim()} {...props}>
      {children}
    </p>
  );
}

export function CardContent({
  children,
  className = "",
  ...props
}: PropsWithChildren<HTMLAttributes<HTMLDivElement>>) {
  return (
    <div className={`card-content ${className}`.trim()} {...props}>
      {children}
    </div>
  );
}
