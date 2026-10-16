"use client";

import { useRouter } from "next/navigation";
import { type ChangeEvent, useEffect, useRef, useState, useTransition } from "react";

import { PhotoTypeSilhouette } from "@/components/photo-type-silhouette";
import { fieldError, primaryButton, secondaryButton } from "@/components/ui";
import {
  CATEGORY_LABELS,
  DEFAULT_PHOTO_TYPE,
  PHOTO_TYPE_CATEGORIES,
  PHOTO_TYPE_HINTS,
  PHOTO_TYPE_LABELS,
  PHOTO_TYPES,
  type PhotoType,
} from "@/config/consultations";
import { COPY } from "@/config/copy";
import { consultationRoute, ROUTES } from "@/config/routes";
import type { PhotoRejection } from "@/server/consultations/photo-check";

import { Stepper } from "../stepper";
import { startConsultationAction } from "./actions";
import { shrinkPhoto } from "./shrink-photo";

/** A photo the browser has shrunk, ready to send, with a link to show it on the page. */
interface ChosenPhoto {
  blob: Blob;
  url: string;
}

export function NewConsultation() {
  const [step, setStep] = useState<"photo-type" | "photo">("photo-type");
  const [photoType, setPhotoType] = useState<PhotoType>(DEFAULT_PHOTO_TYPE);
  // Kept here so going Back and on again keeps the photo.
  const [photo, setPhoto] = useState<ChosenPhoto | null>(null);

  useEffect(() => {
    if (!photo) return;
    return () => URL.revokeObjectURL(photo.url);
  }, [photo]);

  return (
    <>
      <Stepper current={step === "photo-type" ? 1 : 2} />
      {step === "photo-type" ? (
        <PhotoTypeStep photoType={photoType} onChange={setPhotoType} onContinue={() => setStep("photo")} />
      ) : (
        <PhotoStep
          photoType={photoType}
          onPhotoTypeChange={setPhotoType}
          photo={photo}
          onPhotoChange={setPhoto}
          onBack={() => setStep("photo-type")}
        />
      )}
    </>
  );
}

function PhotoTypeStep({
  photoType,
  onChange,
  onContinue,
}: {
  photoType: PhotoType;
  onChange: (photoType: PhotoType) => void;
  onContinue: () => void;
}) {
  return (
    <section aria-labelledby="photo-type-heading">
      <h2 id="photo-type-heading" className="text-xl font-semibold tracking-tight">
        What will your photo show?
      </h2>
      <p className="mt-1 text-stone-600">This decides which parts of an Outfit we can recommend.</p>
      <fieldset className="mt-6 space-y-3">
        <legend className="sr-only">Photo Type</legend>
        {PHOTO_TYPES.map((type) => (
          <label
            key={type}
            className="flex cursor-pointer items-center gap-4 rounded-xl border-2 border-stone-200 bg-white p-4 hover:border-stone-300 has-[:checked]:border-stone-900 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-stone-900 has-[:focus-visible]:ring-offset-2"
          >
            <input
              type="radio"
              name="photoType"
              value={type}
              checked={photoType === type}
              onChange={() => onChange(type)}
              className="peer sr-only"
            />
            <PhotoTypeSilhouette photoType={type} className="h-20 w-16 shrink-0 rounded-lg bg-stone-100 text-stone-400" />
            <span className="flex-1">
              <span className="block font-semibold">{PHOTO_TYPE_LABELS[type]}</span>
              <span className="block text-sm text-stone-600">{PHOTO_TYPE_HINTS[type]}</span>
              <span className="mt-2 flex flex-wrap gap-1">
                <span className="sr-only">Unlocks:</span>
                {PHOTO_TYPE_CATEGORIES[type].map((category) => (
                  <span key={category} className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600">
                    {CATEGORY_LABELS[category]}
                  </span>
                ))}
              </span>
            </span>
            <span
              aria-hidden="true"
              className="h-5 w-5 shrink-0 rounded-full border-2 border-stone-300 peer-checked:border-[6px] peer-checked:border-stone-900"
            />
          </label>
        ))}
      </fieldset>
      <div className="mt-8 flex justify-end">
        <button type="button" onClick={onContinue} className={primaryButton}>
          Continue
        </button>
      </div>
    </section>
  );
}

/** What the photo step shows when something is wrong with the photo. */
interface Problem {
  message: string;
  /** A second line, such as the content rules. */
  detail?: string;
  /** The Photo Type the photo looks like, offered as a one-tap switch. */
  switchTo?: PhotoType;
}

function rejectionProblem(rejection: PhotoRejection): Problem {
  switch (rejection.reason) {
    case "wrong-photo-type":
      return { message: COPY.photoLooksLike(PHOTO_TYPE_LABELS[rejection.looksLike]), switchTo: rejection.looksLike };
    case "no-person":
      return { message: COPY.photoNoPerson };
    case "more-than-one-person":
      return { message: COPY.photoMoreThanOnePerson };
    case "too-unclear":
      return { message: COPY.photoTooUnclear };
    case "not-appropriate":
      return { message: COPY.photoNotAppropriate, detail: COPY.contentRules };
    case "hair-not-visible":
      return { message: COPY.photoHairNotVisible };
  }
}

