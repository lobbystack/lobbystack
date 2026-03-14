import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ThemeSwitch() {
  const { resolvedTheme, setTheme, theme } = useTheme();

  const currentTheme = theme ?? resolvedTheme ?? "system";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button className="rounded-full" size="icon" variant="ghost" />}>
        <Sun className="size-[1.1rem] scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
        <Moon className="absolute size-[1.1rem] scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
        <span className="sr-only">Toggle theme</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuItem onClick={() => setTheme("light")}>
          <Sun data-icon="inline-start" />
          Light
          <Check className={cn("ml-auto", currentTheme !== "light" && "hidden")} />
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          <Moon data-icon="inline-start" />
          Dark
          <Check className={cn("ml-auto", currentTheme !== "dark" && "hidden")} />
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>
          <Monitor data-icon="inline-start" />
          System
          <Check className={cn("ml-auto", currentTheme !== "system" && "hidden")} />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
