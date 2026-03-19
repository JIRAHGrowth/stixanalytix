// StixAnalytix — Landing Page
// Paste this file into app/page.jsx on GitHub
// Vercel will auto-deploy within ~60 seconds of committing to main

import { Outfit, DM_Sans } from 'next/font/google';

const outfit = Outfit({ subsets: ['latin'], weight: ['400', '700', '800'], variable: '--font-outfit' });
const dmSans = DM_Sans({ subsets: ['latin'], weight: ['300', '400', '500'], variable: '--font-dm' });

const css = `

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --pitch-black: #0A0A08;
  --chalk: #EDEAE1;
  --green: #10B981;
  --forest: #047857;
  --paper: #F2EFE8;
  --dim: rgba(237,234,225,0.55);
  --border: rgba(237,234,225,0.1);
  --border-hover: rgba(16,185,129,0.4);
}

html { scroll-behavior: smooth; }

body {
  background: var(--pitch-black);
  color: var(--chalk);
  font-family: var(--font-dm), 'DM Sans', sans-serif;
  font-size: 17px; line-height: 1.7;
  line-height: 1.7;
  -webkit-font-smoothing: antialiased;
}

nav {
  position: fixed; top: 0; left: 0; right: 0; z-index: 100;
  display: flex; align-items: center; justify-content: space-between;
  padding: 1rem 2.5rem;
  border-bottom: 1px solid var(--border);
  background: rgba(10,10,8,0.94);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.nav-links { display: flex; align-items: center; }

.btn-ghost {
  background: none;
  border: 1px solid var(--border);
  color: var(--chalk);
  padding: 0.5rem 1.25rem;
  border-radius: 6px;
  font-family: 'DM Sans', sans-serif;
  font-size: 14px;
  cursor: pointer;
  text-decoration: none;
  transition: border-color 0.2s, color 0.2s;
  display: inline-block;
}
.btn-ghost:hover { border-color: var(--green); color: var(--green); }

.btn-primary {
  background: var(--green);
  border: 1px solid var(--green);
  color: #0A0A08;
  padding: 0.5rem 1.25rem;
  border-radius: 6px;
  font-family: 'DM Sans', sans-serif;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  text-decoration: none;
  transition: background 0.2s;
  display: inline-block;
}
.btn-primary:hover { background: #0ea56e; }

.hero {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 9rem 2rem 5rem;
  position: relative;
  overflow: hidden;
}

.hero-grid {
  position: absolute; inset: 0;
  background-image:
    linear-gradient(rgba(16,185,129,0.055) 1px, transparent 1px),
    linear-gradient(90deg, rgba(16,185,129,0.055) 1px, transparent 1px);
  background-size: 44px 44px;
  mask-image: radial-gradient(ellipse 90% 70% at 50% 40%, black 20%, transparent 75%);
  -webkit-mask-image: radial-gradient(ellipse 90% 70% at 50% 40%, black 20%, transparent 75%);
}

.hero-badge {
  position: relative;
  display: inline-block;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--green);
  border: 1px solid rgba(16,185,129,0.3);
  padding: 0.3rem 1.1rem;
  border-radius: 999px;
  margin-bottom: 2.5rem;
}

.hero h1 {
  position: relative;
  font-family: var(--font-outfit), 'Outfit', sans-serif;
  font-weight: 800;
  font-size: clamp(3rem, 7.5vw, 5.8rem);
  line-height: 1.04;
  letter-spacing: -0.025em;
  color: var(--chalk);
  max-width: 860px;
  margin-bottom: 1.5rem;
}

.hero h1 em { font-style: normal; color: var(--green); }

.hero-sub {
  position: relative;
  font-size: clamp(1.2rem, 2.5vw, 1.45rem);
  color: var(--dim);
  max-width: 520px;
  margin-bottom: 2.5rem;
  line-height: 1.65;
}

.hero-ctas {
  position: relative;
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  justify-content: center;
  margin-bottom: 4.5rem;
}

.btn-large { padding: 0.9rem 2rem; font-size: 16px; border-radius: 8px; }

.btn-outline {
  background: none;
  border: 1px solid var(--border);
  color: var(--chalk);
  padding: 0.9rem 2rem;
  font-size: 16px;
  border-radius: 8px;
  font-family: 'DM Sans', sans-serif;
  cursor: pointer;
  text-decoration: none;
  transition: border-color 0.2s;
  display: inline-block;
}
.btn-outline:hover { border-color: rgba(237,234,225,0.45); }

.stats-bar {
  position: relative;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  max-width: 680px;
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
}

.stat-cell {
  background: rgba(237,234,225,0.025);
  padding: 1.25rem 1rem;
  text-align: center;
  border-right: 1px solid var(--border);
}
.stat-cell:last-child { border-right: none; }

.stat-num {
  display: block;
  font-family: var(--font-outfit), 'Outfit', sans-serif;
  font-weight: 700;
  font-size: 1.9rem;
  color: var(--green);
  line-height: 1;
  margin-bottom: 0.3rem;
}

.stat-label {
  font-size: 12px;
  color: var(--dim);
  text-transform: uppercase;
  letter-spacing: 0.07em;
}

.wrap {
  padding: 6rem 2.5rem;
  max-width: 1100px;
  margin: 0 auto;
}

.section-label {
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--green);
  margin-bottom: 0.75rem;
}

.section-title {
  font-family: var(--font-outfit), 'Outfit', sans-serif;
  font-weight: 800;
  font-size: clamp(2rem, 4vw, 2.9rem);
  letter-spacing: -0.025em;
  color: var(--chalk);
  margin-bottom: 0.9rem;
  line-height: 1.1;
}

.section-sub {
  color: var(--dim);
  max-width: 520px;
  font-size: 1.25rem;
  line-height: 1.65;
}

.section-divider {
  border: none;
  border-top: 1px solid var(--border);
  max-width: 1100px;
  margin: 0 auto;
}

.pillars-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.25rem;
  margin-top: 3rem;
}

.pillar-card {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 2rem 1.75rem;
  position: relative;
  overflow: hidden;
  transition: border-color 0.25s;
  background: rgba(237,234,225,0.015);
}
.pillar-card:hover { border-color: var(--border-hover); }

.pillar-accent {
  position: absolute; top: 0; left: 0; right: 0; height: 2px;
  background: var(--green);
  opacity: 0;
  transition: opacity 0.25s;
}
.pillar-card:hover .pillar-accent { opacity: 1; }

.pillar-num {
  font-family: var(--font-outfit), 'Outfit', sans-serif;
  font-size: 4rem;
  font-weight: 800;
  color: rgba(16,185,129,0.1);
  line-height: 1;
  margin-bottom: 1rem;
}

.pillar-title {
  font-family: var(--font-outfit), 'Outfit', sans-serif;
  font-size: 1.25rem;
  font-weight: 700;
  margin-bottom: 0.6rem;
  color: var(--chalk);
}

.pillar-body { font-size: 17px; color: var(--dim); line-height: 1.65; }

.audience-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
  gap: 1rem;
  margin-top: 3rem;
}

.audience-card {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 1.5rem;
  background: rgba(237,234,225,0.02);
  transition: border-color 0.2s;
}
.audience-card:hover { border-color: var(--border-hover); }

.audience-tag {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--green);
  margin-bottom: 0.4rem;
  font-weight: 500;
}

.audience-title {
  font-family: var(--font-outfit), 'Outfit', sans-serif;
  font-weight: 700;
  font-size: 1.25rem;
  margin-bottom: 0.5rem;
  color: var(--chalk);
}

.audience-body { font-size: 17px; color: var(--dim); line-height: 1.6; }

.pricing-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(290px, 1fr));
  gap: 1.25rem;
  margin-top: 3rem;
  align-items: stretch;
}

.pricing-card {
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 2.5rem 2rem;
  position: relative;
  background: rgba(237,234,225,0.015);
  display: flex;
  flex-direction: column;
}
.pricing-card.featured { border-color: var(--green); background: rgba(16,185,129,0.04); }

.featured-badge {
  position: absolute;
  top: -1px; left: 50%;
  transform: translateX(-50%);
  background: var(--green);
  color: #0A0A08;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  padding: 0.25rem 1.1rem;
  border-radius: 0 0 8px 8px;
  white-space: nowrap;
}

.tier-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--dim);
  margin-bottom: 0.3rem;
  font-weight: 500;
}

.tier-name {
  font-family: var(--font-outfit), 'Outfit', sans-serif;
  font-weight: 800;
  font-size: 1.6rem;
  margin-bottom: 0.15rem;
  color: var(--chalk);
  line-height: 1.1;
}

.tier-metric {
  font-size: 10px;
  color: var(--green);
  margin-bottom: 1.5rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: 500;
}

.tier-price {
  font-family: var(--font-outfit), 'Outfit', sans-serif;
  font-weight: 800;
  font-size: 3.2rem;
  line-height: 1;
  margin-bottom: 0.25rem;
  color: var(--chalk);
}
.tier-price sup { font-size: 1.4rem; font-weight: 700; vertical-align: super; color: var(--dim); }
.tier-price sub { font-size: 1rem; font-weight: 400; color: var(--dim); vertical-align: baseline; }

.tier-desc { font-size: 16px; color: var(--dim); margin: 1rem 0 2rem; line-height: 1.55; }

.feature-list { list-style: none; margin-bottom: 2.5rem; flex: 1; }

.feature-list li {
  font-size: 16px;
  padding: 0.4rem 0;
  color: rgba(237,234,225,0.8);
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
  border-bottom: 1px solid rgba(237,234,225,0.05);
}
.feature-list li:last-child { border-bottom: none; }
.feature-list li::before { content: '—'; color: var(--green); font-weight: 700; flex-shrink: 0; font-size: 12px; }

.tier-cta {
  width: 100%;
  padding: 0.9rem;
  border-radius: 8px;
  font-family: 'DM Sans', sans-serif;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  text-align: center;
  display: block;
  text-decoration: none;
}

.tier-cta-primary { background: var(--green); border: 1px solid var(--green); color: #0A0A08; }
.tier-cta-primary:hover { background: #0ea56e; }
.tier-cta-ghost { background: none; border: 1px solid var(--border); color: var(--chalk); }
.tier-cta-ghost:hover { border-color: rgba(237,234,225,0.4); }

.pricing-note { text-align: center; margin-top: 1.75rem; font-size: 16px; color: var(--dim); }

.cta-block {
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 5.5rem 2rem;
  text-align: center;
  background: rgba(16,185,129,0.03);
  position: relative;
  overflow: hidden;
}
.cta-block::before {
  content: '';
  position: absolute; inset: 0;
  background-image:
    linear-gradient(rgba(16,185,129,0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(16,185,129,0.05) 1px, transparent 1px);
  background-size: 32px 32px;
  mask-image: radial-gradient(ellipse 80% 80% at 50% 50%, black, transparent);
  -webkit-mask-image: radial-gradient(ellipse 80% 80% at 50% 50%, black, transparent);
}
.cta-block h2 {
  position: relative;
  font-family: var(--font-outfit), 'Outfit', sans-serif;
  font-weight: 800;
  font-size: clamp(2rem, 4.5vw, 3.2rem);
  letter-spacing: -0.025em;
  margin-bottom: 0.9rem;
  color: var(--chalk);
  line-height: 1.1;
}
.cta-block p { position: relative; color: var(--dim); margin-bottom: 2.5rem; font-size: 1.25rem; }

footer {
  max-width: 1100px;
  margin: 0 auto;
  padding: 2rem 2.5rem;
  border-top: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 1rem;
}
.footer-copy { font-size: 15px; color: var(--dim); }

/* ── PROBLEM ── */
.problem-wrap {
  padding: 6rem 2.5rem;
  max-width: 1100px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 5rem;
  align-items: center;
}
.problem-lede {
  font-family: var(--font-outfit), 'Outfit', sans-serif;
  font-weight: 800;
  font-size: clamp(2rem, 3.8vw, 2.75rem);
  letter-spacing: -0.025em;
  color: var(--chalk);
  line-height: 1.1;
  margin-bottom: 2rem;
}
.problem-lede em { font-style: normal; color: var(--green); }
.problem-body p { color: var(--dim); font-size: 1.2rem; line-height: 1.75; margin-bottom: 1.25rem; }
.problem-body p:last-child { margin-bottom: 0; }
.problem-body strong { color: var(--chalk); font-weight: 500; }

/* ── PITCHSIDE ── */
.pitchside-wrap { padding: 6rem 2.5rem; max-width: 1100px; margin: 0 auto; }
.pitchside-intro { max-width: 620px; margin-bottom: 3.5rem; }
.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1px;
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
  margin-bottom: 3rem;
}
.metric-cell {
  padding: 1.5rem 1.4rem;
  background: rgba(237,234,225,0.02);
  border-right: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  transition: background 0.2s;
}
.metric-cell:hover { background: rgba(16,185,129,0.04); }
.metric-cell-title { font-family: var(--font-outfit), 'Outfit', sans-serif; font-weight: 700; font-size: 1.05rem; color: var(--chalk); margin-bottom: 0.35rem; }
.metric-cell-body { font-size: 16px; color: var(--dim); line-height: 1.55; }
.pitchside-callout {
  border-left: 2px solid var(--green);
  padding: 1.25rem 1.75rem;
  background: rgba(16,185,129,0.04);
  border-radius: 0 8px 8px 0;
  max-width: 680px;
}
.pitchside-callout p { font-size: 1.25rem; color: var(--chalk); line-height: 1.65; font-style: italic; }

/* ── ORIGIN ── */
.origin-wrap {
  padding: 6rem 2.5rem;
  max-width: 1100px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 5rem;
  align-items: start;
}
.origin-aside { position: sticky; top: 6rem; }
.origin-eyebrow { font-size: 11px; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; color: var(--green); margin-bottom: 0.75rem; }
.origin-headline { font-family: var(--font-outfit), 'Outfit', sans-serif; font-weight: 800; font-size: 2rem; letter-spacing: -0.025em; line-height: 1.1; color: var(--chalk); margin-bottom: 1.25rem; }
.origin-sig { margin-top: 2rem; padding-top: 1.25rem; border-top: 1px solid var(--border); }
.origin-sig-name { font-family: var(--font-outfit), 'Outfit', sans-serif; font-weight: 700; font-size: 0.95rem; color: var(--chalk); }
.origin-sig-role { font-size: 12px; color: var(--dim); }
.origin-body p { color: var(--dim); font-size: 1.05rem; line-height: 1.8; margin-bottom: 1.5rem; }
.origin-body p:last-child { margin-bottom: 0; }
.origin-body strong { color: var(--chalk); font-weight: 500; }

/* ── RESPONSIVE ── */
@media (max-width: 820px) {
  .problem-wrap { grid-template-columns: 1fr; gap: 2rem; padding: 4rem 1.25rem; }
  .origin-wrap { grid-template-columns: 1fr; gap: 2rem; padding: 4rem 1.25rem; }
  .origin-aside { position: static; }
}
@media (max-width: 700px) {
  nav { padding: 1rem 1.25rem; }
  .nav-text-links { display: none; }
  .hero { padding: 7rem 1.25rem 4rem; }
  .hero h1 { font-size: 2.6rem; }
  .stats-bar { grid-template-columns: repeat(2, 1fr); }
  .stat-cell:nth-child(2) { border-right: none; }
  .wrap { padding: 4rem 1.25rem; }
  .pitchside-wrap { padding: 4rem 1.25rem; }
  footer { padding: 1.5rem 1.25rem; }
}
`;

