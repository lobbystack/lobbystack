import { Polar } from "@polar-sh/sdk";
import { validateEvent } from "@polar-sh/sdk/webhooks";

export type PolarWebhookEvent = ReturnType<typeof validateEvent>;

export type PolarBillingConfig = {
  accessToken: string;
  server: "sandbox" | "production";
};

export type PolarUsageEvent = {
  name: string;
  externalCustomerId: string;
  externalId: string;
  timestamp: Date;
  metadata: Record<string, string | number | boolean>;
};

export type PolarBillingOrder = {
  id: string;
  status: string;
  totalAmount: number;
  currency: string;
  description: string;
  subscriptionId: string | null;
  productId: string | null;
  invoiceUrl: string | null;
  customerId: string;
  customerExternalId: string | null;
  customerEmail: string | null;
  customerName: string | null;
  createdAt: Date;
};

export function polarBillingConfigFromEnvironment(
  env: Record<string, string | undefined> = process.env,
): PolarBillingConfig | null {
  const accessToken = env.POLAR_ORGANIZATION_TOKEN?.trim();
  if (!accessToken) return null;
  return {
    accessToken,
    server: env.POLAR_SERVER === "production" ? "production" : "sandbox",
  };
}

export function polarWebhookSecretFromEnvironment(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const secret = env.POLAR_WEBHOOK_SECRET?.trim();
  return secret || null;
}

export function validatePolarWebhook(input: {
  body: string;
  headers: Record<string, string>;
  secret: string;
}): PolarWebhookEvent {
  return validateEvent(input.body, input.headers, input.secret);
}

export class PolarBillingProvider {
  private readonly client: Polar;

  constructor(config: PolarBillingConfig) {
    this.client = new Polar({ accessToken: config.accessToken, server: config.server });
  }

  async ingestUsage(event: PolarUsageEvent): Promise<void> {
    await this.client.events.ingest({ events: [event] });
  }

  async getOrder(orderId: string): Promise<PolarBillingOrder> {
    const order = await this.client.orders.get({ id: orderId });
    return {
      id: order.id,
      status: order.status,
      totalAmount: order.totalAmount,
      currency: order.currency,
      description: order.description,
      subscriptionId: order.subscriptionId,
      productId: order.productId,
      invoiceUrl: null,
      customerId: order.customerId,
      customerExternalId: order.customer.externalId ?? null,
      customerEmail: order.customer.email ?? null,
      customerName: order.customer.name ?? null,
      createdAt: order.createdAt,
    };
  }
}
