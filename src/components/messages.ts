import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, USERNAME_MAX_LENGTH, USERNAME_MIN_LENGTH } from "@/config/accounts";

// Wording the spec doesn't fix, shared by more than one form, so it lives here rather than in COPY.

export const EMAILS_PAUSED = "We can't send emails right now. Please try again tomorrow.";
export const RATE_LIMITED = "Please wait a moment and try again.";
export const INVALID_EMAIL = "Enter a valid email address.";
export const INVALID_PASSWORD = `Use ${PASSWORD_MIN_LENGTH} to ${PASSWORD_MAX_LENGTH} characters.`;
export const PASSWORD_HINT = `At least ${PASSWORD_MIN_LENGTH} characters.`;
export const USERNAME_HINT = `Use ${USERNAME_MIN_LENGTH}–${USERNAME_MAX_LENGTH} letters, numbers, dots or underscores.`;
export const CHOOSE_STYLE_PREFERENCE = "Choose a Style Preference.";
export const CHOOSE_COUNTRY = "Choose your Country.";
export const INVALID_BIRTH_DATE = "Enter a real date of birth.";
export const PROFILE_SAVED = "Saved. Your next Consultations use it; earlier ones keep the profile they were made with.";
