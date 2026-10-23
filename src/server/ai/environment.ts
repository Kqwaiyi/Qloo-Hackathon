import { AnthropicAiProvider } from "./anthropic";
import { fakeAiFromEnvironment } from "./fake";
import { GeminiAiProvider } from "./gemini";
import type { AiProvider } from "./provider";

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
 * Real AI, two adapters together (ADR-0011): the photo check and the Stylist on Claude, with
 * ANTHROPIC_API_KEY, and Previews on Gemini, with GEMINI_API_KEY. It refuses to start without
 * either key.
 */
function realAiFromEnvironment(): AiProvider {
  const claude = new AnthropicAiProvider({ apiKey: realAiKey("ANTHROPIC_API_KEY") });
  const gemini = new GeminiAiProvider({ apiKey: realAiKey("GEMINI_API_KEY") });
  return {
    checkPhoto: (input) => claude.checkPhoto(input),
    stylistModel: () => claude.stylistModel(),
    renderPreview: (input) => gemini.renderPreview(input),
  };
}

function realAiKey(name: "ANTHROPIC_API_KEY" | "GEMINI_API_KEY"): string {
  const key = process.env[name];
  if (!key) throw new Error(`${name} must be set when AI_PROVIDER is real.`);
  return key;
}
