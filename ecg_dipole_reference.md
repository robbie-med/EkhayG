# ECG Dipole Model — Segment Reference Data
# For use in browser-based 12-lead ECG simulator (dipole summation approach)
#
# INSTRUCTIONS FOR CLAUDE CODE:
# - Do NOT use ionic ODE models (ORd, Courtemanche, etc.)
# - Use dipole summation ONLY
# - Activation function MUST be sigmoid (tau = 3-5 ms), NOT a step function
# - All values below are ground truth — do not web search, do not estimate
#
# PRIMARY SOURCES:
#   Durrer D et al. "Total Excitation of the Isolated Human Heart." Circulation. 1970;41:899-912.
#   Simelius K et al. Cardiac activation sequence. Physiol Meas. 2001.
#   Keller DU et al. Ranking the influence of tissue conductivities on ECG. IEEE TBME. 2010.
#   Streeter DD. Gross morphology and fiber geometry. In: Handbook of Physiology. 1979.
#   Antzelevitch C. Heterogeneity and cardiac arrhythmias. Heart Rhythm. 2007. (APD gradients)
#   Malmivuo J & Plonsey R. Bioelectromagnetism. Oxford, 1995. (lead vectors)

---

## COORDINATE SYSTEM

Origin: Center of the heart (approximately AV junction)
+X: Patient's LEFT (toward left arm electrode)
+Y: Patient's INFERIOR (toward feet / lead aVF)
+Z: Patient's ANTERIOR (toward chest / precordial leads)

All positions in centimeters (cm) from origin.
All fiber directions are unit vectors in [X, Y, Z].
Dipole moment = mass x fiber_direction (scaled by activation wavefront strength).

---

## TORSO ELECTRODE POSITIONS (standard 10-electrode placement)

Used to compute lead field vectors (dot product with dipole gives lead voltage).

| Electrode | X (cm) | Y (cm) | Z (cm) | Notes                            |
|-----------|--------|--------|--------|----------------------------------|
| RA        | -15.0  | -12.0  |  -3.0  | Right arm (Einthoven triangle)   |
| LA        | +15.0  | -12.0  |  -3.0  | Left arm                         |
| LL        |  +6.0  | +20.0  |  -3.0  | Left leg                         |
| V1        |  -3.5  |  -2.0  | +12.0  | 4th ICS, right sternal border    |
| V2        |  +1.0  |  -2.0  | +13.0  | 4th ICS, left sternal border     |
| V3        |  +4.0  |  +0.5  | +13.0  | Between V2 and V4                |
| V4        |  +7.0  |  +2.0  | +12.0  | 5th ICS, midclavicular line      |
| V5        | +10.0  |  +2.0  | +10.0  | 5th ICS, anterior axillary line  |
| V6        | +12.0  |  +2.0  |  +7.0  | 5th ICS, midaxillary line        |

---

## LEAD VECTORS (unit vectors; dot with dipole moment gives lead voltage in mV/g)

Derived from electrode positions per Einthoven + Wilson central terminal.

Limb leads (frontal plane only; Z component = 0):

| Lead  | X      | Y      | Z      | Formula                     |
|-------|--------|--------|--------|-----------------------------|
| I     | +1.000 |  0.000 |  0.000 | LA - RA                     |
| II    | +0.500 | +0.866 |  0.000 | LL - RA                     |
| III   | -0.500 | +0.866 |  0.000 | LL - LA                     |
| aVR   | -0.866 | -0.500 |  0.000 | -(I + II)/2                 |
| aVL   | +0.866 | -0.500 |  0.000 | I - II/2                    |
| aVF   |  0.000 | +1.000 |  0.000 | II - I/2                    |

Precordial lead vectors (computed from electrode-to-heart vectors, normalized):

| Lead  | X      | Y      | Z      |
|-------|--------|--------|--------|
| V1    | -0.270 | -0.150 | +0.950 |
| V2    | +0.075 | -0.150 | +0.985 |
| V3    | +0.290 | +0.035 | +0.957 |
| V4    | +0.500 | +0.145 | +0.854 |
| V5    | +0.690 | +0.145 | +0.710 |
| V6    | +0.850 | +0.145 | +0.510 |

