import { createHash, randomUUID } from "node:crypto";
import Redis from "ioredis";
import { and, eq, lte, ne } from "drizzle-orm";

import { realtimeEventSchema, type JobEnvelope } from "@lobbystack/contracts";
import { appointments, calendarConnections, calls, contacts, enqueueOutbox, knowledgeDocuments, messages, notifications, phoneNumbers, services, storageObjects, websiteIngestionJobs, withBusinessTransaction, type Database } from "@lobbystack/db";
import { claimAppointmentChangeOtp, claimBillingCheckoutRequest, claimNotificationDelivery, claimPhoneVerificationSend, claimSmsDelivery, deleteCallRecording, deleteExpiredObjectsForBusiness, deleteTranscriptForRetention, expireProspectDemos, finalizeConversationSession, generateAffiliatePayoutRun, generateAndQueueSmsReply, indexDocumentText, loadAppointmentChangeOtpTarget, loadBillingCheckoutRequest, loadBillingUsageEvent, loadPendingProductEvents, loadSmsDeliveryTarget, markAppointmentChangeOtpSent, markBillingCheckoutCreated, markBillingCheckoutFailed, markBillingUsageSynced, markCalendarConnectionSync, markKnowledgeDocumentFailed, markNotificationSent, markNotificationSkipped, markPhoneVerificationSendFailed, markPhoneVerificationSent, markProductEventsSent, reconcileBillingProviderEvent, reconcileResendProviderEvent, recordAiGenerationEvent, recordCallProviderPricing, recordSmsProviderPricing, refreshBusinessSnapshot, releaseAppointmentChangeOtp, releaseNotificationDelivery, releaseSmsDelivery, resolveNotificationDelivery, runPrivacyRetentionSweep, setTransferState, updateAppointmentSyncState, upsertBusyBlocks, markSmsSent, chunkText, upsertWebsiteDocument, type DurableAiUsage } from "@lobbystack/domain";
import { claimOperatorNotificationDelivery, loadOperatorNotificationDelivery, markOperatorNotificationSent, queueDailyOperatorSummaries, releaseOperatorNotificationDelivery } from "@lobbystack/domain";
import { claimNumberProvisioning, completeNumberProvisioning, failNumberProvisioning } from "@lobbystack/domain";
import { getTwilioProviderErrorCode, SecretBox } from "@lobbystack/providers";
import type { DomainContext } from "@lobbystack/domain";
import type { S3StorageProvider, SmtpEmailProvider, TwilioProvider } from "@lobbystack/providers";
import { extractDocumentText } from "./documentExtraction";
import { getMeter } from "@lobbystack/telemetry/node";
import { redactTelemetryProperties, type TelemetryProperties } from "@lobbystack/telemetry";

const ragMeter = getMeter("lobbystack-rag");
const extractionDuration = ragMeter.createHistogram("rag.extraction.duration_ms", { unit: "ms" });
const chunkCount = ragMeter.createHistogram("rag.chunk.count", { unit: "{chunk}" });
const embeddingDuration = ragMeter.createHistogram("rag.embedding.duration_ms", { unit: "ms" });
const embeddingFailures = ragMeter.createCounter("rag.embedding.failures", { unit: "{failure}" });
const indexDuration = ragMeter.createHistogram("rag.index.duration_ms", { unit: "ms" });

export type WorkerDependencies = {
  domain: DomainContext;
  storage?: S3StorageProvider;
  email?: Pick<SmtpEmailProvider, "sendTemplate">;
  twilio?: Pick<TwilioProvider, "sendSms"> & Partial<Pick<TwilioProvider, "getMessagePricing" | "getCallPricing" | "releasePhoneNumber" | "verifyPhone" | "findOwnedPhoneNumber" | "purchasePhoneNumber">>;
  polar?: { recordUsage(input: { meterId: string; externalCustomerId: string; quantity: number; timestamp: string; idempotencyKey: string }): Promise<void>; createCheckout?(input: { productId: string; customerEmail: string; externalCustomerId: string; successUrl: string; idempotencyKey?: string }): Promise<{ checkoutUrl: string; checkoutId: string }> };
  textAi?: { generateReply(input: { instructions: string; prompt: string; context?: string }): Promise<{ text: string }> };
  embeddings?: { embed(values: string[], onUsage?: (usage: DurableAiUsage) => Promise<void> | void): Promise<number[][]> };
  crawler?: { crawl(input: { url: string; limit?: number }): Promise<Array<{ url: string; title?: string; markdown?: string }>> };
  calendar?: { getBusyBlocks(input: { accessToken: string; calendarId: string; startsAt: string; endsAt: string }): Promise<Array<{ startsAt: string; endsAt: string }>>; upsertEvent(input: { accessToken: string; calendarId: string; eventId?: string; clientEventId?: string; title: string; startsAt: string; endsAt: string; description?: string }): Promise<{ externalEventId: string }> };
  productAnalytics?: { capture(events: Array<{ event: string; distinctId: string; properties: Record<string, unknown>; timestamp: string }>): Promise<void> };
  realtime?: Redis;
};

export type JobResult = { status: "completed" | "skipped"; entityId?: string };

function businessIdOrThrow(job: JobEnvelope): string {
  if (!job.businessId) {
    throw new Error(`Job ${job.type} requires a business context.`);
  }
  return job.businessId;
}

