"use client";

import { useRouter } from "next/navigation";
import { type ChangeEvent, type KeyboardEvent, type ReactNode, useEffect, useRef, useState, useTransition } from "react";

import { LimitMessage, type LimitRefusal } from "@/components/limit-message";
import { PhotoTypeSilhouette } from "@/components/photo-type-silhouette";
import { fieldError, primaryButton, secondaryButton } from "@/components/ui";
import {
  BUDGET_TIER_LABELS,
  BUDGET_TIERS,
  type BudgetTier,
  CATEGORY_LABELS,
  DEFAULT_BUDGET_TIER,
  DEFAULT_PHOTO_TYPE,
  hasBudgetTier,
  PHOTO_TYPE_CATEGORIES,
  PHOTO_TYPE_HINTS,
  PHOTO_TYPE_LABELS,
  PHOTO_TYPES,
  type PhotoType,
} from "@/config/consultations";
import { COPY } from "@/config/copy";
import { consultationRoute, ROUTES } from "@/config/routes";
import { SLOW_STEP_MS } from "@/config/stylings";
import type { PhotoRejection } from "@/server/consultations/photo-check";

import { Stepper } from "../stepper";
import { StylingStep } from "../styling-step";
import { startConsultationAction } from "./actions";
import { CameraView, useCamera } from "./camera";
import { shrinkPhoto } from "./shrink-photo";

const PHOTO_SOURCES = ["camera", "upload"] as const;
type PhotoSource = (typeof PHOTO_SOURCES)[number];

const PHOTO_SOURCE_LABELS: Record<PhotoSource, string> = { camera: "Camera", upload: "Upload" };

/** A photo the browser has shrunk, ready to send, with a link to show it on the page. */
interface ChosenPhoto {
  blob: Blob;
  url: string;
  /** The tab it came from, which is the tab that shows it. */
  source: PhotoSource;
}

/** `outfitsWanted` is how many of the `outfitsLeft` in the user's Outfit Allowance the Styling will make. */
export function NewConsultation({ outfitsWanted, outfitsLeft }: { outfitsWanted: number; outfitsLeft: number }) {
  const [step, setStep] = useState<"photo-type" | "photo">("photo-type");
  const [photoType, setPhotoType] = useState<PhotoType>(DEFAULT_PHOTO_TYPE);
  // Kept here so going Back and on again keeps the photo and the Budget Tier.
  const [photo, setPhoto] = useState<ChosenPhoto | null>(null);
  const [budgetTier, setBudgetTier] = useState<BudgetTier>(DEFAULT_BUDGET_TIER);

  useEffect(() => {
    if (!photo) return;
    return () => URL.revokeObjectURL(photo.url);
  }, [photo]);

  return step === "photo-type" ? (
    <PhotoTypeStep photoType={photoType} onChange={setPhotoType} onContinue={() => setStep("photo")} />
  ) : (
    <PhotoStep
      allowanceLine={COPY.outfitsItUses(outfitsWanted, outfitsLeft)}
      photoType={photoType}
      onPhotoTypeChange={setPhotoType}
      photo={photo}
      onPhotoChange={setPhoto}
      budgetTier={budgetTier}
      onBudgetTierChange={setBudgetTier}
      onBack={() => setStep("photo-type")}
    />
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
    <>
      <Stepper current={1} />
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
    </>
  );
}

