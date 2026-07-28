// StixAnalytix — Starting XI Landing Page
// Rebuilt 2026-07-27 to reflect Starting XI GTM + dashboard design DNA.

import { Outfit, DM_Sans } from 'next/font/google';

const outfit = Outfit({ subsets: ['latin'], weight: ['400', '700', '800'], variable: '--font-outfit' });
const dmSans = DM_Sans({ subsets: ['latin'], weight: ['300', '400', '500', '700'], variable: '--font-dm' });

// ── Design tokens (mirror lib/theme.js tDark) ────────────────────────────
const t = {
  bg: '#070b0e',
  card: '#0f1419',
  cardAlt: '#151c22',
  border: '#1e2a32',
  accent: '#10b981',
  accentDim: '#065f46',
  accentGlow: 'rgba(16,185,129,0.20)',
  gold: '#d4a853',
  green: '#22c55e',
  text: '#d1d9e0',
  dim: '#5c6b77',
  bright: '#f0f4f7',
  darkOnAccent: '#06251a',
};

// ── NetMotif — the dashboard's goal-net grid, used as section backdrops ──
function NetMotif({ opacity = 0.06, color = t.accent, mask = true }) {
  const style = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    ...(mask ? {
      maskImage: 'radial-gradient(ellipse 80% 70% at 50% 40%, black 20%, transparent 80%)',
      WebkitMaskImage: 'radial-gradient(ellipse 80% 70% at 50% 40%, black 20%, transparent 80%)',
    } : {}),
  };
  return (
    <svg viewBox="0 0 600 280" preserveAspectRatio="xMidYMid slice" style={style} aria-hidden="true">
      <g stroke={color} strokeWidth="1.1" opacity={opacity} strokeLinecap="square">
        {Array.from({ length: 11 }).map((_, i) => (
          <line key={`v${i}`} x1={i * 60} y1="0" x2={i * 60} y2="280" />
        ))}
        {Array.from({ length: 11 }).map((_, i) => (
          <line key={`h${i}`} x1="0" y1={i * 28} x2="600" y2={i * 28} />
        ))}
      </g>
    </svg>
  );
}

