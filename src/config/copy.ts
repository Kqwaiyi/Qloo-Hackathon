// User-facing copy that the spec fixes word for word ("User-facing copy" in the spec).

const STYLING_BROKE = "Something went wrong while styling.";

/** What else to try for more Outfits. A Face Photo has no Budget Tier to suggest. */
function tryAnother(suggestBudgetTier: boolean): string {
  return `Try another ${suggestBudgetTier ? "Budget Tier or Photo Style" : "Photo Style"}`;
}

export const COPY = {
  under18: "You need to be 18 or older to use Outfit Recommender.",
  usernameTaken: "That username is taken",
  signUpsPaused: "We can't take new sign-ups right now. Please try again tomorrow.",
  signInMismatch: "That username or email and password don't match.",
  photoTooLarge: "This file is over 20 MB.",
  photoUnreadable: "We couldn't open this file. Try a JPEG, PNG or WebP photo.",
  photoUnusable: "Something went wrong with this photo. Try another.",
  photoCheckFailed: "We couldn't check your photo just now. Try again in a moment.",
  photoLooksLike: (photoTypeLabel: string) => `This looks like a ${photoTypeLabel}.`,
  useItAs: (photoTypeLabel: string) => `Use it as a ${photoTypeLabel}`,
  photoNoPerson: "We couldn't find a person in this photo.",
  photoMoreThanOnePerson: "There's more than one person here. Use a photo of just you.",
  photoTooUnclear: "This photo is too blurry, dark or tightly cropped to work with.",
  photoNotAppropriate: "We can't use this photo.",
  /** Part of the photo notice too, on the consent sheet: raise PHOTO_NOTICE_VERSION when it changes. */
  contentRules: "Only use photos of yourself that you have the rights to, with no nudity or intimate images.",
  photoHairNotVisible: "We need to see your hair to suggest a Hairstyle.",
  /** In the Terms, and for the landing page's footer. */
  notAffiliated: "Style Icons and Brands aren't affiliated with Outfit Recommender.",
  /** The region gate. It mentions neither the Country setting nor VPNs. */
  unsupportedRegion: "Outfit Recommender isn't available where you are right now.",
  /** The quiet line after the consent sheet is closed without agreeing. */
  agreeToBothBoxes: "To get Outfits, agree to both boxes on the consent sheet.",
  /**
   * On the consent sheet, as part of the photo notice (raise PHOTO_NOTICE_VERSION when it changes),
   * and in the Privacy Policy's Photos section.
   */
  deletionPromise:
    "Your photos and Previews are deleted immediately. Leftover records in our providers' systems are gone within a day, and Google's abuse-monitoring copy within 55 days.",
  withdrawPhotoConsent: "Withdraw photo consent",
  deleteAccount: "Delete account",
  /** The account-deletion modal, which then asks for the password. */
  accountDeletionWarning:
    "This deletes your account and every Consultation, with its photos and Previews, right away. Copies in our providers' systems are gone within a day, and Google's abuse-monitoring copy within 55 days. This can't be undone.",
  /** On the landing page, once the account is deleted. */
  accountDeleted: "Your account has been deleted.",
  /** The allowance line beside every action that uses Outfits. */
  outfitsItUses: (outfits: number, left: number) => `Uses ${outfits} of your ${left} Outfits left today`,
  allowanceUsedUp: (allowance: number, time: string) => `You've made today's ${allowance} Outfits. More from ${time}.`,
  photoCheckLimitReached: (limit: number, time: string) => `You've checked ${limit} photos today. More from ${time}.`,
  /** The app-wide 24-hour cap. */
  appWideCapForNow: "Outfit Recommender has made all the Outfits it can for now. Please try again in a few hours.",
  /** The app-wide monthly cap, and the Qloo backstop. */
  appWideCapForMonth: (date: string) => `Outfit Recommender has made all the Outfits it can for this month. Back on ${date}.`,
  faceGuide: "keep your face above this line",
  takingLonger: "This is taking longer than usual.",
  aiGenerated: "AI-generated",
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
  emailUsForData: "Email us for a copy of your data",
  didNotSignUp: (date: string) => `Didn't sign up? Ignore this email. The account is removed on ${date}.`,
} as const;