/** What the photo step shows when something is wrong with the photo, or stops it being checked. */
interface Problem {
  message: ReactNode;
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
  allowanceLine,
  photoType,
  onPhotoTypeChange,
  photo,
  onPhotoChange,
  budgetTier,
  onBudgetTierChange,
  onBack,
}: {
  /** Beside "Get my Outfits": how many Outfits it will use, of how many are left. */
  allowanceLine: string;
  photoType: PhotoType;
  onPhotoTypeChange: (photoType: PhotoType) => void;
  photo: ChosenPhoto | null;
  onPhotoChange: (photo: ChosenPhoto | null) => void;
  /** Sent only with a photo that has one: a Face Photo has none, since a Hairstyle has no price. */
  budgetTier: BudgetTier;
  onBudgetTierChange: (budgetTier: BudgetTier) => void;
  onBack: () => void;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<PhotoSource>(photo?.source ?? "camera");
  // Each tab shows only its own photo, and "Get my Outfits" sends the one on screen.
  const shown = photo?.source === source ? photo : null;
  const camera = useCamera(source === "camera" && !shown);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [opening, setOpening] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [sending, startSending] = useTransition();
  // While sending, the Styling step: the photo check, then the Styling under way once the photo passes.
  const [accepted, setAccepted] = useState(false);
  const [stepStartedAt, setStepStartedAt] = useState<number | null>(null);
  const slow = useTakingLonger(sending ? stepStartedAt : null);
  const getOutfitsButton = useRef<HTMLButtonElement>(null);
  const wasSending = useRef(false);

  // Back from the Styling step with the photo refused: focus is where the user left it.
  useEffect(() => {
    if (wasSending.current && !sending) getOutfitsButton.current?.focus();
    wasSending.current = sending;
  }, [sending]);

  function chooseSource(next: PhotoSource) {
    if (next === source) return;
    setSource(next);
    setProblem(null);
  }

  /** "Upload a photo instead", when the camera can't be used: straight to the picker. */
  function uploadInstead() {
    chooseSource("upload");
    fileInput.current?.click();
  }

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
      onPhotoChange({ blob: result.photo, url: URL.createObjectURL(result.photo), source: "upload" });
    } else {
      if (photo?.source === "upload") onPhotoChange(null);
      setProblem({ message: result.problem === "too-large" ? COPY.photoTooLarge : COPY.photoUnreadable });
    }
  }

  const canTakePhoto = camera.state.status === "live" && !capturing;

  async function takePhoto() {
    if (!canTakePhoto) return;
    setProblem(null);
    setCapturing(true);
    const taken = await camera.capture();
    setCapturing(false);
    if (taken) onPhotoChange({ blob: taken, url: URL.createObjectURL(taken), source: "camera" });
    else setProblem({ message: "We couldn't take your photo. Try again." });
  }

  /** Back to the live camera. */
  function retake() {
    setProblem(null);
    onPhotoChange(null);
  }

  /** "Get my Outfits": sends the photo as `type`, which is the chosen Photo Type unless switching. */
  function getOutfits(type: PhotoType) {
    if (!shown) return;
    setProblem(null);
    setAccepted(false);
    setStepStartedAt(Date.now());
    startSending(async () => {
      const form = new FormData();
      form.set("photoType", type);
      if (hasBudgetTier(type)) form.set("budgetTier", budgetTier);
      form.set("photo", new File([shown.blob], "photo.jpg", { type: "image/jpeg" }));
      let result;
      try {
        result = await startConsultationAction(form);
      } catch {
        // The request itself failed: the network, or our side.
        setProblem({ message: COPY.photoCheckFailed });
        return;
      }
      if (result.ok) {
        setAccepted(true);
        setStepStartedAt(Date.now());
        startSending(() => router.push(consultationRoute(result.consultationId)));
      } else if (result.refusal === "signed-out") startSending(() => router.push(ROUTES.signIn));
      else if (result.refusal === "photo-check-limit") setProblem({ message: <LimitMessage refusal={result} /> });
      else if (result.refusal === "photo-rejected") setProblem(rejectionProblem(result.rejection));
      else if (result.refusal === "check-errored") setProblem({ message: COPY.photoCheckFailed });
      else if (result.refusal === "unusable-file") setProblem({ message: COPY.photoUnusable });
      else {
        // The user is unverified, or a limit or the region gate has stopped every Styling since the
        // page loaded. The page then shows why in place of this step. A new refusal of another sort
        // fails typecheck here.
        result.refusal satisfies LimitRefusal["refusal"] | "unverified";
        router.refresh();
      }
    });
  }

  /** "Use it as a <Photo Type>": switches the Photo Type and sends the same photo again, as a fresh check. */
  function switchPhotoType(type: PhotoType) {
    onPhotoTypeChange(type);
    getOutfits(type);
  }

  const label = PHOTO_TYPE_LABELS[photoType];
  const switchTo = problem?.switchTo;
  const busy = opening || capturing || sending;

  // A rejected photo comes back to this step, still chosen.
  if (sending && shown) {
    return <StylingStep photoUrl={shown.url} photoType={photoType} stage={accepted ? "style_icons" : "photo_check"} slow={slow} />;
  }

  return (
    <>
      <Stepper current={2} />
      <section aria-labelledby="photo-heading">
        <h2 id="photo-heading" className="text-xl font-semibold tracking-tight">
          {source === "camera" ? "Take" : "Upload"} your {label}
        </h2>
        <p className="mt-1 text-stone-600">
          {PHOTO_TYPE_HINTS[photoType]} Just you in the photo.
          {source === "camera" && " Line yourself up with the outline."}
        </p>

        <div className="mt-6 overflow-hidden rounded-xl border border-stone-200 bg-white">
          <PhotoSourceTabs value={source} onChange={chooseSource} disabled={busy} />
          <div role="tabpanel" id="photo-panel" aria-labelledby={`${source}-tab`}>
            <div className="mx-auto aspect-[4/5] w-full max-w-[45vh]">
              {shown ? (
                <img src={shown.url} alt={`Your ${label}`} className="h-full w-full bg-stone-100 object-contain" />
              ) : source === "camera" ? (
                <CameraView camera={camera} photoType={photoType} onUpload={uploadInstead} />
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
            {source === "camera" ? (
              <div className="flex justify-end border-t border-stone-200 p-3">
                {/* One button for both, and aria-disabled rather than disabled, so focus stays on it
                    while the camera starts, the photo is taken and the user retakes. */}
                <button
                  type="button"
                  onClick={shown ? retake : takePhoto}
                  disabled={Boolean(shown) && sending}
                  aria-disabled={!shown && !canTakePhoto}
                  className={`rounded-lg px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 aria-disabled:cursor-not-allowed aria-disabled:opacity-40 ${
                    shown
                      ? "border border-stone-300 bg-white hover:bg-stone-100"
                      : "bg-stone-900 text-white hover:bg-stone-700"
                  }`}
                >
                  {shown ? "Retake" : capturing ? "Taking your photo…" : "Take photo"}
                </button>
              </div>
            ) : (
              shown && (
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
              )
            )}
          </div>
          <input ref={fileInput} type="file" accept="image/*" onChange={pick} className="hidden" />
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
                disabled={busy}
                className={`mt-3 ${secondaryButton}`}
              >
                {COPY.useItAs(PHOTO_TYPE_LABELS[switchTo])}
              </button>
            )}
          </div>
        )}

        {hasBudgetTier(photoType) && <BudgetTierPicker value={budgetTier} onChange={onBudgetTierChange} />}

        <div className="mt-8 flex items-start justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            disabled={sending}
            className="rounded-lg px-4 py-2.5 font-medium text-stone-600 hover:bg-stone-100"
          >
            Back
          </button>
          <div className="flex flex-col items-end gap-1.5 text-right">
            <button
              ref={getOutfitsButton}
              type="button"
              onClick={() => getOutfits(photoType)}
              disabled={!shown || busy}
              aria-describedby="allowance-line"
              className={primaryButton}
            >
              Get my Outfits
            </button>
            <p id="allowance-line" className="text-sm text-stone-600">
              {allowanceLine}
            </p>
          </div>
        </div>
      </section>
    </>
  );
}

