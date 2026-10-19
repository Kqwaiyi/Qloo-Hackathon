"use client";

import { useRouter } from "next/navigation";
import {
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";

import { LimitMessage, type LimitRefusal } from "@/components/limit-message";
import { PhotoTypeSilhouette, PhotoTypeSketch } from "@/components/photo-type-silhouette";
import {
  BUDGET_TIER_LABELS,
  BUDGET_TIERS,
  type BudgetTier,
  CATEGORIES,
  CATEGORY_LABELS,
  DEFAULT_BUDGET_TIER,
  DEFAULT_PHOTO_TYPE,
  hasBudgetTier,
  PHOTO_TYPE_CATEGORIES,
  PHOTO_TYPE_HINTS,
  PHOTO_TYPE_LABELS,
  PHOTO_TYPES,
  type PhotoType,
  SELF_TIMER_SECONDS,
} from "@/config/consultations";
import { COPY } from "@/config/copy";
import { consultationRoute, ROUTES } from "@/config/routes";
import { SLOW_STEP_MS } from "@/config/stylings";
import type { PhotoRejection } from "@/server/consultations/photo-check";

import { Stepper } from "../stepper";
import { StylingStep } from "../styling-step";
import { groupLabel, inkPill, linePill, smallPill, stepHeading, stepLead } from "../ui";
import { startConsultationAction } from "./actions";
import { CameraView, useCamera } from "./camera";
import { ConsentSheet } from "./consent-sheet";
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

/**
 * `outfitsWanted` is how many Outfits the Styling will make, of the `outfitsLeft` in the user's
 * Outfit Allowance, which is null on the Demo Account: it has none. `photoConsentNeeded` says the
 * consent sheet comes first: the user hasn't agreed to the current photo notice.
 * `isDemoAccount` says it's the Demo Account, which the judges share: the consent sheet comes before
 * each of its Consultations, and says the account is shared.
 */
export function NewConsultation({
  outfitsWanted,
  outfitsLeft,
  photoConsentNeeded,
  isDemoAccount,
}: {
  outfitsWanted: number;
  outfitsLeft: number | null;
  photoConsentNeeded: boolean;
  isDemoAccount: boolean;
}) {
  const [step, setStep] = useState<"photo-type" | "photo">("photo-type");
  const [photoType, setPhotoType] = useState<PhotoType>(DEFAULT_PHOTO_TYPE);
  // Kept here so going Back and on again keeps the photo and the Budget Tier.
  const [photo, setPhoto] = useState<ChosenPhoto | null>(null);
  const [budgetTier, setBudgetTier] = useState<BudgetTier>(DEFAULT_BUDGET_TIER);
  const [consentNeeded, setConsentNeeded] = useState(photoConsentNeeded);

  useEffect(() => {
    if (!photo) return;
    return () => URL.revokeObjectURL(photo.url);
  }, [photo]);

  return step === "photo-type" ? (
    <PhotoTypeStep photoType={photoType} onChange={setPhotoType} onContinue={() => setStep("photo")} />
  ) : (
    <PhotoStep
      allowanceLine={outfitsLeft === null ? null : COPY.outfitsItUses(outfitsWanted, outfitsLeft)}
      photoType={photoType}
      onPhotoTypeChange={setPhotoType}
      photo={photo}
      onPhotoChange={setPhoto}
      budgetTier={budgetTier}
      onBudgetTierChange={setBudgetTier}
      consentNeeded={consentNeeded}
      onConsentNeededChange={setConsentNeeded}
      isDemoAccount={isDemoAccount}
      onBack={() => setStep("photo-type")}
    />
  );
}

/**
 * The Photo Type step: three viewfinders framing the same figure the way each Photo Type does, each
 * with the four Categories under it, lit where that photo unlocks them. It fits the screen: on
 * phones the three share the height left above Continue, and on wider screens the viewfinders
 * shrink where the screen is short.
 */
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
      <section
        data-fit-screen
        aria-labelledby="photo-type-heading"
        className="flex min-h-0 flex-1 flex-col motion-safe:animate-step-in"
      >
        <h2 id="photo-type-heading" className={stepHeading}>
          What will your photo show?
        </h2>
        <p className={stepLead}>This decides which parts of an Outfit you get.</p>
        <fieldset className="mt-4 flex min-h-0 min-w-0 flex-1 flex-col gap-2 sm:mt-6 sm:grid sm:flex-initial sm:grid-cols-3 sm:grid-rows-[minmax(0,1fr)] sm:gap-4 sm:short:mt-5">
          <legend className="sr-only">Photo Type</legend>
          {PHOTO_TYPES.map((type) => (
            <label
              key={type}
              className="group/option flex min-h-0 flex-1 cursor-pointer gap-3 rounded-xl bg-white p-2.5 ring-1 ring-ink/10 transition-shadow duration-200 ring-inset hover:ring-ink/30 has-checked:ring-2 has-checked:ring-ink has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ink sm:flex-col sm:gap-4 sm:p-4 sm:short:gap-3 sm:short:p-3"
            >
              <input
                type="radio"
                name="photoType"
                value={type}
                checked={photoType === type}
                onChange={() => onChange(type)}
                className="sr-only"
              />
              <Viewfinder photoType={type} />
              <span className="min-w-0 flex-1 sm:flex-none">
                <span className="flex items-center justify-between gap-3">
                  <span className="font-medium">{PHOTO_TYPE_LABELS[type]}</span>
                  <span
                    aria-hidden="true"
                    className="size-[18px] shrink-0 rounded-full ring-1 ring-ink/25 transition-[box-shadow] duration-200 ring-inset group-has-checked/option:ring-[5px] group-has-checked/option:ring-ink"
                  />
                </span>
                <span className="mt-0.5 block text-[13px] text-mute sm:min-h-[2lh] sm:text-sm sm:short:min-h-0">{PHOTO_TYPE_HINTS[type]}</span>
                <CategorySlots photoType={type} />
              </span>
            </label>
          ))}
        </fieldset>
        <div className="mt-4 flex justify-end sm:mt-8 sm:short:mt-6">
          <button type="button" onClick={onContinue} className={`${inkPill} max-sm:w-full`}>
            Continue
          </button>
        </div>
      </section>
    </>
  );
}

