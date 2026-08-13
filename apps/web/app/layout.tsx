import type { Metadata } from "next";
import "../src/styles.css";

export const metadata: Metadata = {
  title: "Nexus AI · 企业知识智能体",
  description: "基于 LangGraph、RAG 与多 Agent 协作的企业知识助手"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
