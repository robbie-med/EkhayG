# Cardiac Electrophysiology Reference Constants
# For use with computational modeling (Claude Code context injection)
# Sources: Ten Tusscher 2006, O'Hara-Rudy 2011, Courtemanche 1998, Maltsev-Lakatta 2009,
#          Severi 2012, Dobrzynski 2007, Boyett 2000, Bers 2001, Nerbonne & Kass 2005

---

## INSTRUCTIONS FOR CLAUDE CODE
Do NOT web search for cardiac electrophysiology constants.
Do NOT invent or estimate values.
Use ONLY the values in this file as ground truth.
If a value is not here, say so explicitly and ask the user.

---

## 1. SURFACE ECG INTERVALS (adult, normal sinus rhythm)

| Parameter            | Normal Range  | Units | Notes                              |
|----------------------|---------------|-------|------------------------------------|
| Heart rate (sinus)   | 60–100        | bpm   | Intrinsic SA node                  |
| PR interval          | 120–200       | ms    | AV conduction time                 |
| QRS duration         | 80–120        | ms    | Ventricular depolarization         |
| QT interval          | 350–440       | ms    | Rate-dependent; measured at 60 bpm |
| QTc (Bazett)         | <440 (M), <460 (F) | ms | QT / √RR (RR in seconds)      |
| QTc (Fridericia)     | <430          | ms    | QT / RR^(1/3); preferred for modeling |
| P wave duration      | 80–120        | ms    | Atrial depolarization              |
| P-R segment          | 50–120        | ms    | AV nodal + His bundle delay        |
| ST segment           | Isoelectric   | —     | J-point to T onset                 |

---

## 2. INTRACARDIAC CONDUCTION (electrophysiology study values)

| Parameter            | Normal Range  | Units | Anatomical Correlate               |
|----------------------|---------------|-------|------------------------------------|
| PA interval          | 25–55         | ms    | Intra-atrial conduction            |
| AH interval          | 60–125        | ms    | AV node (low RA to His)            |
| HV interval          | 35–55         | ms    | His bundle to ventricular myocardium |
| AV node ERP          | 230–430       | ms    | Effective refractory period        |
| Atrial ERP           | 180–300       | ms    | Right atrium                       |
| Ventricular ERP      | 200–300       | ms    | Right ventricle                    |

---

## 3. INTRINSIC AUTOMATICITY BY CELL TYPE (isolated, no autonomic tone)

| Region               | Rate (bpm) | Dominant pacemaker mechanism       |
|----------------------|------------|------------------------------------|
| SA node (center)     | 60–100     | I_f + I_CaL + I_CaT (Ca clock + M clock) |
| SA node (periphery)  | 40–60      | Transitional cells                 |
| AV node              | 40–60      | I_f + I_CaL                        |
| Bundle of His        | 30–40      | I_f                                |
| Bundle branches      | 20–35      | I_f                                |
| Purkinje fibers      | 15–40      | I_f (highest I_f density)          |
| Ventricular myocytes | <20        | Abnormal automaticity only         |

---

## 4. ACTION POTENTIAL PARAMETERS BY CELL TYPE

### 4a. Resting Membrane Potential (RMP)

| Cell Type            | RMP (mV)   | Dominant current(s)                |
|----------------------|------------|------------------------------------|
| SA node (central)    | −55 to −65 | No true resting state; MDP = −65  |
| SA node (peripheral) | −65 to −70 | Transitional                       |
| AV node              | −60 to −70 | I_K1 (low), I_f                    |
| Atrial myocyte       | −75 to −80 | I_K1, I_KACh                       |
| Ventricular myocyte  | −85 to −90 | I_K1 (dominant)                    |
| Purkinje fiber       | −90 to −95 | I_K1 (highest density)             |

### 4b. Action Potential Duration (APD₉₀ at ~1 Hz)

