"use client"

import { STARTER_PROMPTS } from "@/lib/chat-data"
import { Sparkles } from "lucide-react"

interface WelcomeCardProps {
  onPromptClick: (prompt: string) => void
}

export function WelcomeCard({ onPromptClick }: WelcomeCardProps) {
  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-8 text-center">
        <div className="space-y-3">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Sparkles className="size-7" />
          </div>
          <h2 className="font-serif text-2xl font-semibold text-foreground text-balance">
            Welcome to Faith & Life Chat
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground max-w-sm mx-auto text-pretty">
            Ask anything about faith, life, prayer, or purpose. This is a safe,
            judgement-free space for your questions.
          </p>
        </div>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {STARTER_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              onClick={() => onPromptClick(prompt)}
              className="rounded-xl border border-border bg-card p-3.5 text-left text-sm text-foreground/80 shadow-sm transition-all hover:bg-secondary hover:shadow-md"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
