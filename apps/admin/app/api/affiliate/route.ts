import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";

import { affiliateAttributions, affiliateClicks, affiliateCommissions, affiliatePayoutItems, affiliatePayoutRuns, affiliateProfileStats, affiliateProfiles, withBusinessTransaction } from "@lobbystack/db";
import { asApiResponse, getAppDatabase, requireApiSession } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await requireApiSession(request);
    return NextResponse.json(await withBusinessTransaction(getAppDatabase().db, { userId: session.user.id, actorType: "operator" }, async (tx) => {
      let profile = (await tx.select({ id: affiliateProfiles.id, referralCode: affiliateProfiles.referralCode, status: affiliateProfiles.status, payoutEmail: affiliateProfiles.payoutEmail }).from(affiliateProfiles).where(eq(affiliateProfiles.userId, session.user.id)).limit(1))[0];
      if (!profile) {
        const preferred = session.user.name ?? session.user.email?.split("@")[0] ?? `user-${session.user.id.slice(-8)}`;
        const base = preferred.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64) || `user-${session.user.id.slice(-8)}`;
        for (let index = 0; index < 25 && !profile; index += 1) {
          const suffix = index === 0 ? "" : `-${index + 1}`;
          const candidate = `${base.slice(0, 64 - suffix.length).replace(/-+$/g, "")}${suffix}`;
          [profile] = await tx.insert(affiliateProfiles).values({ userId: session.user.id, referralCode: candidate }).onConflictDoNothing().returning({ id: affiliateProfiles.id, referralCode: affiliateProfiles.referralCode, status: affiliateProfiles.status, payoutEmail: affiliateProfiles.payoutEmail });
          if (!profile) {
            profile = (await tx.select({ id: affiliateProfiles.id, referralCode: affiliateProfiles.referralCode, status: affiliateProfiles.status, payoutEmail: affiliateProfiles.payoutEmail }).from(affiliateProfiles).where(eq(affiliateProfiles.userId, session.user.id)).limit(1))[0];
          }
        }
        if (profile) await tx.insert(affiliateProfileStats).values({ affiliateProfileId: profile.id }).onConflictDoNothing();
      }
      if (!profile) throw new Error("Affiliate profile could not be created.");
      const siteUrl = (process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://app.lobbystack.com").replace(/\/$/, "");

      const [stats, clicks, attributions, commissions, payouts] = await Promise.all([
        tx.select({ clickCount: affiliateProfileStats.clickCount, referralCount: affiliateProfileStats.referralCount, conversionCount: affiliateProfileStats.conversionCount, pendingCommissionCents: affiliateProfileStats.pendingCommissionCents, paidCommissionCents: affiliateProfileStats.paidCommissionCents }).from(affiliateProfileStats).where(eq(affiliateProfileStats.affiliateProfileId, profile.id)).limit(1),
        tx.select({ clickedAt: affiliateClicks.clickedAt, sourceUrl: affiliateClicks.sourceUrl }).from(affiliateClicks).where(eq(affiliateClicks.affiliateProfileId, profile.id)).orderBy(desc(affiliateClicks.clickedAt)).limit(20),
        tx.select({ businessId: affiliateAttributions.businessId, referralCode: affiliateAttributions.referralCode, source: affiliateAttributions.source, attributedAt: affiliateAttributions.attributedAt }).from(affiliateAttributions).where(eq(affiliateAttributions.affiliateProfileId, profile.id)).orderBy(desc(affiliateAttributions.attributedAt)).limit(20),
        tx.select({ sourceKey: affiliateCommissions.sourceKey, amountCents: affiliateCommissions.amountCents, commissionCents: affiliateCommissions.commissionCents, currency: affiliateCommissions.currency, status: affiliateCommissions.status, payoutState: affiliateCommissions.payoutState, occurredAt: affiliateCommissions.occurredAt, clearsAt: affiliateCommissions.clearsAt }).from(affiliateCommissions).where(eq(affiliateCommissions.affiliateProfileId, profile.id)).orderBy(desc(affiliateCommissions.occurredAt)).limit(50),
        tx.select({ periodKey: affiliatePayoutRuns.periodKey, status: affiliatePayoutItems.status, amountCents: affiliatePayoutItems.amountCents, currency: affiliatePayoutItems.currency, paidAt: affiliatePayoutItems.paidAt, externalReference: affiliatePayoutItems.externalReference }).from(affiliatePayoutItems).innerJoin(affiliatePayoutRuns, eq(affiliatePayoutRuns.id, affiliatePayoutItems.payoutRunId)).where(eq(affiliatePayoutItems.affiliateProfileId, profile.id)).orderBy(desc(affiliatePayoutItems.createdAt)).limit(20),
      ]);

      return { profile: { ...profile, referralLink: `${siteUrl}/signup?via=${encodeURIComponent(profile.referralCode)}` }, stats: stats[0] ?? { clickCount: 0, referralCount: 0, conversionCount: 0, pendingCommissionCents: 0, paidCommissionCents: 0 }, clicks, attributions, commissions, payouts };
    }));
  } catch (error) {
    return asApiResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requireApiSession(request);
    const body = await request.json() as { payoutEmail?: unknown };
    const payoutEmail = typeof body.payoutEmail === "string" ? body.payoutEmail.trim().toLowerCase() : "";
    if (!payoutEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payoutEmail)) {
      return NextResponse.json({ error: "A valid payout email is required." }, { status: 400 });
    }
    return NextResponse.json(await withBusinessTransaction(getAppDatabase().db, { userId: session.user.id, actorType: "operator" }, async (tx) => {
      const [profile] = await tx.update(affiliateProfiles).set({ payoutEmail, updatedAt: new Date() }).where(eq(affiliateProfiles.userId, session.user.id)).returning({ id: affiliateProfiles.id, payoutEmail: affiliateProfiles.payoutEmail });
      if (!profile) return { profile: null };
      return { profile };
    }));
  } catch (error) {
    return asApiResponse(error);
  }
}
