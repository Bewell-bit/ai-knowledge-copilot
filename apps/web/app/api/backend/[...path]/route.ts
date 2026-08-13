import { auth } from "../../../../auth";
import type { Role } from "../../../../auth";

const apiUrl = process.env.AGENT_API_URL ?? "http://127.0.0.1:8787";
function canAccess(role: Role, method: string, path: string) {
  if (role === "admin") return true;
  if (method === "POST" && path === "documents") return role === "editor";
  return method === "GET" || path === "chat" || path === "chat/stream";
}

async function proxy(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "未登录" }, { status: 401 });
  const { path: segments } = await context.params;
  const path = segments.join("/");
  if (!canAccess(session.user.role, request.method, path)) return Response.json({ error: "当前角色没有此操作权限" }, { status: 403 });
  const source = new URL(request.url);
  const target = `${apiUrl}/api/${path}${source.search}`;
  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  const accept = request.headers.get("accept");
  if (contentType) headers.set("content-type", contentType);
  if (accept) headers.set("accept", accept);
  const upstream = await fetch(target, { method: request.method, headers, body: request.method === "GET" ? undefined : request.body, cache: "no-store", duplex: "half" } as RequestInit & { duplex: "half" });
  const responseHeaders = new Headers();
  responseHeaders.set("content-type", upstream.headers.get("content-type") ?? "application/json");
  responseHeaders.set("cache-control", "no-cache, no-transform");
  if (responseHeaders.get("content-type")?.includes("text/event-stream")) responseHeaders.set("x-accel-buffering", "no");
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const GET = proxy;
export const POST = proxy;
