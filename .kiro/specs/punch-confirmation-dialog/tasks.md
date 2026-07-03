# Implementation Plan

## Overview

This plan fixes the punch confirmation dialog bug by following the exploratory bugfix workflow: first writing tests to confirm the bug exists (Bug Condition), then writing preservation tests to protect existing behavior, implementing the fix (timeout wrapper, verification read-back, dialog helpers, handler integration), and finally validating everything passes.

## Tasks

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Punch Success Shows Toast Instead of Confirmation Dialog
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists (no verification, no dialog, no timeout handling)
  - **Scoped PBT Approach**: For each punch type ('time_in_1', 'time_out_1', 'time_in_2', 'time_out_2'), simulate a successful RPC response and verify:
    - A verification read-back query is executed against the database after the RPC call
    - A modal confirmation dialog is rendered (via `createModal`) showing the verified timestamp
    - The transient `showToast` for success is NOT called
  - **Bug Condition from design**: `isBugCondition(input)` where `input.punchType IN ['time_in_1', 'time_out_1', 'time_in_2', 'time_out_2'] AND input.dbResponse.success = true AND NOT verificationDialogShown(input)`
  - **Expected Behavior**: After successful punch RPC → verification SELECT query executes → confirmation dialog renders with punch label and verified timestamp
  - Additionally test timeout scenario: mock RPC to exceed 15s timeout → verify a timeout-specific dialog is shown (not generic toast)
  - Additionally test error scenario: mock RPC to throw non-timeout error → verify an error dialog is shown (not generic toast)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists: only toasts are shown, no dialogs, no verification)
  - Document counterexamples found (e.g., "After successful punch, DOM contains no modal element; showToast('Morning Time In recorded successfully', 'success') is the only feedback")
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Existing Punch Flow Behaviors Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - **Observe on UNFIXED code**:
    - `window.confirm` is called with "Are you sure you want to log your time for..." before any punch execution
    - `isPunchLocked(punchType)` prevents out-of-period punches and shows toast + re-renders
    - `showNarrativePromptModal` is triggered for `time_out_1` and `time_out_2` after successful punch when narratives pending
    - Approval entries (`supabase.from('approvals').insert(...)`) are created for completed attendance (full-day, AM half-day, PM half-day)
    - `logAudit('attendance.${punchType}', ...)` is called with punch_type, timestamp, ip_address, and flags
    - `sanitizeIpForInet` converts IP addresses correctly (null for 'unknown', passthrough otherwise)
    - Supervisor notifications are created via `supabase.from('notifications').insert(...)`
    - Email notifications sent to department supervisors via `sendEmailNotification`
    - Page re-renders via `renderAttendancePage()` after successful punch flow completes
  - **Write property-based tests**:
    - For all punch types: `window.confirm` is always called BEFORE RPC execution
    - For all locked punch types: toast error is shown and page re-renders (no RPC call)
    - For all time-out punches with pending narratives: `showNarrativePromptModal` is invoked after punch success
    - For all completed attendance patterns: approval + notification records are created
    - For all successful punches: `logAudit` is called with correct action, entity type, entity ID, and details
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 3. Implement punch confirmation dialog fix

  - [x] 3.1 Create `withPunchTimeout` utility function
    - Add `PUNCH_TIMEOUT_MS = 15000` constant at module level in `src/pages/attendance.js`
    - Implement `withPunchTimeout(promise, timeoutMs)` using `Promise.race` pattern (similar to `withTimeout` in `src/lib/audit.js`)
    - The timeout branch must reject with a distinguishable error (e.g., `new Error('PUNCH_TIMEOUT')` or a custom error with `err.isTimeout = true`)
    - This allows the catch block to differentiate timeout from other errors
    - _Bug_Condition: isBugCondition(input) where input.networkState.timedOut = true AND NOT timeoutDialogShown(input)_
    - _Expected_Behavior: Timeout errors produce a distinct rejection enabling timeout-specific dialog_
    - _Requirements: 2.3_

  - [x] 3.2 Create `verifyPunchRecord` function
    - Implement `async verifyPunchRecord(recordId, punchType)` at module level in `src/pages/attendance.js`
    - Query: `supabase.from('attendance_records').select('time_in_1, time_out_1, time_in_2, time_out_2, date').eq('id', recordId).single()`
    - Return the verified timestamp value for the given `punchType` column
    - Handle edge cases: record not found → return null; query error → return null (partial success scenario)
    - _Bug_Condition: isBugCondition(input) where input.dbResponse.success = true AND NOT verificationDialogShown(input)_
    - _Expected_Behavior: Independent database read-back confirms timestamp persistence_
    - _Requirements: 2.1, 2.4_

  - [x] 3.3 Create dialog helper functions
    - Implement `showPunchConfirmationDialog(punchLabel, verifiedTimestamp)` using `createModal`:
      - Title: "Punch Confirmed"
      - Body: Success icon, punch type label, formatted verified timestamp, success message
      - "OK" button to dismiss
      - Returns a Promise that resolves when the user dismisses the dialog
    - Implement `showPunchErrorDialog(errorMessage)` using `createModal`:
      - Title: "Punch Error"
      - Body: Error icon, error description, guidance text
      - "OK" button to dismiss
      - Returns a Promise that resolves when dismissed
    - Implement `showPunchTimeoutDialog()` using `createModal`:
      - Title: "Connection Timeout"
      - Body: Timeout icon, message about connection issue, suggestion to check network and retry
      - "OK" button to dismiss
      - Returns a Promise that resolves when dismissed
    - All three functions placed at module level in `src/pages/attendance.js`
    - _Bug_Condition: All three sub-conditions from isBugCondition_
    - _Expected_Behavior: Each dialog type renders a persistent modal requiring explicit user acknowledgment_
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.4 Modify punch button click handler to integrate verification and dialogs
    - Wrap `supabase.rpc('log_attendance_punch', {...})` call with `withPunchTimeout(rpcCall, PUNCH_TIMEOUT_MS)`
    - After successful RPC: call `verifyPunchRecord(todayRecord.id, punchType)` to get verified timestamp
    - If verification succeeds: call `await showPunchConfirmationDialog(punchLabel, verifiedTimestamp)` — replace the `showToast(..., 'success')` line
    - If verification fails (returns null): show partial-success dialog indicating punch was likely saved but verification could not complete
    - Remove the line: `showToast(\`${punchLabel} recorded successfully\`, 'success')`
    - Update catch block to detect timeout errors:
      - If `err.message === 'PUNCH_TIMEOUT'` or `err.isTimeout` → `await showPunchTimeoutDialog()`
      - Else → `await showPunchErrorDialog(getAttendanceErrorMessage(err))`
    - Remove: `showToast(getAttendanceErrorMessage(err), 'error')` from catch block
    - Ensure confirmation dialog is awaited BEFORE approval creation, narrative prompt, and page re-render (flow: RPC → verify → dialog → user dismisses → audit → approval → narrative → re-render)
    - Re-enable punch button after error/timeout dialog dismissal (keep existing `punchBtn.disabled = false` behavior)
    - _Bug_Condition: isBugCondition(input) from design_
    - _Expected_Behavior: expectedBehavior(result) — confirmation dialog for success, error dialog for failures, timeout dialog for timeouts_
    - _Preservation: Pre-punch confirm, audit logging, approval creation, narrative prompts, page re-render all unchanged_
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 3.5 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Punch Confirmation Dialog After Successful Punch
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior (verification query + confirmation dialog)
    - When this test passes, it confirms:
      - Successful punch → verification read-back executes → confirmation dialog shows verified timestamp
      - Timeout → timeout-specific dialog shown
      - Error → error dialog shown
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 3.6 Verify preservation tests still pass
    - **Property 2: Preservation** - Existing Punch Flow Behaviors Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm: `window.confirm` still called before punch, narrative prompts still triggered, approvals still created, audit logging unchanged, time-period locking unchanged
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 4. Checkpoint - Ensure all tests pass
  - Run the full test suite to confirm all property-based tests and unit tests pass
  - Verify exploration test (Property 1) passes on fixed code
  - Verify preservation tests (Property 2) pass on fixed code
  - Manual verification: click each punch type and confirm the dialog appears with correct timestamp
  - Ensure no regressions in narrative prompt flow, approval creation, or audit logging
  - Ask the user if questions arise

