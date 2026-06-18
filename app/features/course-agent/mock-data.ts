// Stub data for the Course Agent side panel. No backend yet — these canned threads
// drive the panel shell (message + tool-call rendering, threads, token counter) until
// the agent loop route is wired. Replace with live `useChat` data when that lands.

export type ToolName = "ls" | "tree" | "cat" | "grep";

export type ToolPart = {
  type: "tool";
  tool: ToolName;
  /** The command as the agent would issue it, e.g. `grep "generic" /sections`. */
  command: string;
  /** Bash-style text output (or JSON for cat). */
  output: string;
  /** Paths this call touched. */
  touched: string[];
};

export type TextPart = { type: "text"; text: string };

export type Part = TextPart | ToolPart;

export type Message = {
  id: string;
  role: "user" | "assistant";
  parts: Part[];
};

export type Thread = {
  id: string;
  /** Epoch ms of the last message — drives the human-friendly "updated …" label. */
  updatedAt: number;
  /** Last-step input_tokens — the "context window used" number, raw. */
  contextTokens: number;
  messages: Message[];
};

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const now = Date.now();

export const THREADS: Thread[] = [
  {
    id: "t1",
    updatedAt: now - 4 * MIN,
    contextTokens: 47213,
    messages: [
      {
        id: "m1",
        role: "user",
        parts: [
          {
            type: "text",
            text: "Which lessons cover generics, and do any of them reference each other?",
          },
        ],
      },
      {
        id: "m2",
        role: "assistant",
        parts: [
          {
            type: "text",
            text: "Let me search the course for generics, then check the dependency links.",
          },
          {
            type: "tool",
            tool: "grep",
            command: 'grep "generic" /sections',
            touched: [
              "/sections/03-types/lessons/03.04-generics/lesson.json",
              "/sections/05-advanced/lessons/05.02-conditional-types/lesson.json",
            ],
            output: [
              "/sections/03-types/lessons/03.04-generics/lesson.json:title: Introduction to Generics",
              "/sections/03-types/lessons/03.04-generics/lesson.json:description: Reusable types with type parameters.",
              "/sections/05-advanced/lessons/05.02-conditional-types/lesson.json:description: Builds on generics to derive types conditionally.",
            ].join("\n"),
          },
          {
            type: "tool",
            tool: "cat",
            command:
              "cat /sections/05-advanced/lessons/05.02-conditional-types/lesson.json '.dependencies'",
            touched: [
              "/sections/05-advanced/lessons/05.02-conditional-types/lesson.json",
            ],
            output: '[\n  "03.04-generics"\n]',
          },
          {
            type: "text",
            text: "Two lessons cover generics:\n\n1. **03.04 — Introduction to Generics** (the foundation)\n2. **05.02 — Conditional Types**, which lists `03.04-generics` as a dependency.\n\nSo yes — *Conditional Types* explicitly builds on *Introduction to Generics*. No other lessons reference generics directly.",
          },
        ],
      },
    ],
  },
  {
    id: "t2",
    updatedAt: now - 3 * HOUR,
    contextTokens: 31980,
    messages: [
      {
        id: "m3",
        role: "user",
        parts: [
          {
            type: "text",
            text: "What's still unrecorded (ghost) in section 5?",
          },
        ],
      },
      {
        id: "m4",
        role: "assistant",
        parts: [
          {
            type: "tool",
            tool: "ls",
            command: "ls /sections/05-advanced/lessons",
            touched: ["/sections/05-advanced/lessons"],
            output: [
              "05.01-mapped-types/",
              "05.02-conditional-types/",
              "05.03-template-literals/   [ghost]",
              "05.04-variance/   [ghost]",
            ].join("\n"),
          },
          {
            type: "text",
            text: "Section 5 has **two ghost lessons** still to record:\n\n- 05.03 — Template Literal Types\n- 05.04 — Variance\n\nThe first two (Mapped Types, Conditional Types) are already on disk.",
          },
        ],
      },
    ],
  },
  {
    id: "t3",
    updatedAt: now - 2 * DAY,
    contextTokens: 2104,
    messages: [],
  },
];

/** Format a raw token count: e.g. 47213 → "47K". */
export function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(n < 10000 ? 1 : 0)}K`;
}

/** Rough context-window budget for the token affordance (200K Claude window). */
export const CONTEXT_WINDOW = 200_000;
