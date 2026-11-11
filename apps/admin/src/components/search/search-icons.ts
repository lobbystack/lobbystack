import { AtSign, AudioLines, Bell, BookOpen, Bot, BriefcaseBusiness, Building2, CalendarDays, ChartColumnIncreasing, ClipboardCheck, Contact, CreditCard, Gauge, Globe, Handshake, House, KeyRound, Layers, LifeBuoy, ListChecks, MessageSquareMore, Palette, Phone, Plug, Radio, ReceiptText, ScrollText, Settings, ShieldCheck, Tags, UserRound, UsersRound, Webhook, type LucideIcon } from "lucide-react";

// The icon each search result shows: the one its row has in the sidebar,
// in Lucide, so a result looks like the place it opens.

const PAGE_ICONS: Record<string, LucideIcon> = {
  "/": House,
  "/inbox": MessageSquareMore,
  "/appointments": CalendarDays,
  "/contacts": UsersRound,
  "/analytics": ChartColumnIncreasing,
  "/agents": ClipboardCheck,
  "/affiliate": LifeBuoy,
  "/business": Building2,
  "/business/knowledge": BookOpen,
  "/business/services": Tags,
  "/business/employees": Contact,
  "/business/integrations": Plug,
  "/workspace/team": UsersRound,
  "/workspace/usage": Gauge,
  "/workspace/billing": CreditCard,
  "/workspace/subscription": ReceiptText,
  "/workspace/webhooks": Webhook,
  "/workspace/api-keys": KeyRound,
  "/workspace/partner-access": Handshake,
  "/account": ShieldCheck,
  "/account/appearance": Palette,
  "/account/notifications": Bell,
};

const AGENT_ICONS: Record<string, LucideIcon> = {
  "": AudioLines,
  instructions: ScrollText,
  rules: ListChecks,
  channels: Radio,
  "channels/phone": Phone,
  "channels/widget": Globe,
  shared: Layers,
};

/** The icon for a page, setting or agent page, from the id and href the catalog gives it. */
export function entryIcon(id: string, href: string): LucideIcon {
  if (id.endsWith(":instagram")) return AtSign;
  const agent = /^agent:[^:]+(?::(.*))?$/u.exec(id);
  if (agent) return agent[1] === undefined ? Bot : AGENT_ICONS[agent[1]] ?? Bot;
  return PAGE_ICONS[href] ?? (href.startsWith("/business") ? BriefcaseBusiness : href.startsWith("/workspace") || href.startsWith("/account") ? Settings : House);
}

export { MessageSquareMore as ConversationIcon, UserRound as ContactIcon };
