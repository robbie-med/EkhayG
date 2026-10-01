/**
 * ControlPanel.tsx
 * Windows XP–styled vertical control panel.
 */

import { useState } from 'react';
import { useSimulationStore } from '../store/simulation-store';
import { CONDITION_PRESETS } from '../engine/pathology';
import { ELECTRODE_POSITIONS } from '../engine/lead-calculator';
import { updateSimulation } from '../engine/simulation-cache';
import { setDisabledSegments } from '../engine/cardiac-vector';
import { computeQRSAxis, axisInterpretation } from '../engine/axis-calculator';
import { buildDefaultSegments } from '../engine/heart-model';
import type { Vec3 } from '../engine/cardiac-vector';

const ARTERY_LABELS: Record<string, string> = {
  lad: 'LAD', d1: 'D1', lcx: 'LCx', om: 'OM', rca: 'RCA', pda: 'PDA',
};

// Build segment list once, grouped by chamber
const ALL_SEGMENTS = buildDefaultSegments();
const ALL_SEGMENT_IDS = ALL_SEGMENTS.map((s) => s.id);

const SEGMENT_GROUPS: { label: string; chamber: string; ids: string[] }[] = [
  { label: 'RA', chamber: 'ra', ids: ALL_SEGMENTS.filter((s) => s.chamber === 'ra').map((s) => s.id) },
  { label: 'LA', chamber: 'la', ids: ALL_SEGMENTS.filter((s) => s.chamber === 'la').map((s) => s.id) },
  { label: 'Septum', chamber: 'septum', ids: ALL_SEGMENTS.filter((s) => s.chamber === 'septum').map((s) => s.id) },
  { label: 'LV', chamber: 'lv', ids: ALL_SEGMENTS.filter((s) => s.chamber === 'lv').map((s) => s.id) },
  { label: 'RV', chamber: 'rv', ids: ALL_SEGMENTS.filter((s) => s.chamber === 'rv').map((s) => s.id) },
];

// Short display name: strip chamber prefix
function segLabel(id: string): string {
  return id.replace(/^(lv|rv|sept|ra|la)-/, '');
}

const CONDITION_GROUPS: { label: string; ids: string[] }[] = [
  { label: 'Conduction',  ids: ['lbbb', 'rbbb', 'wpw'] },
  { label: 'Hypertrophy', ids: ['lvh', 'rvh'] },
  { label: 'Atrial',      ids: ['lae', 'rae'] },
];

// ── Groupbox wrapper ─────────────────────────────────────────────────────────
function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="xp-groupbox">
      <div className="xp-groupbox-label">{title}</div>
      {children}
    </div>
  );
}

// ── Small toggle button row ──────────────────────────────────────────────────
function BtnRow<T extends string | number>({
  options, value, onChange, fmt,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  fmt?: (v: T) => string;
}) {
  return (
    <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
      {options.map((o) => (
        <button
          key={String(o)}
          onClick={() => onChange(o)}
          className={`xp-btn${value === o ? ' active' : ''}`}
        >
          {fmt ? fmt(o) : String(o)}
        </button>
      ))}
    </div>
  );
}

// ── Axis dial (SVG) ──────────────────────────────────────────────────────────
function AxisDial({ deg }: { deg: number }) {
  const rad = (deg - 90) * (Math.PI / 180); // -90 offset: 0° points right
  const cx = 30, cy = 30, r = 22;
  const nx = cx + r * Math.cos(rad);
  const ny = cy + r * Math.sin(rad);
  const interp = axisInterpretation(deg);
  const color = interp === 'Normal' ? '#00cc44' : interp.includes('Left') ? '#ffaa00' : '#ff4444';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <svg width={60} height={60} style={{ flexShrink: 0 }}>
        {/* Background */}
        <circle cx={cx} cy={cy} r={r + 2} fill="var(--xp-content)" stroke="var(--xp-btn-shadow)" strokeWidth={1} />
        {/* Reference lines */}
        <line x1={cx - r} y1={cy} x2={cx + r} y2={cy} stroke="var(--xp-btn-shadow)" strokeWidth={0.5} />
        <line x1={cx} y1={cy - r} x2={cx} y2={cy + r} stroke="var(--xp-btn-shadow)" strokeWidth={0.5} />
        {/* Normal range arc: -30° to +90° → in SVG angles (subtract 90): -120° to 0° */}
        <path
          d={describeArc(cx, cy, r - 3, -120, 0)}
          fill="none"
          stroke="#00cc44"
          strokeWidth={3}
          strokeLinecap="round"
          opacity={0.35}
        />
        {/* Axis needle */}
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={color} strokeWidth={2} strokeLinecap="round" />
        <circle cx={nx} cy={ny} r={2.5} fill={color} />
        <circle cx={cx} cy={cy} r={2} fill="var(--xp-text)" />
        {/* Labels */}
        <text x={cx + r + 2} y={cy + 4} fontSize={7} fill="var(--xp-text-muted)">0°</text>
        <text x={cx - 2} y={cy + r + 9} fontSize={7} fill="var(--xp-text-muted)">+90°</text>
      </svg>
      <div>
        <div style={{ fontSize: 16, fontWeight: 'bold', color, fontFamily: 'Tahoma, sans-serif' }}>
          {deg > 0 ? '+' : ''}{deg}°
        </div>
        <div style={{ fontSize: 9, color: 'var(--xp-text-muted)', lineHeight: 1.3 }}>{interp}</div>
      </div>
    </div>
  );
}