---

## VENTRICULAR SEGMENTS (30 segments)
## Based on Durrer 1970 activation map + AHA 17-segment model geometry

Segment naming convention: Region_Wall_Level
  Walls: Endo = endocardium, Mid = midmyocardium, Epi = epicardium
  Levels: Base, Mid, Apex
  Regions: Sep = Septal, Ant = Anterior, Lat = Lateral, Inf = Inferior, Post = Posterior

Column definitions:
  act_ms   : activation onset (ms); t=0 = start of QRS
  APD_ms   : action potential duration (ms); repol_ms = act_ms + APD_ms
  mass_g   : segment mass in grams (LV total ~150g, RV total ~50g)
  pos_x/y/z: centroid position (cm) in torso coordinate system
  fib_x/y/z: mean transmural fiber direction, unit vector (Streeter 1979)
             Fiber angle rotates +60deg (endo) to -60deg (epi) relative to circumferential.
             Values below are mean transmural fiber direction per segment.

---

### LEFT VENTRICLE - SEPTAL WALL (earliest activation; Durrer endocardial breakthrough)

seg_id  name              act_ms  APD_ms  mass_g  pos_x  pos_y  pos_z  fib_x   fib_y   fib_z
1       Sep_Endo_Mid       5      320     8.0    -1.5   +1.0   +2.0   +0.500  +0.500  +0.707
2       Sep_Mid_Mid        15     345     7.0    -1.5   +1.0   +2.0   +0.500  +0.500  +0.707
3       Sep_Epi_Mid        30     285     6.0    -1.5   +1.0   +2.0   +0.700  +0.300  +0.648
4       Sep_Endo_Base      18     310     7.0    -1.0   -2.0   +1.5   +0.500  +0.500  +0.707
5       Sep_Endo_Apex      10     305     4.0    -0.5   +4.0   +1.0   +0.400  +0.600  +0.693

### LEFT VENTRICLE - ANTERIOR WALL

seg_id  name              act_ms  APD_ms  mass_g  pos_x  pos_y  pos_z  fib_x   fib_y   fib_z
6       Ant_Endo_Base      20     315     9.0    +2.0   -2.5   +4.0   +0.800  -0.100  +0.591
7       Ant_Endo_Mid       22     320     9.0    +2.5   +0.5   +4.5   +0.800  -0.100  +0.591
8       Ant_Mid_Mid        32     345     8.0    +2.5   +0.5   +4.5   +0.700  -0.100  +0.707
9       Ant_Epi_Mid        45     275     7.0    +2.5   +0.5   +4.5   +0.600  -0.200  +0.775
10      Ant_Endo_Apex      28     300     5.0    +1.5   +4.5   +3.5   +0.700  +0.300  +0.648

### LEFT VENTRICLE - LATERAL WALL

seg_id  name              act_ms  APD_ms  mass_g  pos_x  pos_y  pos_z  fib_x   fib_y   fib_z
11      Lat_Endo_Base      40     315     9.0    +5.5   -1.5   +2.0   +0.100  +0.100  +0.995
12      Lat_Endo_Mid       50     320     9.0    +6.0   +1.0   +1.5   +0.100  +0.100  +0.995
13      Lat_Mid_Mid        58     350     8.0    +6.0   +1.0   +1.5   +0.000  +0.200  +0.980
14      Lat_Epi_Mid        70     270     7.0    +6.0   +1.0   +1.5   -0.100  +0.300  +0.949
15      Lat_Endo_Apex      55     300     5.0    +4.5   +4.0   +1.0   +0.200  +0.400  +0.894

### LEFT VENTRICLE - INFERIOR WALL

