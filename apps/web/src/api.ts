export type Citation = { chunkId: string; documentId: string; title: string; content: string; score: number };
export type AgentRole = "supervisor" | "retrieval" | "analyst" | "reviewer";
export type AgentEvent = { type: "plan"; content: string } | { type: "tool"; name: string; input: unknown; output: string } | { type: "agent"; role: AgentRole; status: "completed"; summary: string } | { type: "answer"; content: string; citations: Citation[]; latencyMs: number };
export type AgentStreamEvent =
  | { type: "plan"; content: string }
  | { type: "tool"; name: string; input: unknown; output: string }
  | { type: "agent"; role: AgentRole; status: "completed"; summary: string }
  | { type: "delta"; content: string }
  | { type: "done"; content: string; citations: Citation[]; latencyMs: number; cached: boolean };
export type Document = { id: string; title: string; source: string; createdAt: string; characters: number };
export type Metrics = { requests: number; avgLatency: number; toolCalls: number; cacheEntries: number; documents: number; chunks: number };
export type Trace = { id: string; query: string; answer: string; latencyMs: number; toolCalls: number; createdAt: string };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "请求失败");
  return data as T;
}
async function streamChat(sessionId: string, message: string, onEvent: (event: AgentStreamEvent) => void, signal?: AbortSignal) {
  const response = await fetch("/api/chat/stream", {
    method: "POST", signal,
    headers: { Accept: "text/event-stream", "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, message })
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({ error: "流式请求失败" })) as { error?: string };
    throw new Error(data.error ?? `流式请求失败: ${response.status}`);
  }
  if (!response.body) throw new Error("浏览器未提供流式响应体");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/g, "\n");
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const data = frame.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
      if (!data) continue;
      const event = JSON.parse(data) as AgentStreamEvent | { type: "error"; message: string };
      if (event.type === "error") throw new Error(event.message);
      onEvent(event);
    }
    if (done) break;
  }
}
export const api = {
  chat: (sessionId: string, message: string) => request<{ events: AgentEvent[] }>("/api/chat", { method: "POST", body: JSON.stringify({ sessionId, message }) }),
  streamChat,
  documents: () => request<Document[]>("/api/documents"),
  addDocument: (data: { title: string; source: string; content: string }) => request("/api/documents", { method: "POST", body: JSON.stringify(data) }),
  metrics: () => request<Metrics>("/api/metrics"),
  traces: () => request<Trace[]>("/api/traces")
};
