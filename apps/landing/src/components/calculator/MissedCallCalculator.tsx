import { useState, type ChangeEvent } from "react"
import { buttonVariants } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const MAX_MISSED_CALLS_PER_WEEK = 500
const MAX_AVERAGE_JOB_VALUE = 1_000_000

const TRADES = {
  Custom: { jobValue: 450, calls: 8, oppRate: 60, bookRate: 30 },
  "General Contractor": { jobValue: 5000, calls: 5, oppRate: 40, bookRate: 20 },
  HVAC: { jobValue: 650, calls: 12, oppRate: 70, bookRate: 40 },
  Plumbing: { jobValue: 450, calls: 15, oppRate: 75, bookRate: 45 },
  Electrical: { jobValue: 350, calls: 10, oppRate: 70, bookRate: 40 },
  Roofing: { jobValue: 8000, calls: 4, oppRate: 30, bookRate: 15 },
  Landscaping: { jobValue: 1200, calls: 10, oppRate: 60, bookRate: 35 },
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min
  return Math.min(Math.max(value, min), max)
}

export function MissedCallCalculator() {
  const [trade, setTrade] = useState<keyof typeof TRADES>("Custom")
  const [calls, setCalls] = useState(TRADES["Custom"].calls)
  const [jobValue, setJobValue] = useState(TRADES["Custom"].jobValue)
  const [oppRate, setOppRate] = useState(TRADES["Custom"].oppRate)
  const [bookRate, setBookRate] = useState(TRADES["Custom"].bookRate)

  const handleTradeChange = (selected: string | null) => {
    if (!selected) return
    if (!(selected in TRADES)) return
    const key = selected as keyof typeof TRADES
    setTrade(key)
    setCalls(TRADES[key].calls)
    setJobValue(TRADES[key].jobValue)
    setOppRate(TRADES[key].oppRate)
    setBookRate(TRADES[key].bookRate)
  }

  const monthlyCalls = calls * 4.3
  const opportunities = monthlyCalls * (oppRate / 100)
  const jobsAtRisk = opportunities * (bookRate / 100)
  const revenueAtRiskMonthly = jobsAtRisk * jobValue
  const revenueAtRiskYearly = revenueAtRiskMonthly * 12

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(val)

  const handleNumberChange =
    (setter: (value: number) => void, max: number) =>
    (event: ChangeEvent<HTMLInputElement>) => {
      setter(clampNumber(event.currentTarget.valueAsNumber, 0, max))
    }

  return (
    <div className="mt-12 grid grid-cols-1 items-start gap-8 lg:grid-cols-12 lg:gap-12">
      <div className="lg:col-span-7">
        <div
          className="flex flex-col gap-6"
          role="group"
          aria-labelledby="calculator-inputs-heading"
        >
          <h2 id="calculator-inputs-heading" className="sr-only">
            Missed call revenue inputs
          </h2>
          <div>
            <label id="trade-label" className="mb-2 block text-sm font-medium">
              Trade / Industry
            </label>
            <Select value={trade} onValueChange={handleTradeChange}>
              <SelectTrigger className="w-full" aria-labelledby="trade-label">
                <SelectValue placeholder="Select a trade" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {Object.keys(TRADES).map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <label
                htmlFor="missed-calls"
                className="mb-2 block text-sm font-medium"
              >
                Missed calls per week
              </label>
              <Input
                id="missed-calls"
                type="number"
                inputMode="numeric"
                min={0}
                max={MAX_MISSED_CALLS_PER_WEEK}
                aria-describedby="missed-calls-hint"
                value={calls}
                onChange={handleNumberChange(
                  setCalls,
                  MAX_MISSED_CALLS_PER_WEEK
                )}
              />
              <p
                id="missed-calls-hint"
                className="mt-2 text-xs text-muted-foreground"
              >
                Use 0 to {MAX_MISSED_CALLS_PER_WEEK} missed calls per week.
              </p>
            </div>
            <div>
              <label
                htmlFor="average-job-value"
                className="mb-2 block text-sm font-medium"
              >
                Average job value ($)
              </label>
              <Input
                id="average-job-value"
                type="number"
                inputMode="numeric"
                min={0}
                max={MAX_AVERAGE_JOB_VALUE}
                aria-describedby="average-job-value-hint"
                value={jobValue}
                onChange={handleNumberChange(
                  setJobValue,
                  MAX_AVERAGE_JOB_VALUE
                )}
              />
              <p
                id="average-job-value-hint"
                className="mt-2 text-xs text-muted-foreground"
              >
                Estimate up to {formatCurrency(MAX_AVERAGE_JOB_VALUE)} per job.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-4 border-t border-border/50 pt-4">
            <div>
              <div className="mb-2 flex justify-between">
                <label
                  id="opportunity-rate-label"
                  className="text-sm font-medium"
                >
                  % of calls that are real jobs
                </label>
                <span className="text-sm text-muted-foreground">
                  {oppRate}%
                </span>
              </div>
              <Slider
                value={[oppRate]}
                min={0}
                max={100}
                aria-labelledby="opportunity-rate-label"
                onValueChange={(value) =>
                  setOppRate(
                    clampNumber(Array.isArray(value) ? value[0] : value, 0, 100)
                  )
                }
              />
            </div>

            <div>
              <div className="mb-2 flex justify-between">
                <label id="booking-rate-label" className="text-sm font-medium">
                  Booking rate if answered
                </label>
                <span className="text-sm text-muted-foreground">
                  {bookRate}%
                </span>
              </div>
              <Slider
                value={[bookRate]}
                min={0}
                max={100}
                aria-labelledby="booking-rate-label"
                onValueChange={(value) =>
                  setBookRate(
                    clampNumber(Array.isArray(value) ? value[0] : value, 0, 100)
                  )
                }
              />
            </div>
          </div>
        </div>
      </div>

      <div className="relative lg:col-span-5 lg:self-center">
        <Card className="sticky top-24 flex flex-col gap-4 bg-background p-6 sm:p-8">
          <div className="flex flex-col gap-2" aria-live="polite">
            <h3 className="text-sm font-medium text-muted-foreground">
              Monthly Revenue at Risk
            </h3>
            <div className="text-4xl font-semibold tracking-tight break-words text-foreground sm:text-5xl">
              {formatCurrency(revenueAtRiskMonthly)}
            </div>
            <p className="pt-2 text-sm text-muted-foreground">
              That&apos;s <strong>{formatCurrency(revenueAtRiskYearly)}</strong>{" "}
              per year, representing roughly{" "}
              <strong>{jobsAtRisk.toFixed(1)} lost jobs</strong> every month.
            </p>
          </div>

          <div className="pt-2">
            <a
              href="https://app.lobbystack.com/signup?source=calculator"
              className={buttonVariants({
                size: "lg",
                className: "w-full text-base",
              })}
            >
              Try LobbyStack free
            </a>
            <p className="mt-3 text-center text-xs text-muted-foreground">
              These are estimates. Actual results may vary.
            </p>
          </div>
        </Card>
      </div>
    </div>
  )
}