seg_id  name              act_ms  APD_ms  mass_g  pos_x  pos_y  pos_z  fib_x   fib_y   fib_z
16      Inf_Endo_Base      35     310     9.0    +2.0   +0.0   -2.0   -0.500  +0.500  -0.707
17      Inf_Endo_Mid       45     315     9.0    +3.0   +2.0   -2.5   -0.500  +0.500  -0.707
18      Inf_Mid_Mid        55     345     8.0    +3.0   +2.0   -2.5   -0.400  +0.500  -0.768
19      Inf_Epi_Mid        65     270     7.0    +3.0   +2.0   -2.5   -0.300  +0.500  -0.812
20      Inf_Endo_Apex      50     298     5.0    +2.0   +4.5   -1.5   -0.200  +0.500  -0.843

### LEFT VENTRICLE - POSTERIOR/BASAL (latest activation)

seg_id  name              act_ms  APD_ms  mass_g  pos_x  pos_y  pos_z  fib_x   fib_y   fib_z
21      Post_Endo_Base     60     310     8.0    +3.5   -3.0   -1.5   -0.600  -0.200  -0.776
22      Post_Epi_Base      75     268     7.0    +3.5   -3.0   -1.5   -0.500  -0.300  -0.812

### RIGHT VENTRICLE - FREE WALL

seg_id  name              act_ms  APD_ms  mass_g  pos_x  pos_y  pos_z  fib_x   fib_y   fib_z
23      RV_Endo_RVOT       12     265     5.0    -3.5   -3.0   +3.5   -0.700  -0.400  +0.593
24      RV_Endo_Ant        20     260     6.0    -4.0   +0.5   +3.0   -0.600  +0.200  +0.775
25      RV_Epi_Ant         38     250     5.0    -4.0   +0.5   +3.0   -0.500  +0.200  +0.843
26      RV_Endo_Inf        28     258     5.0    -3.0   +2.5   +1.0   -0.400  +0.500  +0.768
27      RV_Epi_Inf         48     245     4.5    -3.0   +2.5   +1.0   -0.300  +0.500  +0.812
28      RV_Apex            35     255     3.5    -2.0   +4.5   +2.0   -0.300  +0.600  +0.742

### INTERVENTRICULAR SEPTUM - APICAL BREAKTHROUGH

seg_id  name              act_ms  APD_ms  mass_g  pos_x  pos_y  pos_z  fib_x   fib_y   fib_z
29      Sep_Apical_LV       8     308     4.0    -0.5   +5.0   +2.0   +0.300  +0.700  +0.648
30      Sep_Apical_RV      12     262     3.5    -1.5   +5.0   +2.0   -0.300  +0.700  +0.648

---

## ACTIVATION TIMING LANDMARKS (Durrer 1970 key findings)

Event                                      Time (ms)   Segments
First endocardial breakthrough (LV sept)    0-5        1, 29
RV outflow tract activation                10-15       23
Apical septal spread                        8-15       5, 29, 30
Anterior LV endocardium                    20-25       6, 7
Inferior LV endocardium                    30-40       16, 17
Lateral LV endocardium                     40-55       11, 12
Epicardial breakthrough (anterior)         40-50       9
Epicardial breakthrough (lateral/post)     60-75       14, 22
Latest activation (LV basal posterior)     70-80       22
Total QRS duration                         ~80 ms

---

## REPOLARIZATION GRADIENT — CRITICAL FOR T-WAVE

Repolarization proceeds in REVERSE order vs. depolarization.
Epicardium repolarizes BEFORE endocardium despite activating later,
because APD_epi < APD_endo. This produces an UPRIGHT T-wave concordant
with QRS in normal sinus rhythm.

Layer           Relative APD    Repolarizes
Epicardium      Shortest        First       -> T-wave peak
Endocardium     Intermediate    Middle
Mid (M cells)   Longest         Last        -> T-wave end / QT interval end

---

## SIGMOID ACTIVATION FUNCTION (MANDATORY - do not substitute a step function)

