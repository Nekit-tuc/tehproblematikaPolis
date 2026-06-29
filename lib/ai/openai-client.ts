import type OpenAI from "openai";

let cachedClient: OpenAI | null = null;

export function hasOpenAiApiKey() {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export function getOpenAiModel() {
  return process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
}

export async function getOpenAiClient() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return { client: null, error: "OPENAI_API_KEY is not configured" };

  try {
    const { default: OpenAIClient } = await import("openai");
    cachedClient ??= new OpenAIClient({ apiKey });
    return { client: cachedClient, error: null };
  } catch (error) {
    console.error("[openai-client] SDK import failed", error);
    return { client: null, error: "OpenAI SDK error" };
  }
}
