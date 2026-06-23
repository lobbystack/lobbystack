import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { CopyIcon, ExternalLinkIcon, GiftIcon, SettingsIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { api } from "../../../../../convex/_generated/api";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCard,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useObservedMutation } from "@/lib/observed-convex";

type CurrencyInput = {
  amountCents: number;
  currency: string;
};

function formatCurrency(input: CurrencyInput): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: input.currency.toUpperCase(),
  }).format(input.amountCents / 100);
}

function formatDate(value: string | null): string {
  if (!value) {
    return "";
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function StatCard(props: {
  label: string;
  value: string;
  description: string;
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{props.label}</CardDescription>
        <CardTitle className="text-2xl">{props.value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{props.description}</p>
      </CardContent>
    </Card>
  );
}

function LoadingAffiliatePage() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <Skeleton className="h-10 w-64" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.8fr)]">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    </div>
  );
}

export function AffiliatePage() {
  const { ready, t } = useTranslation("affiliate", { useSuspense: false });
  const summary = useQuery(api.affiliates.getDashboardSummary, {});
  const commissions = useQuery(api.affiliates.listCommissions, {});
  const payouts = useQuery(api.affiliates.listPayouts, {});
  const activate = useObservedMutation(api.affiliates.activate);
  const updatePaypalEmail = useObservedMutation(api.affiliates.updatePaypalEmail);
  const [paypalEmail, setPaypalEmail] = useState("");
  const [isActivating, setIsActivating] = useState(false);
  const [isSavingPaypal, setIsSavingPaypal] = useState(false);

  const currency = summary?.terms.currency ?? "usd";
  const profile = summary?.profile ?? null;
  const referralUrl = summary?.referralUrl ?? "";

  const readyToPay = useMemo(() => {
    if (!summary) {
      return false;
    }
    return summary.stats.eligibleCents >= summary.terms.minimumPayoutCents;
  }, [summary]);

  if (
    !ready ||
    summary === undefined ||
    commissions === undefined ||
    payouts === undefined
  ) {
    return <LoadingAffiliatePage />;
  }

  async function handleActivate() {
    setIsActivating(true);
    try {
      await activate({});
      toast.success(t("toast.activated"));
    } catch {
      toast.error(t("toast.activateFailed"));
    } finally {
      setIsActivating(false);
    }
  }

  async function handleCopy() {
    if (!referralUrl) {
      return;
    }
    await navigator.clipboard.writeText(referralUrl);
    toast.success(t("toast.copied"));
  }

  async function handlePaypalSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSavingPaypal(true);
    try {
      await updatePaypalEmail({ paypalEmail });
      toast.success(t("toast.paypalSaved"));
      setPaypalEmail("");
    } catch {
      toast.error(t("toast.paypalFailed"));
    } finally {
      setIsSavingPaypal(false);
    }
  }

  const settingsDialog = profile ? (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" />}>
        <SettingsIcon data-icon="inline-start" />
        {t("settings.open")}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("settings.title")}</DialogTitle>
          <DialogDescription>{t("settings.description")}</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-6" onSubmit={handlePaypalSave}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="paypal-email">
                {t("settings.paypalEmail")}
              </FieldLabel>
              <Input
                id="paypal-email"
                onChange={(event) => setPaypalEmail(event.target.value)}
                placeholder={profile.paypalEmail ?? t("settings.paypalPlaceholder")}
                type="email"
                value={paypalEmail}
              />
              <FieldDescription>{t("settings.paypalDescription")}</FieldDescription>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button disabled={isSavingPaypal} type="submit">
              {isSavingPaypal ? t("settings.saving") : t("settings.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  ) : null;

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-col gap-2">
        <PageHeader actions={settingsDialog} title={t("title")} />
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          {t("description")}
        </p>
      </div>

      {!profile ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("inactive.title")}</CardTitle>
            <CardDescription>{t("inactive.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button disabled={isActivating} onClick={() => void handleActivate()}>
              <GiftIcon data-icon="inline-start" />
              {isActivating ? t("inactive.activating") : t("inactive.action")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.8fr)]">
            <Card>
              <CardHeader>
                <CardTitle>{t("referral.title")}</CardTitle>
                <CardDescription>{t("referral.description")}</CardDescription>
                <CardAction>
                  <Badge variant="secondary">{t("referral.active")}</Badge>
                </CardAction>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input readOnly value={referralUrl} />
                  <Button onClick={() => void handleCopy()} type="button">
                    <CopyIcon data-icon="inline-start" />
                    {t("referral.copy")}
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  {t("referral.code", { code: profile.referralCode })}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("terms.title")}</CardTitle>
                <CardDescription>{t("terms.description")}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">{t("terms.commission")}</span>
                  <span className="font-medium">
                    {Math.round(summary.terms.commissionRate * 100)}%
                  </span>
                </div>
                <Separator />
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">{t("terms.hold")}</span>
                  <span className="font-medium">
                    {t("terms.days", { count: summary.terms.holdDays })}
                  </span>
                </div>
                <Separator />
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">{t("terms.minimum")}</span>
                  <span className="font-medium">
                    {formatCurrency({
                      amountCents: summary.terms.minimumPayoutCents,
                      currency,
                    })}
                  </span>
                </div>
                <a
                  className="inline-flex items-center gap-2 text-sm font-medium text-foreground underline-offset-4 hover:underline"
                  href="/terms/#affiliate-program"
                  rel="noreferrer"
                  target="_blank"
                >
                  {t("terms.link")}
                  <ExternalLinkIcon />
                </a>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
            <StatCard
              description={t("stats.clicksDescription")}
              label={t("stats.clicks")}
              value={String(summary.stats.clicks)}
            />
            <StatCard
              description={t("stats.referralsDescription")}
              label={t("stats.referrals")}
              value={String(summary.stats.referrals)}
            />
            <StatCard
              description={t("stats.conversionsDescription")}
              label={t("stats.conversions")}
              value={String(summary.stats.conversions)}
            />
            <StatCard
              description={t("stats.pendingDescription")}
              label={t("stats.pending")}
              value={formatCurrency({ amountCents: summary.stats.pendingCents, currency })}
            />
            <StatCard
              description={
                readyToPay ? t("stats.eligibleReady") : t("stats.eligibleWaiting")
              }
              label={t("stats.eligible")}
              value={formatCurrency({ amountCents: summary.stats.eligibleCents, currency })}
            />
            <StatCard
              description={t("stats.paidDescription")}
              label={t("stats.paid")}
              value={formatCurrency({ amountCents: summary.stats.paidCents, currency })}
            />
          </div>

          <Tabs defaultValue="quickstart">
            <TabsList variant="line">
              <TabsTrigger value="quickstart">{t("tabs.quickstart")}</TabsTrigger>
              <TabsTrigger value="earnings">{t("tabs.earnings")}</TabsTrigger>
              <TabsTrigger value="payouts">{t("tabs.payouts")}</TabsTrigger>
              <TabsTrigger value="faq">{t("tabs.faq")}</TabsTrigger>
            </TabsList>
            <TabsContent className="pt-4" value="quickstart">
              <div className="grid gap-4 md:grid-cols-3">
                {["share", "resources", "receive"].map((key) => (
                  <Card key={key}>
                    <CardHeader>
                      <CardTitle>{t(`quickstart.${key}.title`)}</CardTitle>
                      <CardDescription>{t(`quickstart.${key}.description`)}</CardDescription>
                    </CardHeader>
                  </Card>
                ))}
              </div>
            </TabsContent>
            <TabsContent className="pt-4" value="earnings">
              <TableCard>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("earnings.date")}</TableHead>
                      <TableHead>{t("earnings.sale")}</TableHead>
                      <TableHead>{t("earnings.commission")}</TableHead>
                      <TableHead>{t("earnings.clears")}</TableHead>
                      <TableHead>{t("earnings.status")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {commissions.length === 0 ? (
                      <TableRow>
                        <TableCell className="text-muted-foreground" colSpan={5}>
                          {t("earnings.empty")}
                        </TableCell>
                      </TableRow>
                    ) : (
                      commissions.map((commission) => (
                        <TableRow key={commission.id}>
                          <TableCell>{formatDate(commission.occurredAt)}</TableCell>
                          <TableCell>
                            {formatCurrency({
                              amountCents: commission.amountCents,
                              currency: commission.currency,
                            })}
                          </TableCell>
                          <TableCell>
                            {formatCurrency({
                              amountCents: commission.commissionCents,
                              currency: commission.currency,
                            })}
                          </TableCell>
                          <TableCell>{formatDate(commission.clearsAt)}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">
                              {t(`statuses.${commission.status}`)}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableCard>
            </TabsContent>
            <TabsContent className="pt-4" value="payouts">
              <TableCard>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("payouts.date")}</TableHead>
                      <TableHead>{t("payouts.amount")}</TableHead>
                      <TableHead>{t("payouts.paypal")}</TableHead>
                      <TableHead>{t("payouts.status")}</TableHead>
                      <TableHead>{t("payouts.reference")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payouts.length === 0 ? (
                      <TableRow>
                        <TableCell className="text-muted-foreground" colSpan={5}>
                          {t("payouts.empty")}
                        </TableCell>
                      </TableRow>
                    ) : (
                      payouts.map((payout) => (
                        <TableRow key={payout.id}>
                          <TableCell>{formatDate(payout.createdAt)}</TableCell>
                          <TableCell>
                            {formatCurrency({
                              amountCents: payout.amountCents,
                              currency: payout.currency,
                            })}
                          </TableCell>
                          <TableCell>{payout.paypalEmail}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">{t(`statuses.${payout.status}`)}</Badge>
                          </TableCell>
                          <TableCell>{payout.externalReference ?? t("payouts.noReference")}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableCard>
            </TabsContent>
            <TabsContent className="pt-4" value="faq">
              <div className="grid gap-4 md:grid-cols-2">
                {["when", "minimum", "method", "refunds"].map((key) => (
                  <Card key={key}>
                    <CardHeader>
                      <CardTitle>{t(`faq.${key}.question`)}</CardTitle>
                      <CardDescription>{t(`faq.${key}.answer`)}</CardDescription>
                    </CardHeader>
                  </Card>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
