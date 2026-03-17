export interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
  biblePassages?: BibleReference[]
  alphaThemes?: string[]
  feedback?: "up" | "down" | null
  saved?: boolean
}

export interface BibleReference {
  reference: string
  summary: string
}

export interface Conversation {
  id: string
  title: string
  messages: Message[]
  createdAt: Date
}

export interface ChatSettings {
  gentleTone: boolean
  showBiblePassages: boolean
  detailedAnswers: boolean
}

export const TOPIC_CHIPS = [
  "Who is Jesus?",
  "Prayer",
  "Holy Spirit",
  "Why and how do I read the Bible?",
  "Church",
] as const

export const STARTER_PROMPTS = [
  "What is the meaning of life?",
  "How do I start praying?",
  "Who is Jesus and why does he matter?",
  "How can I deal with suffering?",
  "How do I read the Bible for the first time?",
] as const

export const TOPIC_GUIDES = [
  {
    id: "jesus",
    title: "Who is Jesus?",
    description:
      "Explore the life, teachings, and significance of Jesus Christ. Discover why millions find hope and meaning in his story.",
    icon: "heart" as const,
  },
  {
    id: "prayer",
    title: "Prayer",
    description:
      "Learn what prayer is, how to begin, and why it matters. Prayer is simply an honest conversation with God.",
    icon: "message-circle" as const,
  },
  {
    id: "holy-spirit",
    title: "The Holy Spirit",
    description:
      "Understand who the Holy Spirit is and how the Spirit works in everyday life, offering guidance, comfort, and strength.",
    icon: "wind" as const,
  },
  {
    id: "bible",
    title: "Reading the Bible",
    description:
      "Practical tips for approaching the Bible for the first time. Discover how this ancient text speaks to modern life.",
    icon: "book-open" as const,
  },
  {
    id: "church",
    title: "Church & Community",
    description:
      "What is church really about? Explore the role of community, belonging, and shared faith in the Christian life.",
    icon: "users" as const,
  },
  {
    id: "faith-doubt",
    title: "Faith & Doubt",
    description:
      "Doubt is a natural part of the journey. Explore how questions and uncertainties can actually deepen your understanding.",
    icon: "help-circle" as const,
  },
  {
    id: "suffering",
    title: "Suffering & Hope",
    description:
      "Why is there pain in the world? Explore how faith offers perspective, comfort, and hope in difficult times.",
    icon: "sunrise" as const,
  },
] as const
