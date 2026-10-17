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

## Formats (`reel_spec.format`)
- `passage` (default): the passage phrase by phrase. Rendered exactly as before when no extras are set.
- `oneline`: one short passage, its words lighting up one by one over a faint ghost of the whole line (~18–24 s).
- `breath`: one short verse above a gold ring that breathes: in 4 s, hold 4 s, let go 6 s, three times (~50 s).
- `examen`: three questions, one at a time, then a blessing in italics (~30–40 s).
- `week`: the past week's morning posts as slides (`slides` resolved by the API), then "a new passage every morning".

Extras on any format: `place` (a quiet caption at the start), `dim` (light to candle-dark at the end),
`teaser` (a "Tomorrow, 7:30 AM" card showing the next morning post, resolved by the API).

Local samples of every format, from synthetic images: `node test.mjs test-out`.
