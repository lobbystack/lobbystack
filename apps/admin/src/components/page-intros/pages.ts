import type { ComponentType } from "react";
import {
  ArrowLeftRight,
  BookOpen,
  Bot,
  Building2,
  CalendarCheck,
  CalendarOff,
  CalendarRange,
  ChartLine,
  CircleHelp,
  Gauge,
  Clock,
  Filter,
  Inbox,
  ListChecks,
  MessagesSquare,
  MousePointerClick,
  PhoneCall,
  PhoneForwarded,
  Plug,
  Plus,
  Quote,
  Sparkles,
  Star,
  Tag,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { PageIntroId } from "@lobbystack/shared";

import {
  AgentsIllustration,
  AnalyticsIllustration,
  AppointmentsIllustration,
  ChannelsIllustration,
  EmployeesIllustration,
  InboxIllustration,
  KnowledgeIllustration,
  RulesIllustration,
  ServicesIllustration,
} from "./illustrations";

/** One line of a card, under `intros:pages.<page>.<key>`. */
export type PageIntroLine = { key: "what" | "shared" | "does" | "how"; icon: LucideIcon };

export type PageIntroContent = {
  /** The page's Help Center article, from the Help Center's root. */
  guide: `/${string}`;
  /** What the page is, what it does and how to use it, in three or four lines. */
  lines: readonly PageIntroLine[];
  Illustration: ComponentType;
};

const lines = (what: LucideIcon, does: LucideIcon, how: LucideIcon): PageIntroLine[] => [{ key: "what", icon: what }, { key: "does", icon: does }, { key: "how", icon: how }];

export const PAGE_INTROS: Record<PageIntroId, PageIntroContent> = {
  inbox: { guide: "/dashboard/inbox", lines: lines(Inbox, ListChecks, Filter), Illustration: InboxIllustration },
  appointments: { guide: "/dashboard/appointments", lines: lines(CalendarCheck, MousePointerClick, CalendarOff), Illustration: AppointmentsIllustration },
  agents: {
    guide: "/agent/manage-agents",
    lines: [{ key: "what", icon: Bot }, { key: "shared", icon: Building2 }, { key: "does", icon: Star }, { key: "how", icon: PhoneCall }],
    Illustration: AgentsIllustration,
  },
  rules: { guide: "/agent/rules", lines: lines(Sparkles, Quote, MessagesSquare), Illustration: RulesIllustration },
  channels: { guide: "/agent/channels", lines: lines(Plug, Bot, ArrowLeftRight), Illustration: ChannelsIllustration },
  knowledge: { guide: "/settings/knowledge", lines: lines(BookOpen, CircleHelp, Plus), Illustration: KnowledgeIllustration },
  services: { guide: "/settings/services", lines: lines(Tag, Clock, Plus), Illustration: ServicesIllustration },
  employees: { guide: "/settings/employees", lines: lines(Users, UserRound, PhoneForwarded), Illustration: EmployeesIllustration },
  analytics: { guide: "/dashboard/analytics", lines: lines(Gauge, ChartLine, CalendarRange), Illustration: AnalyticsIllustration },
};