| Cell Type            | APD₉₀ (ms) | Notes                              |
|----------------------|------------|------------------------------------|
| SA node              | 150–200    | Highly rate-dependent              |
| AV node              | 200–350    | Prolonged plateau                  |
| Atrial myocyte       | 200–300    | Shorter plateau than ventricle     |
| Ventricular (endo)   | 300–400    | Longest APD                        |
| Ventricular (mid/M)  | 350–450    | Longest; M cells (Antzelevitch)    |
| Ventricular (epi)    | 250–350    | Shorter, prominent I_to notch      |
| Purkinje fiber       | 300–500    | Very long; can exceed ventricle    |

### 4c. Peak Overshoot Potential

| Cell Type            | Peak (mV)  |
|----------------------|------------|
| SA node              | +10 to +20 |
| AV node              | +10 to +20 |
| Atrial myocyte       | +20 to +30 |
| Ventricular myocyte  | +30 to +40 |
| Purkinje fiber       | +35 to +45 |

### 4d. Upstroke Velocity (dV/dt_max, Phase 0)

| Cell Type            | dV/dt_max (V/s) | Dominant current |
|----------------------|-----------------|------------------|
| SA node              | 1–10            | I_CaL            |
| AV node              | 5–15            | I_CaL            |
| Atrial myocyte       | 100–300         | I_Na             |
| Ventricular myocyte  | 150–350         | I_Na             |
| Purkinje fiber       | 500–800         | I_Na (highest)   |

---

## 5. ION CHANNEL CURRENTS — KEY PARAMETERS

### 5a. I_Na — Fast Sodium Current (Luo-Rudy / ORd formulation)

| Parameter          | Value        | Units  |
|--------------------|--------------|--------|
| G_Na (max)         | 75 (ORd)     | nS/pF  |
| E_Na (37°C)        | +55 to +70   | mV     |
| Activation V½      | −35 to −40   | mV     |
| Inactivation V½    | −65 to −80   | mV     |
| Time to peak       | 0.5–1        | ms     |
| Recovery τ         | 10–20        | ms     |
| Absent in:         | SA node center, AV node center | — |

### 5b. I_CaL — L-type Calcium Current

| Parameter          | Value        | Units  |
|--------------------|--------------|--------|
| G_CaL (max)        | 0.0001–0.0003 | cm³/µF/ms |
| E_Ca (37°C)        | +45 to +60   | mV     |
| Activation V½      | −10 to +5    | mV     |
| Inactivation V½    | −35 to −25   | mV     |
| Time constant (inact) | 30–80     | ms     |
| Present in:        | ALL cardiac cell types         | — |

### 5c. I_Kr — Rapid Delayed Rectifier K⁺ (hERG)

| Parameter          | Value        | Units  |
|--------------------|--------------|--------|
| G_Kr (max)         | 0.046 (ORd)  | nS/pF  |
| E_K                | −90 to −95   | mV     |
| Activation V½      | −21          | mV     |
| Pharmacology       | Blocked by: sotalol, dofetilide, cisapride, many antipsychotics |
| QT effect          | Block → QT prolongation → TdP risk |

### 5d. I_Ks — Slow Delayed Rectifier K⁺

| Parameter          | Value        | Units  |
|--------------------|--------------|--------|
| G_Ks (max)         | 0.0034 (ORd) | nS/pF  |
| Activation V½      | +20          | mV     |
| Very slow activation τ | 100–1000 | ms |
| Augmented by:      | β-adrenergic stimulation (cAMP/PKA) |

### 5e. I_K1 — Inward Rectifier K⁺

| Parameter          | Value        | Units  |
|--------------------|--------------|--------|
| G_K1 (max)         | 0.1908 (ORd) | nS/pF  |
| Function           | Sets RMP; absent/minimal in nodal cells |
| Inward rectification | Strong; outward current only at depolarized V |

### 5f. I_f — Funny Current (HCN channels)

