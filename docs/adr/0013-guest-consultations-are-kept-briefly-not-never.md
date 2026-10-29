# Guest Consultations are kept briefly, not never

The Guest Page promises that a Guest's data isn't kept. Yet a Styling is a durable Workflow that receives only a Styling's id and reads everything else back from the database, and its Previews are drawn from a photo in Blob storage, so nothing can run without being stored. So a Guest Consultation is stored like any other Consultation under a throwaway user: one per Guest, marked as a guest, with no email or password, that can never sign in. It is deleted with everything in it, photo and Previews included, once it is an hour old: whenever any Guest starts or opens a Guest Consultation, with the daily sweep as the backstop, so the Privacy Policy promises deletion within 24 hours. No Consultation is deleted while its Styling is running. To hold each internet address to one Guest Consultation in any 24 hours, a salted hash of the IP address, never the address itself, is kept for 24 hours, together with that address's photo checks.

## Considered Options

- **Store nothing: run the whole Styling in memory in one request**: truly keeps nothing, but means rewriting the Workflow, its retries and its Stylist's Notes polling, and a Styling outlasts a single request.
- **Consultations with no owner**: an optional user on the Consultation keeps the throwaway user out of the database, but needs a second, guest-only path through every ownership check, the Styling status and deletion.
- **An hourly cron to delete on the hour**: a firm one-hour promise, but Vercel Hobby runs crons only once a day.

## Consequences

- Anything that lists or counts users, such as the daily sweep's inactive-account deletions, must skip or handle guest users.
- A Guest's results are lost if they create an account; nothing carries over.
- Shared networks share one Guest Consultation a day, and a VPN gets round the limit. The Bot Check on "Get my Outfits" and the app-wide caps are what protect the public demo's costs.
