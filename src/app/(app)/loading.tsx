import { LoadingPlaceholder } from "./loading-placeholder";

/**
 * The app pages' loading boundary, shown at once on a change between Settings and the
 * Consultations pages. Without one, Next.js doesn't prefetch these dynamic pages, and a click
 * shows nothing until the whole page has arrived.
 */
export default function Loading() {
  return <LoadingPlaceholder />;
}
