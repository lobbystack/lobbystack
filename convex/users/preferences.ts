import { v } from "convex/values";

import { mutation, query } from "../_generated/server";
import { ensureCurrentUser, requireCurrentUser } from "../lib/auth";

const localeValidator = v.union(v.literal("en"), v.literal("fr"));

export const getPreferredLocale = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireCurrentUser(ctx);
    return user.preferredLocale ?? null;
  },
});

export const updatePreferredLocale = mutation({
  args: {
    locale: localeValidator,
  },
  handler: async (ctx, args) => {
    const user = await ensureCurrentUser(ctx);
    await ctx.db.patch(user._id, {
      preferredLocale: args.locale,
    });
    return args.locale;
  },
});
