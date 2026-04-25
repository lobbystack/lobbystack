import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";

export async function deleteWebsiteIngestionStorageBlob(
  ctx: Pick<ActionCtx, "storage">,
  storageId: Id<"_storage">,
): Promise<void> {
  await ctx.storage.delete(storageId);
}
