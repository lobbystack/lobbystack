// Same document as the public locale layout, but rendered per request.
export { default, generateStaticParams, metadata } from "../../(public)/[locale]/layout";

export const dynamic = "force-dynamic";
export const dynamicParams = false;
