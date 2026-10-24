import type { LanguageModelV4, LanguageModelV4CallOptions, LanguageModelV4GenerateResult, LanguageModelV4StreamResult } from "@ai-sdk/provider";
import { WORKFLOW_DESERIALIZE, WORKFLOW_SERIALIZE } from "@workflow/serde";

import { PHOTO_LINKS } from "@/server/stylings/stylist";

// The Stylist's model as the Styling Workflow hands it to the Workflow agent. The agent passes its
// model into each of its model steps, so it must cross the step boundary: this one serializes to
// nothing, and inside the step calls the app's own Stylist's model, which the app's AI supplies.
// Which provider runs it stays in the adapters, and nothing of the app loads in the Workflow's
// sandbox: each call is marked a step, so the compiler strips its body from the workflow bundle.
// Called from inside the agent's model step, it runs there as a plain function.

class WorkflowStylistModel implements LanguageModelV4 {
  readonly specificationVersion = "v4";
  readonly provider = "app";
  readonly modelId = "stylist";
  // Photos given by their links, a Preview's Products' seller photos, are left as links for the app's
  // Stylist's model, which fetches those it doesn't read by their links inside the model step, so
  // the run's data only ever holds the links.
  readonly supportedUrls = PHOTO_LINKS;

  static [WORKFLOW_SERIALIZE](_model: WorkflowStylistModel): Record<string, never> {
    return {};
  }

  static [WORKFLOW_DESERIALIZE](_data: Record<string, never>): WorkflowStylistModel {
    return new WorkflowStylistModel();
  }

  async doGenerate(options: LanguageModelV4CallOptions): Promise<LanguageModelV4GenerateResult> {
    "use step";
    const { appStylistModel } = await import("@/server/stylings/workflow-steps");
    return (await appStylistModel()).doGenerate(options);
  }

  async doStream(options: LanguageModelV4CallOptions): Promise<LanguageModelV4StreamResult> {
    "use step";
    const { appStylistModel } = await import("@/server/stylings/workflow-steps");
    return (await appStylistModel()).doStream(options);
  }
}

/** The Stylist's model for the Workflow agent, made here rather than in the workflow's own module, as the compiler needs. */
export function workflowStylistModel(): LanguageModelV4 {
  return new WorkflowStylistModel();
}
