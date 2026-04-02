import { useTranslation } from "react-i18next";

export function LoadingScreen() {
  const { t } = useTranslation("common");

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/20 px-6">
      <div className="flex w-full max-w-sm flex-col gap-3 rounded-3xl border border-border/70 bg-card/90 p-8 text-center">
        <p className="text-sm font-medium text-muted-foreground">
          {t("appName")}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">{t("loading.title")}</h1>
        <p className="text-sm leading-6 text-muted-foreground">
          {t("loading.description")}
        </p>
      </div>
    </div>
  );
}
