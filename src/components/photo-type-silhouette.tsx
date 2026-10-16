import { type SVGAttributes, useId } from "react";

import type { PhotoType } from "@/config/consultations";
import { COPY } from "@/config/copy";

// One plain figure, framed the way each Photo Type should be: an example that shows no
// real-looking person. The camera traces the same figure, in the same frame, as its outline.

/** The part of the 300 × 400 figure each Photo Type shows, all 4:5. */
const FRAMES: Record<PhotoType, string> = {
  face: "90 14 120 150",
  full_body: "2 10 296 370",
  body_only: "36 86 228 285",
};

/** Where a Body-Only Photo's face guide crosses the figure: the top of the shoulders. */
const FACE_GUIDE_Y = 90;

/** The figure's shapes, each painted with `paint`. They overlap, so only their union reads as the figure. */
function Figure(paint: SVGAttributes<SVGElement>) {
  return (
    <>
      <ellipse {...paint} cx="150" cy="52" rx="21" ry="26" />
      <rect {...paint} x="141" y="72" width="18" height="22" />
      <path {...paint} d="M110 94 Q150 84 190 94 L196 206 L104 206 Z" />
      <path {...paint} d="M110 96 L92 194 Q96 202 104 198 L120 128 Z" />
      <path {...paint} d="M190 96 L208 194 Q204 202 196 198 L180 128 Z" />
      <path {...paint} d="M104 202 L196 202 L190 352 L158 352 L150 246 L142 352 L110 352 Z" />
      <rect {...paint} x="104" y="348" width="42" height="16" rx="8" />
      <rect {...paint} x="154" y="348" width="42" height="16" rx="8" />
    </>
  );
}

export function PhotoTypeSilhouette({ photoType, className }: { photoType: PhotoType; className?: string }) {
  return (
    <svg viewBox={FRAMES[photoType]} preserveAspectRatio="xMidYMid slice" aria-hidden="true" className={className}>
      <g fill="currentColor">
        <Figure />
      </g>
    </svg>
  );
}

/**
 * The silhouette as a dashed outline, for laying over the camera. A Body-Only Photo adds a
 * "keep your face above this line" guide.
 */
export function PhotoTypeOutline({ photoType, className }: { photoType: PhotoType; className?: string }) {
  const maskId = `${useId().replace(/[^\w-]/g, "")}-figure`;
  return (
    <svg
      viewBox={FRAMES[photoType]}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      className={`pointer-events-none drop-shadow-[0_0_2px_rgb(0_0_0/0.6)] ${className ?? ""}`}
    >
      <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="300" height="400">
        <rect width="300" height="400" fill="white" />
        <Figure fill="black" />
      </mask>
      {/* Every shape's edge is stroked, then the figure is masked out, so only the outer half of
          the figure's own edge shows: no lines where the shapes overlap. */}
      <g mask={`url(#${maskId})`}>
        <Figure fill="none" stroke="white" strokeWidth={6} strokeDasharray="12 8" vectorEffect="non-scaling-stroke" />
      </g>
      {photoType === "body_only" && (
        <g fill="#fbbf24" stroke="#fbbf24">
          <line x1="0" x2="300" y1={FACE_GUIDE_Y} y2={FACE_GUIDE_Y} strokeWidth={2} vectorEffect="non-scaling-stroke" />
          {/* Two short lines, to fit between the shoulders' edges. */}
          <text x="150" y={FACE_GUIDE_Y + 13} textAnchor="middle" stroke="none" fontSize="8" fontWeight="600">
            {inTwoLines(COPY.faceGuide).map((line, index) => (
              <tspan key={line} x="150" dy={index ? 10 : 0}>
                {line}
              </tspan>
            ))}
          </text>
        </g>
      )}
    </svg>
  );
}

/** `text` broken at its middle word. */
function inTwoLines(text: string): [string, string] {
  const words = text.split(" ");
  const half = Math.ceil(words.length / 2);
  return [words.slice(0, half).join(" "), words.slice(half).join(" ")];
}
