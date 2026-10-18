"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { CustomEase } from "gsap/CustomEase";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

import {
  setupAccordion,
  setupAnchors,
  setupCards,
  setupCovers,
  setupCylinder,
  setupFills,
  setupGround,
  setupHeader,
  setupIndicator,
  setupLoader,
  setupLoops,
  setupPhotoTypes,
  setupPreview,
  setupReveals,
  setupTrack,
  startSmoothScroll,
} from "./scenes";

gsap.registerPlugin(useGSAP, ScrollTrigger, SplitText, CustomEase);

// The page's three easings (globals.css has them as CSS variables too): a long, soft ease-out for
// every entrance, a symmetric ease for moves between states, and a curtain for the loader.
CustomEase.create("glide", "0.25,0.74,0.22,0.99");
CustomEase.create("sweep", "0.645,0.045,0.355,1");
CustomEase.create("curtain", "0.7,0,0.3,1");

/**
 * The landing page's motion layer, and its only client component besides the comparison slider.
 * The chapters are plain markup; this finds them by their data attributes and brings them to life,
 * but only for visitors who haven't asked for reduced motion. They get the static page as it is.
 * Smooth scrolling is for mouse and trackpad only: touch screens keep their own momentum. Pinned
 * tracks and the cylinder need a wide screen; phones get swipeable rows instead.
 */
export function LandingMotion() {
  useGSAP(() => {
    const root = document.querySelector<HTMLElement>(".landing");
    if (!root) return;
    const media = gsap.matchMedia();
    media.add(
      { motion: "(prefers-reduced-motion: no-preference)", wide: "(min-width: 768px)", fine: "(pointer: fine)" },
      (context) => {
        const { motion = false, wide = false, fine = false } = context.conditions ?? {};
        if (!motion) return;
        root.setAttribute("data-live", "");
        const smooth = fine ? startSmoothScroll() : null;
        const lenis = smooth?.lenis ?? null;
        const loader = setupLoader(root, lenis);
        const cleanups = [
          smooth?.stop,
          loader.cleanup,
          setupAnchors(root, lenis),
          setupLoops(root),
          setupPhotoTypes(root, wide),
          wide ? setupCylinder(root) : undefined,
        ];
        setupGround(root);
        setupCovers(root);
        setupReveals(root, loader.heroDelay);
        setupFills(root);
        if (wide) setupTrack(root);
        setupAccordion(root);
        setupPreview(root);
        setupCards(root);
        setupHeader(root);
        setupIndicator(root);
        ScrollTrigger.sort();
        ScrollTrigger.refresh();
        // Line breaks move once the web font arrives, and pins measure from them.
        void document.fonts?.ready.then(() => ScrollTrigger.refresh());
        return () => {
          for (const cleanup of cleanups) cleanup?.();
          root.removeAttribute("data-live");
        };
      },
    );
    return () => media.revert();
  });
  return null;
}
