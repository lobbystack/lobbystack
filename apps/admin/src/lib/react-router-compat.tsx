"use client";

import NextLink from "next/link";
import {
  usePathname,
  useRouter,
  useSearchParams as useNextSearchParams,
} from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type AnchorHTMLAttributes,
  type ReactNode,
} from "react";

type NavigateOptions = {
  replace?: boolean;
  state?: unknown;
};

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  to: string;
  replace?: boolean;
  state?: unknown;
};

export function Link({ to, children, replace, ...props }: LinkProps) {
  return (
    <NextLink href={to} replace={replace} {...props}>
      {children}
    </NextLink>
  );
}

export function useNavigate() {
  const router = useRouter();
  return useCallback(
    (to: string | number, options?: NavigateOptions) => {
      if (typeof to === "number") {
        window.history.go(to);
        return;
      }
      if (options?.replace) {
        router.replace(to);
      } else {
        router.push(to);
      }
    },
    [router],
  );
}

export function useLocation() {
  const pathname = usePathname();
  const searchParams = useNextSearchParams();
  const search = searchParams.toString();
  return useMemo(
    () => ({
      pathname,
      search: search ? `?${search}` : "",
      hash: "",
      state: null,
      key: pathname,
    }),
    [pathname, search],
  );
}

export function useSearchParams(): [URLSearchParams, (next: URLSearchParams) => void] {
  const params = useNextSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const setSearchParams = useCallback(
    (next: URLSearchParams) => {
      const query = next.toString();
      router.push(query ? `${pathname}?${query}` : pathname);
    },
    [pathname, router],
  );

  return [params, setSearchParams];
}

const OutletContext = createContext<unknown>(null);

export function Outlet() {
  return null;
}

export function useOutletContext<T = unknown>(): T {
  return useContext(OutletContext) as T;
}

export function OutletProvider({
  value,
  children,
}: {
  value: unknown;
  children: ReactNode;
}) {
  return <OutletContext.Provider value={value}>{children}</OutletContext.Provider>;
}

export function Routes({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function Route({ element }: { element?: ReactNode; path?: string; index?: boolean }) {
  return <>{element}</>;
}

export function Navigate({ to, replace }: { to: string; replace?: boolean }) {
  const router = useRouter();
  if (replace) {
    router.replace(to);
  } else {
    router.push(to);
  }
  return null;
}

export function NavLink({
  to,
  children,
  className,
}: {
  to: string;
  children?: ReactNode | ((state: { isActive: boolean }) => ReactNode);
  className?: string | ((state: { isActive: boolean }) => string);
}) {
  const pathname = usePathname();
  const isActive = pathname === to || pathname.startsWith(`${to}/`);
  const resolvedClassName =
    typeof className === "function" ? className({ isActive }) : className;
  const resolvedChildren =
    typeof children === "function" ? children({ isActive }) : (children ?? null);

  return (
    <NextLink href={to} className={resolvedClassName}>
      {resolvedChildren}
    </NextLink>
  );
}

export function MemoryRouter({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function useParams<T extends Record<string, string | undefined> = Record<string, string>>() {
  const pathname = usePathname();
  return useMemo(() => {
    const segments = pathname.split("/").filter(Boolean);
    const params: Record<string, string | undefined> = {};
    if (segments[0] === "calls" && segments[1]) {
      params.callId = segments[1];
    }
    if (segments[0] === "contacts" && segments[1]) {
      params.contactId = segments[1];
    }
    if (segments[0] === "demo" && segments[1]) {
      params.token = segments[1];
    }
    return params as T;
  }, [pathname]);
}
