import type { ErrorInfo, ReactNode } from "react";
import { Component } from "react";
import { useTranslation } from "react-i18next";

import { captureAnalyticsException } from "@/lib/analytics";

const reportedErrors = new WeakSet<object>();

type ReactErrorKind = "caught" | "uncaught" | "recoverable";
type ReactErrorInfoLike = {
  componentStack?: string | null | undefined;
};

type ReportReactErrorInput = {
  error: unknown;
  errorInfo?: ReactErrorInfoLike | undefined;
  kind: ReactErrorKind;
  operation?: string | undefined;
};

function shouldReport(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return true;
  }
  if (reportedErrors.has(error)) {
    return false;
  }
  reportedErrors.add(error);
  return true;
}

export function reportReactError(input: ReportReactErrorInput): void {
  if (!shouldReport(input.error)) {
    return;
  }

  captureAnalyticsException(input.error, {
    operation: input.operation ?? `react_${input.kind}_error`,
    reactErrorKind: input.kind,
    componentStack: input.errorInfo?.componentStack,
    alertable: true,
    expected: false,
  });
}

export function onCaughtReactError(
  error: unknown,
  errorInfo?: ReactErrorInfoLike | undefined,
): void {
  reportReactError({
    error,
    errorInfo,
    kind: "caught",
    operation: "react_caught_error",
  });
}

export function onUncaughtReactError(
  error: unknown,
  errorInfo?: ReactErrorInfoLike | undefined,
): void {
  reportReactError({
    error,
    errorInfo,
    kind: "uncaught",
    operation: "react_uncaught_error",
  });
}

export function onRecoverableReactError(
  error: unknown,
  errorInfo?: ReactErrorInfoLike | undefined,
): void {
  reportReactError({
    error,
    errorInfo,
    kind: "recoverable",
    operation: "react_recoverable_error",
  });
}

function formatErrorForDisplay(error: unknown): string | null {
  if (!import.meta.env.DEV) {
    return null;
  }

  if (error instanceof Error) {
    return error.stack ?? `${error.name}: ${error.message}`;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unknown render error.";
}

export function RootErrorFallback({ error }: { error?: unknown }): ReactNode {
  const { t } = useTranslation();
  const errorDetails = formatErrorForDisplay(error);

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-6 py-16 text-foreground">
      <section className="w-full max-w-md space-y-4 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("errorBoundary.title")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("errorBoundary.description")}
        </p>
        <button
          className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
          onClick={() => window.location.reload()}
          type="button"
        >
          {t("errorBoundary.reload")}
        </button>
        {errorDetails ? (
          <pre className="max-h-64 overflow-auto rounded-xl bg-muted p-3 text-left text-xs text-muted-foreground">
            {errorDetails}
          </pre>
        ) : null}
      </section>
    </main>
  );
}

type AppErrorBoundaryProps = {
  children: ReactNode;
  fallback?: ReactNode;
};

type AppErrorBoundaryState = {
  error?: unknown;
  hasError: boolean;
};

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    return { error, hasError: true };
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo): void {
    onCaughtReactError(error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return this.props.fallback ?? <RootErrorFallback error={this.state.error} />;
    }

    return this.props.children;
  }
}
