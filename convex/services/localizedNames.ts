import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type ActionCtx,
} from "../_generated/server";
import { scheduleSnapshotRefresh } from "../businesses/admin";
import { generateMissingLocalizedServiceNames } from "../lib/serviceNameGeneration";
import {
  localizedServiceNamesValidator,
  normalizeLocalizedServiceNames,
} from "../lib/serviceNames";
import { runtimeLocaleValidator } from "../lib/runtimeLocale";

type ServiceLocalizationState = Pick<Doc<"services">, "_id" | "businessId" | "name"> & {
  localizedNames?: Doc<"services">["localizedNames"];
};

export const getServiceLocalizationState = internalQuery({
  args: {
    serviceId: v.id("services"),
  },
  handler: async (ctx, args): Promise<ServiceLocalizationState | null> => {
    const service = await ctx.db.get(args.serviceId);
    if (!service) {
      return null;
    }

    return {
      _id: service._id,
      businessId: service.businessId,
      name: service.name,
      ...(service.localizedNames !== undefined
        ? { localizedNames: service.localizedNames }
        : {}),
    };
  },
});

export const saveServiceLocalizedNames = internalMutation({
  args: {
    serviceId: v.id("services"),
    localizedNames: localizedServiceNamesValidator,
  },
  handler: async (ctx, args) => {
    const service = await ctx.db.get(args.serviceId);
    if (!service) {
      throw new Error("Service not found.");
    }

    const localizedNames = normalizeLocalizedServiceNames(args.localizedNames);
    await ctx.db.patch(args.serviceId, {
      ...(localizedNames !== undefined ? { localizedNames } : {}),
    });
    await scheduleSnapshotRefresh(ctx, service.businessId);
    return localizedNames ?? {};
  },
});

export const ensureLocalizedServiceName = internalAction({
  args: {
    serviceId: v.id("services"),
    locale: runtimeLocaleValidator,
  },
  handler: async (
    ctx: ActionCtx,
    args,
  ): Promise<string> => {
    const service = await ctx.runQuery(internal.services.localizedNames.getServiceLocalizationState, {
      serviceId: args.serviceId,
    });
    if (!service) {
      throw new Error("Service not found.");
    }

    const existing = normalizeLocalizedServiceNames(service.localizedNames);
    const current = existing?.[args.locale];
    if (current) {
      return current;
    }

    const localizedNames = await generateMissingLocalizedServiceNames({
      name: service.name,
      ...(existing !== undefined ? { localizedNames: existing } : {}),
    });
    await ctx.runMutation(internal.services.localizedNames.saveServiceLocalizedNames, {
      serviceId: args.serviceId,
      localizedNames,
    });
    return localizedNames[args.locale] ?? service.name;
  },
});
