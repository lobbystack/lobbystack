"use client";

import { ProductAnalytics } from "@/components/product-analytics";
import { LocaleProvider } from "@/components/replacement-locale-provider";
import type { LocaleSource } from "@/lib/locale-request";

import { BaseProviders, type BaseProvidersProps } from "./base-providers";

type ProvidersProps = BaseProvidersProps & {
  initialLocaleSource: LocaleSource;
};

/** Every page's providers but the website widget's: the shared ones, the saved language preference, and product analytics. */
export function Providers({ children, initialLocaleSource, ...props }: ProvidersProps) {
  return (
    <BaseProviders {...props}>
      <LocaleProvider initialLocale={props.initialLocale} initialLocaleSource={initialLocaleSource}>
        <ProductAnalytics>
          {children}
        </ProductAnalytics>
      </LocaleProvider>
    </BaseProviders>
  );
}
