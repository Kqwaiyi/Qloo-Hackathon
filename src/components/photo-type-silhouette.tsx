import type { PhotoType } from "@/config/consultations";

// One plain figure, framed the way each Photo Type should be: an example that shows no
// real-looking person. The camera outlines (ticket 08) use the same framing.

/** The part of the 300 × 400 figure each Photo Type shows, all 4:5. */
const FRAMES: Record<PhotoType, string> = {
  face: "90 14 120 150",
  full_body: "2 10 296 370",
  body_only: "36 86 228 285",
};

export function PhotoTypeSilhouette({ photoType, className }: { photoType: PhotoType; className?: string }) {
  return (
    <svg viewBox={FRAMES[photoType]} preserveAspectRatio="xMidYMid slice" aria-hidden="true" className={className}>
      <g fill="currentColor">
        <ellipse cx="150" cy="52" rx="21" ry="26" />
        <rect x="141" y="72" width="18" height="22" />
        <path d="M110 94 Q150 84 190 94 L196 206 L104 206 Z" />
        <path d="M110 96 L92 194 Q96 202 104 198 L120 128 Z" />
        <path d="M190 96 L208 194 Q204 202 196 198 L180 128 Z" />
        <path d="M104 202 L196 202 L190 352 L158 352 L150 246 L142 352 L110 352 Z" />
        <rect x="104" y="348" width="42" height="16" rx="8" />
        <rect x="154" y="348" width="42" height="16" rx="8" />
      </g>
    </svg>
  );
}
