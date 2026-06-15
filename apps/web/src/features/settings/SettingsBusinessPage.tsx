import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { MoreHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";
import { SectionBlock } from "@/components/section-block";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { isValidEmailAddress } from "@/lib/auth-validation";
import { useObservedAction, useObservedMutation } from "@/lib/observed-convex";
import { cn } from "@/lib/utils";

type SettingsBusinessPageProps = {
  businessId: Id<"businesses">;
  canManageTenant: boolean;
};

type InviteRole = "viewer" | "business_admin";

const INVITE_ROLE_OPTIONS: Array<{
  value: InviteRole;
  labelKey: "workspaceTeam.roles.admin" | "workspaceTeam.roles.viewer";
  descriptionKey:
    | "workspaceTeam.invite.roles.adminDescription"
    | "workspaceTeam.invite.roles.viewerDescription";
}> = [
  {
    value: "business_admin",
    labelKey: "workspaceTeam.roles.admin",
    descriptionKey: "workspaceTeam.invite.roles.adminDescription",
  },
  {
    value: "viewer",
    labelKey: "workspaceTeam.roles.viewer",
    descriptionKey: "workspaceTeam.invite.roles.viewerDescription",
  },
];

type TeamMemberRow = {
  membershipId: Id<"business_memberships">;
  userId: Id<"users">;
  role: string;
  status: string;
  name: string | null;
  email: string | null;
  joinedAt: number;
};

type PendingInvitationRow = {
  invitationId: Id<"business_invitations">;
  email: string;
  role: string;
  status: string;
  expirationTime: number;
  invitedAt: number;
};

type TeamTableRow =
  | ({ kind: "member" } & TeamMemberRow)
  | ({ kind: "invitation" } & PendingInvitationRow);

function formatRoleLabel(role: string, t: (key: string) => string): string {
  if (role === "business_admin" || role === "business_owner" || role === "owner") {
    return t("workspaceTeam.roles.admin");
  }
  if (role === "viewer") {
    return t("workspaceTeam.roles.viewer");
  }
  return role;
}

function formatTeamDate(timestamp: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
  }).format(new Date(timestamp));
}

const WORKSPACE_OWNER_ROLES = new Set(["business_owner", "owner"]);

