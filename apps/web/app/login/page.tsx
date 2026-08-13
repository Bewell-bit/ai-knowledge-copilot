import { redirect } from "next/navigation";
import { BrainCircuit, ShieldCheck } from "lucide-react";
import { AuthError } from "next-auth";
import { auth, signIn } from "../../auth";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await auth()) redirect("/");
  const query = await searchParams;
  async function login(formData: FormData) {
    "use server";
    try { await signIn("credentials", { username: formData.get("username"), password: formData.get("password"), redirectTo: "/" }); }
    catch (error) { if (error instanceof AuthError) redirect("/login?error=credentials"); throw error; }
  }
  return <main className="login-page"><section className="login-card"><div className="login-brand"><span><BrainCircuit/></span><div><h1>Nexus AI</h1><p>Enterprise Knowledge Copilot</p></div></div><div className="security-note"><ShieldCheck/><span><b>Auth.js Protected</b><small>JWT Session · Server RBAC · BFF</small></span></div><h2>登录智能工作台</h2><p className="login-copy">选择角色体验不同的业务权限。演示密码默认为 <code>nexus2026</code>。</p>{query.error && <p className="login-error">账号或密码错误，请重试。</p>}<form action={login}><label>角色账号<select name="username" defaultValue="admin"><option value="admin">admin · 管理员</option><option value="editor">editor · 知识编辑</option><option value="viewer">viewer · 业务访客</option></select></label><label>密码<input name="password" type="password" defaultValue="nexus2026" required/></label><button className="primary full" type="submit">安全登录</button></form></section></main>;
}
