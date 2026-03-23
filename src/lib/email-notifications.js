/**
 * Email Notification Helper
 * Sends email notifications via the send-notification Edge Function
 */
import { supabase } from './supabase.js';

/**
 * Send email notification to a user
 * @param {string} userEmail - Recipient email
 * @param {string} subject - Email subject
 * @param {string} htmlContent - HTML email content
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function sendEmailNotification(userEmail, subject, htmlContent) {
  try {
    if (!userEmail) {
      console.warn('No email provided for notification');
      return { ok: false, error: 'No email address' };
    }

    // Get the current session to include the auth token
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      console.warn('No active session for email notification');
      return { ok: false, error: 'No active session' };
    }

    const { data, error } = await supabase.functions.invoke('send-notification', {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
      body: {
        to: userEmail,
        subject,
        html: htmlContent,
      },
    });

    if (error) {
      console.error('Email send error:', error);
      return { ok: false, error: error.message };
    }

    console.log('Email sent successfully to:', userEmail);
    return { ok: data?.ok || false };
  } catch (err) {
    console.error('Failed to send email:', err);
    return { ok: false, error: err.message };
  }
}

/**
 * Generate HTML template for approval result notification
 */
export function getApprovalResultTemplate(approvalType, status, comments) {
  const isApproved = status === 'approved';
  const statusText = isApproved ? 'Approved' : 'Rejected';
  const statusColor = isApproved ? '#10b981' : '#ef4444';

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 5px 5px 0 0; }
          .content { background: #f9f9f9; padding: 20px; border: 1px solid #ddd; border-radius: 0 0 5px 5px; }
          .status-badge { display: inline-block; background: ${statusColor}; color: white; padding: 8px 16px; border-radius: 4px; margin: 10px 0; font-weight: bold; }
          .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Submission ${statusText}</h1>
          </div>
          <div class="content">
            <p>Your <strong>${approvalType.replace(/_/g, ' ')}</strong> submission has been <span class="status-badge">${statusText}</span></p>
            ${!isApproved && comments ? `<p><strong>Feedback:</strong> ${comments}</p>` : ''}
            <p>Log in to the M88 Tracker to view more details.</p>
          </div>
          <div class="footer">
            <p>This is an automated notification. Please do not reply to this email.</p>
          </div>
        </div>
      </body>
    </html>
  `;
}

/**
 * Generate HTML template for task assignment
 */
export function getTaskAssignmentTemplate(taskTitle, taskDescription) {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 5px 5px 0 0; }
          .content { background: #f9f9f9; padding: 20px; border: 1px solid #ddd; border-radius: 0 0 5px 5px; }
          .task-box { background: white; border-left: 4px solid #667eea; padding: 15px; margin: 15px 0; border-radius: 4px; }
          .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>New Task Assigned</h1>
          </div>
          <div class="content">
            <p>You have been assigned a new task:</p>
            <div class="task-box">
              <h3>${taskTitle}</h3>
              ${taskDescription ? `<p>${taskDescription}</p>` : ''}
            </div>
            <p>Log in to the M88 Tracker to start working on this task.</p>
          </div>
          <div class="footer">
            <p>This is an automated notification. Please do not reply to this email.</p>
          </div>
        </div>
      </body>
    </html>
  `;
}

/**
 * Get all active supervisors in an intern's department for multi-supervisor notifications
 * @param {UUID} internId - The intern's ID
 * @returns {Promise<Array>} Array of supervisor profiles (id, full_name, email)
 */
export async function getDepartmentSupervisors(internId) {
  try {
    // Fetch intern to get department_id
    const { data: intern, error: internError } = await supabase
      .from('profiles')
      .select('department_id')
      .eq('id', internId)
      .single();

    if (internError) {
      console.error('Error fetching intern:', internError);
      return [];
    }

    if (!intern?.department_id) {
      console.warn('Intern has no department assigned');
      return [];
    }

    // Fetch all active supervisors in that department
    const { data: supervisors, error: supError } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('department_id', intern.department_id)
      .eq('role', 'supervisor')
      .eq('is_active', true);

    if (supError) {
      console.error('Error fetching supervisors:', supError);
      return [];
    }

    return supervisors || [];
  } catch (err) {
    console.error('Failed to get department supervisors:', err);
    return [];
  }
}
