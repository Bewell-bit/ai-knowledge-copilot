import { useEffect, useMemo, useState } from "react";
import { Activity, BookOpen, Bot, BrainCircuit, Check, ChevronRight, Database, FilePlus2, Gauge, LoaderCircle, Menu, MessageSquareText, Search, Send, Sparkles, Workflow, X } from "lucide-react";
import { api, type AgentEvent, type Document, type Metrics, type Trace } from "./api";

type Page = "chat" | "knowledge" | "observability";
type Conversation = { role: "user" | "assistant"; content: string; events?: AgentEvent[] };
const prompts = ["退款超过一千元应该如何处理？", "年度会员有哪些权益？", "AI 助手有哪些安全红线？"];
const sessionId = crypto.randomUUID();

function App() {
  const [page, setPage] = useState<Page>("chat");
  const [mobileNav, setMobileNav] = useState(false);
  const nav = (next: Page) => { setPage(next); setMobileNav(false); };
  return <div className="shell">
    <aside className={mobileNav ? "sidebar open" : "sidebar"}>
      <div className="brand"><span><BrainCircuit size={22}/></span><div><strong>Nexus AI</strong><small>Knowledge Copilot</small></div><button className="close" onClick={() => setMobileNav(false)}><X/></button></div>
      <nav>
        <button className={page === "chat" ? "active" : ""} onClick={() => nav("chat")}><MessageSquareText/>智能问答</button>
        <button className={page === "knowledge" ? "active" : ""} onClick={() => nav("knowledge")}><Database/>知识库</button>
        <button className={page === "observability" ? "active" : ""} onClick={() => nav("observability")}><Activity/>运行观测</button>
      </nav>
      <div className="architecture"><small>AGENT PIPELINE</small><div>Planner <ChevronRight/> RAG <ChevronRight/> LLM</div><p><i/> All systems operational</p></div>
      <div className="profile"><div>AI</div><span><b>Builder Mode</b><small>Demo Provider</small></span></div>
    </aside>
    <main><header><button className="menu" onClick={() => setMobileNav(true)}><Menu/></button><div><h1>{page === "chat" ? "智能问答工作台" : page === "knowledge" ? "业务知识库" : "Agent 运行观测"}</h1><p>{page === "chat" ? "基于可追溯知识，交付可靠答案" : page === "knowledge" ? "管理文档、切片与检索索引" : "洞察调用链路、性能与质量"}</p></div><span className="live"><i/> LIVE</span></header>
      {page === "chat" && <Chat/>}{page === "knowledge" && <Knowledge/>}{page === "observability" && <Observability/>}
    </main>
  </div>;
}

function Chat() {
  const [messages, setMessages] = useState<Conversation[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  async function send(text = input) {
    if (!text.trim() || loading) return;
    setInput(""); setLoading(true); setMessages((old) => [...old, { role: "user", content: text }]);
    try { const data = await api.chat(sessionId, text); const answer = data.events.find((e) => e.type === "answer"); setMessages((old) => [...old, { role: "assistant", content: answer?.type === "answer" ? answer.content : "未生成回答", events: data.events }]); }
    catch (e) { setMessages((old) => [...old, { role: "assistant", content: e instanceof Error ? e.message : "服务异常" }]); }
    finally { setLoading(false); }
  }
  return <section className="chat-page"><div className="conversation">
    {!messages.length && <div className="hero"><div className="orb"><Sparkles/></div><span>ENTERPRISE RAG AGENT</span><h2>让企业知识，真正参与决策</h2><p>检索增强、智能规划、工具调用与长期记忆，在一个可观测的 Agent 工作流中协同。</p><div className="prompts">{prompts.map((p) => <button key={p} onClick={() => send(p)}>{p}<ChevronRight/></button>)}</div></div>}
    {messages.map((m, i) => <div key={i} className={`message ${m.role}`}><div className="avatar">{m.role === "user" ? "YOU" : <Bot/>}</div><div className="bubble">{m.events && <AgentSteps events={m.events}/>}<div className="answer">{m.content}</div>{m.events?.map((event) => event.type === "answer" && event.citations.length > 0 ? <div className="citations" key="citations"><small>参考资料</small>{event.citations.map((c, j) => <div key={c.chunkId}><b>[{j + 1}] {c.title}</b><span>{Math.round(c.score * 100)}% 匹配</span></div>)}</div> : null)}</div></div>)}
    {loading && <div className="thinking"><LoaderCircle/> Agent 正在规划并检索知识…</div>}
  </div><div className="composer"><div><textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }}} placeholder="询问你的业务知识…"/><button onClick={() => send()} disabled={loading || !input.trim()}><Send/></button></div><small>答案由 AI 生成，请结合引用资料判断 · Enter 发送 / Shift + Enter 换行</small></div></section>;
}

