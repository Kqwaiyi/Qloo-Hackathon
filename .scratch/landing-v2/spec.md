# Landing v2: the walkthrough, retold as a cinematic scroll

The landing page keeps its story (one frozen sample Consultation, told step by step and tagged You, AI or Qloo) and retells it in seven numbered chapters with premium motion, in black and white, in the style of icomat.co.uk and aircenter.space. The full plan and the style guide drawn from the two reference sites live in `landingpagev2/docs/` (`landingv2plan.md`, `style_guide.md`), a folder kept out of git with its reference captures.

## Rules that don't change

- The page never calls Qloo or the AI: it shows the frozen samples, whose images ship with it under `public/landing/samples/`.
- AI chapters say "AI". Gemini is named once, in the call to action. The page has no footer.
- Style Icons by rank and name, never photos. Every sample person is captioned, every Preview badged "AI-generated".
- Photos are edited, never analysed (ADR-0005): the photo check is shown as plain ticks, never a scan.
- Placeholders are designed: until tickets 05 and 39 capture the real samples, image slots show the page's rendered Figure with "Sample photo to come" / "Sample Preview to come".
- Every number on the page comes from the config (`OUTFIT_ALLOWANCE`, `OUTFITS_PER_STYLING`, `CATEGORIES`), every claim from the code or the Privacy Policy.
- Reduced motion gets a complete static page: no smooth scroll, pins, scrubbing, loops or loader.

## Design

- One typeface, Onest (landing page only), at four sizes: display, title, body, label (`@theme` tokens in `globals.css`).
- Paper `#F8F8F8`, ink `#080808`, greys `#6B6B6B` (on paper) and `#9A9A9A` (on ink), both AA.
- Motion: GSAP 3.15 (ScrollTrigger, SplitText, CustomEase) and Lenis 1.3, from one client component (`src/app/(landing)/motion/landing-motion.tsx`). The chapters are server-rendered markup that reads fine without it.
- 3D: a faceless mannequin (the Figure) and a satin ribbon (the Drape), built in Blender and pre-rendered to WebP turntables and MP4/WebM loops in `public/landing/`. No WebGL at runtime. Hotspots follow the Figure from per-frame anchor positions exported from Blender (`public/landing/figure/anchors.json`).

## Chapters

Hero (centred headline over the light Drape) · How it works (word fill) · What will your photo show? (pinned Figure turntable, hotspots per Photo Type) · the photo check · Style Icons (pinned sideways track) · the Brands (pinned accordion) · the Pieces · ready to shop (comparison slider, Budget Tier) · Careful with your photos · Get started, the last screen: nothing comes after it.

Chapters are unnumbered and carry no You / AI / Qloo tags.
