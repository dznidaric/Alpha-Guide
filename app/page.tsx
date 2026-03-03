"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import type { Conversation, Message, ChatSettings } from "@/lib/chat-data"
import { STARTER_PROMPTS } from "@/lib/chat-data"
import { streamChatResponse, type StreamEvent } from "@/lib/api"
import { ChatSidebar } from "@/components/chat-sidebar"
import { ChatMessage } from "@/components/chat-message"
import { ChatComposer } from "@/components/chat-composer"
import { TypingIndicator } from "@/components/typing-indicator"
import { WelcomeCard } from "@/components/welcome-card"
import { SettingsDrawer } from "@/components/settings-drawer"
import { TopicGuidesDialog } from "@/components/topic-guides-dialog"
import { HowItWorksDialog } from "@/components/how-it-works-dialog"
import { ThemeToggle } from "@/components/theme-toggle"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import {
  Menu,
  Info,
  BookOpen,
  Shield,
  Settings,
} from "lucide-react"

export default function ChatApp() {
  // Start with an empty conversation list (no mocks — real API now)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [topicGuidesOpen, setTopicGuidesOpen] = useState(false)
  const [howItWorksOpen, setHowItWorksOpen] = useState(false)
  // null = idle, string = what the agent is doing right now
  const [agentStatus, setAgentStatus] = useState<string | null>(null)
  const [settings, setSettings] = useState<ChatSettings>({
    gentleTone: true,
    showBiblePassages: true,
    detailedAnswers: false,
  })

  // AbortController ref so we can cancel an in-flight stream
  const abortRef = useRef<AbortController | null>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Scroll-area viewport ref (via our extended ScrollArea component)
  const viewportRef = useRef<HTMLDivElement>(null)

  // Track whether the user is near the bottom — only auto-scroll when true.
  // Using a ref (not state) so scroll events don't trigger re-renders.
  const shouldAutoScrollRef = useRef(true)

  const activeConversation = conversations.find(
    (c) => c.id === activeConversationId
  )

  const scrollToBottom = useCallback(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [])

  // Attach a passive scroll listener to the viewport to track position
  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const onScroll = () => {
      const { scrollHeight, scrollTop, clientHeight } = viewport
      // "near bottom" = within 100px of the end
      shouldAutoScrollRef.current = scrollHeight - scrollTop - clientHeight < 100
    }
    viewport.addEventListener("scroll", onScroll, { passive: true })
    return () => viewport.removeEventListener("scroll", onScroll)
  }, [activeConversation?.id]) // re-attach when conversation changes

  // Auto-scroll only when the user hasn't scrolled up
  useEffect(() => {
    if (shouldAutoScrollRef.current) {
      scrollToBottom()
    }
  }, [activeConversation?.messages, agentStatus, scrollToBottom])

  // Cancel any in-flight stream on unmount
  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  // -----------------------------------------------------------------------
  // Send message → stream response from backend
  // -----------------------------------------------------------------------
  const handleSendMessage = useCallback(
    async (content: string) => {
      // Cancel a previous stream if still running
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      // Build user message
      const userMessage: Message = {
        id: `msg-${Date.now()}`,
        role: "user",
        content,
        timestamp: new Date(),
      }

      // Determine which conversation to append to
      let targetConvoId: string

      if (activeConversationId && activeConversation) {
        // Existing conversation → add user message
        targetConvoId = activeConversationId
        setConversations((prev) =>
          prev.map((c) =>
            c.id === targetConvoId
              ? { ...c, messages: [...c.messages, userMessage] }
              : c
          )
        )
      } else {
        // New conversation
        targetConvoId = `conv-${Date.now()}`
        const newConvo: Conversation = {
          id: targetConvoId,
          title: content.slice(0, 50) + (content.length > 50 ? "..." : ""),
          messages: [userMessage],
          createdAt: new Date(),
        }
        setConversations((prev) => [newConvo, ...prev])
        setActiveConversationId(targetConvoId)
      }

      // Show "Thinking…" while we wait for the first event
      setAgentStatus("Thinking…")
      // Force auto-scroll on since the user just sent a message
      shouldAutoScrollRef.current = true

      const assistantMsgId = `msg-${Date.now()}-assistant`
      let isFirstContentToken = true

      try {
        for await (const event of streamChatResponse(
          content,
          { threadId: targetConvoId }, // tie messages to the same conversation thread
          controller.signal,
        )) {
          // ── Status events (tool calls, fetching, etc.) ──
          if (event.type === "status") {
            setAgentStatus(event.status)
            continue
          }

          // ── Content tokens ──
          const token = event.content

          if (isFirstContentToken) {
            // First real token → create assistant message & clear status
            const assistantMessage: Message = {
              id: assistantMsgId,
              role: "assistant",
              content: token,
              timestamp: new Date(),
              feedback: null,
              saved: false,
            }
            setConversations((prev) =>
              prev.map((c) =>
                c.id === targetConvoId
                  ? { ...c, messages: [...c.messages, assistantMessage] }
                  : c
              )
            )
            setAgentStatus(null)
            isFirstContentToken = false
          } else {
            // Subsequent tokens → append to the assistant message
            setConversations((prev) =>
              prev.map((c) =>
                c.id === targetConvoId
                  ? {
                      ...c,
                      messages: c.messages.map((m) =>
                        m.id === assistantMsgId
                          ? { ...m, content: m.content + token }
                          : m
                      ),
                    }
                  : c
              )
            )
          }
        }

        // Stream completed with no content tokens → show a fallback
        if (isFirstContentToken) {
          const fallback: Message = {
            id: assistantMsgId,
            role: "assistant",
            content:
              "I wasn't able to generate a response. Please try again.",
            timestamp: new Date(),
            feedback: null,
            saved: false,
          }
          setConversations((prev) =>
            prev.map((c) =>
              c.id === targetConvoId
                ? { ...c, messages: [...c.messages, fallback] }
                : c
            )
          )
        }
      } catch (err) {
        // Don't show an error if the user intentionally cancelled
        if (controller.signal.aborted) return

        console.error("Streaming error:", err)

        if (isFirstContentToken) {
          const errorMessage: Message = {
            id: assistantMsgId,
            role: "assistant",
            content:
              "Sorry, something went wrong connecting to the server. Please make sure the backend is running and try again.",
            timestamp: new Date(),
            feedback: null,
            saved: false,
          }
          setConversations((prev) =>
            prev.map((c) =>
              c.id === targetConvoId
                ? { ...c, messages: [...c.messages, errorMessage] }
                : c
            )
          )
        } else {
          // Partial content received — append a note
          setConversations((prev) =>
            prev.map((c) =>
              c.id === targetConvoId
                ? {
                    ...c,
                    messages: c.messages.map((m) =>
                      m.id === assistantMsgId
                        ? {
                            ...m,
                            content:
                              m.content +
                              "\n\n*(Connection lost — response may be incomplete.)*",
                          }
                        : m
                    ),
                  }
                : c
            )
          )
        }
      } finally {
        setAgentStatus(null)
      }
    },
    [activeConversationId, activeConversation]
  )

  // -----------------------------------------------------------------------
  // Sidebar / UX handlers
  // -----------------------------------------------------------------------
  const handleNewChat = useCallback(() => {
    abortRef.current?.abort() // cancel any in-flight stream
    setActiveConversationId(null)
    setSidebarOpen(false)
    setAgentStatus(null)
  }, [])

  const handleSelectConversation = useCallback((id: string) => {
    abortRef.current?.abort()
    setActiveConversationId(id)
    setSidebarOpen(false)
    setAgentStatus(null)
  }, [])

  const handleFeedback = useCallback(
    (messageId: string, feedback: "up" | "down") => {
      setConversations((prev) =>
        prev.map((c) => ({
          ...c,
          messages: c.messages.map((m) =>
            m.id === messageId
              ? { ...m, feedback: m.feedback === feedback ? null : feedback }
              : m
          ),
        }))
      )
    },
    []
  )

  const handleSave = useCallback((messageId: string) => {
    setConversations((prev) =>
      prev.map((c) => ({
        ...c,
        messages: c.messages.map((m) =>
          m.id === messageId ? { ...m, saved: !m.saved } : m
        ),
      }))
    )
  }, [])

  const handleCopy = useCallback((content: string) => {
    navigator.clipboard.writeText(content)
  }, [])

  const handleStartTopicChat = useCallback(
    (topic: string) => {
      handleSendMessage(`Tell me about: ${topic}`)
    },
    [handleSendMessage]
  )

  return (
    <div className="flex h-screen h-dvh overflow-hidden bg-background">
      <ChatSidebar
        conversations={conversations}
        activeConversationId={activeConversationId}
        onSelectConversation={handleSelectConversation}
        onNewChat={handleNewChat}
        onTopicChipClick={handleStartTopicChat}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main column — min-h-0 lets it shrink inside the h-dvh root */}
      <div className="flex flex-1 flex-col min-w-0 min-h-0">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-border bg-card/80 backdrop-blur-sm px-4 py-3">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 md:hidden"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open sidebar"
            >
              <Menu className="size-4" />
            </Button>
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <BookOpen className="size-3.5" />
              </div>
              <div>
                <h1 className="font-serif text-base font-semibold text-foreground leading-tight">
                  Faith & Life Chat
                </h1>
                <p className="text-xs text-muted-foreground hidden sm:block">
                  Explore questions of faith and life
                </p>
              </div>
            </div>
          </div>
          <nav className="flex items-center gap-1" aria-label="Header navigation">
            <Button
              variant="ghost"
              size="sm"
              className="hidden sm:inline-flex text-xs gap-1.5 h-8"
              onClick={() => setHowItWorksOpen(true)}
            >
              <Info className="size-3.5" />
              How it works
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="hidden sm:inline-flex text-xs gap-1.5 h-8"
              onClick={() => setTopicGuidesOpen(true)}
            >
              <BookOpen className="size-3.5" />
              Topics
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="sm:hidden h-8 w-8 p-0"
              onClick={() => setHowItWorksOpen(true)}
              aria-label="How it works"
            >
              <Info className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="sm:hidden h-8 w-8 p-0"
              onClick={() => setTopicGuidesOpen(true)}
              aria-label="Topic guides"
            >
              <BookOpen className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setSettingsOpen(true)}
              aria-label="Settings"
            >
              <Settings className="size-4" />
            </Button>
            <ThemeToggle />
          </nav>
        </header>

        {/* Chat content — min-h-0 is critical for scroll to work inside flex */}
        {!activeConversation ? (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <WelcomeCard
              onPromptClick={(prompt) => handleSendMessage(prompt)}
            />
          </div>
        ) : (
          <ScrollArea className="flex-1 min-h-0" viewportRef={viewportRef}>
            <div className="mx-auto max-w-3xl space-y-6 p-4 pb-2">
              {activeConversation.messages.map((message) => (
                <ChatMessage
                  key={message.id}
                  message={message}
                  showBiblePassages={settings.showBiblePassages}
                  onFeedback={handleFeedback}
                  onSave={handleSave}
                  onCopy={handleCopy}
                />
              ))}
              {agentStatus !== null && <TypingIndicator status={agentStatus} />}
              <div ref={chatEndRef} />
            </div>
          </ScrollArea>
        )}

        {/* Composer */}
        {activeConversation && (
          <div className="border-t border-border bg-card/50 backdrop-blur-sm px-4 py-3">
            <div className="mx-auto max-w-3xl">
              <ChatComposer
                onSend={handleSendMessage}
                disabled={!!agentStatus}
                suggestedPrompts={
                  activeConversation.messages.length <= 2
                    ? STARTER_PROMPTS.slice(0, 3)
                    : undefined
                }
                onSuggestedPromptClick={handleSendMessage}
              />
              <p className="mt-2 text-center text-xs text-muted-foreground">
                This chatbot offers faith-based guidance and is not professional
                counseling.
              </p>
            </div>
          </div>
        )}

        {/* Disclaimer for empty state */}
        {!activeConversation && (
          <div className="border-t border-border px-4 py-3">
            <div className="mx-auto max-w-3xl">
              <ChatComposer
                onSend={handleSendMessage}
                disabled={!!agentStatus}
              />
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
                <Shield className="size-3" />
                <span>
                  This chatbot offers faith-based guidance and is not professional
                  counseling.
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Dialogs & Drawers */}
      <SettingsDrawer
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settings}
        onSettingsChange={setSettings}
      />
      <TopicGuidesDialog
        open={topicGuidesOpen}
        onOpenChange={setTopicGuidesOpen}
        onStartChat={handleStartTopicChat}
      />
      <HowItWorksDialog
        open={howItWorksOpen}
        onOpenChange={setHowItWorksOpen}
      />
    </div>
  )
}
