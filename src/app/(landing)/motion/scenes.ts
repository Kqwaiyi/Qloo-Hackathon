import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import Lenis from "lenis";

import { ImageSequence } from "./image-sequence";

// Each scene finds its chapter by data attributes and sets up its own motion. They all run inside
// one gsap.matchMedia context (see landing-motion.tsx), so their tweens, ScrollTriggers and text
// splits are reverted together; a scene returns a cleanup for anything else it set up.

type Cleanup = () => void;

const COLORS = { paper: "#f8f8f8", ink: "#080808" } as const;
type Ground = keyof typeof COLORS;

function all<T extends Element = HTMLElement>(root: ParentNode, selector: string): T[] {
  return [...root.querySelectorAll<T>(selector)];
}

function groundOf(element: HTMLElement): Ground {
  return element.dataset.ground === "ink" ? "ink" : "paper";
}

/** Smooth, inertial scrolling, driven by GSAP's ticker so ScrollTrigger and Lenis stay in step. */
export function startSmoothScroll(): { lenis: Lenis; stop: Cleanup } {
  const lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 1 });
  lenis.on("scroll", ScrollTrigger.update);
  const tick = (time: number) => lenis.raf(time * 1000);
  gsap.ticker.add(tick);
  gsap.ticker.lagSmoothing(0);
  // Pins add spacers that lengthen the page; Lenis must re-measure or it stops short of the end.
  const remeasure = () => lenis.resize();
  ScrollTrigger.addEventListener("refresh", remeasure);
  return {
    lenis,
    stop: () => {
      ScrollTrigger.removeEventListener("refresh", remeasure);
      gsap.ticker.remove(tick);
      gsap.ticker.lagSmoothing(500, 33);
      lenis.destroy();
    },
  };
}

/** In-page links glide to their target instead of jumping. */
export function setupAnchors(root: HTMLElement, lenis: Lenis | null): Cleanup {
  const onClick = (event: MouseEvent) => {
    const link = (event.target as Element | null)?.closest<HTMLAnchorElement>("a[data-scroll-to]");
    const target = link && document.getElementById(link.hash.slice(1));
    if (!target) return;
    event.preventDefault();
    if (lenis) {
      lenis.resize();
      lenis.scrollTo(target, { duration: 1.8, force: true });
    }
    else target.scrollIntoView({ behavior: "smooth" });
  };
  root.addEventListener("click", onClick);
  return () => root.removeEventListener("click", onClick);
}

/**
 * The first-visit loader's exit: the CSS has already risen the wordmark and filled the hairline;
 * this lifts the whole thing away like a curtain once a beat has passed. Returns how long the hero
 * should wait before its own entrance.
 */
export function setupLoader(root: HTMLElement, lenis: Lenis | null): { heroDelay: number; cleanup: Cleanup } {
  const loader = root.querySelector<HTMLElement>("[data-loader]");
  const switchedOn = document.head.querySelector("style[data-landing-loader]");
  if (!loader || !switchedOn) return { heroDelay: 0.1, cleanup: () => undefined };
  const wait = Math.max(0, 1.15 - performance.now() / 1000);
  lenis?.stop();
  gsap.to(loader, {
    clipPath: "inset(0% 0% 100% 0%)",
    duration: 0.8,
    delay: wait,
    ease: "curtain",
    onComplete: () => {
      switchedOn.remove();
      lenis?.start();
    },
  });
  return {
    heroDelay: wait + 0.45,
    cleanup: () => {
      switchedOn.remove();
      lenis?.start();
    },
  };
}

/**
 * Text and media entrances, each once: headlines rise line by line out of a mask, short texts and
 * media come into focus from a blur, and lists rise item by item. The hero waits for the loader.
 */
export function setupReveals(root: HTMLElement, heroDelay: number): void {
  const delayFor = (element: Element) => (element.closest("[data-hero]") ? heroDelay : 0);
  for (const element of all(root, '[data-reveal="rise"]')) {
    // aria "none": the text splits only at line and word breaks, so it still reads in order; the
    // default would hang aria-labels on spans, which browsers leave out of a heading's name.
    SplitText.create(element, {
      type: "lines",
      mask: "lines",
      aria: "none",
      autoSplit: true,
      onSplit: (split) =>
        gsap.from(split.lines, {
          yPercent: 110,
          duration: 1,
          ease: "glide",
          stagger: 0.07,
          delay: delayFor(element),
          scrollTrigger: { trigger: element, start: "top 92%", once: true },
        }),
    });
  }
  for (const element of all(root, '[data-reveal="blur"]')) {
    gsap.from(element, {
      autoAlpha: 0,
      filter: "blur(16px)",
      y: 16,
      duration: 1.2,
      ease: "glide",
      delay: delayFor(element),
      clearProps: "filter,transform",
      scrollTrigger: { trigger: element, start: "top 94%", once: true },
    });
  }
  for (const element of all(root, '[data-reveal="stagger"]')) {
    gsap.from(element.children, {
      autoAlpha: 0,
      y: 24,
      duration: 0.9,
      ease: "glide",
      stagger: 0.09,
      scrollTrigger: { trigger: element, start: "top 90%", once: true },
    });
  }
}

