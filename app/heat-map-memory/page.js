"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const CHROMATIC_NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const NOTE_FILTER_ROWS = [
  {
    id: "accidental",
    label: "Acidentes",
    notes: [
      { label: "C# / Db", value: "C#" },
      { label: "D# / Eb", value: "D#" },
      { label: "E# / Fb", value: "E#" },
      { label: "F# / Gb", value: "F#" },
      { label: "G# / Ab", value: "G#" },
      { label: "A# / Bb", value: "A#" },
      { label: "B# / Cb", value: "B#" },
    ],
  },
  {
    id: "natural",
    label: "Naturais",
    notes: [
      { label: "C", value: "C" },
      { label: "D", value: "D" },
      { label: "E", value: "E" },
      { label: "F", value: "F" },
      { label: "G", value: "G" },
      { label: "A", value: "A" },
      { label: "B", value: "B" },
    ],
  },
];
const STRINGS = [
  { id: "e", label: "e", openNote: "E" },
  { id: "B", label: "B", openNote: "B" },
  { id: "G", label: "G", openNote: "G" },
  { id: "D", label: "D", openNote: "D" },
  { id: "A", label: "A", openNote: "A" },
  { id: "E", label: "E", openNote: "E" },
];
const STRING_VISUAL_THICKNESS = {
  e: 1.1,
  B: 1.6,
  G: 2.1,
  A: 3.4,
  D: 2.4,
  E: 4.0,
};
const MAX_FRET = 24;
const MIN_VISIBLE_FRET = 12;
const SINGLE_INLAY_FRETS = new Set([3, 5, 7, 9, 15, 17, 19, 21]);
const DOUBLE_INLAY_FRETS = new Set([12, 24]);
const OPEN_STRING_MIDI = {
  e: 64, // E4
  B: 59, // B3
  G: 55, // G3
  D: 50, // D3
  A: 45, // A2
  E: 40, // E2
};
const SAMPLE_FILE_NOTES = [
  "A#1", "A#3", "A#4", "A#5",
  "A1", "A2", "A3", "A4", "A5",
  "B1", "B2", "B3", "B4", "B5",
  "C#2", "C#4", "C#5",
  "C2", "C3", "C4", "C5", "C6",
  "D#2", "D#4", "D#5",
  "D2", "D3", "D4", "D5",
  "E2", "E3", "E4", "E5",
  "F#3", "F#4", "F#5",
  "F2", "F3", "F4", "F5",
  "G#1", "G#3", "G#5",
  "G1", "G2", "G3", "G4", "G5",
];
const EDGE_MARGIN_RATIO = 0.28;
const NUT_WIDTH_REM = 0.375; // Tailwind w-1.5
const NUT_HOVER_EXPAND_LEFT_REM = 0.6;
const NUT_HOVER_TOTAL_WIDTH_REM = 1.45;
const HEAT_MAP_STORAGE_KEY = "heatMapMemory_savedState_v1";
const HEAT_MAP_SETTINGS_STORAGE_KEY = "heatMapMemory_settings_v1";
const DRIVE_AUTOSYNC_DEBOUNCE_MS = 1800;
const RECENT_CORRECT_WINDOW = 5;
const FRETBOARD_HEIGHT_PRESETS = {
  "extra-wide": 180,
  wide: Math.round(180 * 0.9),
  medium: Math.round(180 * 0.9 * 0.83),
  narrow: Math.round(180 * 0.9 * 0.83 * 0.75),
};
const SAMPLE_PROFILE_OPTIONS = [
  {
    id: "freepats-autopitch",
    label: "FreePats Spanish Classical Guitar + Auto-pitch para notas faltantes",
    sourceLabel: "Fonte",
    sourceUrl: "https://github.com/freepats/spanish-classical-guitar",
  },
];
const DEFAULT_DRAW_RULES = {
  avoidImmediateRepeat: true,
  top10ByResponseAfterCoverage: true,
  prioritizeNeverCorrect: true,
  avoidSequentialOctaves: true,
  insistOnError: true,
  topResponsePoolSize: 5,
  topResponseBiasPercent: 90,
};

function buildInitialStats() {
  const rows = [];
  for (let stringIndex = 0; stringIndex < STRINGS.length; stringIndex += 1) {
    const stringItem = STRINGS[stringIndex];
    for (let fret = 0; fret <= MAX_FRET; fret += 1) {
      const pitch = positionPitch(stringItem.id, fret);
      rows.push({
        id: `${stringItem.id}-${fret}`,
        stringId: stringItem.id,
        stringLabel: stringItem.label,
        stringIndex,
        fret,
        note: pitch.pitchClass,
        tests: 0,
        correct: 0,
        wrong: 0,
        correctTimeMsTotal: 0,
        recentCorrectTimesMs: [],
      });
    }
  }
  return rows;
}

function mergeStoredStatsRows(rawRows) {
  const baseRows = buildInitialStats();
  if (!Array.isArray(rawRows)) return baseRows;

  const rawById = new Map(
    rawRows
      .filter((row) => row && typeof row.id === "string")
      .map((row) => [row.id, row]),
  );

  return baseRows.map((baseRow) => {
    const stored = rawById.get(baseRow.id);
    if (!stored) return baseRow;
    const tests = Number.isFinite(stored.tests) ? Math.max(0, stored.tests) : baseRow.tests;
    const correct = Number.isFinite(stored.correct) ? Math.max(0, stored.correct) : baseRow.correct;
    const wrong = Number.isFinite(stored.wrong) ? Math.max(0, stored.wrong) : baseRow.wrong;
    const correctTimeMsTotal = Number.isFinite(stored.correctTimeMsTotal)
      ? Math.max(0, stored.correctTimeMsTotal)
      : baseRow.correctTimeMsTotal;
    const recentFromStore = Array.isArray(stored.recentCorrectTimesMs)
      ? stored.recentCorrectTimesMs.filter((value) => Number.isFinite(value) && value >= 0)
      : [];
    const fallbackAvg = correct > 0 ? correctTimeMsTotal / correct : null;
    const reconstructedRecent = fallbackAvg === null
      ? []
      : Array.from({ length: Math.min(RECENT_CORRECT_WINDOW, correct) }, () => fallbackAvg);
    const recentCorrectTimesMs = (recentFromStore.length > 0 ? recentFromStore : reconstructedRecent)
      .slice(-RECENT_CORRECT_WINDOW);
    return {
      ...baseRow,
      tests,
      correct,
      wrong,
      correctTimeMsTotal,
      recentCorrectTimesMs,
    };
  });
}

function sanitizeStoredTotals(rawTotals) {
  const empty = { total: 0, correct: 0, wrong: 0 };
  if (!rawTotals || typeof rawTotals !== "object") return empty;
  return {
    total: Number.isFinite(rawTotals.total) ? Math.max(0, rawTotals.total) : 0,
    correct: Number.isFinite(rawTotals.correct) ? Math.max(0, rawTotals.correct) : 0,
    wrong: Number.isFinite(rawTotals.wrong) ? Math.max(0, rawTotals.wrong) : 0,
  };
}

function getRecentCorrectAverageMs(row) {
  if (!row || !Array.isArray(row.recentCorrectTimesMs) || row.recentCorrectTimesMs.length === 0) {
    return null;
  }
  const valid = row.recentCorrectTimesMs.filter((value) => Number.isFinite(value) && value >= 0);
  if (valid.length === 0) return null;
  const total = valid.reduce((sum, value) => sum + value, 0);
  return total / valid.length;
}

function fretPositionPercent(fretNumber, maxFret = MAX_FRET) {
  // Equal temperament: position from nut = 1 - 2^(-n/12), normalized to fret 24 = 100%.
  const raw = 1 - 2 ** (-fretNumber / 12);
  const rawMax = 1 - 2 ** (-maxFret / 12);
  return (raw / rawMax) * 100;
}

function nutRegionEndPercent(maxFret = MAX_FRET) {
  const firstFret = fretPositionPercent(1, maxFret);
  return firstFret * 0.22;
}

function fretSegmentCenterPercent(fret, maxFret = MAX_FRET) {
  const start = fretSegmentStartPercent(fret, maxFret);
  const end = fretSegmentEndPercent(fret, maxFret);
  return (start + end) / 2;
}

function fretSegmentStartPercent(fret, maxFret = MAX_FRET) {
  if (fret <= 0) return 0;
  return fretPositionPercent(fret - 1, maxFret);
}

function fretSegmentEndPercent(fret, maxFret = MAX_FRET) {
  if (fret <= 0) return nutRegionEndPercent(maxFret);
  return fretPositionPercent(fret, maxFret);
}

function fretMarkerLeftStyle(fret, maxFret = MAX_FRET) {
  return fret === 0 ? "0.1875rem" : `${fretSegmentCenterPercent(fret, maxFret)}%`;
}

function fretSliderPercent(fret, maxFret = MAX_FRET) {
  if (fret <= 0) return 0;
  return fretPositionPercent(fret, maxFret);
}

function isFretInsideSliderWindow(fret, minBoundaryFret, maxBoundaryFret, maxFret = MAX_FRET) {
  const center = fretSegmentCenterPercent(fret, maxFret);
  const leftBoundary = fretSliderPercent(minBoundaryFret, maxFret);
  const rightBoundary = fretSliderPercent(maxBoundaryFret, maxFret);
  return center >= leftBoundary && center <= rightBoundary;
}

function heatmapColorFromScore(score, useBlack = false) {
  if (useBlack || !Number.isFinite(score)) {
    return {
      background: "rgba(0, 0, 0, 0.82)",
      border: "rgba(30, 41, 59, 0.9)",
      textColor: "rgba(226, 232, 240, 0.95)",
    };
  }

  const clamped = Math.max(0, Math.min(1, score));
  const hue = clamped * 120; // 0 red -> 60 yellow -> 120 green
  const lightness = 44 + clamped * 8;
  return {
    background: `hsla(${hue.toFixed(0)}, 82%, ${lightness.toFixed(0)}%, 0.86)`,
    border: `hsla(${hue.toFixed(0)}, 85%, ${Math.max(24, lightness - 20).toFixed(0)}%, 0.95)`,
    textColor: "rgba(0, 0, 0, 0.82)",
  };
}

function interpolateRgb(fromRgb, toRgb, t) {
  const clamped = Math.max(0, Math.min(1, t));
  return [
    Math.round(fromRgb[0] + (toRgb[0] - fromRgb[0]) * clamped),
    Math.round(fromRgb[1] + (toRgb[1] - fromRgb[1]) * clamped),
    Math.round(fromRgb[2] + (toRgb[2] - fromRgb[2]) * clamped),
  ];
}

function responseTimeHeatColor(avgSec) {
  if (!Number.isFinite(avgSec) || avgSec > 20) {
    return {
      background: "rgba(0, 0, 0, 0.86)",
      border: "rgba(30, 41, 59, 0.95)",
      textColor: "rgba(226, 232, 240, 0.95)",
    };
  }

  let rgb = [0, 0, 0];
  if (avgSec <= 2) {
    // 0..2s => light green to dark green
    rgb = interpolateRgb([134, 239, 172], [22, 101, 52], avgSec / 2);
  } else if (avgSec <= 5) {
    // 2..5s => yellow to orange
    rgb = interpolateRgb([250, 204, 21], [249, 115, 22], (avgSec - 2) / 3);
  } else {
    // 5..20s => red to black
    rgb = interpolateRgb([239, 68, 68], [0, 0, 0], (avgSec - 5) / 15);
  }

  const [r, g, b] = rgb;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const textColor = luminance > 145 ? "rgba(0, 0, 0, 0.82)" : "rgba(226, 232, 240, 0.95)";
  return {
    background: `rgba(${r}, ${g}, ${b}, 0.86)`,
    border: `rgba(${Math.max(0, r - 35)}, ${Math.max(0, g - 35)}, ${Math.max(0, b - 35)}, 0.95)`,
    textColor,
  };
}

function midiToFrequency(midi) {
  return 440 * (2 ** ((midi - 69) / 12));
}