/**
 * The figure framed as `photoType` frames it, inside crop marks. It turns ink when its option is
 * chosen. On phones it's as tall as its option; wider, as wide as its option unless the screen is
 * too short, when it shrinks, staying 4:5.
 */
function Viewfinder({ photoType }: { photoType: PhotoType }) {
  const corners = ["top-1.5 left-1.5 border-t border-l", "top-1.5 right-1.5 border-t border-r", "bottom-1.5 left-1.5 border-b border-l", "bottom-1.5 right-1.5 border-b border-r"];
  return (
    <span aria-hidden="true" className="block aspect-[4/5] h-full shrink-0 [container-type:size] sm:h-auto sm:min-h-0 sm:w-full sm:shrink">
      <span className="relative mx-auto block h-full w-[min(100cqw,80cqh)] overflow-hidden rounded-md bg-paper">
        <PhotoTypeSilhouette
          photoType={photoType}
          className="block size-full text-ash opacity-55 transition-[color,opacity] duration-300 group-hover/option:opacity-80 group-has-checked/option:text-ink group-has-checked/option:opacity-100"
        />
        {corners.map((corner) => (
          <span
            key={corner}
            className={`absolute size-3 border-ash transition-colors duration-300 group-has-checked/option:border-ink ${corner}`}
          />
        ))}
      </span>
    </span>
  );
}

/** All four Categories, those the Photo Type unlocks in ink and the rest struck through. */
function CategorySlots({ photoType }: { photoType: PhotoType }) {
  const unlocked = PHOTO_TYPE_CATEGORIES[photoType];
  return (
    <span className="mt-2 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[13px] sm:mt-3 sm:grid sm:grid-cols-2 sm:gap-x-3 sm:gap-y-1 sm:text-sm sm:short:mt-2">
      <span className="sr-only">Unlocks: {inASentence(unlocked.map((category) => CATEGORY_LABELS[category]))}</span>
      {CATEGORIES.map((category) => {
        const on = unlocked.includes(category);
        return (
          <span key={category} aria-hidden="true" className={`flex items-center gap-1.5 ${on ? "text-ink" : "text-mute line-through decoration-ash"}`}>
            <span className={`size-1.5 shrink-0 rounded-full ${on ? "bg-ink" : "ring-1 ring-ash ring-inset"}`} />
            {CATEGORY_LABELS[category]}
          </span>
        );
      })}
    </span>
  );
}

