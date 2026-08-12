export type Citation = { chunkId: string; documentId: string; title: string; content: string; score: number };
export type AgentEvent = { type: "plan"; content: string } | { type: "tool"; name: string; input: unknown; output: string } | { type: "answer"; content: string; citations: Citation[]; latencyMs: number };
export type Document = { id: string; title: string; source: string; createdAt: string; characters: number };
export type Metrics = { requests: number; avgLatency: number; toolCalls: number; cacheEntries: number; documents: number; chunks: number };
export type Trace = { id: string; query: string; answer: string; latencyMs: number; toolCalls: number; createdAt: string };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "请求失败");
  return data as T;
}
export const api = {
  chat: (sessionId: string, message: string) => request<{ events: AgentEvent[] }>("/api/chat", { method: "POST", body: JSON.stringify({ sessionId, message }) }),
  documents: () => request<Document[]>("/api/documents"),
  addDocument: (data: { title: string; source: string; content: string }) => request("/api/documents", { method: "POST", body: JSON.stringify(data) }),
  metrics: () => request<Metrics>("/api/metrics"),
  traces: () => request<Trace[]>("/api/traces")
};
