## Why

astra.plusx.black is a new web application where users enter any word and the app finds a real pattern in the night sky that matches its shape, drawing a novel constellation anchored in genuine star data. Iteration 1 establishes the complete core experience: a beautiful real star field, word-driven constellation generation via LLM + star matching, sharing via URL, and PNG export.

## What Changes

- New application — no existing codebase. This proposal covers the full Iteration 1 build.
- Static frontend (HTML/JS/Canvas) deployed to AWS S3 + CloudFront at astra.plusx.black
- AWS Lambda endpoint (`POST /api/skeleton`) proxies LLM calls via OpenRouter and caches results in DynamoDB
- Full AWS infrastructure defined in CDK
- Star field rendered from real HYG catalogue data (~9,000 stars, magnitude ≤ 6)
- Word → skeleton → star matching → constellation pipeline
- Share via URL (base64-encoded constellation data, no backend required for replay)
- Export as PNG

## Capabilities

### New Capabilities

- `star-field`: Real star field rendered on HTML Canvas using HYG catalogue data and D3 stereographic projection. Camera model with pan/zoom animation. Initial view centred on Orion (RA 83.8°, Dec −5.4°), 60° field of view anchored to short viewport dimension.
- `skeleton-generation`: Lambda endpoint accepting a word, returning a JSON skeleton (points, edges, constellation name) via OpenRouter. DynamoDB cache keyed by word. Triangle fallback on LLM failure after one retry.
- `star-matching`: Client-side Hungarian algorithm matching LLM skeleton keypoints to real stars in a candidate 25° sky patch. Rotation and scale tolerance, 60% coverage threshold, retry with new patch on failure.
- `constellation-rendering`: Drawing matched constellation edges between real stars on the canvas. Matched stars brightened; background stars dimmed by distance from constellation centre. Word overlay and generated constellation name as HTML/CSS composited at export.
- `camera-animation`: Pan and zoom transition from landing state (Orion, 60°) to result state (matched patch centre, 25°) over ~2s on constellation ready.
- `share-link`: URL encoding of full constellation data (word, HYG star IDs, edges, patch RA/Dec) as base64 parameter. Decode and render identically without backend.
- `png-export`: Canvas export via `toDataURL()` with word overlay composited in. Credit line "astra.plusx.black" in lower corner.
- `aws-infrastructure`: CDK stack — S3 + CloudFront (OAC, private bucket), ACM certificate (us-east-1), Route53 alias, API Gateway + Lambda, DynamoDB on-demand.

### Modified Capabilities

None — greenfield project.

## Impact

- New domain: astra.plusx.black (DNS via existing Route53 plusx.black zone)
- New AWS resources: S3, CloudFront, ACM, API Gateway, Lambda, DynamoDB (all provisioned via CDK)
- Runtime dependencies: D3.js (projection + rendering), OpenRouter API (LLM calls)
- HYG star catalogue bundled as static asset (~1MB gzipped)
