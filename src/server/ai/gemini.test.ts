import { inspect } from "node:util";
import { beforeEach, describe, expect, it } from "vitest";

import { FakeGemini, type GeminiPart, geminiError, geminiImage, geminiText, type RecordedGeminiRequest } from "./fake-gemini";
import { GeminiAiProvider } from "./gemini";
import { type Photo, type PreviewInput, type PreviewPiece, UnretryableAiError } from "./provider";

// The Gemini adapter against a fake Gemini API: no test calls Gemini. The fake answers each
// request with a small hand-written response shaped like Gemini's, and records what was sent.

/** Google blocking the request itself, photo included: no candidates, only the block reason. */
function geminiPromptBlocked(blockReason: string): Response {
  return Response.json({ promptFeedback: { blockReason } });
}

/** Gemini's reply carrying an image it drew while thinking, then the one it finished with. */
function geminiImageAfterThinking(drawnWhileThinking: Uint8Array, finished: Uint8Array): Response {
  return geminiImageParts([
    { inlineData: { mimeType: "image/png", data: base64(drawnWhileThinking) }, thought: true },
    { inlineData: { mimeType: "image/png", data: base64(finished) } },
  ]);
}

function geminiImageParts(parts: GeminiPart[]): Response {
  return Response.json({ candidates: [{ content: { role: "model", parts }, finishReason: "STOP" }] });
}

/** Google stopping an image it drew, which isn't returned: only the finish reason and its message. */
function geminiImageStopped(finishReason: string): Response {
  return Response.json({ candidates: [{ content: {}, finishReason, finishMessage: "The image was stopped." }] });
}

/** Every part of the request that isn't text: the photo, inline or as a file reference. */
function photoPartsOf({ body }: RecordedGeminiRequest): GeminiPart[] {
  return body.contents.flatMap(({ parts }) => parts).filter((part) => part.text === undefined);
}

/** All the request's text, the system instruction included. */
function textOf({ body }: RecordedGeminiRequest): string {
  const parts = [...(body.systemInstruction?.parts ?? []), ...body.contents.flatMap(({ parts }) => parts)];
  return parts.flatMap(({ text }) => (text === undefined ? [] : [text])).join("\n");
}

function base64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

/** The photo's bytes stand in for a real photo: the adapter sends them as they are. */
const PHOTO: Photo = { bytes: new TextEncoder().encode("the bytes of a photo of someone standing in a park"), mediaType: "image/jpeg" };

/** Each Product photo's bytes stand in for its seller's photo of the Product. */
const TOP_PHOTO: Photo = { bytes: new TextEncoder().encode("the bytes of a seller's photo of a cropped biker jacket"), mediaType: "image/png" };
const BOTTOM_PHOTO: Photo = { bytes: new TextEncoder().encode("the bytes of a seller's photo of straight black jeans"), mediaType: "image/webp" };
const SHOES_PHOTO: Photo = { bytes: new TextEncoder().encode("the bytes of a seller's photo of ankle boots"), mediaType: "image/jpeg" };

/**
 * A Full-Body Photo's Outfit, as its Preview is asked for: the Hairstyle by its details, each
 * Product by its title and its seller's photo. The Products are made up.
 */
const PREVIEW: PreviewInput = {
  photo: PHOTO,
  photoType: "full_body",
  pieces: [
    { category: "hairstyle", details: "A choppy chin-length bob with a soft side part, in your own hair colour." },
    { category: "top", title: "Cropped Leather Biker Jacket", photo: TOP_PHOTO },
    { category: "bottom", title: "High-Rise Straight Jean, Washed Black", photo: BOTTOM_PHOTO },
    { category: "shoes", title: "Lace-Up Ankle Boot", photo: SHOES_PHOTO },
  ],
};

/** The photo, inline, as Gemini receives it. */
function inline({ bytes, mediaType }: Photo): GeminiPart {
  return { inlineData: { mimeType: mediaType, data: base64(bytes) } };
}

/** The request's text line that changes the Piece with this Category label, such as "Top". */
function changeLine(request: RecordedGeminiRequest, label: string): string | undefined {
  return textOf(request)
    .split("\n")
    .find((line) => line.startsWith(`- ${label}:`));
}

/** The bytes stand in for the image Gemini drew. */
const DRAWN = new TextEncoder().encode("the bytes of the photo with the Outfit drawn on");

let gemini: FakeGemini;
let ai: GeminiAiProvider;

beforeEach(() => {
  gemini = new FakeGemini();
  ai = new GeminiAiProvider({ apiKey: "test-api-key", fetch: gemini.fetch });
});

