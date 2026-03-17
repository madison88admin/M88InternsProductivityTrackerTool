-- ============================================================
-- Terms and Conditions Support
-- Adds user T&C acceptance tracking and editable T&C content
-- ============================================================

-- Add terms_accepted_at column to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;

-- Insert default terms and conditions into system_settings
INSERT INTO system_settings (key, value, updated_by)
VALUES (
  'terms_and_conditions',
  jsonb_build_object(
    'content', 'M88 INTERNS PRODUCTIVITY TRACKER TOOL - TERMS AND CONDITIONS

EFFECTIVE DATE: ' || TO_CHAR(NOW()::DATE, 'Month DD, YYYY') || '

By accessing and using the M88 Interns Productivity Tracker (M88 IPT) system, you acknowledge that you have read, understood, and agree to be bound by these Terms and Conditions. You are liable for your actions and may face consequences if you violate any of these terms.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. SYSTEM PURPOSE AND USER RESPONSIBILITIES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The M88 IPT system is designed to track and manage On-the-Job Training (OJT) activities, including:
- Attendance recording (time in/out)
- Task assignment and completion tracking
- Work narrative submissions
- Allowance computation and management

As a user of this system, you agree to:

a) ACCURATE ATTENDANCE TRACKING
   - Record your attendance truthfully and accurately
   - Punch in/out only when physically present at the designated location
   - Not falsify, manipulate, or misrepresent your attendance records
   - Comply with all holiday lockouts and company-mandated non-working dates

b) TIMELY TASK MANAGEMENT
   - Submit task statuses and updates within required timeframes
   - Provide honest and detailed task completion narratives
   - Comply with supervisor approvals and task submission deadlines
   - Update task status only when work has been genuinely performed

c) DATA INTEGRITY
   - You are personally liable for the accuracy of all data you submit through this system
   - Falsifying records, including attendance, task status, or work narratives, is a violation of these terms
   - False or misleading submissions may result in:
     * Rejection of allowance claims
     * Deactivation from the system
     * Escalation to management
     * Investigation and legal consequences

d) SYSTEM COMPLIANCE
   - Attendance is only permitted during your active OJT period
   - Tasks can only be assigned and tracked within system-designated timeframes
   - Holiday dates are locked and no attendance punches are allowed
   - You must comply with location requirements if your company has designated punch locations

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
2. COMPANY CONFIDENTIALITY AND NON-DISCLOSURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

During your OJT with Madison 88 Business Solutions Asia Inc., you will have access to confidential company information. You agree to:

a) CONFIDENTIALITY OBLIGATIONS
   - Not disclose any confidential company information to unauthorized persons
   - Protect all trade secrets, client information, and business processes you learn
   - Maintain confidentiality even after your OJT period ends
   - Recognize that company proprietary information remains company property

b) PROTECTED INFORMATION INCLUDES
   - Client lists, contact information, and business relationships
   - Internal processes, workflows, and operating procedures
   - Financial information and business strategies
   - Work product developed during your OJT
   - Any information marked as confidential by the company

c) LEGAL CONSEQUENCES
   - Violation of confidentiality obligations may result in legal action
   - You may be held liable for damages caused by unauthorized disclosure
   - The company retains all intellectual property rights to work created during your OJT

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
3. CONSEQUENCES OF VIOLATIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Violations of these Terms and Conditions may result in:

- Formal written warning
- Temporary or permanent deactivation from the system
- Rejection of pending allowance claims
- Escalation to management and HR
- Investigation into false submissions
- Termination of OJT program participation
- Legal action for breach of confidentiality
- Reporting to academic institutions or educational sponsors

All violations are logged in the system audit trail and may be reviewed by administrators and management at any time.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
4. DATA HANDLING AND PRIVACY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Your data is stored securely in our cloud database (Supabase)
- Only authorized company personnel and system administrators can access your records
- E-signatures and approval records created in this system are legally binding commitments
- Data retention follows company data privacy policies

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
5. ACKNOWLEDGMENT AND ACCEPTANCE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

By clicking "Accept" and entering the M88 IPT system, you:

- Certify that you have read this entire Terms and Conditions document
- Acknowledge that you understand all obligations outlined herein
- Agree to comply with all terms and policies described
- Recognize that you are liable for violations and their consequences
- Accept that system administrators may update these terms at any time
- Understand that continued system access constitutes ongoing acceptance of current terms

Should you have questions about these terms, contact your supervisor or system administrator.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Madison 88 Business Solutions Asia Inc.
M88 Interns Productivity Tracker System'
  ),
  NULL
)
ON CONFLICT (key) DO NOTHING;
