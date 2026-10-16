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

export function consultationRoute(consultationId: string): string {
  return `${ROUTES.myConsultations}/${encodeURIComponent(consultationId)}`;
}

/** Where a signed-in user lands. */
export const APP_HOME = ROUTES.newConsultation;