function twilioStatusCallback(input: { messageId?: string; notificationId?: string; operatorDeliveryId?: string }): string | undefined {
  const configured = process.env.TWILIO_STATUS_CALLBACK_URL;
  if (!configured) return undefined;
  try {
    const url = new URL(configured);
    if (input.messageId) url.searchParams.set("messageId", input.messageId);
    if (input.notificationId) url.searchParams.set("notificationId", input.notificationId);
    if (input.operatorDeliveryId) url.searchParams.set("operatorDeliveryId", input.operatorDeliveryId);
    return url.toString();
  } catch {
    return configured;
  }
}

function twilioStatusCallbackOption(input: { messageId?: string; notificationId?: string; operatorDeliveryId?: string }): { statusCallback: string } | Record<string, never> {
  const statusCallback = twilioStatusCallback(input);
  return statusCallback ? { statusCallback } : {};
}

export async function handleJob(job: JobEnvelope, dependencies: WorkerDependencies): Promise<JobResult> {
  const businessId = job.businessId;
  switch (job.type) {
    case "phoneVerification.send": {
      const businessId = businessIdOrThrow(job);
      const attemptId = String(job.payload.attemptId ?? "");
      if (!attemptId || !dependencies.twilio?.verifyPhone || !process.env.TWILIO_VERIFY_SERVICE_SID) return { status: "skipped", entityId: attemptId };
      const attempt = await claimPhoneVerificationSend(dependencies.domain, { businessId, attemptId });
      if (!attempt) return { status: "skipped", entityId: attemptId };
      try {
        const verification = await dependencies.twilio.verifyPhone({ to: attempt.phoneE164, serviceSid: process.env.TWILIO_VERIFY_SERVICE_SID });
        await markPhoneVerificationSent(dependencies.domain, { businessId, attemptId, providerVerificationId: verification.verificationSid, status: verification.status });
        return { status: "completed", entityId: attemptId };
      } catch (error) {
        await markPhoneVerificationSendFailed(dependencies.domain, { businessId, attemptId });
        throw error;
      }
    }
    case "snapshot.refresh":
      return { status: "completed", entityId: await refreshBusinessSnapshot(dependencies.domain, { businessId: businessIdOrThrow(job) }) };
    case "knowledge.indexDocument": {
      const id = String(job.payload.documentId);
      const text = String(job.payload.text ?? "");
      const result = await indexKnowledgeText(dependencies, { businessId: businessIdOrThrow(job), documentId: id, text });
      return { status: "completed", entityId: `${id}:${result.chunkCount}` };
    }
    case "knowledge.extractDocument": {
      const businessId = businessIdOrThrow(job);
      const documentId = String(job.payload.documentId);
      const source = await loadKnowledgeSource(dependencies.domain.db, { businessId, documentId });
       if (!source || !dependencies.storage) return { status: "skipped", entityId: documentId };
       let body: Uint8Array;
       try {
         body = await dependencies.storage.getObject({ key: source.objectKey });
       } catch (error) {
         await markKnowledgeDocumentFailed(dependencies.domain, { businessId, documentId });
         throw error;
       }
         const extractionStartedAt = performance.now();
         const text = await extractDocumentText({ body, contentType: source.contentType });
         extractionDuration.record(performance.now() - extractionStartedAt, { content_type: source.contentType.split(";", 1)[0] ?? "unknown" });
       const result = await indexKnowledgeText(dependencies, { businessId, documentId, text });
       return { status: "completed", entityId: `${documentId}:${result.chunkCount}` };
    }
    case "knowledge.crawlWebsite": {
      const url = String(job.payload.url ?? job.payload.websiteUrl ?? "").trim();
      const documentId = typeof job.payload.documentId === "string" ? job.payload.documentId : undefined;
      const websiteIngestionJobId = typeof job.payload.websiteIngestionJobId === "string" ? job.payload.websiteIngestionJobId : undefined;
      if (!url || !dependencies.crawler) {
        if (documentId) await markKnowledgeDocumentFailed(dependencies.domain, { businessId: businessIdOrThrow(job), documentId, error: "Website crawling is not configured." });
        if (websiteIngestionJobId) await updateWebsiteIngestion(dependencies.domain.db, { businessId: businessIdOrThrow(job), websiteIngestionJobId, status: "failed", error: "Website crawling is not configured." });
        return { status: "skipped", entityId: String(job.payload.jobId ?? "") };
      }
      let pages: Array<{ url: string; title?: string; markdown?: string }>;
      try {
        pages = await dependencies.crawler.crawl({ url, ...(typeof job.payload.limit === "number" ? { limit: job.payload.limit } : {}) });
      } catch (error) {
        if (documentId) await markKnowledgeDocumentFailed(dependencies.domain, { businessId: businessIdOrThrow(job), documentId, error: "Website crawling failed." });
        if (websiteIngestionJobId) await updateWebsiteIngestion(dependencies.domain.db, { businessId: businessIdOrThrow(job), websiteIngestionJobId, status: "failed", error: "Website crawling failed." });
        throw error;
      }
      let indexedChunks = 0;
      for (const page of pages) {
        indexedChunks += await indexWebsitePage(dependencies, businessIdOrThrow(job), page);
      }
      if (indexedChunks === 0 && documentId) {
        await markKnowledgeDocumentFailed(dependencies.domain, { businessId: businessIdOrThrow(job), documentId, error: "Website crawl returned no readable content." });
      }
      if (websiteIngestionJobId) {
        await withBusinessTransaction(dependencies.domain.db, { businessId: businessIdOrThrow(job), actorType: "worker" }, async (tx) => {
          await tx.update(websiteIngestionJobs).set({ status: indexedChunks > 0 ? "completed" : "failed", importedCount: pages.length, indexedCount: indexedChunks, errorCount: indexedChunks > 0 ? 0 : 1, lastError: indexedChunks > 0 ? null : "Website crawl returned no readable content.", updatedAt: new Date() }).where(and(eq(websiteIngestionJobs.id, websiteIngestionJobId), eq(websiteIngestionJobs.businessId, businessIdOrThrow(job))));
          if (indexedChunks > 0) await enqueueOutbox(tx, { topic: "snapshot.refresh", businessId: businessIdOrThrow(job), aggregateType: "website_ingestion_job", aggregateId: websiteIngestionJobId, dedupeKey: `website-ingestion:${websiteIngestionJobId}:snapshot`, payload: { businessId: businessIdOrThrow(job), reason: "website_ingestion_completed" } });
        });
      }
      return { status: "completed", entityId: `${String(job.payload.jobId ?? job.jobId)}:${indexedChunks}` };
    }
    case "knowledge.reindexBusiness": {
      const businessId = businessIdOrThrow(job);
      const documents = await withBusinessTransaction(dependencies.domain.db, { businessId, actorType: "worker" }, async (tx) =>
        await tx.select({ id: knowledgeDocuments.id, sourceUrl: knowledgeDocuments.sourceUrl, storageObjectId: knowledgeDocuments.storageObjectId }).from(knowledgeDocuments).where(eq(knowledgeDocuments.businessId, businessId)),
      );
      let indexedDocuments = 0;
      for (const document of documents) {
        if (document.storageObjectId && dependencies.storage) {
          const source = await loadKnowledgeSource(dependencies.domain.db, { businessId, documentId: document.id });
          if (source) {
             const text = await extractDocumentText({ body: await dependencies.storage.getObject({ key: source.objectKey }), contentType: source.contentType });
             await indexKnowledgeText(dependencies, { businessId, documentId: document.id, text });
            indexedDocuments += 1;
          }
        } else if (document.sourceUrl && dependencies.crawler) {
          const pages = await dependencies.crawler.crawl({ url: document.sourceUrl, limit: 1 });
          for (const page of pages) {
            indexedDocuments += (await indexWebsitePage(dependencies, businessId, page)) > 0 ? 1 : 0;
          }
        }
      }
      return { status: indexedDocuments > 0 ? "completed" : "skipped", entityId: `${businessId}:${indexedDocuments}` };
    }
    case "calendar.syncAppointment":
      {
        const businessId = businessIdOrThrow(job);
        const appointmentId = String(job.payload.appointmentId ?? "");
        if (!appointmentId || !dependencies.calendar || !process.env.ENCRYPTION_KEY) return { status: "skipped", entityId: appointmentId };
        const appointment = (await withBusinessTransaction(dependencies.domain.db, { businessId, actorType: "worker" }, async (tx) =>
          await tx.select({ id: appointments.id, startsAt: appointments.startsAt, endsAt: appointments.endsAt, externalEventId: appointments.calendarExternalId, serviceName: services.name, contactName: contacts.name, calendarId: calendarConnections.selectedCalendarId, encryptedAccessToken: calendarConnections.encryptedAccessToken })
            .from(appointments)
            .innerJoin(services, and(eq(services.id, appointments.serviceId), eq(services.businessId, businessId)))
            .leftJoin(contacts, and(eq(contacts.id, appointments.contactId), eq(contacts.businessId, businessId)))
            .innerJoin(calendarConnections, and(eq(calendarConnections.businessId, businessId), ne(calendarConnections.status, "disconnected")))
            .where(and(eq(appointments.id, appointmentId), eq(appointments.businessId, businessId)))
            .limit(1),
        ))[0];
        if (!appointment?.encryptedAccessToken) return { status: "skipped", entityId: appointmentId };
        try {
          const clientEventId = `a${createHash("sha256").update(appointment.id).digest("hex").slice(0, 31)}`;
          const external = await dependencies.calendar.upsertEvent({ accessToken: new SecretBox(process.env.ENCRYPTION_KEY).decrypt(appointment.encryptedAccessToken), calendarId: appointment.calendarId ?? "primary", ...(appointment.externalEventId ? { eventId: appointment.externalEventId } : { clientEventId }), title: appointment.serviceName, startsAt: appointment.startsAt.toISOString(), endsAt: appointment.endsAt.toISOString(), ...(appointment.contactName ? { description: `Appointment for ${appointment.contactName}` } : {}) });
          await updateAppointmentSyncState(dependencies.domain, { businessId, appointmentId, state: "synced", externalEventId: external.externalEventId });
          return { status: "completed", entityId: appointmentId };
        } catch (error) {
          await updateAppointmentSyncState(dependencies.domain, { businessId, appointmentId, state: "failed", error: error instanceof Error ? error.message : String(error) });
          throw error;
        }
      }
    case "calendar.reconcileBusiness": {
      const businessId = businessIdOrThrow(job);
      const encryptionKey = process.env.ENCRYPTION_KEY;
      if (!dependencies.calendar || !encryptionKey) return { status: "skipped", entityId: businessId };
      const connections = await withBusinessTransaction(dependencies.domain.db, { businessId, actorType: "worker" }, async (tx) =>
        await tx.select({ id: calendarConnections.id, calendarId: calendarConnections.selectedCalendarId, encryptedAccessToken: calendarConnections.encryptedAccessToken }).from(calendarConnections).where(and(eq(calendarConnections.businessId, businessId), ne(calendarConnections.status, "disconnected"))),
      );
      const secretBox = new SecretBox(encryptionKey);
      let synced = 0;
      const startsAt = new Date();
      const endsAt = new Date(startsAt.getTime() + 90 * 24 * 60 * 60_000);
      for (const connection of connections) {
        if (!connection.encryptedAccessToken) {
          await markCalendarConnectionSync(dependencies.domain, { businessId, connectionId: connection.id, error: "Calendar access token is missing." });
          continue;
        }
        try {
          const blocks = await dependencies.calendar.getBusyBlocks({ accessToken: secretBox.decrypt(connection.encryptedAccessToken), calendarId: connection.calendarId ?? "primary", startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() });
          await upsertBusyBlocks(dependencies.domain, { businessId, connectionId: connection.id, blocks });
          await markCalendarConnectionSync(dependencies.domain, { businessId, connectionId: connection.id });
          synced += 1;
        } catch (error) {
          await markCalendarConnectionSync(dependencies.domain, { businessId, connectionId: connection.id, error: error instanceof Error ? error.message : String(error) });
          throw error;
        }
      }
      return { status: synced > 0 ? "completed" : "skipped", entityId: `${businessId}:${synced}` };
    }
    case "email.send":
      if (!dependencies.email) {
        return { status: "skipped" };
      }
      {
        const template = job.payload.template === "verify_email" || job.payload.template === "password_reset" || job.payload.template === "invitation" || job.payload.template === "operator_alert"
          ? job.payload.template
          : "operator_alert";
        const variables = typeof job.payload.variables === "object" && job.payload.variables !== null
          ? Object.fromEntries(Object.entries(job.payload.variables).map(([key, value]) => [key, String(value)]))
          : { message: String(job.payload.message ?? ""), url: String(job.payload.url ?? "") };
        await dependencies.email.sendTemplate({
          template,
          to: String(job.payload.to ?? job.payload.email ?? ""),
          subject: String(job.payload.subject ?? "LobbyStack notification"),
          variables,
          idempotencyKey: job.idempotencyKey,
        });
      }
      return { status: "completed" };
    case "email.reconcileDelivery": {
      const providerEventId = String(job.payload.providerEventId ?? "");
      if (!providerEventId) return { status: "skipped" };
      const reconciled = await reconcileResendProviderEvent(dependencies.domain, { businessId: businessIdOrThrow(job), providerEventId });
      return { status: reconciled ? "completed" : "skipped", entityId: providerEventId };
    }
    case "sms.send":
      if (!dependencies.twilio) {
        return { status: "skipped" };
      }
      {
        const businessId = businessIdOrThrow(job);
        const messageId = String(job.payload.messageId);
        if (!await claimSmsDelivery(dependencies.domain, { businessId, messageId })) return { status: "skipped", entityId: messageId };
        const target = await loadSmsDeliveryTarget(dependencies.domain.db, { businessId, messageId });
        if (!target) {
          await releaseSmsDelivery(dependencies.domain, { businessId, messageId });
          return { status: "skipped", entityId: messageId };
        }
        try {
          const result = await dependencies.twilio.sendSms({ to: target.to, from: target.from, body: target.body, ...twilioStatusCallbackOption({ messageId }) });
          await markSmsSent(dependencies.domain, { businessId, messageId, providerMessageId: result.providerMessageId });
          return { status: "completed", entityId: messageId };
        } catch (error) {
          await releaseSmsDelivery(dependencies.domain, { businessId, messageId });
          throw error;
        }
      }
    case "sms.processInbound":
      if (!dependencies.textAi) return { status: "skipped", entityId: String(job.payload.messageId ?? "") };
      return { status: "completed", ...(await generateAndQueueSmsReply(dependencies.domain, { businessId: businessIdOrThrow(job), messageId: String(job.payload.messageId) }, dependencies.textAi).then((messageId) => messageId ? { entityId: messageId } : {})) };
    case "appointment.sendChangeOtp": {
      const businessId = businessIdOrThrow(job);
      const verificationId = String(job.payload.verificationId ?? "");
      const code = String(job.payload.code ?? "");
      const to = String(job.payload.to ?? "");
      const from = String(job.payload.from ?? "");
      if (!dependencies.twilio || !verificationId || !code || !to || !from) return { status: "skipped", entityId: verificationId };
      if (!await claimAppointmentChangeOtp(dependencies.domain, { businessId, verificationId })) return { status: "skipped", entityId: verificationId };
      const target = await loadAppointmentChangeOtpTarget(dependencies.domain, { businessId, verificationId, to, from, code });
      if (!target) {
        await releaseAppointmentChangeOtp(dependencies.domain, { businessId, verificationId });
        return { status: "skipped", entityId: verificationId };
      }
      try {
        await dependencies.twilio.sendSms({ to: target.to, from: target.from, body: `LobbyStack verification code: ${target.code}. It expires in 10 minutes.` });
        await markAppointmentChangeOtpSent(dependencies.domain, { businessId, verificationId });
        return { status: "completed", entityId: verificationId };
      } catch (error) {
        await releaseAppointmentChangeOtp(dependencies.domain, { businessId, verificationId });
        throw error;
      }
    }
    case "sms.syncPrice": {
      const providerMessageId = String(job.payload.providerMessageId ?? "").trim();
      const providerStatus = String(job.payload.providerStatus ?? "").trim();
      if (!dependencies.twilio?.getMessagePricing || !providerMessageId || !isTerminalSmsStatus(providerStatus)) return { status: "skipped", entityId: providerMessageId };
      const pricing = await dependencies.twilio.getMessagePricing({ providerMessageId });
      if (pricing.providerCostUsd === undefined || pricing.providerNumSegments === undefined) throw new Error(`Twilio SMS pricing is incomplete for ${providerMessageId}.`);
      const recorded = await recordSmsProviderPricing(dependencies.domain, { businessId: businessIdOrThrow(job), providerMessageId, ...pricing });
      return { status: recorded ? "completed" : "skipped", entityId: providerMessageId };
    }
    case "call.syncPrice": {
      const providerCallId = String(job.payload.providerCallId ?? "").trim();
      const providerCallStatus = String(job.payload.providerCallStatus ?? "").trim();
      if (!dependencies.twilio?.getCallPricing || !providerCallId || !isTerminalCallStatus(providerCallStatus)) return { status: "skipped", entityId: providerCallId };
      const pricing = await dependencies.twilio.getCallPricing({ providerCallId });
      if (pricing.providerCostUsd === undefined) throw new Error(`Twilio call pricing is incomplete for ${providerCallId}.`);
      const recorded = await recordCallProviderPricing(dependencies.domain, { businessId: businessIdOrThrow(job), providerCallId, ...pricing });
      return { status: recorded ? "completed" : "skipped", entityId: providerCallId };
    }
    case "billing.syncUsage": {
      if (!dependencies.polar || !process.env.POLAR_USAGE_METER_ID) {
        return { status: "skipped", entityId: String(job.payload.usageEventId ?? "") };
      }
      const usageEventId = String(job.payload.usageEventId ?? "");
      if (!usageEventId) return { status: "skipped" };
      const event = await loadBillingUsageEvent(dependencies.domain, { businessId: businessIdOrThrow(job), usageEventId });
      if (!event) return { status: "skipped", entityId: usageEventId };
      if (event.syncStatus === "synced") return { status: "completed", entityId: event.id };
      await dependencies.polar.recordUsage({
        meterId: process.env.POLAR_USAGE_METER_ID,
        externalCustomerId: event.customerId ?? event.billingKey,
        quantity: event.quantity,
        timestamp: event.createdAt.toISOString(),
        idempotencyKey: `billing-usage:${event.id}`,
      });
      await markBillingUsageSynced(dependencies.domain, { businessId: event.businessId, usageEventId: event.id });
      return { status: "completed", entityId: event.id };
    }
    case "billing.reconcile": {
      const providerEventId = String(job.payload.providerEventId ?? "");
      if (!providerEventId) return { status: "skipped" };
      const reconciled = await reconcileBillingProviderEvent(dependencies.domain, { businessId: businessIdOrThrow(job), providerEventId });
      return { status: reconciled ? "completed" : "skipped", entityId: providerEventId };
    }
    case "billing.createCheckout": {
      const businessId = businessIdOrThrow(job);
      const requestId = String(job.payload.requestId ?? "");
      if (!requestId) return { status: "skipped", entityId: requestId };
      if (!await claimBillingCheckoutRequest(dependencies.domain, { businessId, requestId })) return { status: "skipped", entityId: requestId };
      if (!dependencies.polar?.createCheckout) {
        await markBillingCheckoutFailed(dependencies.domain, { businessId, requestId, error: "Billing checkout provider is not configured." });
        return { status: "skipped", entityId: requestId };
      }
      const request = await loadBillingCheckoutRequest(dependencies.domain, { businessId, requestId });
      if (!request) return { status: "skipped", entityId: requestId };
      try {
        const checkout = await dependencies.polar.createCheckout({
          productId: polarCheckoutProductId(request.target, request.billingInterval),
          customerEmail: request.customerEmail,
          externalCustomerId: request.externalCustomerId,
          successUrl: `${process.env.APP_BASE_URL ?? "http://localhost:3000"}/settings/plan?checkout=success&requestId=${encodeURIComponent(requestId)}`,
          idempotencyKey: `billing-checkout:${requestId}`,
        });
        await markBillingCheckoutCreated(dependencies.domain, { businessId, requestId, ...checkout });
        return { status: "completed", entityId: requestId };
      } catch (error) {
        await markBillingCheckoutFailed(dependencies.domain, { businessId, requestId, error: "Polar checkout creation failed." });
        throw error;
      }
    }
    case "notification.dispatch": {
      const operatorDeliveryId = String(job.payload.operatorDeliveryId ?? "");
      if (operatorDeliveryId) {
        const businessId = businessIdOrThrow(job);
        if (!await claimOperatorNotificationDelivery(dependencies.domain, { businessId, deliveryId: operatorDeliveryId })) return { status: "skipped", entityId: operatorDeliveryId };
        const delivery = await loadOperatorNotificationDelivery(dependencies.domain, { businessId, deliveryId: operatorDeliveryId });
        if (!delivery) return { status: "skipped", entityId: operatorDeliveryId };
        try {
          let providerMessageId: string;
          if (delivery.channel === "sms") {
            if (!dependencies.twilio || !delivery.sender) throw new Error("Operator SMS delivery is not configured.");
            providerMessageId = (await dependencies.twilio.sendSms({ to: delivery.destination, from: delivery.sender, body: delivery.body, ...twilioStatusCallbackOption({ operatorDeliveryId: delivery.id }) })).providerMessageId;
          } else {
            if (!dependencies.email) throw new Error("Operator email delivery is not configured.");
            providerMessageId = (await dependencies.email.sendTemplate({ template: "operator_alert", to: delivery.destination, subject: delivery.subject, variables: { message: delivery.body }, idempotencyKey: `operator-notification:${delivery.id}` })).messageId;
          }
          await markOperatorNotificationSent(dependencies.domain, { businessId, deliveryId: delivery.id, providerMessageId });
          return { status: "completed", entityId: delivery.id };
        } catch (error) {
          await releaseOperatorNotificationDelivery(dependencies.domain, { businessId, deliveryId: delivery.id, error: "Provider delivery failed." });
          throw error;
        }
      }
      if (!dependencies.twilio && !dependencies.email) return { status: "skipped", entityId: String(job.payload.notificationId ?? "") };
      const notificationId = String(job.payload.notificationId ?? "");
      if (!notificationId) return { status: "skipped" };
      const businessId = businessIdOrThrow(job);
      if (!await claimNotificationDelivery(dependencies.domain, { businessId, notificationId })) {
        return { status: "skipped", entityId: notificationId };
      }
      const resolution = await resolveNotificationDelivery(dependencies.domain, { businessId, notificationId });
      if (!resolution) {
        await releaseNotificationDelivery(dependencies.domain, { businessId, notificationId });
        return { status: "skipped", entityId: notificationId };
      }
      if (resolution.kind === "skipped") {
        await markNotificationSkipped(dependencies.domain, { businessId, notificationId: resolution.notificationId });
        return { status: "skipped", entityId: resolution.notificationId };
      }
      const delivery = resolution.delivery;
      try {
        let providerMessageId: string;
        if (delivery.channel === "sms") {
          if (!dependencies.twilio || !delivery.from) {
            await markNotificationSkipped(dependencies.domain, { businessId, notificationId: delivery.notificationId });
            return { status: "skipped", entityId: delivery.notificationId };
          }
          const sent = await dependencies.twilio.sendSms({ to: delivery.to, from: delivery.from, body: delivery.body, ...twilioStatusCallbackOption({ notificationId: delivery.notificationId }) });
          providerMessageId = sent.providerMessageId;
        } else {
          if (!dependencies.email) {
            await markNotificationSkipped(dependencies.domain, { businessId, notificationId: delivery.notificationId });
            return { status: "skipped", entityId: delivery.notificationId };
          }
          const sent = await dependencies.email.sendTemplate({ template: "operator_alert", to: delivery.to, subject: delivery.subject, variables: { message: delivery.body }, idempotencyKey: `notification:${delivery.notificationId}` });
          providerMessageId = sent.messageId;
        }
        await markNotificationSent(dependencies.domain, { businessId: delivery.businessId, notificationId: delivery.notificationId, providerMessageId });
        return { status: "completed", entityId: delivery.notificationId };
      } catch (error) {
        await releaseNotificationDelivery(dependencies.domain, { businessId, notificationId: delivery.notificationId });
        throw error;
      }
      }
    case "notification.dailySummary": {
      const businessId = businessIdOrThrow(job);
      const result = await queueDailyOperatorSummaries(dependencies.domain, { businessId });
      return { status: result.queued > 0 ? "completed" : "skipped", entityId: `${businessId}:${result.queued}` };
    }
    case "conversation.finalizeSession": {
      const callId = String(job.payload.callId ?? "");
      if (!callId) return { status: "skipped" };
      const result = await finalizeConversationSession(dependencies.domain, { businessId: businessIdOrThrow(job), callId });
      return { status: result.finalized ? "completed" : "skipped", entityId: result.sessionId ?? callId };
    }
    case "privacy.scrubMessage":
      return { status: "completed", entityId: JSON.stringify(await runPrivacyRetentionSweep(dependencies.domain, { businessId: businessIdOrThrow(job) })) };
    case "privacy.deleteTranscript": {
      const callId = String(job.payload.callId ?? "");
      if (!callId) return { status: "skipped" };
      const deleted = await deleteTranscriptForRetention(dependencies.domain, { businessId: businessIdOrThrow(job), callId });
      return { status: deleted > 0 ? "completed" : "skipped", entityId: callId };
    }
    case "privacy.deleteRecording": {
      if (!dependencies.storage) return { status: "skipped", entityId: String(job.payload.callId ?? "") };
      const callId = String(job.payload.callId ?? "");
      const objectId = typeof job.payload.objectId === "string" ? job.payload.objectId : undefined;
      const deleted = await deleteCallRecording(dependencies.domain, { businessId: businessIdOrThrow(job), callId, ...(objectId ? { objectId } : {}) }, dependencies.storage);
      return { status: deleted ? "completed" : "skipped", entityId: callId };
    }
    case "privacy.cleanupPendingUpload": {
      if (!dependencies.storage) return { status: "skipped", entityId: businessIdOrThrow(job) };
      const deleted = await deleteExpiredObjectsForBusiness(dependencies.domain, { businessId: businessIdOrThrow(job) }, dependencies.storage);
      return { status: deleted > 0 ? "completed" : "skipped", entityId: String(deleted) };
    }
    case "phoneNumber.provision": {
      const businessId = businessIdOrThrow(job); const claimId = String(job.payload.claimId ?? "");
      if (!claimId || !dependencies.twilio?.findOwnedPhoneNumber || !dependencies.twilio.purchasePhoneNumber) return { status: "skipped", entityId: claimId };
      const claim = await claimNumberProvisioning(dependencies.domain, { businessId, claimId }); if (!claim) return { status: "skipped", entityId: claimId };
      const baseUrl = (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
      const voiceUrl = `${baseUrl}/voice/context/by-slug`; const smsUrl = `${baseUrl}/api/webhooks/twilio/sms`; const statusCallbackUrl = `${baseUrl}/api/webhooks/twilio/status`;
      let purchased = false; let providerPhoneId: string | undefined;
      try {
        const owned = await dependencies.twilio.findOwnedPhoneNumber({ e164: claim.e164 });
        if (owned) providerPhoneId = owned.providerPhoneId;
        else { const result = await dependencies.twilio.purchasePhoneNumber({ e164: claim.e164, friendlyName: `LobbyStack ${businessId}`, smsUrl, voiceUrl, statusCallbackUrl }); providerPhoneId = result.providerPhoneId; purchased = true; }
        const phoneNumberId = await completeNumberProvisioning(dependencies.domain, { businessId, claimId, e164: claim.e164, providerPhoneId, voiceUrl, smsUrl });
        return { status: "completed", entityId: phoneNumberId };
      } catch (error) {
        if (purchased && providerPhoneId && dependencies.twilio.releasePhoneNumber) await dependencies.twilio.releasePhoneNumber({ providerPhoneId }).catch(() => undefined);
        await failNumberProvisioning(dependencies.domain, { businessId, claimId, unavailable: getTwilioProviderErrorCode(error) === 21422 });
        throw error;
      }
    }
    case "phoneNumber.reclaim": {
      const businessId = businessIdOrThrow(job);
      const phoneNumberId = String(job.payload.phoneNumberId ?? "");
      if (!phoneNumberId) {
        const queued = await withBusinessTransaction(dependencies.domain.db, { businessId, actorType: "worker" }, async (tx) => {
          const due = await tx.select({ id: phoneNumbers.id }).from(phoneNumbers).where(and(eq(phoneNumbers.businessId, businessId), eq(phoneNumbers.status, "active"), lte(phoneNumbers.reclaimScheduledAt, new Date())));
          for (const number of due) {
            await enqueueOutbox(tx, { topic: "phoneNumber.reclaim", businessId, aggregateType: "phone_number", aggregateId: number.id, dedupeKey: `phone-number:${number.id}:reclaim`, payload: { phoneNumberId: number.id } });
          }
          return due.length;
        });
        return { status: queued > 0 ? "completed" : "skipped", entityId: `${businessId}:${queued}` };
      }
      const claimed = await withBusinessTransaction(dependencies.domain.db, { businessId, actorType: "worker" }, async (tx) => {
        const rows = await tx.update(phoneNumbers)
          .set({ status: "reclaiming", updatedAt: new Date() })
          .where(and(eq(phoneNumbers.id, phoneNumberId), eq(phoneNumbers.businessId, businessId), eq(phoneNumbers.status, "active"), lte(phoneNumbers.reclaimScheduledAt, new Date())))
          .returning({ id: phoneNumbers.id, providerPhoneId: phoneNumbers.providerPhoneId });
        return rows[0] ?? null;
      });
      if (!claimed) return { status: "skipped", entityId: phoneNumberId };
      try {
        if (claimed.providerPhoneId) {
          if (!dependencies.twilio?.releasePhoneNumber) throw new Error("Twilio phone-number release is not configured.");
          await dependencies.twilio.releasePhoneNumber({ providerPhoneId: claimed.providerPhoneId });
        }
        await withBusinessTransaction(dependencies.domain.db, { businessId, actorType: "worker" }, async (tx) => {
          await tx.update(phoneNumbers).set({ status: "reclaimed", voiceEnabled: false, smsEnabled: false, reclaimScheduledAt: null, updatedAt: new Date() }).where(and(eq(phoneNumbers.id, claimed.id), eq(phoneNumbers.businessId, businessId), eq(phoneNumbers.status, "reclaiming")));
        });
        return { status: "completed", entityId: phoneNumberId };
      } catch (error) {
        await withBusinessTransaction(dependencies.domain.db, { businessId, actorType: "worker" }, async (tx) => {
          await tx.update(phoneNumbers).set({ status: "active", updatedAt: new Date() }).where(and(eq(phoneNumbers.id, claimed.id), eq(phoneNumbers.businessId, businessId), eq(phoneNumbers.status, "reclaiming")));
        });
        throw error;
      }
    }
    case "prospectDemo.expire": {
      const expired = await expireProspectDemos(dependencies.domain);
      return { status: expired > 0 ? "completed" : "skipped", entityId: String(expired) };
    }
    case "affiliate.generatePayoutRun": {
      const periodKey = typeof job.payload.periodKey === "string" && job.payload.periodKey.trim() ? job.payload.periodKey.trim() : undefined;
      const createdAt = typeof job.payload.createdAt === "string" && job.payload.createdAt.trim() ? job.payload.createdAt.trim() : undefined;
      const result = await generateAffiliatePayoutRun(dependencies.domain, { ...(periodKey ? { periodKey } : {}), ...(createdAt ? { createdAt } : {}) });
      return { status: "completed", entityId: result.payoutRunId };
    }
    case "telemetry.flush": {
      const businessId = businessIdOrThrow(job);
      if (!dependencies.productAnalytics) return { status: "skipped", entityId: businessId };
      const events = await loadPendingProductEvents(dependencies.domain, { businessId });
      if (events.length === 0) return { status: "skipped", entityId: businessId };
      await dependencies.productAnalytics.capture(events.map((event) => ({ event: event.name, distinctId: event.distinctId, properties: redactTelemetryProperties(event.properties as TelemetryProperties), timestamp: event.occurredAt.toISOString() })));
      const sent = await markProductEventsSent(dependencies.domain, { businessId, eventIds: events.map((event) => event.id) });
      return { status: sent > 0 ? "completed" : "skipped", entityId: `${businessId}:${sent}` };
    }
    case "realtime.publish": {
      if (!dependencies.realtime) return { status: "skipped" };
      const event = realtimeEventSchema.parse({ id: randomUUID(), type: String(job.payload.type ?? "document.progressed"), businessId: businessIdOrThrow(job), entityId: typeof job.payload.entityId === "string" ? job.payload.entityId : undefined, revision: typeof job.payload.revision === "number" ? job.payload.revision : undefined, occurredAt: new Date().toISOString(), payload: job.payload, trace: job.trace });
      await dependencies.realtime.publish(`${process.env.REDIS_PREFIX ?? "lobbystack"}:realtime:${event.businessId}`, JSON.stringify(event));
      return { status: "completed", ...(event.entityId ? { entityId: event.entityId } : {}) };
    }
  }
  throw new Error(`Worker handler is not configured for ${(job as JobEnvelope).type}.`);
}

async function updateWebsiteIngestion(db: Database, input: { businessId: string; websiteIngestionJobId: string; status: string; error: string }): Promise<void> {
  await withBusinessTransaction(db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    await tx.update(websiteIngestionJobs).set({ status: input.status, errorCount: 1, lastError: input.error, updatedAt: new Date() }).where(and(eq(websiteIngestionJobs.id, input.websiteIngestionJobId), eq(websiteIngestionJobs.businessId, input.businessId)));
  });
}