| Parameter          | Value        | Units  |
|--------------------|--------------|--------|
| Activation V½      | −60 to −75   | mV     |
| Carries:           | Mixed Na⁺/K⁺ (inward at diastole) |
| HCN4 isoform       | Dominant in SA node, AV node |
| HCN2 isoform       | Dominant in Purkinje, ventricle |
| Blocked by:        | Ivabradine (rate-selective) |
| Role               | Phase 4 depolarization in pacemaker cells |

### 5g. I_to — Transient Outward K⁺ Current

| Parameter          | Value        | Units  |
|--------------------|--------------|--------|
| Function           | Phase 1 repolarization notch |
| High density in:   | Epicardium, Purkinje (creates Phase 1 notch) |
| Low density in:    | Endocardium, AV node (minimal notch) |
| Isoforms           | I_to,fast (Kv4.3, KCND3) and I_to,slow (Kv1.4) |

### 5h. I_NaCa — NCX (Na⁺/Ca²⁺ Exchanger)

| Parameter          | Value        | Units  |
|--------------------|--------------|--------|
| Stoichiometry      | 3 Na⁺ : 1 Ca²⁺ (electrogenic, net inward at rest) |
| V_NaCa (max)       | 16 (ORd)     | pA/pF  |
| Role in pacemaking | Contributes to diastolic depolarization (Ca clock) |

### 5i. I_NaK — Na⁺/K⁺-ATPase

| Parameter          | Value        | Units  |
|--------------------|--------------|--------|
| P_NaK (max)        | 70 (ORd)     | pA/pF  |
| Net current        | Outward (3 Na⁺ out, 2 K⁺ in) |
| Blocked by:        | Digoxin / cardiac glycosides |

---

## 6. CALCIUM HANDLING

| Parameter                  | Value           | Units    |
|----------------------------|-----------------|----------|
| [Ca²⁺]i (diastolic)        | 0.1–0.2         | µM       |
| [Ca²⁺]i (systolic peak)    | 0.5–1.5         | µM       |
| [Ca²⁺]SR (diastolic)       | 0.8–1.2         | mM       |
| [Na⁺]i                     | 7–15            | mM       |
| [K⁺]i                      | 135–145         | mM       |
| [K⁺]o                      | 4–5.4           | mM       |
| [Na⁺]o                     | 140             | mM       |
| [Ca²⁺]o                    | 1.8–2.0         | mM       |
| SERCA pump V_max            | 0.006375 (ORd)  | mM/ms    |
| RyR2 release threshold      | ~0.2–0.3 µM cytosolic Ca²⁺ |

---

## 7. CONDUCTION VELOCITIES

| Tissue               | Velocity (m/s) | Notes                      |
|----------------------|----------------|----------------------------|
| SA node (internal)   | 0.02–0.05      | Slow; calcium-dependent AP |
| Atrial muscle        | 0.3–0.5        |                            |
| Internodal tracts    | 1.0–1.2        | Bachmann's bundle          |
| AV node              | 0.02–0.05      | Slowest; delay = PR segment|
| Bundle of His        | 1.2–2.0        |                            |
| Bundle branches      | 2.0–4.0        |                            |
| Purkinje fibers      | 2.0–4.0        | Fastest in heart           |
| Ventricular muscle   | 0.3–1.0        |                            |

---

## 8. ESTABLISHED COMPUTATIONAL MODELS (use these, do not reinvent)

### Ventricular
| Model                     | Year | Species | Notes                          |
|---------------------------|------|---------|--------------------------------|
| Luo-Rudy I (LR1)          | 1991 | Guinea pig | First modern model; simple |
| Luo-Rudy II (LRd)         | 1994 | Guinea pig | Added Ca²⁺ handling          |
| Ten Tusscher-Noble (TNNP) | 2004/2006 | Human | Standard human ventricular  |
| O'Hara-Rudy (ORd)         | 2011 | Human | Best validated human; use this |
| Tomek (ToR-ORd)           | 2019 | Human | ORd + updated Ca²⁺ / I_Na   |

