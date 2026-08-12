import { DataSurface } from "@/components/page-surface";

export default function AppearancePage() { return <DataSurface title="Appearance" description="Choose the language, theme, and dashboard preferences for your workspace." columns={["Preference", "Value", "Action"]} rows={[["Language", "English", "Change"], ["Theme", "System", "Change"], ["Replay privacy", "Sensitive routes excluded", "Review"]]} />; }
