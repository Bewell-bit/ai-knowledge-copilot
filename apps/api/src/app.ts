import express from "express";
import cors from "cors";
import { z, ZodError } from "zod";
import type { Db } from "./db.js";
import { insertDocument } from "./db.js";
import type { KnowledgeAgent } from "./agent.js";
import { RagService } from "./rag.js";

function writeSse(res: express.Response, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function createApp(db: Db, agent: KnowledgeAgent, webOrigin = "http://localhost:5173") {
  const app = express();
  app.use(cors({ origin: webOrigin }));
  app.use(express.json({ limit: "2mb" }));

  app.get("/api/health", (_req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));
  app.get("/api/documents", (_req, res) => {
    const rows = [...db.documents].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(({ id, title, source, createdAt, content }) => ({ id, title, source, createdAt, characters: content.length }));
    res.json(rows);
  });
  app.post("/api/documents", (req, res) => {
    const input = z.object({ title: z.string().min(2).max(100), source: z.string().max(100).optional(), content: z.string().min(20).max(100_000) }).parse(req.body);
    res.status(201).json(insertDocument(db, input));
  });
  app.get("/api/search", (req, res) => {
    const { q } = z.object({ q: z.string().min(1) }).parse(req.query);
    res.json(new RagService(db).search(q));
  });
  app.post("/api/chat", async (req, res, next) => {
    try {
      const { sessionId, message } = z.object({ sessionId: z.string().min(1).max(100), message: z.string().min(1).max(4000) }).parse(req.body);
      res.json({ events: await agent.run(sessionId, message) });
    } catch (error) { next(error); }
  });
  app.post("/api/chat/stream", async (req, res, next) => {
    let streaming = false;
    try {
      const { sessionId, message } = z.object({ sessionId: z.string().min(1).max(100), message: z.string().min(1).max(4000) }).parse(req.body);
      res.status(200).set({
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no"
      });
      res.flushHeaders();
      streaming = true;
      const controller = new AbortController();
      let completed = false;
      res.on("close", () => { if (!completed) controller.abort(); });
      const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 15_000);
      try {
        for await (const event of agent.stream(sessionId, message, controller.signal)) {
          if (controller.signal.aborted) break;
          writeSse(res, event.type, event);
        }
        completed = true;
      } finally { clearInterval(heartbeat); }
      res.end();
    } catch (error) {
      if (!streaming) return next(error);
      writeSse(res, "error", { type: "error", message: error instanceof Error ? error.message : "流式生成失败" });
      res.end();
    }
  });
  app.get("/api/metrics", (_req, res) => {
    res.json({ ...agent.metrics(), documents: db.documents.length, chunks: db.chunks.length });
  });
  app.get("/api/traces", (_req, res) => res.json([...db.traces].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20)));

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof ZodError) return res.status(400).json({ error: "参数校验失败", details: error.flatten() });
    console.error(error);
    return res.status(500).json({ error: error instanceof Error ? error.message : "服务异常" });
  });
  return app;
}
