import { Fragment } from "react";
import { planCards, planComparison, type ComparisonValue } from "@lobbystack/shared";
import { useTranslation } from "react-i18next";
import { Check, Minus } from "lucide-react";

type OnboardingT = ReturnType<typeof useTranslation<"onboarding">>["t"];

function ComparisonCell({ t, value }: { t: OnboardingT; value: ComparisonValue }) {
  if (typeof value === "boolean") {
    return value ? (
      <span><Check aria-hidden="true" className="mx-auto size-4 text-foreground/60" /><span className="sr-only">{t("plan.comparison.included")}</span></span>
    ) : (
      <span><Minus aria-hidden="true" className="mx-auto size-4 text-muted-foreground/30" /><span className="sr-only">{t("plan.comparison.notIncluded")}</span></span>
    );
  }

  if (typeof value === "string") return <span className="text-muted-foreground">{value}</span>;

  return (
    <span className="inline-flex flex-col gap-0.5 leading-tight">
      <span className="font-medium text-foreground">{value.included}</span>
      {value.then ? <span className="text-xs text-muted-foreground">{value.then}</span> : null}
    </span>
  );
}

export function OnboardingPlanComparison({ locale, t }: { locale: string; t: OnboardingT }) {
  const name = Object.fromEntries(planCards(locale).map((card) => [card.slug, card.name]));
  return (
    <section id="compare">
      <h2 className="mb-4 text-center font-heading text-2xl font-semibold tracking-tighter md:text-3xl">
        {t("plan.compareTitle")}
      </h2>
      <p className="mx-auto mb-12 max-w-lg text-center text-sm leading-relaxed text-muted-foreground">
        {t("plan.compareDescription")}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border/60">
              <th className="pr-8 pb-4 text-left text-xs font-medium text-muted-foreground">{t("plan.featureHeader")}</th>
              <th className="w-[150px] px-4 pb-4 text-center text-xs font-medium text-muted-foreground">{name.free_cloud}</th>
              <th className="w-[150px] px-4 pb-4 text-center text-xs font-medium text-muted-foreground">{name.starter}</th>
              <th className="w-[150px] px-4 pb-4 text-center text-xs font-medium text-muted-foreground"><span className="inline-flex items-center gap-1.5">{name.pro}<span className="rounded-full bg-foreground px-1.5 py-px text-[10px] font-medium text-background">{t("plan.popular")}</span></span></th>
              <th className="w-[150px] px-4 pb-4 text-center text-xs font-medium text-muted-foreground">{name.enterprise}</th>
            </tr>
          </thead>
          <tbody>
            {planComparison(locale).map((group) => (
              <Fragment key={group.category}>
                <tr><td className="pt-8 pb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase" colSpan={5}>{group.category}</td></tr>
                {group.rows.map((row) => (
                  <tr className="border-b border-border/40 last:border-0" key={row.feature}>
                    <td className="py-3 pr-8 text-foreground">{row.feature}</td>
                    {[row.free, row.starter, row.pro, row.enterprise].map((value, index) => <td className="px-4 py-3 text-center" key={index}><ComparisonCell t={t} value={value} /></td>)}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
