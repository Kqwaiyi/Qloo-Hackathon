export const ROUTES = {
  home: "/",
  signIn: "/sign-in",
  signUp: "/sign-up",
  forgotPassword: "/forgot-password",
  /** Where a verification link lands once Better Auth has checked it: the verification result. */
  verifyEmail: "/verify-email",
  newConsultation: "/consultations/new",
  myConsultations: "/consultations",
  settings: "/settings",
  terms: "/terms",
  privacy: "/privacy",
} as const;

export function consultationRoute(consultationId: string): string {
  return `${ROUTES.myConsultations}/${encodeURIComponent(consultationId)}`;
}

/** What a page waiting on a Consultation's Styling polls. */
export function stylingStatusRoute(consultationId: string): string {
  return `/api/consultations/${encodeURIComponent(consultationId)}/styling`;
}

/** Where Better Auth's own endpoints are served. */
export const AUTH_API_PATH = "/api/auth";

/** The Better Auth endpoints our code names, under AUTH_API_PATH. */
export const AUTH_ENDPOINTS = {
  signUp: "/sign-up/email",
  sendVerificationEmail: "/send-verification-email",
  changeEmail: "/change-email",
  verifyEmail: "/verify-email",
} as const;

/** Where a signed-in user lands. */
export const APP_HOME = ROUTES.newConsultation;

/** Where a verification link lands once it has worked: New Consultation, saying "Email verified". */
export const EMAIL_VERIFIED_PARAM = "email-verified";
export const EMAIL_VERIFIED_ROUTE = `${ROUTES.newConsultation}?${EMAIL_VERIFIED_PARAM}=1`;
