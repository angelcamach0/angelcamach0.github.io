# Performance roadmap

This document turns the current site performance work into a tracked backlog.

The goal is simple: make the site feel immediate without flattening the visual direction.

## Current observations

- The initial page payload is small overall, but the main client runtime is concentrated in `js/scripts.js` at about `95 KB` unminified.
- Startup currently does several kinds of work together: route rendering, tile catalog loading, home-stage setup, local time updates, and weather/geolocation-related work.
- The CSS relies on expensive visual effects in a few places: animated glow, layered shadows, backdrop blur, floating glass, and the terminal CRT overlay.
- The Worker already sets cache headers and ETags, but the current cache windows are still conservative for mostly-static content.

## Backlog

1. `#12` Defer noncritical frontend boot work
   Reduce first-load work by delaying weather, geolocation, catalog fetches, and other nonessential startup tasks until idle time or explicit user navigation.

2. `#15` Improve cache strategy for catalog, content, and previews
   Increase reuse across repeat visits and route changes with better Worker cache headers and client-side caching where it is safe.

3. `#14` Gate expensive visual effects by device capability
   Keep the aesthetic, but ship cheaper rendering paths on mobile, coarse-pointer, and reduced-motion contexts.
   Related existing issue: `#10` documents the brand glow text-shadow regression.

4. `#13` Split the frontend runtime into lazy-loaded modules
   Break the monolithic client script into route- or feature-scoped modules so the first load parses less JavaScript.

5. `#16` Apply content-visibility and containment to offscreen views
   Let the browser skip layout and paint work for content that has not entered view yet.

6. `#17` Add a lightweight build and minification pipeline
   Minify static assets, improve cache-busting, and stop relying on hand-managed version query strings.

7. `#18` Pre-render the initial home and grid experience
   Make the first visible screen meaningful before the full client runtime finishes enhancement.

## Recommended order

1. `#12`
2. `#15`
3. `#14` with `#10`
4. `#13`
5. `#16`
6. `#17`
7. `#18`

## What to measure

- Time until the home view is visibly stable
- JavaScript downloaded and executed before the user opens Grid
- Number of requests fired on a cold load
- Repeat-visit latency for catalog and preview content
- Animation smoothness on mobile devices
