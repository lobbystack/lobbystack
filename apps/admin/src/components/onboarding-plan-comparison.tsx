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
    <span className="inline-flex flex-col gap-0.5">
      <span className="font-medium text-foreground">{value.included}</span>
      {value.then ? <span className="type-caption text-muted-foreground">{value.then}</span> : null}
    </span>
  );
}

export function OnboardingPlanComparison({ locale, t }: { locale: string; t: OnboardingT }) {
  const name = Object.fromEntries(planCards(locale).map((card) => [card.slug, card.name]));
  return (
    <section id="compare">
      <h2 className="mb-4 text-center type-page-title">
        {t("plan.compareTitle")}
      </h2>
      <p className="mx-auto mb-12 max-w-lg text-center type-body-muted">
        {t("plan.compareDescription")}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] type-body">
          <thead>
            <tr className="border-b border-border/60">
              <th className="pr-8 pb-4 text-left type-meta">{t("plan.featureHeader")}</th>
              <th className="w-[150px] px-4 pb-4 text-center type-meta">{name.free_cloud}</th>
              <th className="w-[150px] px-4 pb-4 text-center type-meta">{name.starter}</th>
              <th className="w-[150px] px-4 pb-4 text-center type-meta"><span className="inline-flex items-center gap-1.5">{name.pro}<span className="rounded-full bg-foreground px-1.5 py-px type-label text-background">{t("plan.popular")}</span></span></th>
              <th className="w-[150px] px-4 pb-4 text-center type-meta">{name.enterprise}</th>
            </tr>
          </thead>
          <tbody>
            {planComparison(locale).map((group) => (
              <Fragment key={group.category}>
                <tr><td className="pt-8 pb-3 type-meta" colSpan={5}>{group.category}</td></tr>
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
