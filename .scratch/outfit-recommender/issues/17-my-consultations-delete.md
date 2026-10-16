# 17: My Consultations and deleting a Consultation

**What to build:** A user sees all their Consultations in one list, opens any of them, and can delete one for good after a confirmation, even while it's still Styling: the Styling is cancelled and the photo, Outfits and Previews are removed at once.

**Blocked by:** [12 Previews of the user wearing each Outfit](12-previews.md)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Server operations" (Delete a Consultation; Read: the list for My Consultations), "Pages" (My Consultations), "Stylings" (Deletion), "Data model" (Deletion) and "User-facing copy" (the delete-Consultation modal), plus "Testing Decisions" (browser smoke flow 4). Stories 119–122.

- [x] My Consultations lists one row per Consultation with its photo (through a signed link), Photo Type, Outfit count, date and Budget Tier, or "Styling…" or "No Outfits" instead. Each row has Open and Delete.
- [x] Open shows the Consultation's results page.
- [x] Delete confirms in a modal that says the Consultation's photo, Outfits and Previews are gone for good.
- [x] Deleting cancels the Consultation's running Workflow run if there is one, then deletes its Stylings, Style Icons, Outfits and Pieces, plus its photo and Preview Blob objects, in the same operation.
- [x] A Styling step that tries to save after its Consultation was deleted writes nothing.
- [x] Tests cover deleting a Consultation mid-Styling.
- [x] A Playwright smoke test deletes a Consultation from My Consultations.

## Comments

Implemented. Decisions made along the way that later tickets should know:

- **The list.** `listConsultations` (`src/server/operations/consultations.ts`) is read through `getMyConsultations`. It returns the user's own Consultations, newest first. Each has its id, a signed 1-hour photo link, Photo Type, date, Budget Tier, state and `outfitCount` (its current Outfits). A signed-out visitor gets none.
  - A row reads "<Photo Type> · n Outfits", with "Styling…" or "No Outfits" in place of the count. Below that come the date and the Budget Tier, which a Face Photo doesn't have. The spec's "or 'Styling…' or 'No Outfits'" is read as replacing the count, since the Budget Tier is known either way.
  - **For ticket 30:** reading the list doesn't run the stuck check yet, though the spec says My Consultations should.
  - **For tickets 36 and 38:** the Demo Account's shared-history note isn't here yet.
- **Deleting.** `deleteConsultation` refuses with `signed-out`, or with `not-found` for someone else's Consultation, the same as for one that doesn't exist. Otherwise:
  1. Each running Styling stops as a stuck one does. Its Workflow run is cancelled through `StylingRunner.cancel`, which is `getRun(runId).cancel()` in the Workflow runner. Then `finishStyling` finishes it as broken, so a step under way saves nothing. A cancel that fails is logged and doesn't stop the deletion, since the run's steps find the Styling no longer running.
  2. One transaction deletes the Consultation row and its Blob folder, `consultations/<id>/` (`BlobStore.deleteFolder`), as ticket 12 asked. The row's Stylings, Style Icons, Outfits and Pieces go with it by cascade. If the Blob delete fails, the rows roll back, so the Consultation stays listed, its Styling already stopped, to delete again. The transaction holds the rows across the Blob calls on purpose.
  - Usage records aren't touched. Ticket 22 adds them, and the spec keeps them.
  - **For the consent-withdrawal and account-deletion tickets:** follow the same order (stop each running Styling, then delete the rows and the folder together), or call `deleteConsultation` per Consultation.
  - **Hobby Blob limits:** on Vercel, `deleteFolder` makes one `list` call per deletion, and Vercel counts `list` as an advanced operation.
- **Late writes.** Every step already checked that its Styling was still running before it saved. The Preview step now also checks again after the image model answers and before storing the Preview, so a Consultation deleted mid-Preview gets no WebP at all. A delete that lands in the moment between that check and the store is still caught: the step deletes its own WebP when its save finds the Styling gone.
- **Blob pathnames** now live in `src/server/consultations/blob-pathnames.ts`: `consultationFolder`, `photoPathnameFor` (which took over `PHOTO_EXTENSIONS`) and `previewPathnameFor`.
- **The page and modal.** My Consultations follows the history page from the Guided steps prototype: one row per Consultation, each with Open (a link to its results page) and Delete.
  - Delete opens a native `<dialog>`. It says "Delete this Consultation?" and "Its photo, Outfits and Previews are deleted for good. This can't be undone.", with Cancel and Delete.
  - Escape or Cancel keeps the Consultation, except while a delete is under way.
  - The server action calls `refresh()`, so the list re-renders without it. A delete that fails shows "We couldn't delete this Consultation. Try again." in the modal.
  - Open and Delete carry screen-reader text naming their row's Consultation. An empty list says "No Consultations yet. Start one".
  - `dangerButton` joins `src/components/ui.ts`. The modal's copy sits in the component, because `COPY` holds only wording the spec fixes word for word.
- **Tests.**
  - The server-operation tests cover:
    - the list: order, links, Budget Tier, states, Outfit counts, and only the owner's Consultations;
    - deleting: every row, the photo and the Previews go, the user's other Consultations stay, and the refusals;
    - cancelling a run before it starts, a cancel that fails, and a Blob delete that fails;
    - deleting mid-Styling while finding Style Icons, while tailoring and while making Previews, after which the step writes nothing and nothing more is stored.
  - The fakes gain settings in place of method mocks:
    - `InlineStylingRunner.cancelled` and `cancelFails`. A pending run that's cancelled never runs. One under way carries on, as if the cancel came too late.
    - `MemoryBlobStore.stored` and `deleteFolderFails`.
    - `qlooPerson` moved into `src/server/qloo/fake.ts`.
  - `e2e/my-consultations.spec.ts` is smoke flow 4. It starts a Face Photo Consultation, opens it from My Consultations, then deletes it through the modal, after which its page is a 404. Like local development, it makes a live Qloo call.
- **Checked in the browser.** One throwaway Playwright run against local development, with the fake adapter slowed to 4 s, at desktop and phone widths.
  - It showed a finished Face Photo row ("2 Outfits") and a Full-Body row still Styling ("Styling…").
  - Escape closed the modal and kept the Consultation.
  - Deleting the Full-Body Consultation mid-Styling left its Workflow run cancelled in the Local World and its Blob folder gone, with no server errors.
- **Left by the code review:** the read context, `Pick<OperationContext, "auth" | "db" | "blob" | "clock" | "requestHeaders">`, now appears three times and could become a named type.
- **Live calls used:** roughly 15 read-only calls on 2026-10-17, across the smoke-test runs and the browser check.
