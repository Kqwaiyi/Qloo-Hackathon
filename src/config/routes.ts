export const ROUTES = {
  home: "/",
  signIn: "/sign-in",
  signUp: "/sign-up",
  forgotPassword: "/forgot-password",
  newConsultation: "/consultations/new",
  myConsultations: "/consultations",
  settings: "/settings",
  terms: "/terms",
  privacy: "/privacy",
} as const;

/** Where a signed-in user lands. */
export const APP_HOME = ROUTES.newConsultation;