const terminalSmsStatuses = new Set(["sent", "delivered", "undelivered", "failed", "canceled"]);
const terminalCallStatuses = new Set(["busy", "canceled", "completed", "failed", "no-answer"]);

function isTerminalSmsStatus(status: string): boolean {
  return terminalSmsStatuses.has(status.toLowerCase());
}

function isTerminalCallStatus(status: string): boolean {
  return terminalCallStatuses.has(status.toLowerCase());
}

async function loadKnowledgeSource(db: Database, input: { businessId: string; documentId: string }): Promise<{ objectKey: string; contentType: string } | null> {
  return await withBusinessTransaction(db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const row = (await tx.select({ objectKey: storageObjects.objectKey, contentType: storageObjects.contentType })
      .from(knowledgeDocuments)
      .innerJoin(storageObjects, and(eq(storageObjects.id, knowledgeDocuments.storageObjectId!), eq(storageObjects.businessId, input.businessId)))
      .where(and(eq(knowledgeDocuments.id, input.documentId), eq(knowledgeDocuments.businessId, input.businessId)))
      .limit(1))[0];
    return row ?? null;
  });
}

async function indexWebsitePage(
  dependencies: WorkerDependencies,
  businessId: string,
  page: { url: string; title?: string; markdown?: string },
): Promise<number> {
  const text = page.markdown?.trim() ?? "";
  if (!text || !page.url) return 0;
  const documentId = await upsertWebsiteDocument(dependencies.domain, { businessId, sourceUrl: page.url, title: page.title ?? page.url });
  const result = await indexKnowledgeText(dependencies, { businessId, documentId, text });
  return result.chunkCount;
}

