/**
 * simulation-store.ts
 * Global simulation state via Zustand.
 */

import { create } from 'zustand';
import type { LeadName } from '../engine/lead-calculator';
import type { Vec3 } from '../engine/cardiac-vector';

export type DisplayMode = 'scrolling' | '12lead' | 'single';
export type Theme = 'dark' | 'light';
export type PlaybackSpeed = 0.25 | 0.5 | 1 | 2;
export type ArteryKey = 'lad' | 'd1' | 'lcx' | 'om' | 'rca' | 'pda';

interface SimulationState {
  heartRateBpm: number;
  activeConditions: string[];
  arteries: Record<ArteryKey, boolean>;
  displayMode: DisplayMode;
  playbackSpeed: PlaybackSpeed;
  gain: 5 | 10 | 20; // mm/mV
  paperSpeed: 25 | 50; // mm/s
  selectedLead: LeadName;
  showVectorArrow: boolean;
  showVCGLoop: boolean;
  showEinthovenTriangle: boolean;
  torsoOpacity: number;

  // Phase 4: electrode placement
  customElectrodePos: Vec3 | null;
  showStandardElectrodes: boolean;
  isPlacementMode: boolean;

  theme: Theme;
  setTheme: (t: Theme) => void;

  // Actions
  setHeartRate: (bpm: number) => void;
  toggleCondition: (id: string) => void;
  toggleArtery: (key: ArteryKey) => void;
  setDisplayMode: (mode: DisplayMode) => void;
  setPlaybackSpeed: (speed: PlaybackSpeed) => void;
  setGain: (gain: 5 | 10 | 20) => void;
  setPaperSpeed: (speed: 25 | 50) => void;
  setSelectedLead: (lead: LeadName) => void;
  setShowVectorArrow: (show: boolean) => void;
  setShowVCGLoop: (show: boolean) => void;
  setShowEinthovenTriangle: (show: boolean) => void;
  setTorsoOpacity: (opacity: number) => void;
  setCustomElectrodePos: (pos: Vec3 | null) => void;
  setShowStandardElectrodes: (show: boolean) => void;
  setIsPlacementMode: (on: boolean) => void;
}

export const useSimulationStore = create<SimulationState>((set) => ({
  theme: 'dark',
  setTheme: (t) => set({ theme: t }),

  heartRateBpm: 75,
  activeConditions: [],
  arteries: { lad: true, d1: true, lcx: true, om: true, rca: true, pda: true },
  displayMode: 'scrolling',
  playbackSpeed: 1,
  gain: 10,
  paperSpeed: 25,
  selectedLead: 'II',
  showVectorArrow: true,
  showVCGLoop: true,
  showEinthovenTriangle: false,
  torsoOpacity: 0.3,
  customElectrodePos: null,
  showStandardElectrodes: false,
  isPlacementMode: false,

  setHeartRate: (bpm) => set({ heartRateBpm: bpm }),
  toggleCondition: (id) =>
    set((s) => ({
      activeConditions: s.activeConditions.includes(id)
        ? s.activeConditions.filter((c) => c !== id)
        : [...s.activeConditions, id],
    })),
  toggleArtery: (key) =>
    set((s) => ({ arteries: { ...s.arteries, [key]: !s.arteries[key] } })),
  setDisplayMode: (mode) => set({ displayMode: mode }),
  setPlaybackSpeed: (speed) => set({ playbackSpeed: speed }),
  setGain: (gain) => set({ gain }),
  setPaperSpeed: (speed) => set({ paperSpeed: speed }),
  setSelectedLead: (lead) => set({ selectedLead: lead }),
  setShowVectorArrow: (show) => set({ showVectorArrow: show }),
  setShowVCGLoop: (show) => set({ showVCGLoop: show }),
  setShowEinthovenTriangle: (show) => set({ showEinthovenTriangle: show }),
  setTorsoOpacity: (opacity) => set({ torsoOpacity: opacity }),
  setCustomElectrodePos: (pos) => set({ customElectrodePos: pos }),
  setShowStandardElectrodes: (show) => set({ showStandardElectrodes: show }),
  setIsPlacementMode: (on) => set({ isPlacementMode: on }),
}));