## Task Dependency Graph

```json
{
  "waves": [
    {
      "wave": 1,
      "tasks": ["1", "2"],
      "description": "Write exploration and preservation tests BEFORE fix (can run in parallel)"
    },
    {
      "wave": 2,
      "tasks": ["3.1", "3.2", "3.3"],
      "description": "Create utility functions and dialog helpers (can run in parallel)"
    },
    {
      "wave": 3,
      "tasks": ["3.4"],
      "description": "Integrate verification and dialogs into punch handler (depends on 3.1, 3.2, 3.3)"
    },
    {
      "wave": 4,
      "tasks": ["3.5", "3.6"],
      "description": "Verify tests pass after fix (depends on 1, 2, 3.4)"
    },
    {
      "wave": 5,
      "tasks": ["4"],
      "description": "Final checkpoint - all tests pass (depends on 3.5, 3.6)"
    }
  ]
}
```

## Notes

- This project uses Vite with vanilla JS (no framework). Tests will need a test runner (Vitest recommended since Vite is already configured).
- The `createModal` helper in `src/lib/component.js` returns `{ element, close }` and supports a `dismissible` option.
- The `withTimeout` pattern in `src/lib/audit.js` uses `Promise.race` with `resolve(null)` for soft timeout. The punch timeout should use `reject` instead since we need to show a timeout dialog.
- The punch handler currently does: RPC → toast → audit → approval → narrative → re-render. The fixed flow will be: RPC (with timeout) → verify → dialog → user dismisses → audit → approval → narrative → re-render.
- All dialog helper functions return Promises that resolve when dismissed, allowing the existing async flow to continue seamlessly.
