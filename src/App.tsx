import { useEffect, useState, type ReactNode } from 'react';
import { Scene3D } from './components/Scene3D';
import { TwelveLeadGrid } from './components/TwelveLeadGrid';
import { EKGStrip } from './components/EKGStrip';
import { ControlPanel } from './components/ControlPanel';
import { AboutModal } from './components/AboutModal';
import { useSimulationStore } from './store/simulation-store';
import { computeWCT, ELECTRODE_POSITIONS } from './engine/lead-calculator';
import type { Vec3 } from './engine/cardiac-vector';
import './index.css';

const WCT = computeWCT(ELECTRODE_POSITIONS.RA, ELECTRODE_POSITIONS.LA, ELECTRODE_POSITIONS.LL);

// ── XP Window chrome component ────────────────────────────────────────────────
function XPWindow({
  title, icon = '🖥', children, style, bodyStyle,
}: {
  title: string;
  icon?: string;
  children: ReactNode;
  style?: React.CSSProperties;
  bodyStyle?: React.CSSProperties;
}) {
  return (
    <div className="xp-window" style={style}>
      <div className="xp-titlebar">
        <span className="xp-titlebar-icon">{icon}</span>
        <span className="xp-titlebar-title">{title}</span>
        <div className="xp-chrome-buttons">
          <div className="xp-chrome-btn xp-chrome-btn-min">_</div>
          <div className="xp-chrome-btn xp-chrome-btn-max">□</div>
          <div className="xp-chrome-btn xp-chrome-btn-close">✕</div>
        </div>
      </div>
      <div className="xp-body" style={bodyStyle}>
        {children}
      </div>
    </div>
  );
}

// ── Clock for taskbar ────────────────────────────────────────────────────────
function Clock() {
  const now = new Date();
  return (
    <span style={{ fontSize: 11, fontFamily: 'Tahoma, sans-serif' }}>
      {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
    </span>
  );
}

// ── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [showAbout, setShowAbout] = useState(false);
  const customPos = useSimulationStore((s) => s.customElectrodePos);
  const heartRateBpm = useSimulationStore((s) => s.heartRateBpm);
  const activePathologyId = useSimulationStore((s) => s.activePathologyId);
  const theme = useSimulationStore((s) => s.theme);

  // Sync theme to DOM
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const customLeadVector: Vec3 | null = customPos
    ? [customPos[0] - WCT[0], customPos[1] - WCT[1], customPos[2] - WCT[2]]
    : null;

  return (
    <div
      style={{
        height: '100vh',
        display: 'grid',
        gridTemplateRows: customLeadVector ? '1fr auto 30px' : '1fr 30px',
        gridTemplateColumns: '1fr',
        overflow: 'hidden',
        background: 'var(--xp-bg)',
      }}
    >
      {/* ── Main row ───────────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '390px 1fr 260px',
          gap: 4,
          padding: 4,
          minHeight: 0,
        }}
      >
        {/* Left: 3D scene */}
        <XPWindow
          title="3D Cardiac Model"
          icon="❤"
          style={{ minHeight: 0 }}
          bodyStyle={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
        >
          <div style={{ flex: 1, minHeight: 0 }}>
            <Scene3D width="100%" height="100%" />
          </div>
          <div className="xp-statusbar">
            <span>Drag: orbit</span>
            <div className="xp-statusbar-divider" />
            <span>Scroll: zoom</span>
            <div className="xp-statusbar-divider" />
            <span style={{ marginLeft: 'auto' }}>{heartRateBpm} bpm</span>
          </div>
        </XPWindow>

        {/* Center: 12-lead EKG */}
        <XPWindow
          title="12-Lead EKG — Standard Clinical Layout"
          icon="📈"
          style={{ minHeight: 0 }}
          bodyStyle={{ overflow: 'auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 6 }}
        >
          <TwelveLeadGrid />
        </XPWindow>

        {/* Right: Control panel */}
        <XPWindow
          title="Simulation Controls"
          icon="⚙"
          style={{ minHeight: 0 }}
          bodyStyle={{ padding: 0, overflow: 'hidden' }}
        >
          <ControlPanel />
        </XPWindow>
      </div>

      {/* ── Bottom: Custom lead strip (conditional) ────────────────────────── */}
      {customLeadVector && (
        <div style={{ padding: '0 4px 4px', minHeight: 0 }}>
          <XPWindow
            title={`Custom Lead — electrode at (${customPos!.map((v) => v.toFixed(2)).join(', ')})`}
            icon="🔌"
            style={{ height: '100%' }}
            bodyStyle={{ padding: 0, overflow: 'hidden' }}
          >
            <EKGStrip
              leadName="I"
              customLeadVector={customLeadVector}
              label="Custom"
              width={window.innerWidth - 16}
              height={100}
              showGrid
            />
          </XPWindow>
        </div>
      )}

      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}

      {/* ── XP Taskbar ─────────────────────────────────────────────────────── */}
      <div className="xp-taskbar">
        <button className="xp-start-btn">⊞ Start</button>

        {/* About button */}
        <button
          className="xp-btn"
          onClick={() => setShowAbout(true)}
          style={{ fontSize: 10, padding: '1px 8px' }}
        >
          ? About
        </button>

        {/* Active window pills */}
        <div style={{ display: 'flex', gap: 3 }}>
          {(['3D Cardiac Model', '12-Lead EKG', 'Controls'] as const).map((t) => (
            <div
              key={t}
              style={{
                background: 'rgba(255,255,255,0.15)',
                border: '1px solid rgba(255,255,255,0.25)',
                borderRadius: 3,
                padding: '1px 8px',
                fontSize: 10,
                color: 'var(--xp-titlebar-text)',
                cursor: 'default',
              }}
            >
              {t}
            </div>
          ))}
        </div>

        {/* Tray */}
        <div className="xp-tray">
          <span style={{ fontSize: 10, opacity: 0.8 }}>{activePathologyId.toUpperCase()}</span>
          <div className="xp-statusbar-divider" />
          <Clock />
        </div>
      </div>
    </div>
  );
}
