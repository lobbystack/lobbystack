import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const reasons = [
  {
    title: "On the Job Site",
    description:
      "When you're under a house, up on a roof, or operating machinery, you simply can't safely or professionally answer the phone.",
  },
  {
    title: "Talking to a Customer",
    description:
      "Taking a call while speaking with a homeowner face-to-face is rude and costs trust. But ignoring the phone loses the new lead.",
  },
  {
    title: "Driving Between Jobs",
    description:
      "If your hands are on the wheel, you can't write down a name, address, and job details. Customers hate repeating themselves later.",
  },
  {
    title: "After Hours & Weekends",
    description:
      "Emergencies happen 24/7. If a pipe bursts at 9 PM and you don't answer, they immediately call the next plumber on Google.",
  },
]

export function MissedRevenueCards() {
  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-semibold tracking-tight text-foreground">
        Why contractors miss revenue
      </h2>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {reasons.map((reason) => (
          <Card key={reason.title}>
            <CardHeader>
              <CardTitle>{reason.title}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-relaxed text-muted-foreground">
              {reason.description}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
