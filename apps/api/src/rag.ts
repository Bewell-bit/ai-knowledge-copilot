import type { Db } from "./db.js";
import { tokenize } from "./db.js";
import type { Citation } from "./types.js";

export class RagService {
  constructor(private db: Db) {}

  search(query: string, limit = 4): Citation[] {
    const queryTokens = new Set(tokenize(query));
    return this.db.chunks
      .map((row) => {
        const tokens = row.tokens;
        const overlap = tokens.filter((token) => queryTokens.has(token)).length;
        const coverage = overlap / Math.max(1, queryTokens.size);
        const density = overlap / Math.max(1, tokens.length);
        const title =
          this.db.documents.find((document) => document.id === row.documentId)
            ?.title ?? "未知文档";
        return {
          chunkId: row.id,
          documentId: row.documentId,
          title,
          content: row.content,
          score: coverage * 0.75 + density * 0.25,
        };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}
