import { inspect } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { aiFromEnvironment } from "./environment";
import { FakeAiProvider } from "./fake";
import { GeminiAiProvider } from "./gemini";
import {
  type Photo,
  type PhotoCheckInput,
  type PhotoCheckReport,
  type PreviewInput,
  type PreviewPiece,
  type TailoredPieces,
  type TailoringInput,
  UnretryableAiError,
} from "./provider";
import { checkTailoredPieces } from "./tailoring";

// The Gemini adapter against a fake Gemini API: no test calls Gemini. The fake answers each
// request with a small hand-written response shaped like Gemini's, and records what was sent.

/** A request as it left for Gemini. */
interface RecordedGeminiRequest {
  url: URL;
  headers: Headers;
  body: GeminiRequestBody;
}

interface GeminiRequestBody {
  contents: { role: string; parts: GeminiPart[] }[];
  systemInstruction?: { parts: GeminiPart[] };
  generationConfig?: Record<string, unknown>;
}

type GeminiPart = { text?: string; inlineData?: { mimeType: string; data: string }; fileData?: unknown; thought?: boolean };

/** Gemini in tests: it answers every request with `respond`, and records each one. */
class FakeGemini {
  readonly requests: RecordedGeminiRequest[] = [];
  respond: (request: RecordedGeminiRequest) => Response = () => geminiError(500);

  readonly fetch: typeof globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input);
    const body = JSON.parse(String(init?.body)) as GeminiRequestBody;
    const recorded = { url, headers: new Headers(init?.headers), body };
    this.requests.push(recorded);
    return this.respond(recorded);
  };
}

/** Gemini's reply carrying `text`, as a model that finished normally sends it. */
function geminiText(text: string): Response {
  return Response.json({ candidates: [{ content: { role: "model", parts: [{ text }] }, finishReason: "STOP" }] });
}

/** Gemini's reply carrying `value` as JSON, as structured output sends it. */
function geminiJson(value: unknown): Response {
  return geminiText(JSON.stringify(value));
}

/** Google blocking the request itself, photo included: no candidates, only the block reason. */
function geminiPromptBlocked(blockReason: string): Response {
  return Response.json({ promptFeedback: { blockReason } });
}

/** Google stopping the reply part-way for safety. Whatever was written comes back with it. */
function geminiReplyBlocked(finishReason: string, writtenSoFar: string): Response {
  return Response.json({ candidates: [{ content: { role: "model", parts: [{ text: writtenSoFar }] }, finishReason }] });
}

