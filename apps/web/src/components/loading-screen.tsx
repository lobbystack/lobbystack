import { useTranslation } from "react-i18next";
import { Spinner } from "@/components/ui/spinner";

export function LoadingScreen() {
  const { t } = useTranslation("common");

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <Spinner className="size-8" />
        <p className="type-body-muted">{t("loading.title")}</p>
      </div>
    </div>
  );
}
