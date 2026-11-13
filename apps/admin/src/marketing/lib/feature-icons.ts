import {
  AudioLines,
  BarChart3,
  BellRing,
  BookOpen,
  CalendarCheck,
  Code,
  Inbox,
  Pencil,
  PhoneCall,
  PhoneForwarded,
  Plug,
  Server,
  Tag,
  Terminal,
  Webhook,
  type LucideIcon,
} from "lucide-react"

import type { FeatureId } from "@/marketing/lib/feature-index"

/** The icon each feature carries in the Product menu and on the features index. */
export const featureIcons: Record<FeatureId, LucideIcon> = {
  calls: PhoneCall,
  booking: CalendarCheck,
  rules: Pencil,
  transfers: PhoneForwarded,
  inbox: Inbox,
  notifications: BellRing,
  knowledge: BookOpen,
  voices: AudioLines,
  analytics: BarChart3,
  integrations: Webhook,
  mcp: Plug,
  api: Terminal,
  selfHosting: Server,
  whiteLabel: Tag,
  source: Code,
}
