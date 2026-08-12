import { config } from "./config.js";
import type { ChatMessage, Citation } from "./types.js";

export interface LlmClient {
  stream(
    messages: ChatMessage[],
    context: Citation[],
    signal?: AbortSignal
  ): AsyncGenerator<string>;
  complete(
    messages: ChatMessage[],
    context: Citation[],
    signal?: AbortSignal
  ): Promise<string>;
}

async function collect(stream: AsyncGenerator<string>) {
  let result = "";
  for await (const chunk of stream) result += chunk;
  return result;
}

function* splitText(text: string, size = 12) {
  for (let index = 0; index < text.length; index += size)
    yield text.slice(index, index + size);
}

class DemoLlm implements LlmClient {
  private answer(messages: ChatMessage[], context: Citation[]) {
    const query = messages.at(-1)?.content ?? "";
    if (!context.length) {
      return `知识库中暂时没有找到与“${query}”直接相关的内容。建议补充业务文档后重试，或转人工确认，避免给出未经验证的结论。`;
    }
    const evidence = context
      .slice(0, 3)
      .map((item, index) => `${index + 1}. ${item.content}`)
      .join("\n");
    return `根据当前知识库，可以这样处理：\n\n${evidence}\n\n以上结论来自已检索的业务资料；如涉及高金额、隐私或高风险操作，请按规范转人工复核。`;
  }

  async *stream(
    messages: ChatMessage[],
    context: Citation[],
    signal?: AbortSignal
  ) {
    for (const chunk of splitText(this.answer(messages, context))) {
      if (signal?.aborted) return;
      yield chunk;
      await new Promise((resolve) => setTimeout(resolve, 18));
    }
  }

  complete(messages: ChatMessage[], context: Citation[], signal?: AbortSignal) {
    return collect(this.stream(messages, context, signal));
  }
}

class OpenAiCompatibleLlm implements LlmClient {
  async *stream(
    messages: ChatMessage[],
    context: Citation[],
    signal?: AbortSignal
  ) {
    if (!config.OPENAI_API_KEY)
      throw new Error("使用 openai 模式时必须配置 OPENAI_API_KEY");
    const response = await fetch(
      `${config.OPENAI_BASE_URL.replace(/\/$/, "")}/chat/completions`,
      {
        method: "POST",
        signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: config.OPENAI_MODEL,
          temperature: 0.2,
          stream: true,
          messages: [
            {
              role: "system",
              content:
                "你是企业知识助手。仅基于给定资料回答；资料不足时明确说明。引用资料编号，禁止编造。",
            },
            ...messages,
            {
              role: "user",
              content: `检索资料：\n${context
                .map((c, i) => `[${i + 1}] ${c.title}: ${c.content}`)
                .join("\n")}`,
            },
          ],
        }),
      }
    );
    if (!response.ok) throw new Error(`LLM 请求失败: ${response.status}`);
    if (!response.body) throw new Error("LLM 未返回流式响应体");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const data = line.trim().replace(/^data:\s*/, "");
        if (!data || data === "[DONE]") continue;
        const payload = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const content = payload.choices?.[0]?.delta?.content;
        if (content) yield content;
      }
      if (done) break;
    }
  }

  complete(messages: ChatMessage[], context: Citation[], signal?: AbortSignal) {
    return collect(this.stream(messages, context, signal));
  }
}

export const llm: LlmClient =
  config.LLM_PROVIDER === "openai" ? new OpenAiCompatibleLlm() : new DemoLlm();
