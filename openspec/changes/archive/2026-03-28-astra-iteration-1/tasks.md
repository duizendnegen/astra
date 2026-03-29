## 1. Project Setup

- [x] 1.1 Initialise project structure: `frontend/`, `lambda/`, `infra/` directories
- [x] 1.2 Set up frontend build tooling (Vite + vanilla JS/TS)
- [x] 1.3 Add D3.js dependency to frontend
- [x] 1.4 Initialise CDK app in `infra/` with TypeScript
- [x] 1.5 Initialise Lambda project in `lambda/` with Node.js + TypeScript
- [x] 1.6 Download and filter HYG catalogue to magnitude ≤ 6, export as JSON asset (~9,000 stars with RA, Dec, magnitude, HYG ID)

## 2. AWS Infrastructure (CDK)

- [x] 2.1 Define S3 bucket (private) with OAC
- [x] 2.2 Define ACM certificate for `astra.plusx.black` in `us-east-1` with DNS validation against Route53 `plusx.black` zone
- [x] 2.3 Define CloudFront distribution with S3 origin (OAC), custom domain, HTTPS redirect, and ACM cert
- [x] 2.4 Define Route53 A alias record for `astra.plusx.black` → CloudFront
- [x] 2.5 Define DynamoDB table (`astra-skeletons`, PK: `word`, on-demand billing)
- [x] 2.6 Define Lambda function with DynamoDB read/write IAM policy and OpenRouter API key from SSM Parameter
- [x] 2.7 Define HTTP API Gateway with `POST /api/skeleton` route → Lambda, attached to CloudFront as `/api/*` origin
- [x] 2.8 Add CloudFront invalidation (`/*`) as CDK custom resource triggered on S3 deployment
- [ ] 2.9 Run `cdk deploy` to staging environment and verify all resources provisioned

## 3. Skeleton Lambda

- [x] 3.1 Implement word normalisation (lowercase, trim)
- [x] 3.2 Implement DynamoDB cache lookup by normalised word
- [x] 3.3 Implement OpenRouter API call with skeleton prompt and JSON response parsing
- [x] 3.4 Implement JSON schema validation for skeleton response (`name`, `points`, `edges`)
- [x] 3.5 Implement one-retry logic on schema validation failure
- [x] 3.6 Implement triangle fallback on second failure
- [x] 3.7 Implement DynamoDB cache write on successful LLM response
- [ ] 3.8 Test end-to-end with 10 words: 5 concrete (wolf, horse, fish, eagle, tree), 5 abstract (longing, justice, grief, hope, chaos)

## 4. Star Field Renderer

- [x] 4.1 Load and parse HYG JSON asset on page load; disable submit until ready
- [x] 4.2 Implement D3 stereographic projection with configurable `rotate` and `scale`
- [x] 4.3 Implement `scale` calculation from short viewport dimension and FOV: `(shortDim / 2) / (2 × tan(fov / 2))`
- [x] 4.4 Render all ~9,000 stars as canvas arcs with radius and opacity by magnitude
- [x] 4.5 Set landing camera state: centre RA 83.8°, Dec −5.4°, FOV 60°
- [x] 4.6 Implement canvas resize handler: recalculate scale and redraw on window resize

## 5. Star Matching

- [x] 5.1 Implement 25° candidate patch extraction: select N brightest stars where N ≈ skeleton point count
- [x] 5.2 Implement point normalisation to unit scale for both skeleton and candidate stars
- [x] 5.3 Implement Hungarian algorithm for optimal point-to-star assignment
- [x] 5.4 Implement rotation testing across candidate orientations, select best-scoring assignment
- [x] 5.5 Implement 60% coverage threshold: accept match or resample patch and retry
- [x] 5.6 Return matched result: HYG star IDs, edges, patch centre RA/Dec

## 6. Camera Animation

- [x] 6.1 Implement D3 tween interpolating `rotate` (RA/Dec centre) from landing state to matched patch centre
- [x] 6.2 Implement D3 tween interpolating `scale` from 60° FOV to 25° FOV simultaneously
- [x] 6.3 Set animation duration to ~2s with ease-in-out easing; redraw canvas each frame
- [x] 6.4 Trigger brightness dimming, constellation rendering, and overlay fade-in on animation complete

## 7. Constellation Rendering

- [x] 7.1 Implement per-star brightness dimming by angular distance from patch centre
- [x] 7.2 Render constellation edges as canvas lines between matched stars (#a7c8ff, reduced opacity)
- [x] 7.3 Render matched stars enlarged and brightened over background
- [x] 7.4 Implement word overlay and constellation name as HTML/CSS absolutely positioned over canvas
- [x] 7.5 Display RA/Dec metadata (formatted) in left margin
- [x] 7.6 Implement Regenerate action: re-run matching on new patch, animate camera to new centre

## 8. Share Link

- [x] 8.1 Implement constellation serialisation: `{ word, starIds, edges, patchRA, patchDec }` → compact JSON → base64
- [x] 8.2 Implement Share Link button: encode, write to clipboard, show confirmation indicator
- [x] 8.3 Implement URL decode on page load: detect `c` parameter, bypass API + matching, render directly from decoded data
- [x] 8.4 Implement graceful fallback for missing/invalid `c` parameter: show landing state silently

## 9. PNG Export

- [x] 9.1 Await `document.fonts.ready` before export
- [x] 9.2 Composite word overlay and constellation name onto canvas via `ctx.fillText()` matching HTML overlay position and style
- [x] 9.3 Draw "astra.plusx.black" credit line in lower corner
- [x] 9.4 Export via `canvas.toDataURL("image/png")` and trigger download
- [ ] 9.5 Verify export contains no UI chrome (buttons, inputs, navigation)

## 10. Polish & Deploy

- [x] 10.1 Implement subtle loading indicator while HYG catalogue loads
- [x] 10.2 Implement loading state during LLM call (star field visible and live, submit disabled)
- [ ] 10.3 Mobile testing: verify 60° FOV landing and 25° result on portrait viewport
- [ ] 10.4 Verify share link round-trip: generate → encode → open link → render identically
- [ ] 10.5 Sync frontend build to S3, trigger CloudFront invalidation, verify astra.plusx.black
