"use client";

import { type RefObject, useEffect, useRef, useState } from "react";

import { PhotoTypeOutline } from "@/components/photo-type-silhouette";
import type { PhotoType } from "@/config/consultations";

import { type Crop, redrawAsJpeg } from "./shrink-photo";

/** Why the camera can't be used. */
type CameraTrouble = "unsupported" | "blocked" | "missing" | "failed";

type CameraState =
  | { status: "off" }
  | { status: "starting" }
  | { status: "live"; mirrored: boolean }
  | { status: "unavailable"; trouble: CameraTrouble };

const TROUBLE_MESSAGES: Record<CameraTrouble, string> = {
  unsupported: "This browser can't use a camera here.",
  blocked: "Camera access is blocked. Allow it in your browser's site settings and try again.",
  missing: "We couldn't find a camera.",
  failed: "We couldn't start your camera. It may be in use by another app.",
};

// The front camera at the best resolution near 1920 px either way round, so a phone held upright
// asks for the same as a laptop. The redraw then shrinks it like an upload.
const CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: { facingMode: "user", width: { ideal: 1920 }, height: { ideal: 1920 } },
};

export interface Camera {
  videoRef: RefObject<HTMLVideoElement | null>;
  state: CameraState;
  retry: () => void;
  /** The frame as the user framed it, redrawn like an upload. Null if the camera isn't live. */
  capture: () => Promise<Blob | null>;
}

/**
 * Runs the camera into `videoRef` while `on`. When `on` turns false the camera stops, so its light
 * goes off while the user looks at the photo or uploads instead.
 */
export function useCamera(on: boolean): Camera {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<CameraState>({ status: "off" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const video = videoRef.current;
    if (!on || !video) return;
    let stopped = false;
    let stream: MediaStream | undefined;
    const fail = (trouble: CameraTrouble) => {
      if (!stopped) setState({ status: "unavailable", trouble });
    };
    // Older browsers, and pages not served over HTTPS.
    if (!navigator.mediaDevices?.getUserMedia) return fail("unsupported");
    setState({ status: "starting" });
    navigator.mediaDevices.getUserMedia(CONSTRAINTS).then(
      async (started) => {
        if (stopped) return stopTracks(started);
        stream = started;
        const [track] = started.getVideoTracks();
        // Unplugged, or access taken back while in use.
        track?.addEventListener("ended", () => fail("failed"));
        video.srcObject = started;
        try {
          await video.play();
        } catch {
          return fail("failed");
        }
        // The view is mirrored, like a mirror, unless the browser could only give us a camera
        // facing away. The photo taken never is.
        if (!stopped) setState({ status: "live", mirrored: track?.getSettings().facingMode !== "environment" });
      },
      (error: unknown) => fail(troubleOf(error)),
    );
    return () => {
      stopped = true;
      if (stream) stopTracks(stream);
      video.srcObject = null;
      setState({ status: "off" });
    };
  }, [on, attempt]);

  return {
    videoRef,
    state,
    retry: () => setAttempt((count) => count + 1),
    capture: async () => {
      const video = videoRef.current;
      if (!video || state.status !== "live") return null;
      return takeFrame(video);
    },
  };
}

/**
 * The camera's current frame, cropped to the video's on-screen box the way `object-cover` crops
 * it, so what was inside the outline is what's sent. Not mirrored: like an upload, the photo shows
 * the user as others see them, so writing on their clothes reads the right way round.
 */
async function takeFrame(video: HTMLVideoElement): Promise<Blob | null> {
  const { videoWidth: width, videoHeight: height, clientWidth, clientHeight } = video;
  if (!width || !height) return null;
  const crop =
    clientWidth && clientHeight ? centerCrop(width, height, clientWidth / clientHeight) : { x: 0, y: 0, width, height };
  try {
    return await redrawAsJpeg(video, crop);
  } catch {
    return null;
  }
}

/** The largest centred part of a `width` × `height` picture with the given width-to-height ratio. */
function centerCrop(width: number, height: number, ratio: number): Crop {
  if (width / height > ratio) {
    const cropWidth = height * ratio;
    return { x: (width - cropWidth) / 2, y: 0, width: cropWidth, height };
  }
  const cropHeight = width / ratio;
  return { x: 0, y: (height - cropHeight) / 2, width, height: cropHeight };
}

function stopTracks(stream: MediaStream) {
  for (const track of stream.getTracks()) track.stop();
}

function troubleOf(error: unknown): CameraTrouble {
  const name = typeof error === "object" && error && "name" in error ? error.name : undefined;
  if (name === "NotAllowedError" || name === "SecurityError") return "blocked";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "missing";
  return "failed";
}

/**
 * The live camera with the chosen Photo Type's outline over it. It fills its box, and a photo
 * taken is cropped to that box, so what's inside the frame is what's sent.
 */
export function CameraView({
  camera,
  photoType,
  onUpload,
}: {
  camera: Camera;
  photoType: PhotoType;
  /** "Upload a photo instead", for when the camera can't be used. */
  onUpload: () => void;
}) {
  const { state } = camera;
  const live = state.status === "live";
  return (
    <div className="relative h-full w-full overflow-hidden bg-ink text-paper/85">
      <video
        ref={camera.videoRef}
        autoPlay
        muted
        playsInline
        aria-label="Your camera"
        className={`absolute inset-0 h-full w-full object-cover ${live ? "" : "invisible"} ${live && state.mirrored ? "-scale-x-100" : ""}`}
      />
      {live && <PhotoTypeOutline photoType={photoType} className="absolute inset-0 h-full w-full" />}
      <div role="status" className="absolute inset-0 flex flex-col items-center justify-center gap-5 p-6 text-center text-sm text-balance empty:hidden">
        {state.status === "starting" && <p>Starting your camera… Allow access if your browser asks.</p>}
        {state.status === "unavailable" && (
          <>
            <p>{TROUBLE_MESSAGES[state.trouble]}</p>
            <div className="flex flex-wrap justify-center gap-2">
              {state.trouble !== "unsupported" && (
                <button
                  type="button"
                  onClick={camera.retry}
                  className="inline-flex h-10 items-center rounded-full px-5 font-medium ring-1 ring-paper/30 ring-inset outline-offset-2 hover:ring-paper/60 focus-visible:outline-2 focus-visible:outline-paper"
                >
                  Try again
                </button>
              )}
              <button
                type="button"
                onClick={onUpload}
                className="inline-flex h-10 items-center rounded-full bg-paper px-5 font-medium text-ink outline-offset-2 hover:bg-paper/85 focus-visible:outline-2 focus-visible:outline-paper"
              >
                Upload a photo instead
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
