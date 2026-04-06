## ADDED Requirements

### Requirement: Search failure shows "No constellation found."
When the constellation search fails — either because the API returns a non-200 response or because the client-side timeout fires — the system SHALL display the text "No constellation found." in the `#catalogue-status` element. The element SHALL have the `.status-error` CSS class applied, which renders it at `opacity: 0.8`. The loading state SHALL be cleared before the error text is shown. The search input and button SHALL be re-enabled.

#### Scenario: API returns 422
- **WHEN** the backend returns HTTP 422 (no constellation found)
- **THEN** `#catalogue-status` shows "No constellation found." with class `.status-error`

#### Scenario: Client timeout fires
- **WHEN** 20 seconds elapse without a response from the API
- **THEN** the fetch is aborted, `#catalogue-status` shows "No constellation found." with class `.status-error`

#### Scenario: Error cleared on next search
- **WHEN** the user submits a new word after an error
- **THEN** the `.status-error` class is removed and loading messages resume normally

### Requirement: 20-second client-side fetch timeout
The frontend SHALL cancel the in-flight `/api/constellation` request using `AbortController` if no response is received within 20 seconds. On abort, the search SHALL be abandoned — no automatic retry SHALL occur.

#### Scenario: Abort fires after 20 seconds
- **WHEN** the API has not responded after 20 000 ms
- **THEN** the `AbortController` signal fires, the fetch rejects, and the error message is shown

#### Scenario: Abort timer cleared on success
- **WHEN** the API responds successfully before the 20-second timeout
- **THEN** the abort timer is cleared and the constellation is rendered normally

### Requirement: Error state CSS modifier
The stylesheet SHALL define a `.status-error` modifier class that sets `opacity: 0.8` on the `#catalogue-status` element, distinguishing error text from normal loading hints (which use `opacity: 0.5`).

#### Scenario: Error text visually distinct from loading hint
- **WHEN** `.status-error` is applied to `#catalogue-status`
- **THEN** the element renders at `opacity: 0.8`
