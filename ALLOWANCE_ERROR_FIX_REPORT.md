# Allowance and DAR PDF Issue Report

## Problem
Half-day attendance was not always counted correctly in the allowance and DAR PDF.

## Root Cause
The system was using saved weekly totals in some places instead of calculating from the actual punch times.

## Fix
The calculation now uses the real attendance times first:
- Morning: `time_in_1` to `time_out_1`
- Afternoon: `time_in_2` to `time_out_2`

This makes half-day records count as the correct number of hours.

## Approval Side
The approval side is already updated for new computations.

Important note:
- New or recomputed allowances will show the correct hours and amount.
- Older approved records may still show the old total until they are recomputed.

## Result
The allowance totals and DAR PDF now follow the actual hours worked.

## Next Step
Recompute the affected week or affected interns so old saved records match the corrected logic.
