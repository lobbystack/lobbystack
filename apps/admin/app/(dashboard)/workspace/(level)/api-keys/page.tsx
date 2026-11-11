import { LiveApiKeysSurface } from "@/components/live-api-keys-surface";
import { LiveConnectedAppsSurface } from "@/components/live-connected-apps-surface";

/** The business's API keys, and under them its MCP connections, as the partner console shows its own. */
export default function SettingsApiKeysPage() {
  return (
    <div className="flex flex-col gap-10">
      <LiveApiKeysSurface />
      <LiveConnectedAppsSurface />
    </div>
  );
}
