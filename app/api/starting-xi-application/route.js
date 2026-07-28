// Handles Starting XI application submissions.
// 1) Server-side validates payload
// 2) Inserts into starting_xi_applications using the service role (bypasses RLS)
// 3) Fires notification email via Resend (best-effort — never blocks the insert)

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { Resend } from 'resend';

const NOTIFY_TO = process.env.STIX_NOTIFY_TO || 'founder@stixanalytix.com';
const NOTIFY_FROM = process.env.STIX_NOTIFY_FROM || 'Starting XI Applications <onboarding@resend.dev>';
const SUPABASE_DASHBOARD_URL = 'https://supabase.com/dashboard/project/lmwbvkyqyhagqegewnyd/editor';

const REQUIRED = ['full_name', 'email', 'organization_name', 'organization_type', 'country', 'keeper_count', 'why_starting_xi'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  for (const field of REQUIRED) {
    if (!body[field] || typeof body[field] !== 'string' || !body[field].trim()) {
      return NextResponse.json({ error: `Missing required field: ${field}` }, { status: 400 });
    }
  }
  if (body.why_starting_xi.trim().length < 40) {
    return NextResponse.json({ error: 'Please add more context to the "why" field.' }, { status: 400 });
  }
  if (!EMAIL_RE.test(body.email.trim())) {
    return NextResponse.json({ error: 'Invalid email address.' }, { status: 400 });
  }

  const record = {
    full_name: body.full_name.trim(),
    email: body.email.trim(),
    role_title: (body.role_title || '').trim() || null,
    organization_name: body.organization_name.trim(),
    organization_type: body.organization_type,
    country: body.country.trim(),
    keeper_count: body.keeper_count,
    current_tools: Array.isArray(body.current_tools) ? body.current_tools : [],
    tier_interest: body.tier_interest || null,
    why_starting_xi: body.why_starting_xi.trim(),
    additional_notes: (body.additional_notes || '').trim() || null,
  };

  const supabase = createAdminClient();
  const { data, error: dbError } = await supabase
    .from('starting_xi_applications')
    .insert(record)
    .select('id, created_at')
    .single();

  if (dbError) {
    console.error('[apply] insert failed', dbError);
    return NextResponse.json({ error: 'Could not save your application. Please try again in a moment.' }, { status: 500 });
  }

  // Fire notification email (best effort — never block the success response)
  if (process.env.RESEND_API_KEY) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const result = await resend.emails.send({
        from: NOTIFY_FROM,
        to: NOTIFY_TO,
        replyTo: record.email,
        subject: `New Starting XI application — ${record.full_name} (${record.organization_name})`,
        html: buildEmailHtml(record, data.id),
        text: buildEmailText(record, data.id),
      });
      if (result?.error) {
        console.error('[apply] resend returned error', JSON.stringify(result.error));
      } else if (result?.data?.id) {
        console.log('[apply] notification email sent, resend id:', result.data.id);
      } else {
        console.warn('[apply] resend response unexpected shape', JSON.stringify(result));
      }
    } catch (mailError) {
      // Log but don't fail — the application is safely in the DB.
      console.error('[apply] notification email threw', mailError?.message || mailError);
    }
  } else {
    console.warn('[apply] RESEND_API_KEY not set — application saved but no email sent');
  }

  return NextResponse.json({ ok: true, id: data.id });
}

function buildEmailText(r, id) {
  return [
    `New Starting XI application`,
    ``,
    `Name: ${r.full_name}`,
    `Email: ${r.email}`,
    `Role: ${r.role_title || '—'}`,
    `Club: ${r.organization_name} (${r.organization_type})`,
    `Country: ${r.country}`,
    `Keepers: ${r.keeper_count}`,
    `Current tools: ${(r.current_tools || []).join(', ') || '—'}`,
    `Tier interest: ${r.tier_interest || '—'}`,
    ``,
    `Why Starting XI:`,
    r.why_starting_xi,
    ``,
    r.additional_notes ? `Additional notes:\n${r.additional_notes}\n` : '',
    `Application ID: ${id}`,
    `Review in Supabase: ${SUPABASE_DASHBOARD_URL}`,
    ``,
    `Reply to this email to respond to ${r.full_name} directly.`,
  ].filter(Boolean).join('\n');
}

function buildEmailHtml(r, id) {
  const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const row = (label, value) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #1e2a32;color:#5c6b77;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;width:150px;vertical-align:top;">${esc(label)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #1e2a32;color:#f0f4f7;font-size:14px;">${esc(value) || '<span style="color:#5c6b77">—</span>'}</td>
    </tr>`;
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:24px;background:#070b0e;font-family:-apple-system,'DM Sans',Arial,sans-serif;color:#d1d9e0;">
  <div style="max-width:640px;margin:0 auto;background:#0f1419;border:1px solid #1e2a32;border-radius:12px;padding:32px;">
    <div style="font-size:11px;font-weight:600;letter-spacing:0.14em;color:#10b981;text-transform:uppercase;margin-bottom:8px;">
      Starting XI · New Application
    </div>
    <h1 style="font-family:'DM Sans',Arial,sans-serif;font-weight:800;font-size:24px;line-height:1.15;color:#f0f4f7;margin:0 0 24px 0;">
      ${esc(r.full_name)} · ${esc(r.organization_name)}
    </h1>
    <table style="border-collapse:collapse;width:100%;margin-bottom:24px;">
      ${row('Email', r.email)}
      ${row('Role', r.role_title)}
      ${row('Club type', r.organization_type)}
      ${row('Country', r.country)}
      ${row('Keepers', r.keeper_count)}
      ${row('Current tools', (r.current_tools || []).join(', '))}
      ${row('Tier interest', r.tier_interest)}
    </table>
    <div style="padding:16px 20px;background:#151c22;border:1px solid #1e2a32;border-radius:8px;margin-bottom:12px;">
      <div style="font-size:11px;font-weight:600;letter-spacing:0.14em;color:#10b981;text-transform:uppercase;margin-bottom:8px;">Why Starting XI</div>
      <div style="font-size:14px;color:#f0f4f7;line-height:1.6;white-space:pre-wrap;">${esc(r.why_starting_xi)}</div>
    </div>
    ${r.additional_notes ? `
    <div style="padding:16px 20px;background:#151c22;border:1px solid #1e2a32;border-radius:8px;margin-bottom:24px;">
      <div style="font-size:11px;font-weight:500;letter-spacing:0.14em;color:#5c6b77;text-transform:uppercase;margin-bottom:8px;">Additional notes</div>
      <div style="font-size:14px;color:#d1d9e0;line-height:1.6;white-space:pre-wrap;">${esc(r.additional_notes)}</div>
    </div>` : '<div style="margin-bottom:12px;"></div>'}
    <div style="padding-top:16px;border-top:1px solid #1e2a32;font-size:12px;color:#5c6b77;line-height:1.7;">
      Application ID: <code style="color:#d1d9e0;">${esc(id)}</code><br>
      <a href="${SUPABASE_DASHBOARD_URL}" style="color:#10b981;text-decoration:none;">Review in Supabase →</a><br>
      Reply to this email to respond to ${esc(r.full_name)} directly.
    </div>
  </div>
</body>
</html>`;
}
