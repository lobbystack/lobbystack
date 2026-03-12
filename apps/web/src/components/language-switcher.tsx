import { useTranslation } from "react-i18next";

import { useLocalePreference } from "@/components/locale-provider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function LanguageSwitcher() {
  const { t } = useTranslation("common");
  const { isSaving, locale, setLocale } = useLocalePreference();

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium tracking-[0.24em] text-muted-foreground uppercase">
        {t("language.label")}
      </span>
      <Select
        disabled={isSaving}
        onValueChange={(value) => void setLocale(value === "fr" ? "fr" : "en")}
        value={locale}
      >
        <SelectTrigger aria-label={t("language.ariaLabel")} className="w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="en">{t("language.english")}</SelectItem>
          <SelectItem value="fr">{t("language.french")}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
