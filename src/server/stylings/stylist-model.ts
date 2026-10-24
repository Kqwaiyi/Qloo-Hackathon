import type { LanguageModelV4, LanguageModelV4Prompt } from "@ai-sdk/provider";
import { wrapLanguageModel } from "ai";

import type { StylingContext } from "./steps";
import { PHOTO_LINKS } from "./stylist";

// The Stylist's model as the Workflow and the inline runner hand it to the agent. The seller photos
// of a Preview's Products are in the Stylist's conversation only by their links (ADR-0011): the
// Workflow agent sends the whole conversation into each model step, which Vercel keeps as the run's
// data, so a photo the conversation held would be kept there too.

/** What the Stylist's model is sent in place of a seller photo that can't be fetched. */
const SELLER_PHOTO_UNAVAILABLE = "(This seller photo couldn't be fetched, so judge this Piece by its title.)";

/**
 * The Stylist's model as each of the Workflow agent's model steps calls it: the app's AI's, sent each
 * photo the conversation gives by its link, a Preview's Products' seller photos, as that model takes
 * it. A model that reads a link itself is sent the link. Any other is sent the photo, fetched from its
 * seller here, inside the model step, as `ctx.productPhotos` fetches a Preview's, and never kept: not
 * in the step's input or output, nor anywhere else. One that can't be fetched is left out, with a line
 * saying so in its place, so the turn goes on without it.
 */
export function stylistModelOn(ctx: Pick<StylingContext, "ai" | "productPhotos">): LanguageModelV4 {
  const model = ctx.ai.stylistModel();
  return wrapLanguageModel({
    model,
    middleware: {
      // The agent leaves every photo link for the model step, which sends it as this model says.
      overrideSupportedUrls: () => PHOTO_LINKS,
      transformParams: async ({ params }) => ({ ...params, prompt: await withLinkedPhotosFetched(params.prompt, await model.supportedUrls, ctx.productPhotos) }),
    },
  });
}

/** The prompt with each photo given by a link `supportedUrls` doesn't cover fetched, each link once, or a line in its place. */
async function withLinkedPhotosFetched(
  prompt: LanguageModelV4Prompt,
  supportedUrls: Record<string, RegExp[]>,
  productPhotos: StylingContext["productPhotos"],
): Promise<LanguageModelV4Prompt> {
  const fetching = new Map<string, ReturnType<typeof fetchOrNull>>();
  const fetched = (url: string) => {
    let photo = fetching.get(url);
    if (!photo) {
      photo = fetchOrNull(productPhotos, url);
      fetching.set(url, photo);
    }
    return photo;
  };
  return Promise.all(
    prompt.map(async (message) => {
      if (message.role !== "tool") return message;
      const content = await Promise.all(
        message.content.map(async (part) => {
          if (part.type !== "tool-result" || part.output.type !== "content") return part;
          const value = await Promise.all(
            part.output.value.map(async (item) => {
              if (item.type !== "file" || item.data.type !== "url" || readsLink(supportedUrls, item.data.url)) return item;
              const photo = await fetched(item.data.url.toString());
              if (!photo) return { type: "text" as const, text: SELLER_PHOTO_UNAVAILABLE };
              return { ...item, mediaType: photo.mediaType, data: { type: "data" as const, data: photo.bytes } };
            }),
          );
          return { ...part, output: { ...part.output, value } };
        }),
      );
      return { ...message, content };
    }),
  );
}

/** The photo at `url`, or null, saying why, when it can't be fetched. */
async function fetchOrNull(productPhotos: StylingContext["productPhotos"], url: string) {
  try {
    return await productPhotos.fetch(url);
  } catch (error) {
    console.warn(`A seller photo couldn't be fetched for the Stylist: ${error instanceof Error ? error.message : "unknown error"}`);
    return null;
  }
}

/** Whether a model with these `supportedUrls` reads the image at `url` by its link. */
function readsLink(supportedUrls: Record<string, RegExp[]>, url: URL): boolean {
  return (supportedUrls["image/*"] ?? []).some((pattern) => pattern.test(url.toString()));
}
