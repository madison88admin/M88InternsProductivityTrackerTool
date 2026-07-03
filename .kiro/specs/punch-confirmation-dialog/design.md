# Punch Confirmation Dialog Bugfix Design

## Overview

The attendance punch flow currently writes to the database via `supabase.rpc('log_attendance_punch')` and shows a transient toast notification without verifying the record was persisted. There is no confirmation dialog displaying the exact saved timestamp, and error handling lumps all failures (including timeouts) into a generic toast. This fix introduces a post-write verification step (read-back from database), replaces the success toast with a confirmation dialog showing the verified timestamp, and adds distinct error/timeout dialogs — all while preserving existing behavior for non-punch interactions.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug — when an intern clicks the punch button and the system either (a) succeeds without verifying the record or showing a confirmation dialog, (b) fails with a generic error toast instead of a distinct dialog, or (c) times out without timeout-specific guidance.
- **Property (P)**: The desired behavior — success shows a verified confirmation dialog with exact timestamp; errors show a descriptive error dialog; timeouts show a timeout-specific dialog with retry guidance.
- **Preservation**: Existing behaviors that must remain unchanged — pre-punch `window.confirm` prompt, narrative prompt modals, approval/notification creation, audit logging, time-period locking, and IP consistency tracking.
- **`log_attendance_punch` RPC**: The Supabase RPC function in `src/pages/attendance.js` that writes the punch record and returns the saved row.
- **Verification read-back**: A follow-up `SELECT` query that re-reads the punch record from the database to confirm the timestamp was persisted accurately.
- **`createModal`**: The existing modal helper in `src/lib/component.js` used to display confirmation and error dialogs.

## Bug Details

### Bug Condition

The bug manifests when an intern clicks the punch button on the Attendance page. After the database write completes (success or failure), the system shows only a transient toast notification. It does not verify the record against the database, does not present a confirmation dialog with the exact saved timestamp, and does not distinguish timeout errors from other failures.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type PunchEvent { punchType, dbResponse, networkState }
  OUTPUT: boolean
  
  RETURN input.punchType IN ['time_in_1', 'time_out_1', 'time_in_2', 'time_out_2']
         AND (
           (input.dbResponse.success = true AND NOT verificationDialogShown(input))
           OR (input.dbResponse.error != null AND NOT errorDialogShown(input))
           OR (input.networkState.timedOut = true AND NOT timeoutDialogShown(input))
         )