function LogoSVG({ height = 38 }) {
  return (
    <svg viewBox="0 0 210 58" height={height} xmlns="http://www.w3.org/2000/svg" aria-label="stixanalytix" role="img">
      <line x1="5" y1="5" x2="205" y2="5" stroke="#EDEAE1" strokeWidth="6" strokeLinecap="square" />
      <line x1="5" y1="5" x2="5" y2="56" stroke="#EDEAE1" strokeWidth="6" strokeLinecap="square" />
      <line x1="205" y1="5" x2="205" y2="56" stroke="#EDEAE1" strokeWidth="6" strokeLinecap="square" />
      <line x1="25" y1="5" x2="25" y2="56" stroke="#EDEAE1" strokeWidth="0.9" opacity="0.17" />
      <line x1="45" y1="5" x2="45" y2="56" stroke="#EDEAE1" strokeWidth="0.9" opacity="0.17" />
      <line x1="65" y1="5" x2="65" y2="56" stroke="#EDEAE1" strokeWidth="0.9" opacity="0.17" />
      <line x1="85" y1="5" x2="85" y2="56" stroke="#EDEAE1" strokeWidth="0.9" opacity="0.17" />
      <line x1="105" y1="5" x2="105" y2="56" stroke="#EDEAE1" strokeWidth="0.9" opacity="0.17" />
      <line x1="125" y1="5" x2="125" y2="56" stroke="#EDEAE1" strokeWidth="0.9" opacity="0.17" />
      <line x1="145" y1="5" x2="145" y2="56" stroke="#EDEAE1" strokeWidth="0.9" opacity="0.17" />
      <line x1="165" y1="5" x2="165" y2="56" stroke="#EDEAE1" strokeWidth="0.9" opacity="0.17" />
      <line x1="185" y1="5" x2="185" y2="56" stroke="#EDEAE1" strokeWidth="0.9" opacity="0.17" />
      <line x1="5" y1="19" x2="205" y2="19" stroke="#EDEAE1" strokeWidth="0.9" opacity="0.17" />
      <line x1="5" y1="33" x2="205" y2="33" stroke="#EDEAE1" strokeWidth="0.9" opacity="0.17" />
      <line x1="5" y1="47" x2="205" y2="47" stroke="#EDEAE1" strokeWidth="0.9" opacity="0.17" />
      <text x="105" y="32" textAnchor="middle" dominantBaseline="middle"
        fontFamily="Outfit, sans-serif" fontWeight="700" fontSize="21"
        letterSpacing="-1" fill="#10B981">stixanalytix</text>
    </svg>
  );
}

