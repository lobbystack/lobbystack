import { PartnerAgencyConnectionsSurface } from "@/components/partner-agency-connections-surface";
import { PartnerApiKeysSurface } from "@/components/partner-api-keys-surface";

export default function PartnerApiKeysPage() {
  return (
    <div className="flex flex-col gap-10">
      <PartnerApiKeysSurface />
      <PartnerAgencyConnectionsSurface />
    </div>
  );
}
