import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

export type Role = "admin" | "editor" | "viewer";
const users: Record<string, { name: string; role: Role }> = {
  admin: { name: "系统管理员", role: "admin" },
  editor: { name: "知识编辑", role: "editor" },
  viewer: { name: "业务访客", role: "viewer" }
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET ?? "local-demo-secret-change-in-production",
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  providers: [Credentials({
    credentials: { username: { label: "账号" }, password: { label: "密码", type: "password" } },
    authorize(raw) {
      const username = typeof raw.username === "string" ? raw.username : "";
      const password = typeof raw.password === "string" ? raw.password : "";
      if (!username || password !== (process.env.DEMO_PASSWORD ?? "nexus2026")) return null;
      const user = users[username];
      return user ? { id: username, email: `${username}@nexus.local`, ...user } : null;
    }
  })],
  callbacks: {
    jwt({ token, user }) { if (user) token.role = user.role; return token; },
    session({ session, token }) { if (session.user) { session.user.id = token.sub ?? ""; session.user.role = token.role as Role; } return session; },
    authorized({ auth, request }) { return request.nextUrl.pathname.startsWith("/login") || Boolean(auth?.user); }
  }
});