export default function Page() {
  return (
    <div className={`${outfit.variable} ${dmSans.variable}`}>
      <style dangerouslySetInnerHTML={{ __html: css }} />

      {/* ── NAV ── */}
      <nav>
        <a href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
          <LogoSVG height={38} />
        </a>
        <div className="nav-links" style={{ gap: '0.5rem' }}>
          <a href="#problem" className="btn-ghost nav-text-links" style={{ border: 'none', fontSize: '13px', padding: '0.4rem 0.8rem', opacity: 0.7 }}>Why It Matters</a>
          <a href="#pitchside" className="btn-ghost nav-text-links" style={{ border: 'none', fontSize: '13px', padding: '0.4rem 0.8rem', opacity: 0.7 }}>Pitchside</a>
          <a href="#story" className="btn-ghost nav-text-links" style={{ border: 'none', fontSize: '13px', padding: '0.4rem 0.8rem', opacity: 0.7 }}>Our Story</a>
          <a href="#pricing" className="btn-ghost nav-text-links" style={{ border: 'none', fontSize: '13px', padding: '0.4rem 0.8rem', opacity: 0.7 }}>Pricing</a>
          <a href="/login" className="btn-ghost">Sign In</a>
          <a href="/signup" className="btn-primary">Start Free</a>
        </div>
      </nav>

      {/* ── HERO ── */}
      <div className="hero">
        <div className="hero-grid" aria-hidden="true"></div>
        <div className="hero-badge">Now in Beta — Free for Early Adopters</div>
        <h1>Coaching intelligence<br />for <em>goalkeepers.</em></h1>
        <p className="hero-sub">
          Track every save, cross, and distribution from the touchline. Spot declining performance
          before it shows in results. Make data-backed decisions — from your phone.
        </p>
        <div className="hero-ctas">
          <a href="/signup" className="btn-primary btn-large">Start Tracking Free</a>
          <a href="#features" className="btn-outline btn-large">See How It Works</a>
        </div>
        <div className="stats-bar" aria-label="Platform statistics">
          <div className="stat-cell">
            <span className="stat-num">30+</span>
            <span className="stat-label">GK Metrics</span>
          </div>
          <div className="stat-cell">
            <span className="stat-num">15</span>
            <span className="stat-label">Attributes rated</span>
          </div>
          <div className="stat-cell">
            <span className="stat-num">10</span>
            <span className="stat-label">Dashboard tabs</span>
          </div>
          <div className="stat-cell">
            <span className="stat-num">5s</span>
            <span className="stat-label">Per-event entry</span>
          </div>
        </div>
      </div>

      <hr className="section-divider" />

      {/* ── PILLARS ── */}
      <div className="wrap" id="features">
        <div className="section-label">How it works</div>
        <h2 className="section-title">Track. Analyze. Act.</h2>
        <p className="section-sub">Built for the goalkeeper coach who manages multiple keepers and needs data — not another spreadsheet.</p>
        <div className="pillars-grid">
          <div className="pillar-card">
            <div className="pillar-accent" aria-hidden="true"></div>
            <div className="pillar-num" aria-hidden="true">01</div>
            <div className="pillar-title">Pitchside Capture</div>
            <p className="pillar-body">Log saves, goals, crosses, distribution, and sweeper actions from the touchline. Designed for your phone, built for game speed. Works without a signal.</p>
          </div>
          <div className="pillar-card">
            <div className="pillar-accent" aria-hidden="true"></div>
            <div className="pillar-num" aria-hidden="true">02</div>
            <div className="pillar-title">Automated Analytics</div>
            <p className="pillar-body">Season stats, quarterly trends, radar profiles, and head-to-head comparisons — computed automatically from every match you log. No formulas. No maintenance.</p>
          </div>
          <div className="pillar-card">
            <div className="pillar-accent" aria-hidden="true"></div>
            <div className="pillar-num" aria-hidden="true">03</div>
            <div className="pillar-title">Caution Alerts</div>
            <p className="pillar-body">Detects when a keeper&#39;s performance is trending down across three or more matches. Catches problems before they appear in results — with a specific coaching action attached to each alert.</p>
          </div>
        </div>
      </div>

      <hr className="section-divider" />

      {/* ── THE PROBLEM ── */}
      <div className="problem-wrap" id="problem">
        <div>
          <div className="section-label">Why it matters</div>
          <h2 className="problem-lede">The keeper is<br />the exception.<br /><em>That ends here.</em></h2>
        </div>
        <div className="problem-body">
          <p>Every outfield position has data. Passes completed. Distance covered. Pressing intensity. Heatmaps. Clubs spend hundreds of thousands building analytical infrastructure around eleven players — and then <strong>the goalkeeper gets a spreadsheet.</strong></p>
          <p>The goalkeeper is the only player who faces every shot, organizes the entire defensive line, initiates attacks with every distribution, and is judged by a single number — goals against — that tells almost nothing about how they actually performed.</p>
          <p>Goalkeeper coaches know this. They track everything they can: save zones, cross claims, distribution accuracy, positioning under pressure. They write it in notebooks. They build spreadsheets that don&#39;t talk to each other. They carry the rest in their heads.</p>
          <p>StixAnalytix exists because that is not good enough. <strong>Not for the coach managing eight keepers across three age groups. Not for the keeper who deserves to know exactly where they&#39;re improving. Not for the director making selection decisions that affect someone&#39;s development trajectory.</strong></p>
          <p>Data that tells the story. Alerts that catch problems before they become patterns. Tools built for the goalkeeper first — not adapted from something built for everyone else.</p>
        </div>
      </div>

      <hr className="section-divider" />

      {/* ── PITCHSIDE DEEP-DIVE ── */}
      <div className="pitchside-wrap" id="pitchside">
        <div className="pitchside-intro">
          <div className="section-label">How Pitchside works</div>
          <h2 className="section-title">From the touchline.<br />In real time.</h2>
          <p className="section-sub">Most data tools are built for after the match. StixAnalytix is built for during it.</p>
        </div>
        <div className="metrics-grid">
          {[
            { title: 'Shot Stopping', body: 'Six-zone grid. Save type — catch, parry, dive, block, tip. Difficulty rating. Every shot tracked in under five seconds.' },
            { title: 'Crosses', body: 'Claimed, punched, missed, not challenged. Open play and set piece separated. Trends surface automatically across the season.' },
            { title: 'Distribution', body: 'Goal kicks short and long, throws, passes under pressure — each logged with a success or failure. Accuracy rates computed automatically.' },
            { title: '1v1 Situations', body: 'Won, lost, fouled. The moments that decide matches, tracked individually and trended across the season.' },
            { title: 'Sweeper Actions', body: "Clearances, interceptions, and tackles outside the box. The modern goalkeeper's expanded role, fully measured." },
            { title: 'Goals Conceded', body: 'Zone, origin, shot type, difficulty, and GK positioning logged for every goal. The context behind the scoreline.' },
            { title: 'Half-Time Notes', body: 'Qualitative observations per half, attached directly to the match record. Your coaching voice alongside the data.' },
            { title: 'Attribute Ratings', body: 'Fifteen GK-specific categories rated 1–5 at full time. Feeds directly into the radar charts and trend lines in the dashboard.' },
          ].map((m) => (
            <div className="metric-cell" key={m.title}>
              <div className="metric-cell-title">{m.title}</div>
              <p className="metric-cell-body">{m.body}</p>
            </div>
          ))}
        </div>
        <div className="pitchside-callout">
          <p>It works without a signal. Stadium Wi-Fi is unreliable. Pitchside caches everything locally and syncs the moment you&#39;re back online. You never lose a match.</p>
        </div>
      </div>

      <hr className="section-divider" />

      {/* ── ORIGIN / ABOUT ── */}
      <div className="origin-wrap" id="story">
        <div className="origin-aside">
          <div className="origin-eyebrow">Our story</div>
          <h2 className="origin-headline">Built from<br />the crease out.</h2>
          <p style={{ fontSize: '13.5px', color: 'var(--dim)', lineHeight: '1.65' }}>Born in Canada. Built for every goalkeeper coach who has always known exactly what their keeper needed to improve — and had no data to prove it.</p>
          <div className="origin-sig">
            <div className="origin-sig-name">Joshua Marshall</div>
            <div className="origin-sig-role">Founder, StixAnalytix</div>
          </div>
        </div>
        <div className="origin-body">
          <p>StixAnalytix started in a hockey rink.</p>
          <p>A friend of founder Joshua Marshall — a professional goaltender coach in Canada — was drowning in data. Ten-plus goalies. Detailed tracking across every session. Numbers that added up to nothing he could act on. He asked Joshua for a dashboard that could tell a story.</p>
          <p>Building it raised a question. If hockey goaltenders at the professional level were working with raw, uninterpreted data, what were soccer goalkeepers working with?</p>
          <p>Joshua knew the answer from two directions. As a goalkeeper in his own youth, he had almost nothing — no goalkeeper-specific coaches, no camps, no specialized training, and certainly no data. His son, now an academy goalkeeper, has access to all of it: specialist coaching, dedicated camps, technically advanced training environments. <strong>What he doesn&#39;t have is data.</strong></p>
          <p>A generation of development has passed. The coaching infrastructure has caught up. The analytical tools haven&#39;t.</p>
          <p>StixAnalytix is the tool that should have existed for both of them. The last line of defense before a goal. The first touch in building an attack. <strong>The goalkeeper has always been the most consequential position on the pitch. It&#39;s time the data reflected that.</strong></p>
        </div>
      </div>

      <hr className="section-divider" />

      {/* ── AUDIENCE ── */}
      <div className="wrap">
        <div className="section-label">Built for every level</div>
        <h2 className="section-title">Your level. Your data.</h2>
        <p className="section-sub">From grassroots development to professional scouting, the platform fits the coaching environment you work in.</p>
        <div className="audience-grid">
          <div className="audience-card">
            <div className="audience-tag">Academy</div>
            <div className="audience-title">Academy Coaches</div>
            <p className="audience-body">Track four to eight keepers across age groups. See who&#39;s developing, who&#39;s stalling, and make objective selection decisions.</p>
          </div>
          <div className="audience-card">
            <div className="audience-tag">University</div>
            <div className="audience-title">University Programs</div>
            <p className="audience-body">Track match and training sessions. Every keeper gets analytics — not just the starter who gets game time.</p>
          </div>
          <div className="audience-card">
            <div className="audience-tag">Professional</div>
            <div className="audience-title">Professional Clubs</div>
            <p className="audience-body">Replace your spreadsheets. Get coaching intelligence without hiring a data analyst or building internal tools.</p>
          </div>
          <div className="audience-card">
            <div className="audience-tag">Federation</div>
            <div className="audience-title">Governing Bodies</div>
            <p className="audience-body">Track provincial and national identification pools. Custom pricing for programs managing multiple clubs and age groups.</p>
          </div>
        </div>
      </div>

      <hr className="section-divider" />

      {/* ── PRICING ── */}
      <div className="wrap" id="pricing">
        <div className="section-label">Pricing</div>
        <h2 className="section-title">Named for the pitch.</h2>
        <p className="section-sub">Priced for the coach. Free to start — no credit card required during beta.</p>
        <div className="pricing-grid">

          <div className="pricing-card">
            <div className="tier-label">Tier One</div>
            <div className="tier-name">Grassroots</div>
            <div className="tier-metric">The 6-yard box</div>
            <div className="tier-price"><sup>$</sup>6<sub>/month</sub></div>
            <p className="tier-desc">For individual coaches, parents, and keepers starting out. Everything you need to replace the notepad.</p>
            <ul className="feature-list">
              <li>1 goalkeeper profile</li>
              <li>Full Pitchside match capture</li>
              <li>Overview, Matches &amp; Quarterly tabs</li>
              <li>Season stats and form tracking</li>
            </ul>
            <a href="/signup" className="tier-cta tier-cta-ghost">Get Started Free</a>
          </div>

          <div className="pricing-card featured">
            <div className="featured-badge">Most Popular</div>
            <div className="tier-label">Tier Two</div>
            <div className="tier-name">Academy</div>
            <div className="tier-metric">The 18-yard box</div>
            <div className="tier-price"><sup>$</sup>18<sub>/month</sub></div>
            <p className="tier-desc">For serious coaches managing a keeper stable. All the insight tabs, automated alerts, and comparison tools.</p>
            <ul className="feature-list">
              <li>Up to 5 goalkeeper profiles</li>
              <li>All 10 dashboard tabs</li>
              <li>Caution alerts</li>
              <li>Head-to-head comparison</li>
              <li>PDF match reports</li>
              <li>Club color branding</li>
            </ul>
            <a href="/signup" className="tier-cta tier-cta-primary">Start Free Trial</a>
          </div>

          <div className="pricing-card">
            <div className="tier-label">Tier Three</div>
            <div className="tier-name">Pro — Built for You</div>
            <div className="tier-metric">Your program. Your terms.</div>
            <div className="tier-price" style={{ fontSize: '2rem', paddingTop: '0.5rem', paddingBottom: '0.1rem' }}>Custom</div>
            <p className="tier-desc">A plan built just for you — if you&#39;re managing multiple teams, are a federation or governing body, and value custom onboarding. Prices are based on your unique needs.</p>
            <ul className="feature-list">
              <li>Unlimited goalkeeper profiles</li>
              <li>Multi-team management</li>
              <li>Federation &amp; governing body access</li>
              <li>Custom onboarding &amp; support</li>
              <li>Everything in Academy</li>
              <li>Pricing based on your program</li>
            </ul>
            <a href="/contact" className="tier-cta tier-cta-ghost">Click for Custom Pricing</a>
          </div>

        </div>
        <p className="pricing-note">Free during beta. All plans include a free trial period — no credit card required to start.</p>
      </div>

      <hr className="section-divider" />

      {/* ── FINAL CTA ── */}
      <div className="wrap">
        <div className="cta-block">
          <h2>Ready to track smarter?</h2>
          <p>Free during beta. Start logging your first match in minutes.</p>
          <a href="/signup" className="btn-primary btn-large">Create Your Free Account</a>
        </div>
      </div>

      {/* ── FOOTER ── */}
      <footer>
        <LogoSVG height={30} />
        <p className="footer-copy">© 2026 StixAnalytix by JIRAH Growth Partners</p>
      </footer>
    </div>
  );
}

