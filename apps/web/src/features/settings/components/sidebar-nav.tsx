import { useState, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type SidebarNavProps = React.HTMLAttributes<HTMLElement> & {
  items: {
    href: string;
    title: string;
    icon: ReactNode;
  }[];
};

export function SidebarNav({ className, items, ...props }: SidebarNavProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [value, setValue] = useState(location.pathname || "/settings");

  function handleSelect(nextValue: string | null) {
    if (!nextValue) {
      return;
    }

    setValue(nextValue);
    void navigate(nextValue);
  }

  return (
    <>
      <div className="p-1 md:hidden">
        <Select onValueChange={handleSelect} value={value}>
          <SelectTrigger className="h-12 sm:w-48">
            <SelectValue placeholder="Settings" />
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem key={item.href} value={item.href}>
                <div className="flex gap-x-4 px-2 py-1">
                  <span className="scale-125">{item.icon}</span>
                  <span className="text-md">{item.title}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="hidden w-full min-w-40 bg-background px-1 py-2 md:block">
        <nav
          className={cn(
            "flex space-x-2 py-1 lg:flex-col lg:space-y-1 lg:space-x-0",
            className,
          )}
          {...props}
        >
          {items.map((item) => (
            <NavLink
              className={({ isActive }) =>
                cn(
                  buttonVariants({ variant: "ghost" }),
                  isActive
                    ? "bg-muted hover:bg-accent"
                    : "hover:bg-accent hover:underline",
                  "justify-start",
                )
              }
              end={item.href === "/settings"}
              key={item.href}
              to={item.href}
            >
              <span className="me-2">{item.icon}</span>
              {item.title}
            </NavLink>
          ))}
        </nav>
      </div>
    </>
  );
}
