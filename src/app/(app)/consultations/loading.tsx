import { LoadingPlaceholder } from "../loading-placeholder";

/**
 * My Consultations, New Consultation and each Consultation share this segment, so a change between
 * them stays inside the app pages' boundary, which is already showing a page. During a navigation
 * React keeps that page on screen instead of the boundary's placeholder, so they need this one.
 */
export default function Loading() {
  return <LoadingPlaceholder />;
}