// ── Sparkline — mini trend viz reused from dashboard ──────────────────
function Sparkline({ values = [72, 78, 74, 82, 87], color = t.accent, w = 120, h = 32 }) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── KeeperHero — a static mock of the dashboard hero card ─────────────
function KeeperHeroMock() {
  return (
    <div style={{
      position: 'relative',
      overflow: 'hidden',
      background: `radial-gradient(ellipse at 70% 30%, ${t.accentDim}55 0%, ${t.card} 60%)`,
      border: `1px solid ${t.border}`,
      borderRadius: 20,
      padding: '36px 40px',
      display: 'grid',
      gridTemplateColumns: 'minmax(260px, 1fr) minmax(280px, 1.1fr) minmax(280px, 1fr)',
      gap: 40,
      alignItems: 'center',
      minHeight: 280,
      maxWidth: 1200,
      width: '100%',
    }}>
      <NetMotif opacity={0.055} color={t.accent} mask={false} />

      {/* LEFT: identity */}
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 76, height: 76, borderRadius: 16,
            background: `linear-gradient(140deg, ${t.accentDim} 0%, ${t.card} 100%)`,
            border: `1px solid ${t.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font-outfit)', fontWeight: 700, fontSize: 28, color: t.bright,
            letterSpacing: -0.5, flexShrink: 0,
          }}>RT</div>
          <div>
            <div style={{ fontSize: 9, fontWeight: 500, letterSpacing: 2.4, color: t.dim, textTransform: 'uppercase', marginBottom: 5 }}>
              Your goalkeeper
            </div>
            <div style={{ fontFamily: 'var(--font-outfit)', fontSize: 24, fontWeight: 700, color: t.bright, letterSpacing: -0.4, lineHeight: 1.05 }}>
              Rio Terris
            </div>
            <div style={{ fontSize: 12, color: t.text, marginTop: 3, fontWeight: 400 }}>
              <span style={{ color: t.accent, fontWeight: 600 }}>#1</span>
              <span style={{ color: t.dim, margin: '0 7px' }}>·</span>
              <span>U15</span>
              <span style={{ color: t.dim, margin: '0 7px' }}>·</span>
              <span>Storm FC</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 22, paddingTop: 12, borderTop: `1px solid ${t.border}` }}>
          {[
            { l: 'Matches', v: '12' },
            { l: 'Season', v: '2025–26' },
            { l: 'Tracked since', v: "Aug '25" },
          ].map(m => (
            <div key={m.l}>
              <div style={{ fontSize: 9, color: t.dim, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 3 }}>{m.l}</div>
              <div style={{ fontFamily: 'var(--font-outfit)', fontSize: 18, fontWeight: 700, color: t.bright }}>{m.v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* CENTER: form score */}
      <div style={{
        position: 'relative', zIndex: 1,
        display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
        padding: '0 20px',
      }}>
        <div style={{ fontSize: 9, fontWeight: 500, letterSpacing: 2.6, color: t.dim, textTransform: 'uppercase', marginBottom: 8 }}>
          Form Score · Last 5
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <div style={{ fontFamily: 'var(--font-outfit)', fontSize: 108, fontWeight: 700, color: t.bright, lineHeight: 0.9, letterSpacing: -4 }}>
            87
          </div>
          <div style={{ fontSize: 16, color: t.dim, fontWeight: 500 }}>/100</div>
        </div>
        <div style={{ marginTop: 4 }}>
          <Sparkline />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <div style={{
            padding: '3px 10px',
            background: `${t.accent}1f`, color: t.accent, borderRadius: 999,
            fontSize: 10, fontWeight: 700, letterSpacing: 1.4,
          }}>ELITE</div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            padding: '3px 8px', borderRadius: 999,
            background: `${t.green}1f`, color: t.green,
            fontSize: 10, fontWeight: 700,
          }}>▲ 4pp</div>
        </div>
      </div>

      {/* RIGHT: latest match + CTA */}
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 9, fontWeight: 500, letterSpacing: 2.4, color: t.dim, textTransform: 'uppercase', marginBottom: 2 }}>
          What's new
        </div>
        <div style={{
          padding: '14px 16px',
          background: t.cardAlt, border: `1px solid ${t.border}`, borderRadius: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{
              padding: '2px 7px', borderRadius: 4,
              background: `${t.green}22`, color: t.green,
              fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
            }}>W 3–1</span>
            <span style={{ fontSize: 11, color: t.dim, fontWeight: 500 }}>Fri, Nov 15</span>
          </div>
          <div style={{ fontSize: 13, color: t.bright, fontWeight: 600, marginBottom: 3 }}>vs Riverside FC</div>
          <div style={{ fontSize: 11, color: t.text, fontWeight: 300 }}>
            6 saves on 7 shots · <span style={{ color: t.accent, fontWeight: 700 }}>85.7%</span>
          </div>
        </div>
        <button style={{
          width: '100%', padding: '14px 16px',
          background: t.accent, border: 'none', borderRadius: 12,
          color: t.darkOnAccent,
          fontFamily: 'var(--font-dm)', fontSize: 13, fontWeight: 700, letterSpacing: 0.3,
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>▶ Review latest match</button>
      </div>
    </div>
  );
}

// ── Small primitives ─────────────────────────────────────────────────────
function EyebrowPill({ children, style }) {
  return (
    <span style={{
      display: 'inline-block',
      fontSize: 11, fontWeight: 500, letterSpacing: '0.14em', textTransform: 'uppercase',
      color: t.accent,
      border: `1px solid rgba(16,185,129,0.35)`,
      background: `rgba(16,185,129,0.06)`,
      padding: '5px 14px',
      borderRadius: 999,
      ...style,
    }}>{children}</span>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 12, fontWeight: 500, letterSpacing: '0.14em',
      textTransform: 'uppercase', color: t.accent,
    }}>{children}</div>
  );
}

// ── Landing CSS (globals + hover states only) ─────────────────────────
const css = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { scroll-behavior: smooth; }
body {
  background: ${t.bg};
  color: ${t.text};
  font-family: var(--font-dm), 'DM Sans', -apple-system, sans-serif;
  font-size: 17px;
  line-height: 1.7;
  -webkit-font-smoothing: antialiased;
}

.nav { position: fixed; top: 0; left: 0; right: 0; z-index: 100;
       display: flex; align-items: center; justify-content: space-between;
       padding: 18px 40px; border-bottom: 1px solid ${t.border};
       background: rgba(7,11,14,0.85); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); }
.nav-links { display: flex; align-items: center; gap: 24px; }
.nav-link { font-size: 13px; color: ${t.text}; text-decoration: none; font-weight: 500; opacity: 0.75; transition: opacity 0.15s, color 0.15s; }
.nav-link:hover { opacity: 1; color: ${t.accent}; }

.btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px;
       font-family: var(--font-dm), 'DM Sans', sans-serif; text-decoration: none; cursor: pointer;
       transition: transform 0.12s, background 0.15s, border-color 0.15s; }
.btn:active { transform: translateY(1px); }
.btn-primary { background: ${t.accent}; color: ${t.darkOnAccent}; border: none;
               padding: 10px 20px; border-radius: 8px; font-size: 14px; font-weight: 600; letter-spacing: 0.2px; }
.btn-primary:hover { background: #0ea56e; }
.btn-primary-lg { padding: 16px 32px; font-size: 16px; font-weight: 700; border-radius: 10px; }
.btn-primary-xl { padding: 18px 36px; font-size: 17px; font-weight: 700; border-radius: 10px; }
.btn-ghost { background: transparent; color: ${t.bright}; border: 1px solid ${t.border};
             padding: 10px 20px; border-radius: 8px; font-size: 14px; font-weight: 500; }
.btn-ghost:hover { border-color: ${t.dim}; }
.btn-ghost-lg { padding: 16px 32px; font-size: 16px; border-radius: 10px; }

.section { padding: 96px 40px; border-top: 1px solid ${t.border}; }
.section:first-of-type { border-top: none; padding-top: 128px; }
.wrap { max-width: 1120px; margin: 0 auto; }
.wrap-narrow { max-width: 900px; margin: 0 auto; }

.h1 { font-family: var(--font-outfit), 'Outfit', sans-serif; font-weight: 800;
      font-size: clamp(2.8rem, 6.5vw, 5rem); line-height: 1.03;
      letter-spacing: -0.025em; color: ${t.bright}; }
.h2 { font-family: var(--font-outfit), 'Outfit', sans-serif; font-weight: 800;
      font-size: clamp(2rem, 4vw, 2.9rem); line-height: 1.08;
      letter-spacing: -0.025em; color: ${t.bright}; }
.h2-lg { font-size: clamp(2.4rem, 5vw, 3.4rem); }

/* Card group: uniform sizing via CSS grid + flex column stretch */
.grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; align-items: stretch; }
.grid-4 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; align-items: stretch; }
@media (min-width: 1200px) { .grid-4 { grid-template-columns: repeat(2, 1fr); } }
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 60px; align-items: start; }
.card { display: flex; flex-direction: column; height: 100%;
        background: ${t.card}; border: 1px solid ${t.border}; border-radius: 16px;
        padding: 32px; transition: border-color 0.2s; }
.card:hover { border-color: rgba(16,185,129,0.35); }
.card-cta-slot { margin-top: auto; padding-top: 20px; }

.faq-item { display: flex; flex-direction: column; height: 100%;
            background: rgba(15,20,25,0.7); border: 1px solid ${t.border}; border-radius: 12px;
            padding: 24px 28px; }

@keyframes clipProgress {
  0% { transform: scaleX(0); }
  100% { transform: scaleX(1); }
}

@media (max-width: 900px) {
  .section { padding: 72px 24px; }
  .grid-3, .grid-4 { grid-template-columns: 1fr; }
  .grid-2 { grid-template-columns: 1fr; gap: 32px; }
  .nav { padding: 14px 20px; }
  .nav-text-links { display: none; }
}
`;

// ══════════════════════════════════════════════════════════════════════
//  PAGE COMPONENT
// ══════════════════════════════════════════════════════════════════════

export default function Page() {
  return (
    <div className={`${outfit.variable} ${dmSans.variable}`}>
      <style dangerouslySetInnerHTML={{ __html: css }} />

      <Nav />
      <Hero />
      <SocialProof />
      <Problem />
      <HowItWorks />
      <ProductTour />
      <Differentiators />
      <StartingXIOffer />
      <Pricing />
      <OriginStory />
      <FAQ />
      <FinalCTA />
      <Footer />
    </div>
  );
}

// ── NAV ────────────────────────────────────────────────────────────────
function Nav() {
  return (
    <nav className="nav">
      <a href="/" style={{ textDecoration: 'none' }}>
        <img src="/logo.svg" alt="Stix" style={{ height: 34 }} />
      </a>
      <div className="nav-links">
        <a href="#offer" className="nav-link nav-text-links">Starting XI</a>
        <a href="#tour" className="nav-link nav-text-links">Product</a>
        <a href="#pricing" className="nav-link nav-text-links">Pricing</a>
        <a href="#story" className="nav-link nav-text-links">Story</a>
        <a href="/login" className="btn btn-ghost">Sign in</a>
        <a href="/apply" className="btn btn-primary">Apply for Starting XI</a>
      </div>
    </nav>
  );
}

// ── HERO ───────────────────────────────────────────────────────────────
function Hero() {
  return (
    <section style={{
      position: 'relative',
      padding: '128px 40px 80px',
      overflow: 'hidden',
      background: `radial-gradient(ellipse 80% 60% at 50% 15%, ${t.accentGlow} 0%, transparent 55%), ${t.bg}`,
    }}>
      <NetMotif opacity={0.05} />
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 1120, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28, textAlign: 'center' }}>
        <EyebrowPill>Starting XI · 8 spots open</EyebrowPill>

        <h1 className="h1" style={{ maxWidth: 980 }}>
          Every position has <span style={{ whiteSpace: 'nowrap' }}>in-depth</span> analytics.<br />
          <span style={{ color: t.accent }}>Except goalkeepers.</span><br />
          <span style={{ color: t.accent }}>That ends here.</span>
        </h1>

        <p style={{ maxWidth: 640, fontSize: 'clamp(1.05rem, 1.5vw, 1.2rem)', color: t.text, lineHeight: 1.6 }}>
          AI-tagged match review. Signals your session plan actually uses. A training-data flywheel
          that gets sharper every match — built with the first eight founding partners.
        </p>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', marginTop: 8 }}>
          <a href="/apply" className="btn btn-primary btn-primary-lg">Apply for Starting XI →</a>
          <a href="#tour" className="btn btn-ghost btn-ghost-lg">See the product</a>
        </div>

        <div style={{ width: '100%', marginTop: 32, display: 'flex', justifyContent: 'center' }}>
          <KeeperHeroMock />
        </div>

        {/* Stats bar */}
        <div style={{
          marginTop: 8,
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
          maxWidth: 720, width: '100%',
          border: `1px solid ${t.border}`, borderRadius: 12, overflow: 'hidden',
        }}>
          {[
            { num: '60+', label: 'Data points / match' },
            { num: '15', label: 'GK attributes' },
            { num: '10', label: 'Analytics tabs' },
            { num: 'AI + Coach', label: 'Correction loop' },
          ].map((s, i) => (
            <div key={s.label} style={{
              padding: '18px 12px', textAlign: 'center',
              borderRight: i < 3 ? `1px solid ${t.border}` : 'none',
              background: 'rgba(15,20,25,0.5)',
            }}>
              <div style={{ fontFamily: 'var(--font-outfit)', fontWeight: 800,
                            fontSize: s.num.length > 3 ? '1.15rem' : '1.6rem',
                            color: t.accent, lineHeight: 1, marginBottom: 6 }}>{s.num}</div>
              <div style={{ fontSize: 10, color: t.dim, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── SOCIAL PROOF ───────────────────────────────────────────────────────
function SocialProof() {
  return (
    <div style={{
      padding: '24px 40px', textAlign: 'center',
      borderTop: `1px solid ${t.border}`, borderBottom: `1px solid ${t.border}`,
      background: t.bg,
    }}>
      <p style={{ fontSize: 13, color: t.dim, letterSpacing: '0.04em' }}>
        Building with elite programs across North America and Europe  ·  Founding cohort limited to 11
      </p>
    </div>
  );
}

// ── PROBLEM ────────────────────────────────────────────────────────────
function Problem() {
  return (
    <section className="section" id="problem">
      <div className="wrap grid-2">
        <div>
          <SectionLabel>Why it matters</SectionLabel>
          <h2 className="h2" style={{ marginTop: 12 }}>
            The keeper is<br />the exception.<br />
            <span style={{ color: t.accent }}>That ends here.</span>
          </h2>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <p style={{ fontSize: 17, color: t.text, lineHeight: 1.75 }}>
            Every outfield position has data. Passes completed. Distance covered. Pressing intensity. Heatmaps.
            Clubs spend hundreds of thousands building analytical infrastructure around eleven players — and then
            the goalkeeper gets a spreadsheet.
          </p>
          <p style={{ fontSize: 17, color: t.text, lineHeight: 1.75 }}>
            The goalkeeper is the only player who faces every shot, organizes the defensive line, initiates
            attacks with every distribution, and is judged by a single number — goals against — that tells
            almost nothing about how they actually performed.
          </p>
          <p style={{ fontSize: 17, color: t.text, lineHeight: 1.75 }}>
            Goalkeeper coaches know this. They track everything they can: save zones, cross claims,
            distribution accuracy, positioning under pressure. They write it in notebooks. They build
            spreadsheets that don't talk to each other. They carry the rest in their heads.
          </p>
          <p style={{ fontSize: 17, color: t.bright, lineHeight: 1.75, fontWeight: 500 }}>
            Every other position has an analytics stack. The keeper has a spreadsheet. That ends here.
          </p>
        </div>
      </div>
    </section>
  );
}

// ── HOW IT WORKS ───────────────────────────────────────────────────────
function HowItWorks() {
  const steps = [
    { num: '01', title: 'Capture', body: 'Upload video from any source — the camera platform you already use, direct file uploads, or a URL. Any input; one intelligence layer.' },
    { num: '02', title: 'AI + Coach Correct', body: 'Every goal, save, cross, distribution, sweeper action, and 1v1 tagged automatically. Your coach reviews and corrects — every correction trains the model.' },
    { num: '03', title: 'Coach + Plan', body: 'Signals surface only when the data supports them. Your next session targets what the match actually revealed — not what you remembered.' },
  ];
  return (
    <section className="section">
      <div className="wrap">
        <div style={{ marginBottom: 48 }}>
          <SectionLabel>How it works</SectionLabel>
          <h2 className="h2" style={{ marginTop: 12 }}>Capture. Correct. Coach.</h2>
          <p style={{ marginTop: 14, maxWidth: 560, color: t.text, fontSize: 18, lineHeight: 1.6 }}>
            Three steps between raw match footage and the session plan that changes what your keeper
            works on next week.
          </p>
        </div>
        <div className="grid-3">
          {steps.map(s => (
            <div key={s.num} className="card">
              <div style={{ fontFamily: 'var(--font-outfit)', fontSize: 60, fontWeight: 800, color: 'rgba(16,185,129,0.15)', lineHeight: 1, marginBottom: 12 }}>
                {s.num}
              </div>
              <h3 style={{ fontFamily: 'var(--font-dm)', fontSize: 22, fontWeight: 700, color: t.bright, marginBottom: 10 }}>{s.title}</h3>
              <p style={{ fontSize: 16, color: t.text, lineHeight: 1.65 }}>{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── MINI DASHBOARD MOCKS (product tour) ────────────────────────────────
function MockFormScore() {
  return (
    <div style={{
      position: 'relative', overflow: 'hidden',
      background: `radial-gradient(ellipse at 50% 30%, ${t.accentDim}55 0%, ${t.card} 65%)`,
      padding: '24px 24px',
      height: 260,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 6,
    }}>
      <NetMotif opacity={0.05} mask={false} />
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        <div style={{ fontSize: 9, fontWeight: 500, letterSpacing: 2.4, color: t.dim, textTransform: 'uppercase' }}>
          Form Score · Last 5
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <div style={{ fontFamily: 'var(--font-outfit)', fontSize: 84, fontWeight: 800, color: t.bright, lineHeight: 0.9, letterSpacing: -3 }}>87</div>
          <div style={{ fontSize: 14, color: t.dim, fontWeight: 500 }}>/100</div>
        </div>
        <div style={{ marginTop: 4 }}>
          <Sparkline w={100} h={26} />
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
          <div style={{ padding: '3px 10px', background: `rgba(16,185,129,0.15)`, color: t.accent, borderRadius: 999, fontSize: 10, fontWeight: 700, letterSpacing: 1.2 }}>ELITE</div>
          <div style={{ padding: '3px 8px', background: `rgba(34,197,94,0.15)`, color: t.green, borderRadius: 999, fontSize: 10, fontWeight: 700 }}>▲ 4pp</div>
        </div>
      </div>
    </div>
  );
}

function MiniSignalCard({ title, accent, items }) {
  return (
    <div style={{
      background: t.card, border: `1px solid ${t.border}`, borderRadius: 10,
      padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 8, fontWeight: 700, color: accent, letterSpacing: 1.6, textTransform: 'uppercase' }}>{title}</span>
        <div style={{ flex: 1, height: 1, background: t.border }} />
      </div>
      {items.map((it, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: accent, lineHeight: 1.3 }}>{it.headline}</div>
          <div style={{ fontSize: 11, color: t.bright, fontWeight: 500 }}>
            {it.value}
            {it.delta && <span style={{ marginLeft: 6, color: accent, fontSize: 10, fontWeight: 700 }}>{it.delta}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function MockSandwichCards() {
  return (
    <div style={{
      background: t.bg,
      padding: 20,
      height: 260,
      display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'stretch',
    }}>
      <MiniSignalCard title="What's going well" accent={t.green} items={[
        { headline: 'Distribution up sharply', value: '78% → 84%', delta: '▲ 6pp' },
        { headline: 'Save % on target', value: '82%', delta: '' },
      ]} />
      <MiniSignalCard title="What to work on" accent={t.gold} items={[
        { headline: 'Cross claims slipping', value: '45% → 38%', delta: '▼ 7pp' },
        { headline: '1v1 win rate', value: '55%', delta: '' },
      ]} />
    </div>
  );
}

function MockGoalHeatmap() {
  const zones = [
    { n: 2 }, { n: 0 }, { n: 3 },
    { n: 0 }, { n: 0 }, { n: 1 },
    { n: 1 }, { n: 0 }, { n: 0 },
  ];
  const max = 3;
  return (
    <div style={{
      background: t.bg, padding: 24, height: 260,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12,
    }}>
      <div style={{ fontSize: 9, fontWeight: 500, letterSpacing: 2.4, color: t.dim, textTransform: 'uppercase' }}>
        Goals Conceded · By Zone
      </div>
      {/* Goal frame — 3:1 aspect, posts + crossbar look */}
      <div style={{
        position: 'relative',
        padding: '8px 8px 4px 8px',
        borderTop: `3px solid ${t.dim}`,
        borderLeft: `3px solid ${t.dim}`,
        borderRight: `3px solid ${t.dim}`,
        borderTopLeftRadius: 4,
        borderTopRightRadius: 4,
        background: 'rgba(15,20,25,0.4)',
      }}>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 108px)', gap: 3,
        }}>
          {zones.map((z, i) => {
            const intensity = z.n / max;
            return (
              <div key={i} style={{
                width: 108, height: 34, borderRadius: 2,
                background: z.n > 0 ? `rgba(239,68,68,${0.18 + intensity * 0.5})` : `rgba(30,42,50,0.5)`,
                border: `1px solid ${z.n > 0 ? `rgba(239,68,68,${0.35 + intensity * 0.4})` : t.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--font-outfit)', fontWeight: 800,
                fontSize: z.n > 0 ? 15 : 10,
                color: z.n > 0 ? '#ff9a9a' : t.dim,
              }}>{z.n || '·'}</div>
            );
          })}
        </div>
        <div style={{ height: 2, background: t.dim, marginTop: 4, borderRadius: 1, opacity: 0.6 }} />
      </div>
      <div style={{ fontSize: 10, color: t.dim, textAlign: 'center', maxWidth: 260, lineHeight: 1.4 }}>
        7 goals across 12 matches — <span style={{ color: '#ff9a9a', fontWeight: 600 }}>top-right</span> is the pattern next session should target.
      </div>
    </div>
  );
}

function MockVideoReview() {
  return (
    <div style={{
      position: 'relative', overflow: 'hidden',
      background: '#050708',
      padding: 0, height: 260,
    }}>
      {/* Real match clip — autoplay muted loop */}
      <video
        src="/samples/rio-save.mp4"
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          objectFit: 'cover',
        }}
      />
      {/* Dim gradient overlay so the tag pills read cleanly on any frame */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 70%, rgba(0,0,0,0.6) 100%)',
        pointerEvents: 'none',
      }} />

      {/* Tag pills — top left */}
      <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', gap: 6, zIndex: 2 }}>
        <span style={{ padding: '4px 9px', borderRadius: 4, background: 'rgba(16,185,129,0.9)', color: t.darkOnAccent, fontSize: 9, fontWeight: 700, letterSpacing: 1.2 }}>SAVE · DEFLECT</span>
        <span style={{ padding: '4px 9px', borderRadius: 4, background: 'rgba(239,68,68,0.9)', color: 'white', fontSize: 9, fontWeight: 700, letterSpacing: 1.2 }}>6-YARD BOX</span>
      </div>
      <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 2 }}>
        <span style={{ padding: '4px 9px', borderRadius: 4, background: 'rgba(0,0,0,0.7)', border: `1px solid ${t.border}`, color: t.text, fontSize: 9, fontWeight: 600, letterSpacing: 1.2 }}>H2 · 48:05 · LOOP</span>
      </div>

      {/* Timeline strip */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 2,
        padding: '10px 14px',
        background: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)',
        pointerEvents: 'none',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, color: t.text, fontFamily: 'var(--font-dm)', fontVariantNumeric: 'tabular-nums' }}>48:00</span>
          <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.15)', borderRadius: 2, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '100%', background: t.accent, borderRadius: 2, transformOrigin: 'left', animation: 'clipProgress 8s linear infinite' }} />
          </div>
          <span style={{ fontSize: 10, color: t.dim, fontFamily: 'var(--font-dm)', fontVariantNumeric: 'tabular-nums' }}>48:08</span>
        </div>
      </div>
    </div>
  );
}

function MockDistributionMap() {
  // Landscape pitch view: 4 distance bands (cols, short → x-long) × 3 lanes (rows L/C/R)
  // Cells 65×56 → total 269×174 = ~1.55:1 (real football pitch aspect). 10% smaller
  // than v1 so the header + grid + distance labels + insight caption all sit cleanly
  // inside the 260px mock height.
  const zones = [
    [{ pct: 85 }, { pct: 71 }, { pct: 55 }, { pct: 42 }],
    [{ gk: true }, { pct: 68 }, { pct: 48 }, { pct: 28 }],
    [{ pct: 88 }, { pct: 74 }, { pct: 62 }, { pct: 38 }],
  ];
  const colorFor = (pct) => {
    if (pct >= 70) return { bg: 'rgba(16,185,129,0.35)', border: 'rgba(16,185,129,0.6)', text: '#c1f5dc' };
    if (pct >= 50) return { bg: 'rgba(212,168,83,0.32)', border: 'rgba(212,168,83,0.6)', text: '#f5d99a' };
    if (pct >= 35) return { bg: 'rgba(249,115,22,0.32)', border: 'rgba(249,115,22,0.6)', text: '#ffb894' };
    return { bg: 'rgba(239,68,68,0.32)', border: 'rgba(239,68,68,0.6)', text: '#ff9a9a' };
  };
  return (
    <div style={{
      background: t.bg, padding: 12, height: 260,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5,
    }}>
      <div style={{ fontSize: 9, fontWeight: 500, letterSpacing: 2.4, color: t.dim, textTransform: 'uppercase' }}>
        Distribution · Completion by Zone
      </div>
      <div style={{
        position: 'relative',
        padding: 5,
        border: `1px solid ${t.border}`,
        borderRadius: 4,
        background: 'rgba(16,185,129,0.045)',
      }}>
        {/* Halfway line */}
        <div style={{
          position: 'absolute', left: '50%', top: 5, bottom: 5,
          borderLeft: '1px dashed rgba(237,234,225,0.10)', transform: 'translateX(-0.5px)',
        }} />
        {/* Center circle */}
        <div style={{
          position: 'absolute', left: '50%', top: '50%',
          width: 30, height: 30, borderRadius: '50%',
          border: '1px dashed rgba(237,234,225,0.08)',
          transform: 'translate(-50%, -50%)', pointerEvents: 'none',
        }} />
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 65px)',
          gridTemplateRows: 'repeat(3, 56px)',
          gap: 3,
        }}>
          {zones.flat().map((z, i) => {
            if (z.gk) {
              return (
                <div key={i} style={{
                  background: 'rgba(30,42,50,0.5)',
                  border: `1px dashed ${t.dim}`,
                  borderRadius: 2,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 9, color: t.dim, fontWeight: 700, letterSpacing: 1,
                }}>GK</div>
              );
            }
            const c = colorFor(z.pct);
            return (
              <div key={i} style={{
                background: c.bg,
                border: `1px solid ${c.border}`,
                borderRadius: 2,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--font-outfit)', fontWeight: 800,
                fontSize: 13, color: c.text,
              }}>{z.pct}%</div>
            );
          })}
        </div>
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 65px)',
        gap: 3, paddingLeft: 5, paddingRight: 5,
      }}>
        {['SHORT', 'MID', 'LONG', 'X-LONG'].map(l => (
          <div key={l} style={{ fontSize: 8, color: t.dim, letterSpacing: 1.4, textAlign: 'center', fontWeight: 700 }}>{l}</div>
        ))}
      </div>
      <div style={{ fontSize: 9, color: t.dim, textAlign: 'center', whiteSpace: 'nowrap', lineHeight: 1.4 }}>
        Long-Center <span style={{ color: '#ff9a9a', fontWeight: 700 }}>28%</span> — the lane to coach around.
      </div>
    </div>
  );
}

function MockAttributeRadar() {
  // 10 GK attributes on a radar. Season vs Last 5 overlaid.
  const attrs = [
    { label: 'SHOT STOP', season: 4.2, last5: 4.6 },
    { label: 'HANDLING',  season: 3.8, last5: 4.1 },
    { label: 'POSITION',  season: 4.5, last5: 4.7 },
    { label: 'AERIAL',    season: 3.5, last5: 3.2 },
    { label: 'DISTRIB',   season: 4.6, last5: 4.4 },
    { label: 'SWEEPER',   season: 3.2, last5: 3.5 },
    { label: 'BOX CMD',   season: 3.9, last5: 4.2 },
    { label: 'REACTION',  season: 4.4, last5: 4.5 },
    { label: 'DECISION',  season: 4.0, last5: 4.3 },
    { label: 'COMPETE',   season: 4.7, last5: 4.7 },
  ];
  const size = 200;
  const cx = size / 2;
  const cy = size / 2;
  const r = 62;
  const n = attrs.length;
  const max = 5;
  const labelR = r + 18;

  const pointFor = (i, value) => {
    const angle = -Math.PI/2 + i * (2*Math.PI/n);
    return { x: cx + (r * value/max) * Math.cos(angle), y: cy + (r * value/max) * Math.sin(angle) };
  };
  const pathFor = (values) =>
    values.map((v, i) => {
      const p = pointFor(i, v);
      return `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    }).join(' ') + ' Z';

  const rings = [1, 2, 3, 4, 5].map(k =>
    attrs.map((_, i) => {
      const p = pointFor(i, k);
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    }).join(' ')
  );

  return (
    <div style={{
      background: t.bg, padding: 12, height: 260,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
    }}>
      <div style={{ fontSize: 9, fontWeight: 500, letterSpacing: 2.4, color: t.dim, textTransform: 'uppercase' }}>
        Attribute Profile · Season vs Last 5
      </div>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow: 'visible' }}>
        {rings.map((points, i) => (
          <polygon key={`r${i}`} points={points} fill="none" stroke={t.border} strokeWidth={0.7} opacity={i === 4 ? 0.55 : 0.3} />
        ))}
        {attrs.map((_, i) => {
          const p = pointFor(i, 5);
          return <line key={`ax${i}`} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke={t.border} strokeWidth={0.5} opacity={0.3} />;
        })}
        <path d={pathFor(attrs.map(a => a.season))} fill="rgba(16,185,129,0.16)" stroke={t.accent} strokeWidth={1.5} strokeLinejoin="round" />
        <path d={pathFor(attrs.map(a => a.last5))} fill="rgba(212,168,83,0.12)" stroke={t.gold} strokeWidth={1.5} strokeLinejoin="round" strokeDasharray="3 2" />
        {attrs.map((a, i) => {
          const angle = -Math.PI/2 + i * (2*Math.PI/n);
          const x = cx + labelR * Math.cos(angle);
          const y = cy + labelR * Math.sin(angle);
          return (
            <text key={`l${i}`} x={x} y={y} fontSize={7} fill={t.dim} fontFamily="var(--font-dm)" fontWeight={700} textAnchor="middle" dominantBaseline="middle" letterSpacing="0.6">
              {a.label}
            </text>
          );
        })}
      </svg>
      <div style={{ display: 'flex', gap: 14, fontSize: 9, alignItems: 'center' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: t.dim }}>
          <span style={{ width: 12, height: 2, background: t.accent, display: 'inline-block' }} /><span>Season</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: t.dim }}>
          <span style={{ width: 12, height: 2, background: t.gold, display: 'inline-block' }} /><span>Last 5</span>
        </span>
      </div>
    </div>
  );
}

// ── PRODUCT TOUR ───────────────────────────────────────────────────────
function ProductTour() {
  const cards = [
    {
      mock: <MockFormScore />,
      title: 'Form score, not gut feel',
      body: 'Composite 0–100 blended from save %, results, distribution, and errors. Updated match by match with a sparkline trend so you see the movement, not just the number.',
    },
    {
      mock: <MockSandwichCards />,
      title: 'Signals your session actually uses',
      body: 'Trends surface only when the data supports them. Plain-English signals of what\'s improving and what\'s slipping — raw material for your next session plan. You still design the session.',
    },
    {
      mock: <MockGoalHeatmap />,
      title: 'Every conceded goal, mapped',
      body: 'Zone, phase, shot origin, GK positioning — the pattern behind the scoreline, not just the total. Your session next week targets where the goals actually came from.',
    },
    {
      mock: <MockVideoReview />,
      title: 'Watch what happened, correct what matters',
      body: 'Every event has an 8-second clip. Coach reviews, coach corrects, and every correction trains the model for the next match. The AI + coach loop is what nobody else runs.',
    },
    {
      mock: <MockDistributionMap />,
      title: 'Distribution completion — mapped',
      body: 'Every pass, kick, and throw tagged by success and target zone. See which lanes your keeper actually completes and which are guesswork — a distribution metric nobody else surfaces for goalkeepers.',
    },
    {
      mock: <MockAttributeRadar />,
      title: 'The complete attribute profile',
      body: 'Fifteen goalkeeper-specific attributes rated across every match. Season and last 5 overlaid so the movement is visible — an evolving profile, not a static spreadsheet.',
    },
  ];
  return (
    <section className="section" id="tour">
      <div className="wrap">
        <div style={{ marginBottom: 48 }}>
          <SectionLabel>Product tour</SectionLabel>
          <h2 className="h2" style={{ marginTop: 12 }}>The six views that change the week.</h2>
          <p style={{ marginTop: 14, maxWidth: 640, color: t.text, fontSize: 18, lineHeight: 1.6 }}>
            Every screen ships with a coaching direction attached. Not a stats dump — a decision surface.
          </p>
        </div>
        <div className="grid-4">
          {cards.map(c => (
            <div key={c.title} className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {c.mock}
              <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1, borderTop: `1px solid rgba(16,185,129,0.25)` }}>
                <h3 style={{ fontFamily: 'var(--font-dm)', fontSize: 18, fontWeight: 700, color: t.bright }}>{c.title}</h3>
                <p style={{ fontSize: 14, color: t.text, lineHeight: 1.65 }}>{c.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── DIFFERENTIATORS ────────────────────────────────────────────────────
function Differentiators() {
  const cards = [
    {
      eyebrow: '01 — DATA MODEL',
      title: 'GK-first schema',
      body: 'Every event type is goalkeeper-specific: cross claims by set-piece context, distribution by pressure, sweeper actions by outcome. Not a team-level analytics tool stretched to cover the position.',
    },
    {
      eyebrow: '02 — AI + COACH',
      title: 'The correction loop',
      body: 'AI tags every event. Coach corrects. Every correction trains the model. Your program\'s Stix gets more accurate every match — a compounding data asset only you have access to.',
    },
    {
      eyebrow: '03 — DECISION SURFACE',
      title: 'Session-facing, not stats-facing',
      body: 'Every signal ships with coaching direction — what to talk about, what to drill, what to watch for. You still design the session. Stix tells you what it should target.',
    },
  ];
  return (
    <section className="section">
      <div className="wrap">
        <div style={{ marginBottom: 48 }}>
          <SectionLabel>Why Stix</SectionLabel>
          <h2 className="h2" style={{ marginTop: 12 }}>
            Built for goalkeepers.<br />Not adapted for them.
          </h2>
          <p style={{ marginTop: 14, maxWidth: 680, color: t.text, fontSize: 18, lineHeight: 1.6 }}>
            Video capture tools give you footage. Team analytics platforms give you generic stats.
            Neither is built around the position that faces every shot and starts every attack.
          </p>
        </div>
        <div className="grid-3">
          {cards.map(c => (
            <div key={c.title} className="card">
              <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.14em', color: t.accent, marginBottom: 12 }}>{c.eyebrow}</div>
              <h3 style={{ fontFamily: 'var(--font-dm)', fontSize: 22, fontWeight: 700, color: t.bright, lineHeight: 1.15, marginBottom: 12 }}>{c.title}</h3>
              <p style={{ fontSize: 15, color: t.text, lineHeight: 1.7 }}>{c.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── FOUNDING EIGHT OFFER ───────────────────────────────────────────────
function StartingXIOffer() {
  const get = [
    '12-month full-access pilot at 40% off future list',
    'Starting XI Rate locked forever (30% off list)',
    'Roadmap co-authorship — quarterly feature vote',
    'First access to every new feature',
    'Direct product line to the founder',
    'Co-marketing rights + physical Starting XI certificate',
  ];
  const ask = [
    'Starting XI fee paid, unlocking your full-cohort access',
    '30-min monthly product feedback call',
    'One testimonial + short video at day-90',
    'Two warm intros at day-60',
    'Permission to say your name publicly',
    'Anonymized data usage rights for training pipeline',
  ];
  return (
    <section className="section" id="offer">
      <div className="wrap">
        <div style={{
          position: 'relative', overflow: 'hidden',
          background: `radial-gradient(ellipse 90% 70% at 50% 20%, ${t.accentGlow} 0%, ${t.card} 60%)`,
          border: `1px solid rgba(16,185,129,0.45)`,
          borderRadius: 24,
          padding: '72px 64px',
        }}>
          <NetMotif opacity={0.06} />
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
            <EyebrowPill>The offer</EyebrowPill>
            <h2 className="h2 h2-lg" style={{ textAlign: 'center', maxWidth: 920 }}>
              Eleven clubs. One cohort. One time.
            </h2>
          </div>

          <div style={{ position: 'relative', zIndex: 1, marginTop: 48, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 60, alignItems: 'start' }}>
            <BulletList title="What you get" titleColor={t.accent} items={get} />
            <BulletList title="What we ask" titleColor={t.dim} items={ask} />
          </div>

          {/* Founder's Guarantee */}
          <div style={{
            position: 'relative', zIndex: 1, marginTop: 40,
            padding: '24px 28px',
            background: 'rgba(212,168,83,0.06)',
            border: '1px solid rgba(212,168,83,0.35)',
            borderRadius: 12,
            display: 'flex', alignItems: 'flex-start', gap: 20,
            maxWidth: 820, marginLeft: 'auto', marginRight: 'auto',
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: 10,
              background: 'rgba(212,168,83,0.15)', border: '1px solid rgba(212,168,83,0.5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: t.gold, fontSize: 20, flexShrink: 0,
            }}>◆</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: t.gold, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 }}>
                6-Month Founder's Guarantee
              </div>
              <p style={{ fontSize: 15, color: t.bright, lineHeight: 1.55, fontWeight: 500 }}>
                If Stix isn't part of your GK coach's weekly workflow by month 6, we refund your entire Starting XI fee.
              </p>
              <div style={{ fontSize: 12, color: t.dim, marginTop: 10, fontStyle: 'italic' }}>
                — Joshua Marshall, Founder
              </div>
            </div>
          </div>

          <div style={{ position: 'relative', zIndex: 1, marginTop: 44, display: 'flex', gap: 20, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
            <a href="/apply" className="btn btn-primary btn-primary-xl">Apply for Starting XI →</a>
            <a href="#pricing" className="btn" style={{ color: t.text, background: 'transparent', border: 'none', fontSize: 14, fontWeight: 500 }}>View pricing tiers ↓</a>
          </div>
        </div>
      </div>
    </section>
  );
}

function BulletList({ title, titleColor, items }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.18em', color: titleColor, textTransform: 'uppercase' }}>{title}</div>
      <ul style={{ display: 'flex', flexDirection: 'column', gap: 12, listStyle: 'none' }}>
        {items.map(it => (
          <li key={it} style={{ display: 'flex', gap: 12, fontSize: 15, color: t.text, lineHeight: 1.6 }}>
            <span style={{ color: t.accent, fontWeight: 700, flexShrink: 0 }}>—</span>
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── PRICING ────────────────────────────────────────────────────────────
function Pricing() {
  const tiers = [
    {
      tier: 'TIER ONE', name: 'Club', metric: 'The 6-yard box',
      founding: '$1,800', list: '$3,600/yr',
      desc: 'One team. Up to 5 keepers. Full-access pilot for the coach ready to move first.',
      features: [
        'Up to 5 goalkeeper profiles',
        'Unlimited match analyses',
        'All dashboard + Data Room tabs',
        'Monthly founder call',
        'Starting XI Rate locked forever',
      ],
      featured: false,
    },
    {
      tier: 'MOST REQUESTED', name: 'Academy', metric: 'The 18-yard box',
      founding: '$4,500', list: '$9,000/yr',
      desc: '3+ teams across age groups. Up to 20 keepers. The tier most Starting XI partners join at.',
      features: [
        'Up to 20 goalkeeper profiles',
        'Unlimited match analyses',
        'Multi-team pathway dashboards',
        'Delegate seats for assistant coaches',
        'Priority roadmap vote',
        'Everything in Club',
      ],
      featured: true,
    },
    {
      tier: 'TIER THREE', name: 'Federation', metric: 'Your entire program',
      founding: '$12,000', list: '$24,000/yr',
      desc: 'Unlimited keepers across unlimited clubs. Multi-club dashboards + coach-development signal.',
      features: [
        'Unlimited keepers, unlimited clubs',
        'Unlimited match analyses',
        'Cross-club benchmarking dashboard',
        'Coach-development signal reports',
        'Federation-tier onboarding + SLA',
        'Everything in Academy',
      ],
      featured: false,
    },
  ];
  return (
    <section className="section" id="pricing">
      <div className="wrap">
        <div style={{ marginBottom: 48 }}>
          <SectionLabel>Pricing</SectionLabel>
          <h2 className="h2" style={{ marginTop: 12 }}>Founding rates. Locked forever.</h2>
          <p style={{ marginTop: 14, maxWidth: 680, color: t.text, fontSize: 18, lineHeight: 1.6 }}>
            Starting XI prices below. After the cohort closes, renewal is at Starting XI Rate — 30% off list, locked at signature.
          </p>
        </div>
        <div className="grid-3">
          {tiers.map(tier => (
            <div key={tier.name} className="card" style={{
              padding: '40px 32px 32px',
              background: tier.featured ? 'rgba(16,185,129,0.045)' : t.card,
              borderColor: tier.featured ? 'rgba(16,185,129,0.5)' : t.border,
              borderWidth: tier.featured ? 1.5 : 1,
            }}>
              <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.14em', color: tier.featured ? t.accent : t.dim, marginBottom: 6 }}>
                {tier.tier}
              </div>
              <h3 style={{ fontFamily: 'var(--font-outfit)', fontSize: 30, fontWeight: 800, color: t.bright, letterSpacing: '-0.02em', marginBottom: 3 }}>{tier.name}</h3>
              <div style={{ fontSize: 11, fontWeight: 500, color: t.accent, marginBottom: 20 }}>{tier.metric}</div>

              <div style={{ marginBottom: 20 }}>
                <div style={{ fontFamily: 'var(--font-outfit)', fontSize: 48, fontWeight: 800, color: t.bright, lineHeight: 1, letterSpacing: '-0.03em' }}>
                  {tier.founding}
                </div>
                <div style={{ fontSize: 12, color: t.dim, marginTop: 6 }}>
                  Starting XI investment  ·  List <span style={{ textDecoration: 'line-through' }}>{tier.list}</span>
                </div>
              </div>

              <p style={{ fontSize: 14, color: t.text, lineHeight: 1.6, marginBottom: 20 }}>{tier.desc}</p>

              <ul style={{ display: 'flex', flexDirection: 'column', gap: 8, listStyle: 'none',
                           paddingTop: 16, paddingBottom: 8,
                           borderTop: `1px solid ${t.border}`, borderBottom: `1px solid ${t.border}` }}>
                {tier.features.map(f => (
                  <li key={f} style={{ display: 'flex', gap: 10, fontSize: 13, color: t.text, lineHeight: 1.55, padding: '4px 0' }}>
                    <span style={{ color: t.accent, fontWeight: 700, flexShrink: 0 }}>—</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <div className="card-cta-slot">
                <a href="/apply" className={tier.featured ? 'btn btn-primary' : 'btn btn-ghost'} style={{ width: '100%', display: 'flex' }}>
                  Claim your spot →
                </a>
              </div>
            </div>
          ))}
        </div>
        <p style={{ textAlign: 'center', marginTop: 28, fontSize: 13, color: t.dim }}>
          Post-cohort renewal at Starting XI Rate  ·  30% off list  ·  Locked at signature.
        </p>
      </div>
    </section>
  );
}

// ── ORIGIN STORY ───────────────────────────────────────────────────────
function OriginStory() {
  const paras = [
    'Stix started in a hockey rink.',
    'A friend of founder Joshua Marshall — a professional goaltender coach in Canada — was drowning in data. Ten-plus goalies. Detailed tracking across every session. Numbers that added up to nothing he could act on. He asked Joshua for a dashboard that could tell a story.',
    'Building it raised a question. If hockey goaltenders at the professional level were working with raw, uninterpreted data, what were soccer goalkeepers working with?',
    'Joshua knew the answer from two directions. As a goalkeeper in his own youth, he had almost nothing — no goalkeeper-specific coaches, no camps, no specialized training, and certainly no data. His son, now an academy goalkeeper, has access to all of it: specialist coaching, dedicated camps, technically advanced training environments. What he doesn\'t have is data.',
    'A generation of development has passed. The coaching infrastructure has caught up. The analytical tools haven\'t.',
    'Stix is the tool that should have existed for both of them. The Starting XI is what happens when the tool that should have existed finally does.',
  ];
  return (
    <section className="section" id="story">
      <div className="wrap" style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 80, alignItems: 'start' }}>
        <aside style={{ position: 'sticky', top: 96 }}>
          <SectionLabel>Our story</SectionLabel>
          <h2 className="h2" style={{ marginTop: 12, fontSize: '2.2rem' }}>
            Built from<br />the crease out.
          </h2>
          <p style={{ marginTop: 20, fontSize: 14, color: t.dim, lineHeight: 1.65 }}>
            Born in Canada. Built for every goalkeeper coach who has always known exactly what their
            keeper needed to improve — and had no data to prove it.
          </p>
          <div style={{ marginTop: 28, paddingTop: 16, borderTop: `1px solid ${t.border}` }}>
            <div style={{ fontFamily: 'var(--font-dm)', fontSize: 14, fontWeight: 700, color: t.bright }}>Joshua Marshall</div>
            <div style={{ fontSize: 12, color: t.dim }}>Founder, Stix</div>
          </div>
        </aside>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          {paras.map((p, i) => (
            <p key={i} style={{ fontSize: 17, color: i === paras.length - 1 ? t.bright : t.text, lineHeight: 1.75, fontWeight: i === paras.length - 1 ? 500 : 400 }}>
              {p}
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── FAQ ────────────────────────────────────────────────────────────────
function FAQ() {
  const faqs = [
    {
      q: 'Why only 11 partners?',
      a: 'Founding cohort membership is finite by design. We can serve 11 partners at the depth Starting XI members deserve — monthly product calls, roadmap co-authorship, feature-first access. More than that dilutes what the tier means. Once we close, the door closes.',
    },
    {
      q: 'What if you sell out before I decide?',
      a: 'You join the waitlist for Cohort Two, launched with case studies from the Starting XI — priced at list, without roadmap authorship rights. Founding rates aren\'t reissued once the eleven seats are claimed.',
    },
    {
      q: 'What\'s the difference between Starting XI and being a regular customer later?',
      a: 'Starting XI members lock a lifetime rate — 30% off list at any tier, in perpetuity — plus roadmap co-authorship, first access to every new feature, physical certification, and direct product-line access to the founder. Regular customers get the product at list price with no lifetime rate.',
    },
    {
      q: 'What if the pilot doesn\'t work for us?',
      a: 'The 12-month term is firm because deliberate practice takes 3–6 months to show measurable movement. We commit to specific workflow outcomes measured at day-90. If those outcomes aren\'t met, we build what it takes to fix them within the pilot year — that\'s what Starting XI status means for us too.',
    },
    {
      q: 'How does this fit alongside my existing video setup?',
      a: 'It works alongside it. Stix ingests video from any camera platform, direct file upload, or URL — you keep whatever capture setup you\'re already using. We\'re the coaching-intelligence layer on top, not a replacement for your camera.',
    },
    {
      q: 'Who owns the data my keepers generate?',
      a: 'You do. Your matches, events, and coaching records remain yours in full. Starting XI partners grant us anonymized usage rights for training the model — event patterns without personal identifiers. You can opt out of the training rights at any time.',
    },
  ];
  return (
    <section className="section">
      <div className="wrap-narrow">
        <div style={{ marginBottom: 40 }}>
          <SectionLabel>FAQ</SectionLabel>
          <h2 className="h2" style={{ marginTop: 12 }}>The questions we get on every call.</h2>
        </div>
        <div className="grid-3" style={{ gridTemplateColumns: '1fr', gap: 12 }}>
          {faqs.map(f => (
            <div key={f.q} className="faq-item">
              <h3 style={{ fontFamily: 'var(--font-dm)', fontSize: 17, fontWeight: 700, color: t.bright, marginBottom: 10 }}>{f.q}</h3>
              <p style={{ fontSize: 15, color: t.text, lineHeight: 1.7 }}>{f.a}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── FINAL CTA ──────────────────────────────────────────────────────────
function FinalCTA() {
  return (
    <section className="section">
      <div className="wrap">
        <div style={{
          position: 'relative', overflow: 'hidden',
          background: `radial-gradient(ellipse 90% 70% at 50% 30%, ${t.accentGlow} 0%, ${t.card} 60%)`,
          border: `1px solid ${t.border}`,
          borderRadius: 20,
          padding: '80px 40px',
          textAlign: 'center',
        }}>
          <NetMotif opacity={0.05} />
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
            <h2 className="h2 h2-lg" style={{ maxWidth: 780 }}>
              Eleven partnerships that shape the tool.
            </h2>
            <p style={{ fontSize: 19, color: t.text, maxWidth: 640, lineHeight: 1.55 }}>
              One founder. One thesis. Eleven founding partners to build what comes next.
            </p>
            <a href="/apply" className="btn btn-primary btn-primary-xl" style={{ marginTop: 8 }}>
              Apply for Starting XI →
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── FOOTER ─────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer style={{
      padding: '28px 40px',
      borderTop: `1px solid ${t.border}`,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
    }}>
      <img src="/logo.svg" alt="Stix" style={{ height: 28 }} />
      <p style={{ fontSize: 13, color: t.dim }}>
        © 2026 Stix by JIRAH Growth Partners  ·  Built for goalkeepers.
      </p>
    </footer>
  );
}
