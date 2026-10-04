"use client";

import { createContext, useContext } from "react";
import { Plus } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";

export type PageSurfaceProps = {
  title: string;
  action?: string;
  children?: React.ReactNode;
};

const NestedPageSurfaceContext = createContext(false);

export function NestedPageSurfaceProvider({ children }: { children: React.ReactNode }) {
  return <NestedPageSurfaceContext.Provider value>{children}</NestedPageSurfaceContext.Provider>;
}

export function PageSurface({ title, action, children }: PageSurfaceProps) {
  const nested = useContext(NestedPageSurfaceContext);
  return (
    <div className="flex flex-col gap-6">
      {!nested ? <PageHeader
        actions={action ? <Button><Plus data-icon="inline-start" />{action}</Button> : undefined}
        title={title}
      /> : null}
      {children}
    </div>
  );
}