async function indexKnowledgeText(
  dependencies: WorkerDependencies,
  input: { businessId: string; documentId: string; text: string },
): Promise<{ chunkCount: number }> {
  const chunks = chunkText(input.text);
  chunkCount.record(chunks.length, { operation: "knowledge.index" });
  if (!dependencies.embeddings) {
    await markKnowledgeDocumentFailed(dependencies.domain, {
      businessId: input.businessId,
      documentId: input.documentId,
      error: "Knowledge embedding provider is not configured.",
    });
    throw new Error("Knowledge embedding provider is not configured.");
  }

  let embeddings: number[][];
  let usage: DurableAiUsage | undefined;
  try {
    const embeddingStartedAt = performance.now();
    embeddings = await dependencies.embeddings.embed(chunks, (value) => {
      usage = value;
    });
    embeddingDuration.record(performance.now() - embeddingStartedAt, { provider: usage?.provider ?? "unknown" });
  } catch (error) {
    embeddingFailures.add(1, { operation: "knowledge.index" });
    await markKnowledgeDocumentFailed(dependencies.domain, {
      businessId: input.businessId,
      documentId: input.documentId,
      error: "Knowledge embedding provider failed.",
    });
    throw error;
  }

  if (embeddings.length !== chunks.length) {
    await markKnowledgeDocumentFailed(dependencies.domain, {
      businessId: input.businessId,
      documentId: input.documentId,
      error: "Knowledge embedding provider returned an incomplete result.",
    });
    throw new Error("Knowledge embedding provider returned an incomplete result.");
  }

  const indexStartedAt = performance.now();
  const indexed = await indexDocumentText(dependencies.domain, { ...input, embeddings });
  indexDuration.record(performance.now() - indexStartedAt, { operation: "knowledge.index" });
  if (usage) {
    await recordAiGenerationEvent(dependencies.domain, {
      ...usage,
      businessId: input.businessId,
      operation: "knowledge.embed",
    }).catch(() => undefined);
  }
  return indexed;
}

function polarCheckoutProductId(target: "starter" | "pro" | "ai_sms", billingInterval: "monthly" | "annual"): string {
  const key = target === "ai_sms" ? "POLAR_AI_SMS_SETUP_PRODUCT_ID" : `POLAR_${target.toUpperCase()}_${billingInterval.toUpperCase()}_PRODUCT_ID`;
  const productId = process.env[key] ?? (target === "ai_sms" ? process.env.POLAR_AI_SMS_ADDON_PRODUCT_ID : target === "pro" && billingInterval === "monthly" ? process.env.POLAR_PRO_PRODUCT_ID : undefined);
  if (!productId) throw new Error(`${key} is required for checkout.`);
  return productId;
}
