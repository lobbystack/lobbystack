import { useState, useRef, useEffect } from "react"
import { Play, Pause } from "lucide-react"

interface CallDemo {
  title: string
  duration: string
  src: string
}

const DEMOS: CallDemo[] = [
  { title: "Home Services", duration: "0:45", src: "" },
  { title: "Salons & Spas", duration: "1:12", src: "" },
  { title: "Clinics", duration: "0:58", src: "" },
  { title: "Repair Shops", duration: "1:04", src: "" },
]

const WAVEFORM = Array.from({ length: 52 }, (_, index) => {
  const primary = Math.sin(index * 0.72) * 0.28
  const secondary = Math.sin(index * 1.37 + 0.8) * 0.18
  return `${((0.58 + primary + secondary) * 100).toFixed(4)}%`
})

export function WaveformPlayer() {
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0) // 0 to 1
  const [activeDemo, setActiveDemo] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const activeSrc = DEMOS[activeDemo].src

  const togglePlay = () => {
    if (isPlaying) {
      audioRef.current?.pause()
      setIsPlaying(false)
      return
    }

    // If there's no src, simulate playing for the demo
    if (!activeSrc) {
      setIsPlaying(true)
      return
    }

    audioRef.current?.play().catch(() => {
      // Handle no-audio-source gracefully in demo mode by just simulating
      setIsPlaying(true)
    })
  }

  // Simulate progress if no audio source is present
  useEffect(() => {
    let interval: NodeJS.Timeout
    if (isPlaying && !activeSrc) {
      interval = setInterval(() => {
        setProgress((p) => {
          if (p >= 1) {
            setIsPlaying(false)
            return 0
          }
          return p + 0.01 // Adjust speed as needed
        })
      }, 100)
    }
    return () => clearInterval(interval)
  }, [isPlaying, activeSrc])

  const handleTimeUpdate = () => {
    if (audioRef.current && activeSrc) {
      const current = audioRef.current.currentTime
      const duration = audioRef.current.duration
      if (duration) {
        setProgress(current / duration)
      }
    }
  }

  const handleEnded = () => {
    setIsPlaying(false)
    setProgress(0)
  }

  const handleDemoSelect = (index: number) => {
    setActiveDemo(index)
    setIsPlaying(false)
    setProgress(0)
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      {/* Audio Player Interface */}
      <div className="flex items-center justify-center gap-4 sm:gap-6">
        <button
          onClick={togglePlay}
          className="group relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-transform hover:scale-105 active:scale-95 sm:h-14 sm:w-14"
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
            <Pause className="h-5 w-5 fill-current sm:h-6 sm:w-6" />
          ) : (
            <Play className="ml-0.5 h-5 w-5 fill-current sm:h-6 sm:w-6" />
          )}
          {/* Soft glow behind the play button */}
          <div className="absolute inset-0 -z-10 rounded-full bg-foreground/20 blur-xl transition-all group-hover:bg-foreground/30" />
        </button>

        {/* Waveform */}
        <div className="flex h-12 items-center gap-1">
          {WAVEFORM.map((height, i) => {
            const barProgress = i / WAVEFORM.length
            const isActive = progress > 0 && barProgress < progress
            return (
              <div
                key={i}
                className={`w-1.5 rounded-full transition-all duration-150 ${i >= 24 ? "hidden sm:block" : ""} ${
                  isActive ? "bg-foreground" : "bg-foreground/15"
                }`}
                style={{
                  height,
                }}
              />
            )
          })}
        </div>
      </div>

      {/* Industry Demo Selector */}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
        {DEMOS.map((demo, idx) => (
          <button
            key={demo.title}
            onClick={() => handleDemoSelect(idx)}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
              activeDemo === idx
                ? "border-foreground bg-foreground text-background"
                : "border-border/60 bg-transparent text-muted-foreground hover:border-foreground/30 hover:text-foreground"
            }`}
          >
            {demo.title}
          </button>
        ))}
      </div>

      {/* Hidden Audio Element */}
      {activeSrc && (
        <audio
          ref={audioRef}
          src={activeSrc}
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleEnded}
          className="hidden"
        />
      )}
    </div>
  )
}
