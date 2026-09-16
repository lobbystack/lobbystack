import { PageSurface } from "@/components/page-surface";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function SettingsBillingCompliancePage() {
  return <PageSurface title="AI SMS compliance" description="Review the requirements for sending AI-assisted SMS messages from your workspace.">
    <Card className="max-w-3xl"><CardHeader><CardTitle>AI SMS compliance</CardTitle><CardDescription>Keep consent, sender identity, and opt-out handling configured before enabling automated SMS.</CardDescription></CardHeader><CardContent className="space-y-5 text-sm text-muted-foreground"><div className="space-y-2"><p className="font-medium text-foreground">Before enabling AI SMS</p><ul className="list-disc space-y-2 pl-5"><li>Use a verified business phone number and identify the sender clearly.</li><li>Collect consent before sending non-essential messages.</li><li>Honor STOP, HELP, and other carrier opt-out requests.</li><li>Keep message content relevant to the customer’s request.</li></ul></div><div className="flex flex-wrap gap-3"><Button nativeButton={false} render={<Link href="/settings/notifications" />} variant="outline">Review notifications</Button><Button nativeButton={false} render={<Link href="/settings/plan" />}>Back to billing</Button></div></CardContent></Card>
  </PageSurface>;
}