/** A statement fills word by word, from faint to full, as it scrolls through; its label stays grey. */
export function setupFills(root: HTMLElement): void {
  for (const element of all(root, "[data-fill]")) {
    const ink = element.dataset.fill !== "ink";
    const hold = element.querySelector("[data-fill-hold]");
    SplitText.create(element, {
      type: "words",
      aria: "none",
      onSplit: (split) =>
        gsap.fromTo(
          split.words.filter((word) => !hold?.contains(word)),
          { color: ink ? "rgb(8 8 8 / 0.16)" : "rgb(248 248 248 / 0.18)" },
          {
            color: ink ? COLORS.ink : COLORS.paper,
            ease: "none",
            stagger: 0.1,
            scrollTrigger: { trigger: element, start: "top 85%", end: "bottom 30%", scrub: 0.6 },
          },
        ),
    });
  }
}

/** The fixed ground shifts between paper and ink across each boundary, never cutting. */
export function setupGround(root: HTMLElement): void {
  const layer = root.querySelector<HTMLElement>("[data-ground-layer]");
  const sections = all(root, "[data-ground]");
  const first = sections[0];
  if (!layer || !first) return;
  gsap.set(layer, { backgroundColor: COLORS[groundOf(first)] });
  sections.forEach((section, index) => {
    const previous = sections[index - 1];
    if (!previous || groundOf(previous) === groundOf(section)) return;
    gsap.fromTo(
      layer,
      { backgroundColor: COLORS[groundOf(previous)] },
      {
        backgroundColor: COLORS[groundOf(section)],
        ease: "none",
        immediateRender: false,
        scrollTrigger: { trigger: section, start: "top 90%", end: "top 30%", scrub: true },
      },
    );
  });
}

/** A chapter that pins and dims while the next one slides up over it. */
export function setupCovers(root: HTMLElement): void {
  for (const section of all(root, "[data-cover]")) {
    const next = section.nextElementSibling;
    if (!(next instanceof HTMLElement)) continue;
    ScrollTrigger.create({
      trigger: section,
      start: () => (section.offsetHeight > window.innerHeight ? "bottom bottom" : "top top"),
      endTrigger: next,
      end: "top top",
      pin: true,
      pinSpacing: false,
    });
    const covering = gsap.timeline({ scrollTrigger: { trigger: next, start: "top bottom", end: "top top", scrub: true } });
    const dim = section.querySelector("[data-dim]");
    const inner = section.querySelector("[data-cover-inner]");
    if (dim) covering.to(dim, { opacity: 0.6, ease: "none" }, 0);
    if (inner) covering.to(inner, { scale: 0.94, transformOrigin: "50% 100%", ease: "none" }, 0);
  }
}

/** Anchors are each Category's point on the Figure, for every desktop frame: [x, y, visible], 0–1 from the top left. */
interface FigureAnchors {
  frames: number;
  anchors: Record<string, [number, number, number][]>;
}

const LIT = { pill: ["bg-ink", "text-paper"], dot: ["bg-ink"] };
const GHOST = { pill: ["bg-paper/70", "text-ink/40", "ring-1", "ring-ink/15"], dot: ["bg-ink/25"] };

/**
 * What will your photo show? The chapter pins while the Figure makes one full turn. Each third of
 * the turn is one Photo Type: its words rise in, the hotspots for the Categories it unlocks light
 * up, and a dashed crop frames what that photo would show.
 */