/** Gemini's reply carrying the image it drew. */
function geminiImage(image: Uint8Array): Response {
  return geminiImageParts([{ inlineData: { mimeType: "image/png", data: base64(image) } }]);
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

/** One of Gemini's errors, with no wait before the AI SDK retries it. */
function geminiError(status: number): Response {
  return Response.json({ error: { code: status, message: `Gemini error ${status}` } }, { status, headers: { "retry-after-ms": "0" } });
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

const PHOTO_CHECK: PhotoCheckInput = { photo: PHOTO, photoType: "full_body" };

const REPORT: PhotoCheckReport = {
  peopleCount: 1,
  visible: { face: true, hair: true, upperBody: true, legs: true, feet: true },
  hairCovered: false,
  clearEnough: true,
  explicit: false,
  photoStyle: ["edgy", "chic"],
};

/** A Full-Body Photo's Outfit. The Style Icon, Brands and Products are made up. */
const TAILORING: TailoringInput = {
  photo: PHOTO,
  photoType: "full_body",
  ageGroup: "25_29",
  photoStyle: ["edgy", "chic"],
  line: "womenswear",
  styleIconName: "Mira Vale",
  pieces: [
    { category: "hairstyle" },
    {
      category: "top",
      brand: { name: "Northbound", categoryTags: ["apparel", "footwear"] },
      candidates: [
        {
          id: "nb-biker",
          title: "Cropped Leather Biker Jacket",
          description: "A black leather biker jacket,\ncropped at the waist, with silver zips.",
          colours: ["#111111", "#c0c0c0"],
        },
        { id: "nb-tee", title: "Boxy Organic Tee", description: null, colours: [] },
      ],
    },
    {
      category: "bottom",
      brand: { name: "Field Denim", categoryTags: ["apparel", "denim"] },
      candidates: [{ id: "fd-straight", title: "High-Rise Straight Jean, Washed Black", description: "Straight-leg jeans in washed-black denim.", colours: ["#2b2b2b"] }],
    },
    {
      category: "shoes",
      brand: { name: "Stride Works", categoryTags: ["footwear"] },
      candidates: [{ id: "sw-boot", title: "Lace-Up Ankle Boot", description: "Black leather boots on a chunky sole.", colours: ["#000000"] }],
    },
  ],
};

const TAILORED: TailoredPieces = {
  pieces: [
    {
      category: "hairstyle",
      item: "Choppy chin-length bob",
      details: "A choppy chin-length bob with a soft side part, in your own hair colour.",
      why: "Mira Vale's signature bob, cut from the length you have now to sharpen your edgy, chic style.",
      unknownCut: false,
    },
    { category: "top", productId: "nb-biker", why: "This cropped biker jacket gives your edgy Photo Style its edge, worn the way Mira Vale layers hers." },
    { category: "bottom", productId: "fd-straight", why: "Straight black jeans keep the Outfit sleek and easy, and go with what you're already wearing." },
    { category: "shoes", productId: "sw-boot", why: "Chunky boots finish the Outfit with the attitude Mira Vale is known for." },
  ],
};

/** The same Outfit, its Top Brand also having One-Pieces, which come beside the Top's candidates. */
const TAILORING_WITH_ONE_PIECES: TailoringInput = {
  ...TAILORING,
  pieces: TAILORING.pieces.map((piece) =>
    piece.category === "top"
      ? {
          ...piece,
          onePieceCandidates: [
            { id: "nb-slip", title: "Satin Slip Midi Dress", description: "A bias-cut midi slip dress\nin black satin.", colours: ["#0d0d0d"] },
            { id: "nb-boiler", title: "Utility Boiler Suit", description: null, colours: [] },
          ],
        }
      : piece,
  ),
};

/** That Outfit tailored as a One-Piece, in place of its Top and Bottom. */
const TAILORED_AS_ONE_PIECE: TailoredPieces = {
  pieces: [
    TAILORED.pieces[0]!,
    { category: "one_piece", productId: "nb-slip", why: "A black slip dress carries your edgy, chic style in one easy piece, as Mira Vale would wear it." },
    TAILORED.pieces[3]!,
  ],
};

/** Each Product photo's bytes stand in for its seller's photo of the Product. */
const TOP_PHOTO: Photo = { bytes: new TextEncoder().encode("the bytes of a seller's photo of a cropped biker jacket"), mediaType: "image/png" };
const BOTTOM_PHOTO: Photo = { bytes: new TextEncoder().encode("the bytes of a seller's photo of straight black jeans"), mediaType: "image/webp" };
const SHOES_PHOTO: Photo = { bytes: new TextEncoder().encode("the bytes of a seller's photo of ankle boots"), mediaType: "image/jpeg" };

/**
 * The Full-Body Photo's Outfit above, as its Preview is asked for: the Hairstyle by its details,
 * each Product by its title and its seller's photo.
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

describe("the photo check", () => {
  it("reports what Gemini saw", async () => {
    gemini.respond = () => geminiJson(REPORT);

    const result = await ai.checkPhoto(PHOTO_CHECK);

    expect(result).toEqual({ blocked: false, report: REPORT });
  });

  it("sends the photo inline to gemini-3.5-flash-lite, never through the Files API", async () => {
    gemini.respond = () => geminiJson(REPORT);

    await ai.checkPhoto(PHOTO_CHECK);

    expect(gemini.requests.map(({ url }) => url.pathname)).toEqual(["/v1beta/models/gemini-3.5-flash-lite:generateContent"]);
    expect(photoPartsOf(gemini.requests[0]!)).toEqual([{ inlineData: { mimeType: "image/jpeg", data: base64(PHOTO.bytes) } }]);
  });

  it.each([
    ["the request", () => geminiPromptBlocked("PROHIBITED_CONTENT")],
    ["the reply", () => geminiReplyBlocked("SAFETY", '{"peopleCount": 1, ')],
  ])("comes back blocked when Google blocks %s", async (_blocked, blockedResponse) => {
    gemini.respond = blockedResponse;

    const result = await ai.checkPhoto(PHOTO_CHECK);

    expect(result).toEqual({ blocked: true });
  });

  it("gets past an error that the AI SDK's own retries clear", async () => {
    gemini.respond = () => (gemini.requests.length === 1 ? geminiError(503) : geminiJson(REPORT));

    const result = await ai.checkPhoto(PHOTO_CHECK);

    expect(result).toEqual({ blocked: false, report: REPORT });
  });

  it("throws an error that outlasts the AI SDK's own retries, carrying nothing of the photo", async () => {
    gemini.respond = () => geminiError(503);

    const error = await ai.checkPhoto(PHOTO_CHECK).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(Error);
    expect(inspect(error, { depth: Infinity })).not.toContain(base64(PHOTO.bytes));
  });

  it("throws when Gemini's reply isn't a report", async () => {
    gemini.respond = () => geminiJson({ ...REPORT, peopleCount: "one", photoStyle: ["cottagecore"] });

    await expect(ai.checkPhoto(PHOTO_CHECK)).rejects.toThrow();
  });

  it("keeps one word of a Photo Style Gemini read twice", async () => {
    gemini.respond = () => geminiJson({ ...REPORT, photoStyle: ["casual", "casual"] });

    const result = await ai.checkPhoto(PHOTO_CHECK);

    expect(result).toEqual({ blocked: false, report: { ...REPORT, photoStyle: ["casual"] } });
  });
});

describe("tailoring", () => {
  it("returns Gemini's reply as it came", async () => {
    gemini.respond = () => geminiJson(TAILORED);

    const reply = await ai.tailorPieces(TAILORING);

    expect(reply).toEqual(TAILORED);
  });

  it("returns a reply that doesn't match the schema as it came, for our code to check", async () => {
    gemini.respond = () => geminiJson({ pieces: [{ category: "top", item: "Black cropped leather biker jacket" }] });

    const reply = await ai.tailorPieces(TAILORING);

    expect(reply).toEqual({ pieces: [{ category: "top", item: "Black cropped leather biker jacket" }] });
  });

  it("returns a reply that isn't JSON as its text, for our code to check", async () => {
    gemini.respond = () => geminiText("Here is your Outfit: a black biker jacket.");

    const reply = await ai.tailorPieces(TAILORING);

    expect(reply).toBe("Here is your Outfit: a black biker jacket.");
  });

  it("returns no reply when Google blocks the request, so it's asked again rather than retried", async () => {
    gemini.respond = () => geminiPromptBlocked("OTHER");

    const reply = await ai.tailorPieces(TAILORING);

    expect(reply).toBeNull();
  });

  it("returns what Gemini wrote before Google stopped the reply, for our code to check", async () => {
    gemini.respond = () => geminiReplyBlocked("SAFETY", '{"pieces": [{"category": "top", ');

    const reply = await ai.tailorPieces(TAILORING);

    expect(reply).toBe('{"pieces": [{"category": "top", ');
  });

  it("throws an error that outlasts the AI SDK's own retries, carrying nothing of the photo", async () => {
    gemini.respond = () => geminiError(503);

    const error = await ai.tailorPieces(TAILORING).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(Error);
    expect(inspect(error, { depth: Infinity })).not.toContain(base64(PHOTO.bytes));
  });

  it("throws an error Gemini refuses the request with as one not worth retrying", async () => {
    gemini.respond = () => geminiError(400);

    const error = await ai.tailorPieces(TAILORING).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(UnretryableAiError);
    expect(gemini.requests).toHaveLength(1);
  });

  it("throws an error that outlasts the AI SDK's own retries as one still worth retrying", async () => {
    gemini.respond = () => geminiError(503);

    const error = await ai.tailorPieces(TAILORING).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(UnretryableAiError);
  });

  it("sends gemini-3.5-flash-lite the photo inline, with the Outfit's line, Style Icon and Brands", async () => {
    gemini.respond = () => geminiJson(TAILORED);

    await ai.tailorPieces(TAILORING);

    expect(gemini.requests.map(({ url }) => url.pathname)).toEqual(["/v1beta/models/gemini-3.5-flash-lite:generateContent"]);
    const [request] = gemini.requests;
    expect(photoPartsOf(request!)).toEqual([{ inlineData: { mimeType: "image/jpeg", data: base64(PHOTO.bytes) } }]);
    const text = textOf(request!);
    for (const sent of ["womenswear", "Mira Vale", "edgy and chic", "Northbound", "Field Denim", "Stride Works"]) {
      expect(text).toContain(sent);
    }
  });

  it("sends each Brand Piece's candidates as text, by their IDs, titles, descriptions and colours, with no image but the user's photo", async () => {
    gemini.respond = () => geminiJson(TAILORED);

    await ai.tailorPieces(TAILORING);

    const [request] = gemini.requests;
    expect(photoPartsOf(request!)).toEqual([{ inlineData: { mimeType: "image/jpeg", data: base64(PHOTO.bytes) } }]);
    const text = textOf(request!);
    for (const sent of [
      "id: nb-biker | title: Cropped Leather Biker Jacket | description: A black leather biker jacket, cropped at the waist, with silver zips. | colours: #111111, #c0c0c0",
      "id: nb-tee | title: Boxy Organic Tee",
      "id: fd-straight | title: High-Rise Straight Jean, Washed Black | description: Straight-leg jeans in washed-black denim. | colours: #2b2b2b",
      "id: sw-boot | title: Lace-Up Ankle Boot",
    ]) {
      expect(text).toContain(sent);
    }
    // Nothing tells it to invent items, and it's told no price.
    expect(text).not.toMatch(/generic|US dollars/);
  });

  it("gets a reply our check accepts only when each Brand Piece is one of its own Category's listed candidates", async () => {
    gemini.respond = () => geminiJson(TAILORED);
    expect(checkTailoredPieces(await ai.tailorPieces(TAILORING), TAILORING.pieces)).toEqual([
      expect.objectContaining({ category: "hairstyle", item: "Choppy chin-length bob" }),
      expect.objectContaining({ category: "top", productId: "nb-biker" }),
      expect.objectContaining({ category: "bottom", productId: "fd-straight" }),
      expect.objectContaining({ category: "shoes", productId: "sw-boot" }),
    ]);

    for (const productId of ["nb-not-listed", "fd-straight", undefined]) {
      gemini.respond = () => geminiJson({ pieces: TAILORED.pieces.map((piece) => (piece.category === "top" ? { ...piece, productId } : piece)) });

      expect(checkTailoredPieces(await ai.tailorPieces(TAILORING), TAILORING.pieces)).toBeNull();
    }
  });

  it("sends the Top Brand's One-Piece candidates as text beside the Top's, telling it a One-Piece may take the place of the Top and Bottom though separates come first", async () => {
    gemini.respond = () => geminiJson(TAILORED);

    await ai.tailorPieces(TAILORING_WITH_ONE_PIECES);

    const [request] = gemini.requests;
    expect(photoPartsOf(request!)).toEqual([{ inlineData: { mimeType: "image/jpeg", data: base64(PHOTO.bytes) } }]);
    const lines = textOf(request!).split("\n");
    const topLine = lines.findIndex((line) => line.startsWith("- top (Top): from Northbound"));
    const bottomLine = lines.findIndex((line) => line.startsWith("- bottom (Bottom)"));
    // After the Top's own candidates, before the Bottom.
    expect(lines.slice(topLine + 3, bottomLine)).toEqual([
      expect.stringMatching(/one_piece.*in place of both the top and the bottom/i),
      "  - id: nb-slip | title: Satin Slip Midi Dress | description: A bias-cut midi slip dress in black satin. | colours: #0d0d0d",
      "  - id: nb-boiler | title: Utility Boiler Suit",
    ]);
    expect(textOf(request!)).toMatch(/prefer separates/i);
  });

  it("gets a reply our check accepts with a One-Piece only in place of the Top and Bottom, as one of the Top Brand's One-Piece candidates", async () => {
    gemini.respond = () => geminiJson(TAILORED_AS_ONE_PIECE);
    expect(checkTailoredPieces(await ai.tailorPieces(TAILORING_WITH_ONE_PIECES), TAILORING_WITH_ONE_PIECES.pieces)).toEqual([
      expect.objectContaining({ category: "hairstyle" }),
      { category: "one_piece", productId: "nb-slip", why: expect.stringContaining("slip dress") },
      expect.objectContaining({ category: "shoes", productId: "sw-boot" }),
    ]);
    // Separates still pass.
    gemini.respond = () => geminiJson(TAILORED);
    expect(checkTailoredPieces(await ai.tailorPieces(TAILORING_WITH_ONE_PIECES), TAILORING_WITH_ONE_PIECES.pieces)).toHaveLength(4);

    const [hairstyle, top, bottom, shoes] = TAILORED.pieces;
    const onePiece = TAILORED_AS_ONE_PIECE.pieces[1]!;
    for (const [pieces, asked] of [
      // Without One-Piece candidates.
      [[hairstyle, onePiece, shoes], TAILORING.pieces],
      // A Top candidate, or none listed.
      [[hairstyle, { ...onePiece, productId: "nb-biker" }, shoes], TAILORING_WITH_ONE_PIECES.pieces],
      [[hairstyle, { ...onePiece, productId: "nb-not-listed" }, shoes], TAILORING_WITH_ONE_PIECES.pieces],
      // Beside the Top or the Bottom, rather than in place of both.
      [[hairstyle, onePiece, bottom, shoes], TAILORING_WITH_ONE_PIECES.pieces],
      [[hairstyle, top, onePiece, shoes], TAILORING_WITH_ONE_PIECES.pieces],
      [[hairstyle, top, bottom, onePiece, shoes], TAILORING_WITH_ONE_PIECES.pieces],
    ] as const) {
      gemini.respond = () => geminiJson({ pieces });

      expect(checkTailoredPieces(await ai.tailorPieces(TAILORING_WITH_ONE_PIECES), asked)).toBeNull();
    }
  });
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
    expect(text).toContain("Keep everything else exactly as it is:\n- the person's face and identity");
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

describe("switching Gemini on", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("runs the fake adapter unless AI_PROVIDER says gemini, even with GEMINI_API_KEY set", () => {
    vi.stubEnv("AI_PROVIDER", "");
    vi.stubEnv("GEMINI_API_KEY", "key-from-the-environment");

    expect(aiFromEnvironment()).toBeInstanceOf(FakeAiProvider);
  });

  it("runs Gemini when AI_PROVIDER says gemini, with GEMINI_API_KEY as its key", async () => {
    vi.stubEnv("AI_PROVIDER", "gemini");
    vi.stubEnv("GEMINI_API_KEY", "key-from-the-environment");
    vi.stubGlobal("fetch", gemini.fetch);
    gemini.respond = () => geminiJson(REPORT);

    const result = await aiFromEnvironment().checkPhoto(PHOTO_CHECK);

    expect(result).toEqual({ blocked: false, report: REPORT });
    expect(gemini.requests.map(({ headers }) => headers.get("x-goog-api-key"))).toEqual(["key-from-the-environment"]);
  });

  it("can't run Gemini without GEMINI_API_KEY", () => {
    vi.stubEnv("AI_PROVIDER", "gemini");
    vi.stubEnv("GEMINI_API_KEY", "");

    expect(() => aiFromEnvironment()).toThrow("GEMINI_API_KEY must be set when AI_PROVIDER is gemini.");
  });

  it("refuses an AI_PROVIDER it doesn't know", () => {
    vi.stubEnv("AI_PROVIDER", "openai");

    expect(() => aiFromEnvironment()).toThrow("AI_PROVIDER must be one of: fake, gemini.");
  });
});
