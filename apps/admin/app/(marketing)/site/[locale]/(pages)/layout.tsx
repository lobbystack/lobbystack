// The marketing chrome (header and footer) wraps every page here. Machine
// routes such as robots.txt and the feeds sit beside this group, outside it.
export default function MarketingPagesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