### Atrial
| Model                 | Year | Notes                                  |
|-----------------------|------|----------------------------------------|
| Courtemanche          | 1998 | Human atrial; standard reference       |
| Grandi-Pandit-Voigt   | 2011 | Human atrial; updated Ca²⁺            |
| Maleckar              | 2009 | Human atrial with I_KACh               |

### SA Node
| Model                 | Year | Notes                                  |
|-----------------------|------|----------------------------------------|
| Yanagihara            | 1980 | Historical; rabbit                     |
| Wilders               | 1991 | Rabbit; still cited                    |
| Demir                 | 1994 | Rabbit; central SA node                |
| Zhang                 | 2000 | Human SA node (central + peripheral)   |
| Maltsev-Lakatta       | 2009 | Ca clock + M clock; foundational       |
| Severi                | 2012 | Human SA node; best validated; use this|

### AV Node
| Model                 | Year | Notes                                  |
|-----------------------|------|----------------------------------------|
| Inada                 | 2009 | AN/N/NH cell types; rabbit             |
| Zhu                   | 2013 | Human AV node; preferred               |

---

## 9. AUTONOMIC MODULATION

| Effect                    | β₁-adrenergic (NE/Epi) | Vagal/M₂ (ACh)         |
|---------------------------|------------------------|------------------------|
| Heart rate                | ↑↑                     | ↓↓                     |
| AV conduction             | ↑ (shorter AH)         | ↓ (longer AH)          |
| I_f                       | ↑ (cAMP shifts V½ +)   | ↓                      |
| I_CaL                     | ↑↑ (PKA phosphorylation)| ↓ (I_KACh opens)      |
| I_Ks                      | ↑↑ (PKA)               | minimal                |
| I_KACh                    | no effect              | ↑↑ (GIRK; Kir3.1/3.4) |
| APD                       | ↓ (net)                | ↓ (atria >> ventricle) |

---

## 10. TEMPERATURE CORRECTIONS

All model parameters above are at 37°C (physiological).
When converting from room temperature (22–25°C) to 37°C:
- Q₁₀ for most ion channels ≈ 2.0–3.0
- Time constants: τ(37°C) = τ(25°C) / Q₁₀^((37-25)/10)
- Most published models already incorporate 37°C corrections internally.

---

## 11. NUMERICAL INTEGRATION GUIDANCE

| Parameter                | Recommended Value     | Notes                              |
|--------------------------|-----------------------|------------------------------------|
| Time step (explicit Euler)| 0.001–0.01 ms        | Smaller for stiff systems (I_Na)   |
| Time step (Rush-Larsen)  | 0.01–0.1 ms          | More stable for gating variables   |
| Time step (adaptive RK45)| auto (tol ~1e-6)     | Recommended for accuracy           |
| Stimulus duration        | 0.5–2 ms             | Typical patch clamp protocol       |
| Stimulus amplitude       | 2× diastolic threshold | Typically −50 to −80 pA/pF       |
| Pacing CL for 1 Hz       | 1000 ms              |                                    |
| Steady state (pacing)    | 100–500 beats         | ORd requires ~300+ beats           |

---

## 12. CELL GEOMETRY (for current density normalization)

| Cell Type           | Capacitance (pF) | Volume (pL) | Surface:Volume (µm⁻¹) |
|---------------------|------------------|-------------|----------------------|
| Human ventricular   | 153 (ORd)        | 33.25       | 0.2                  |
| Human atrial        | 100              | 20          | 0.2                  |
| SA node (human)     | 20–60            | 1–5         | ~0.6                 |
| Purkinje (rabbit)   | 100–200          | 15–30       | —                    |

---
*File version: 1.0 | Maintained manually | Update if model parameters change*