function polarToCart(cx: number, cy: number, r: number, angleDeg: number) {
  const a = (angleDeg - 90) * (Math.PI / 180);
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function describeArc(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const s = polarToCart(cx, cy, r, startDeg);
  const e = polarToCart(cx, cy, r, endDeg);
  const large = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
}

// ── Main component ───────────────────────────────────────────────────────────
export function ControlPanel() {
  const {
    heartRateBpm, setHeartRate,
    activeConditions, toggleCondition,
    playbackSpeed, setPlaybackSpeed,
    gain, setGain,
    paperSpeed, setPaperSpeed,
    arteries, toggleArtery,
    torsoOpacity, setTorsoOpacity,
    showStandardElectrodes, setShowStandardElectrodes,
    isPlacementMode, setIsPlacementMode,
    customElectrodePos, setCustomElectrodePos,
    showVectorArrow, setShowVectorArrow,
    showVCGLoop, setShowVCGLoop,
    theme, setTheme,
    disabledSegments, toggleSegment, enableAllSegments, disableAllSegments, soloSegment,
  } = useSimulationStore();

  const [segPanelOpen, setSegPanelOpen] = useState(false);

  // Sync disabled segments to engine
  setDisabledSegments(disabledSegments);

  // Ensure simulation is up to date and compute QRS axis
  updateSimulation({ heartRateBpm, activeConditions, arteries });
  const qrsAxisDeg = computeQRSAxis();

  return (
    <div className="xp-panel" style={{ display: 'flex', flexDirection: 'column', gap: 0, height: '100%', overflowY: 'auto', overflowX: 'hidden' }}>

      {/* Theme toggle */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
        <button
          className="xp-btn"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          style={{ fontSize: 10 }}
        >
          {theme === 'dark' ? '☀ Light Mode' : '🌙 Dark Mode'}
        </button>
      </div>

      {/* Heart Rate */}
      <Group title="Heart Rate">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          <span style={{ fontSize: 11, color: 'var(--xp-text-muted)' }}>BPM:</span>
          <span style={{ fontFamily: 'monospace', fontWeight: 'bold', fontSize: 13, color: 'var(--xp-text)' }}>{heartRateBpm}</span>
        </div>
        <input
          type="range" min={40} max={150} step={1}
          value={heartRateBpm}
          onChange={(e) => setHeartRate(Number(e.target.value))}
          style={{ width: '100%' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--xp-text-muted)' }}>
          <span>40</span><span>150</span>
        </div>
      </Group>

      {/* QRS Axis */}
      <Group title="QRS Axis">
        <AxisDial deg={qrsAxisDeg} />
      </Group>

      {/* Conditions */}
      <Group title="Conditions">
        {CONDITION_GROUPS.map((g) => (
          <div key={g.label} style={{ marginBottom: 6 }}>
            <div style={{ fontSize: 9, color: 'var(--xp-text-muted)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{g.label}</div>
            <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
              {g.ids.map((id) => {
                const preset = CONDITION_PRESETS[id];
                if (!preset) return null;
                const on = activeConditions.includes(id);
                return (
                  <button
                    key={id}
                    onClick={() => toggleCondition(id)}
                    className={`xp-btn${on ? ' active' : ''}`}
                    title={preset.description}
                    style={on ? { borderLeft: `3px solid ${preset.vectorColor}` } : {}}
                  >
                    {preset.name}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {activeConditions.length === 0 && (
          <div style={{ fontSize: 9, color: 'var(--xp-text-muted)' }}>Normal sinus rhythm</div>
        )}
      </Group>

      {/* Gain + Paper Speed */}
      <Group title="EKG Settings">
        <div style={{ fontSize: 10, color: 'var(--xp-text-muted)', marginBottom: 2 }}>Gain (mm/mV)</div>
        <BtnRow options={[5, 10, 20] as const} value={gain} onChange={setGain} fmt={(v) => `${v}`} />
        <div style={{ fontSize: 10, color: 'var(--xp-text-muted)', margin: '5px 0 2px' }}>Paper Speed (mm/s)</div>
        <BtnRow options={[25, 50] as const} value={paperSpeed} onChange={setPaperSpeed} fmt={(v) => `${v}`} />
        <div style={{ fontSize: 10, color: 'var(--xp-text-muted)', margin: '5px 0 2px' }}>Playback Speed</div>
        <BtnRow options={[0.25, 0.5, 1, 2] as const} value={playbackSpeed} onChange={setPlaybackSpeed} fmt={(v) => `${v}×`} />
      </Group>

      {/* Coronary Arteries */}
      <Group title="Coronary Arteries">
        <div style={{ display: 'flex', gap: 4, marginBottom: 4, flexWrap: 'wrap' }}>
          {(['lad', 'd1', 'lcx', 'om', 'rca', 'pda'] as const).map((key) => (
            <button
              key={key}
              onClick={() => toggleArtery(key)}
              title={arteries[key] ? 'Patent — click to occlude' : 'Occluded — click to open'}
              className={`xp-btn${arteries[key] ? '' : ' active'}`}
              style={!arteries[key] ? { background: '#881111', borderColor: '#550000', textDecoration: 'line-through' } : {}}
            >
              {ARTERY_LABELS[key]}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 9, color: 'var(--xp-text-muted)' }}>Occlude → ST changes on EKG</div>
      </Group>

      {/* 3D View */}
      <Group title="3D View">
        <div style={{ fontSize: 10, color: 'var(--xp-text-muted)', marginBottom: 4 }}>Torso opacity: {Math.round(torsoOpacity * 100)}%</div>
        <input
          type="range" min={0} max={0.9} step={0.05}
          value={torsoOpacity}
          onChange={(e) => setTorsoOpacity(Number(e.target.value))}
          style={{ width: '100%', marginBottom: 6 }}
        />
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <button
            className={`xp-btn${showVectorArrow ? ' active' : ''}`}
            onClick={() => setShowVectorArrow(!showVectorArrow)}
          >
            Vector Arrow
          </button>
          <button
            className={`xp-btn${showVCGLoop ? ' active' : ''}`}
            onClick={() => setShowVCGLoop(!showVCGLoop)}
          >
            VCG Loop
          </button>
        </div>
      </Group>

      {/* Electrodes */}
      <Group title="Electrodes">
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 4 }}>
          <button
            className={`xp-btn${showStandardElectrodes ? ' active' : ''}`}
            onClick={() => setShowStandardElectrodes(!showStandardElectrodes)}
          >
            Show 12-Lead
          </button>
          <button
            className={`xp-btn${isPlacementMode ? ' active' : ''}`}
            onClick={() => setIsPlacementMode(!isPlacementMode)}
            style={isPlacementMode ? { animation: 'none', background: '#cc6600', borderColor: '#884400' } : {}}
          >
            {isPlacementMode ? 'Click torso...' : 'Place Custom'}
          </button>
          {customElectrodePos && (
            <button className="xp-btn" onClick={() => setCustomElectrodePos(null)}>Clear</button>
          )}
        </div>
        {/* Precordial snap buttons */}
        <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', marginBottom: 4 }}>
          {(['V1','V2','V3','V4','V5','V6'] as const).map((v) => (
            <button
              key={v}
              className="xp-btn"
              style={{ padding: '1px 5px', fontSize: 10 }}
              onClick={() => {
                setCustomElectrodePos(ELECTRODE_POSITIONS[v] as Vec3);
                setIsPlacementMode(false);
              }}
            >
              {v}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 9, color: 'var(--xp-text-muted)' }}>
          {customElectrodePos
            ? `Custom: (${customElectrodePos.map((v) => v.toFixed(2)).join(', ')})`
            : 'Place custom electrode on torso'}
        </div>
      </Group>

      {/* Segment Debug Toggles */}
      <Group title="Segments">
        <div style={{ display: 'flex', gap: 3, marginBottom: 4, flexWrap: 'wrap' }}>
          <button className="xp-btn" onClick={() => setSegPanelOpen(!segPanelOpen)} style={{ fontSize: 10 }}>
            {segPanelOpen ? 'Hide' : 'Show'} ({ALL_SEGMENT_IDS.length - disabledSegments.length}/{ALL_SEGMENT_IDS.length} on)
          </button>
          {disabledSegments.length > 0 && (
            <button className="xp-btn" onClick={enableAllSegments} style={{ fontSize: 10 }}>All On</button>
          )}
          {disabledSegments.length < ALL_SEGMENT_IDS.length && (
            <button className="xp-btn" onClick={() => disableAllSegments(ALL_SEGMENT_IDS)} style={{ fontSize: 10 }}>All Off</button>
          )}
        </div>
        {segPanelOpen && SEGMENT_GROUPS.map((g) => (
          <div key={g.chamber} style={{ marginBottom: 5 }}>
            <div style={{ fontSize: 9, color: 'var(--xp-text-muted)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {g.label} ({g.ids.filter((id) => !disabledSegments.includes(id)).length}/{g.ids.length})
            </div>
            <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              {g.ids.map((id) => {
                const on = !disabledSegments.includes(id);
                return (
                  <button
                    key={id}
                    onClick={() => toggleSegment(id)}
                    onContextMenu={(e) => { e.preventDefault(); soloSegment(id, ALL_SEGMENT_IDS); }}
                    className={`xp-btn${on ? ' active' : ''}`}
                    title={`${id}${on ? ' (ON)' : ' (OFF)'} — right-click to solo`}
                    style={{
                      padding: '1px 4px',
                      fontSize: 9,
                      opacity: on ? 1 : 0.4,
                      minWidth: 0,
                    }}
                  >
                    {segLabel(id)}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </Group>

    </div>
  );
}
