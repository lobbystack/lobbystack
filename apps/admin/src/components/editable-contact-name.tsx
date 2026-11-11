"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { requestJson } from "@/lib/request-json";

/** Every query that shows a contact's name, so a rename shows everywhere at once. */
const NAMED_QUERIES = ["contacts", "contact", "call", "inbox", "messages", "appointments", "dashboard", "search"] as const;

/** The roles that can change a contact, as the contacts page allows. */
const CONTACT_EDITOR_ROLES = ["business_owner", "business_admin"];

export function canEditContacts(role: string | null | undefined): boolean {
  return Boolean(role && CONTACT_EDITOR_ROLES.includes(role));
}

type EditableContactNameProps = {
  businessId: string | undefined;
  /** The contact to rename. Without one the name is plain text. */
  contactId: string | null | undefined;
  /** What the heading shows: the contact's name, or its number or channel when it has none. */
  displayName: string;
  /** Whether the person can change contacts. */
  canEdit: boolean;
};

/**
 * A contact's name that edits in place, for a name the agent misheard. At rest
 * it reads as the heading's text; clicking puts the caret where you clicked.
 * Enter or leaving saves, Escape or an empty name puts the old name back.
 */
export function EditableContactName({ businessId, contactId, displayName, canEdit }: EditableContactNameProps) {
  const { t } = useTranslation("contacts");
  const queryClient = useQueryClient();
  const ref = useRef<HTMLSpanElement | null>(null);
  // The name shown until the contact's queries refetch, so a saved name doesn't flash back to the old one.
  const [saved, setSaved] = useState<string | null>(null);
  const shown = saved ?? displayName;

  useEffect(() => { setSaved(null); }, [displayName]);

  // React leaves an edited text node alone, so the shown name is written back by hand whenever it changes.
  useEffect(() => {
    const element = ref.current;
    if (element && document.activeElement !== element && element.textContent !== shown) element.textContent = shown;
  }, [shown]);

  const rename = useMutation({
    mutationFn: (name: string) => requestJson(`/api/contacts/${encodeURIComponent(contactId!)}?businessId=${encodeURIComponent(businessId!)}`, { method: "PATCH", body: JSON.stringify({ name }) }),
    onSuccess: async () => {
      await Promise.all(NAMED_QUERIES.map((key) => queryClient.invalidateQueries({ queryKey: [key, businessId] })));
    },
    onError: () => {
      setSaved(null);
      if (ref.current) ref.current.textContent = displayName;
      toast.error(t("edit.failed"));
    },
  });

  if (!canEdit || !contactId || !businessId) return <>{displayName}</>;

  const restore = () => { if (ref.current) ref.current.textContent = shown; };

  const commit = () => {
    const element = ref.current;
    if (!element) return;
    const next = (element.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!next || next === shown) { restore(); return; }
    element.textContent = next;
    setSaved(next);
    rename.mutate(next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.blur();
    } else if (event.key === "Escape") {
      event.preventDefault();
      restore();
      event.currentTarget.blur();
    }
  };

  return (
    <span
      aria-label={t("edit.contactName")}
      className="cursor-text outline-none"
      contentEditable="plaintext-only"
      data-slot="editable-contact-name"
      onBlur={commit}
      onKeyDown={onKeyDown}
      // A pasted name keeps only its text.
      onPaste={(event) => { event.preventDefault(); document.execCommand("insertText", false, event.clipboardData.getData("text/plain").replace(/\s+/g, " ")); }}
      ref={ref}
      role="textbox"
      spellCheck={false}
      suppressContentEditableWarning
      tabIndex={0}
    >
      {shown}
    </span>
  );
}
