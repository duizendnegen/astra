## 1. Fade IAU lines with constellationAlpha

- [x] 1.1 In `drawIAULines`, change `ctx.globalAlpha = 0.25` to `ctx.globalAlpha = 0.25 * constellationAlpha`

## 2. Fade named star labels with constellationAlpha

- [x] 2.1 In `drawNamedStars`, change `ctx.globalAlpha = 0.85` to `ctx.globalAlpha = 0.85 * constellationAlpha`

## 3. Verify

- [x] 3.1 With `show_lines=1&show_stars=1`, confirm overlays fade in alongside the custom constellation during the result transition
- [x] 3.2 Confirm overlays remain at full opacity on the landing page (no regression)
