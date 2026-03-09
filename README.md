The Ark Projects

This is a website I created around 2020 to show that I would be a good candidate for a web development job at the time.
It was built to showcase projects I was working on. I now maintain a professional portfolio at:
https://www.angel-camacho.com

Site details
- Static HTML/CSS/JS site based on the Start Bootstrap Agency template.
- Uses Bootstrap 4 and jQuery for layout and interactions.
- Images and assets live under `assets/`, with custom styling in `css/styles.css` and behavior in `js/scripts.js`.
- Contact form is disabled in this repo for safety on static hosting.

Run locally
1) Clone the repo:
   - `git clone https://github.com/angelcamach0/angelcamach0.github.io.git`
2) Serve the site from the repo root:
   - `python3 -m http.server 4269`
3) Open in your browser:
   - `http://localhost:4269`

Cloudflare content layer
- R2 is the planned primary file store for published content.
- A small Worker exposes the bucket as a tile catalog for the frontend.
- The frontend merges the remote catalog with `data/tiles.json`, with remote entries taking precedence on matching ids.
- Upload conventions and metadata are documented in `docs/r2-content-workflow.md`.
- Performance backlog and implementation order are documented in `docs/performance-roadmap.md`.
