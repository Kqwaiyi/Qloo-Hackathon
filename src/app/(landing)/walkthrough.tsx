"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

import { type Who, WhoTag } from "./who-tag";

export interface WalkthroughStep {
  who: Who;
  title: string;
  body: ReactNode;
  /** The step's picture. */
  visual: ReactNode;
}

/**
 * The sample Consultation, step by step as the visitor scrolls. On wide screens the picture sticks
 * beside the steps and changes to the step crossing the middle of the screen; on phones each
 * step's picture sits above its text.
 */
export function Walkthrough({ steps }: { steps: WalkthroughStep[] }) {
  const [active, setActive] = useState(0);
  const stepElements = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(Number((entry.target as HTMLElement).dataset.step));
        }
      },
      // A band across the middle of the screen.
      { rootMargin: "-45% 0px -45% 0px" },
    );
    for (const element of stepElements.current) if (element) observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="grid gap-x-12 md:grid-cols-2">
      <div className="hidden md:block">
        <div className="sticky top-0 flex min-h-screen items-center justify-center py-10">
          <div key={active} className="w-full motion-safe:animate-fade-in">
            {steps[active]?.visual}
          </div>
        </div>
      </div>
      {/* Room after the last step, so a picture taller than the screen, such as the Outfit card,
          stays pinned with its top in view while its step is read, then scrolls on. */}
      <ol className="md:pb-[50vh]">
        {steps.map((step, index) => (
          <li
            key={step.title}
            ref={(element) => {
              stepElements.current[index] = element;
            }}
            data-step={index}
            className="flex flex-col justify-center py-10 md:min-h-[85vh]"
          >
            <div className="mb-6 md:hidden">{step.visual}</div>
            <div className={`transition-opacity duration-300 ${index === active ? "" : "md:opacity-30"}`}>
              <div className="flex items-center gap-3">
                <span className="text-sm text-stone-400 tabular-nums">{String(index + 1).padStart(2, "0")}</span>
                <WhoTag who={step.who} />
              </div>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">{step.title}</h2>
              <div className="mt-3 max-w-md text-lg leading-relaxed text-stone-600">{step.body}</div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
