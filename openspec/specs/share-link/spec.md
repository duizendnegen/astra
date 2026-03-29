## ADDED Requirements

### Requirement: Constellation encoded as URL parameter
The system SHALL encode the full constellation state as a base64 URL parameter. The encoded payload SHALL include: the original word, the HYG star IDs of matched stars, the edge list, and the patch centre RA/Dec. Encoding: compact JSON → base64 → single URL parameter named `c`.

#### Scenario: Share link generated
- **WHEN** the user activates Share Link
- **THEN** a URL is produced containing the full constellation encoded as the `c` parameter

#### Scenario: Encoded payload is complete
- **WHEN** the URL is generated
- **THEN** decoding the `c` parameter yields the word, HYG star IDs, edges, and patch RA/Dec

### Requirement: Share link copied to clipboard
The system SHALL copy the share link to the user's clipboard when the Share Link button is activated, and provide brief visual confirmation.

#### Scenario: Link copied
- **WHEN** the user activates Share Link
- **THEN** the URL is copied to the clipboard and a confirmation indicator is shown

### Requirement: Shared link renders constellation without backend
The system SHALL decode the `c` URL parameter on page load and render the encoded constellation directly, bypassing the skeleton API and matching algorithm. All data required for rendering is present in the URL.

#### Scenario: Shared URL loaded
- **WHEN** a URL with a valid `c` parameter is opened
- **THEN** the canvas renders the encoded constellation directly from the URL data, without any API call

#### Scenario: Invalid or missing parameter
- **WHEN** the `c` parameter is absent, malformed, or fails to decode
- **THEN** the landing state is shown with no error displayed to the user