At each timestep t, the contribution of segment i to the dipole:

  activation_fraction(t) = sigmoid_up(t, act_ms, tau_rise)
                         - sigmoid_up(t, repol_ms, tau_fall)

  sigmoid_up(t, t0, tau) = 1 / (1 + exp(-(t - t0) / tau))

  tau_rise = 4 ms    (depolarization wavefront spread across segment)
  tau_fall = 8 ms    (repolarization wavefront spread; slower)
  repol_ms = act_ms + APD_ms

  dipole_x(t) += mass_g * fib_x * activation_fraction(t)
  dipole_y(t) += mass_g * fib_y * activation_fraction(t)
  dipole_z(t) += mass_g * fib_z * activation_fraction(t)

Total dipole vector at time t: D(t) = [dipole_x, dipole_y, dipole_z]
Lead voltage: V_lead(t) = dot(D(t), lead_vector) * GAIN

GAIN calibration: start with GAIN = 0.01 mV/g and adjust until
Lead II R-wave amplitude = 1.0 mV with default segment masses.

WHY SIGMOID NOT STEP:
  A step function produces a delta-function dV/dt -> infinite spike amplitude
  and flat baseline between events. The sigmoid models finite wavefront
  conduction time (~3-5 ms) across each segment and produces physiologically
  correct smooth QRS morphology.

---

## ATRIAL SEGMENTS (4 segments; sufficient for P-wave morphology)

Atrial activation starts at SA node (superior RA) at t=0 relative to P-wave onset.
PR interval delay (AV node) = 130 ms of electrical silence after atrial repolarization.
Set ventricular t=0 at P-wave_onset + 160 ms (= PR interval of 160 ms).

seg_id  name          act_ms  APD_ms  mass_g  pos_x  pos_y  pos_z  fib_x   fib_y   fib_z
A1      RA_free         0     220     5.0    -3.0   -4.0   +0.5   +0.300  +0.800  +0.520
A2      RA_septum      25     215     3.0    -1.0   -3.5   +0.5   +0.500  +0.700  +0.510
A3      LA_free        50     230     6.0    +4.0   -4.5   -1.0   -0.300  +0.700  -0.648
A4      LA_septum      35     225     3.5    +1.5   -4.0   +0.0   -0.200  +0.800  -0.566

Use same sigmoid function for atrial segments.
tau_rise_atrial = 6 ms (slower conduction than ventricle)
tau_fall_atrial = 10 ms

---

## BEAT TIMING TEMPLATE (normal sinus rhythm, 75 bpm, RR = 800 ms)

All times relative to start of P-wave (t=0):

Event                           Start (ms)  End (ms)  Active segments
P-wave (atrial depolarization)    0          100      A1-A4
PR interval (AV node delay)      100         160      none (electrical silence)
QRS complex (ventricular depol)  160         240      1-30
ST segment (ventricular plateau) 240         320      near-zero dipole
T-wave (ventricular repol)       320         440      1-30 (repolarization phase)
TP segment (diastole)            440         800      none

Rate scaling:
  RR at 60 bpm  = 1000 ms
  RR at 75 bpm  =  800 ms
  RR at 100 bpm =  600 ms
  APD shortening at high rate: multiply all APD_ms by (0.85) at 100 bpm

---

## VALIDATION TARGETS

After implementation, verify these. If outside range, bug is in segment data or dipole math.

Parameter                       Target              Tolerance
Lead II P-wave amplitude        0.10-0.25 mV        +/-50%
Lead II P-wave duration         80-120 ms           +/-20 ms
PR interval                     120-200 ms          +/-20 ms
Lead II QRS R-wave amplitude    0.6-1.5 mV          +/-30%
QRS duration                    80-100 ms           +/-15 ms
V1 QRS morphology               rS pattern          qualitative
V5/V6 QRS morphology            tall R, no S        qualitative
Lead II T-wave                  upright, 0.1-0.5 mV qualitative
QT interval                     360-420 ms          +/-30 ms
Electrical axis                 0 to +90 degrees    qualitative
Lead I QRS                      positive (upright)  qualitative
aVF QRS                         positive (upright)  qualitative

---
File version: 1.0
Sources: Durrer 1970, Streeter 1979, Antzelevitch 2007, Malmivuo & Plonsey 1995