function InviteRoleOptions(props: {
  inviteRole: InviteRole;
  onInviteRoleChange: (role: InviteRole) => void;
  t: (key: string) => string;
}) {
  return (
    <div
      aria-labelledby="invite-role-label"
      className="flex flex-col gap-3"
      role="radiogroup"
    >
      {INVITE_ROLE_OPTIONS.map((option) => {
        const isSelected = props.inviteRole === option.value;

        return (
          <button
            aria-checked={isSelected}
            className="flex w-full items-start gap-3 py-1 text-left"
            key={option.value}
            onClick={() => props.onInviteRoleChange(option.value)}
            role="radio"
            type="button"
          >
            <span
              className={cn(
                "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border",
                isSelected ? "border-foreground" : "border-muted-foreground",
              )}
            >
              {isSelected ? <span className="size-2 rounded-full bg-foreground" /> : null}
            </span>
            <span className="flex min-w-0 flex-col gap-1">
              <span className="text-sm font-medium text-foreground">
                {props.t(option.labelKey)}
              </span>
              <span className="text-sm leading-6 text-muted-foreground">
                {props.t(option.descriptionKey)}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function SettingsBusinessPage(props: SettingsBusinessPageProps) {
  const { t, i18n } = useTranslation("settings");
  const configuration = useQuery(api.businesses.catalog.getBusinessSettingsAccount, {
    businessId: props.businessId,
  });
  const team = useQuery(api.businesses.members.listTeam, {
    businessId: props.businessId,
  });
  const currentUser = useQuery(api.users.current, {});
  const isLoadingConfigurationData = configuration === undefined;
  const isLoadingTeamData = team === undefined;
  const updateBusinessName = useObservedMutation(api.businesses.catalog.updateBusinessName);
  const sendInvitation = useObservedAction(api.businesses.members.sendInvitation);
  const revokeInvitation = useObservedMutation(api.businesses.members.revokeInvitation);
  const removeMember = useObservedMutation(api.businesses.members.removeMember);
  const [businessName, setBusinessName] = useState("");
  const [isBusinessNameDialogOpen, setIsBusinessNameDialogOpen] = useState(false);
  const [businessNameStatus, setBusinessNameStatus] = useState<string | null>(null);
  const [isSavingBusinessName, setIsSavingBusinessName] = useState(false);
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<InviteRole>("viewer");
  const [isSendingInvite, setIsSendingInvite] = useState(false);
  const [teamRowActionId, setTeamRowActionId] = useState<string | null>(null);
  const teamRows = useMemo<TeamTableRow[]>(() => {
    if (!team) {
      return [];
    }

    const members = team.members.map(
      (member): TeamTableRow => ({
        kind: "member",
        ...member,
      }),
    );
    const invitations = team.pendingInvitations.map(
      (invitation): TeamTableRow => ({
        kind: "invitation",
        ...invitation,
      }),
    );

    return [...members, ...invitations];
  }, [team]);
  const actionColumnCount = props.canManageTenant ? 1 : 0;
  const tableColumnCount = 2 + actionColumnCount;
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

  async function handleSendInvite(): Promise<void> {
    if (!props.canManageTenant) {
      return;
    }

    const normalizedEmail = inviteEmail.trim().toLowerCase();
    if (!isValidEmailAddress(normalizedEmail)) {
      toast.error(t("workspaceTeam.invite.errors.invalidEmail"));
      return;
    }

    setIsSendingInvite(true);
    try {
      await sendInvitation({
        businessId: props.businessId,
        email: normalizedEmail,
        role: inviteRole,
      });
      toast.success(t("workspaceTeam.invite.sent", { email: normalizedEmail }));
      setInviteEmail("");
      setInviteRole("viewer");
      setIsInviteDialogOpen(false);
    } catch {
      toast.error(t("workspaceTeam.invite.errors.failed"));
    } finally {
      setIsSendingInvite(false);
    }
  }

  async function handleRevokeInvitation(
    invitationId: Id<"business_invitations">,
  ): Promise<void> {
    setTeamRowActionId(invitationId);
    try {
      await revokeInvitation({
        businessId: props.businessId,
        invitationId,
      });
      toast.success(t("workspaceTeam.pending.revokeSuccess"));
    } catch {
      toast.error(t("workspaceTeam.pending.revokeFailed"));
    } finally {
      setTeamRowActionId(null);
    }
  }

  async function handleRemoveMember(membershipId: Id<"business_memberships">): Promise<void> {
    setTeamRowActionId(membershipId);
    try {
      await removeMember({
        businessId: props.businessId,
        membershipId,
      });
      toast.success(t("workspaceTeam.members.removeSuccess"));
    } catch {
      toast.error(t("workspaceTeam.members.removeFailed"));
    } finally {
      setTeamRowActionId(null);
    }
  }

  function canRemoveMember(member: TeamMemberRow): boolean {
    if (!props.canManageTenant || !currentUser) {
      return false;
    }
    if (member.userId === currentUser._id) {
      return false;
    }
    return !WORKSPACE_OWNER_ROLES.has(member.role);
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

          <SectionBlock
            action={
              props.canManageTenant ? (
                <Dialog onOpenChange={setIsInviteDialogOpen} open={isInviteDialogOpen}>
                  <DialogTrigger
                    render={<Button disabled={isLoadingTeamData} size="sm" />}
                  >
                    {t("workspaceTeam.invite.action")}
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{t("workspaceTeam.invite.title")}</DialogTitle>
                      <DialogDescription>{t("workspaceTeam.invite.description")}</DialogDescription>
                    </DialogHeader>

                    <FieldGroup>
                      <Field>
                        <FieldLabel htmlFor="invite-email">
                          {t("workspaceTeam.invite.emailLabel")}
                        </FieldLabel>
                        <Input
                          autoComplete="email"
                          id="invite-email"
                          onChange={(event) => setInviteEmail(event.target.value)}
                          placeholder={t("workspaceTeam.invite.emailPlaceholder")}
                          type="email"
                          value={inviteEmail}
                        />
                      </Field>
                      <Field>
                        <FieldLabel id="invite-role-label">
                          {t("workspaceTeam.invite.roleLabel")}
                        </FieldLabel>
                        <InviteRoleOptions
                          inviteRole={inviteRole}
                          onInviteRoleChange={setInviteRole}
                          t={t}
                        />
                      </Field>
                    </FieldGroup>

                    <DialogFooter>
                      <Button
                        disabled={isSendingInvite}
                        onClick={() => void handleSendInvite()}
                        type="button"
                      >
                        {isSendingInvite
                          ? t("workspaceTeam.invite.sending")
                          : t("workspaceTeam.invite.submit")}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              ) : undefined
            }
            title={t("workspaceTeam.members.title")}
          >
            <Surface className="overflow-hidden p-0">
            {isLoadingTeamData ? (
              <div className="space-y-4 p-6">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-border hover:bg-transparent">
                    <TableHead className="h-12 px-6 align-middle text-sm font-medium text-foreground">
                      {t("workspaceTeam.members.table.email")}
                    </TableHead>
                    <TableHead className="h-12 px-6 align-middle text-sm font-medium text-foreground">
                      {t("workspaceTeam.members.table.role")}
                    </TableHead>
                    {props.canManageTenant ? (
                      <TableHead className="h-12 w-12 px-6 align-middle" />
                    ) : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teamRows.length === 0 ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell
                        className="px-6 py-8 text-sm text-muted-foreground"
                        colSpan={tableColumnCount}
                      >
                        {t("workspaceTeam.members.empty")}
                      </TableCell>
                    </TableRow>
                  ) : (
                    teamRows.map((row) => {
                      const rowKey =
                        row.kind === "member" ? row.membershipId : row.invitationId;
                      const rowActionId =
                        row.kind === "member" ? row.membershipId : row.invitationId;
                      const isRowActionPending = teamRowActionId === rowActionId;
                      const formattedDate = formatTeamDate(
                        row.kind === "member" ? row.joinedAt : row.invitedAt,
                        i18n.language,
                      );
                      const dateLabel =
                        row.kind === "member"
                          ? t("workspaceTeam.members.joinedOn", { date: formattedDate })
                          : t("workspaceTeam.members.invitedOn", { date: formattedDate });

                      return (
                        <TableRow
                          className="border-b border-border last:border-b-0 hover:bg-transparent"
                          key={rowKey}
                        >
                          <TableCell className="px-6 py-5">
                            <div className="space-y-1">
                              <p className="text-sm text-foreground">
                                {row.kind === "member"
                                  ? (row.email ?? t("workspaceTeam.members.noEmail"))
                                  : row.email}
                              </p>
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm text-muted-foreground">{dateLabel}</p>
                                {row.kind === "invitation" ? (
                                  <Badge
                                    className="border-amber-200 bg-amber-100 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/20 dark:text-amber-200"
                                    variant="outline"
                                  >
                                    {t("workspaceTeam.members.status.pending")}
                                  </Badge>
                                ) : null}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="px-6 py-5">
                            <Badge variant="secondary">
                              {formatRoleLabel(row.role, t)}
                            </Badge>
                          </TableCell>
                          {props.canManageTenant ? (
                            <TableCell className="px-6 py-5">
                              {row.kind === "invitation" ||
                              (row.kind === "member" && canRemoveMember(row)) ? (
                                <div className="flex justify-end">
                                  <DropdownMenu>
                                    <DropdownMenuTrigger
                                      render={
                                        <Button
                                          aria-label={t("workspaceTeam.members.actions.moreOptions")}
                                          disabled={isRowActionPending}
                                          size="icon-sm"
                                          title={t("workspaceTeam.members.actions.moreOptions")}
                                          type="button"
                                          variant="ghost"
                                        >
                                          <MoreHorizontal />
                                        </Button>
                                      }
                                    />
                                    <DropdownMenuContent
                                      align="end"
                                      className="min-w-[9rem] w-auto p-1"
                                      side="bottom"
                                      sideOffset={8}
                                    >
                                      {row.kind === "invitation" ? (
                                        <DropdownMenuItem
                                          className="gap-2.5 px-3 py-2"
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            void handleRevokeInvitation(row.invitationId);
                                          }}
                                          variant="destructive"
                                        >
                                          <Trash2 />
                                          <span>{t("workspaceTeam.members.actions.cancelInvite")}</span>
                                        </DropdownMenuItem>
                                      ) : (
                                        <DropdownMenuItem
                                          className="gap-2.5 px-3 py-2"
                                          onClick={() =>
                                            void handleRemoveMember(row.membershipId)
                                          }
                                        >
                                          <span>{t("workspaceTeam.members.actions.remove")}</span>
                                        </DropdownMenuItem>
                                      )}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                              ) : null}
                            </TableCell>
                          ) : null}
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            )}
            </Surface>
          </SectionBlock>
        </ItemGroup>
      </div>
    </div>
  );
}
