import { fakeAiFromEnvironment } from "./fake";
import { geminiAiFromEnvironment } from "./gemini";
import type { AiProvider } from "./provider";

/** Each AI provider AI_PROVIDER can name, as the environment configures it. */
const AI_PROVIDERS: Record<string, () => AiProvider> = {
  fake: fakeAiFromEnvironment,
  gemini: geminiAiFromEnvironment,
};

/**
 * The AI provider AI_PROVIDER names: the fake adapter unless it says gemini, so Gemini, which costs
 * money, runs only when explicitly switched on.
 */
export function aiFromEnvironment(): AiProvider {
  const name = process.env.AI_PROVIDER || "fake";
  const fromEnvironment = Object.hasOwn(AI_PROVIDERS, name) ? AI_PROVIDERS[name] : undefined;
  if (!fromEnvironment) throw new Error(`AI_PROVIDER must be one of: ${Object.keys(AI_PROVIDERS).join(", ")}.`);
  return fromEnvironment();
}
