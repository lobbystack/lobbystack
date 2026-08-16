"use client";

import { createContext, useContext } from "react";
import { Plus } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type PageSurfaceProps = {
  eyebrow?: string;
  title: string;
  description: string;
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

export function DataSurface({ title, description, columns, rows = [], action }: { title: string; description: string; columns: string[]; rows?: string[][]; action?: string }) {
  return (
    <PageSurface {...(action ? { action } : {})} description={description} title={title}>
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>{columns.map((column) => <TableHead key={column}>{column}</TableHead>)}</TableRow></TableHeader>
              <TableBody>
                {rows.length > 0 ? rows.map((row, index) => <TableRow key={index}>{row.map((cell, cellIndex) => <TableCell key={cellIndex}>{cell}</TableCell>)}</TableRow>) : <TableRow><TableCell className="h-32 text-center text-muted-foreground" colSpan={columns.length}>No records yet.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </PageSurface>
  );
}
