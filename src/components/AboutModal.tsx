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
      <H2>Myocardial Wall Elements</H2>
      <P>
        The heart is modelled as ~30 wall elements: the left ventricle as a truncated
        ellipsoid divided into the AHA 17-segment sectors, a right ventricular free wall,
        and six atrial patches. Each element has an anatomical mass, wall thickness,
        conduction velocity and action-potential durations at its two faces. Nothing is
        drawn: every lead is the projection of the summed element dipoles.
      </P>

      <H2>The 1-D Cable Identity (Uniform Double Layer)</H2>
      <P>
        An activation front is a dipole layer whose dipole points in the direction of
        propagation. For a ventricular wall element the front enters at the endocardium
        and exits at the epicardium, so the dipole lies along the <em>outward wall normal</em>,
        which is computed from the chamber geometry. For a slab of cross-section A the
        far-field dipole is exactly:
      </P>
      <Code>{`p(t) = GAIN · A · [ Vm(entry, t) − Vm(exit, t) ] · n̂

A        = mass / (density · path length)      front cross-section
Vm(entry) = action potential started when the Purkinje wave arrives
Vm(exit)  = action potential started one transmural crossing later
            (10 mm at 0.33 m/s ≈ 21 ms), with a shorter APD`}</Code>
      <P>
        This single expression produces the whole beat: the <strong>QRS</strong> while the
        entry face is depolarised and the exit face is not; an <strong>isoelectric ST</strong>
        while both faces sit at the plateau; and the <strong>T wave</strong> when the
        epicardial face repolarises first because its action potential is ~45 ms shorter
        than the endocardial one — more than the crossing delay, so the T wave is
        concordant with the QRS for a physical reason, not by a sign convention.
      </P>

      <H2>Action Potential</H2>
      <Code>{`Vm(τ) = up(τ) · [1 − down(τ − APD)] · decline(τ)

up      = logistic(τ / 3 ms)          phase 0 (activation dispersion across a face)
down    = logistic((τ − APD) / 10 ms)  phase 3
decline = 1 − 0.2 · τ / 300 ms         phase 2 slope
APD(RR) = APD₈₀₀ · (RR / 800 ms)^0.5   rate adaptation (Bazett-type)`}</Code>

      <H2>The Septum</H2>
      <P>
        Septal elements are full-thickness cables fed from both sides: the left bundle
        activates the LV face, the right bundle the RV face ~8 ms later. Their dipole
        A·(Vm_LV − Vm_RV) is rightward only during that short window — the normal septal
        q wave in I, aVL, V5–V6 and the r wave in V1 — and vanishes once both faces are
        depolarised. The basal septum is reached from the RV side first, producing the
        terminal leftward-posterior forces.
      </P>

      <H2>Activation Sequence</H2>
      <P>
        Activation times come from a shortest-path solve over a conduction graph —
        SA node → atria → AV node → His → bundle branches → fascicles → Purkinje → endocardium
        — with Purkinje breakthrough times taken from Durrer's 1970 isolated-heart maps.
        Neighbouring wall elements are also joined by slow cell-to-cell edges generated
        from their geometry, which take over when a bundle branch is blocked.
      </P>

      <H2>Injury Current</H2>
      <P>
        Acutely ischaemic tissue has an elevated resting potential and a lower, shorter
        plateau. The potential difference against healthy tissue drives current across
        the border of the ischaemic zone; for a transmural zone of area S on a wall of
        thickness h and curvature radius R the dipole is (2h/R)·S·ΔVm along the outward
        normal (the solid-angle theory of ST shifts). It points away from the zone in
        diastole (TQ depression) and toward it during the plateau (ST elevation); both
        appear as ST elevation once the trace is referenced to the TP baseline, exactly
        as an AC-coupled electrocardiograph does.
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

      <H2>Standard Electrode Positions (cm from the heart centre)</H2>
      <Code>{`// Torso half-width 16 cm, half-depth 11 cm; ventricular mass centre
// 1.5 cm left of midline, 2.5 cm anterior of the mid-coronal plane.
V1: [ -4.0, -3.0,  8.4]   V4: [  8.0,  0.0,  6.4]
V2: [  1.0, -3.0,  8.4]   V5: [ 11.5,  0.0,  3.9]
V3: [  4.5, -1.5,  7.7]   V6: [ 14.5,  0.0, -2.5]   // mid-axillary: slightly posterior

// Precordial lead vector = unit(electrode − heart centre), scaled by
// the proximity factor d(V4)/d(Vn).`}</Code>

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
      <H2>How Pathology Changes the Tracing</H2>
      <P>
        The simulator never stores waveforms. Every condition is a change to tissue
        properties or to the conduction graph, and the 12 leads follow from the physics.
      </P>

      <H2>Artery Occlusion → Ischaemia</H2>
      <Code>{`occluded territory elements:
  ischemia = 1      → resting potential +20 mV, plateau −15 %, APD × 0.85,
                      slower upstroke; injury dipole along the wall normal
  health   = 0.8    → reduced excitable mass

LAD  anterior wall, anterior 2/3 septum, apex   → STE V1–V4, reciprocal II/III/aVF
RCA  RV free wall, inferior wall, inferior septum → STE III > II, aVF; STD I, aVL; STE V1
LCx  lateral / inferolateral walls              → STE I, aVL, V5–V6; STD V1–V2`}</Code>

      <H2>Bundle Branch Block</H2>
      <Code>{`LBBB: edge his → lbb blocked.  The LV is reached across the septum from the
      RV side (RV face first → reversed septal vector, no septal q), then by
      cell-to-cell spread ring by ring.  QRS ≈ 150 ms, discordant ST–T.
RBBB: edge his → rbb blocked.  LV activates normally; the RV and the RV face
      of the septum are reached late across the wall → terminal rightward
      anterior forces: R' in V1, wide S in I and V6.`}</Code>

      <H2>Pre-excitation (WPW)</H2>
      <Code>{`Accessory pathway from the LA posterior wall to the epicardial side of the
basal lateral LV (≈ 45 ms after the atrium is reached).  The pre-excited wall
depolarises epicardium → endocardium and spreads tangentially toward the
septum: short PR, delta wave positive in V1 and negative in I/aVL (type A),
fusion with the His-Purkinje wavefront.`}</Code>

      <H2>Hypertrophy</H2>
      <Code>{`LVH: LV wall 10 → 15 mm, mass +60 %.  Longer transmural crossing →
     larger summed voltage; sub-epicardial APD prolonged beyond the
     endocardial APD → repolarisation reversed → lateral strain T inversion.
RVH: RV wall 4 → 10 mm, mass ×3 → rightward/anterior forces no longer
     cancelled: tall R in V1, rightward axis shift.`}</Code>

      <H2>Atrial Enlargement</H2>
      <Code>{`LAE: LA path length ×1.5, slower interatrial conduction → broad,
     notched P with a late terminal negative P in V1.
RAE: RA front area ×1.8 → tall, peaked P in II (P pulmonale).`}</Code>
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

      <H2>Axes Produced by the Model</H2>
      <Code>{`Normal sinus rhythm:   ~+15°  (horizontal-intermediate heart)
LBBB:                  ~−10°  (terminal superior forces)
RBBB:                  ~+70°
LVH:                   ~+15°  with lateral strain
RVH:                   ~+25°  (modest rightward shift; tall R in V1)
WPW (left lateral):    ~+25°`}</Code>

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