export function setupPhotoTypes(root: HTMLElement, wide: boolean): Cleanup | undefined {
  const section = root.querySelector<HTMLElement>('[data-scene="photo-types"]');
  const pin = section?.querySelector<HTMLElement>("[data-pin]");
  const canvas = section?.querySelector<HTMLCanvasElement>("canvas[data-sequence]");
  if (!section || !pin || !canvas) return;
  const desktopFrames = Number(canvas.dataset.sequenceFrames);
  const sequence = wide
    ? { base: canvas.dataset.sequence ?? "", count: desktopFrames }
    : { base: canvas.dataset.sequenceMobile ?? "", count: Number(canvas.dataset.sequenceMobileFrames) };
  const stride = Math.round(desktopFrames / sequence.count);
  const player = new ImageSequence(canvas, sequence);
  const states = all(section, "[data-state]");
  const hotspots = all(section, "[data-hotspot]");
  const crop = section.querySelector<HTMLElement>("[data-crop]");
  let anchors: FigureAnchors | null = null;
  let frame = 0;
  let state = -1;

  const place = () => {
    for (const hotspot of hotspots) {
      const point = anchors?.anchors[hotspot.dataset.hotspot ?? ""]?.[frame * stride];
      if (!point) {
        hotspot.style.opacity = "0";
        continue;
      }
      hotspot.style.left = `${point[0] * 100}%`;
      hotspot.style.top = `${point[1] * 100}%`;
      hotspot.style.opacity = point[2] ? "" : "0";
    }
  };

  /** The dashed frame for a Photo Type, from where the Figure's anchors sit when it faces forward. */
  const cropFor = (photoType: string) => {
    const at = (name: string) => anchors?.anchors[name]?.[0];
    const hair = at("hairstyle");
    const chest = at("top");
    const feet = at("shoes");
    if (!hair || !chest || !feet) return null;
    const clamp = (value: number) => Math.min(0.99, Math.max(0.01, value));
    const [top, bottom, centre] =
      photoType === "face"
        ? [hair[1] - 0.05, chest[1] - 0.02, hair[0]]
        : photoType === "body_only"
          ? [chest[1] - 0.09, feet[1] + 0.04, (chest[0] + feet[0]) / 2]
          : [hair[1] - 0.04, feet[1] + 0.04, (hair[0] + feet[0]) / 2];
    const height = clamp(bottom) - clamp(top);
    // A 4:5 crop in a 4:5 frame is as wide as it is tall, in the frame's own 0–1 units.
    const width = Math.min(0.98, height);
    const left = Math.min(0.99 - width, Math.max(0.01, centre - width / 2));
    return { left: `${left * 100}%`, top: `${clamp(top) * 100}%`, width: `${width * 100}%`, height: `${height * 100}%` };
  };

  const show = (next: number, instant = false) => {
    const previous = states[state];
    const current = states[next];
    if (!current) return;
    // A quick scroll can change state while the last change is still easing. Its tweens go first,
    // or one still fading a state in brings it back over the one now showing.
    gsap.killTweensOf(states);
    for (const other of states) {
      if (other === current) continue;
      if (other === previous && !instant) gsap.to(other, { autoAlpha: 0, y: -12, duration: 0.45, ease: "glide" });
      else gsap.set(other, { autoAlpha: 0 });
    }
    gsap.fromTo(current, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: instant ? 0 : 0.8, delay: instant ? 0 : 0.1, ease: "glide" });
    const unlocks = (current.dataset.unlocks ?? "").split(" ");
    for (const hotspot of hotspots) {
      const looks = unlocks.includes(hotspot.dataset.hotspot ?? "") ? LIT : GHOST;
      const other = looks === LIT ? GHOST : LIT;
      for (const part of ["pill", "dot"] as const) {
        const element = hotspot.querySelector(`[data-hotspot-${part}]`);
        element?.classList.remove(...other[part]);
        element?.classList.add(...looks[part]);
      }
    }
    const frameFor = cropFor(current.dataset.state ?? "");
    if (crop && frameFor) gsap.to(crop, { ...frameFor, autoAlpha: 1, duration: instant ? 0 : 0.9, ease: "sweep", overwrite: true });
    state = next;
  };

  gsap.set(states, { autoAlpha: 0 });
  if (crop) gsap.set(crop, { autoAlpha: 0 });
  show(0, true);
  player.draw(0);
  place();

  let disposed = false;
  fetch("/landing/figure/anchors.json")
    .then((response) => (response.ok ? (response.json() as Promise<FigureAnchors>) : null))
    .then((json) => {
      if (disposed || !json) return;
      anchors = json;
      place();
      show(Math.max(0, state), true);
    })
    .catch(() => undefined);

  ScrollTrigger.create({ trigger: section, start: "top bottom+=100%", once: true, onEnter: () => player.load() });
  ScrollTrigger.create({
    trigger: section,
    start: "top top",
    end: () => `+=${window.innerHeight * (wide ? 2.4 : 1.8)}`,
    pin,
    onUpdate: (self) => {
      const nextFrame = Math.round(self.progress * (sequence.count - 1));
      if (nextFrame !== frame) {
        frame = nextFrame;
        player.draw(frame);
        place();
      }
      const nextState = Math.min(states.length - 1, Math.floor(self.progress * states.length));
      if (nextState !== state) show(nextState);
    },
  });

  return () => {
    disposed = true;
    player.dispose();
    for (const hotspot of hotspots) {
      hotspot.removeAttribute("style");
      for (const part of ["pill", "dot"] as const) hotspot.querySelector(`[data-hotspot-${part}]`)?.classList.remove(...LIT[part], ...GHOST[part]);
    }
  };
}

