import {
  boolean,
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import {
  businessIdColumn,
  id,
  legacyConvexId,
  timestamps,
} from "./_common";

export const catalogSchema = pgSchema("app");

export const staff = catalogSchema.table(
  "staff",
  {
    id: id(),
    businessId: businessIdColumn(),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    title: text("title"),
    bio: text("bio"),
    avatarUrl: text("avatar_url"),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    legacyConvexId: legacyConvexId(),
    ...timestamps(),
  },
  (table) => [index("staff_business_id_idx").on(table.businessId)],
);

export const services = catalogSchema.table(
  "services",
  {
    id: id(),
    businessId: businessIdColumn(),
    name: text("name").notNull(),
    localizedNamesJson: jsonb("localized_names_json"),
    description: text("description"),
    durationMinutes: integer("duration_minutes").notNull(),
    priceCents: integer("price_cents"),
    currency: text("currency").default("USD"),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    legacyConvexId: legacyConvexId(),
    ...timestamps(),
  },
  (table) => [index("services_business_id_idx").on(table.businessId)],
);

export const staffServices = catalogSchema.table(
  "staff_services",
  {
    id: id(),
    businessId: businessIdColumn(),
    staffId: text("staff_id").notNull(),
    serviceId: text("service_id").notNull(),
    legacyConvexId: legacyConvexId(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("staff_services_staff_service_idx").on(
      table.staffId,
      table.serviceId,
    ),
    index("staff_services_business_id_idx").on(table.businessId),
  ],
);

export const businessHours = catalogSchema.table(
  "business_hours",
  {
    id: id(),
    businessId: businessIdColumn(),
    dayOfWeek: integer("day_of_week").notNull(),
    openMinutes: integer("open_minutes").notNull(),
    closeMinutes: integer("close_minutes").notNull(),
    legacyConvexId: legacyConvexId(),
    ...timestamps(),
  },
  (table) => [
    index("business_hours_business_id_idx").on(table.businessId),
    uniqueIndex("business_hours_business_day_idx").on(
      table.businessId,
      table.dayOfWeek,
    ),
  ],
);

export const closures = catalogSchema.table(
  "closures",
  {
    id: id(),
    businessId: businessIdColumn(),
    startsAt: text("starts_at").notNull(),
    endsAt: text("ends_at").notNull(),
    reason: text("reason").notNull(),
    legacyConvexId: legacyConvexId(),
    ...timestamps(),
  },
  (table) => [index("closures_business_id_idx").on(table.businessId)],
);

export const phoneNumbers = catalogSchema.table(
  "phone_numbers",
  {
    id: id(),
    businessId: businessIdColumn(),
    e164: text("e164").notNull(),
    label: text("label"),
    provider: text("provider").notNull().default("twilio"),
    providerSid: text("provider_sid"),
    isPrimary: boolean("is_primary").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    capabilitiesJson: jsonb("capabilities_json"),
    legacyConvexId: legacyConvexId(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("phone_numbers_e164_idx").on(table.e164),
    index("phone_numbers_business_id_idx").on(table.businessId),
  ],
);

export const receptionistProfiles = catalogSchema.table(
  "receptionist_profiles",
  {
    id: id(),
    businessId: businessIdColumn(),
    displayName: text("display_name").notNull(),
    voiceId: text("voice_id"),
    greeting: text("greeting"),
    personality: text("personality"),
    language: text("language").notNull().default("en"),
    isActive: boolean("is_active").notNull().default(true),
    settingsJson: jsonb("settings_json"),
    legacyConvexId: legacyConvexId(),
    ...timestamps(),
  },
  (table) => [
    index("receptionist_profiles_business_id_idx").on(table.businessId),
  ],
);
