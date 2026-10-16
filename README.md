# cathedral-whispers-reels

Renders the vertical videos (Reels) for the Cathedral Whispers Facebook Page.

- `worker.mjs` runs in GitHub Actions every 2 hours: it asks the Supabase `reels-api` function for
  Reels scheduled in the next 4 days, renders each one with `render.mjs`, uploads the MP4 and reports back.
  The only credential is GitHub's short-lived OIDC token, which the API verifies (this repo, `main` branch).
- `render.mjs`: 1080×1920, 30 fps H.264 + AAC. A slow push into the photo, the title in gilded small caps,
  the passage appearing phrase by phrase, an end card with the citation.
- `audio/`: original ambient organ beds, synthesized from sine waves by `audio/make_beds.py` (no samples).
- `fonts/`: EB Garamond, Cinzel, Cormorant Garamond (SIL Open Font License, see the OFL files).

Local test: `node render.mjs --job job.json --out out.mp4 --photo photo.jpg --poster poster.jpg`
