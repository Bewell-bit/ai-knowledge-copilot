import { randomUUID } from "node:crypto";
import type { Db } from "./db.js";
import type { AgentEvent, ChatMessage } from "./types.js";
import type { LlmClient } from "./llm.js";
import { RagService } from "./rag.js";
import { TtlCache } from "./cache.js";

export class KnowledgeAgent {
  private rag: RagService;
  private cache = new TtlCache<AgentEvent[]>(120_000);

  constructor(private db: Db, private model: LlmClient) { this.rag = new RagService(db); }

  getHistory(sessionId: string): ChatMessage[] {
    return this.db.getHistory(sessionId);
  }

  async run(sessionId: string, query: string): Promise<AgentEvent[]> {
    const started = Date.now();
    const cacheKey = query.trim().toLowerCase();
    const cached = this.cache.get(cacheKey);
    if (cached) return cached.map((event) => event.type === "answer" ? { ...event, latencyMs: Date.now() - started } : event);

    const history = this.getHistory(sessionId);
    const plan: AgentEvent = { type: "plan", content: "理解问题 → 检索业务知识库 → 评估证据充分性 → 生成可追溯回答" };
    const citations = this.rag.search(query);
    const tool: AgentEvent = {
      type: "tool", name: "knowledge_search", input: { query, topK: 4 },
      output: citations.length ? `找到 ${citations.length} 条相关资料` : "未找到相关资料"
    };
    const answerText = await this.model.complete([...history, { role: "user", content: query }], citations);
    const answer: AgentEvent = { type: "answer", content: answerText, citations, latencyMs: Date.now() - started };
    const events = [plan, tool, answer];

    const now = new Date().toISOString();
    this.db.addConversation([
      { id: randomUUID(), sessionId, role: "user", content: query, createdAt: now },
      { id: randomUUID(), sessionId, role: "assistant", content: answerText, createdAt: new Date(Date.now() + 1).toISOString() }
    ], { id: randomUUID(), sessionId, query, answer: answerText, latencyMs: answer.latencyMs, toolCalls: 1, createdAt: now });
    this.cache.set(cacheKey, events);
    return events;
  }

  metrics() {
    const requests = this.db.traces.length;
    const avgLatency = requests ? this.db.traces.reduce((sum, item) => sum + item.latencyMs, 0) / requests : 0;
    const toolCalls = this.db.traces.reduce((sum, item) => sum + item.toolCalls, 0);
    return { requests, avgLatency, toolCalls, cacheEntries: this.cache.size };
  }
}
