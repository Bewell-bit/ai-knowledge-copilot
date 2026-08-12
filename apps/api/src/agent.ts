import { randomUUID } from "node:crypto";
import type { Db } from "./db.js";
import type { AgentEvent, AgentStreamEvent, ChatMessage } from "./types.js";
import type { LlmClient } from "./llm.js";
import { RagService } from "./rag.js";
import { TtlCache } from "./cache.js";
import { MultiAgentGraph } from "./multi-agent.js";

export class KnowledgeAgent {
  private rag: RagService;
  private multiAgent: MultiAgentGraph;
  private cache = new TtlCache<AgentEvent[]>(120_000);

  constructor(private db: Db, private model: LlmClient) {
    this.rag = new RagService(db);
    this.multiAgent = new MultiAgentGraph(this.rag, model);
  }

  getHistory(sessionId: string): ChatMessage[] {
    return this.db.getHistory(sessionId);
  }

  async run(sessionId: string, query: string): Promise<AgentEvent[]> {
    const events: AgentEvent[] = [];
    for await (const event of this.stream(sessionId, query)) {
      if (
        event.type === "plan" ||
        event.type === "tool" ||
        event.type === "agent"
      )
        events.push(event);
      if (event.type === "done")
        events.push({
          type: "answer",
          content: event.content,
          citations: event.citations,
          latencyMs: event.latencyMs,
        });
    }
    return events;
  }

  async *stream(
    sessionId: string,
    query: string,
    signal?: AbortSignal
  ): AsyncGenerator<AgentStreamEvent> {
    const started = Date.now();
    const cacheKey = query.trim().toLowerCase();
    const cached = this.cache.get(cacheKey);
    if (cached) {
      const answer = cached.find((event) => event.type === "answer");
      for (const event of cached) if (event.type !== "answer") yield event;
      if (answer?.type === "answer") {
        for (const content of this.splitAnswer(answer.content))
          yield { type: "delta", content };
        yield {
          type: "done",
          content: answer.content,
          citations: answer.citations,
          latencyMs: Date.now() - started,
          cached: true,
        };
      }
      return;
    }

    const history = this.getHistory(sessionId);
    const plan = {
      type: "plan" as const,
      content:
        "Supervisor 路由 → Retrieval 检索 → Analyst 分析 → Reviewer 质量审查",
    };
    yield plan;
    const graphEvents: AgentEvent[] = [plan];
    let citations = [] as ReturnType<RagService["search"]>;
    let answerText = "";
    let retrievalCalls = 0;
    for await (const update of this.multiAgent.stream(
      { query, history },
      signal
    )) {
      const agentEvent = {
        type: "agent" as const,
        role: update.role,
        status: update.status,
        summary: update.summary,
      };
      graphEvents.push(agentEvent);
      yield agentEvent;
      if (update.role === "retrieval") {
        citations = update.state.citations ?? citations;
        retrievalCalls += 1;
        const tool = {
          type: "tool" as const,
          name: "knowledge_search",
          input: { query, topK: citations.length },
          output: update.summary,
        };
        graphEvents.push(tool);
        yield tool;
      }
      if (update.role === "analyst")
        answerText = update.state.draft ?? answerText;
    }
    if (signal?.aborted) return;

    for (const content of this.splitAnswer(answerText, 12)) {
      yield { type: "delta", content };
      await new Promise((resolve) => setTimeout(resolve, 12));
    }

    const latencyMs = Date.now() - started;
    const answer: AgentEvent = {
      type: "answer",
      content: answerText,
      citations,
      latencyMs,
    };
    const now = new Date().toISOString();
    this.db.addConversation(
      [
        {
          id: randomUUID(),
          sessionId,
          role: "user",
          content: query,
          createdAt: now,
        },
        {
          id: randomUUID(),
          sessionId,
          role: "assistant",
          content: answerText,
          createdAt: new Date(Date.now() + 1).toISOString(),
        },
      ],
      {
        id: randomUUID(),
        sessionId,
        query,
        answer: answerText,
        latencyMs,
        toolCalls: retrievalCalls,
        createdAt: now,
      }
    );
    this.cache.set(cacheKey, [...graphEvents, answer]);
    yield {
      type: "done",
      content: answerText,
      citations,
      latencyMs,
      cached: false,
    };
  }

  private *splitAnswer(content: string, size = 24) {
    for (let index = 0; index < content.length; index += size)
      yield content.slice(index, index + size);
  }

  metrics() {
    const requests = this.db.traces.length;
    const avgLatency = requests
      ? this.db.traces.reduce((sum, item) => sum + item.latencyMs, 0) / requests
      : 0;
    const toolCalls = this.db.traces.reduce(
      (sum, item) => sum + item.toolCalls,
      0
    );
    return { requests, avgLatency, toolCalls, cacheEntries: this.cache.size };
  }
}
