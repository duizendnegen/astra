## 1. Fix encode/decode in share.ts

- [x] 1.1 Add `cids: number[]` field to the `Encoded` interface in `share.ts`
- [x] 1.2 Update `encode()` to populate `cids` from `state.match.constellationStars.map(s => s.id)`
- [x] 1.3 Update `decode()` to look up `cids` from the catalogue and reconstruct `constellationStars`
- [x] 1.4 Make `decode()` return `null` when `cids` is absent or any id cannot be resolved

## 2. Fix buildShareUrl flag preservation

- [x] 2.1 Update `buildShareUrl()` to copy `show_stars` and `show_lines` from current URL params into the generated URL when they are set to `'1'`

## 3. Tests

- [x] 3.1 Update the existing round-trip test in `share.test.ts` to include `constellationStars` in the mock state and assert they survive encode/decode
- [x] 3.2 Add test: decoding a payload without `cids` returns `null`
- [x] 3.3 Add test: `buildShareUrl` preserves `show_stars=1` and `show_lines=1` in the output URL
- [x] 3.4 Add test: `buildShareUrl` omits flag params when they are not present in current location
