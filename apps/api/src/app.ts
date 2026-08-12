import express from "express";
import cors from "cors";
import { z, ZodError } from "zod";
import type { Db } from "./db.js";
import { insertDocument } from "./db.js";
import type { KnowledgeAgent } from "./agent.js";
import { RagService } from "./rag.js";

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
