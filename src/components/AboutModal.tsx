/**
 * AboutModal.tsx
 * Educational walkthrough: how the simulator models cardiac vectors and pathology.
 * Styled as a Windows XP dialog window.
 */

import { useState } from 'react';

interface Props {
  onClose: () => void;
}

// ── Code block ────────────────────────────────────────────────────────────────
function Code({ children }: { children: string }) {
  return (
    <pre style={{
      background: 'var(--xp-content)',
      border: '1px solid var(--xp-btn-shadow)',
      borderRadius: 3,
      padding: '8px 10px',
      fontSize: 11,
      fontFamily: 'Consolas, "Courier New", monospace',
      overflowX: 'auto',
      color: 'var(--xp-text)',
      margin: '6px 0',
      lineHeight: 1.6,
    }}>
      {children.trim()}
    </pre>
  );
}

function Highlight({ children }: { children: string }) {
  return (
    <span style={{ color: 'var(--xp-text-label)', fontWeight: 'bold', fontFamily: 'Consolas, monospace' }}>
      {children}
    </span>
  );
}

function H2({ children }: { children: string }) {
  return (
    <h2 style={{
      fontSize: 13,
      fontWeight: 'bold',
      color: 'var(--xp-text-label)',
      borderBottom: '1px solid var(--xp-btn-shadow)',
      paddingBottom: 4,
      marginTop: 20,
      marginBottom: 8,
    }}>
      {children}
    </h2>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 12, lineHeight: 1.7, marginBottom: 8, color: 'var(--xp-text)' }}>{children}</p>;
}

// ── Tab system ────────────────────────────────────────────────────────────────
const TABS = ['Dipole Model', 'Lead Calculation', 'Pathology Engine', 'Coordinate System', 'Axis & VCG'] as const;
type Tab = typeof TABS[number];

