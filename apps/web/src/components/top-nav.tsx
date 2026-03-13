import { Menu } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type TopNavProps = React.HTMLAttributes<HTMLElement> & {
  links: Array<{
    title: string;
    href: string;
    disabled?: boolean;
  }>;
};

export function TopNav({ className, links, ...props }: TopNavProps) {
  const location = useLocation();

  return (
    <>
      <div className="lg:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button className="md:size-7" size="icon" variant="outline" />
            }
          >
            <Menu />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="bottom">
            {links.map(({ title, href, disabled }) => {
              const isActive = location.pathname === href;

              return (
                <DropdownMenuItem
                  className={cn(
                    !isActive && "text-muted-foreground",
                    disabled && "pointer-events-none opacity-50",
                  )}
                  key={`${title}-${href}`}
                  render={<NavLink to={href} />}
                >
                  {title}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <nav
        className={cn(
          "hidden items-center space-x-4 lg:flex lg:space-x-4 xl:space-x-6",
          className,
        )}
        {...props}
      >
        {links.map(({ title, href, disabled }) => (
          <NavLink
            className={({ isActive }) =>
              cn(
                "text-sm font-medium transition-colors hover:text-primary",
                !isActive && "text-muted-foreground",
                disabled && "pointer-events-none opacity-50",
              )
            }
            key={`${title}-${href}`}
            to={href}
          >
            {title}
          </NavLink>
        ))}
      </nav>
    </>
  );
}
