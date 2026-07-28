"use client";

// Starting XI application page. Inserts into starting_xi_applications
// (RLS: anon can INSERT only; SELECT requires service role).

import { useState } from 'react';
import Link from 'next/link';
import { Outfit, DM_Sans } from 'next/font/google';

const outfit = Outfit({ subsets: ['latin'], weight: ['400', '700', '800'], variable: '--font-outfit' });
const dmSans = DM_Sans({ subsets: ['latin'], weight: ['300', '400', '500', '700'], variable: '--font-dm' });

const t = {
  bg: '#070b0e', card: '#0f1419', cardAlt: '#151c22', border: '#1e2a32',
  accent: '#10b981', accentDim: '#065f46',
  gold: '#d4a853', green: '#22c55e', red: '#ef4444',
  text: '#d1d9e0', dim: '#5c6b77', bright: '#f0f4f7',
  darkOnAccent: '#06251a',
};

const ORG_TYPES = ['Club', 'Academy', 'Federation / Governing body', 'University program', 'Independent GK coach', 'Other'];
const KEEPER_COUNTS = ['1–3 keepers', '4–10 keepers', '11–20 keepers', '20+ keepers'];
const TIER_OPTIONS = [
  { id: 'club', label: 'Club — $1,800 Founding Investment' },
  { id: 'academy', label: 'Academy — $4,500 Founding Investment' },
  { id: 'federation', label: 'Federation — $12,000 Founding Investment' },
  { id: 'unsure', label: 'Not sure yet — advise me' },
];
const TOOL_OPTIONS = ['Veo', 'Trace', 'Hudl', 'Playermaker', 'Other', 'None'];

