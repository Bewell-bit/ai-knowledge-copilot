import { config } from "./config.js";
import { createDatabase, seedDatabase } from "./db.js";
import { KnowledgeAgent } from "./agent.js";
import { llm } from "./llm.js";
import { createApp } from "./app.js";

const db = createDatabase(config.DATABASE_PATH);
seedDatabase(db);
const agent = new KnowledgeAgent(db, llm);
const app = createApp(db, agent, config.WEB_ORIGIN);

app.listen(config.PORT, () => {
  console.log(`AI Knowledge Copilot API: http://localhost:${config.PORT}`);
  console.log(`LLM provider: ${config.LLM_PROVIDER}`);
});