function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  return (
    <div style={{
      display: 'flex',
      gap: 2,
      borderBottom: '2px solid var(--xp-btn-shadow)',
      marginBottom: 12,
      paddingBottom: 0,
    }}>
      {TABS.map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          style={{
            padding: '4px 10px',
            fontSize: 11,
            fontFamily: 'Tahoma, sans-serif',
            cursor: 'pointer',
            border: '1px solid var(--xp-btn-shadow)',
            borderBottom: active === t ? '2px solid var(--xp-content)' : '1px solid var(--xp-btn-shadow)',
            borderRadius: '3px 3px 0 0',
            background: active === t ? 'var(--xp-content)' : 'var(--xp-panel)',
            color: active === t ? 'var(--xp-text-label)' : 'var(--xp-text-muted)',
            fontWeight: active === t ? 'bold' : 'normal',
            marginBottom: active === t ? -2 : 0,
            position: 'relative',
            zIndex: active === t ? 1 : 0,
          }}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

// ── Tab content ───────────────────────────────────────────────────────────────
function DipoleTab() {
  return (
    <div>
      <H2>The Cardiac Dipole Model</H2>
      <P>
        Every cell in the heart generates a tiny electrical dipole as it depolarizes.
        The simulator treats the <em>entire heart</em> as a single time-varying 3D dipole —
        the <strong>vectorcardiographic (VCG) model</strong> first described by Ernest Frank (1956).
      </P>
      <P>
        At any instant <Highlight>t</Highlight>, the cardiac vector is:
      </P>
      <Code>{`V(t) = [ Vx(t), Vy(t), Vz(t) ]   (units: millivolts)`}</Code>
      <P>
        This vector traces a closed 3D loop over one cardiac cycle. The loop has three
        distinct sections corresponding to the P wave, QRS complex, and T wave.
      </P>

      <H2>Piecewise Cubic Bézier Curves</H2>
      <P>
        Each section of the loop is modeled as a chain of cubic Bézier segments.
        Each segment is defined by four 3D control points and is evaluated as:
      </P>
      <Code>{`// cardiac-vector.ts — evaluateBezier()
V(t) = (1-t)³·p0 + 3(1-t)²t·p1 + 3(1-t)t²·p2 + t³·p3

// For example, the main QRS free-wall segment (Phase 2a):
{
  p0: [ 0.00,  0.00,  0.00],   // starts at origin (QRS onset)
  p1: [-0.03,  0.01,  0.06],   // septal direction: rightward, anterior
  p2: [-0.07,  0.02,  0.10],
  p3: [-0.10,  0.03,  0.12],   // initial rightward peak (q wave)
}
{
  p0: [-0.10,  0.03,  0.12],
  p1: [ 0.15,  0.20,  0.10],   // curve leftward (LV dominates)
  p2: [ 0.60,  0.50,  0.00],
  p3: [ 1.00,  0.70, -0.15],   // QRS peak: leftward, inferior, slightly posterior
}`}</Code>
      <P>
        A <strong>smoothstep</strong> easing function is applied to the normalized
        phase time so that the vector accelerates smoothly into and out of each wave,
        avoiding artificial sharp corners in the waveform.
      </P>

      <H2>The ST Segment</H2>
      <P>
        During the ST segment the cardiac vector is normally at the origin (isoelectric).
        In ischemia, injured myocytes maintain a <em>DC injury current</em> that shifts
        the baseline — modeled as an additive <Highlight>stVector</Highlight> applied
        during the ST segment, ramped in/out with smoothstep to avoid a square-wave artifact.
      </P>
    </div>
  );
}

function LeadTab() {
  return (
    <div>
      <H2>From 3D Vector to Lead Voltage</H2>
      <P>
        A lead measures the <strong>projection</strong> of the cardiac vector onto the
        lead's spatial axis. This is a simple dot product:
      </P>
      <Code>{`// lead-calculator.ts — computeLeadVoltage()
V_lead(t) = dot( V(t), L̂ )
           = Vx·Lx + Vy·Ly + Vz·Lz

where L̂ is the unit vector from the negative to positive electrode.`}</Code>
      <P>
        Because <em>all 12 leads share the same V(t)</em>, they are perfectly
        synchronized and physically consistent — Einthoven's law holds exactly:
      </P>
      <Code>{`Lead III = Lead II − Lead I      (always, by construction)`}</Code>

      <H2>Standard Electrode Positions (Frank coords)</H2>
      <Code>{`// Limb electrodes (on torso surface)
RA: [-0.50, -0.30, 0.00]   // Right Arm: rightward, superior
LA: [ 0.50, -0.30, 0.00]   // Left Arm:  leftward, superior
LL: [ 0.10,  0.70, 0.00]   // Left Leg:  inferior

// Precordial V1-V6 (anterior chest)
V1: [-0.35,  0.10, 0.50]   V4: [ 0.25,  0.30, 0.55]
V2: [-0.15,  0.15, 0.55]   V5: [ 0.45,  0.30, 0.45]
V3: [ 0.05,  0.22, 0.60]   V6: [ 0.60,  0.30, 0.25]`}</Code>

      <H2>Limb Lead Vectors</H2>
      <Code>{`I   = LA − RA         (left − right arm)
II  = LL − RA         (left leg − right arm)
III = LL − LA         (left leg − left arm)

// Augmented leads (Goldberger):
aVR = RA − (LA + LL)/2
aVL = LA − (RA + LL)/2
aVF = LL − (RA + LA)/2`}</Code>

      <H2>Precordial Lead Vectors</H2>
      <Code>{`// Wilson's Central Terminal (WCT) = mean of limb electrodes
WCT = (RA + LA + LL) / 3

// Unipolar precordial lead:
Vn = electrode_position − WCT

// Custom electrode (place-anywhere feature):
V_custom = custom_position − WCT`}</Code>
    </div>
  );
}

function PathologyTab() {
  return (
    <div>
      <H2>How Pathology Modifies the Vector Loop</H2>
      <P>
        The simulator never stores pre-recorded waveforms. Instead, each pathology
        directly modifies the parameters of the 3D cardiac dipole. All 12 leads update
        simultaneously because they all derive from the same modified vector.
      </P>

      <H2>Artery Occlusion → ST Injury Vector</H2>
      <P>
        Ischemic myocytes sustain a persistent depolarization (injury current).
        This is modeled as an additive vector during the ST segment,
        pointing <em>toward</em> the ischemic zone:
      </P>
      <Code>{`// pathology.ts — ARTERY_ST_VECTORS
LAD occlusion: stVector = [ 0.25, -0.10,  0.50]
  → Anterior (Z+), slightly superior (Y-), leftward (X+)
  → Produces STE in V1–V4, reciprocal STD in II/III/aVF

RCA occlusion: stVector = [-0.05,  0.50,  0.10]
  → Inferior (Y+) dominant
  → Produces STE in II, III, aVF; reciprocal STD in I/aVL

LCx occlusion: stVector = [ 0.40,  0.10, -0.20]
  → Lateral (X+) and slightly posterior (Z-)
  → Produces STE in I, aVL, V5–V6

// Multiple arteries occluded: vectors are summed
combined_st = preset.stVector + Σ(occluded artery vectors)`}</Code>

      <H2>Bundle Branch Block → New QRS Loop Shape</H2>
      <P>
        In BBB, the normal conduction sequence is disrupted. The entire QRS loop
        is replaced with a new Bézier path reflecting the altered depolarization wavefront:
      </P>
      <Code>{`// LBBB: LBB blocked → septum depolarizes right→left (reversed)
//   No initial rightward deflection (no septal Q in I/V6)
//   Broad, slurred R in I, aVL, V5-V6
//   Terminal forces superior → LEFT AXIS DEVIATION
//   Mean axis: ~ −50°

// RBBB: RBB blocked → LV depolarizes normally, then RV late
//   Normal initial QRS (septal Q preserved)
//   Terminal forces rightward + anterior → RSR' in V1
//   Axis: usually normal`}</Code>

      <H2>Hypertrophy → Amplified + Redirected Loop</H2>
      <Code>{`// LVH: massive LV → high-amplitude leftward forces
//   Dominant main vector: leftward (X+ up to 1.7 mV)
//   Terminal forces turn SUPERIOR (left axis deviation ~−35°)
//   Produces tall R in V5-V6, deep S in V1-V2 (Sokolow-Lyon)
//   Lateral ST strain (negative stVector in lateral leads)

// RVH: RV dominates over LV
//   Main vector: RIGHTWARD (X− up to −1.1 mV) + anterior
//   Mean axis: ~+120° (right axis deviation)
//   Produces tall R in V1, deep S in V5-V6, right axis`}</Code>

      <H2>getCombinedPathology()</H2>
      <P>
        At every render frame, this function merges the conduction preset with any
        occluded arteries into a single parameter set:
      </P>
      <Code>{`function getCombinedPathology(conductionId, arteries) {
  const preset = CONDUCTION_PRESETS[conductionId];

  // Start with preset's secondary ST vector (e.g. LBBB discordance)
  const st = [...preset.stVector];

  // Additively layer each occluded artery's injury vector
  for (const [artery, patent] of Object.entries(arteries)) {
    if (!patent) {
      st[0] += ARTERY_ST_VECTORS[artery][0];
      st[1] += ARTERY_ST_VECTORS[artery][1];
      st[2] += ARTERY_ST_VECTORS[artery][2];
    }
  }

  return {
    qrsSegments: preset.qrsSegments,   // loop shape
    stVector: st,                       // injury current
    timingOverrides: preset.timingOverrides,  // PR, QRS duration
  };
}`}</Code>
    </div>
  );
}

function CoordTab() {
  return (
    <div>
      <H2>Frank Lead System (Cardiac Vector Coordinates)</H2>
      <P>
        All cardiac vector values in this simulator use the <strong>Frank lead system</strong>,
        the standard VCG convention. Axes are defined relative to the patient:
      </P>
      <Code>{`Frank coordinate system:
  X+  =  leftward    (patient's left)
  X−  =  rightward   (patient's right)
  Y+  =  inferior    (toward feet)
  Y−  =  superior    (toward head)
  Z+  =  anterior    (toward chest / viewer)
  Z−  =  posterior   (toward back)`}</Code>

      <H2>Three.js Scene Coordinates</H2>
      <P>
        Three.js uses a different convention (right-handed, Y-up). The simulator
        converts Frank → scene coordinates before rendering:
      </P>
      <Code>{`// coordinates.ts — vectorToScene()
scene_X =  frank_X   // leftward stays leftward (viewer sees patient from front)
scene_Y = −frank_Y   // flip: Frank inferior→ scene downward (Three.js Y+ = up)
scene_Z =  frank_Z   // anterior stays toward viewer`}</Code>
      <P>
        This means the 3D heart model and VCG loop are both viewed from the front
        (anterior), exactly as in standard clinical imaging.
      </P>

      <H2>Normal QRS Vector Direction</H2>
      <Code>{`At QRS peak (main free-wall phase):
  Vx ≈ +1.0  →  leftward (LV dominates)
  Vy ≈ +0.7  →  inferior (LV apex points infero-laterally)
  Vz ≈ −0.15 →  slightly posterior

  Lead I voltage  = dot(V, [1,0,0]) ≈ +1.0  → tall R  ✓
  aVF voltage     = dot(V, [0,1,0]) ≈ +0.7  → tall R  ✓
  aVR voltage     = dot(V, [−½,−½,0]) ≈ −0.85 → deep QS ✓
  V1 voltage      ≈ small (posterior component cancels anterior)
  V5 voltage      ≈ large positive (leftward + slight anterior)`}</Code>
    </div>
  );
}

function AxisTab() {
  return (
    <div>
      <H2>Mean QRS Axis Calculation</H2>
      <P>
        The frontal plane axis is the direction of the <em>mean QRS vector</em>
        — the time-averaged cardiac dipole during the QRS complex.
        The simulator computes it by integrating the Frank X and Y components
        numerically over the QRS interval:
      </P>
      <Code>{`// axis-calculator.ts — computeQRSAxis()
const N = 120;   // integration samples
let sumX = 0, sumY = 0;

for (let i = 0; i < N; i++) {
  const t = qrsStart + (i / (N-1)) * qrsDuration;
  const { vector } = getCardiacVector(t, timings, [0,0,0], qrsSegments);
  sumX += vector[0];   // Frank X: leftward component (= Lead I direction)
  sumY += vector[1];   // Frank Y: inferior component (= aVF direction)
}

const axisDeg = atan2(sumY, sumX) × (180/π);`}</Code>

      <H2>Normal Ranges</H2>
      <Code>{`Normal:                −30° to  +90°
Left axis deviation:   −30° to  −90°   (LBBB, LVH, inferior MI)
Right axis deviation:  +90° to +180°   (RVH, RBBB, lateral MI)
Extreme axis:         −90° to +180°   (rare, ventricular rhythms)`}</Code>

      <H2>Expected Axes by Condition</H2>
      <Code>{`Normal sinus rhythm:    ~+45°  (leftward + inferior)
LBBB:                  ~−50°  (left axis — terminal superior forces)
RBBB:                  ~+40°  (normal axis — LV dominates until late)
LVH:                   ~−35°  (mild left axis — high-amp + superior terminal)
RVH:                   ~+120° (right axis — RV dominates, rightward mean)
WPW (Type A):          ~+55°  (near-normal — pathway slightly alters initial)`}</Code>

      <H2>VCG Loop Visualization</H2>
      <P>
        The VCG loop displayed inside the heart shows the full 3D path of V(t)
        over one cardiac cycle, colored by phase:
      </P>
      <Code>{`Orange  →  P wave  (small atrial loop, leftward + inferior)
Green   →  QRS complex  (large loop defining the frontal axis)
Cyan    →  T wave  (roughly concordant with QRS in normals)
(dim)   →  Isoelectric segments (PR, ST, TP)`}</Code>
      <P>
        The yellow arrow shows the <em>instantaneous</em> cardiac vector — watch it
        sweep through the QRS loop during each heartbeat. The long axis of the green
        loop corresponds to the electrical axis shown on the dial.
      </P>
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────
export function AboutModal({ onClose }: Props) {
  const [tab, setTab] = useState<Tab>('Dipole Model');

  const content: Record<Tab, React.ReactNode> = {
    'Dipole Model':       <DipoleTab />,
    'Lead Calculation':   <LeadTab />,
    'Pathology Engine':   <PathologyTab />,
    'Coordinate System':  <CoordTab />,
    'Axis & VCG':         <AxisTab />,
  };

  return (
    /* Backdrop */
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.55)',
        zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {/* Dialog window */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="xp-window"
        style={{ width: 720, maxWidth: '95vw', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}
      >
        {/* Titlebar */}
        <div className="xp-titlebar">
          <span className="xp-titlebar-icon">📖</span>
          <span className="xp-titlebar-title">
            About EKG Simulator — How the Physics Engine Works
          </span>
          <div className="xp-chrome-buttons">
            <div className="xp-chrome-btn xp-chrome-btn-min">_</div>
            <div className="xp-chrome-btn xp-chrome-btn-max">□</div>
            <div className="xp-chrome-btn xp-chrome-btn-close" onClick={onClose} style={{ cursor: 'pointer' }}>✕</div>
          </div>
        </div>

        {/* Content */}
        <div className="xp-body" style={{ padding: '12px 16px', overflowY: 'auto', flex: 1 }}>
          <TabBar active={tab} onChange={setTab} />
          {content[tab]}
        </div>

        {/* Footer */}
        <div className="xp-statusbar" style={{ justifyContent: 'space-between' }}>
          <span>Physically modeled · All leads derived from one 3D cardiac dipole vector</span>
          <button className="xp-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
