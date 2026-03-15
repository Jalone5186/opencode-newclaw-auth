// @bun
// provider.ts
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
var isClaude = (modelId) => modelId.startsWith("claude-");
var isGemini = (modelId) => modelId.startsWith("gemini-");
var isResponses = (modelId) => modelId.startsWith("gpt-") || modelId.startsWith("codex");
var normalizeModelId = (modelId) => String(modelId).trim();
function createNewclaw(options = {}) {
  console.log(`[newclaw-provider] createNewclaw called: apiKey=${options.apiKey ? options.apiKey.slice(0, 8) + "****" : "none"}, baseURL=${options.baseURL}, hasFetch=${!!options.fetch}`);
  const openai = createOpenAI({
    apiKey: options.apiKey,
    baseURL: options.baseURL,
    headers: options.headers,
    fetch: options.fetch
  });
  const openaiLanguageModel = typeof openai.languageModel === "function" ? openai.languageModel : openai.chat;
  const openaiChatModel = typeof openai.chat === "function" ? openai.chat : openaiLanguageModel;
  const anthropic = createAnthropic({
    apiKey: options.anthropic?.apiKey ?? options.apiKey,
    baseURL: options.anthropic?.baseURL ?? options.baseURL,
    headers: options.anthropic?.headers ?? options.headers,
    fetch: options.fetch
  });
  const google = createGoogleGenerativeAI({
    apiKey: options.google?.apiKey ?? options.apiKey,
    baseURL: options.google?.baseURL ?? options.baseURL,
    headers: options.google?.headers ?? options.headers,
    fetch: options.fetch
  });
  const createModel = (modelId) => {
    const id = normalizeModelId(modelId);
    if (isClaude(id))
      return anthropic.languageModel(id);
    if (isGemini(id))
      return google.languageModel(id);
    if (isResponses(id) && typeof openai.responses === "function")
      return openai.responses(id);
    return openaiLanguageModel(id);
  };
  const provider = (modelId) => createModel(modelId);
  provider.languageModel = createModel;
  provider.chat = (modelId) => {
    const id = normalizeModelId(modelId);
    if (isClaude(id))
      return anthropic.languageModel(id);
    if (isGemini(id))
      return google.languageModel(id);
    return openaiChatModel(id);
  };
  provider.responses = (modelId) => {
    const id = normalizeModelId(modelId);
    if (isClaude(id))
      return provider.chat(id);
    if (isGemini(id))
      return provider.chat(id);
    return openai.responses(id);
  };
  return provider;
}
export {
  createNewclaw
};
