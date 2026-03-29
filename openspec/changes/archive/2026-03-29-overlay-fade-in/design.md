## Context

The renderer already drives a `constellationAlpha` scalar (0→1) during the last 40% of the landing-to-result camera transition. Custom constellation edges and star dots multiply their draw-call `globalAlpha` by this value. The two overlay draw calls — `drawIAULines` (0.25 hardcoded) and `drawNamedStars` (0.85 hardcoded) — bypass `constellationAlpha` entirely, so they snap to full opacity at the moment the overlay data is first rendered rather than fading in with everything else.

## Goals / Non-Goals

**Goals:**
- IAU constellation lines fade in with `constellationAlpha` (max opacity 0.25)
- Named star labels fade in with `constellationAlpha` (max opacity 0.85)
- Behaviour on the landing page is unchanged (`constellationAlpha` is 1 outside of a forward transition)

**Non-Goals:**
- Changing overlay max-opacity values
- Changing when overlays are fetched or rendered
- Any change to the return (result-to-landing) transition

## Decisions

**Multiply, don't branch.**
Each draw call already has a single `ctx.globalAlpha` assignment. Multiplying that value by `constellationAlpha` is a one-liner per function and requires no new state or conditionals. The alternative — gating behind `constellationAlpha > 0` — adds a branch that would hide overlays on the landing page when `constellationAlpha` happens to be 0 (e.g. if `animateToResult` was just called), which is the correct behaviour anyway, but is already handled by multiplying.

## Risks / Trade-offs

- **Landing-page display**: `constellationAlpha` is 1 outside of a forward transition, so landing-page IAU lines and labels are unaffected. Risk: low.
- **Very short fade window**: overlays and custom constellation share the same 40% fade window; they will all appear at the same visual pace. This is the desired behaviour per the proposal.
