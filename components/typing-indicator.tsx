"use client"

import { Loader2 } from "lucide-react"

interface TypingIndicatorProps {
  /** When provided, displays a short status label (e.g. "Searching knowledge base…").
   *  When absent/null, falls back to the generic bouncing-dots animation. */
  status?: string | null
}

/**
 * Visual indicator shown while the agent is processing a request.
 *
 * Two modes:
 * 1. **Status mode** — a spinner + descriptive label (tool calling, fetching, etc.)
 * 2. **Dots mode** — three bouncing dots (generic "typing…" feel)
 */
export function TypingIndicator({ status }: TypingIndicatorProps) {
  return (
    <div className="flex items-start gap-3">
      {/* Avatar */}
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground mt-1">
        <svg
          className="size-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
        </svg>
      </div>

      {/* Bubble */}
      <div className="rounded-2xl rounded-bl-md bg-card border border-border shadow-sm px-4 py-3">
        {status ? (
          /* Status mode — spinner + label */
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            <span>{status}</span>
          </div>
        ) : (
          /* Dots mode — generic typing animation */
          <div className="flex items-center gap-1.5">
            <div className="size-2 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:0ms]" />
            <div className="size-2 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:150ms]" />
            <div className="size-2 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:300ms]" />
          </div>
        )}
      </div>
    </div>
  )
}
