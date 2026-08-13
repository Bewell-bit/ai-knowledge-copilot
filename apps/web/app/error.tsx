"use client";
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) { return <div className="route-state"><h2>页面加载失败</h2><p>请检查 Web 与 Agent API 服务是否正常。</p><button className="primary" onClick={reset}>重新加载</button></div>; }