function AgentSteps({ events }: { events: AgentEvent[] }) {
  const plan = events.find((e) => e.type === "plan"); const tool = events.find((e) => e.type === "tool"); const answer = events.find((e) => e.type === "answer");
  return <div className="steps"><div><span><Workflow/></span><p><b>Planning</b><small>{plan?.type === "plan" ? plan.content : "完成"}</small></p><Check/></div><div><span><Search/></span><p><b>Tool Use · knowledge_search</b><small>{tool?.type === "tool" ? tool.output : "完成"}</small></p><Check/></div><div><span><Sparkles/></span><p><b>Answer</b><small>{answer?.type === "answer" ? `${answer.latencyMs}ms · ${answer.citations.length} 条引用` : "完成"}</small></p><Check/></div></div>;
}

function Knowledge() {
  const [docs, setDocs] = useState<Document[]>([]); const [modal, setModal] = useState(false); const [form, setForm] = useState({ title: "", source: "", content: "" }); const [saving, setSaving] = useState(false);
  const load = () => api.documents().then(setDocs); useEffect(() => { void load(); }, []);
  async function save() { setSaving(true); try { await api.addDocument(form); setModal(false); setForm({ title: "", source: "", content: "" }); load(); } finally { setSaving(false); } }
  return <section className="page-content"><div className="toolbar"><div className="searchbox"><Search/><input placeholder="搜索知识文档…"/></div><button className="primary" onClick={() => setModal(true)}><FilePlus2/>添加文档</button></div><div className="stat-row"><Stat icon={<BookOpen/>} label="文档总数" value={docs.length}/><Stat icon={<Database/>} label="累计字符" value={docs.reduce((a,d)=>a+d.characters,0).toLocaleString()}/><Stat icon={<Gauge/>} label="索引状态" value="Ready"/></div><div className="doc-grid">{docs.map((doc) => <article key={doc.id}><div className="doc-icon"><BookOpen/></div><span className="tag">{doc.source}</span><h3>{doc.title}</h3><p>{doc.characters} 字符 · 已完成向量化索引</p><footer><span><i/> 可检索</span><small>{new Date(doc.createdAt).toLocaleDateString()}</small></footer></article>)}</div>
    {modal && <div className="modal-bg"><div className="modal"><button className="modal-close" onClick={() => setModal(false)}><X/></button><span className="eyebrow">KNOWLEDGE INGESTION</span><h2>添加业务知识</h2><p>内容将自动切片、提取索引并进入 RAG 检索链路。</p><label>文档标题<input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="例如：售后服务规范"/></label><label>资料来源<input value={form.source} onChange={e=>setForm({...form,source:e.target.value})} placeholder="例如：运营手册"/></label><label>正文内容<textarea value={form.content} onChange={e=>setForm({...form,content:e.target.value})} placeholder="粘贴业务知识，至少 20 个字符…"/></label><button className="primary full" onClick={save} disabled={saving || form.title.length<2 || form.content.length<20}>{saving ? <LoaderCircle/> : <FilePlus2/>}写入知识库</button></div></div>}
  </section>;
}

function Stat({icon,label,value}:{icon:React.ReactNode;label:string;value:string|number}) { return <div className="stat"><span>{icon}</span><div><small>{label}</small><strong>{value}</strong></div></div> }

function Observability() {
  const [metrics,setMetrics]=useState<Metrics>(); const [traces,setTraces]=useState<Trace[]>([]);
  useEffect(()=>{api.metrics().then(setMetrics);api.traces().then(setTraces)},[]);
  const success = useMemo(()=>traces.length ? 100 : 0,[traces]);
  return <section className="page-content"><div className="stat-row four"><Stat icon={<Activity/>} label="Agent 请求" value={metrics?.requests??0}/><Stat icon={<Gauge/>} label="平均延迟" value={`${Math.round(metrics?.avgLatency??0)}ms`}/><Stat icon={<Workflow/>} label="工具调用" value={metrics?.toolCalls??0}/><Stat icon={<Check/>} label="成功率" value={`${success}%`}/></div><div className="observability"><div className="trace-panel"><div className="panel-title"><div><span className="eyebrow">RECENT TRACES</span><h2>调用链路</h2></div><span className="badge">实时</span></div>{traces.length ? traces.map((trace)=><article className="trace" key={trace.id}><div className="trace-dot"/><div><b>{trace.query}</b><p>Planner → knowledge_search → Answer</p></div><span>{trace.latencyMs}ms</span></article>):<div className="empty"><Activity/><p>还没有调用记录</p><small>发起一次智能问答后，Trace 将显示在这里</small></div>}</div><div className="quality"><span className="eyebrow">SYSTEM HEALTH</span><h2>知识与性能</h2><div className="donut" style={{"--value":`${Math.min(100,(metrics?.chunks??0)*8)}%`} as React.CSSProperties}><span>{metrics?.chunks??0}<small>CHUNKS</small></span></div><ul><li><span>知识文档</span><b>{metrics?.documents??0}</b></li><li><span>缓存条目</span><b>{metrics?.cacheEntries??0}</b></li><li><span>持久记忆</span><b>SQLite WAL</b></li><li><span>检索策略</span><b>Hybrid Token</b></li></ul></div></div></section>;
}

export default App;