END FUNCTION
```

### Examples

- **Success without verification**: Intern clicks "Morning Time In", RPC succeeds, toast says "Morning Time In recorded successfully" then fades away in 4 seconds. No dialog confirms the exact timestamp. The intern has no way to verify the saved time matches what they expected.
- **Generic error**: Intern clicks "End of Day Time Out", database returns a constraint violation, toast shows "Failed to log attendance" for 4 seconds. No dialog with clear guidance or error details is presented.
- **Timeout with no specific guidance**: Intern clicks "Afternoon Time In" on a slow network, the Supabase call hangs for 30+ seconds then fails. The catch block shows a generic error toast. No timeout-specific dialog tells the intern to check their network.
- **Edge case — record written but verification fails**: RPC succeeds but the read-back query fails. The system should still show a "partial success" dialog indicating the punch was likely saved but verification could not be completed.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- The pre-punch `window.confirm` dialog ("Are you sure you want to log your time for...") must continue to appear before executing the punch
- Narrative prompt modals for `time_out_1` and `time_out_2` punches must continue to trigger after successful punch recording
- Approval entries and supervisor notifications must continue to be created for completed attendance (full-day, AM half-day, PM half-day)
- The punch button lock/unlock logic based on time periods must remain unchanged
- Audit logging (`logAudit`) with punch type, timestamp, IP address, and flags must continue as before
- IP consistency tracking and the `sanitizeIpForInet` helper must not be altered
- The page re-render flow after successful punch recording must continue to work

**Scope:**
All inputs that do NOT involve the post-punch notification/confirmation flow should be completely unaffected by this fix. This includes:
- Pre-punch confirmation prompt
- Time period locking logic
- Correction request modal
- Recent attendance table rendering
- Auto-submit logic for incomplete attendance
- Holiday detection and punch disabling

## Hypothesized Root Cause

Based on the bug description, the issues are:

1. **No verification step**: The punch handler calls `supabase.rpc('log_attendance_punch')` and immediately trusts the returned data without re-reading from the database. The RPC response is used directly, but there's no independent verification that the timestamp was persisted correctly.

2. **Toast-only feedback for success**: After a successful punch, line `showToast(\`${punchLabel} recorded successfully\`, 'success')` is the only user feedback. A toast auto-dismisses after 4 seconds and doesn't show the verified timestamp.

3. **Generic error handling**: The `catch (err)` block at the end of the punch handler calls `showToast(getAttendanceErrorMessage(err), 'error')`. This doesn't distinguish between timeout errors and other database errors, and uses a transient toast instead of a persistent dialog.

4. **No timeout detection**: The Supabase client has no explicit request timeout configured. There's no `AbortController` or timeout wrapper around the RPC call, so timeouts manifest as generic network errors rather than being caught distinctly.

## Correctness Properties

Property 1: Bug Condition - Confirmation Dialog After Successful Punch

_For any_ punch event where the database write succeeds (RPC returns without error) and the verification read-back confirms the record, the fixed punch handler SHALL display a modal confirmation dialog showing the punch type label, the exact verified timestamp from the database, and a success message — replacing the transient toast notification.

**Validates: Requirements 2.1, 2.4**

Property 2: Bug Condition - Error Dialog for Database Failures

_For any_ punch event where the database write fails with a non-timeout error (e.g., constraint violation, permission error), the fixed punch handler SHALL display a persistent error dialog with a clear error description and guidance, rather than a transient toast notification.

**Validates: Requirements 2.2**

Property 3: Bug Condition - Timeout Dialog for Connection Issues

_For any_ punch event where the database connection times out or is unreachable (request exceeds configured timeout threshold), the fixed punch handler SHALL display a timeout-specific dialog informing the intern of the connection issue and suggesting they check their network and try again.

**Validates: Requirements 2.3**

Property 4: Preservation - Existing Punch Flow Unchanged

_For any_ interaction that is NOT the post-punch feedback step (pre-punch confirmation, narrative prompts, approval creation, audit logging, time-period locking, page rendering), the fixed code SHALL produce exactly the same behavior as the original code, preserving all existing functionality.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `src/pages/attendance.js`

**Function**: Punch button click handler (inside `renderAttendancePage` init callback)

**Specific Changes**:

1. **Add timeout wrapper for RPC call**: Wrap the `supabase.rpc('log_attendance_punch')` call with an `AbortController` or `Promise.race` timeout (e.g., 15 seconds). This enables distinct timeout detection.
   - Create a `PUNCH_TIMEOUT_MS` constant (15000ms)
   - Use `Promise.race` pattern similar to `audit.js`'s `withTimeout`

2. **Add verification read-back**: After a successful RPC response, query the database to independently verify the record:
   ```
   SELECT time_in_1, time_out_1, time_in_2, time_out_2, date
   FROM attendance_records
   WHERE id = todayRecord.id
   ```
   Compare the returned punch timestamp against what the RPC reported.

3. **Replace success toast with confirmation dialog**: Use `createModal` to display a success confirmation dialog with:
   - Punch type label (e.g., "Morning Time In")
   - Exact verified timestamp from database (formatted nicely)
   - Success icon and message
   - "OK" button to dismiss
   - Non-dismissible until user acknowledges (optional: auto-close after 10s)

4. **Replace error toast with error dialog**: In the catch block, detect error type:
   - If timeout → show timeout-specific dialog with network guidance
   - If other error → show general error dialog with error description
   - Both dialogs use `createModal` and require explicit dismissal

5. **Create helper functions**: Extract dialog creation into reusable helpers:
   - `showPunchConfirmationDialog(punchLabel, verifiedTimestamp)` — success modal
   - `showPunchErrorDialog(errorMessage)` — general error modal
   - `showPunchTimeoutDialog()` — timeout-specific modal

6. **Preserve existing flow**: The confirmation/error dialogs must be shown BEFORE the narrative prompt logic and page re-render. The flow becomes:
   - RPC call → Verification → Confirmation dialog → User dismisses → Audit log → Approval creation → Narrative prompt → Re-render

**File**: `src/pages/attendance.js` (new helper functions at module level)

**New Functions**:
- `withPunchTimeout(promise, timeoutMs)` — Promise.race wrapper that rejects with a distinguishable timeout error
- `verifyPunchRecord(recordId, punchType)` — reads back the record and returns the verified timestamp
- `showPunchConfirmationDialog(punchLabel, timestamp)` — creates success modal, returns Promise that resolves when dismissed
- `showPunchErrorDialog(message)` — creates error modal, returns Promise that resolves when dismissed
- `showPunchTimeoutDialog()` — creates timeout modal, returns Promise that resolves when dismissed

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that simulate punch button clicks and verify the feedback mechanism. Run these tests on the UNFIXED code to observe that only toasts are shown (no dialogs, no verification).

**Test Cases**:
1. **Success Without Dialog Test**: Simulate successful punch → verify no modal/dialog is created, only a toast (will confirm bug on unfixed code)
2. **No Verification Test**: Simulate successful punch → verify no subsequent SELECT query is made to verify the record (will confirm bug on unfixed code)
3. **Generic Error Test**: Mock RPC to throw an error → verify only a toast is shown, not a dialog (will confirm bug on unfixed code)
4. **Timeout Behavior Test**: Mock RPC to hang indefinitely → verify no timeout handling exists and no timeout dialog appears (will confirm bug on unfixed code)

**Expected Counterexamples**:
- After successful punch: DOM contains no modal element; only a toast element appears briefly
- After error: `showToast` is called with generic message; no `createModal` call occurs
- Possible causes: No verification query, no timeout wrapper, toast-only feedback pattern

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := handlePunch_fixed(input)
  IF input.dbResponse.success THEN
    ASSERT verificationQueryExecuted(result)
    ASSERT confirmationDialogShown(result)
    ASSERT dialogContains(result, verifiedTimestamp)
  ELSE IF input.networkState.timedOut THEN
    ASSERT timeoutDialogShown(result)
    ASSERT dialogContainsRetryGuidance(result)
  ELSE
    ASSERT errorDialogShown(result)
    ASSERT dialogContainsErrorDescription(result)
  END IF
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT handlePunch_original(input) = handlePunch_fixed(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for pre-punch confirmation, time-period locking, narrative prompts, and approval creation, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Pre-Punch Confirm Preservation**: Verify `window.confirm` is still called before any punch execution after fix
2. **Narrative Prompt Preservation**: Verify `showNarrativePromptModal` is still triggered for `time_out_1` and `time_out_2` after successful punch
3. **Approval Creation Preservation**: Verify approval entries and supervisor notifications continue to be created for completed attendance
4. **Time Lock Preservation**: Verify `isPunchLocked` continues to prevent out-of-period punches
5. **Audit Log Preservation**: Verify `logAudit` continues to be called with correct punch type, timestamp, IP, and flags

### Unit Tests

- Test `withPunchTimeout` correctly rejects after configured timeout
- Test `verifyPunchRecord` returns correct timestamp when record exists
- Test `verifyPunchRecord` handles missing/mismatched record gracefully
- Test `showPunchConfirmationDialog` renders modal with correct content
- Test `showPunchErrorDialog` renders modal with error message
- Test `showPunchTimeoutDialog` renders modal with network guidance
- Test that timeout errors are distinguished from other errors in catch block

### Property-Based Tests

- Generate random punch types and mock successful RPC responses → verify confirmation dialog always appears with correct timestamp
- Generate random error messages and types → verify appropriate dialog (error vs timeout) is shown
- Generate random time periods and punch states → verify locking logic is unchanged
- Generate random sequences of punch events → verify audit logging and approval creation are unchanged

### Integration Tests

- Test full punch flow: click → confirm → RPC → verify → dialog → dismiss → narrative prompt → re-render
- Test timeout flow: click → confirm → RPC hangs → timeout dialog → dismiss → button re-enabled
- Test error flow: click → confirm → RPC fails → error dialog → dismiss → button re-enabled
- Test that confirmation dialog dismissal properly chains into narrative prompt for time-out punches
- Test that verification failure after successful RPC shows partial-success dialog
