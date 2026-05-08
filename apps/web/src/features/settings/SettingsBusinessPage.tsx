import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { useTranslation } from "react-i18next";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useObservedMutation } from "@/lib/observed-convex";
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";

type SettingsBusinessPageProps = {
  businessId: Id<"businesses">;
  canManageTenant: boolean;
};

export function SettingsBusinessPage(props: SettingsBusinessPageProps) {
  const { t } = useTranslation("settings");
  const configuration = useQuery(api.businesses.catalog.getBusinessSettingsAccount, {
    businessId: props.businessId,
  });
  const isLoadingConfigurationData = configuration === undefined;
  const updateBusinessName = useObservedMutation(api.businesses.catalog.updateBusinessName);
  const [businessName, setBusinessName] = useState("");
  const [isBusinessNameDialogOpen, setIsBusinessNameDialogOpen] = useState(false);
  const [businessNameStatus, setBusinessNameStatus] = useState<string | null>(null);
  const [isSavingBusinessName, setIsSavingBusinessName] = useState(false);
  const isLoadingBusinessName = isLoadingConfigurationData;
  const configuredBusinessName = configuration?.business?.name ?? "";
  const displayBusinessName = businessName || configuredBusinessName;

  useEffect(() => {
    const nextName = configuration?.business?.name;
    if (nextName !== undefined) {
      setBusinessName(nextName);
    }
  }, [configuration?.business?.name]);

  useEffect(() => {
    if (!businessNameStatus) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setBusinessNameStatus(null);
    }, 3000);

    return () => window.clearTimeout(timeoutId);
  }, [businessNameStatus]);

  async function handleBusinessNameSave(): Promise<void> {
    if (!props.canManageTenant) {
      return;
    }

    setIsSavingBusinessName(true);
    setBusinessNameStatus(null);

    try {
      const result = await updateBusinessName({
        businessId: props.businessId,
        name: businessName,
      });
      setBusinessName(result.name);
      setBusinessNameStatus(t("account.businessName.saved"));
      setIsBusinessNameDialogOpen(false);
    } finally {
      setIsSavingBusinessName(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="w-full">
        <ItemGroup spacing="section">
          <Item variant="outline">
            <ItemContent>
              <ItemTitle>{t("account.businessName.label")}</ItemTitle>
              <ItemDescription>{t("account.businessName.description")}</ItemDescription>
              {isLoadingBusinessName ? (
                <Skeleton className="h-6 w-48 max-w-full" />
              ) : (
                <p className="text-[15px] leading-6 text-foreground">
                  {displayBusinessName}
                </p>
              )}
              {businessNameStatus ? <ItemDescription>{businessNameStatus}</ItemDescription> : null}
            </ItemContent>
            {props.canManageTenant ? (
              <ItemActions>
                <Dialog
                  onOpenChange={(open) => {
                    setIsBusinessNameDialogOpen(open);
                    if (open) {
                      setBusinessName(configuredBusinessName || businessName);
                    }
                  }}
                  open={isBusinessNameDialogOpen}
                >
                  <DialogTrigger
                    render={<Button disabled={isLoadingBusinessName} size="sm" variant="outline" />}
                  >
                    {t("account.actions.change")}
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{t("account.businessName.label")}</DialogTitle>
                      <DialogDescription>{t("account.businessName.description")}</DialogDescription>
                    </DialogHeader>

                    <FieldGroup>
                      <Field>
                        <FieldLabel htmlFor="profile-username">
                          {t("account.businessName.label")}
                        </FieldLabel>
                        <Input
                          id="profile-username"
                          onChange={(event) => {
                            setBusinessName(event.target.value);
                            setBusinessNameStatus(null);
                          }}
                          placeholder={t("account.businessName.placeholder")}
                          value={businessName}
                        />
                      </Field>
                    </FieldGroup>

                    <DialogFooter>
                      <Button
                        disabled={isSavingBusinessName}
                        onClick={() => void handleBusinessNameSave()}
                        type="button"
                      >
                        {isSavingBusinessName
                          ? t("account.businessName.saving")
                          : t("account.businessName.save")}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </ItemActions>
            ) : null}
          </Item>
        </ItemGroup>
      </div>
    </div>
  );
}
