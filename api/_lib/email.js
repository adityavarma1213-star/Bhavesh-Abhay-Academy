// BAA: outbound transactional email (password reset, etc).
//
// No email provider is configured yet. This module deliberately does NOT
// pretend to send anything — it reports honestly so callers (and the UI)
// never claim an email went out when it didn't. To wire a real provider:
//   1. Sign up for Resend (https://resend.com) — free tier covers this use.
//   2. Add RESEND_API_KEY as a Vercel Production environment variable.
//   3. Nothing else needs to change — sendPasswordResetEmail() below
//      already targets Resend's HTTP API and will start working the
//      moment the key exists.
export async function sendPasswordResetEmail({ to, resetUrl }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { sent: false, reason: 'NO_EMAIL_PROVIDER_CONFIGURED' };
  }
  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || 'BAA OS <onboarding@resend.dev>',
        to: [to],
        subject: 'Reset your BAA OS password',
        html: `<p>Someone requested a password reset for this account.</p>
               <p><a href="${resetUrl}">Click here to set a new password</a>. This link expires in 1 hour.</p>
               <p>If you didn't request this, you can safely ignore this email.</p>`,
      }),
    });
    if (!resp.ok) return { sent: false, reason: 'PROVIDER_ERROR' };
    return { sent: true };
  } catch {
    return { sent: false, reason: 'PROVIDER_ERROR' };
  }
}
