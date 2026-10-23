// User-facing copy that the spec fixes word for word ("User-facing copy" in the spec).

const STYLING_BROKE = "Something went wrong while styling.";

/** What else to try for more Outfits. A Face Photo has no Budget Tier to suggest. */
function tryAnother(suggestBudgetTier: boolean): string {
  return `Try another ${suggestBudgetTier ? "Budget Tier or Photo Style" : "Photo Style"}`;
}

export const COPY = {
  under18: "You need to be 18 or older to use Qurator.",
  usernameTaken: "That username is taken",
  signUpsPaused: "We can't take new sign-ups right now. Please try again tomorrow.",
  botCheckFailed: "We couldn't check that you're not a bot. Please try again.",
  /** At sign-up and at an email change alike. */
  disposableAddress: "This email provider isn't accepted. Please use a different address.",
  signInMismatch: "That username or email and password don't match.",
  tooManySignIns: "Too many tries to sign in from your network. Please wait a little and try again.",
  photoTooLarge: "This file is over 20 MB.",
  photoUnreadable: "We couldn't open this file. Try a JPEG, PNG or WebP photo.",
  photoUnusable: "Something went wrong with this photo. Try another.",
  photoCheckFailed: "We couldn't check your photo just now. Try again in a moment.",
  photoLooksLike: (photoTypeLabel: string) => `This looks like a ${photoTypeLabel}.`,
  useItAs: (photoTypeLabel: string) => `Use it as a ${photoTypeLabel}`,
  photoNoPerson: "We couldn't find a person in this photo.",
  photoUnclearMainPerson: "It's not clear who the main person in this photo is. Retake it or use a different photo.",
  photoTooUnclear: "This photo is too blurry, dark or tightly cropped to work with.",
  photoNotAppropriate: "We can't use this photo.",
  /** Part of the photo notice too, on the consent sheet: raise PHOTO_NOTICE_VERSION when it changes. */
  contentRules: "Only use photos of yourself that you have the rights to, with no nudity or intimate images.",
  photoHairNotVisible: "We need to see your hair to suggest a Hairstyle.",
  /** In the Terms, and for the landing page's footer. */
  notAffiliated: "Style Icons and Brands aren't affiliated with Qurator.",
  /** The region gate. It mentions neither the Country setting nor VPNs. */
  unsupportedRegion: "Qurator isn't available where you are right now.",
  /** The quiet line after the consent sheet is closed without agreeing. */
  agreeToBothBoxes: "To get Outfits, agree to both boxes on the consent sheet.",
  /**
   * On the consent sheet, as part of the photo notice (raise PHOTO_NOTICE_VERSION when it changes),
   * and in the Privacy Policy's Photos section.
   */
  deletionPromise:
    "Your photos and Previews are deleted immediately. Leftover records in our providers' systems are gone within 36 days, Anthropic's copy within 30 days (up to 2 years for anything its trust and safety team flags), and Google's abuse-monitoring copy within 55 days.",
  withdrawPhotoConsent: "Withdraw photo consent",
  deleteAccount: "Delete account",
  /** The account-deletion modal, which then asks for the password. */
  accountDeletionWarning:
    "This deletes your account and every Consultation, with its photos and Previews, right away. Copies in our providers' systems are gone within 36 days, Anthropic's within 30 days (up to 2 years for anything its trust and safety team flags), and Google's abuse-monitoring copy within 55 days. This can't be undone.",
  /** On the landing page, once the account is deleted. */
  accountDeleted: "Your account has been deleted.",
  /** The allowance line beside every action that uses Outfits. */
  outfitsItUses: (outfits: number, left: number) => `Uses ${outfits} of your ${left} Outfits left today`,
  allowanceUsedUp: (allowance: number, time: string) => `You've made today's ${allowance} Outfits. More from ${time}.`,
  photoCheckLimitReached: (limit: number, time: string) => `You've checked ${limit} photos today. More from ${time}.`,
  /** The app-wide 24-hour cap. */
  appWideCapForNow: "Qurator has made all the Outfits it can for now. Please try again in a few hours.",
  /** The app-wide monthly cap, and the Qloo and product-search backstops. */
  appWideCapForMonth: (date: string) => `Qurator has made all the Outfits it can for this month. Back on ${date}.`,
  faceGuide: "keep your face above this line",
  takingLonger: "This is taking longer than usual.",
  /** The control under a running Styling's checklist that opens the Stylist's Notes. */
  seeWhatYourStylistIsDoing: "See what your AI Stylist is doing",
  /** In the Stylist's Notes before the Stylist has written any. */
  stylistGettingStarted: "Your AI Stylist is getting started.",
  /** The collapsed section of the Stylist's Notes below the Outfits, and the control under a failed Styling's line that opens its notes. */
  yourStylistsNotes: "Your AI Stylist's notes",
  /** The entry of "Your AI Stylist's notes" for a new Consultation's first Styling. */
  firstStyling: "First Styling",
  /** The button below the Outfits, and the entry of "Your AI Stylist's notes" for a Styling it started. */
  showMoreOutfits: "Show 2 more Outfits",
  /** The entry of "Your AI Stylist's notes" for a Budget Tier change, given the Budget Tier it changed to. */
  budgetTierChangedTo: (budgetTier: string) => `Budget Tier changed to ${budgetTier}`,
  /** The entry of "Your AI Stylist's notes" for a Photo Style change, given the Photo Style it changed to. */
  photoStyleChangedTo: (photoStyle: string) => `Photo Style changed to ${photoStyle}`,
  aiGenerated: "AI-generated",
  /** On every Outfit card with Product Pieces, whose Preview is drawn from their sellers' photos. */
  productPhotoCredit: "Product photos © their sellers",
  /** In place of the price and link of a Product its latest check found no longer offered. */
  noLongerAvailable: "No longer available",
  /** After "Whole Outfit about <amount>", when that total leaves out Products no longer available. */
  leavesOutOfTotal: (pieces: number) => `(leaves out ${pieces} ${pieces === 1 ? "Piece" : "Pieces"} no longer available)`,
  /** Beside every sample person's photo on the landing page, with `aiGeneratedPersonAlt` as its alt text. */
  aiGeneratedPerson: "AI-generated person: not a real person.",
  aiGeneratedPersonAlt: "AI-generated photo of a fictional person",
  previewRefused: "No Preview for this Outfit: the image model declined to make one",
  previewFailed: "No Preview for this Outfit: the image model couldn't make one",
  everyPreviewRefused: "The image model declined this photo. A different photo may work better.",
  /** In place of "Show 2 more Outfits" once its Style Icons run out, or it failed. */
  everyOutfitBuilt: (suggestBudgetTier: boolean) => `That's every Outfit we can build for this photo. ${tryAnother(suggestBudgetTier)} for more.`,
  /**
   * A Budget Tier change that built nothing: the failed re-styling line, given the Budget Tier of
   * the Outfits still shown, or null on a Consultation with No Outfits, which had none to keep.
   */
  budgetTierChangeBuiltNothing: (tried: string, previous: string | null) =>
    `We couldn't build Outfits at ${tried} for this photo. ${previous ? `Your ${previous} Outfits are still here` : tryAnother(true)}.`,
  /** A Photo Style change that built nothing, likewise: the Photo Style version of the line. */
  photoStyleChangeBuiltNothing: (tried: string, previous: string | null, suggestBudgetTier: boolean) =>
    `We couldn't build ${tried} Outfits for this photo. ${previous ? `Your ${previous} Outfits are still here` : tryAnother(suggestBudgetTier)}.`,
  /**
   * A new Consultation whose first Styling built nothing, given its Budget Tier, or null for a Face
   * Photo, which has none, so only another Photo Style is suggested.
   */
  firstStylingBuiltNothing: (tier: string | null) =>
    `We couldn't build Outfits for this photo${tier ? ` at ${tier}` : ""}. ${tryAnother(tier !== null)}.`,
  /**
   * A Styling that broke, shown with "Try again", given the Budget Tier or Photo Style of the
   * Outfits a re-styling kept, or null when there are none.
   */
  stylingBroke: (previous: string | null) => (previous ? `${STYLING_BROKE} Your ${previous} Outfits are still here.` : STYLING_BROKE),
  verifyBanner: (email: string, deletionDate: string) =>
    `We sent a link to ${email}. Verify it to start your first Consultation. Unverified accounts are deleted on ${deletionDate}.`,
  resendLink: "Resend link",
  changeEmail: "Change email",
  emailVerified: "Email verified",
  /** A verification, password reset or email-change link that didn't work. */
  badLink: "This link has expired or isn't valid",
  sendNewLink: "Send a new link",
  signInForNewLink: "Sign in to get a new one",
  resetLinkSent: "If an account uses that email, we've sent a link.",
  emailChangeSent: "If that address isn't already in use, we've sent a link to it.",
  /** Settings' read-only date of birth: "Born March 1999 · Wrong? Email us", where "Email us" links to the team. */
  bornIn: (monthAndYear: string) => `Born ${monthAndYear}`,
  birthDateWrong: "Wrong?",
  emailUs: "Email us",
  signOutEverywhere: "Sign out of all devices",
  /** What Sign out and "Sign out of all devices" say while they work. */
  signingOut: "Signing out…",
  /** Beside each Settings item the Demo Account can't change, with a lock icon. */
  managedByTheTeam: "Managed by the team",
  /** On the Demo Account's consent sheet, as part of its photo notice, and on its My Consultations. */
  sharedDemoAccount: "Shared demo account: anyone with this login can see Consultations made here. Delete yours when you're done.",
  emailUsForData: "Email us for a copy of your data",
  didNotSignUp: (date: string) => `Didn't sign up? Ignore this email. The account is removed on ${date}.`,
} as const;
