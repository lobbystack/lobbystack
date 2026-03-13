import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { Users } from "lucide-react";

import type { Doc, Id } from "../../../../../convex/_generated/dataModel";
import { api } from "../../../../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type BookableTeamCardProps = {
  businessId: Id<"businesses">;
};

const NEW_STAFF_VALUE = "__new__";

function assignmentKey(staffId: string, serviceId: string): string {
  return `${staffId}:${serviceId}`;
}

function buildAssignmentState(input: {
  assignments: Array<Doc<"staff_service_assignments">>;
  businessId: Id<"businesses">;
}): Record<string, boolean> {
  const nextState: Record<string, boolean> = {};
  for (const assignment of input.assignments) {
    if (assignment.businessId !== input.businessId) {
      continue;
    }
    nextState[assignmentKey(String(assignment.staffId), String(assignment.serviceId))] = true;
  }
  return nextState;
}

export function BookableTeamCard(props: BookableTeamCardProps) {
  const { t } = useTranslation(["common", "settings"]);
  const configuration = useQuery(api.businesses.catalog.getBusinessConfiguration, {
    businessId: props.businessId,
  });
  const upsertStaff = useMutation(api.businesses.catalog.upsertStaff);
  const replaceAssignments = useMutation(
    api.businesses.catalog.replaceStaffServiceAssignments,
  );

  const businessTimezone = configuration?.business?.timezone ?? "America/Toronto";
  const services = useMemo(
    () => (configuration?.services ?? []) as Array<Doc<"services">>,
    [configuration],
  );
  const staff = useMemo(
    () => (configuration?.staff ?? []) as Array<Doc<"staff">>,
    [configuration],
  );
  const assignments = useMemo(
    () =>
      (configuration?.assignments ?? []) as Array<Doc<"staff_service_assignments">>,
    [configuration],
  );

  const [selectedStaffKey, setSelectedStaffKey] = useState(NEW_STAFF_VALUE);
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState(businessTimezone);
  const [transferNumber, setTransferNumber] = useState("");
  const [active, setActive] = useState(true);
  const [staffSaveMessage, setStaffSaveMessage] = useState<string | null>(null);
  const [assignmentSaveMessage, setAssignmentSaveMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSavingStaff, setIsSavingStaff] = useState(false);
  const [isSavingAssignments, setIsSavingAssignments] = useState(false);
  const [assignmentState, setAssignmentState] = useState<Record<string, boolean>>({});

  const selectedStaff = staff.find((member) => String(member._id) === selectedStaffKey);

  useEffect(() => {
    setAssignmentState(
      buildAssignmentState({
        assignments,
        businessId: props.businessId,
      }),
    );
  }, [assignments, props.businessId]);

  useEffect(() => {
    if (staff.length === 0) {
      setSelectedStaffKey(NEW_STAFF_VALUE);
      return;
    }

    setSelectedStaffKey((currentValue) => {
      if (currentValue === NEW_STAFF_VALUE) {
        return String(staff[0]?._id);
      }

      const stillExists = staff.some((member) => String(member._id) === currentValue);
      return stillExists ? currentValue : String(staff[0]?._id);
    });
  }, [staff]);

  useEffect(() => {
    if (!selectedStaff) {
      setName("");
      setTimezone(businessTimezone);
      setTransferNumber("");
      setActive(true);
      return;
    }

    setName(selectedStaff.name);
    setTimezone(selectedStaff.timezone);
    setTransferNumber(selectedStaff.transferNumber ?? "");
    setActive(selectedStaff.active);
  }, [businessTimezone, selectedStaff]);

  function toggleAssignment(staffId: string, serviceId: string, checked: boolean): void {
    const key = assignmentKey(staffId, serviceId);
    setAssignmentState((current) => ({
      ...current,
      [key]: checked,
    }));
  }

  async function handleStaffSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setIsSavingStaff(true);
    setStaffSaveMessage(null);
    setErrorMessage(null);

    try {
      const result = await upsertStaff({
        businessId: props.businessId,
        staffId: selectedStaff?._id,
        name: name.trim(),
        timezone: timezone.trim() || businessTimezone,
        active,
        transferNumber: transferNumber.trim() || undefined,
      });
      setSelectedStaffKey(String(result.staffId));
      setStaffSaveMessage(selectedStaff ? t("settings:team.saved") : t("settings:team.added"));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("settings:team.saveFailed"));
    } finally {
      setIsSavingStaff(false);
    }
  }

  async function handleAssignmentsSave(): Promise<void> {
    setIsSavingAssignments(true);
    setAssignmentSaveMessage(null);
    setErrorMessage(null);

    try {
      const nextAssignments = Object.entries(assignmentState)
        .filter(([, checked]) => checked)
        .map(([key]) => {
          const [staffId, serviceId] = key.split(":");
          return {
            staffId: staffId as Id<"staff">,
            serviceId: serviceId as Id<"services">,
          };
        });

      await replaceAssignments({
        businessId: props.businessId,
        assignments: nextAssignments,
      });
      setAssignmentSaveMessage(t("settings:team.savedAssignments"));
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : t("settings:team.saveAssignmentsFailed"),
      );
    } finally {
      setIsSavingAssignments(false);
    }
  }

  return (
    <Card className="border border-border/70 bg-card/90 shadow-sm">
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-primary/10 p-2 text-primary">
            <Users className="size-5" />
          </div>
          <div className="space-y-1">
            <CardTitle>{t("settings:team.title")}</CardTitle>
            <CardDescription>{t("settings:team.description")}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <form className="space-y-5" onSubmit={(event) => void handleStaffSubmit(event)}>
          <label className="space-y-2">
            <span className="text-xs font-medium tracking-[0.24em] text-muted-foreground uppercase">
              {t("settings:team.member")}
            </span>
            <Select
              onValueChange={(value) => setSelectedStaffKey(value ?? NEW_STAFF_VALUE)}
              value={selectedStaffKey}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("settings:team.selectMember")} />
              </SelectTrigger>
              <SelectContent>
                {staff.map((member) => (
                  <SelectItem key={member._id} value={String(member._id)}>
                    {member.name}
                  </SelectItem>
                ))}
                <SelectItem value={NEW_STAFF_VALUE}>{t("settings:team.addNewMember")}</SelectItem>
              </SelectContent>
            </Select>
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-xs font-medium tracking-[0.24em] text-muted-foreground uppercase">
                {t("settings:team.name")}
              </span>
              <Input
                onChange={(event) => setName(event.target.value)}
                placeholder={t("settings:team.placeholders.name")}
                value={name}
              />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-medium tracking-[0.24em] text-muted-foreground uppercase">
                {t("settings:team.timezone")}
              </span>
              <Input
                onChange={(event) => setTimezone(event.target.value)}
                placeholder={t("settings:team.placeholders.timezone")}
                value={timezone}
              />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <label className="space-y-2">
              <span className="text-xs font-medium tracking-[0.24em] text-muted-foreground uppercase">
                {t("settings:team.transferNumber")}
              </span>
              <Input
                onChange={(event) => setTransferNumber(event.target.value)}
                placeholder={t("settings:team.placeholders.transferNumber")}
                value={transferNumber}
              />
            </label>
            <label className="flex items-center gap-3 rounded-2xl border border-border/70 bg-background/80 px-4 py-3">
              <Checkbox
                checked={active}
                onCheckedChange={(checked) => setActive(Boolean(checked))}
              />
              <span className="text-sm text-foreground">{t("settings:team.activeForBooking")}</span>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={isSavingStaff || name.trim().length === 0} type="submit">
              {isSavingStaff
                ? t("settings:team.saving")
                : selectedStaff
                  ? t("settings:team.save")
                  : t("settings:team.saveNew")}
            </Button>
            {staffSaveMessage ? (
              <span className="text-sm text-muted-foreground">{staffSaveMessage}</span>
            ) : null}
          </div>
        </form>

        <div className="space-y-4">
          <div className="space-y-1">
            <p className="text-xs font-medium tracking-[0.24em] text-muted-foreground uppercase">
              {t("settings:team.serviceAssignments")}
            </p>
            <p className="text-sm text-muted-foreground">
              {t("settings:team.assignmentDescription")}
            </p>
          </div>

          {staff.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 p-6 text-sm text-muted-foreground">
              {t("settings:team.emptyStaff")}
            </div>
          ) : null}

          {staff.length > 0 && services.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 p-6 text-sm text-muted-foreground">
              {t("settings:team.emptyServices")}
            </div>
          ) : null}

          {staff.length > 0 && services.length > 0 ? (
            <div className="space-y-4">
              {staff.map((member) => {
                const assignedCount = services.filter((service) =>
                  assignmentState[assignmentKey(String(member._id), String(service._id))],
                ).length;

                return (
                  <div
                    className="space-y-4 rounded-2xl border border-border/70 bg-background/80 p-4"
                    key={member._id}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">{member.name}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {member.timezone}
                          {member.transferNumber ? ` • ${member.transferNumber}` : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant={member.active ? "default" : "outline"}>
                          {member.active
                            ? t("common:badges.active")
                            : t("common:badges.inactive")}
                        </Badge>
                        <Badge variant="secondary">
                          {t("settings:team.assignedServices", { count: assignedCount })}
                        </Badge>
                      </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      {services.map((service) => {
                        const key = assignmentKey(String(member._id), String(service._id));
                        return (
                          <label
                            className="flex items-start gap-3 rounded-2xl border border-border/70 bg-card px-4 py-3"
                            key={service._id}
                          >
                            <Checkbox
                              checked={Boolean(assignmentState[key])}
                              onCheckedChange={(checked) =>
                                toggleAssignment(
                                  String(member._id),
                                  String(service._id),
                                  Boolean(checked),
                                )
                              }
                            />
                            <span className="space-y-1">
                              <span className="block text-sm font-medium text-foreground">
                                {service.name}
                              </span>
                              <span className="block text-sm text-muted-foreground">
                                {service.durationMinutes} min
                                {service.description ? ` • ${service.description}` : ""}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              <div className="flex flex-wrap items-center gap-3">
                <Button disabled={isSavingAssignments} onClick={() => void handleAssignmentsSave()} type="button">
                  {isSavingAssignments
                    ? t("settings:team.savingAssignments")
                    : t("settings:team.saveAssignments")}
                </Button>
                {assignmentSaveMessage ? (
                  <span className="text-sm text-muted-foreground">{assignmentSaveMessage}</span>
                ) : null}
              </div>
            </div>
          ) : null}

          {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}