function PhotoStep({
  photoType,
  onPhotoTypeChange,
  photo,
  onPhotoChange,
  onBack,
}: {
  photoType: PhotoType;
  onPhotoTypeChange: (photoType: PhotoType) => void;
  photo: ChosenPhoto | null;
  onPhotoChange: (photo: ChosenPhoto | null) => void;
  onBack: () => void;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [opening, setOpening] = useState(false);
  const [sending, startSending] = useTransition();

  async function pick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Lets the same file be picked again after a problem.
    event.target.value = "";
    if (!file) return;
    setProblem(null);
    setOpening(true);
    const result = await shrinkPhoto(file);
    setOpening(false);
    if (result.ok) {
      onPhotoChange({ blob: result.photo, url: URL.createObjectURL(result.photo) });
    } else {
      onPhotoChange(null);
      setProblem({ message: result.problem === "too-large" ? COPY.photoTooLarge : COPY.photoUnreadable });
    }
  }

  /** "Get my Outfits": sends the photo as `type`, which is the chosen Photo Type unless switching. */
  function getOutfits(type: PhotoType) {
    if (!photo) return;
    setProblem(null);
    startSending(async () => {
      const form = new FormData();
      form.set("photoType", type);
      form.set("photo", new File([photo.blob], "photo.jpg", { type: "image/jpeg" }));
      let result;
      try {
        result = await startConsultationAction(form);
      } catch {
        // The request itself failed: the network, or our side.
        setProblem({ message: COPY.photoCheckFailed });
        return;
      }
      if (result.ok) startSending(() => router.push(consultationRoute(result.consultationId)));
      else if (result.refusal === "signed-out") startSending(() => router.push(ROUTES.signIn));
      else if (result.refusal === "photo-rejected") setProblem(rejectionProblem(result.rejection));
      else if (result.refusal === "check-errored") setProblem({ message: COPY.photoCheckFailed });
      else setProblem({ message: COPY.photoUnusable });
    });
  }

  /** "Use it as a <Photo Type>": switches the Photo Type and sends the same photo again, as a fresh check. */
  function switchPhotoType(type: PhotoType) {
    onPhotoTypeChange(type);
    getOutfits(type);
  }

  const label = PHOTO_TYPE_LABELS[photoType];
  const switchTo = problem?.switchTo;

  return (
    <section aria-labelledby="photo-heading">
      <h2 id="photo-heading" className="text-xl font-semibold tracking-tight">
        Upload your {label}
      </h2>
      <p className="mt-1 text-stone-600">{PHOTO_TYPE_HINTS[photoType]} Just you in the photo.</p>

      <div className="mt-6 overflow-hidden rounded-xl border border-stone-200 bg-white">
        <div role="tablist" aria-label="Photo source" className="flex border-b border-stone-200 text-sm font-medium">
          <button
            type="button"
            role="tab"
            id="upload-tab"
            aria-selected="true"
            aria-controls="upload-panel"
            className="flex-1 border-b-2 border-stone-900 py-2.5 text-stone-900"
          >
            Upload
          </button>
        </div>
        <div role="tabpanel" id="upload-panel" aria-labelledby="upload-tab">
          <div className="mx-auto aspect-[3/4] w-full max-w-[45vh]">
            {photo ? (
              <img src={photo.url} alt={`Your ${label}`} className="h-full w-full bg-stone-100 object-contain" />
            ) : (
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                disabled={opening}
                className="flex h-full w-full flex-col items-center justify-center gap-3 bg-stone-50 px-6 text-center text-stone-600 hover:bg-stone-100"
              >
                <PhotoTypeSilhouette photoType={photoType} className="h-24 w-20 rounded-lg text-stone-300" />
                <span className="font-medium text-stone-900">{opening ? "Opening your photo…" : "Choose a photo"}</span>
                <span className="text-xs">A JPEG, PNG or WebP photo, or any photo your browser can open</span>
              </button>
            )}
          </div>
          <input ref={fileInput} type="file" accept="image/*" onChange={pick} className="hidden" />
          {photo && (
            <div className="flex justify-end border-t border-stone-200 p-3">
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                disabled={opening || sending}
                className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium hover:bg-stone-100 disabled:opacity-40"
              >
                {opening ? "Opening your photo…" : "Choose another"}
              </button>
            </div>
          )}
        </div>
      </div>
      {problem && (
        <div className="mt-1">
          <div role="alert">
            <p className={fieldError}>{problem.message}</p>
            {problem.detail && <p className="mt-1 text-sm text-stone-600">{problem.detail}</p>}
          </div>
          {switchTo && (
            <button
              type="button"
              onClick={() => switchPhotoType(switchTo)}
              disabled={opening || sending}
              className={`mt-3 ${secondaryButton}`}
            >
              {COPY.useItAs(PHOTO_TYPE_LABELS[switchTo])}
            </button>
          )}
        </div>
      )}

      <div className="mt-8 flex justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={sending}
          className="rounded-lg px-4 py-2.5 font-medium text-stone-600 hover:bg-stone-100"
        >
          Back
        </button>
        <button
          type="button"
          onClick={() => getOutfits(photoType)}
          disabled={!photo || opening || sending}
          className={primaryButton}
        >
          {sending ? "Checking your photo…" : "Get my Outfits"}
        </button>
      </div>
    </section>
  );
}
