import { randomUUID } from "node:crypto";

import { getPool } from "@lobbystack/db";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { BookingConflictError, bookAppointment } from "./booking";

const hasDatabase = Boolean(process.env.DATABASE_URL || process.env.DATABASE_URL_APP);

describe.skipIf(!hasDatabase)("booking concurrency", () => {
  let pool: Pool;
  const userId = randomUUID();
  const businessId = randomUUID();
  const contactId = randomUUID();
  const serviceId = randomUUID();
  const staffId = randomUUID();

  beforeAll(async () => {
    pool = getPool("app");
    await pool.query(
      `INSERT INTO app.businesses (id, slug, name, timezone)
       VALUES ($1, $2, $3, $4)`,
      [businessId, `booking-${businessId.slice(0, 8)}`, "Booking Test", "UTC"],
    );
    await pool.query(
      `INSERT INTO app.memberships (business_id, user_id, role, status)
       VALUES ($1, $2, 'owner', 'active')`,
      [businessId, userId],
    );
    await pool.query(
      `INSERT INTO app.contacts (id, business_id, display_name, phone_e164)
       VALUES ($1, $2, $3, $4)`,
      [contactId, businessId, "Booking Contact", "+14165550199"],
    );
    await pool.query(
      `INSERT INTO app.services (id, business_id, name, duration_minutes)
       VALUES ($1, $2, $3, $4)`,
      [serviceId, businessId, "Booking Service", 30],
    );
    await pool.query(
      `INSERT INTO app.staff (id, business_id, name)
       VALUES ($1, $2, $3)`,
      [staffId, businessId, "Booking Staff"],
    );
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM app.outbox_messages WHERE business_id = $1`, [businessId]);
    await pool.query(`DELETE FROM app.businesses WHERE id = $1`, [businessId]);
    await pool.end();
  });

  it("rejects an overlapping appointment", async () => {
    const startsAt = new Date("2030-01-01T10:00:00.000Z");
    const endsAt = new Date("2030-01-01T10:30:00.000Z");

    await bookAppointment({
      businessId,
      userId,
      values: {
        contactId,
        serviceId,
        staffId,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
      },
      pool,
    });

    await expect(
      bookAppointment({
        businessId,
        userId,
        values: {
          contactId,
          serviceId,
          staffId,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
        },
        pool,
      }),
    ).rejects.toBeInstanceOf(BookingConflictError);
  });
});
