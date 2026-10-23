import type { LanguageModelV4 } from "@ai-sdk/provider";

import { AnthropicAiProvider } from "./anthropic";
import { fakeAiFromEnvironment } from "./fake";
import { GeminiAiProvider } from "./gemini";
import { type AiProvider, UnretryableAiError } from "./provider";

/** Each AI AI_PROVIDER can name, as the environment configures it. */
const AI_PROVIDERS: Record<string, () => AiProvider> = {
  fake: fakeAiFromEnvironment,
  real: realAiFromEnvironment,
};

/**
 * The AI AI_PROVIDER names: the fake adapter unless it says real, so real AI, which costs money,
 * runs only when explicitly switched on. A team script running live names its own.
 */
export function aiFromEnvironment(name = process.env.AI_PROVIDER || "fake"): AiProvider {
  const fromEnvironment = Object.hasOwn(AI_PROVIDERS, name) ? AI_PROVIDERS[name] : undefined;
  if (!fromEnvironment) throw new Error(`AI_PROVIDER must be one of: ${Object.keys(AI_PROVIDERS).join(", ")}.`);
  return fromEnvironment();
}

/**
 * Real AI, two adapters together (ADR-0011): the photo check on Claude, with ANTHROPIC_API_KEY, and
 * tailoring and Previews on Gemini, with GEMINI_API_KEY. It refuses to start without either key.
 * The Stylist isn't on real AI yet, so a real Face Photo's Styling breaks.
 */
function realAiFromEnvironment(): AiProvider {
  const claude = new AnthropicAiProvider({ apiKey: realAiKey("ANTHROPIC_API_KEY") });
  const gemini = new GeminiAiProvider({ apiKey: realAiKey("GEMINI_API_KEY") });
  return {
    checkPhoto: (input) => claude.checkPhoto(input),
    stylistModel: () => NO_STYLIST_YET,
    tailorPieces: (input) => gemini.tailorPieces(input),
    renderPreview: (input) => gemini.renderPreview(input),
  };
}

function realAiKey(name: "ANTHROPIC_API_KEY" | "GEMINI_API_KEY"): string {
  const key = process.env[name];
  if (!key) throw new Error(`${name} must be set when AI_PROVIDER is real.`);
  return key;
}

/** Real AI's Stylist until Claude runs it: every turn fails for good, before anything is sent. */
const NO_STYLIST_YET: LanguageModelV4 = {
  specificationVersion: "v4",
  provider: "none",
  modelId: "no-stylist-yet",
  supportedUrls: {},
  doGenerate: noStylistYet,
  doStream: noStylistYet,
};

async function noStylistYet(): Promise<never> {
  throw new UnretryableAiError("The Stylist doesn't run on real AI yet.");
}
