# Nexus AI Knowledge Copilot

一个面向企业业务场景的全栈 AI 知识助手作品：覆盖知识入库、RAG 检索、Agent Planning / Tool Use / Memory、模型接入、调用追踪与性能观测。项目默认无需 API Key 即可完整演示，也支持切换 OpenAI-compatible 模型。

## 能力地图

```text
Next.js App Router ── Auth.js / RBAC ── BFF Route Handlers
                                             │ REST / SSE proxy
                                             ▼
                                   LangGraph Supervisor
                                    ├── Retrieval Agent ── RAG / knowledge_search
                                    ├── Analyst Agent ── Demo / OpenAI-compatible LLM
                                    ├── Reviewer Agent ── 质量审查 / 有限重试
                                    ├── Session Memory ── SQLite WAL
                                    └── Trace & Metrics ── 延迟 / 工具调用 / 缓存
```

- **全栈交付**：Next.js App Router + TypeScript Web/BFF，Express + Zod AI Runtime，SQLite 关系型数据层。
- **认证与权限**：Auth.js JWT Session、Middleware 页面保护，以及 `admin/editor/viewer` 服务端 RBAC。
- **BFF 架构**：Next Route Handlers 隔离内部 Agent API，并原样透传 LangGraph SSE 流。
- **RAG**：中文字符与英文词元混合检索、相关度打分、Top-K 召回、引用溯源。
- **LangGraph 多 Agent**：Supervisor 路由，Retrieval 检索，Analyst 分析，Reviewer 审查；审查失败通过条件边触发有限重试。
- **流式交互**：SSE 按 `plan → agent/tool → delta → done` 实时推送，支持心跳、断连取消、引用与最终 Trace 落库。
- **工程能力**：Monorepo、严格类型检查、参数校验、统一异常处理、事务与 WAL、TTL 缓存、单元测试。
- **可观测性**：每次调用记录 Query、Latency、Tool Calls，并在 Dashboard 展示。
- **模型可替换**：通过 Adapter 接入 OpenAI、DeepSeek、Qwen 等兼容 Chat Completions 的服务。

## 快速启动

环境要求：Node.js 22.5+。项目包含 `.nvmrc`，推荐直接执行：

```bash
nvm use
```

```bash
pnpm install
cp .env.example .env
cp apps/web/.env.example apps/web/.env.local
pnpm dev
```

访问 http://localhost:3000，内部 Agent API 位于 http://localhost:8787。浏览器只访问经过鉴权的 Next BFF。

演示账号为 `admin`、`editor`、`viewer`，默认密码均为 `nexus2026`，可通过 `apps/web/.env.local` 修改。生产部署必须替换 `AUTH_SECRET` 与演示密码。

| Role | 问答/查看 | 添加知识 | 管理能力 |
| --- | --- | --- | --- |
| `viewer` | ✅ | ❌ | ❌ |
| `editor` | ✅ | ✅ | ❌ |
| `admin` | ✅ | ✅ | ✅ |

项目默认 `LLM_PROVIDER=demo`。接入真实模型时修改 `.env`：

```env
LLM_PROVIDER=openai
OPENAI_API_KEY=your-key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
```

## 工程命令

```bash
pnpm test       # Agent、RAG、切片单元测试
pnpm typecheck  # 全栈严格类型检查
pnpm build      # 生产构建
```

## API

| Method     | Endpoint           | Description                                       |
| ---------- | ------------------ | ------------------------------------------------- |
| `POST`     | `/api/chat`        | 执行多 Agent 图并返回 agent/tool/answer 事件      |
| `POST`     | `/api/chat/stream` | 通过 SSE 流式返回 plan/agent/tool/delta/done 事件 |
| `GET/POST` | `/api/documents`   | 查询或写入知识文档                                |
| `GET`      | `/api/search?q=`   | 独立验证 RAG 检索结果                             |
| `GET`      | `/api/traces`      | 最近 20 条调用链路                                |
| `GET`      | `/api/metrics`     | Agent 与知识库指标                                |

## 演示路径

1. 从“知识库”添加一条新的业务规范，说明切片、索引和持久化流程。
2. 在“智能问答”提出与规范相关的问题，展示 Supervisor 路由、三个专业 Agent、工具调用和引用来源。
3. 重复提问，说明 TTL 缓存带来的延迟优化。
4. 打开“运行观测”，展示 Trace、工具调用数和平均延迟。
5. 讲解真实生产演进：将本地检索替换为 pgvector / Elasticsearch，将内存缓存替换为 Redis，将耗时入库任务投递到 Kafka / RabbitMQ，并为 LangGraph 加入持久化 Checkpoint 与离线评测集。

## 生产化演进设计

- **分布式**：API 无状态化；Redis 共享缓存与限流；对象存储保存原始文档。
- **异步化**：文档解析、Embedding、索引构建进入消息队列，消费端幂等写入。
- **检索质量**：向量召回 + BM25 + Reranker，按租户隔离索引并增加权限过滤。
- **Agent 质量**：构建黄金评测集，持续衡量 faithfulness、context recall、任务成功率、成本和 P95 延迟。
- **安全**：Prompt Injection 检测、PII 脱敏、工具权限白名单、全链路审计与人工兜底。

## 项目结构

```text
apps/web/app/         Next.js App Router、Auth API 与鉴权 BFF
apps/web/src/         智能问答、知识库、观测客户端组件
apps/api/src/agent.ts Agent 编排、Memory、Trace 与 Cache
apps/api/src/multi-agent.ts LangGraph 状态、节点、条件边与质量回路
apps/api/src/rag.ts   检索与相关度排序
apps/api/src/llm.ts   模型适配层
apps/api/src/db.ts    SQLite Schema、事务、切片与知识入库
```

本项目适合作为继续迭代的作品集基线：后续可加入文件解析、多租户 RBAC、Embedding 服务、LangGraph 持久化 Checkpoint 以及 RAGAS 自动评测。
