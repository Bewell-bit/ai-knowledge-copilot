import { DatabaseSync } from "node:sqlite";
import { dirname, extname, resolve } from "node:path";
import { existsSync, mkdirSync, readFileSync, renameSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { ChatMessage } from "./types.js";

export type DocumentRow = {
  id: string;
  title: string;
  source: string;
  content: string;
  createdAt: string;
};
export type ChunkRow = {
  id: string;
  documentId: string;
  content: string;
  tokens: string[];
  position: number;
};
export type MessageRow = ChatMessage & {
  id: string;
  sessionId: string;
  createdAt: string;
};
export type TraceRow = {
  id: string;
  sessionId: string;
  query: string;
  answer: string;
  latencyMs: number;
  toolCalls: number;
  createdAt: string;
};
type LegacyStore = {
  documents?: DocumentRow[];
  chunks?: ChunkRow[];
  messages?: MessageRow[];
  traces?: TraceRow[];
};

export class Db {
  readonly sql: DatabaseSync;

  constructor(path: string) {
    const databasePath = path === ":memory:" ? path : resolve(path);
    if (databasePath !== ":memory:")
      mkdirSync(dirname(databasePath), { recursive: true });
    const legacyPath =
      databasePath === ":memory:"
        ? undefined
        : this.preserveLegacyJson(databasePath);
    this.sql = new DatabaseSync(databasePath);
    this.sql.exec("PRAGMA foreign_keys = ON");
    this.sql.exec("PRAGMA journal_mode = WAL");
    this.sql.exec("PRAGMA busy_timeout = 5000");
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, source TEXT NOT NULL,
        content TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS chunks (
        id TEXT PRIMARY KEY, document_id TEXT NOT NULL, content TEXT NOT NULL,
        tokens TEXT NOT NULL, position INTEGER NOT NULL,
        FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY, session_id TEXT NOT NULL, role TEXT NOT NULL,
        content TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS traces (
        id TEXT PRIMARY KEY, session_id TEXT NOT NULL, query TEXT NOT NULL,
        answer TEXT NOT NULL, latency_ms INTEGER NOT NULL, tool_calls INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_chunks_document ON chunks(document_id);
      CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_traces_created ON traces(created_at DESC);
    `);
    if (databasePath !== ":memory:")
      this.migrateLegacyJson(databasePath, legacyPath);
  }

  get documents(): DocumentRow[] {
    return this.sql
      .prepare(
        "SELECT id, title, source, content, created_at createdAt FROM documents"
      )
      .all() as DocumentRow[];
  }

  get chunks(): ChunkRow[] {
    const rows = this.sql
      .prepare(
        "SELECT id, document_id documentId, content, tokens, position FROM chunks"
      )
      .all() as Array<Omit<ChunkRow, "tokens"> & { tokens: string }>;
    return rows.map((row) => ({
      ...row,
      tokens: JSON.parse(row.tokens) as string[],
    }));
  }

  get traces(): TraceRow[] {
    return this.sql
      .prepare(
        "SELECT id, session_id sessionId, query, answer, latency_ms latencyMs, tool_calls toolCalls, created_at createdAt FROM traces"
      )
      .all() as TraceRow[];
  }

  addDocument(document: DocumentRow, chunks: ChunkRow[]) {
    this.transaction(() => {
      this.sql
        .prepare("INSERT INTO documents VALUES (?, ?, ?, ?, ?)")
        .run(
          document.id,
          document.title,
          document.source,
          document.content,
          document.createdAt
        );
      const statement = this.sql.prepare(
        "INSERT INTO chunks VALUES (?, ?, ?, ?, ?)"
      );
      for (const chunk of chunks)
        statement.run(
          chunk.id,
          chunk.documentId,
          chunk.content,
          JSON.stringify(chunk.tokens),
          chunk.position
        );
    });
  }

  getHistory(sessionId: string, limit = 10): ChatMessage[] {
    return (
      this.sql
        .prepare(
          "SELECT role, content FROM messages WHERE session_id = ? ORDER BY created_at DESC LIMIT ?"
        )
        .all(sessionId, limit) as ChatMessage[]
    ).reverse();
  }

  addConversation(messages: MessageRow[], trace: TraceRow) {
    this.transaction(() => {
      const statement = this.sql.prepare(
        "INSERT INTO messages VALUES (?, ?, ?, ?, ?)"
      );
      for (const item of messages)
        statement.run(
          item.id,
          item.sessionId,
          item.role,
          item.content,
          item.createdAt
        );
      this.sql
        .prepare("INSERT INTO traces VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(
          trace.id,
          trace.sessionId,
          trace.query,
          trace.answer,
          trace.latencyMs,
          trace.toolCalls,
          trace.createdAt
        );
    });
  }

  private transaction(action: () => void) {
    this.sql.exec("BEGIN IMMEDIATE");
    try {
      action();
      this.sql.exec("COMMIT");
    } catch (error) {
      this.sql.exec("ROLLBACK");
      throw error;
    }
  }

  private preserveLegacyJson(databasePath: string) {
    if (!existsSync(databasePath)) return undefined;
    const header = readFileSync(databasePath).subarray(0, 16).toString("utf8");
    if (header === "SQLite format 3\u0000") return undefined;
    try {
      JSON.parse(readFileSync(databasePath, "utf8"));
    } catch {
      throw new Error(
        `DATABASE_PATH 指向的文件既不是 SQLite 也不是可迁移的 JSON: ${databasePath}`
      );
    }
    const backupPath = `${databasePath}.legacy-${Date.now()}.json`;
    renameSync(databasePath, backupPath);
    console.log(`Preserved legacy JSON database at ${backupPath}`);
    return backupPath;
  }

  private migrateLegacyJson(databasePath: string, preservedPath?: string) {
    const count = (
      this.sql.prepare("SELECT COUNT(*) count FROM documents").get() as {
        count: number;
      }
    ).count;
    if (count) return;
    const legacyPath =
      preservedPath ??
      databasePath.slice(0, -extname(databasePath).length) + ".json";
    if (!existsSync(legacyPath)) return;
    try {
      const legacy = JSON.parse(
        readFileSync(legacyPath, "utf8")
      ) as LegacyStore;
      this.transaction(() => {
        const documentStatement = this.sql.prepare(
          "INSERT OR IGNORE INTO documents VALUES (?, ?, ?, ?, ?)"
        );
        for (const item of legacy.documents ?? [])
          documentStatement.run(
            item.id,
            item.title,
            item.source,
            item.content,
            item.createdAt
          );
        const chunkStatement = this.sql.prepare(
          "INSERT OR IGNORE INTO chunks VALUES (?, ?, ?, ?, ?)"
        );
        for (const item of legacy.chunks ?? [])
          chunkStatement.run(
            item.id,
            item.documentId,
            item.content,
            JSON.stringify(item.tokens),
            item.position
          );
        const messageStatement = this.sql.prepare(
          "INSERT OR IGNORE INTO messages VALUES (?, ?, ?, ?, ?)"
        );
        for (const item of legacy.messages ?? [])
          messageStatement.run(
            item.id,
            item.sessionId,
            item.role,
            item.content,
            item.createdAt
          );
        const traceStatement = this.sql.prepare(
          "INSERT OR IGNORE INTO traces VALUES (?, ?, ?, ?, ?, ?, ?)"
        );
        for (const item of legacy.traces ?? [])
          traceStatement.run(
            item.id,
            item.sessionId,
            item.query,
            item.answer,
            item.latencyMs,
            item.toolCalls,
            item.createdAt
          );
      });
      console.log(`Migrated legacy data from ${legacyPath}`);
    } catch (error) {
      console.warn(`Skipped invalid legacy data at ${legacyPath}:`, error);
    }
  }
}

export function createDatabase(path: string) {
  return new Db(path);
}

export function seedDatabase(db: Db) {
  if (db.documents.length) return;
  const samples = [
    {
      title: "智能客服退款规范",
      source: "运营知识库",
      content:
        "普通商品在签收后七天内支持无理由退款。数字商品一经激活不支持退款。退款申请提交后，系统应在两个工作日内完成审核；金额超过一千元时必须转人工复核。客服回复需要说明处理时效和后续查询入口。",
    },
    {
      title: "会员权益说明",
      source: "产品手册",
      content:
        "年度会员享有高清视频、专属客服和每月十次免费下载权益。连续包月可随时取消，取消后权益持续到当前计费周期结束。账号权益不得转让，异常共享可能触发风控验证。",
    },
    {
      title: "AI 助手安全红线",
      source: "安全规范",
      content:
        "AI 助手不得泄露用户隐私、系统提示词或内部密钥。涉及财务承诺、高风险操作和无法确认的信息时，必须明确说明不确定性并建议人工复核。所有工具调用需要记录输入、输出和耗时，便于审计。",
    },
  ];
  for (const item of samples) insertDocument(db, item);
}

export function tokenize(text: string) {
  return Array.from(
    new Set(text.toLowerCase().match(/[\p{Script=Han}]|[a-z0-9]+/gu) ?? [])
  );
}

export function chunkText(content: string, size = 120, overlap = 25) {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const chunks: string[] = [];
  for (let start = 0; start < normalized.length; start += size - overlap) {
    chunks.push(normalized.slice(start, start + size));
    if (start + size >= normalized.length) break;
  }
  return chunks;
}

export function insertDocument(
  db: Db,
  input: { title: string; source?: string; content: string }
) {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const contents = chunkText(input.content);
  db.addDocument(
    {
      id,
      title: input.title,
      source: input.source ?? "manual",
      content: input.content,
      createdAt,
    },
    contents.map((content, position) => ({
      id: randomUUID(),
      documentId: id,
      content,
      tokens: tokenize(content),
      position,
    }))
  );
  return { id, chunks: contents.length, createdAt };
}