/** The four Budget Tier buttons, No Budget first. */
function BudgetTierPicker({ value, onChange }: { value: BudgetTier; onChange: (budgetTier: BudgetTier) => void }) {
  return (
    <fieldset className="mt-8" aria-describedby="budget-tier-note">
      <legend className="font-semibold">Budget Tier</legend>
      <p id="budget-tier-note" className="mb-3 text-sm text-stone-600">
        You can change this later, on your Outfits.
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {BUDGET_TIERS.map((tier) => (
          <label
            key={tier}
            className="cursor-pointer rounded-lg border border-stone-200 bg-white px-3 py-2 text-center text-sm font-medium text-stone-700 hover:border-stone-300 has-[:checked]:border-stone-900 has-[:checked]:bg-stone-900 has-[:checked]:text-white has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-stone-900 has-[:focus-visible]:ring-offset-2"
          >
            <input
              type="radio"
              name="budgetTier"
              value={tier}
              checked={value === tier}
              onChange={() => onChange(tier)}
              className="sr-only"
            />
            {BUDGET_TIER_LABELS[tier]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** True once the step that started at `startedAt` has run longer than SLOW_STEP_MS. Null while no step runs. */
function useTakingLonger(startedAt: number | null): boolean {
  const [slowStepStartedAt, setSlowStepStartedAt] = useState<number | null>(null);
  useEffect(() => {
    if (startedAt === null) return;
    const timer = setTimeout(() => setSlowStepStartedAt(startedAt), startedAt + SLOW_STEP_MS - Date.now());
    return () => clearTimeout(timer);
  }, [startedAt]);
  return startedAt !== null && slowStepStartedAt === startedAt;
}

/** The Camera and Upload tabs, with arrow keys moving between them. */
function PhotoSourceTabs({
  value,
  onChange,
  disabled,
}: {
  value: PhotoSource;
  onChange: (source: PhotoSource) => void;
  disabled: boolean;
}) {
  const tabs = useRef<Partial<Record<PhotoSource, HTMLButtonElement | null>>>({});

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = PHOTO_SOURCES.indexOf(value);
    const count = PHOTO_SOURCES.length;
    const moves: Partial<Record<string, PhotoSource>> = {
      ArrowRight: PHOTO_SOURCES[(index + 1) % count],
      ArrowLeft: PHOTO_SOURCES[(index + count - 1) % count],
      Home: PHOTO_SOURCES[0],
      End: PHOTO_SOURCES[count - 1],
    };
    const next = moves[event.key];
    if (!next) return;
    event.preventDefault();
    onChange(next);
    tabs.current[next]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label="Photo source"
      onKeyDown={onKeyDown}
      className="flex border-b border-stone-200 text-sm font-medium"
    >
      {PHOTO_SOURCES.map((source) => {
        const selected = source === value;
        return (
          <button
            key={source}
            ref={(tab) => {
              tabs.current[source] = tab;
            }}
            type="button"
            role="tab"
            id={`${source}-tab`}
            aria-selected={selected}
            aria-controls={selected ? "photo-panel" : undefined}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(source)}
            disabled={disabled}
            className={`flex-1 border-b-2 py-2.5 disabled:cursor-not-allowed ${
              selected ? "border-stone-900 text-stone-900" : "border-transparent text-stone-500 hover:text-stone-900"
            }`}
          >
            {PHOTO_SOURCE_LABELS[source]}
          </button>
        );
      })}
    </div>
  );
}