const css = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { scroll-behavior: smooth; }
body {
  background: ${t.bg}; color: ${t.text};
  font-family: var(--font-dm), 'DM Sans', -apple-system, sans-serif;
  font-size: 16px; line-height: 1.6; -webkit-font-smoothing: antialiased;
}
.nav {
  position: fixed; top: 0; left: 0; right: 0; z-index: 100;
  display: flex; align-items: center; justify-content: space-between;
  padding: 18px 40px; border-bottom: 1px solid ${t.border};
  background: rgba(7,11,14,0.85); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
}
.field-label {
  display: block; font-size: 11px; font-weight: 600; letter-spacing: 0.09em;
  color: ${t.bright}; text-transform: uppercase; margin-bottom: 8px;
}
.field-label .req { color: ${t.accent}; margin-left: 4px; }
.field-hint { font-size: 12px; color: ${t.dim}; margin-top: 6px; line-height: 1.5; }
.input, .select, .textarea {
  width: 100%; padding: 12px 14px;
  background: ${t.card}; color: ${t.bright};
  border: 1px solid ${t.border}; border-radius: 8px;
  font-family: inherit; font-size: 15px;
  transition: border-color 0.15s, background 0.15s;
}
.input::placeholder, .textarea::placeholder { color: ${t.dim}; }
.input:focus, .select:focus, .textarea:focus {
  outline: none; border-color: ${t.accent}; background: ${t.cardAlt};
}
.textarea { min-height: 120px; resize: vertical; line-height: 1.6; }
.select {
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='7' viewBox='0 0 12 7'%3E%3Cpath fill='%235c6b77' d='M1 1l5 5 5-5' stroke='%235c6b77' stroke-width='0.5' fill='none'/%3E%3C/svg%3E");
  background-repeat: no-repeat; background-position: right 14px center;
  padding-right: 40px; cursor: pointer;
}
.check-row {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 8px 14px; border: 1px solid ${t.border}; border-radius: 6px;
  cursor: pointer; font-size: 14px; color: ${t.text}; background: ${t.card};
  transition: all 0.15s; user-select: none;
}
.check-row:hover { border-color: ${t.dim}; }
.check-row input { accent-color: ${t.accent}; margin: 0; cursor: pointer; }
.check-row.checked { border-color: ${t.accent}; background: rgba(16,185,129,0.08); color: ${t.bright}; }
.btn-submit {
  padding: 18px 36px; background: ${t.accent}; color: ${t.darkOnAccent};
  border: none; border-radius: 10px; font-family: inherit;
  font-size: 17px; font-weight: 700; letter-spacing: 0.2px;
  cursor: pointer; transition: background 0.15s, transform 0.1s;
}
.btn-submit:hover:not(:disabled) { background: #0ea56e; }
.btn-submit:active:not(:disabled) { transform: translateY(1px); }
.btn-submit:disabled { opacity: 0.6; cursor: not-allowed; }
@media (max-width: 720px) {
  .nav { padding: 14px 20px; }
  .grid-2col { grid-template-columns: 1fr !important; }
}
`;

export default function ApplyPage() {
  const [state, setState] = useState('form'); // 'form' | 'submitting' | 'success'
  const [error, setError] = useState(null);
  const [form, setForm] = useState({
    full_name: '', email: '', role_title: '', organization_name: '',
    organization_type: '', country: '', keeper_count: '',
    current_tools: [], tier_interest: '',
    why_starting_xi: '', additional_notes: '',
  });

  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggleTool = (tool) => setForm(f => ({
    ...f,
    current_tools: f.current_tools.includes(tool)
      ? f.current_tools.filter(x => x !== tool)
      : [...f.current_tools, tool],
  }));

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!form.full_name.trim() || !form.email.trim() || !form.organization_name.trim() ||
        !form.organization_type || !form.country.trim() || !form.keeper_count ||
        !form.why_starting_xi.trim()) {
      setError('Please fill in the required fields.');
      return;
    }
    if (form.why_starting_xi.trim().length < 80) {
      setError('Please give us a bit more context in the "why" — at least a couple of sentences.');
      return;
    }
    setState('submitting');
    let res;
    try {
      res = await fetch('/api/starting-xi-application', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: form.full_name.trim(),
          email: form.email.trim(),
          role_title: form.role_title.trim() || null,
          organization_name: form.organization_name.trim(),
          organization_type: form.organization_type,
          country: form.country.trim(),
          keeper_count: form.keeper_count,
          current_tools: form.current_tools,
          tier_interest: form.tier_interest || null,
          why_starting_xi: form.why_starting_xi.trim(),
          additional_notes: form.additional_notes.trim() || null,
        }),
      });
    } catch (networkError) {
      console.error(networkError);
      setError('Network error. Please check your connection and try again.');
      setState('form');
      return;
    }
    if (!res.ok) {
      const { error: apiError } = await res.json().catch(() => ({ error: null }));
      setError(apiError || 'Something went wrong on our end. Try again in a moment, or email info@stixanalytix.com directly.');
      setState('form');
      return;
    }
    setState('success');
  };

  return (
    <div className={`${outfit.variable} ${dmSans.variable}`}>
      <style dangerouslySetInnerHTML={{ __html: css }} />

      <nav className="nav">
        <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
          <img src="/logo.svg" alt="Stix" style={{ height: 34 }} />
        </Link>
        <Link href="/" style={{ fontSize: 13, color: t.text, textDecoration: 'none', fontWeight: 500, opacity: 0.75 }}>← Back to home</Link>
      </nav>

      <main style={{ maxWidth: 820, margin: '0 auto', padding: '128px 24px 96px' }}>
        {state === 'success' ? <SuccessScreen /> : (
          <>
            <div style={{ marginBottom: 40 }}>
              <div style={{ display: 'inline-block', padding: '5px 14px', borderRadius: 999, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.35)', fontSize: 11, fontWeight: 500, letterSpacing: '0.14em', color: t.accent, textTransform: 'uppercase', marginBottom: 24 }}>
                Starting XI · 8 spots open
              </div>
              <h1 style={{ fontFamily: 'var(--font-outfit)', fontWeight: 800, fontSize: 'clamp(2.2rem, 4.5vw, 3.4rem)', lineHeight: 1.08, letterSpacing: '-0.025em', color: t.bright, marginBottom: 20 }}>
                Apply for the Starting XI.
              </h1>
              <p style={{ fontSize: 18, color: t.text, lineHeight: 1.65, maxWidth: 640 }}>
                Every application goes to Joshua directly. You'll hear back within 48 hours to book a 30-minute discovery call. If we're a fit on the call, you're in the cohort.
              </p>
            </div>

            <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 28 }} noValidate>
              <div className="grid-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                <div>
                  <label htmlFor="full_name" className="field-label">Your full name <span className="req">*</span></label>
                  <input id="full_name" className="input" type="text" autoComplete="name" value={form.full_name} onChange={e => update('full_name', e.target.value)} />
                </div>
                <div>
                  <label htmlFor="email" className="field-label">Email <span className="req">*</span></label>
                  <input id="email" className="input" type="email" autoComplete="email" value={form.email} onChange={e => update('email', e.target.value)} />
                </div>
              </div>

              <div className="grid-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                <div>
                  <label htmlFor="role_title" className="field-label">Your role</label>
                  <input id="role_title" className="input" type="text" placeholder="e.g. Director of Goalkeeping" value={form.role_title} onChange={e => update('role_title', e.target.value)} />
                </div>
                <div>
                  <label htmlFor="organization_name" className="field-label">Club <span className="req">*</span></label>
                  <input id="organization_name" className="input" type="text" placeholder="e.g. Riverside FC" value={form.organization_name} onChange={e => update('organization_name', e.target.value)} />
                </div>
              </div>

              <div className="grid-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                <div>
                  <label htmlFor="organization_type" className="field-label">Club type <span className="req">*</span></label>
                  <select id="organization_type" className="select" value={form.organization_type} onChange={e => update('organization_type', e.target.value)}>
                    <option value="">Choose one…</option>
                    {ORG_TYPES.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="country" className="field-label">Country <span className="req">*</span></label>
                  <input id="country" className="input" type="text" placeholder="e.g. Canada" autoComplete="country-name" value={form.country} onChange={e => update('country', e.target.value)} />
                </div>
              </div>

              <div>
                <label htmlFor="keeper_count" className="field-label">How many goalkeepers do you manage? <span className="req">*</span></label>
                <select id="keeper_count" className="select" value={form.keeper_count} onChange={e => update('keeper_count', e.target.value)} style={{ maxWidth: 400 }}>
                  <option value="">Choose one…</option>
                  {KEEPER_COUNTS.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>

              <div>
                <label className="field-label">What video / analytics tools are you already using?</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {TOOL_OPTIONS.map(tool => {
                    const checked = form.current_tools.includes(tool);
                    return (
                      <label key={tool} className={`check-row ${checked ? 'checked' : ''}`}>
                        <input type="checkbox" checked={checked} onChange={() => toggleTool(tool)} />
                        {tool}
                      </label>
                    );
                  })}
                </div>
                <div className="field-hint">Select all that apply.</div>
              </div>

              <div>
                <label htmlFor="tier_interest" className="field-label">Which tier fits your program?</label>
                <select id="tier_interest" className="select" value={form.tier_interest} onChange={e => update('tier_interest', e.target.value)} style={{ maxWidth: 500 }}>
                  <option value="">Tell us on the call…</option>
                  {TIER_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </div>

              <div>
                <label htmlFor="why_starting_xi" className="field-label">Why do you want to be part of the Starting XI? <span className="req">*</span></label>
                <textarea id="why_starting_xi" className="textarea" value={form.why_starting_xi} onChange={e => update('why_starting_xi', e.target.value)} placeholder="What are you trying to solve for your goalkeepers? What would make Stix genuinely useful to your program?" />
                <div className="field-hint">A couple of sentences is plenty. This is how Joshua knows whether we're a fit before the call.</div>
              </div>

              <div>
                <label htmlFor="additional_notes" className="field-label">Anything else we should know? <span style={{ color: t.dim, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
                <textarea id="additional_notes" className="textarea" value={form.additional_notes} onChange={e => update('additional_notes', e.target.value)} placeholder="Constraints, timing, key stakeholders, questions — whatever helps." style={{ minHeight: 80 }} />
              </div>

              {error && (
                <div style={{ padding: 14, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 8, color: '#ff9a9a', fontSize: 14 }}>
                  {error}
                </div>
              )}

              <div style={{ marginTop: 8, display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
                <button type="submit" className="btn-submit" disabled={state === 'submitting'}>
                  {state === 'submitting' ? 'Sending…' : 'Send my application →'}
                </button>
                <div style={{ fontSize: 13, color: t.dim, maxWidth: 340 }}>
                  Joshua personally reviews every application. You'll hear back within 48 hours.
                </div>
              </div>
            </form>
          </>
        )}
      </main>

      <footer style={{ padding: '28px 40px', borderTop: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <img src="/logo.svg" alt="Stix" style={{ height: 26 }} />
        <p style={{ fontSize: 13, color: t.dim }}>© 2026 Stix by JIRAH Growth Partners</p>
      </footer>
    </div>
  );
}

function SuccessScreen() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 28, maxWidth: 640, margin: '0 auto', paddingTop: 40 }}>
      <div style={{
        width: 72, height: 72, borderRadius: 999,
        background: 'rgba(16,185,129,0.15)', border: `1px solid ${t.accent}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: t.accent, fontSize: 32,
      }}>✓</div>
      <h1 style={{ fontFamily: 'var(--font-outfit)', fontWeight: 800, fontSize: 'clamp(2rem, 4vw, 3rem)', letterSpacing: '-0.025em', lineHeight: 1.1, color: t.bright }}>
        Application received.
      </h1>
      <p style={{ fontSize: 18, color: t.text, lineHeight: 1.65 }}>
        Joshua has been notified. You'll hear back within 48 hours to schedule a 30-minute discovery call.
      </p>
      <div style={{
        marginTop: 12, padding: '28px 32px',
        background: t.card, border: `1px solid ${t.border}`, borderRadius: 12,
        textAlign: 'left', width: '100%',
      }}>
        <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.14em', color: t.accent, textTransform: 'uppercase', marginBottom: 16 }}>
          What happens next
        </div>
        <ol style={{ display: 'flex', flexDirection: 'column', gap: 14, listStyle: 'none' }}>
          {[
            'Joshua reads your application personally. Every one.',
            "If it's a Starting XI fit, you get a Calendly link to book a 30-min call.",
            "On the call: your goals, your keepers, the workflow, the pricing tier. No slide deck — a real conversation.",
            "If it's a mutual yes, contract goes out the same week. Starting XI cohort welcomes you as a founding partner.",
          ].map((step, i) => (
            <li key={i} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <span style={{
                width: 24, height: 24, borderRadius: 6,
                background: 'rgba(16,185,129,0.15)', color: t.accent,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700, flexShrink: 0, marginTop: 2,
              }}>{i + 1}</span>
              <span style={{ fontSize: 15, color: t.text, lineHeight: 1.55 }}>{step}</span>
            </li>
          ))}
        </ol>
      </div>
      <Link href="/" style={{ marginTop: 12, fontSize: 14, color: t.dim, textDecoration: 'none' }}>← Back to the landing page</Link>
    </div>
  );
}
