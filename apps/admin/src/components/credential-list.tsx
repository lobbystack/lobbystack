import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** The rows of a list of credentials, such as API keys or MCP connections, inside a Surface. */
export function CredentialList({ children, label }: { children: ReactNode; label: string }) {
  return <ul aria-label={label} className="divide-y">{children}</ul>;
}

/**
 * One credential: its name, one muted line about when it was made, by whom
 * and when it was last used, and its actions on the right. On a phone the
 * actions wrap under the text. A revoked one is muted and has no actions.
 * Session replays mask the line, which names a person.
 */
export function CredentialRow({ name, meta, actions, muted = false, nameClassName }: { name: ReactNode; meta: ReactNode[]; actions?: ReactNode; muted?: boolean; nameClassName?: string }) {
  return (
    <li className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className={cn("type-item-title truncate", muted && "text-muted-foreground", nameClassName)}>{name}</p>
        <p className="ph-mask type-body-muted flex flex-col sm:flex-row sm:flex-wrap sm:gap-x-1.5">
          {meta.map((part, index) => (
            // On a phone each part takes its own line, with no dot between them.
            <span key={index}>
              {index > 0 ? <span aria-hidden="true" className="mr-1.5 hidden sm:inline">·</span> : null}
              {part}
            </span>
          ))}
        </p>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </li>
  );
}
