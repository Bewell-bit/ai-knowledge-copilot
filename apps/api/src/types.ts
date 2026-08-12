export type Citation = { chunkId: string; documentId: string; title: string; content: string; score: number };
export type AgentEvent =
  | { type: "plan"; content: string }
  | { type: "tool"; name: string; input: unknown; output: string }
  | { type: "answer"; content: string; citations: Citation[]; latencyMs: number };

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
export type AgentContext = { sessionId: string; query: string; history: ChatMessage[] };
