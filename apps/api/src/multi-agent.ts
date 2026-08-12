import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type { LlmClient } from "./llm.js";
import type { RagService } from "./rag.js";
import type { AgentRole, ChatMessage, Citation } from "./types.js";

export type ReviewResult = {
  approved: boolean;
  score: number;
  feedback: string;
};

const GraphState = Annotation.Root({
  query: Annotation<string>,
  history: Annotation<ChatMessage[]>({
    reducer: (_current, update) => update,
    default: () => [],
  }),
  citations: Annotation<Citation[]>({
    reducer: (_current, update) => update,
    default: () => [],
  }),
  draft: Annotation<string>({
    reducer: (_current, update) => update,
    default: () => "",
  }),
  review: Annotation<ReviewResult | null>({
    reducer: (_current, update) => update,
    default: () => null,
  }),
  route: Annotation<"retrieve" | "finish">({
    reducer: (_current, update) => update,
    default: () => "retrieve",
  }),
  retryCount: Annotation<number>({
    reducer: (_current, update) => update,
    default: () => 0,
  }),
});

export type MultiAgentState = typeof GraphState.State;
export type GraphNodeUpdate = {
  role: AgentRole;
  status: "completed";
  summary: string;
  state: Partial<MultiAgentState>;
};

export class MultiAgentGraph {
  private readonly graph;

  constructor(private rag: RagService, private model: LlmClient) {
    this.graph = new StateGraph(GraphState)
      .addNode("supervisor", async (state) => ({
        route: state.query.trim() ? ("retrieve" as const) : ("finish" as const),
      }))
      .addNode("retrieval", async (state) => ({
        citations: this.rag.search(state.query, state.retryCount ? 6 : 4),
      }))
      .addNode("analyst", async (state, config) => ({
        draft: await this.model.complete(
          [
            ...state.history,
            {
              role: "system",
              content:
                "你是 Analyst Agent，负责仅依据检索证据形成清晰、可执行的业务回答。",
            },
            { role: "user", content: state.query },
          ],
          state.citations,
          config.signal
        ),
      }))
      .addNode("reviewer", async (state) => {
        const review = this.review(state);
        return {
          review,
          retryCount: review.approved ? state.retryCount : state.retryCount + 1,
        };
      })
      .addEdge(START, "supervisor")
      .addConditionalEdges("supervisor", (state) => state.route, {
        retrieve: "retrieval",
        finish: END,
      })
      .addEdge("retrieval", "analyst")
      .addEdge("analyst", "reviewer")
      .addConditionalEdges(
        "reviewer",
        (state) =>
          !state.review?.approved && state.retryCount < 2 ? "retry" : "finish",
        { retry: "retrieval", finish: END }
      )
      .compile();
  }

  async *stream(
    input: { query: string; history: ChatMessage[] },
    signal?: AbortSignal
  ): AsyncGenerator<GraphNodeUpdate> {
    const updates = await this.graph.stream(
      {
        ...input,
        citations: [],
        draft: "",
        review: null,
        route: "retrieve",
        retryCount: 0,
      },
      { streamMode: "updates", signal }
    );
    for await (const update of updates) {
      if (signal?.aborted) return;
      const [node, state] = Object.entries(update)[0] ?? [];
      if (!node || !state) continue;
      const value = state as Partial<MultiAgentState>;
      if (node === "supervisor")
        yield {
          role: "supervisor",
          status: "completed",
          summary: "已拆解任务并路由至 Retrieval Agent",
          state: value,
        };
      if (node === "retrieval")
        yield {
          role: "retrieval",
          status: "completed",
          summary: `召回 ${value.citations?.length ?? 0} 条知识证据`,
          state: value,
        };
      if (node === "analyst")
        yield {
          role: "analyst",
          status: "completed",
          summary: "已基于证据完成答案草稿",
          state: value,
        };
      if (node === "reviewer")
        yield {
          role: "reviewer",
          status: "completed",
          summary: value.review?.approved
            ? `质量审查通过 · ${value.review.score} 分`
            : `审查未通过，触发补充检索 · ${value.review?.feedback}`,
          state: value,
        };
    }
  }

  private review(state: MultiAgentState): ReviewResult {
    const grounded = state.citations.length > 0;
    const hasDraft = state.draft.trim().length >= 20;
    const safeFallback =
      !grounded && /没有找到|人工确认|资料不足/.test(state.draft);
    const approved = hasDraft && (grounded || safeFallback);
    return {
      approved,
      score: approved ? (grounded ? 92 : 78) : 45,
      feedback: approved
        ? grounded
          ? "回答有证据支撑且包含风险提示"
          : "资料不足时已明确降级"
        : "证据或回答完整度不足",
    };
  }
}
