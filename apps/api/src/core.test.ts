import test from "node:test";
import assert from "node:assert/strict";
import { createDatabase, insertDocument, chunkText } from "./db.js";
import { RagService } from "./rag.js";
import { KnowledgeAgent } from "./agent.js";
import type { LlmClient } from "./llm.js";

test("chunkText preserves short content and overlaps long content", () => {
  assert.deepEqual(chunkText("hello", 10, 2), ["hello"]);
  assert.equal(chunkText("123456789012345", 10, 2).length, 2);
});

test("RAG ranks matching business knowledge", () => {
  const db = createDatabase(":memory:");
  insertDocument(db, { title: "退款", content: "商品签收七天内可以退款，超过一千元需要人工审核。" });
  insertDocument(db, { title: "会员", content: "年度会员包含高清视频权益和专属客服服务。" });
  const hits = new RagService(db).search("退款要人工审核吗");
  assert.equal(hits[0]?.title, "退款");
  assert.ok((hits[0]?.score ?? 0) > 0);
});

test("agent plans, uses retrieval tool and writes memory", async () => {
  const db = createDatabase(":memory:");
  insertDocument(db, { title: "安全", content: "涉及高风险操作时必须转人工复核并记录工具调用。" });
  const fake: LlmClient = {
    async *stream(_messages, context) { yield "引用了 "; yield `${context.length} 条资料`; },
    complete: async (_messages, context) => `引用了 ${context.length} 条资料`
  };
  const agent = new KnowledgeAgent(db, fake);
  const events = await agent.run("session-1", "高风险操作怎么办");
  assert.deepEqual(events.map((e) => e.type), ["plan", "tool", "answer"]);
  assert.equal(agent.getHistory("session-1").length, 2);
});

test("agent streams plan, tool, deltas and completion in order", async () => {
  const db = createDatabase(":memory:");
  insertDocument(db, { title: "会员", content: "年度会员包含高清视频、专属客服和每月十次免费下载权益。" });
  const fake: LlmClient = {
    async *stream() { yield "年度会员"; yield "包含专属客服"; },
    complete: async () => "年度会员包含专属客服"
  };
  const agent = new KnowledgeAgent(db, fake);
  const events = [];
  for await (const event of agent.stream("stream-session", "年度会员权益")) events.push(event);
  assert.deepEqual(events.map((event) => event.type), ["plan", "tool", "delta", "delta", "done"]);
  const done = events.at(-1);
  assert.equal(done?.type === "done" ? done.content : "", "年度会员包含专属客服");
  assert.equal(agent.getHistory("stream-session").length, 2);
});