describe("Previews", () => {
  it("returns the image Gemini drew", async () => {
    gemini.respond = () => geminiImage(DRAWN);

    const result = await ai.renderPreview(PREVIEW);

    expect(result).toEqual({ refused: false, image: DRAWN });
  });

  it("asks gemini-nano-banana-2.1 for an image alone, with minimal thinking and the photo's own aspect ratio", async () => {
    gemini.respond = () => geminiImage(DRAWN);

    await ai.renderPreview(PREVIEW);

    expect(gemini.requests.map(({ url }) => url.pathname)).toEqual(["/v1beta/models/gemini-nano-banana-2.1:generateContent"]);
    expect(gemini.requests[0]!.body.generationConfig).toEqual({ responseModalities: ["IMAGE"], thinkingConfig: { thinkingLevel: "minimal" } });
  });

  it("sends the user's photo first, then each Product's photo, all inline in one request, in Piece order", async () => {
    gemini.respond = () => geminiImage(DRAWN);

    await ai.renderPreview(PREVIEW);

    expect(gemini.requests).toHaveLength(1);
    expect(photoPartsOf(gemini.requests[0]!)).toEqual([inline(PHOTO), inline(TOP_PHOTO), inline(BOTTOM_PHOTO), inline(SHOES_PHOTO)]);
  });

  it("names each Product photo by its position and Category, with the Product's title, and the Hairstyle by its details", async () => {
    gemini.respond = () => geminiImage(DRAWN);

    await ai.renderPreview(PREVIEW);

    const [request] = gemini.requests;
    expect(textOf(request!)).toMatch(/image 1 is a photo of a person/i);
    expect(changeLine(request!, "Hairstyle")).toBe("- Hairstyle: A choppy chin-length bob with a soft side part, in your own hair colour.");
    expect(changeLine(request!, "Top")).toBe('- Top: the garment in image 2, "Cropped Leather Biker Jacket"');
    expect(changeLine(request!, "Bottom")).toBe('- Bottom: the garment in image 3, "High-Rise Straight Jean, Washed Black"');
    expect(changeLine(request!, "Shoes")).toBe('- Shoes: the garment in image 4, "Lace-Up Ankle Boot"');
  });

  it("tells the model to take only the garment from each Product photo, keeping everything else as it is", async () => {
    gemini.respond = () => geminiImage(DRAWN);

    await ai.renderPreview(PREVIEW);

    const text = textOf(gemini.requests[0]!);
    expect(text).toMatch(/take only the garment/i);
    expect(text).toMatch(/ignore any person, mannequin or other clothing/i);
    expect(text).toContain("Keep everything else exactly as it is:\n- the most prominent person's face and identity");
  });

  it.each<[string, PreviewInput]>([
    ["a Face Photo's hair", { ...PREVIEW, photoType: "face", pieces: [PREVIEW.pieces[0]!] }],
    ["a Full-Body Photo's Outfit", PREVIEW],
    ["a Full-Body Photo's Outfit with no Product photos", { ...PREVIEW, pieces: PREVIEW.pieces.map((piece) => (piece.category === "hairstyle" ? piece : { ...piece, photo: null })) }],
    ["a Body-Only Photo's Outfit", { ...PREVIEW, photoType: "body_only", pieces: PREVIEW.pieces.slice(1) }],
  ])("tells the model to change only the Main Person, as the most prominent person in the photo, for %s, keeping every other person exactly as they are", async (_change, preview) => {
    gemini.respond = () => geminiImage(DRAWN);

    await ai.renderPreview(preview);

    const text = textOf(gemini.requests[0]!);
    const [instruction] = text.split("\n");
    expect(instruction).toMatch(/the most prominent person in the photo/i);
    expect(text).toContain("- every other person in the photo, exactly as they are");
  });

  it("draws a Product whose photo couldn't be fetched from its title, numbering the photos after it in turn", async () => {
    gemini.respond = () => geminiImage(DRAWN);
    const [hairstyle, top, bottom, shoes] = PREVIEW.pieces;

    await ai.renderPreview({ ...PREVIEW, pieces: [hairstyle!, { ...top!, photo: null } as PreviewPiece, bottom!, shoes!] });

    const [request] = gemini.requests;
    expect(photoPartsOf(request!)).toEqual([inline(PHOTO), inline(BOTTOM_PHOTO), inline(SHOES_PHOTO)]);
    expect(changeLine(request!, "Top")).toBe("- Top: Cropped Leather Biker Jacket");
    expect(changeLine(request!, "Bottom")).toBe('- Bottom: the garment in image 2, "High-Rise Straight Jean, Washed Black"');
    expect(changeLine(request!, "Shoes")).toBe('- Shoes: the garment in image 3, "Lace-Up Ankle Boot"');
  });

  it("keeps a Body-Only Photo's rule against adding a face beside the Product photos", async () => {
    gemini.respond = () => geminiImage(DRAWN);
    const [, ...products] = PREVIEW.pieces;

    await ai.renderPreview({ ...PREVIEW, photoType: "body_only", pieces: products });

    const text = textOf(gemini.requests[0]!);
    expect(text).toContain("Never add a face or a head that isn't in the photo.");
    expect(text).toContain("- their hair, and anything covering it");
  });

  it("adds a redraw's correction after the whole of the Preview's own instruction, which it never replaces", async () => {
    gemini.respond = () => geminiImage(DRAWN);
    await ai.renderPreview(PREVIEW);
    const instruction = textOf(gemini.requests[0]!);

    await ai.renderPreview({ ...PREVIEW, correction: "  Keep the face exactly\nas it is in the photo.  " });

    const redraw = gemini.requests[1]!;
    expect(textOf(redraw)).toBe(`${instruction}\n\nAn earlier try at this edit got something wrong. Put it right, keeping every rule above:\nKeep the face exactly as it is in the photo.`);
    expect(photoPartsOf(redraw)).toEqual(photoPartsOf(gemini.requests[0]!));
  });

  it("comes back refused as blocked when Google blocks the request, without asking again", async () => {
    gemini.respond = () => geminiPromptBlocked("PROHIBITED_CONTENT");

    const result = await ai.renderPreview(PREVIEW);

    expect(result).toEqual({ refused: true, reason: "blocked" });
    expect(gemini.requests).toHaveLength(1);
  });

  it.each(["IMAGE_SAFETY", "IMAGE_PROHIBITED_CONTENT", "SAFETY", "PROHIBITED_CONTENT"])(
    "comes back refused for image safety when Google stops the image with %s, without asking again",
    async (finishReason) => {
      gemini.respond = () => geminiImageStopped(finishReason);

      const result = await ai.renderPreview(PREVIEW);

      expect(result).toEqual({ refused: true, reason: "image_safety" });
      expect(gemini.requests).toHaveLength(1);
    },
  );

  it.each([
    ["answers in text", () => geminiText("I can't edit this photo of a person.")],
    ["says it drew no image", () => geminiImageStopped("NO_IMAGE")],
    ["stops the image for another reason", () => geminiImageStopped("IMAGE_OTHER")],
  ])("comes back refused for no image when Gemini %s, without asking again", async (_reply, noImageResponse) => {
    gemini.respond = noImageResponse;

    const result = await ai.renderPreview(PREVIEW);

    expect(result).toEqual({ refused: true, reason: "no_image" });
    expect(gemini.requests).toHaveLength(1);
  });

  it.each([
    ["stops for no reason it gives", () => geminiImageStopped("OTHER")],
    ["finishes with nothing in its reply", () => Response.json({ candidates: [{ content: {}, finishReason: "STOP" }] })],
    ["sends no candidates and no block reason", () => Response.json({})],
  ])("throws when Gemini %s, as an error worth retrying, since it isn't a refusal", async (_reply, emptyResponse) => {
    gemini.respond = emptyResponse;

    const error = await ai.renderPreview(PREVIEW).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(UnretryableAiError);
  });

  it.each([429, 500, 503])(
    "throws Gemini's %d after one try, as an error worth retrying that carries nothing of the photo or the Product photos",
    async (status) => {
      gemini.respond = () => geminiError(status);

      const error = await ai.renderPreview(PREVIEW).catch((thrown: unknown) => thrown);

      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(UnretryableAiError);
      for (const photo of [PHOTO, TOP_PHOTO, BOTTOM_PHOTO, SHOES_PHOTO]) expect(inspect(error, { depth: Infinity })).not.toContain(base64(photo.bytes));
      expect(gemini.requests).toHaveLength(1);
    },
  );

  it("throws an error Gemini refuses the request with as one not worth retrying", async () => {
    gemini.respond = () => geminiError(400);

    const error = await ai.renderPreview(PREVIEW).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(UnretryableAiError);
    expect(gemini.requests).toHaveLength(1);
  });

  it("returns the image Gemini finished with, never one it drew while thinking", async () => {
    const draft = new TextEncoder().encode("the bytes of a draft drawn while thinking");
    gemini.respond = () => geminiImageAfterThinking(draft, DRAWN);

    const result = await ai.renderPreview(PREVIEW);

    expect(result).toEqual({ refused: false, image: DRAWN });
  });
});
