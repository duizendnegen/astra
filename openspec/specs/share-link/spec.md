## ADDED Requirements

### Requirement: Constellation encoded as URL parameter
The system SHALL encode the full constellation state as a base64 URL parameter. The encoded payload SHALL include: the original word, the HYG star IDs of on-pattern matched stars (`ids`), the HYG star IDs of constellation rendering stars (`cids`), the edge list, and the patch centre RA/Dec. Encoding: compact JSON → base64 → single URL parameter named `c`.

#### Scenario: Share link generated
- **WHEN** the user activates Share Link
- **THEN** a URL is produced containing the full constellation encoded as the `c` parameter

#### Scenario: Encoded payload is complete
- **WHEN** the URL is generated
- **THEN** decoding the `c` parameter yields the word, HYG star IDs for both `stars` and `constellationStars`, edges, and patch RA/Dec

#### Scenario: Decoded MatchResult is renderer-compatible
- **WHEN** a valid share URL is decoded
- **THEN** the resulting `MatchResult` has non-empty `stars`, non-empty `constellationStars`, and valid `edges`, `patchRA`, and `patchDec` fields

#### Scenario: Payload missing cids returns null
- **WHEN** the `c` parameter decodes to a payload without a `cids` field
- **THEN** `decode()` returns `null` and the landing state is shown

### Requirement: Share link copied to clipboard
The system SHALL copy the share link to the user's clipboard when the Share Link button is activated, and provide brief visual confirmation.

#### Scenario: Link copied
- **WHEN** the user activates Share Link
- **THEN** the URL is copied to the clipboard and a confirmation indicator is shown

### Requirement: Share URL preserves active feature flags
The system SHALL include any active feature flags (`show_stars`, `show_lines`) in the generated share URL so that recipients see the same overlay configuration as the sender.

#### Scenario: Flags preserved when active
- **WHEN** the current URL contains `?show_stars=1` or `?show_lines=1` and the user activates Share Link
- **THEN** the generated URL contains those same flag parameters alongside `c`

#### Scenario: Flags omitted when inactive
- **WHEN** neither `show_stars` nor `show_lines` is present in the current URL
- **THEN** the generated share URL contains only the `c` parameter

### Requirement: Shared link renders constellation without backend
The system SHALL decode the `c` URL parameter on page load and render the encoded constellation directly, bypassing the skeleton API and matching algorithm. All data required for rendering — including both `stars` and `constellationStars` — is present in the URL.

#### Scenario: Shared URL loaded
- **WHEN** a URL with a valid `c` parameter is opened
- **THEN** the canvas renders the encoded constellation directly from the URL data, without any API call

#### Scenario: Invalid or missing parameter
- **WHEN** the `c` parameter is absent, malformed, or fails to decode
- **THEN** the landing state is shown with no error displayed to the user

### Requirement: Share encode/decode round-trips both star arrays
The system SHALL have tests verifying that encoding a `ConstellationState` and decoding it produces an identical state, including both `stars` and `constellationStars`.

#### Scenario: Round-trip preserves constellationStars
- **WHEN** a state with distinct `stars` and `constellationStars` is encoded then decoded
- **THEN** the decoded `constellationStars` matches the original by star id, ra, dec, and mag

#### Scenario: Round-trip preserves feature flags in URL
- **WHEN** `buildShareUrl` is called while `show_stars=1` is present in the current location
- **THEN** the resulting URL includes `show_stars=1` alongside `c`