function noteLabelToPitchClass(noteLabel) {
  const match = /^([A-G])([#b]?)$/.exec(noteLabel);
  if (!match) return null;

  const [, base, accidental] = match;
  const baseMap = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  let semitone = baseMap[base];
  if (accidental === "#") semitone += 1;
  if (accidental === "b") semitone -= 1;
  const normalized = ((semitone % 12) + 12) % 12;
  return CHROMATIC_NOTES[normalized];
}

function noteNameToMidi(noteName) {
  const match = /^([A-G]#?)(\d)$/.exec(noteName);
  if (!match) return null;
  const [, note, octaveRaw] = match;
  const octave = Number.parseInt(octaveRaw, 10);
  const noteIndex = CHROMATIC_NOTES.indexOf(note);
  if (noteIndex < 0) return null;
  return (octave + 1) * 12 + noteIndex;
}

function midiToNoteName(midi) {
  const normalized = Math.max(0, Math.round(midi));
  const note = CHROMATIC_NOTES[((normalized % 12) + 12) % 12];
  const octave = Math.floor(normalized / 12) - 1;
  return `${note}${octave}`;
}

function pitchClassFromMidi(midi) {
  return CHROMATIC_NOTES[((midi % 12) + 12) % 12];
}

const SAMPLE_LIBRARY = SAMPLE_FILE_NOTES
  .map((noteName) => {
    const midi = noteNameToMidi(noteName);
    if (midi === null) return null;
    return {
      noteName,
      midi,
      frequency: midiToFrequency(midi),
      src: `/samples/guitar/freepats/${encodeURIComponent(noteName)}.flac`,
    };
  })
  .filter(Boolean)
  .sort((a, b) => a.midi - b.midi);

function openStringSampleForStringId(stringId) {
  const openMidi = OPEN_STRING_MIDI[stringId] ?? null;
  if (!Number.isFinite(openMidi)) return null;
  for (let index = 0; index < SAMPLE_LIBRARY.length; index += 1) {
    const candidate = SAMPLE_LIBRARY[index];
    if (candidate.midi === openMidi) return candidate;
  }
  return null;
}

function positionPitch(stringId, fret) {
  const openMidi = OPEN_STRING_MIDI[stringId] ?? OPEN_STRING_MIDI.E;
  const midi = openMidi + fret;
  return {
    midi,
    noteName: midiToNoteName(midi),
    pitchClass: pitchClassFromMidi(midi),
  };
}

function stringTopPercent(stringIndex) {
  const intervalsBetweenStrings = STRINGS.length - 1;
  const spacingPercent = 100 / (intervalsBetweenStrings + EDGE_MARGIN_RATIO * 2);
  const edgeMarginPercent = spacingPercent * EDGE_MARGIN_RATIO;
  return edgeMarginPercent + stringIndex * spacingPercent;
}

function stringRegionBoundsPercent(stringIndex) {
  const current = stringTopPercent(stringIndex);
  const prev = stringIndex > 0 ? stringTopPercent(stringIndex - 1) : null;
  const next = stringIndex < STRINGS.length - 1 ? stringTopPercent(stringIndex + 1) : null;

  const top = prev === null ? current - ((next ?? current) - current) / 2 : (prev + current) / 2;
  const bottom = next === null ? current + (current - (prev ?? current)) / 2 : (current + next) / 2;

  return {
    top: Math.max(0, top),
    bottom: Math.min(100, bottom),
  };
}

function isStringInsideSliderWindow(stringIndex, minStringIndex, maxStringIndex) {
  return stringIndex >= minStringIndex && stringIndex <= maxStringIndex;
}

function waitMs(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function buildEligibleTargets(
  minBoundaryFret,
  maxBoundaryFret,
  minStringIndex,
  maxStringIndex,
  allowedPitchClasses,
  previousId = null,
  maxFret = MAX_FRET,
) {
  const boundedMinBoundary = Math.max(0, Math.min(maxFret, minBoundaryFret));
  const boundedMaxBoundary = Math.max(boundedMinBoundary, Math.min(maxFret, maxBoundaryFret));
  const allowedSet = allowedPitchClasses instanceof Set ? allowedPitchClasses : new Set(CHROMATIC_NOTES);
  const candidates = [];

  for (let stringIndex = 0; stringIndex < STRINGS.length; stringIndex += 1) {
    if (!isStringInsideSliderWindow(stringIndex, minStringIndex, maxStringIndex)) continue;
    for (let fret = 0; fret <= maxFret; fret += 1) {
      if (!isFretInsideSliderWindow(fret, boundedMinBoundary, boundedMaxBoundary, maxFret)) continue;
      const pitch = positionPitch(STRINGS[stringIndex].id, fret);
      if (!allowedSet.has(pitch.pitchClass)) continue;
      const id = `${STRINGS[stringIndex].id}-${fret}`;
      if (id === previousId) continue;
      candidates.push({ stringIndex, fret, id, note: pitch.pitchClass });
    }
  }
  return candidates;
}

export default function HeatMapMemoryPage() {
  const [isRunning, setIsRunning] = useState(false);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [showAllNotes, setShowAllNotes] = useState(false);
  const [showPerformanceHeatMap, setShowPerformanceHeatMap] = useState(true);
  const [heatMapMetric, setHeatMapMetric] = useState("responseTime");
  const [heatMapDisplayMode, setHeatMapDisplayMode] = useState("number-color");
  const [heatMapPlacement, setHeatMapPlacement] = useState("separate");
  const [errorRetryMode, setErrorRetryMode] = useState("1");
  const [responsePadMode, setResponsePadMode] = useState("keyboard");
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const [showDrawRulesModal, setShowDrawRulesModal] = useState(false);
  const [showResetSettingsConfirmModal, setShowResetSettingsConfirmModal] = useState(false);
  const [settingsTab, setSettingsTab] = useState("draw-rules");
  const [sampleProfile, setSampleProfile] = useState(SAMPLE_PROFILE_OPTIONS[0].id);
  const [drawRules, setDrawRules] = useState(DEFAULT_DRAW_RULES);
  const [enabledNoteRows, setEnabledNoteRows] = useState({
    accidental: true,
    natural: true,
  });
  const [visibleMaxFret, setVisibleMaxFret] = useState(MAX_FRET);
  const [fretboardHeightPreset, setFretboardHeightPreset] = useState("medium");
  const [studyMinFret, setStudyMinFret] = useState(0);
  const [studyMaxFret, setStudyMaxFret] = useState(MAX_FRET);
  const [studyMinString, setStudyMinString] = useState(0);
  const [studyMaxString, setStudyMaxString] = useState(STRINGS.length - 1);
  const [target, setTarget] = useState(null);
  const [questionStartMs, setQuestionStartMs] = useState(0);
  const [statsRows, setStatsRows] = useState(buildInitialStats);
  const [totals, setTotals] = useState({ total: 0, correct: 0, wrong: 0 });
  const [retryContext, setRetryContext] = useState({ targetId: null, wrongRepeatsDone: 0 });
  const [draggingThumb, setDraggingThumb] = useState(null);
  const [draggingFretWindow, setDraggingFretWindow] = useState(null);
  const [draggingStringThumb, setDraggingStringThumb] = useState(null);
  const [draggingStringWindow, setDraggingStringWindow] = useState(null);
  const [googleDriveConnected, setGoogleDriveConnected] = useState(false);
  const [googleProfile, setGoogleProfile] = useState(null);
  const [isDriveSyncBusy, setIsDriveSyncBusy] = useState(false);
  const [driveSyncMessage, setDriveSyncMessage] = useState("");
  const [showGoogleConnectSuggestionModal, setShowGoogleConnectSuggestionModal] = useState(false);
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const gameTokenRef = useRef(0);
  const isFretPointerDownRef = useRef(false);
  const answerNoteRef = useRef(null);
  const audioContextRef = useRef(null);
  const sampleBuffersRef = useRef(new Map());
  const sampleLoadingRef = useRef(new Map());
  const studySliderTrackRef = useRef(null);
  const studyStringSliderTrackRef = useRef(null);
  const driveSyncTimerRef = useRef(null);
  const hasLoadedLocalSettingsRef = useRef(false);
  const hasAttemptedDriveHydrationRef = useRef(false);
  const hasPromptedGoogleConnectRef = useRef(false);
  const accountMenuRef = useRef(null);

  const fretLinePercents = useMemo(() => {
    const values = [];
    for (let fret = 1; fret <= visibleMaxFret; fret += 1) {
      values.push({ fret, percent: fretPositionPercent(fret, visibleMaxFret) });
    }
    return values;
  }, [visibleMaxFret]);

  const inlays = useMemo(() => {
    const list = [];
    for (let fret = 1; fret <= visibleMaxFret; fret += 1) {
      if (!SINGLE_INLAY_FRETS.has(fret) && !DOUBLE_INLAY_FRETS.has(fret)) continue;
      list.push({
        fret,
        percent: fretSegmentCenterPercent(fret, visibleMaxFret),
        double: DOUBLE_INLAY_FRETS.has(fret),
      });
    }
    return list;
  }, [visibleMaxFret]);

  const fretboardNoteDots = useMemo(() => {
    const list = [];
    for (let stringIndex = 0; stringIndex < STRINGS.length; stringIndex += 1) {
      for (let fret = 0; fret <= visibleMaxFret; fret += 1) {
        const stringId = STRINGS[stringIndex].id;
        const pitch = positionPitch(stringId, fret);
        const bounds = stringRegionBoundsPercent(stringIndex);
        list.push({
          id: `${stringId}-dot-${fret}`,
          stringId,
          stringIndex,
          fret,
          note: pitch.pitchClass,
          noteName: pitch.noteName,
          midi: pitch.midi,
          left: fretSegmentCenterPercent(fret, visibleMaxFret),
          top: stringTopPercent(stringIndex),
          regionTop: bounds.top,
          regionHeight: Math.max(0, bounds.bottom - bounds.top),
        });
      }
    }
    return list;
  }, [visibleMaxFret]);
  const nutClickTargets = useMemo(
    () => STRINGS.map((stringItem, stringIndex) => {
      const bounds = stringRegionBoundsPercent(stringIndex);
      return {
        id: `${stringItem.id}-nut`,
        stringId: stringItem.id,
        noteName: positionPitch(stringItem.id, 0).noteName,
        regionTop: bounds.top,
        regionHeight: Math.max(0, bounds.bottom - bounds.top),
      };
    }),
    [],
  );
  const statsById = useMemo(() => {
    const map = new Map();
    for (let index = 0; index < statsRows.length; index += 1) {
      const row = statsRows[index];
      map.set(row.id, row);
    }
    return map;
  }, [statsRows]);
  const maxTests = useMemo(
    () => statsRows.reduce((max, row) => (row.tests > max ? row.tests : max), 0),
    [statsRows],
  );

  const studyWindowStartPercent = useMemo(
    () => fretSliderPercent(studyMinFret, visibleMaxFret),
    [studyMinFret, visibleMaxFret],
  );
  const studyWindowEndPercent = useMemo(
    () => fretSliderPercent(studyMaxFret, visibleMaxFret),
    [studyMaxFret, visibleMaxFret],
  );
  const studyMinThumbPercent = useMemo(
    () => fretSliderPercent(studyMinFret, visibleMaxFret),
    [studyMinFret, visibleMaxFret],
  );
  const studyMaxThumbPercent = useMemo(
    () => fretSliderPercent(studyMaxFret, visibleMaxFret),
    [studyMaxFret, visibleMaxFret],
  );
  const studyWindowTopPercent = useMemo(
    () => stringRegionBoundsPercent(studyMinString).top,
    [studyMinString],
  );
  const studyWindowBottomPercent = useMemo(
    () => stringRegionBoundsPercent(studyMaxString).bottom,
    [studyMaxString],
  );
  const studyMinStringThumbPercent = useMemo(
    () => stringTopPercent(studyMinString),
    [studyMinString],
  );
  const studyMaxStringThumbPercent = useMemo(
    () => stringTopPercent(studyMaxString),
    [studyMaxString],
  );
  const heatMapDots = useMemo(() => {
    return fretboardNoteDots.map((dot) => {
      const row = statsById.get(`${dot.stringId}-${dot.fret}`);
      if (!row) {
        const fallbackColors = heatmapColorFromScore(0, true);
        return {
          id: dot.id,
          label: "0",
          visible: true,
          ...fallbackColors,
        };
      }

      if (heatMapMetric === "tests") {
        const value = row.tests;
        if (value === 0) {
          const colors = heatmapColorFromScore(0, true);
          return { id: dot.id, label: "0", visible: true, ...colors };
        }
        const score = maxTests > 0 ? value / maxTests : 0;
        const colors = heatmapColorFromScore(score, value === 0);
        return { id: dot.id, label: `${value}`, visible: true, ...colors };
      }

      if (heatMapMetric === "accuracy") {
        if (row.tests === 0) {
          const colors = heatmapColorFromScore(0, true);
          return { id: dot.id, label: "0", visible: true, ...colors };
        }
        const ratio = row.correct / row.tests;
        const colors = heatmapColorFromScore(ratio, ratio === 0);
        return { id: dot.id, label: `${Math.round(ratio * 100)}%`, visible: true, ...colors };
      }

      // responseTime
      if (row.tests === 0) {
        const colors = heatmapColorFromScore(0, true);
        return { id: dot.id, label: "0", visible: true, ...colors };
      }
      if (row.correct === 0) {
        const colors = heatmapColorFromScore(0.08, false);
        return {
          id: dot.id,
          label: "x",
          visible: true,
          ...heatmapColorFromScore(0, true),
          ...colors,
          background: "rgba(0, 0, 0, 0.82)",
          border: "rgba(30, 41, 59, 0.9)",
          textColor: "rgba(226, 232, 240, 0.95)",
        };
      }

      const avgMs = getRecentCorrectAverageMs(row);
      const avgSec = avgMs === null ? null : avgMs / 1000;
      if (avgSec === null) {
        const colors = heatmapColorFromScore(0, true);
        return { id: dot.id, label: "0", visible: true, ...colors };
      }
      const colors = responseTimeHeatColor(avgSec);
      return { id: dot.id, label: `${avgSec.toFixed(1)}s`, visible: true, ...colors };
    });
  }, [fretboardNoteDots, heatMapMetric, maxTests, statsById]);
  const fretboardHeightPx = FRETBOARD_HEIGHT_PRESETS[fretboardHeightPreset] || FRETBOARD_HEIGHT_PRESETS["extra-wide"];
  const allowedPitchClasses = useMemo(() => {
    const set = new Set();
    NOTE_FILTER_ROWS.forEach((row) => {
      if (!enabledNoteRows[row.id]) return;
      row.notes.forEach((noteItem) => {
        const pitchClass = noteLabelToPitchClass(noteItem.value);
        if (pitchClass) set.add(pitchClass);
      });
    });
    return set;
  }, [enabledNoteRows]);
  const showHeatMapOnMainFretboard = showPerformanceHeatMap && heatMapPlacement === "overlay";
  const showHeatMapOnSecondaryFretboard = showPerformanceHeatMap && heatMapPlacement === "separate";
  const chooseNextTarget = useCallback((previousTarget = null) => {
    const previousId = previousTarget?.id || null;
    const previousPitchClass = previousTarget?.note || null;

    const baseCandidates = buildEligibleTargets(
      studyMinFret,
      studyMaxFret,
      studyMinString,
      studyMaxString,
      allowedPitchClasses,
      drawRules.avoidImmediateRepeat ? previousId : null,
      visibleMaxFret,
    );

    if (baseCandidates.length === 0 && drawRules.avoidImmediateRepeat && previousId) {
      const fallbackCandidates = buildEligibleTargets(
        studyMinFret,
        studyMaxFret,
        studyMinString,
        studyMaxString,
        allowedPitchClasses,
        null,
        visibleMaxFret,
      );
      if (fallbackCandidates.length === 0) return null;
      const fallbackIndex = Math.floor(Math.random() * fallbackCandidates.length);
      return fallbackCandidates[fallbackIndex];
    }

    if (baseCandidates.length === 0) return null;

    const candidates = (() => {
      if (!drawRules.avoidSequentialOctaves || !previousPitchClass) return baseCandidates;
      const withoutSequentialOctaves = baseCandidates.filter((candidate) => candidate.note !== previousPitchClass);
      // If this rule removes all options, keep gameplay flowing with original candidates.
      return withoutSequentialOctaves.length > 0 ? withoutSequentialOctaves : baseCandidates;
    })();

    if (drawRules.prioritizeNeverCorrect) {
      const neverCorrectCandidates = candidates.filter((candidate) => {
        const row = statsById.get(candidate.id);
        return !row || row.correct <= 0;
      });
      if (neverCorrectCandidates.length > 0) {
        const index = Math.floor(Math.random() * neverCorrectCandidates.length);
        return neverCorrectCandidates[index];
      }
    }

    if (drawRules.top10ByResponseAfterCoverage) {
      const rankedBySlowerResponse = candidates
        .map((candidate) => {
          const row = statsById.get(candidate.id);
          const avgResponseMs = getRecentCorrectAverageMs(row);
          return { candidate, avgResponseMs };
        })
        .sort((a, b) => {
          const av = a.avgResponseMs ?? Number.POSITIVE_INFINITY;
          const bv = b.avgResponseMs ?? Number.POSITIVE_INFINITY;
          if (bv > av) return 1;
          if (bv < av) return -1;
          return 0;
        });
      const configuredPoolSize = Math.max(1, Number.parseInt(drawRules.topResponsePoolSize, 10) || DEFAULT_DRAW_RULES.topResponsePoolSize);
      const configuredBiasPercent = Math.max(0, Math.min(100, Number.parseInt(drawRules.topResponseBiasPercent, 10) || DEFAULT_DRAW_RULES.topResponseBiasPercent));
      const shouldUseTopSlowestPool = Math.random() * 100 < configuredBiasPercent;
      if (!shouldUseTopSlowestPool) {
        const randomIndex = Math.floor(Math.random() * candidates.length);
        return candidates[randomIndex];
      }
      const topSlowest = rankedBySlowerResponse.slice(0, configuredPoolSize);
      const topPool = topSlowest.length > 0 ? topSlowest : rankedBySlowerResponse;
      const index = Math.floor(Math.random() * topPool.length);
      return topPool[index].candidate;
    }

    const index = Math.floor(Math.random() * candidates.length);
    return candidates[index];
  }, [
    allowedPitchClasses,
    drawRules.avoidImmediateRepeat,
    drawRules.avoidSequentialOctaves,
    drawRules.prioritizeNeverCorrect,
    drawRules.topResponseBiasPercent,
    drawRules.topResponsePoolSize,
    drawRules.top10ByResponseAfterCoverage,
    statsById,
    studyMaxFret,
    studyMaxString,
    studyMinFret,
    studyMinString,
    visibleMaxFret,
  ]);
  const accidentalRowNotes = useMemo(
    () => NOTE_FILTER_ROWS.find((row) => row.id === "accidental")?.notes || [],
    [],
  );
  const naturalRowNotes = useMemo(
    () => NOTE_FILTER_ROWS.find((row) => row.id === "natural")?.notes || [],
    [],
  );

  const getAudioContext = useCallback(async () => {
    if (typeof window === "undefined") return null;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextClass();
    }
    if (audioContextRef.current.state === "suspended") {
      await audioContextRef.current.resume();
    }
    return audioContextRef.current;
  }, []);

  const playFallbackTone = useCallback(async (targetMidi) => {
    const context = await getAudioContext();
    if (!context) return;

    const now = context.currentTime;
    const frequency = midiToFrequency(targetMidi);
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
    osc.connect(gain);
    gain.connect(context.destination);
    osc.start(now);
    osc.stop(now + 0.46);
  }, [getAudioContext]);

  const getSampleBuffer = useCallback(async (sampleInfo) => {
    if (!sampleInfo) return null;
    const cacheKey = sampleInfo.src || sampleInfo.noteName;

    if (sampleBuffersRef.current.has(cacheKey)) {
      return sampleBuffersRef.current.get(cacheKey);
    }

    if (sampleLoadingRef.current.has(cacheKey)) {
      return sampleLoadingRef.current.get(cacheKey);
    }

    const loadingPromise = (async () => {
      const context = await getAudioContext();
      if (!context) return null;
      const response = await fetch(sampleInfo.src);
      if (!response.ok) throw new Error(`Failed sample: ${sampleInfo.src}`);
      const arrayBuffer = await response.arrayBuffer();
      const decoded = await context.decodeAudioData(arrayBuffer.slice(0));
      sampleBuffersRef.current.set(cacheKey, decoded);
      return decoded;
    })().finally(() => {
      sampleLoadingRef.current.delete(cacheKey);
    });

    sampleLoadingRef.current.set(cacheKey, loadingPromise);
    return loadingPromise;
  }, [getAudioContext]);

  const playPromptNote = useCallback(async (stringId, fret) => {
    const context = await getAudioContext();
    if (!context) return;

    const target = positionPitch(stringId, fret);
    const selectedSample = openStringSampleForStringId(stringId);
    const fallbackLevel = fret === 0 ? 0 : 1;

    try {
      const buffer = await getSampleBuffer(selectedSample);
      if (!buffer || !selectedSample) throw new Error("No sample buffer available");

      const source = context.createBufferSource();
      source.buffer = buffer;
      const playbackRate = 2 ** ((target.midi - selectedSample.midi) / 12);
      source.playbackRate.setValueAtTime(playbackRate, context.currentTime);

      const gain = context.createGain();
      const now = context.currentTime;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.23, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.2);

      source.connect(gain);
      gain.connect(context.destination);
      source.start(now);
      source.stop(now + 2.25);

      const cleanupMs = 2400;
      window.setTimeout(() => {
        source.disconnect();
        gain.disconnect();
      }, cleanupMs);

      if (fallbackLevel === 0) {
        console.info(
          `[heat-map-memory][audio] fallback=none target=${target.noteName} sample=${selectedSample.noteName} rate=${playbackRate.toFixed(4)}`,
        );
      } else {
        console.info(
          `[heat-map-memory][audio] fallback=1(pitch-shift-from-open-string) target=${target.noteName} sample=${selectedSample.noteName} rate=${playbackRate.toFixed(4)}`,
        );
      }
    } catch {
      console.warn(
        `[heat-map-memory][audio] fallback=2(synth) target=${target.noteName} reason=sample-failed-or-missing`,
      );
      await playFallbackTone(target.midi);
    }
  }, [getAudioContext, getSampleBuffer, playFallbackTone]);

  const playSuccessSound = useCallback(async (stringId, fret) => {
    await playPromptNote(stringId, fret);
    await waitMs(560);
  }, [playPromptNote]);

  const playErrorSound = useCallback(async () => {
    const context = await getAudioContext();
    if (!context) {
      await waitMs(320);
      return;
    }

    const now = context.currentTime;

    // Classic retro "wrong" stutter with square-wave drops.
    const retroBeeps = [
      { frequency: 220, start: 0.0, duration: 0.08, gain: 0.09 }, // A3
      { frequency: 196, start: 0.1, duration: 0.08, gain: 0.085 }, // G3
      { frequency: 174.61, start: 0.2, duration: 0.12, gain: 0.08 }, // F3
    ];

    retroBeeps.forEach((beep) => {
      const osc = context.createOscillator();
      const gain = context.createGain();
      const startAt = now + beep.start;
      const endAt = startAt + beep.duration;

      osc.type = "square";
      osc.frequency.setValueAtTime(beep.frequency, startAt);
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(beep.gain, startAt + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, endAt);

      osc.connect(gain);
      gain.connect(context.destination);
      osc.start(startAt);
      osc.stop(endAt + 0.005);
    });
    await waitMs(340);
  }, [getAudioContext]);

  const startGame = (eventTimeMs) => {
    if (allowedPitchClasses.size === 0) return;
    gameTokenRef.current += 1;
    const firstTarget = chooseNextTarget();
    if (!firstTarget) return;
    setIsRunning(true);
    setIsAdvancing(false);
    setTarget(firstTarget);
    setQuestionStartMs(eventTimeMs);
    setRetryContext({ targetId: null, wrongRepeatsDone: 0 });
    const firstStringId = STRINGS[firstTarget.stringIndex].id;
    playPromptNote(firstStringId, firstTarget.fret);
  };

  const stopGame = () => {
    // Discard current question and invalidate pending scoring.
    gameTokenRef.current += 1;
    setIsRunning(false);
    setIsAdvancing(false);
    setTarget(null);
    setQuestionStartMs(0);
    setRetryContext({ targetId: null, wrongRepeatsDone: 0 });
  };

  const regionStatsRows = useMemo(
    () => statsRows.filter((row) => (
      isFretInsideSliderWindow(row.fret, studyMinFret, studyMaxFret, visibleMaxFret)
      && isStringInsideSliderWindow(row.stringIndex, studyMinString, studyMaxString)
      && allowedPitchClasses.has(row.note)
    )),
    [allowedPitchClasses, statsRows, studyMaxFret, studyMaxString, studyMinFret, studyMinString, visibleMaxFret],
  );
  const regionTotals = useMemo(
    () => regionStatsRows.reduce(
      (acc, row) => ({
        total: acc.total + row.tests,
        correct: acc.correct + row.correct,
        wrong: acc.wrong + row.wrong,
        correctTimeMsTotal: acc.correctTimeMsTotal + row.correctTimeMsTotal,
      }),
      { total: 0, correct: 0, wrong: 0, correctTimeMsTotal: 0 },
    ),
    [regionStatsRows],
  );
  const totalPercent = regionTotals.total > 0 ? (regionTotals.correct / regionTotals.total) * 100 : 0;
  const wrongPercent = regionTotals.total > 0 ? (regionTotals.wrong / regionTotals.total) * 100 : 0;
  const overallAvgCorrectSec = regionTotals.correct > 0
    ? (regionTotals.correctTimeMsTotal / regionTotals.correct) / 1000
    : null;

  const updateStudyWindow = useCallback((thumb, fretValue) => {
    const fret = Math.max(0, Math.min(visibleMaxFret, fretValue));
    if (thumb === "min") {
      setStudyMinFret(Math.min(studyMaxFret, Math.max(0, Math.min(visibleMaxFret, fret))));
      return;
    }
    setStudyMaxFret(Math.max(studyMinFret, Math.max(0, Math.min(visibleMaxFret, fret))));
  }, [studyMaxFret, studyMinFret, visibleMaxFret]);

  const updateStringStudyWindow = useCallback((thumb, stringIndexValue) => {
    const maxString = STRINGS.length - 1;
    const idx = Math.max(0, Math.min(maxString, stringIndexValue));
    if (thumb === "min") {
      setStudyMinString(Math.min(studyMaxString, idx));
      return;
    }
    setStudyMaxString(Math.max(studyMinString, idx));
  }, [studyMaxString, studyMinString]);

  const nearestFretFromClientX = useCallback((clientX) => {
    const track = studySliderTrackRef.current;
    if (!track) return 0;

    const rect = track.getBoundingClientRect();
    const localX = Math.max(0, Math.min(rect.width, clientX - rect.left));

    let nearestFret = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (let fret = 0; fret <= visibleMaxFret; fret += 1) {
      const snapX = (fretSliderPercent(fret, visibleMaxFret) / 100) * rect.width;
      const distance = Math.abs(localX - snapX);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestFret = fret;
      }
    }
    return nearestFret;
  }, [visibleMaxFret]);

  const onStudyTrackPointerDown = (event) => {
    const snappedFret = nearestFretFromClientX(event.clientX);
    const thumbToMove = Math.abs(snappedFret - studyMinFret) <= Math.abs(snappedFret - studyMaxFret) ? "min" : "max";
    setDraggingThumb(thumbToMove);
    updateStudyWindow(thumbToMove, snappedFret);
  };

  const onStudyWindowDragPointerDown = (event) => {
    event.stopPropagation();
    const anchorFret = nearestFretFromClientX(event.clientX);
    setDraggingFretWindow({
      anchorFret,
      initialMinFret: studyMinFret,
      initialMaxFret: studyMaxFret,
    });
  };

  const nearestStringFromClientY = useCallback((clientY) => {
    const track = studyStringSliderTrackRef.current;
    if (!track) return 0;

    const rect = track.getBoundingClientRect();
    const localY = Math.max(0, Math.min(rect.height, clientY - rect.top));
    let nearestStringIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (let stringIndex = 0; stringIndex < STRINGS.length; stringIndex += 1) {
      const snapY = (stringTopPercent(stringIndex) / 100) * rect.height;
      const distance = Math.abs(localY - snapY);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestStringIndex = stringIndex;
      }
    }
    return nearestStringIndex;
  }, []);

  const onStudyStringTrackPointerDown = (event) => {
    const snappedStringIndex = nearestStringFromClientY(event.clientY);
    const thumbToMove = Math.abs(snappedStringIndex - studyMinString) <= Math.abs(snappedStringIndex - studyMaxString)
      ? "min"
      : "max";
    setDraggingStringThumb(thumbToMove);
    updateStringStudyWindow(thumbToMove, snappedStringIndex);
  };

  const onStudyStringWindowDragPointerDown = (event) => {
    event.stopPropagation();
    const anchorStringIndex = nearestStringFromClientY(event.clientY);
    setDraggingStringWindow({
      anchorStringIndex,
      initialMinString: studyMinString,
      initialMaxString: studyMaxString,
    });
  };

  const triggerFretPositionSound = (stringId, fret) => {
    playPromptNote(stringId, fret);
  };

  const onFretPointerDown = (event, stringId, fret) => {
    event.preventDefault();
    isFretPointerDownRef.current = true;
    triggerFretPositionSound(stringId, fret);
  };

  const onFretPointerEnter = (stringId, fret) => {
    if (!isFretPointerDownRef.current) return;
    triggerFretPositionSound(stringId, fret);
  };

  const onFretClick = (event, stringId, fret) => {
    // Preserve keyboard accessibility (detail===0), avoid duplicate mouse click after pointerdown.
    if (event.detail !== 0) return;
    triggerFretPositionSound(stringId, fret);
  };

  const noteFromKeyboardEvent = useCallback((event) => {
    const key = (event.key || "").toLowerCase();
    const baseMap = {
      c: "C",
      d: "D",
      e: "E",
      f: "F",
      g: "G",
      a: "A",
      b: "B",
    };
    const base = baseMap[key];
    if (!base) return null;
    if (event.shiftKey) return `${base}#`;
    return base;
  }, []);

  const answerNote = async (selectedNoteLabel, eventTimeMs) => {
    if (!isRunning || !target || isAdvancing) return;
    const tokenAtAnswerStart = gameTokenRef.current;
    const targetAtAnswerStart = target;
    setIsAdvancing(true);

    const row = statsRows.find((item) => item.id === targetAtAnswerStart.id);
    if (!row) {
      setIsAdvancing(false);
      return;
    }

    const elapsedMs = Math.max(0, eventTimeMs - questionStartMs);
    const selectedPitchClass = noteLabelToPitchClass(selectedNoteLabel);
    const isCorrect = selectedPitchClass === row.note;

    setTotals((current) => ({
      total: current.total + 1,
      correct: current.correct + (isCorrect ? 1 : 0),
      wrong: current.wrong + (isCorrect ? 0 : 1),
    }));

    setStatsRows((currentRows) =>
      currentRows.map((item) => {
        if (item.id !== targetAtAnswerStart.id) return item;
        const updatedRecentCorrectTimes = isCorrect
          ? [...(item.recentCorrectTimesMs || []), elapsedMs].slice(-RECENT_CORRECT_WINDOW)
          : (item.recentCorrectTimesMs || []);
        return {
          ...item,
          tests: item.tests + 1,
          correct: item.correct + (isCorrect ? 1 : 0),
          wrong: item.wrong + (isCorrect ? 0 : 1),
          correctTimeMsTotal: item.correctTimeMsTotal + (isCorrect ? elapsedMs : 0),
          recentCorrectTimesMs: updatedRecentCorrectTimes,
        };
      }),
    );

    if (isCorrect) {
      const askedStringId = STRINGS[targetAtAnswerStart.stringIndex].id;
      await playSuccessSound(askedStringId, targetAtAnswerStart.fret);
    } else {
      await playErrorSound();
    }

    if (tokenAtAnswerStart !== gameTokenRef.current) {
      setIsAdvancing(false);
      return;
    }

    let nextTarget = null;
    if (isCorrect) {
      setRetryContext({ targetId: null, wrongRepeatsDone: 0 });
      nextTarget = chooseNextTarget(targetAtAnswerStart);
    } else {
      if (!drawRules.insistOnError) {
        setRetryContext({ targetId: null, wrongRepeatsDone: 0 });
        nextTarget = chooseNextTarget(targetAtAnswerStart);
      } else {
      const isUntilCorrect = errorRetryMode === "until-correct";
      const configuredRepeats = isUntilCorrect ? Number.POSITIVE_INFINITY : Number.parseInt(errorRetryMode, 10);
      const previousWrongRepeats = retryContext.targetId === targetAtAnswerStart.id
        ? retryContext.wrongRepeatsDone
        : 0;
      const nextWrongRepeats = previousWrongRepeats + 1;
      const shouldRepeatSameTarget = isUntilCorrect || nextWrongRepeats <= configuredRepeats;

      if (shouldRepeatSameTarget) {
        setRetryContext({ targetId: targetAtAnswerStart.id, wrongRepeatsDone: nextWrongRepeats });
        nextTarget = targetAtAnswerStart;
      } else {
        setRetryContext({ targetId: null, wrongRepeatsDone: 0 });
        nextTarget = chooseNextTarget(targetAtAnswerStart);
      }
      }
    }

    if (!nextTarget) {
      setIsAdvancing(false);
      return;
    }

    const keepsSameTarget = nextTarget.id === targetAtAnswerStart.id;
    setTarget(nextTarget);
    if (!keepsSameTarget) {
      setQuestionStartMs(eventTimeMs + (isCorrect ? 980 : 360));
    }
    const nextStringId = STRINGS[nextTarget.stringIndex].id;
    playPromptNote(nextStringId, nextTarget.fret);
    setIsAdvancing(false);
  };

  answerNoteRef.current = answerNote;

  const applyStoredSettings = useCallback((parsed) => {
    if (!parsed || typeof parsed !== "object") return;

    if (typeof parsed.showPerformanceHeatMap === "boolean") {
      setShowPerformanceHeatMap(parsed.showPerformanceHeatMap);
    }
    if (typeof parsed.heatMapMetric === "string" && ["tests", "accuracy", "responseTime"].includes(parsed.heatMapMetric)) {
      setHeatMapMetric(parsed.heatMapMetric);
    }
    if (typeof parsed.heatMapDisplayMode === "string" && ["number-color", "number", "color"].includes(parsed.heatMapDisplayMode)) {
      setHeatMapDisplayMode(parsed.heatMapDisplayMode);
    }
    if (typeof parsed.heatMapPlacement === "string" && ["overlay", "separate"].includes(parsed.heatMapPlacement)) {
      setHeatMapPlacement(parsed.heatMapPlacement);
    }
    if (typeof parsed.errorRetryMode === "string" && ["1", "2", "3", "until-correct"].includes(parsed.errorRetryMode)) {
      setErrorRetryMode(parsed.errorRetryMode);
    }
    if (typeof parsed.responsePadMode === "string" && ["table", "keyboard"].includes(parsed.responsePadMode)) {
      setResponsePadMode(parsed.responsePadMode);
    }
    if (typeof parsed.visibleMaxFret === "number") {
      const bounded = Math.max(MIN_VISIBLE_FRET, Math.min(MAX_FRET, parsed.visibleMaxFret));
      setVisibleMaxFret(bounded);
    }
    if (typeof parsed.fretboardHeightPreset === "string" && Object.prototype.hasOwnProperty.call(FRETBOARD_HEIGHT_PRESETS, parsed.fretboardHeightPreset)) {
      setFretboardHeightPreset(parsed.fretboardHeightPreset);
    }
    if (typeof parsed.sampleProfile === "string" && SAMPLE_PROFILE_OPTIONS.some((profile) => profile.id === parsed.sampleProfile)) {
      setSampleProfile(parsed.sampleProfile);
    }
    if (parsed.enabledNoteRows && typeof parsed.enabledNoteRows === "object") {
      setEnabledNoteRows({
        accidental: parsed.enabledNoteRows.accidental !== false,
        natural: parsed.enabledNoteRows.natural !== false,
      });
    }
    if (parsed.drawRules && typeof parsed.drawRules === "object") {
      const nextPoolSizeRaw = Number.parseInt(parsed.drawRules.topResponsePoolSize, 10);
      const nextPoolSize = Number.isFinite(nextPoolSizeRaw) ? Math.max(1, Math.min(200, nextPoolSizeRaw)) : DEFAULT_DRAW_RULES.topResponsePoolSize;
      const nextBiasPercentRaw = Number.parseInt(parsed.drawRules.topResponseBiasPercent, 10);
      const nextBiasPercent = Number.isFinite(nextBiasPercentRaw)
        ? Math.max(0, Math.min(100, nextBiasPercentRaw))
        : DEFAULT_DRAW_RULES.topResponseBiasPercent;
      setDrawRules({
        ...DEFAULT_DRAW_RULES,
        avoidImmediateRepeat: parsed.drawRules.avoidImmediateRepeat !== false,
        top10ByResponseAfterCoverage: parsed.drawRules.top10ByResponseAfterCoverage !== false,
        prioritizeNeverCorrect: parsed.drawRules.prioritizeNeverCorrect !== false,
        avoidSequentialOctaves: parsed.drawRules.avoidSequentialOctaves !== false,
        insistOnError: parsed.drawRules.insistOnError !== false,
        topResponsePoolSize: nextPoolSize,
        topResponseBiasPercent: nextBiasPercent,
      });
    }
  }, []);

  const resetSettingsToDefaults = useCallback(() => {
    setDrawRules(DEFAULT_DRAW_RULES);
    setEnabledNoteRows({ accidental: true, natural: true });
    setVisibleMaxFret(MAX_FRET);
    setFretboardHeightPreset("medium");
    setResponsePadMode("keyboard");
    setShowPerformanceHeatMap(true);
    setHeatMapMetric("responseTime");
    setHeatMapDisplayMode("number-color");
    setHeatMapPlacement("separate");
    setErrorRetryMode("1");
    setSampleProfile(SAMPLE_PROFILE_OPTIONS[0].id);
    setSettingsTab("draw-rules");
    setRetryContext({ targetId: null, wrongRepeatsDone: 0 });
  }, []);

  const buildPersistedSettings = useCallback(() => ({
    showPerformanceHeatMap,
    heatMapMetric,
    heatMapDisplayMode,
    heatMapPlacement,
    errorRetryMode,
    responsePadMode,
    visibleMaxFret,
    fretboardHeightPreset,
    sampleProfile,
    enabledNoteRows,
    drawRules,
  }), [
    drawRules,
    enabledNoteRows,
    errorRetryMode,
    fretboardHeightPreset,
    heatMapDisplayMode,
    heatMapMetric,
    heatMapPlacement,
    responsePadMode,
    sampleProfile,
    showPerformanceHeatMap,
    visibleMaxFret,
  ]);

  const buildDriveStatePayload = useCallback(() => ({
    statsRows,
    totals,
    settings: buildPersistedSettings(),
    updatedAt: new Date().toISOString(),
    schemaVersion: 1,
  }), [buildPersistedSettings, statsRows, totals]);

  const pullStateFromDrive = useCallback(async (showStatus = true) => {
    try {
      setIsDriveSyncBusy(true);
      const response = await fetch("/api/google/drive/state", { method: "GET", cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || payload?.ok !== true) {
        throw new Error(payload?.error || "Falha ao baixar dados do Google Drive.");
      }
      if (payload?.state) {
        setStatsRows(mergeStoredStatsRows(payload.state?.statsRows));
        setTotals(sanitizeStoredTotals(payload.state?.totals));
        applyStoredSettings(payload.state?.settings);
      }
      if (showStatus) {
        setDriveSyncMessage(payload?.state ? "Dados carregados do Google Drive." : "Nenhum backup encontrado no Google Drive.");
      }
      return true;
    } catch {
      if (showStatus) {
        setDriveSyncMessage("Nao foi possivel carregar os dados do Google Drive.");
      }
      return false;
    } finally {
      setIsDriveSyncBusy(false);
    }
  }, [applyStoredSettings]);

  const pushStateToDrive = useCallback(async (payloadOverride = null, showStatus = true) => {
    try {
      setIsDriveSyncBusy(true);
      const payload = payloadOverride || buildDriveStatePayload();
      const response = await fetch("/api/google/drive/state", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok || data?.ok !== true) {
        throw new Error(data?.error || "Falha ao salvar dados no Google Drive.");
      }
      if (showStatus) {
        setDriveSyncMessage("Dados salvos no Google Drive.");
      }
      return true;
    } catch {
      if (showStatus) {
        setDriveSyncMessage("Nao foi possivel salvar os dados no Google Drive.");
      }
      return false;
    } finally {
      setIsDriveSyncBusy(false);
    }
  }, [buildDriveStatePayload]);

  const loadGoogleProfile = useCallback(async () => {
    try {
      const response = await fetch("/api/google/auth/profile", { method: "GET", cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || payload?.connected !== true) {
        setGoogleProfile(null);
        return false;
      }
      setGoogleProfile(payload?.profile || null);
      return true;
    } catch {
      setGoogleProfile(null);
      return false;
    }
  }, []);

  const startGoogleOAuth = useCallback(() => {
    if (typeof window === "undefined") return;
    setShowGoogleConnectSuggestionModal(false);
    setShowAccountMenu(false);
    const url = new URL(window.location.href);
    url.searchParams.delete("googleAuth");
    const returnTo = `${url.pathname}${url.search}`;
    window.location.assign(`/api/google/auth/start?returnTo=${encodeURIComponent(returnTo)}`);
  }, []);

  const disconnectGoogleDrive = useCallback(async () => {
    try {
      setIsDriveSyncBusy(true);
      await fetch("/api/google/auth/disconnect", { method: "POST" });
      setGoogleDriveConnected(false);
      setGoogleProfile(null);
      setDriveSyncMessage("Conta Google desconectada.");
      setShowAccountMenu(false);
    } finally {
      setIsDriveSyncBusy(false);
    }
  }, []);

  useEffect(() => () => {
    sampleLoadingRef.current.clear();
    sampleBuffersRef.current.clear();
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close();
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(HEAT_MAP_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      setStatsRows(mergeStoredStatsRows(parsed?.statsRows));
      setTotals(sanitizeStoredTotals(parsed?.totals));
    } catch {
      // Ignore corrupted persisted payload and keep defaults.
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const payload = JSON.stringify({ statsRows, totals });
    localStorage.setItem(HEAT_MAP_STORAGE_KEY, payload);
  }, [statsRows, totals]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(HEAT_MAP_SETTINGS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      applyStoredSettings(parsed);
    } catch {
      // Ignore corrupted persisted settings and keep defaults.
    } finally {
      hasLoadedLocalSettingsRef.current = true;
    }
  }, [applyStoredSettings]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const payload = JSON.stringify(buildPersistedSettings());
    localStorage.setItem(HEAT_MAP_SETTINGS_STORAGE_KEY, payload);
  }, [buildPersistedSettings]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const authState = url.searchParams.get("googleAuth");
    const authDetail = url.searchParams.get("googleAuthDetail");
    if (!authState) return;

    if (authState === "connected") {
      setDriveSyncMessage("Conta Google conectada com sucesso.");
      setGoogleDriveConnected(true);
      loadGoogleProfile();
      pullStateFromDrive(true);
    } else if (authState === "denied") {
      setDriveSyncMessage("Conexao com Google cancelada.");
    } else {
      const detailSuffix = authDetail ? ` (${authDetail})` : "";
      setDriveSyncMessage(`Falha ao conectar com Google Drive.${detailSuffix}`);
    }

    url.searchParams.delete("googleAuth");
    url.searchParams.delete("googleAuthDetail");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }, [loadGoogleProfile, pullStateFromDrive]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let isMounted = true;

    const hydrate = async () => {
      try {
        const response = await fetch("/api/google/auth/status", { method: "GET", cache: "no-store" });
        const payload = await response.json();
        if (!isMounted) return;
        const connected = payload?.connected === true;
        setGoogleDriveConnected(connected);
        if (connected && !hasAttemptedDriveHydrationRef.current) {
          hasAttemptedDriveHydrationRef.current = true;
          await pullStateFromDrive(false);
          await loadGoogleProfile();
        } else if (connected) {
          await loadGoogleProfile();
        } else {
          setGoogleProfile(null);
          if (!hasPromptedGoogleConnectRef.current) {
            hasPromptedGoogleConnectRef.current = true;
            setShowGoogleConnectSuggestionModal(true);
          }
        }
      } catch {
        if (isMounted) {
          setGoogleDriveConnected(false);
          setGoogleProfile(null);
          if (!hasPromptedGoogleConnectRef.current) {
            hasPromptedGoogleConnectRef.current = true;
            setShowGoogleConnectSuggestionModal(true);
          }
        }
      }
    };

    hydrate();
    return () => {
      isMounted = false;
    };
  }, [loadGoogleProfile, pullStateFromDrive]);

  useEffect(() => {
    if (!googleDriveConnected) return;
    if (!hasLoadedLocalSettingsRef.current) return;
    if (typeof window === "undefined") return;
    const payload = buildDriveStatePayload();
    if (driveSyncTimerRef.current) {
      window.clearTimeout(driveSyncTimerRef.current);
    }
    driveSyncTimerRef.current = window.setTimeout(() => {
      pushStateToDrive(payload, false);
    }, DRIVE_AUTOSYNC_DEBOUNCE_MS);

    return () => {
      if (driveSyncTimerRef.current) {
        window.clearTimeout(driveSyncTimerRef.current);
        driveSyncTimerRef.current = null;
      }
    };
  }, [buildDriveStatePayload, googleDriveConnected, pushStateToDrive]);

  useEffect(() => {
    setStudyMinFret((current) => Math.min(current, visibleMaxFret));
    setStudyMaxFret((current) => Math.min(current, visibleMaxFret));
  }, [visibleMaxFret]);

  useEffect(() => {
    const maxString = STRINGS.length - 1;
    setStudyMinString((current) => Math.min(current, maxString));
    setStudyMaxString((current) => Math.min(current, maxString));
  }, []);

  useEffect(() => {
    if (!isRunning) return;
    if (allowedPitchClasses.size > 0) return;
    gameTokenRef.current += 1;
    setIsRunning(false);
    setIsAdvancing(false);
    setTarget(null);
    setQuestionStartMs(0);
    setRetryContext({ targetId: null, wrongRepeatsDone: 0 });
  }, [allowedPitchClasses, isRunning]);

  useEffect(() => {
    if (!isRunning) return;
    if (!target) return;
    const currentPitch = positionPitch(STRINGS[target.stringIndex].id, target.fret).pitchClass;
    const insideWindow = isFretInsideSliderWindow(target.fret, studyMinFret, studyMaxFret, visibleMaxFret);
    const insideStringWindow = isStringInsideSliderWindow(target.stringIndex, studyMinString, studyMaxString);
    if (
      insideWindow
      && insideStringWindow
      && allowedPitchClasses.has(currentPitch)
    ) {
      return;
    }

    const nextTarget = chooseNextTarget(target);
    if (!nextTarget) return;
    setTarget(nextTarget);
    setQuestionStartMs(performance.now());
    const nextStringId = STRINGS[nextTarget.stringIndex].id;
    playPromptNote(nextStringId, nextTarget.fret);
  }, [
    allowedPitchClasses,
    chooseNextTarget,
    isRunning,
    playPromptNote,
    studyMaxFret,
    studyMaxString,
    studyMinFret,
    studyMinString,
    target,
    visibleMaxFret,
  ]);

  useEffect(() => {
    if (!draggingThumb) return undefined;

    const onPointerMove = (event) => {
      const snappedFret = nearestFretFromClientX(event.clientX);
      updateStudyWindow(draggingThumb, snappedFret);
    };

    const onPointerUp = () => {
      setDraggingThumb(null);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [draggingThumb, nearestFretFromClientX, updateStudyWindow]);

  useEffect(() => {
    if (!draggingFretWindow) return undefined;

    const onPointerMove = (event) => {
      const snappedFret = nearestFretFromClientX(event.clientX);
      const deltaFret = snappedFret - draggingFretWindow.anchorFret;
      const windowSize = Math.max(0, draggingFretWindow.initialMaxFret - draggingFretWindow.initialMinFret);
      const unclampedMin = draggingFretWindow.initialMinFret + deltaFret;
      const minLimit = 0;
      const maxLimitForMin = Math.max(0, visibleMaxFret - windowSize);
      const nextMin = Math.max(minLimit, Math.min(maxLimitForMin, unclampedMin));
      const nextMax = Math.min(visibleMaxFret, nextMin + windowSize);
      setStudyMinFret(nextMin);
      setStudyMaxFret(nextMax);
    };

    const onPointerUp = () => {
      setDraggingFretWindow(null);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [draggingFretWindow, nearestFretFromClientX, visibleMaxFret]);

  useEffect(() => {
    if (!draggingStringThumb) return undefined;

    const onPointerMove = (event) => {
      const snappedStringIndex = nearestStringFromClientY(event.clientY);
      updateStringStudyWindow(draggingStringThumb, snappedStringIndex);
    };

    const onPointerUp = () => {
      setDraggingStringThumb(null);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [draggingStringThumb, nearestStringFromClientY, updateStringStudyWindow]);

  useEffect(() => {
    if (!draggingStringWindow) return undefined;

    const onPointerMove = (event) => {
      const snappedStringIndex = nearestStringFromClientY(event.clientY);
      const deltaString = snappedStringIndex - draggingStringWindow.anchorStringIndex;
      const maxString = STRINGS.length - 1;
      const windowSize = Math.max(0, draggingStringWindow.initialMaxString - draggingStringWindow.initialMinString);
      const unclampedMin = draggingStringWindow.initialMinString + deltaString;
      const minLimit = 0;
      const maxLimitForMin = Math.max(0, maxString - windowSize);
      const nextMin = Math.max(minLimit, Math.min(maxLimitForMin, unclampedMin));
      const nextMax = Math.min(maxString, nextMin + windowSize);
      setStudyMinString(nextMin);
      setStudyMaxString(nextMax);
    };

    const onPointerUp = () => {
      setDraggingStringWindow(null);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [draggingStringWindow, nearestStringFromClientY]);

  useEffect(() => {
    const clearPointerDown = () => {
      isFretPointerDownRef.current = false;
    };

    window.addEventListener("pointerup", clearPointerDown);
    window.addEventListener("pointercancel", clearPointerDown);
    window.addEventListener("blur", clearPointerDown);
    return () => {
      window.removeEventListener("pointerup", clearPointerDown);
      window.removeEventListener("pointercancel", clearPointerDown);
      window.removeEventListener("blur", clearPointerDown);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      const targetElement = event.target;
      const tag = targetElement && targetElement.tagName ? targetElement.tagName.toLowerCase() : "";
      const isTextInput = tag === "input" || tag === "textarea" || tag === "select";
      if (isTextInput || targetElement?.isContentEditable) return;

      if (event.key === "Shift") {
        setIsShiftPressed(true);
        return;
      }

      if (event.repeat) return;
      const noteLabel = noteFromKeyboardEvent(event);
      if (!noteLabel) return;
      event.preventDefault();
      answerNoteRef.current?.(noteLabel, event.timeStamp || performance.now());
    };

    const onKeyUp = (event) => {
      if (event.key === "Shift") {
        setIsShiftPressed(false);
      }
    };

    const onWindowBlur = () => {
      setIsShiftPressed(false);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onWindowBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, [noteFromKeyboardEvent]);

  useEffect(() => {
    if (!showAccountMenu) return undefined;

    const onPointerDown = (event) => {
      if (!accountMenuRef.current) return;
      if (!accountMenuRef.current.contains(event.target)) {
        setShowAccountMenu(false);
      }
    };

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setShowAccountMenu(false);
      }
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [showAccountMenu]);

  return (
    <div className="soundstage min-h-screen bg-slate-950 px-3 py-4 md:px-6">
      <main className="mx-auto max-w-[1300px] rounded-3xl border border-cyan-400/20 bg-slate-950/85 p-3 shadow-2xl shadow-black/50 backdrop-blur-xl [&_button]:cursor-pointer [&_button:disabled]:cursor-not-allowed md:p-5">
        <header className="relative mb-4 border-b border-cyan-400/20 pb-3">
          <div className="absolute right-0 top-0 z-10 flex items-center gap-2">
            <button
              type="button"
              aria-pressed={showAllNotes}
              onClick={() => setShowAllNotes((current) => !current)}
              className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-cyan-300/40 bg-cyan-400/10 px-2 py-1 text-[11px] text-cyan-100 transition hover:bg-cyan-300/20"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current">
                <path strokeWidth="1.8" d="M2 12s3.8-6 10-6 10 6 10 6-3.8 6-10 6-10-6-10-6Z" />
                <circle cx="12" cy="12" r="2.6" strokeWidth="1.8" />
                {!showAllNotes && <path strokeWidth="1.8" d="m4 20 16-16" />}
              </svg>
              {showAllNotes ? "Ocultar notas" : "Exibir notas"}
            </button>
            <button
              type="button"
              onClick={() => {
                setSettingsTab("draw-rules");
                setShowDrawRulesModal(true);
              }}
              className="inline-flex items-center gap-1 rounded-md border border-cyan-300/40 bg-cyan-400/10 px-2 py-1 text-[11px] text-cyan-100 transition hover:bg-cyan-300/20"
            >
              Configurações
            </button>
            <div ref={accountMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setShowAccountMenu((current) => !current)}
                aria-haspopup="menu"
                aria-expanded={showAccountMenu}
                className={`group relative inline-flex h-10 w-10 items-center justify-center overflow-visible rounded-full border transition ${
                  googleDriveConnected
                    ? "border-cyan-300/50 bg-slate-900 hover:border-cyan-200/70"
                    : "border-amber-300/60 bg-amber-200/10 hover:bg-amber-200/20"
                }`}
                title={googleDriveConnected
                  ? (googleProfile?.email || googleProfile?.name || "Conta Google conectada")
                  : "Clique para conectar sua conta Google"}
              >
              {googleDriveConnected && googleProfile?.imageUrl ? (
                <span className="h-full w-full overflow-hidden rounded-full">
                  <img
                    src={googleProfile.imageUrl}
                    alt={googleProfile?.name ? `Conta conectada: ${googleProfile.name}` : "Conta Google conectada"}
                    className="h-full w-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </span>
              ) : !googleDriveConnected ? (
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  className="h-5 w-5"
                >
                  <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.26-.96 2.32-2.04 3.03l3.3 2.56C20.7 17.86 21.6 15.2 21.6 12c0-.6-.05-1.18-.15-1.74H12Z" />
                  <path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.63-2.44l-3.3-2.56c-.92.62-2.1.98-3.33.98-2.56 0-4.73-1.73-5.5-4.06H3.08v2.62A10 10 0 0 0 12 22Z" />
                  <path fill="#4A90E2" d="M6.5 13.92A5.98 5.98 0 0 1 6.2 12c0-.67.12-1.32.3-1.92V7.46H3.08A10 10 0 0 0 2 12c0 1.62.39 3.14 1.08 4.46l3.42-2.54Z" />
                  <path fill="#FBBC05" d="M12 6.02c1.47 0 2.8.5 3.84 1.48l2.88-2.88C16.96 2.98 14.7 2 12 2a10 10 0 0 0-8.92 5.46L6.5 10.08c.77-2.33 2.94-4.06 5.5-4.06Z" />
                </svg>
              ) : (
                <span className={`text-sm font-semibold ${googleDriveConnected ? "text-cyan-100" : "text-amber-100"}`}>
                  {(googleProfile?.name || googleProfile?.email || "G").trim().charAt(0).toUpperCase()}
                </span>
              )}
              {googleDriveConnected ? (
                <span className="pointer-events-none absolute -bottom-0.5 -right-0.5 inline-flex h-4.5 w-4.5 items-center justify-center rounded-full bg-slate-950/95">
                  {isDriveSyncBusy ? (
                    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5 animate-spin text-emerald-400">
                      <path
                        fill="currentColor"
                        d="M12 3a9 9 0 1 0 9 9h-2a7 7 0 1 1-2.05-4.95L15.5 8.5H21V3l-1.9 1.9A8.96 8.96 0 0 0 12 3Z"
                      />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5 text-emerald-400">
                      <path
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.9"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M7.5 18.5h8.8a4.2 4.2 0 0 0 .4-8.38 5.5 5.5 0 0 0-10.52 1.83A3.8 3.8 0 0 0 7.5 18.5Zm2.2-4.2 1.9 1.9 3.8-3.8"
                      />
                    </svg>
                  )}
                </span>
              ) : (
                <span className="pointer-events-none absolute -bottom-0.5 -right-0.5 inline-flex h-4.5 w-4.5 items-center justify-center rounded-full bg-slate-950/95">
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5 text-amber-300">
                    <path
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.9"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M7.5 18.5h8.8a4.2 4.2 0 0 0 .4-8.38 5.5 5.5 0 0 0-10.52 1.83A3.8 3.8 0 0 0 7.5 18.5Zm1.1-8.3 6.8 6.8"
                    />
                  </svg>
                </span>
              )}
              </button>
              {showAccountMenu && (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-64 rounded-lg border border-slate-700 bg-slate-900/95 p-2 shadow-2xl shadow-black/60 backdrop-blur"
                >
                  {googleDriveConnected ? (
                    <div className="space-y-2">
                      <div className="rounded border border-slate-700 bg-slate-950/70 px-2 py-1.5">
                        <p className="truncate text-xs font-semibold text-slate-100">{googleProfile?.name || "Conta Google conectada"}</p>
                        <p className="truncate text-[11px] text-slate-400">{googleProfile?.email || "Google Drive ativo"}</p>
                      </div>
                      <button
                        type="button"
                        onClick={disconnectGoogleDrive}
                        className="w-full rounded border border-rose-500/50 bg-rose-500/15 px-2 py-1.5 text-left text-xs text-rose-100 transition hover:bg-rose-500/25"
                      >
                        Desconectar conta
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="rounded border border-slate-700 bg-slate-950/70 px-2 py-1.5 text-[11px] text-slate-300">
                        Conecte sua conta Google para ativar o salvamento automático no Drive.
                      </p>
                      <button
                        type="button"
                        onClick={startGoogleOAuth}
                        className="w-full rounded border border-cyan-400/50 bg-cyan-500/20 px-2 py-1.5 text-left text-xs font-semibold text-cyan-100 transition hover:bg-cyan-500/30"
                      >
                        Conectar conta Google
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="relative flex items-center justify-center pr-12 md:pr-14">
            <div className="absolute left-0 flex items-center gap-2">
              <button
                type="button"
                onClick={(event) => startGame(event.timeStamp)}
                disabled={allowedPitchClasses.size === 0}
                className="rounded-md border border-emerald-400/60 bg-emerald-400/20 px-2 py-1 text-[11px] font-semibold text-emerald-100 transition hover:bg-emerald-400/30 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Iniciar
              </button>
              <button
                type="button"
                onClick={stopGame}
                disabled={!isRunning && !isAdvancing}
                className="rounded-md border border-rose-400/60 bg-rose-400/20 px-2 py-1 text-[11px] font-semibold text-rose-100 transition hover:bg-rose-400/30 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Parar
              </button>
            </div>
            <h1 className="text-center text-2xl font-semibold tracking-tight text-slate-100 md:text-3xl">
              Mapa de Calor de Memória
            </h1>
          </div>
        </header>

        <section className="rounded-2xl border border-cyan-300/20 bg-slate-900/70 p-3 md:p-4">
          <div className="w-full">
              <div className="relative">
                <div
                  className="relative flex-1 border border-amber-500/30 shadow-[0_10px_16px_rgba(0,0,0,0.45)] shadow-inner shadow-black/40"
                  style={{
                    height: `${fretboardHeightPx}px`,
                    backgroundColor: "#4a2f1f",
                    backgroundImage: `
                      linear-gradient(90deg, rgba(25, 16, 11, 0.22) 0%, rgba(25, 16, 11, 0.08) 28%, rgba(25, 16, 11, 0.2) 52%, rgba(25, 16, 11, 0.09) 74%, rgba(25, 16, 11, 0.22) 100%),
                      repeating-linear-gradient(8deg, rgba(139, 94, 60, 0.22) 0px, rgba(139, 94, 60, 0.22) 6px, rgba(101, 66, 40, 0.18) 6px, rgba(101, 66, 40, 0.18) 12px),
                      repeating-linear-gradient(-3deg, rgba(178, 126, 82, 0.12) 0px, rgba(178, 126, 82, 0.12) 16px, rgba(90, 58, 35, 0.12) 16px, rgba(90, 58, 35, 0.12) 32px)
                    `,
                  }}
                >
                <div className="pointer-events-none absolute inset-y-0 left-0 w-1.5 bg-slate-200/90" />

                {fretLinePercents.map((line) => (
                  <div key={line.fret}>
                    <div
                      className="pointer-events-none absolute inset-y-0 w-[10px]"
                      style={{
                        left: `calc(${line.percent}% - 10px)`,
                        background:
                          "linear-gradient(to right, rgba(0,0,0,0) 0%, rgba(0,0,0,0.08) 55%, rgba(0,0,0,0.22) 100%)",
                      }}
                    />
                    <div
                      className="pointer-events-none absolute inset-y-0 w-[10px]"
                      style={{
                        left: `${line.percent}%`,
                        background:
                          "linear-gradient(to right, rgba(0,0,0,0.22) 0%, rgba(0,0,0,0.08) 45%, rgba(0,0,0,0) 100%)",
                      }}
                    />
                    <div
                      className="pointer-events-none absolute inset-y-0 w-[2px] bg-slate-200/65"
                      style={{ left: `${line.percent}%` }}
                    />
                  </div>
                ))}

                {inlays.map((inlay) => (
                  <div
                    key={`inlay-${inlay.fret}`}
                    className="pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
                    style={{ left: `${inlay.percent}%` }}
                  >
                    {inlay.double ? (
                      <div className="flex flex-col gap-10">
                        <span
                          className="h-3.5 w-3.5 rounded-full bg-slate-100/85"
                          style={{ boxShadow: "inset -2px 2px 6px rgba(0,0,0,0.5)" }}
                        />
                        <span
                          className="h-3.5 w-3.5 rounded-full bg-slate-100/85"
                          style={{ boxShadow: "inset -2px 2px 6px rgba(0,0,0,0.5)" }}
                        />
                      </div>
                    ) : (
                      <span
                        className="block h-3.5 w-3.5 rounded-full bg-slate-100/85"
                        style={{ boxShadow: "inset -2px 2px 6px rgba(0,0,0,0.5)" }}
                      />
                    )}
                  </div>
                ))}

                {showHeatMapOnMainFretboard && heatMapDisplayMode === "color" && fretboardNoteDots.map((dot, index) => {
                  const metricDot = heatMapDots[index];
                  if (!metricDot?.visible) return null;
                  if (metricDot.label === "0" || metricDot.label === "x") return null;
                  const fretStart = fretSegmentStartPercent(dot.fret, visibleMaxFret);
                  const fretEnd = fretSegmentEndPercent(dot.fret, visibleMaxFret);
                  const cellWidthPercent = Math.max(0, fretEnd - fretStart);
                  const paintWidthPercent = cellWidthPercent * 0.78;
                  const paintLeftPercent = fretStart + (cellWidthPercent - paintWidthPercent) / 2;
                  const paintHeightPercent = Math.max(2.2, dot.regionHeight * 0.4);
                  const paintTopPercent = dot.top - paintHeightPercent / 2;

                  return (
                    <div
                      key={`heat-color-${dot.id}`}
                      className="pointer-events-none absolute z-[1]"
                      style={{
                        left: `${paintLeftPercent}%`,
                        width: `${paintWidthPercent}%`,
                        top: `${paintTopPercent}%`,
                        height: `${paintHeightPercent}%`,
                        borderRadius: "999px",
                        background: `linear-gradient(to right, transparent 0%, ${metricDot.background} 22%, ${metricDot.background} 78%, transparent 100%)`,
                        filter: "blur(1px)",
                        opacity: 0.3,
                      }}
                    />
                  );
                })}

                {STRINGS.map((stringItem, index) => {
                  const top = stringTopPercent(index);
                  const thickness = STRING_VISUAL_THICKNESS[stringItem.id] ?? 2;
                  return (
                    <div key={stringItem.id}>
                      <div
                        className="pointer-events-none absolute left-0 right-0"
                        style={{
                          top: `${top}%`,
                          height: `${thickness}px`,
                          transform: "translateY(-50%)",
                          background:
                            "repeating-linear-gradient(-45deg, rgba(128,128,128,0.76) 0px, rgba(128,128,128,0.76) 0.85px, rgba(74,74,74,0.95) 0.85px, rgba(74,74,74,0.95) 1.7px)",
                          boxShadow: "0 -4px 11px rgba(0, 0, 0, 0.88)",
                          borderRadius: "999px",
                        }}
                      />
                    </div>
                  );
                })}

                {fretboardNoteDots.map((dot) => (
                  (() => {
                    const fretStart = fretSegmentStartPercent(dot.fret, visibleMaxFret);
                    const fretEnd = fretSegmentEndPercent(dot.fret, visibleMaxFret);
                    const widthPercent = Math.max(0, fretEnd - fretStart);
                    return (
                  <button
                    key={`play-${dot.id}`}
                    type="button"
                    aria-label={`Tocar ${dot.noteName} na corda ${dot.stringId}, casa ${dot.fret}`}
                    title={`${dot.noteName} • corda ${dot.stringId} • casa ${dot.fret}`}
                    onPointerDown={(event) => onFretPointerDown(event, dot.stringId, dot.fret)}
                    onPointerEnter={() => onFretPointerEnter(dot.stringId, dot.fret)}
                    onClick={(event) => onFretClick(event, dot.stringId, dot.fret)}
                    className="group absolute z-[5] bg-transparent"
                    style={{
                      left: `${fretStart}%`,
                      width: `${widthPercent}%`,
                      top: `${dot.regionTop}%`,
                      height: `${dot.regionHeight}%`,
                    }}
                  >
                    <span className="pointer-events-none absolute inset-0 rounded-[2px] bg-cyan-300/18 opacity-0 transition group-hover:opacity-100" />
                  </button>
                    );
                  })()
                ))}

                {nutClickTargets.map((nut) => (
                  <button
                    key={nut.id}
                    type="button"
                    aria-label={`Tocar ${nut.noteName} na corda ${nut.stringId}, corda solta`}
                    title={`${nut.noteName} • corda ${nut.stringId} • casa 0`}
                    onPointerDown={(event) => onFretPointerDown(event, nut.stringId, 0)}
                    onPointerEnter={() => onFretPointerEnter(nut.stringId, 0)}
                    onClick={(event) => onFretClick(event, nut.stringId, 0)}
                    className="group absolute z-[8] bg-transparent"
                    style={{
                      left: `${-NUT_HOVER_EXPAND_LEFT_REM}rem`,
                      width: `${NUT_HOVER_TOTAL_WIDTH_REM}rem`,
                      top: `${nut.regionTop}%`,
                      height: `${nut.regionHeight}%`,
                    }}
                  >
                    <span className="pointer-events-none absolute inset-0 rounded-sm border border-cyan-300/35 bg-cyan-300/20 opacity-0 transition group-hover:opacity-100" />
                  </button>
                ))}

                {showAllNotes && fretboardNoteDots.map((dot) => (
                  <span
                    key={dot.id}
                    className={`pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded border px-1 py-0.5 text-[10px] font-semibold leading-none ${
                      dot.note.includes("#")
                        ? "border-slate-700 bg-black text-white"
                        : "border-slate-300 bg-white text-black"
                    }`}
                    style={{
                      left: `${dot.left}%`,
                      top: `${dot.top}%`,
                    }}
                  >
                    {dot.note}
                  </span>
                ))}
                {showHeatMapOnMainFretboard && heatMapDisplayMode !== "color" && fretboardNoteDots.map((dot, index) => {
                  const metricDot = heatMapDots[index];
                  if (!metricDot?.visible) return null;
                  const fretStart = fretSegmentStartPercent(dot.fret, visibleMaxFret);
                  const fretEnd = fretSegmentEndPercent(dot.fret, visibleMaxFret);
                  const widthPercent = Math.max(0, fretEnd - fretStart);
                  const showLabel = heatMapDisplayMode !== "color";
                  const useHeatColor = heatMapDisplayMode !== "number";
                  const isZeroLabel = metricDot.label === "0";
                  const isNoteEnabledForDraw = allowedPitchClasses.has(dot.note);
                  return (
                    <div
                      key={`heat-${dot.id}`}
                      className="pointer-events-none absolute z-10 flex items-center justify-center overflow-hidden"
                      style={{
                        left: `${fretStart}%`,
                        width: `${widthPercent}%`,
                        top: `${dot.regionTop}%`,
                        height: `${dot.regionHeight}%`,
                        opacity: isNoteEnabledForDraw ? 1 : 0.16,
                      }}
                    >
                      <span
                        className={`rounded border font-semibold leading-none ${
                          isZeroLabel ? "px-0.5 py-0 text-[8px]" : "px-1 py-[1px] text-[8px]"
                        }`}
                        style={{
                          backgroundColor: useHeatColor ? metricDot.background : "rgba(2, 6, 23, 0.75)",
                          borderColor: useHeatColor ? metricDot.border : "rgba(71, 85, 105, 0.7)",
                          color: useHeatColor ? metricDot.textColor : "rgba(226, 232, 240, 0.9)",
                          boxShadow: isNoteEnabledForDraw ? "-2px -2px 6px rgba(0, 0, 0, 0.42)" : "none",
                        }}
                      >
                        {showLabel ? metricDot.label : ""}
                      </span>
                    </div>
                  );
                })}

                {studyWindowStartPercent > 0 && (
                  <div
                    className="pointer-events-none absolute left-0 z-[15] bg-black/45"
                    style={{
                      width: `${studyWindowStartPercent}%`,
                      top: `${studyWindowTopPercent}%`,
                      height: `${Math.max(0, studyWindowBottomPercent - studyWindowTopPercent)}%`,
                    }}
                  />
                )}
                {studyWindowEndPercent < 100 && (
                  <div
                    className="pointer-events-none absolute right-0 z-[15] bg-black/45"
                    style={{
                      width: `${100 - studyWindowEndPercent}%`,
                      top: `${studyWindowTopPercent}%`,
                      height: `${Math.max(0, studyWindowBottomPercent - studyWindowTopPercent)}%`,
                    }}
                  />
                )}
                {studyWindowTopPercent > 0 && (
                  <div
                    className="pointer-events-none absolute inset-x-0 top-0 z-[15] bg-black/45"
                    style={{ height: `${studyWindowTopPercent}%` }}
                  />
                )}
                {studyWindowBottomPercent < 100 && (
                  <div
                    className="pointer-events-none absolute inset-x-0 bottom-0 z-[15] bg-black/45"
                    style={{ height: `${100 - studyWindowBottomPercent}%` }}
                  />
                )}

                {target && isRunning && (
                  <span
                    className="pointer-events-none absolute z-20 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-slate-100 bg-black shadow-[0_0_12px_rgba(241,245,249,0.45)]"
                    style={{
                      left: target.fret === 0 ? "0.1875rem" : `${fretSegmentCenterPercent(target.fret, visibleMaxFret)}%`,
                      top: `${stringTopPercent(target.stringIndex)}%`,
                    }}
                  />
                )}
                </div>
                <div className="pointer-events-none absolute inset-y-0 -right-5 w-4">
                  <div
                    ref={studyStringSliderTrackRef}
                    onPointerDown={onStudyStringTrackPointerDown}
                    className="pointer-events-auto absolute inset-y-1 left-1/2 w-4 -translate-x-1/2"
                  >
                    <div className="pointer-events-none absolute inset-y-0 left-1/2 w-[1px] -translate-x-1/2 bg-slate-700/70" />
                    <div
                      onPointerDown={onStudyStringWindowDragPointerDown}
                      className="pointer-events-auto absolute left-1/2 w-[8px] -translate-x-1/2 cursor-grab rounded bg-cyan-300/20 active:cursor-grabbing"
                      style={{
                        top: `${studyWindowTopPercent}%`,
                        height: `${Math.max(0, studyWindowBottomPercent - studyWindowTopPercent)}%`,
                      }}
                    />
                    {STRINGS.map((_, stringIndex) => (
                      <span
                        key={`string-snap-${stringIndex}`}
                        className="pointer-events-none absolute left-1/2 h-[1px] w-2 -translate-x-1/2 -translate-y-1/2 bg-slate-500/60"
                        style={{ top: `${stringTopPercent(stringIndex)}%` }}
                      />
                    ))}
                    <button
                      type="button"
                      aria-label="Início da janela vertical de estudo"
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        setDraggingStringThumb("min");
                      }}
                      className="absolute left-1/2 z-20 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-300/40 bg-cyan-400/10"
                      style={{ top: `${studyMinStringThumbPercent}%` }}
                    />
                    <button
                      type="button"
                      aria-label="Fim da janela vertical de estudo"
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        setDraggingStringThumb("max");
                      }}
                      className="absolute left-1/2 z-30 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-300/40 bg-cyan-400/10"
                      style={{ top: `${studyMaxStringThumbPercent}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="relative mt-3 h-8">
                {Array.from({ length: visibleMaxFret + 1 }, (_, fret) => (
                  <span
                    key={`label-${fret}`}
                    className="absolute top-0 -translate-x-1/2 rounded bg-slate-900/40 px-2 py-1 text-[10px] text-slate-500"
                    style={{ left: fretMarkerLeftStyle(fret, visibleMaxFret) }}
                  >
                    {fret}
                  </span>
                ))}
              </div>

              <div className="relative -mt-4 h-5 select-none">
                <div
                  className="absolute inset-y-0 left-0 right-0"
                  ref={studySliderTrackRef}
                  onPointerDown={onStudyTrackPointerDown}
                >
                  <div className="pointer-events-none absolute left-0 right-0 top-1/2 h-[1px] -translate-y-1/2 bg-slate-700/70" />
                  <div
                    onPointerDown={onStudyWindowDragPointerDown}
                    className="absolute top-1/2 h-[6px] -translate-y-1/2 cursor-grab rounded bg-cyan-300/20 active:cursor-grabbing"
                    style={{
                      left: `${studyMinThumbPercent}%`,
                      width: `${Math.max(0, studyMaxThumbPercent - studyMinThumbPercent)}%`,
                    }}
                  />
                  {Array.from({ length: visibleMaxFret + 1 }, (_, fret) => (
                    <span
                      key={`snap-${fret}`}
                      className="pointer-events-none absolute top-1/2 h-1.5 w-[1px] -translate-x-1/2 -translate-y-1/2 bg-slate-500/60"
                      style={{ left: `${fretSliderPercent(fret, visibleMaxFret)}%` }}
                    />
                  ))}
                  <button
                    type="button"
                    aria-label={`Início da janela de estudo: casa ${studyMinFret}`}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      setDraggingThumb("min");
                    }}
                    className="absolute top-1/2 z-20 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-300/40 bg-cyan-400/10"
                    style={{ left: `${studyMinThumbPercent}%` }}
                  />
                  <button
                    type="button"
                    aria-label={`Fim da janela de estudo: casa ${studyMaxFret}`}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      setDraggingThumb("max");
                    }}
                    className="absolute top-1/2 z-30 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-300/40 bg-cyan-400/10"
                    style={{ left: `${studyMaxThumbPercent}%` }}
                  />
                </div>
              </div>
          </div>
        </section>

        <section className="mt-3 rounded-2xl border border-cyan-300/20 bg-slate-900/70 p-3 md:p-4">
          <div className="space-y-2">
            {responsePadMode === "table" ? NOTE_FILTER_ROWS.map((row) => {
              const rowTheme = row.id === "natural"
                ? `border-slate-300 bg-white text-black hover:bg-slate-200 ${isShiftPressed ? "opacity-50" : ""}`
                : "border-slate-700 bg-black text-white hover:bg-slate-900";

              return (
                <div key={row.id} className="grid grid-cols-7 gap-2">
                  {row.notes.map((noteItem) => (
                    <button
                      key={`${row.id}-${noteItem.label}`}
                      type="button"
                      onClick={(event) => answerNote(noteItem.value, event.timeStamp)}
                      disabled={!isRunning || isAdvancing}
                      className={`h-10 rounded-lg border text-sm font-semibold transition ${rowTheme} disabled:cursor-not-allowed`}
                    >
                      {noteItem.label}
                    </button>
                  ))}
                </div>
              );
            }) : (
              <div className="relative mx-auto h-44 max-w-[400px] rounded-lg border border-slate-700 bg-slate-950/60 p-1.5">
                <div className="grid h-full grid-cols-7 gap-0">
                  {naturalRowNotes.map((noteItem) => (
                    <button
                      key={`natural-key-${noteItem.label}`}
                      type="button"
                      onClick={(event) => answerNote(noteItem.value, event.timeStamp)}
                      disabled={!isRunning || isAdvancing}
                      className={`flex h-full items-end justify-center rounded-none border border-slate-300 bg-white pb-2 text-sm font-semibold text-black transition hover:bg-slate-200 disabled:cursor-not-allowed first:rounded-l-sm last:rounded-r-sm ${isShiftPressed ? "opacity-50" : ""}`}
                    >
                      {noteItem.label}
                    </button>
                  ))}
                </div>
                <div className="pointer-events-none absolute inset-x-0 top-1 z-10 h-[64%]">
                  {[
                    { label: "C# / Db", value: "C#", left: 14.2857 },
                    { label: "D# / Eb", value: "D#", left: 28.5714 },
                    { label: "F# / Gb", value: "F#", left: 57.1428 },
                    { label: "G# / Ab", value: "G#", left: 71.4285 },
                    { label: "A# / Bb", value: "A#", left: 85.7142 },
                  ].map((noteItem) => {
                    const [sharpLabel, flatLabel] = noteItem.label.split(" / ");
                    return (
                      <button
                        key={`accidental-key-${noteItem.label}`}
                        type="button"
                        onClick={(event) => answerNote(noteItem.value, event.timeStamp)}
                        disabled={!isRunning || isAdvancing}
                        className="pointer-events-auto absolute flex h-full w-[8.6%] -translate-x-1/2 flex-col justify-between rounded-b-md rounded-t-sm border border-slate-700 bg-black px-1 pb-2 pt-1.5 text-[10px] font-semibold text-white transition hover:bg-slate-900 disabled:cursor-not-allowed"
                        style={{ left: `${noteItem.left}%` }}
                      >
                        <span className="text-[9px] leading-none text-slate-300">{flatLabel}</span>
                        <span className="leading-none">{sharpLabel}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {allowedPitchClasses.size === 0 && (
              <p className="text-xs text-rose-300">
                Ative ao menos um filtro de notas (Acidentes ou Naturais) para o sorteador.
              </p>
            )}
          </div>
        </section>

        <section className="mt-3 rounded-2xl border border-cyan-300/20 bg-slate-900/70 p-3 md:p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-cyan-100">
              Resultados
            </h2>
            <div className="flex flex-wrap items-center justify-end gap-2 text-xs text-slate-100">
              <span className="rounded border border-slate-600 bg-slate-800/70 px-2 py-1">
                Total: <strong>{regionTotals.total}</strong>
              </span>
              <span className="rounded border border-emerald-500/35 bg-emerald-500/15 px-2 py-1">
                Acertos: <strong>{regionTotals.correct}</strong> ({totalPercent.toFixed(0)}%)
              </span>
              <span className="rounded border border-rose-500/35 bg-rose-500/15 px-2 py-1">
                Erros: <strong>{regionTotals.wrong}</strong> ({wrongPercent.toFixed(0)}%)
              </span>
              <span className="rounded border border-cyan-500/35 bg-cyan-500/15 px-2 py-1">
                Tempo médio geral de acerto: <strong>{overallAvgCorrectSec === null ? "-" : `${overallAvgCorrectSec.toFixed(1)}s`}</strong>
              </span>
            </div>
          </div>
          {showHeatMapOnSecondaryFretboard && (
            <div className="mb-4">
              <div
                className="relative border border-amber-500/30 shadow-[0_10px_16px_rgba(0,0,0,0.45)] shadow-inner shadow-black/40"
                style={{
                  height: `${fretboardHeightPx}px`,
                  backgroundColor: "#4a2f1f",
                  backgroundImage: `
                    linear-gradient(90deg, rgba(25, 16, 11, 0.22) 0%, rgba(25, 16, 11, 0.08) 28%, rgba(25, 16, 11, 0.2) 52%, rgba(25, 16, 11, 0.09) 74%, rgba(25, 16, 11, 0.22) 100%),
                    repeating-linear-gradient(8deg, rgba(139, 94, 60, 0.22) 0px, rgba(139, 94, 60, 0.22) 6px, rgba(101, 66, 40, 0.18) 6px, rgba(101, 66, 40, 0.18) 12px),
                    repeating-linear-gradient(-3deg, rgba(178, 126, 82, 0.12) 0px, rgba(178, 126, 82, 0.12) 16px, rgba(90, 58, 35, 0.12) 16px, rgba(90, 58, 35, 0.12) 32px)
                  `,
                }}
              >
                <div className="pointer-events-none absolute inset-y-0 left-0 w-1.5 bg-slate-200/90" />
                {fretLinePercents.map((line) => (
                  <div key={`secondary-${line.fret}`}>
                    <div
                      className="pointer-events-none absolute inset-y-0 w-[10px]"
                      style={{
                        left: `calc(${line.percent}% - 10px)`,
                        background: "linear-gradient(to right, rgba(0,0,0,0) 0%, rgba(0,0,0,0.08) 55%, rgba(0,0,0,0.22) 100%)",
                      }}
                    />
                    <div
                      className="pointer-events-none absolute inset-y-0 w-[10px]"
                      style={{
                        left: `${line.percent}%`,
                        background: "linear-gradient(to right, rgba(0,0,0,0.22) 0%, rgba(0,0,0,0.08) 45%, rgba(0,0,0,0) 100%)",
                      }}
                    />
                    <div className="pointer-events-none absolute inset-y-0 w-[2px] bg-slate-200/65" style={{ left: `${line.percent}%` }} />
                  </div>
                ))}
                {inlays.map((inlay) => (
                  <div key={`secondary-inlay-${inlay.fret}`} className="pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: `${inlay.percent}%` }}>
                    {inlay.double ? (
                      <div className="flex flex-col gap-10">
                        <span className="h-3.5 w-3.5 rounded-full bg-slate-100/85" style={{ boxShadow: "inset -2px 2px 6px rgba(0,0,0,0.5)" }} />
                        <span className="h-3.5 w-3.5 rounded-full bg-slate-100/85" style={{ boxShadow: "inset -2px 2px 6px rgba(0,0,0,0.5)" }} />
                      </div>
                    ) : (
                      <span className="block h-3.5 w-3.5 rounded-full bg-slate-100/85" style={{ boxShadow: "inset -2px 2px 6px rgba(0,0,0,0.5)" }} />
                    )}
                  </div>
                ))}
                {STRINGS.map((stringItem, index) => {
                  const top = stringTopPercent(index);
                  const thickness = STRING_VISUAL_THICKNESS[stringItem.id] ?? 2;
                  return (
                    <div key={`secondary-string-${stringItem.id}`}>
                      <div
                        className="pointer-events-none absolute left-0 right-0"
                        style={{
                          top: `${top}%`,
                          height: `${thickness}px`,
                          transform: "translateY(-50%)",
                          background: "repeating-linear-gradient(-45deg, rgba(78,94,117,0.74) 0px, rgba(78,94,117,0.74) 0.85px, rgba(20,31,49,0.95) 0.85px, rgba(20,31,49,0.95) 1.7px)",
                          boxShadow: "0 -4px 11px rgba(0, 0, 0, 0.88)",
                          borderRadius: "999px",
                        }}
                      />
                    </div>
                  );
                })}
                {heatMapDisplayMode === "color" && fretboardNoteDots.map((dot, index) => {
                  const metricDot = heatMapDots[index];
                  if (!metricDot?.visible) return null;
                  if (metricDot.label === "0" || metricDot.label === "x") return null;
                  const fretStart = fretSegmentStartPercent(dot.fret, visibleMaxFret);
                  const fretEnd = fretSegmentEndPercent(dot.fret, visibleMaxFret);
                  const cellWidthPercent = Math.max(0, fretEnd - fretStart);
                  const paintWidthPercent = cellWidthPercent * 0.78;
                  const paintLeftPercent = fretStart + (cellWidthPercent - paintWidthPercent) / 2;
                  const paintHeightPercent = Math.max(2.2, dot.regionHeight * 0.4);
                  const paintTopPercent = dot.top - paintHeightPercent / 2;
                  return (
                    <div
                      key={`secondary-heat-color-${dot.id}`}
                      className="pointer-events-none absolute z-[1]"
                      style={{
                        left: `${paintLeftPercent}%`,
                        width: `${paintWidthPercent}%`,
                        top: `${paintTopPercent}%`,
                        height: `${paintHeightPercent}%`,
                        borderRadius: "999px",
                        background: `linear-gradient(to right, transparent 0%, ${metricDot.background} 22%, ${metricDot.background} 78%, transparent 100%)`,
                        filter: "blur(1px)",
                        opacity: 0.3,
                      }}
                    />
                  );
                })}
                {heatMapDisplayMode !== "color" && fretboardNoteDots.map((dot, index) => {
                  const metricDot = heatMapDots[index];
                  if (!metricDot?.visible) return null;
                  const fretStart = fretSegmentStartPercent(dot.fret, visibleMaxFret);
                  const fretEnd = fretSegmentEndPercent(dot.fret, visibleMaxFret);
                  const widthPercent = Math.max(0, fretEnd - fretStart);
                  const showLabel = heatMapDisplayMode !== "color";
                  const useHeatColor = heatMapDisplayMode !== "number";
                  const isZeroLabel = metricDot.label === "0";
                  const isNoteEnabledForDraw = allowedPitchClasses.has(dot.note);
                  return (
                    <div
                      key={`secondary-heat-${dot.id}`}
                      className="pointer-events-none absolute z-10 flex items-center justify-center overflow-hidden"
                      style={{
                        left: `${fretStart}%`,
                        width: `${widthPercent}%`,
                        top: `${dot.regionTop}%`,
                        height: `${dot.regionHeight}%`,
                        opacity: isNoteEnabledForDraw ? 1 : 0.16,
                      }}
                    >
                      <span
                        className={`rounded border font-semibold leading-none ${isZeroLabel ? "px-0.5 py-0 text-[8px]" : "px-1 py-[1px] text-[8px]"}`}
                        style={{
                          backgroundColor: useHeatColor ? metricDot.background : "rgba(2, 6, 23, 0.75)",
                          borderColor: useHeatColor ? metricDot.border : "rgba(71, 85, 105, 0.7)",
                          color: useHeatColor ? metricDot.textColor : "rgba(226, 232, 240, 0.9)",
                          boxShadow: isNoteEnabledForDraw ? "-2px -2px 6px rgba(0, 0, 0, 0.42)" : "none",
                        }}
                      >
                        {showLabel ? metricDot.label : ""}
                      </span>
                    </div>
                  );
                })}
                {studyWindowStartPercent > 0 && (
                  <div
                    className="pointer-events-none absolute left-0 z-[15] bg-black/45"
                    style={{
                      width: `${studyWindowStartPercent}%`,
                      top: `${studyWindowTopPercent}%`,
                      height: `${Math.max(0, studyWindowBottomPercent - studyWindowTopPercent)}%`,
                    }}
                  />
                )}
                {studyWindowEndPercent < 100 && (
                  <div
                    className="pointer-events-none absolute right-0 z-[15] bg-black/45"
                    style={{
                      width: `${100 - studyWindowEndPercent}%`,
                      top: `${studyWindowTopPercent}%`,
                      height: `${Math.max(0, studyWindowBottomPercent - studyWindowTopPercent)}%`,
                    }}
                  />
                )}
                {studyWindowTopPercent > 0 && (
                  <div
                    className="pointer-events-none absolute inset-x-0 top-0 z-[15] bg-black/45"
                    style={{ height: `${studyWindowTopPercent}%` }}
                  />
                )}
                {studyWindowBottomPercent < 100 && (
                  <div
                    className="pointer-events-none absolute inset-x-0 bottom-0 z-[15] bg-black/45"
                    style={{ height: `${100 - studyWindowBottomPercent}%` }}
                  />
                )}
              </div>
            </div>
          )}
          <div className="rounded-xl border border-cyan-300/20 bg-slate-950/55 p-2 md:p-3">
            <div className="overflow-x-auto">
              <table className="mx-auto min-w-[980px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-2 py-2">Corda</th>
                  <th className="px-2 py-2">Casa</th>
                  <th className="px-2 py-2">Nota</th>
                  <th className="px-2 py-2">Qtd. de testes</th>
                  <th className="px-2 py-2">Acertos</th>
                  <th className="px-2 py-2">Erros</th>
                  <th className="px-2 py-2">% de acerto</th>
                  <th className="px-2 py-2">Últ. 5 acertos</th>
                  <th className="px-2 py-2">Tempo médio de acerto (últ. 5)</th>
                </tr>
              </thead>
              <tbody>
                {statsRows.map((row) => {
                  const avgMs = getRecentCorrectAverageMs(row);
                  const avgSec = avgMs === null ? null : avgMs / 1000;
                  const recentTimes = Array.isArray(row.recentCorrectTimesMs)
                    ? row.recentCorrectTimesMs.slice(-RECENT_CORRECT_WINDOW).reverse()
                    : [];
                  const testsScore = maxTests > 0 ? row.tests / maxTests : 0;
                  const testsColor = heatmapColorFromScore(testsScore, row.tests === 0);
                  const accuracyRatio = row.tests > 0 ? row.correct / row.tests : null;
                  const accuracyColor = accuracyRatio === null
                    ? heatmapColorFromScore(0, true)
                    : heatmapColorFromScore(accuracyRatio, accuracyRatio === 0);
                  const timeCellColor = avgSec === null
                    ? heatmapColorFromScore(0, true)
                    : responseTimeHeatColor(avgSec);
                  return (
                    <tr key={row.id} className="border-b border-slate-800/80 text-slate-200">
                      <td className="px-2 py-2">{row.stringLabel}</td>
                      <td className="px-2 py-2">{row.fret}</td>
                      <td className="px-2 py-2">{row.note}</td>
                      <td className="px-2 py-2">
                        <span
                          className="inline-flex rounded border px-1.5 py-0.5 text-xs font-semibold leading-none"
                          style={{
                            backgroundColor: testsColor.background,
                            borderColor: testsColor.border,
                            color: testsColor.textColor,
                          }}
                        >
                          {row.tests}
                        </span>
                      </td>
                      <td className="px-2 py-2">{row.correct}</td>
                      <td className="px-2 py-2">{row.wrong}</td>
                      <td className="px-2 py-2">
                        <span
                          className="inline-flex rounded border px-1.5 py-0.5 text-xs font-semibold leading-none"
                          style={{
                            backgroundColor: accuracyColor.background,
                            borderColor: accuracyColor.border,
                            color: accuracyColor.textColor,
                          }}
                        >
                          {accuracyRatio === null ? "-" : `${Math.round(accuracyRatio * 100)}%`}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-xs text-slate-300">
                        {recentTimes.length === 0 ? (
                          "-"
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {recentTimes.map((value, index) => {
                              const recentSec = value / 1000;
                              const recentColor = responseTimeHeatColor(recentSec);
                              return (
                                <span
                                  key={`${row.id}-recent-${index}`}
                                  className="inline-flex rounded border px-1 py-0.5 text-[10px] font-semibold leading-none"
                                  style={{
                                    backgroundColor: recentColor.background,
                                    borderColor: recentColor.border,
                                    color: recentColor.textColor,
                                  }}
                                >
                                  {recentSec.toFixed(1)}s
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <span
                          className="inline-flex rounded border px-1.5 py-0.5 text-xs font-semibold leading-none"
                          style={{
                            backgroundColor: timeCellColor.background,
                            borderColor: timeCellColor.border,
                            color: timeCellColor.textColor,
                          }}
                        >
                          {avgSec === null ? "-" : `${avgSec.toFixed(1)}s`}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              </table>
            </div>
          </div>
        </section>

      </main>
      {showGoogleConnectSuggestionModal && !googleDriveConnected && (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center bg-black/70 px-3"
          onClick={() => setShowGoogleConnectSuggestionModal(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Conectar conta Google"
            className="w-full max-w-md rounded-xl border border-cyan-400/30 bg-slate-900/95 p-4 shadow-2xl shadow-black/70"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-cyan-100">Ative o salvamento automático</h3>
            <p className="mt-2 text-xs text-slate-300">
              Conecte sua conta do Google para ativar o backup automático no Google Drive e evitar perda de progresso.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowGoogleConnectSuggestionModal(false)}
                className="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-[11px] text-slate-200 transition hover:bg-slate-700"
              >
                Agora não
              </button>
              <button
                type="button"
                onClick={startGoogleOAuth}
                className="rounded border border-cyan-400/50 bg-cyan-500/20 px-2 py-1 text-[11px] font-semibold text-cyan-100 transition hover:bg-cyan-500/30"
              >
                Conectar conta Google
              </button>
            </div>
          </div>
        </div>
      )}
      {showDrawRulesModal && (
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center bg-black/70 px-3 pt-8"
          onClick={() => {
            setShowDrawRulesModal(false);
            setShowResetSettingsConfirmModal(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Configurações"
            className="w-full max-w-4xl rounded-xl border border-cyan-300/30 bg-slate-900/95 p-4 shadow-2xl shadow-black/70"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-cyan-100">Configurações</h2>
              <button
                type="button"
                onClick={() => {
                  setShowDrawRulesModal(false);
                  setShowResetSettingsConfirmModal(false);
                }}
                className="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-[11px] text-slate-200 transition hover:bg-slate-700"
              >
                Fechar
              </button>
            </div>
            <div className="flex gap-3">
              <aside className="flex w-52 shrink-0 flex-col rounded-lg border border-slate-700 bg-slate-950/70 p-2">
                <button
                  type="button"
                  onClick={() => setSettingsTab("draw-rules")}
                  className={`mb-1 w-full rounded px-2 py-1 text-left text-xs transition ${
                    settingsTab === "draw-rules"
                      ? "border border-cyan-300/40 bg-cyan-400/10 text-cyan-100"
                      : "border border-slate-700 bg-slate-900/60 text-slate-300 hover:bg-slate-800/60"
                  }`}
                >
                  Regras de Sorteio
                </button>
                <button
                  type="button"
                  onClick={() => setSettingsTab("fretboard")}
                  className={`w-full rounded px-2 py-1 text-left text-xs transition ${
                    settingsTab === "fretboard"
                      ? "border border-cyan-300/40 bg-cyan-400/10 text-cyan-100"
                      : "border border-slate-700 bg-slate-900/60 text-slate-300 hover:bg-slate-800/60"
                  }`}
                >
                  Braço
                </button>
                <button
                  type="button"
                  onClick={() => setSettingsTab("response-pad")}
                  className={`mt-1 w-full rounded px-2 py-1 text-left text-xs transition ${
                    settingsTab === "response-pad"
                      ? "border border-cyan-300/40 bg-cyan-400/10 text-cyan-100"
                      : "border border-slate-700 bg-slate-900/60 text-slate-300 hover:bg-slate-800/60"
                  }`}
                >
                  Pad de Resposta
                </button>
                <button
                  type="button"
                  onClick={() => setSettingsTab("performance-map")}
                  className={`mt-1 w-full rounded px-2 py-1 text-left text-xs transition ${
                    settingsTab === "performance-map"
                      ? "border border-cyan-300/40 bg-cyan-400/10 text-cyan-100"
                      : "border border-slate-700 bg-slate-900/60 text-slate-300 hover:bg-slate-800/60"
                  }`}
                >
                  Mapa de Desempenho
                </button>
                <button
                  type="button"
                  onClick={() => setSettingsTab("sound")}
                  className={`mt-1 w-full rounded px-2 py-1 text-left text-xs transition ${
                    settingsTab === "sound"
                      ? "border border-cyan-300/40 bg-cyan-400/10 text-cyan-100"
                      : "border border-slate-700 bg-slate-900/60 text-slate-300 hover:bg-slate-800/60"
                  }`}
                >
                  Som
                </button>
                <button
                  type="button"
                  onClick={() => setSettingsTab("auto-save")}
                  className={`mt-1 w-full rounded px-2 py-1 text-left text-xs transition ${
                    settingsTab === "auto-save"
                      ? "border border-cyan-300/40 bg-cyan-400/10 text-cyan-100"
                      : "border border-slate-700 bg-slate-900/60 text-slate-300 hover:bg-slate-800/60"
                  }`}
                >
                  Salvamento automático
                </button>
                <button
                  type="button"
                  onClick={() => setShowResetSettingsConfirmModal(true)}
                  className="mt-3 rounded border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-left text-xs text-rose-200 transition hover:bg-rose-500/20"
                >
                  Redefinir configurações
                </button>
              </aside>
              <div className="min-h-[260px] flex-1 rounded-lg border border-slate-700 bg-slate-950/50 p-3">
                {settingsTab === "draw-rules" && (
                  <div className="space-y-2">
                    <label className="flex cursor-pointer items-start gap-2 rounded border border-slate-700 bg-slate-950/60 px-2 py-1.5 text-xs text-slate-200">
                      <input
                        type="checkbox"
                        checked={drawRules.avoidImmediateRepeat}
                        onChange={(event) => {
                          setDrawRules((current) => ({ ...current, avoidImmediateRepeat: event.target.checked }));
                        }}
                        className="mt-[2px]"
                      />
                      Nunca sortear a mesma nota em sequência.
                    </label>
                    <label className="flex items-start gap-2 rounded border border-slate-700 bg-slate-950/60 px-2 py-1.5 text-xs text-slate-200">
                      <input
                        type="checkbox"
                        checked={drawRules.top10ByResponseAfterCoverage}
                        onChange={(event) => {
                          setDrawRules((current) => ({ ...current, top10ByResponseAfterCoverage: event.target.checked }));
                        }}
                        className="mt-[2px]"
                      />
                      <span className="flex flex-wrap items-center gap-1">
                        <span>Em</span>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={1}
                          value={drawRules.topResponseBiasPercent}
                          onChange={(event) => {
                            const parsed = Number.parseInt(event.target.value, 10);
                            if (!Number.isFinite(parsed)) {
                              setDrawRules((current) => ({
                                ...current,
                                topResponseBiasPercent: DEFAULT_DRAW_RULES.topResponseBiasPercent,
                              }));
                              return;
                            }
                            const bounded = Math.max(0, Math.min(100, parsed));
                            setDrawRules((current) => ({ ...current, topResponseBiasPercent: bounded }));
                          }}
                          className="h-6 w-14 rounded border border-cyan-300/30 bg-slate-950/75 px-1 text-[11px] text-cyan-100 outline-none"
                        />
                        <span>% das vezes, sortear apenas entre as</span>
                        <input
                          type="number"
                          min={1}
                          max={200}
                          step={1}
                          value={drawRules.topResponsePoolSize}
                          onChange={(event) => {
                            const parsed = Number.parseInt(event.target.value, 10);
                            if (!Number.isFinite(parsed)) {
                              setDrawRules((current) => ({
                                ...current,
                                topResponsePoolSize: DEFAULT_DRAW_RULES.topResponsePoolSize,
                              }));
                              return;
                            }
                            const bounded = Math.max(1, Math.min(200, parsed));
                            setDrawRules((current) => ({ ...current, topResponsePoolSize: bounded }));
                          }}
                          className="h-6 w-14 rounded border border-cyan-300/30 bg-slate-950/75 px-1 text-[11px] text-cyan-100 outline-none"
                        />
                        <span>
                          notas com maior tempo de resposta.
                        </span>
                      </span>
                    </label>
                    <label className="flex cursor-pointer items-start gap-2 rounded border border-slate-700 bg-slate-950/60 px-2 py-1.5 text-xs text-slate-200">
                      <input
                        type="checkbox"
                        checked={drawRules.prioritizeNeverCorrect}
                        onChange={(event) => {
                          setDrawRules((current) => ({ ...current, prioritizeNeverCorrect: event.target.checked }));
                        }}
                        className="mt-[2px]"
                      />
                      Priorizar notas que ainda não tiveram nenhum acerto.
                    </label>
                    <label className="flex cursor-pointer items-start gap-2 rounded border border-slate-700 bg-slate-950/60 px-2 py-1.5 text-xs text-slate-200">
                      <input
                        type="checkbox"
                        checked={drawRules.avoidSequentialOctaves}
                        onChange={(event) => {
                          setDrawRules((current) => ({ ...current, avoidSequentialOctaves: event.target.checked }));
                        }}
                        className="mt-[2px]"
                      />
                      Não sortear oitavas em sequência.
                    </label>
                    <label className="flex cursor-pointer items-start gap-2 rounded border border-slate-700 bg-slate-950/60 px-2 py-1.5 text-xs text-slate-200">
                      <input
                        type="checkbox"
                        checked={enabledNoteRows.natural}
                        onChange={(event) => {
                          setEnabledNoteRows((current) => ({ ...current, natural: event.target.checked }));
                        }}
                        className="mt-[2px]"
                      />
                      Sortear notas naturais
                    </label>
                    <label className="flex cursor-pointer items-start gap-2 rounded border border-slate-700 bg-slate-950/60 px-2 py-1.5 text-xs text-slate-200">
                      <input
                        type="checkbox"
                        checked={enabledNoteRows.accidental}
                        onChange={(event) => {
                          setEnabledNoteRows((current) => ({ ...current, accidental: event.target.checked }));
                        }}
                        className="mt-[2px]"
                      />
                      Sortear notas acidentais
                    </label>
                    <div className="flex items-center gap-2 rounded border border-slate-700 bg-slate-950/60 px-2 py-1.5 text-xs text-slate-200">
                      <label className="flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={drawRules.insistOnError}
                          onChange={(event) => {
                            const checked = event.target.checked;
                            setDrawRules((current) => ({ ...current, insistOnError: checked }));
                            if (!checked) {
                              setRetryContext({ targetId: null, wrongRepeatsDone: 0 });
                            }
                          }}
                        />
                        Insistir no erro
                      </label>
                      <select
                        value={errorRetryMode}
                        onChange={(event) => setErrorRetryMode(event.target.value)}
                        disabled={!drawRules.insistOnError}
                        className="rounded border border-cyan-300/30 bg-slate-950/75 px-1.5 py-0.5 text-[10px] text-cyan-100 outline-none disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <option value="1">1 vez</option>
                        <option value="2">2 vezes</option>
                        <option value="3">3 vezes</option>
                        <option value="until-correct">até acertar</option>
                      </select>
                    </div>
                  </div>
                )}

                {settingsTab === "fretboard" && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 rounded border border-slate-700 bg-slate-950/60 px-2 py-1.5 text-xs text-slate-200">
                      <span>Comprimento</span>
                      <select
                        value={visibleMaxFret}
                        onChange={(event) => {
                          const next = Number.parseInt(event.target.value, 10);
                          if (!Number.isFinite(next)) return;
                          const bounded = Math.max(MIN_VISIBLE_FRET, Math.min(MAX_FRET, next));
                          setVisibleMaxFret(bounded);
                        }}
                        className="rounded border border-cyan-300/30 bg-slate-950/75 px-1.5 py-0.5 text-[10px] text-cyan-100 outline-none"
                      >
                        {Array.from(
                          { length: MAX_FRET - MIN_VISIBLE_FRET + 1 },
                          (_, index) => MIN_VISIBLE_FRET + index,
                        ).map((fret) => (
                          <option key={`visible-modal-${fret}`} value={fret}>
                            {fret}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center gap-2 rounded border border-slate-700 bg-slate-950/60 px-2 py-1.5 text-xs text-slate-200">
                      <span>Largura</span>
                      <select
                        value={fretboardHeightPreset}
                        onChange={(event) => setFretboardHeightPreset(event.target.value)}
                        className="rounded border border-cyan-300/30 bg-slate-950/75 px-1.5 py-0.5 text-[10px] text-cyan-100 outline-none"
                      >
                        <option value="narrow">Estreito</option>
                        <option value="medium">Médio</option>
                        <option value="wide">Largo</option>
                        <option value="extra-wide">Extra largo</option>
                      </select>
                    </div>
                  </div>
                )}

                {settingsTab === "response-pad" && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 rounded border border-slate-700 bg-slate-950/60 px-2 py-1.5 text-xs text-slate-200">
                      <span>Formato do pad</span>
                      <select
                        value={responsePadMode}
                        onChange={(event) => setResponsePadMode(event.target.value)}
                        className="rounded border border-cyan-300/30 bg-slate-950/75 px-1.5 py-0.5 text-[10px] text-cyan-100 outline-none"
                      >
                        <option value="table">Tabela</option>
                        <option value="keyboard">Teclado</option>
                      </select>
                    </div>
                  </div>
                )}

                {settingsTab === "performance-map" && (
                  <div className="space-y-2">
                    <label className="flex cursor-pointer items-center gap-2 rounded border border-slate-700 bg-slate-950/60 px-2 py-1.5 text-xs text-slate-200">
                      <input
                        type="checkbox"
                        checked={showPerformanceHeatMap}
                        onChange={(event) => {
                          const next = event.target.checked;
                          setShowPerformanceHeatMap(next);
                          if (next) setShowAllNotes(false);
                        }}
                      />
                      Mostrar mapa
                    </label>
                    <div className="flex items-center gap-2 rounded border border-slate-700 bg-slate-950/60 px-2 py-1.5 text-xs text-slate-200">
                      <span>Tipo de resultado</span>
                      <select
                        value={heatMapMetric}
                        onChange={(event) => setHeatMapMetric(event.target.value)}
                        className="rounded border border-cyan-300/30 bg-slate-950/75 px-1.5 py-0.5 text-[10px] text-cyan-100 outline-none"
                      >
                        <option value="tests">Testes</option>
                        <option value="accuracy">% Acerto</option>
                        <option value="responseTime">Tempo méd.</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-2 rounded border border-slate-700 bg-slate-950/60 px-2 py-1.5 text-xs text-slate-200">
                      <span>Formato</span>
                      <select
                        value={heatMapDisplayMode}
                        onChange={(event) => setHeatMapDisplayMode(event.target.value)}
                        className="rounded border border-cyan-300/30 bg-slate-950/75 px-1.5 py-0.5 text-[10px] text-cyan-100 outline-none"
                      >
                        <option value="number-color">Número e cor</option>
                        <option value="number">Número</option>
                        <option value="color">Cor</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-2 rounded border border-slate-700 bg-slate-950/60 px-2 py-1.5 text-xs text-slate-200">
                      <span>Localização</span>
                      <select
                        value={heatMapPlacement}
                        onChange={(event) => setHeatMapPlacement(event.target.value)}
                        className="rounded border border-cyan-300/30 bg-slate-950/75 px-1.5 py-0.5 text-[10px] text-cyan-100 outline-none"
                      >
                        <option value="overlay">Mesmo braço</option>
                        <option value="separate">Outro braço</option>
                      </select>
                    </div>
                  </div>
                )}

                {settingsTab === "sound" && (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2 rounded border border-slate-700 bg-slate-950/60 px-2 py-1.5 text-xs text-slate-200">
                      <span>Samples:</span>
                      <select
                        value={sampleProfile}
                        onChange={(event) => setSampleProfile(event.target.value)}
                        className="rounded border border-cyan-300/30 bg-slate-950/75 px-1.5 py-0.5 text-[10px] text-cyan-100 outline-none"
                      >
                        {SAMPLE_PROFILE_OPTIONS.map((profile) => (
                          <option key={profile.id} value={profile.id}>
                            {profile.label}
                          </option>
                        ))}
                      </select>
                      {SAMPLE_PROFILE_OPTIONS.filter((profile) => profile.id === sampleProfile).map((profile) => (
                        <a
                          key={`sample-source-${profile.id}`}
                          href={profile.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-cyan-300 underline underline-offset-2 hover:text-cyan-200"
                        >
                          {profile.sourceLabel}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
                {settingsTab === "auto-save" && (
                  <div className="space-y-2">
                    <div className="space-y-2 rounded border border-slate-700 bg-slate-950/60 px-2 py-2 text-xs text-slate-200">
                      <div className="flex flex-wrap items-center gap-2">
                        <span>Google Drive:</span>
                        <span className={`rounded px-1.5 py-0.5 text-[10px] ${googleDriveConnected ? "bg-emerald-500/20 text-emerald-200" : "bg-slate-700/60 text-slate-300"}`}>
                          {googleDriveConnected ? "Conectado" : "Desconectado"}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={startGoogleOAuth}
                          disabled={isDriveSyncBusy}
                          className="rounded border border-cyan-400/40 bg-cyan-500/20 px-2 py-1 text-[10px] font-semibold text-cyan-100 transition hover:bg-cyan-500/30 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {googleDriveConnected ? "Reconectar conta Google" : "Conectar conta Google"}
                        </button>
                        <button
                          type="button"
                          onClick={() => pullStateFromDrive(true)}
                          disabled={!googleDriveConnected || isDriveSyncBusy}
                          className="rounded border border-slate-500/50 bg-slate-800 px-2 py-1 text-[10px] text-slate-200 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Baixar backup do Drive
                        </button>
                        <button
                          type="button"
                          onClick={() => pushStateToDrive(null, true)}
                          disabled={!googleDriveConnected || isDriveSyncBusy}
                          className="rounded border border-slate-500/50 bg-slate-800 px-2 py-1 text-[10px] text-slate-200 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Salvar backup no Drive
                        </button>
                        <button
                          type="button"
                          onClick={disconnectGoogleDrive}
                          disabled={!googleDriveConnected || isDriveSyncBusy}
                          className="rounded border border-rose-500/40 bg-rose-500/15 px-2 py-1 text-[10px] text-rose-100 transition hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Desconectar
                        </button>
                      </div>
                      <p className="text-[10px] text-slate-400">
                        Sincronizacao automatica ativa quando conectado.
                      </p>
                      {driveSyncMessage ? (
                        <p className="text-[10px] text-cyan-200">{driveSyncMessage}</p>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {showResetSettingsConfirmModal && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 px-3"
          onClick={() => setShowResetSettingsConfirmModal(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Confirmar redefinição de configurações"
            className="w-full max-w-md rounded-xl border border-rose-400/30 bg-slate-900/95 p-4 shadow-2xl shadow-black/70"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-rose-200">Redefinir configurações</h3>
            <p className="mt-2 text-xs text-slate-300">
              Deseja redefinir todas as configurações para os valores padrão?
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowResetSettingsConfirmModal(false)}
                className="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-[11px] text-slate-200 transition hover:bg-slate-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  resetSettingsToDefaults();
                  setShowResetSettingsConfirmModal(false);
                }}
                className="rounded border border-rose-500/50 bg-rose-500/20 px-2 py-1 text-[11px] text-rose-100 transition hover:bg-rose-500/30"
              >
                Redefinir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