/** Style Icons: on wide screens the row pins and the scroll carries it sideways. */
export function setupTrack(root: HTMLElement): void {
  const section = root.querySelector<HTMLElement>('[data-scene="track"]');
  const pin = section?.querySelector<HTMLElement>("[data-pin]");
  const track = section?.querySelector<HTMLElement>("[data-track]");
  if (!section || !pin || !track) return;
  const distance = () => Math.max(0, track.scrollWidth - document.documentElement.clientWidth);
  gsap.to(track, {
    x: () => -distance(),
    ease: "none",
    scrollTrigger: {
      trigger: section,
      start: "top top",
      end: () => `+=${Math.max(distance(), window.innerHeight * 0.6)}`,
      pin,
      scrub: true,
      invalidateOnRefresh: true,
    },
  });
}

/** Brands: the chapter pins and opens one Brand at a time while a hairline fills. */
export function setupAccordion(root: HTMLElement): void {
  const section = root.querySelector<HTMLElement>('[data-scene="accordion"]');
  const pin = section?.querySelector<HTMLElement>("[data-pin]");
  if (!section || !pin) return;
  const items = all(section, "[data-accordion-item]");
  const progress = section.querySelector("[data-progress]");
  let open = 0;
  items.forEach((item, index) => item.classList.toggle("is-open", index === 0));
  if (progress) gsap.set(progress, { scaleX: 0 });
  ScrollTrigger.create({
    trigger: section,
    start: "top top",
    end: () => `+=${window.innerHeight * 0.6 * Math.max(1, items.length)}`,
    pin,
    onUpdate: (self) => {
      if (progress) gsap.set(progress, { scaleX: self.progress });
      const next = Math.min(items.length - 1, Math.floor(self.progress * items.length));
      if (next === open) return;
      items[open]?.classList.remove("is-open");
      items[next]?.classList.add("is-open");
      open = next;
    },
  });
}

/** Careful with your photos: the cards rise into place one after another as the section scrolls in. */
export function setupCards(root: HTMLElement): void {
  for (const list of all(root, "[data-cards]")) {
    gsap.from(all(list, "[data-card]"), {
      yPercent: 35,
      autoAlpha: 0,
      ease: "none",
      stagger: 0.15,
      scrollTrigger: { trigger: list, start: "top 95%", end: "top 40%", scrub: true },
    });
  }
}

/**
 * The header slides away while the reader scrolls down and comes back as soon as they scroll up,
 * or once the last chapter fills half the screen, where it stays.
 */
export function setupHeader(root: HTMLElement): void {
  const parts = all(root, "[data-header]");
  const last = root.querySelector<HTMLElement>("[data-header-returns]");
  const lastChapter = last ? ScrollTrigger.create({ trigger: last, start: "top center" }) : null;
  ScrollTrigger.create({
    start: 0,
    end: "max",
    onUpdate: (self) => {
      const reachedLast = lastChapter !== null && self.scroll() >= lastChapter.start;
      const hide = self.direction === 1 && self.scroll() > 160 && !reachedLast;
      for (const part of parts) part.classList.toggle("is-hidden", hide);
    },
  });
}

/**
 * The rendered loops play only while they're on screen (or about to be) and the tab is visible;
 * the rest of the time they sit paused, or on their poster until first needed.
 */
export function setupLoops(root: HTMLElement): Cleanup {
  const videos = all<HTMLVideoElement>(root, "video[data-loop]");
  const near = new Set<HTMLVideoElement>();
  const update = (video: HTMLVideoElement) => {
    if (near.has(video) && video.offsetParent !== null && !document.hidden) video.play().catch(() => undefined);
    else video.pause();
  };
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const video = entry.target as HTMLVideoElement;
        if (entry.isIntersecting) near.add(video);
        else near.delete(video);
        update(video);
      }
    },
    { rootMargin: "50% 0px" },
  );
  for (const video of videos) observer.observe(video);
  const onVisibility = () => videos.forEach(update);
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    observer.disconnect();
    document.removeEventListener("visibilitychange", onVisibility);
    for (const video of videos) video.pause();
  };
}