/** "Top, Bottom and Shoes". */
function inASentence(words: readonly string[]): string {
  return words.length < 2 ? words.join("") : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
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

/**
 * The photo step: the frame, from the camera or an upload, on one side, and what goes with the
 * photo on the other: its Budget Tier and "Get my Outfits". It fits the screen, the frame taking
 * the height the rest leaves. On phones, where there's room for little else, the Budget Tier and
 * "Get my Outfits" share one row under the frame, and only once there's a photo to send.
 */
function PhotoStep({
  allowanceLine,
  photoType,
  onPhotoTypeChange,
  photo,
  onPhotoChange,
  budgetTier,
  onBudgetTierChange,
  consentNeeded,
  onConsentNeededChange,
  isDemoAccount,
  onBack,
}: {
  /** Under "Get my Outfits": how many Outfits it will use, of how many are left, if there's an Outfit Allowance. */
  allowanceLine: string | null;
  photoType: PhotoType;
  onPhotoTypeChange: (photoType: PhotoType) => void;
  photo: ChosenPhoto | null;
  onPhotoChange: (photo: ChosenPhoto | null) => void;
  /** Sent only with a photo that has one: a Face Photo has none, since a Hairstyle has no price. */
  budgetTier: BudgetTier;
  onBudgetTierChange: (budgetTier: BudgetTier) => void;
  /** "Get my Outfits" opens the consent sheet first. */
  consentNeeded: boolean;
  onConsentNeededChange: (consentNeeded: boolean) => void;
  /** The Demo Account, which keeps no agreement on record, and whose consent sheet says it's shared. */
  isDemoAccount: boolean;
  /** Back to the Photo Type step, from "Change". */
  onBack: () => void;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<PhotoSource>(photo?.source ?? "camera");
  // Each tab shows only its own photo, and "Get my Outfits" sends the one on screen.
  const shown = photo?.source === source ? photo : null;
  const camera = useCamera(source === "camera" && !shown);
  const [problem, setProblem] = useState<Problem | null>(null);
  // While the consent sheet is open: the Photo Type "Get my Outfits" will send once the user agrees.
  const [consentSheetFor, setConsentSheetFor] = useState<PhotoType | null>(null);
  // The sheet was closed without agreeing, so nothing was sent.
  const [consentDeclined, setConsentDeclined] = useState(false);
  const [opening, setOpening] = useState(false);
  const [capturing, setCapturing] = useState(false);
  // A file is being dragged over the upload frame.
  const [dragging, setDragging] = useState(false);
  // On for body photos to start with: they need the user further back than an arm's length.
  const [timerOn, setTimerOn] = useState(photoType !== "face");
  // The seconds left on the self-timer while it runs.
  const [countdown, setCountdown] = useState<number | null>(null);
  const [sending, startSending] = useTransition();
  // While sending, the Styling step: the photo check, then the Styling under way once the photo passes.
  const [accepted, setAccepted] = useState(false);
  const [stepStartedAt, setStepStartedAt] = useState<number | null>(null);
  const slow = useTakingLonger(sending ? stepStartedAt : null);
  const getOutfitsButton = useRef<HTMLButtonElement>(null);
  const wasSending = useRef(false);
  const takeButton = useRef<HTMLButtonElement>(null);
  const retakeButton = useRef<HTMLButtonElement>(null);
  // Taking a photo swaps "Take photo" for "Retake" on the photo, and Retake swaps them back: focus
  // moves to the one that took the pressed one's place.
  const focusNext = useRef<"take" | "retake" | null>(null);

  // Back from the Styling step with the photo refused: focus is where the user left it.
  useEffect(() => {
    if (wasSending.current && !sending) getOutfitsButton.current?.focus();
    wasSending.current = sending;
  }, [sending]);

  useEffect(() => {
    const next = focusNext.current;
    focusNext.current = null;
    if (next === "retake") retakeButton.current?.focus();
    if (next === "take") takeButton.current?.focus();
  }, [shown]);

  function chooseSource(next: PhotoSource) {
    if (next === source) return;
    setSource(next);
    setProblem(null);
    setCountdown(null);
  }

  /** "Upload a photo instead", when the camera can't be used: straight to the picker. */
  function uploadInstead() {
    chooseSource("upload");
    fileInput.current?.click();
  }

  function pick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Lets the same file be picked again after a problem.
    event.target.value = "";
    if (file) void open(file);
  }

  /** A photo dropped on the upload frame opens like one picked. */
  function drop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file && !opening) void open(file);
  }

  async function open(file: File) {
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

  /** "Take photo": now, or once the self-timer runs out if it's on. Pressed while it runs, it stops it. */
  function takePhoto() {
    if (countdown !== null) return setCountdown(null);
    if (!canTakePhoto) return;
    setProblem(null);
    if (timerOn) setCountdown(SELF_TIMER_SECONDS);
    else void capture();
  }

  useEffect(() => {
    if (countdown === null) return;
    const tick = setTimeout(() => {
      if (countdown > 1) setCountdown(countdown - 1);
      else {
        setCountdown(null);
        void capture();
      }
    }, 1000);
    return () => clearTimeout(tick);
    // A tick only follows the one before it, and `capture` is this render's whenever `countdown` changes.
  }, [countdown]);

  async function capture() {
    setProblem(null);
    setCapturing(true);
    const taken = await camera.capture();
    setCapturing(false);
    if (taken && document.activeElement === takeButton.current) focusNext.current = "retake";
    if (taken) onPhotoChange({ blob: taken, url: URL.createObjectURL(taken), source: "camera" });
    else setProblem({ message: "We couldn't take your photo. Try again." });
  }

  /** Back to the live camera. */
  function retake() {
    if (document.activeElement === retakeButton.current) focusNext.current = "take";
    setProblem(null);
    onPhotoChange(null);
  }

  /**
   * "Get my Outfits": sends the photo as `type`, which is the chosen Photo Type unless switching,
   * once the user has agreed on the consent sheet if they still need to.
   */
  function getOutfits(type: PhotoType) {
    if (!shown) return;
    setProblem(null);
    setConsentDeclined(false);
    if (consentNeeded) setConsentSheetFor(type);
    // The Demo Account keeps no agreement on record, so the judge's, given on this page, goes with
    // each photo sent from it, until one becomes a Consultation and the page moves on.
    else send(type, isDemoAccount);
  }

  /** The consent sheet has closed: the photo goes with both ticks if the user agreed, and otherwise nothing is sent. */
  function closeConsentSheet(agreed: boolean) {
    const type = consentSheetFor;
    setConsentSheetFor(null);
    if (agreed && type) send(type, true);
    else setConsentDeclined(true);
  }

  /** Sends the photo as `type`, with both of the consent sheet's ticks if `consented`. */
  function send(type: PhotoType, consented: boolean) {
    if (!shown) return;
    setAccepted(false);
    setStepStartedAt(Date.now());
    startSending(async () => {
      const form = new FormData();
      form.set("photoType", type);
      if (hasBudgetTier(type)) form.set("budgetTier", budgetTier);
      form.set("photo", new File([shown.blob], "photo.jpg", { type: "image/jpeg" }));
      if (consented) {
        form.set("consentStoreAndProcess", "on");
        form.set("consentSendToGemini", "on");
      }
      let result;
      try {
        result = await startConsultationAction(form);
      } catch {
        // The request itself failed: the network, or our side.
        setProblem({ message: COPY.photoCheckFailed });
        return;
      }
      // The server now has the ticks on record, so the one-tap Photo Type switch after a rejection
      // needs no second sheet. The refusals that come before the consent check (signed out,
      // unverified, the region gate) leave this step anyway, and a withdrawal meanwhile asks again
      // below.
      if (consented) onConsentNeededChange(false);
      if (result.ok) {
        setAccepted(true);
        setStepStartedAt(Date.now());
        startSending(() => router.push(consultationRoute(result.consultationId)));
      } else if (result.refusal === "signed-out") startSending(() => router.push(ROUTES.signIn));
      else if (result.refusal === "photo-consent-needed") {
        // Consent was withdrawn, or the photo notice changed, since the page loaded.
        onConsentNeededChange(true);
        setConsentSheetFor(type);
      } else if (result.refusal === "photo-check-limit") setProblem({ message: <LimitMessage refusal={result} /> });
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

  // The frame is as big as the height left lets it be, after the tabs above it and, while the
  // camera waits for "Take photo", the row of buttons under it.
  const cameraButtons = source === "camera" && !shown;

  return (
    <>
      <Stepper current={2} />
      <section data-fit-screen aria-labelledby="photo-heading" className="flex min-h-0 flex-1 flex-col motion-safe:animate-step-in">
        <h2 id="photo-heading" className={stepHeading}>
          {source === "camera" ? "Take" : "Upload"} your {label}
        </h2>
        <p className={stepLead}>
          {PHOTO_TYPE_HINTS[photoType]}
          <span className="max-sm:hidden"> Just you in the photo.</span>{" "}
          <button
            type="button"
            onClick={onBack}
            disabled={sending}
            className="rounded font-medium text-ink underline decoration-ink/30 underline-offset-[3px] outline-offset-2 hover:decoration-ink focus-visible:outline-2 focus-visible:outline-ink disabled:opacity-40"
          >
            Change<span className="sr-only"> Photo Type</span>
          </button>
        </p>

        <div className="mt-4 grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] gap-x-10 gap-y-3 sm:mt-6 sm:short:mt-5 md:grid-cols-[minmax(0,1fr)_16.5rem] md:grid-rows-[minmax(0,1fr)]">
          <div className="min-h-0 min-w-0 [container-type:size]">
            <div
              className={`mx-auto flex flex-col ${
                cameraButtons
                  ? "w-[min(100cqw,max(9rem,calc((100cqh-7rem)*0.8)))]"
                  : "w-[min(100cqw,max(9rem,calc((100cqh-3.5rem)*0.8)))]"
              }`}
            >
              <PhotoSourceTabs value={source} onChange={chooseSource} disabled={busy} />
              <div role="tabpanel" id="photo-panel" aria-labelledby={`${source}-tab`} className="mt-3">
                <div className="relative aspect-[4/5] w-full overflow-hidden rounded-lg bg-card">
                  {shown ? (
                    <>
                      <img src={shown.url} alt={`Your ${label}`} className="size-full object-contain" />
                      <button
                        ref={retakeButton}
                        type="button"
                        onClick={source === "camera" ? retake : () => fileInput.current?.click()}
                        disabled={opening || sending}
                        className="absolute top-2.5 right-2.5 inline-flex h-9 items-center rounded-full bg-white/90 px-4 text-sm font-medium text-ink ring-1 ring-ink/10 backdrop-blur-sm transition-colors duration-200 outline-offset-2 ring-inset hover:bg-white focus-visible:outline-2 focus-visible:outline-ink disabled:opacity-40"
                      >
                        {source === "camera" ? "Retake" : opening ? "Opening your photo…" : "Choose another"}
                      </button>
                    </>
                  ) : source === "camera" ? (
                    <>
                      <CameraView camera={camera} photoType={photoType} onUpload={uploadInstead} />
                      {countdown !== null && (
                        // On a disc, so it reads over any picture.
                        <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
                          <span
                            key={countdown}
                            className="flex size-[min(8rem,40cqw)] items-center justify-center rounded-full bg-ink/60 text-[min(5rem,24cqw)] leading-none font-medium text-paper tabular-nums backdrop-blur-sm motion-safe:animate-step-in"
                          >
                            {countdown}
                          </span>
                        </div>
                      )}
                      <p role="status" className="sr-only">
                        {countdown !== null && `Taking your photo in ${SELF_TIMER_SECONDS} seconds`}
                      </p>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInput.current?.click()}
                      onDragOver={(event) => {
                        event.preventDefault();
                        setDragging(true);
                      }}
                      onDragLeave={() => setDragging(false)}
                      onDrop={drop}
                      disabled={opening}
                      className={`flex size-full flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed bg-white px-5 text-center outline-offset-2 transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-ink ${
                        dragging ? "border-ink bg-paper" : "border-ink/15 hover:border-ink/40"
                      }`}
                    >
                      <PhotoTypeSketch photoType={photoType} className="aspect-[4/5] w-[min(6rem,28%)] rounded-md bg-paper text-ash" />
                      <span>
                        <span className="block font-medium">{opening ? "Opening your photo…" : "Choose a photo"}</span>
                        <span className="mt-1 hidden text-sm text-mute pointer-fine:block">or drop it here</span>
                      </span>
                      <span className="max-w-[26ch] text-xs text-mute">A JPEG, PNG or WebP photo, or any photo your browser can open</span>
                    </button>
                  )}
                  {problem && (
                    // Over the frame's foot, so it never pushes "Get my Outfits" off the screen.
                    <div className="absolute inset-x-2.5 bottom-2.5 rounded-lg bg-white/95 p-3 ring-1 ring-red-700/20 backdrop-blur-sm ring-inset">
                      <div role="alert">
                        <p className="text-sm font-medium text-red-800">{problem.message}</p>
                        {problem.detail && <p className="mt-1 text-xs text-red-800/80">{problem.detail}</p>}
                      </div>
                      {switchTo && (
                        <button type="button" onClick={() => switchPhotoType(switchTo)} disabled={busy} className={`mt-2.5 ${smallPill}`}>
                          {COPY.useItAs(PHOTO_TYPE_LABELS[switchTo])}
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {cameraButtons && (
                  <div className="mt-3 flex h-11 items-center justify-center gap-2">
                    {/* One button for both, and aria-disabled rather than disabled, so focus stays on it
                        while the camera starts and the timer runs. */}
                    <button
                      ref={takeButton}
                      type="button"
                      onClick={takePhoto}
                      aria-disabled={countdown === null && !canTakePhoto}
                      className={countdown !== null ? linePill : inkPill}
                    >
                      {countdown !== null ? "Stop the timer" : capturing ? "Taking your photo…" : "Take photo"}
                    </button>
                    <button
                      type="button"
                      aria-pressed={timerOn}
                      onClick={() => setTimerOn((on) => !on)}
                      disabled={countdown !== null}
                      className={`group/timer ${smallPill}`}
                    >
                      <span
                        aria-hidden="true"
                        className="size-2 rounded-full ring-1 ring-ink/40 ring-inset group-aria-pressed/timer:bg-ink group-aria-pressed/timer:ring-ink"
                      />
                      <span aria-hidden="true">{SELF_TIMER_SECONDS} s timer</span>
                      <span className="sr-only">{SELF_TIMER_SECONDS}-second timer</span>
                    </button>
                  </div>
                )}
              </div>
              <input ref={fileInput} type="file" accept="image/*" onChange={pick} className="hidden" />
            </div>
          </div>

          {/* On phones, only once there's a photo to send, or a reason it wasn't sent. */}
          <div className={`flex min-w-0 flex-col gap-6 short:gap-4 ${shown || consentDeclined ? "" : "max-md:hidden"}`}>
            {hasBudgetTier(photoType) ? (
              <BudgetTierPicker value={budgetTier} onChange={onBudgetTierChange} className="max-md:hidden" />
            ) : (
              <div className="max-md:hidden">
                <p className={groupLabel}>Budget Tier</p>
                <p className="mt-1 text-sm text-mute">None for a Face Photo: a Hairstyle has no price.</p>
              </div>
            )}
            <div className="md:border-t md:border-ink/10 md:pt-6 md:short:pt-4">
              <div className="flex gap-2">
                {hasBudgetTier(photoType) && <BudgetTierSelect value={budgetTier} onChange={onBudgetTierChange} className="md:hidden" />}
                <button
                  ref={getOutfitsButton}
                  type="button"
                  onClick={() => getOutfits(photoType)}
                  disabled={!shown || busy}
                  aria-describedby="allowance-line consent-declined-line"
                  className={`min-w-0 flex-1 ${inkPill}`}
                >
                  Get my Outfits
                </button>
              </div>
              <p id="allowance-line" className="mt-2 text-sm text-mute empty:hidden md:mt-2.5">
                {allowanceLine}
              </p>
              {/* Left out where the screen is short: the step's own heading says it. */}
              {!shown && <p className="mt-2 text-sm text-mute short:hidden md:mt-2.5">Take or upload your photo first.</p>}
              {consentDeclined && (
                <p id="consent-declined-line" role="status" className="mt-2 text-sm text-ink md:mt-2.5">
                  {COPY.agreeToBothBoxes}
                </p>
              )}
            </div>
          </div>
        </div>
      </section>
      <ConsentSheet open={consentSheetFor !== null} isDemoAccount={isDemoAccount} onClose={closeConsentSheet} />
    </>
  );
}

/** The four Budget Tier buttons, No Budget first, for screens with room for them. */
function BudgetTierPicker({
  value,
  onChange,
  className = "",
}: {
  value: BudgetTier;
  onChange: (budgetTier: BudgetTier) => void;
  className?: string;
}) {
  return (
    <fieldset aria-describedby="budget-tier-note" className={className}>
      <legend className={groupLabel}>Budget Tier</legend>
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        {BUDGET_TIERS.map((tier) => (
          <label
            key={tier}
            className="flex h-10 cursor-pointer items-center justify-center rounded-full bg-white px-3 text-sm font-medium ring-1 ring-ink/15 transition-colors duration-200 ring-inset hover:ring-ink/40 has-checked:bg-ink has-checked:text-paper has-checked:ring-ink has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ink"
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
      <p id="budget-tier-note" className="mt-2.5 text-sm text-mute">
        Change it later, on your Outfits.
      </p>
    </fieldset>
  );
}

/**
 * The Budget Tier as one pill beside "Get my Outfits", for phones: it opens the phone's own picker,
 * and names the Budget Tier above its value.
 */
function BudgetTierSelect({
  value,
  onChange,
  className = "",
}: {
  value: BudgetTier;
  onChange: (budgetTier: BudgetTier) => void;
  className?: string;
}) {
  return (
    <label
      className={`relative flex h-11 shrink-0 flex-col justify-center rounded-full bg-white pr-9 pl-4 ring-1 ring-ink/15 ring-inset has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ink ${className}`}
    >
      <span className="text-[11px] leading-tight text-mute">Budget Tier</span>
      <span aria-hidden="true" className="text-sm leading-tight font-medium">
        {BUDGET_TIER_LABELS[value]}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(BUDGET_TIERS.find((tier) => tier === event.target.value) ?? value)}
        className="absolute inset-0 cursor-pointer appearance-none rounded-full opacity-0"
      >
        {BUDGET_TIERS.map((tier) => (
          <option key={tier} value={tier}>
            {BUDGET_TIER_LABELS[tier]}
          </option>
        ))}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 12 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="pointer-events-none absolute top-1/2 right-4 size-3 -translate-y-1/2 text-mute"
      >
        <path d="m3 4.5 3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </label>
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

/** The Camera and Upload tabs, a two-way switch over the frame, with arrow keys moving between them. */
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
    <div role="tablist" aria-label="Photo source" onKeyDown={onKeyDown} className="flex rounded-full bg-ink/[0.06] p-1 text-sm font-medium">
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
            className={`h-9 flex-1 rounded-full outline-offset-2 transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-ink disabled:cursor-not-allowed ${
              selected ? "bg-white text-ink ring-1 ring-ink/10" : "text-mute hover:text-ink"
            }`}
          >
            {PHOTO_SOURCE_LABELS[source]}
          </button>
        );
      })}
    </div>
  );
}
