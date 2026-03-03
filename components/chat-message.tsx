"use client"

import { cn } from "@/lib/utils"
import type { Message } from "@/lib/chat-data"
import { useState } from "react"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import {
  BookOpen,
  Copy,
  Bookmark,
  BookmarkCheck,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react"

interface ChatMessageProps {
  message: Message
  showBiblePassages: boolean
  onFeedback: (messageId: string, feedback: "up" | "down") => void
  onSave: (messageId: string) => void
  onCopy: (content: string) => void
}

export function ChatMessage({
  message,
  showBiblePassages,
  onFeedback,
  onSave,
  onCopy,
}: ChatMessageProps) {
  const [copied, setCopied] = useState(false)
  const isUser = message.role === "user"

  const handleCopy = () => {
    onCopy(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      className={cn(
        "flex w-full gap-3",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      {!isUser && (
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground mt-1">
          <BookOpen className="size-4" />
        </div>
      )}
      <div
        className={cn(
          "flex max-w-[85%] flex-col gap-2 md:max-w-[70%]",
          isUser ? "items-end" : "items-start"
        )}
      >
        <div
          className={cn(
            "rounded-2xl px-4 py-3 text-sm leading-relaxed",
            isUser
              ? "bg-primary text-primary-foreground rounded-br-md"
              : "bg-card text-card-foreground border border-border shadow-sm rounded-bl-md"
          )}
        >
          <div className="whitespace-pre-wrap">{message.content}</div>
        </div>

        {!isUser && showBiblePassages && message.biblePassages && message.biblePassages.length > 0 && (
          <div className="w-full">
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="passages" className="border-none">
                <AccordionTrigger className="py-2 text-xs text-muted-foreground hover:no-underline gap-2">
                  <span className="flex items-center gap-1.5">
                    <BookOpen className="size-3" />
                    Bible passages & themes
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="rounded-xl border border-border bg-muted/50 p-3 space-y-2">
                    {message.biblePassages.map((passage, i) => (
                      <div key={i} className="text-xs">
                        <span className="font-semibold text-primary">
                          {passage.reference}
                        </span>
                        <span className="text-muted-foreground">
                          {" — "}
                          {passage.summary}
                        </span>
                      </div>
                    ))}
                    {message.alphaThemes && message.alphaThemes.length > 0 && (
                      <div className="border-t border-border pt-2 mt-2">
                        <p className="text-xs font-medium text-muted-foreground mb-1">
                          Related themes
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {message.alphaThemes.map((theme, i) => (
                            <span
                              key={i}
                              className="inline-block rounded-full bg-primary/10 px-2.5 py-0.5 text-xs text-primary font-medium"
                            >
                              {theme}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        )}

        {!isUser && (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-muted-foreground hover:text-foreground"
              onClick={() => onSave(message.id)}
              aria-label={message.saved ? "Unsave message" : "Save message"}
            >
              {message.saved ? (
                <BookmarkCheck className="size-3.5 text-primary" />
              ) : (
                <Bookmark className="size-3.5" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-muted-foreground hover:text-foreground"
              onClick={handleCopy}
              aria-label="Copy message"
            >
              <Copy className="size-3.5" />
              {copied && <span className="text-xs ml-1">Copied</span>}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-7 px-2",
                message.feedback === "up"
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => onFeedback(message.id, "up")}
              aria-label="Thumbs up"
            >
              <ThumbsUp className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-7 px-2",
                message.feedback === "down"
                  ? "text-destructive"
                  : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => onFeedback(message.id, "down")}
              aria-label="Thumbs down"
            >
              <ThumbsDown className="size-3.5" />
            </Button>
          </div>
        )}
      </div>
      {isUser && (
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground mt-1 font-medium text-xs">
          You
        </div>
      )}
    </div>
  )
}
