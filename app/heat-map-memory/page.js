"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const CHROMATIC_NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
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
      });
    }
  }
  return rows;
}

function fretPositionPercent(fretNumber, maxFret = MAX_FRET) {
  // Equal temperament: position from nut = 1 - 2^(-n/12), normalized to fret 24 = 100%.
  const raw = 1 - 2 ** (-fretNumber / 12);
  const rawMax = 1 - 2 ** (-maxFret / 12);
  return (raw / rawMax) * 100;
}

function fretSegmentCenterPercent(fret, maxFret = MAX_FRET) {
  if (fret === 0) return fretPositionPercent(1, maxFret) / 2;
  return (fretPositionPercent(fret - 1, maxFret) + fretPositionPercent(fret, maxFret)) / 2;
}

function fretSegmentStartPercent(fret, maxFret = MAX_FRET) {
  if (fret <= 0) return 0;
  return fretPositionPercent(fret - 1, maxFret);
}

function fretSegmentEndPercent(fret, maxFret = MAX_FRET) {
  if (fret <= 0) return fretPositionPercent(1, maxFret);
  return fretPositionPercent(fret, maxFret);
}

function fretMarkerLeftStyle(fret, maxFret = MAX_FRET) {
  return fret === 0 ? "0.1875rem" : `${fretSegmentCenterPercent(fret, maxFret)}%`;
}

function fretSliderPercent(fret, maxFret = MAX_FRET) {
  if (fret <= 0) return 0;
  return fretPositionPercent(fret, maxFret);
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

function midiToFrequency(midi) {
  return 440 * (2 ** ((midi - 69) / 12));
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

function closestSampleForMidi(targetMidi) {
  let closest = SAMPLE_LIBRARY[0] || null;
  let closestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < SAMPLE_LIBRARY.length; index += 1) {
    const candidate = SAMPLE_LIBRARY[index];
    const distance = Math.abs(candidate.midi - targetMidi);
    if (distance < closestDistance) {
      closest = candidate;
      closestDistance = distance;
    }
  }
  return closest;
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

function waitMs(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function pickRandomTarget(minFret, maxFret, previousId = null) {
  const boundedMin = Math.max(0, Math.min(MAX_FRET, minFret));
  const boundedMax = Math.max(boundedMin, Math.min(MAX_FRET, maxFret));
  const fretCount = boundedMax - boundedMin + 1;
  const maxIndex = STRINGS.length * fretCount;
  if (maxIndex <= 1 || fretCount <= 0) {
    return { stringIndex: 0, fret: 0, id: "e-0" };
  }

  let next = null;
  do {
    const index = Math.floor(Math.random() * maxIndex);
    const stringIndex = Math.floor(index / fretCount);
    const fret = boundedMin + (index % fretCount);
    const stringItem = STRINGS[stringIndex];
    next = { stringIndex, fret, id: `${stringItem.id}-${fret}` };
  } while (next.id === previousId);
  return next;
}

export default function HeatMapMemoryPage() {
  const [isRunning, setIsRunning] = useState(false);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [showAllNotes, setShowAllNotes] = useState(false);
  const [showPerformanceHeatMap, setShowPerformanceHeatMap] = useState(false);
  const [heatMapMetric, setHeatMapMetric] = useState("tests");
  const [visibleMaxFret, setVisibleMaxFret] = useState(MAX_FRET);
  const [studyMinFret, setStudyMinFret] = useState(0);
  const [studyMaxFret, setStudyMaxFret] = useState(MAX_FRET);
  const [target, setTarget] = useState(null);
  const [questionStartMs, setQuestionStartMs] = useState(0);
  const [statsRows, setStatsRows] = useState(buildInitialStats);
  const [totals, setTotals] = useState({ total: 0, correct: 0, wrong: 0 });
  const [draggingThumb, setDraggingThumb] = useState(null);
  const gameTokenRef = useRef(0);
  const audioContextRef = useRef(null);
  const sampleBuffersRef = useRef(new Map());
  const sampleLoadingRef = useRef(new Map());
  const studySliderTrackRef = useRef(null);

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
    () => fretSegmentStartPercent(studyMinFret, visibleMaxFret),
    [studyMinFret, visibleMaxFret],
  );
  const studyWindowEndPercent = useMemo(
    () => fretSegmentEndPercent(studyMaxFret, visibleMaxFret),
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
  const heatMapDots = useMemo(() => {
    const responseTimes = statsRows
      .filter((row) => row.correct > 0)
      .map((row) => row.correctTimeMsTotal / row.correct / 1000);
    const minResponseSec = responseTimes.length > 0 ? Math.min(...responseTimes) : null;
    const maxResponseSec = responseTimes.length > 0 ? Math.max(...responseTimes) : null;

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

      const avgSec = row.correctTimeMsTotal / row.correct / 1000;
      let normalized = 1;
      if (minResponseSec !== null && maxResponseSec !== null && maxResponseSec > minResponseSec) {
        normalized = 1 - (avgSec - minResponseSec) / (maxResponseSec - minResponseSec);
      }
      const colors = heatmapColorFromScore(Math.max(0, Math.min(1, normalized)), false);
      return { id: dot.id, label: `${avgSec.toFixed(1)}s`, visible: true, ...colors };
    });
  }, [fretboardNoteDots, heatMapMetric, maxTests, statsById, statsRows]);

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

    if (sampleBuffersRef.current.has(sampleInfo.noteName)) {
      return sampleBuffersRef.current.get(sampleInfo.noteName);
    }

    if (sampleLoadingRef.current.has(sampleInfo.noteName)) {
      return sampleLoadingRef.current.get(sampleInfo.noteName);
    }

    const loadingPromise = (async () => {
      const context = await getAudioContext();
      if (!context) return null;
      const response = await fetch(sampleInfo.src);
      if (!response.ok) throw new Error(`Failed sample: ${sampleInfo.src}`);
      const arrayBuffer = await response.arrayBuffer();
      const decoded = await context.decodeAudioData(arrayBuffer.slice(0));
      sampleBuffersRef.current.set(sampleInfo.noteName, decoded);
      return decoded;
    })().finally(() => {
      sampleLoadingRef.current.delete(sampleInfo.noteName);
    });

    sampleLoadingRef.current.set(sampleInfo.noteName, loadingPromise);
    return loadingPromise;
  }, [getAudioContext]);

  const playPromptNote = useCallback(async (stringId, fret) => {
    const context = await getAudioContext();
    if (!context) return;

    const target = positionPitch(stringId, fret);
    const sample = closestSampleForMidi(target.midi);
    const hasExactSample = Boolean(sample && sample.midi === target.midi);
    const fallbackLevel = hasExactSample ? 0 : 1;

    try {
      const buffer = await getSampleBuffer(sample);
      if (!buffer || !sample) throw new Error("No sample buffer available");

      const source = context.createBufferSource();
      source.buffer = buffer;
      const playbackRate = 2 ** ((target.midi - sample.midi) / 12);
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
          `[heat-map-memory][audio] fallback=none target=${target.noteName} sample=${sample.noteName} rate=${playbackRate.toFixed(4)}`,
        );
      } else {
        console.info(
          `[heat-map-memory][audio] fallback=1(pitch-shift) target=${target.noteName} sample=${sample.noteName} rate=${playbackRate.toFixed(4)}`,
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
    gameTokenRef.current += 1;
    const firstTarget = pickRandomTarget(studyMinFret, studyMaxFret);
    setIsRunning(true);
    setIsAdvancing(false);
    setTarget(firstTarget);
    setQuestionStartMs(eventTimeMs);
    setTotals({ total: 0, correct: 0, wrong: 0 });
    setStatsRows(buildInitialStats());
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
  };

  const totalPercent = totals.total > 0 ? (totals.correct / totals.total) * 100 : 0;
  const wrongPercent = totals.total > 0 ? (totals.wrong / totals.total) * 100 : 0;

  const updateStudyWindow = useCallback((thumb, fretValue) => {
    const fret = Math.max(0, Math.min(visibleMaxFret, fretValue));
    if (thumb === "min") {
      setStudyMinFret(Math.min(studyMaxFret, Math.max(0, Math.min(visibleMaxFret, fret))));
      return;
    }
    setStudyMaxFret(Math.max(studyMinFret, Math.max(0, Math.min(visibleMaxFret, fret))));
  }, [studyMaxFret, studyMinFret, visibleMaxFret]);

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

  const answerNote = async (selectedNote, eventTimeMs) => {
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
    const isCorrect = selectedNote === row.note;

    setTotals((current) => ({
      total: current.total + 1,
      correct: current.correct + (isCorrect ? 1 : 0),
      wrong: current.wrong + (isCorrect ? 0 : 1),
    }));

    setStatsRows((currentRows) =>
      currentRows.map((item) => {
        if (item.id !== targetAtAnswerStart.id) return item;
        return {
          ...item,
          tests: item.tests + 1,
          correct: item.correct + (isCorrect ? 1 : 0),
          wrong: item.wrong + (isCorrect ? 0 : 1),
          correctTimeMsTotal: item.correctTimeMsTotal + (isCorrect ? elapsedMs : 0),
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

    const nextTarget = pickRandomTarget(studyMinFret, studyMaxFret, targetAtAnswerStart.id);
    setTarget(nextTarget);
    setQuestionStartMs(eventTimeMs + (isCorrect ? 980 : 360));
    const nextStringId = STRINGS[nextTarget.stringIndex].id;
    playPromptNote(nextStringId, nextTarget.fret);
    setIsAdvancing(false);
  };

  useEffect(() => () => {
    sampleLoadingRef.current.clear();
    sampleBuffersRef.current.clear();
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close();
    }
  }, []);

  useEffect(() => {
    setStudyMinFret((current) => Math.min(current, visibleMaxFret));
    setStudyMaxFret((current) => Math.min(current, visibleMaxFret));
  }, [visibleMaxFret]);

  useEffect(() => {
    if (!isRunning) return;
    if (!target) return;
    if (target.fret >= studyMinFret && target.fret <= studyMaxFret) return;

    const nextTarget = pickRandomTarget(studyMinFret, studyMaxFret, target.id);
    setTarget(nextTarget);
    setQuestionStartMs(performance.now());
    const nextStringId = STRINGS[nextTarget.stringIndex].id;
    playPromptNote(nextStringId, nextTarget.fret);
  }, [isRunning, playPromptNote, studyMaxFret, studyMinFret, target]);

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

  return (
    <div className="soundstage min-h-screen bg-slate-950 px-3 py-4 md:px-6">
      <main className="mx-auto max-w-[1300px] rounded-3xl border border-cyan-400/20 bg-slate-950/85 p-3 shadow-2xl shadow-black/50 backdrop-blur-xl md:p-5">
        <header className="mb-4 border-b border-cyan-400/20 pb-3">
          <h1 className="text-center text-2xl font-semibold tracking-tight text-slate-100 md:text-3xl">
            Heat Map Memory
          </h1>
          <p className="mx-auto mt-1 max-w-3xl text-center text-xs text-slate-400">
            Fretboard memory game with random string/fret targets.
          </p>
        </header>

        <section className="rounded-2xl border border-cyan-300/20 bg-slate-900/70 p-3 md:p-4">
          <div className="overflow-x-auto">
            <div className="min-w-[950px]">
              <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
                <span>Nut</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-pressed={showAllNotes}
                    onClick={() => {
                      setShowAllNotes((current) => {
                        const next = !current;
                        if (next) setShowPerformanceHeatMap(false);
                        return next;
                      });
                    }}
                    className="inline-flex items-center gap-1 rounded-md border border-cyan-300/40 bg-cyan-400/10 px-2 py-1 text-[11px] text-cyan-100 transition hover:bg-cyan-300/20"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current">
                      <path strokeWidth="1.8" d="M2 12s3.8-6 10-6 10 6 10 6-3.8 6-10 6-10-6-10-6Z" />
                      <circle cx="12" cy="12" r="2.6" strokeWidth="1.8" />
                      {!showAllNotes && <path strokeWidth="1.8" d="m4 20 16-16" />}
                    </svg>
                    {showAllNotes ? "Ocultar notas" : "Exibir notas"}
                  </button>
                  <div className="inline-flex items-center gap-1 rounded-md border border-fuchsia-300/40 bg-fuchsia-400/10 px-2 py-1 text-[11px] text-fuchsia-100">
                    <button
                      type="button"
                      aria-pressed={showPerformanceHeatMap}
                      onClick={() => {
                        setShowPerformanceHeatMap((current) => {
                          const next = !current;
                          if (next) setShowAllNotes(false);
                          return next;
                        });
                      }}
                      className="inline-flex items-center gap-1"
                    >
                      {showPerformanceHeatMap ? "Ocultar mapa" : "Exibir mapa de acertos"}
                    </button>
                    <select
                      value={heatMapMetric}
                      onChange={(event) => setHeatMapMetric(event.target.value)}
                      className="rounded border border-fuchsia-300/30 bg-slate-950/75 px-1.5 py-0.5 text-[10px] text-fuchsia-100 outline-none"
                    >
                      <option value="tests">Testes</option>
                      <option value="accuracy">% Acerto</option>
                      <option value="responseTime">Tempo m.</option>
                    </select>
                  </div>
                  <div className="inline-flex items-center gap-1 rounded-md border border-cyan-300/40 bg-cyan-400/10 px-2 py-1 text-[11px] text-cyan-100">
                    <span>Fretboard</span>
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
                        <option key={`visible-${fret}`} value={fret}>
                          {fret}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div
                className="relative h-[180px] border border-amber-500/30 shadow-[0_10px_16px_rgba(0,0,0,0.45)] shadow-inner shadow-black/40"
                style={{
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
                        <span className="h-3.5 w-3.5 rounded-full bg-slate-100/85" />
                        <span className="h-3.5 w-3.5 rounded-full bg-slate-100/85" />
                      </div>
                    ) : (
                      <span className="block h-3.5 w-3.5 rounded-full bg-slate-100/85" />
                    )}
                  </div>
                ))}

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
                            "repeating-linear-gradient(-45deg, rgba(120,134,156,0.78) 0px, rgba(120,134,156,0.78) 0.85px, rgba(51,65,85,0.92) 0.85px, rgba(51,65,85,0.92) 1.7px)",
                          boxShadow: "0 -4px 11px rgba(0, 0, 0, 0.88)",
                          borderRadius: "999px",
                        }}
                      />
                      <span
                        className="absolute -left-7 -translate-y-1/2 text-sm font-semibold text-cyan-100"
                        style={{ top: `${top}%` }}
                      >
                        {stringItem.label}
                      </span>
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
                    onClick={() => playPromptNote(dot.stringId, dot.fret)}
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

                {showAllNotes && fretboardNoteDots.map((dot) => (
                  <span
                    key={dot.id}
                    className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded px-1 py-0.5 text-[10px] font-semibold leading-none text-slate-100"
                    style={{
                      left: `${dot.left}%`,
                      top: `${dot.top}%`,
                      backgroundColor: "rgba(15, 23, 42, 0.85)",
                    }}
                  >
                    {dot.note}
                  </span>
                ))}
                {showPerformanceHeatMap && fretboardNoteDots.map((dot, index) => {
                  const metricDot = heatMapDots[index];
                  if (!metricDot?.visible) return null;
                  return (
                    <span
                      key={`heat-${dot.id}`}
                      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded border px-1 py-0.5 text-[9px] font-semibold leading-none"
                      style={{
                        left: `${dot.left}%`,
                        top: `${dot.top}%`,
                        backgroundColor: metricDot.background,
                        borderColor: metricDot.border,
                        color: metricDot.textColor,
                      }}
                    >
                      {metricDot.label}
                    </span>
                  );
                })}

                {studyWindowStartPercent > 0 && (
                  <div
                    className="pointer-events-none absolute inset-y-0 left-0 z-[15] bg-black/45"
                    style={{ width: `${studyWindowStartPercent}%` }}
                  />
                )}
                {studyWindowEndPercent < 100 && (
                  <div
                    className="pointer-events-none absolute inset-y-0 right-0 z-[15] bg-black/45"
                    style={{ width: `${100 - studyWindowEndPercent}%` }}
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

              <div className="relative mt-2 h-10 select-none">
                <div
                  className="absolute inset-y-0 left-2 right-2"
                  ref={studySliderTrackRef}
                  onPointerDown={onStudyTrackPointerDown}
                >
                  <div className="pointer-events-none absolute left-0 right-0 top-1/2 h-[2px] -translate-y-1/2 bg-slate-700/90" />
                  <div
                    className="pointer-events-none absolute top-1/2 h-[3px] -translate-y-1/2 bg-cyan-300/80"
                    style={{
                      left: `${studyMinThumbPercent}%`,
                      width: `${Math.max(0, studyMaxThumbPercent - studyMinThumbPercent)}%`,
                    }}
                  />
                  {Array.from({ length: visibleMaxFret + 1 }, (_, fret) => (
                    <span
                      key={`snap-${fret}`}
                      className="pointer-events-none absolute top-1/2 h-2 w-[1px] -translate-x-1/2 -translate-y-1/2 bg-slate-500/70"
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
                    className="absolute top-1/2 z-20 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-100 bg-cyan-300 shadow-[0_0_8px_rgba(34,211,238,0.7)]"
                    style={{ left: `${studyMinThumbPercent}%` }}
                  />
                  <button
                    type="button"
                    aria-label={`Fim da janela de estudo: casa ${studyMaxFret}`}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      setDraggingThumb("max");
                    }}
                    className="absolute top-1/2 z-30 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-fuchsia-100 bg-fuchsia-300 shadow-[0_0_8px_rgba(244,114,182,0.7)]"
                    style={{ left: `${studyMaxThumbPercent}%` }}
                  />
                </div>
                <span className="pointer-events-none absolute right-0 top-full mt-1 text-[11px] text-slate-500">
                  Casas {studyMinFret} - {studyMaxFret}
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-3 rounded-2xl border border-cyan-300/20 bg-slate-900/70 p-3 md:p-4">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={(event) => startGame(event.timeStamp)}
              className="rounded-lg border border-emerald-400/60 bg-emerald-400/20 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-400/30"
            >
              Start
            </button>
            <button
              type="button"
              onClick={stopGame}
              disabled={!isRunning && !isAdvancing}
              className="rounded-lg border border-rose-400/60 bg-rose-400/20 px-4 py-2 text-sm font-semibold text-rose-100 transition hover:bg-rose-400/30 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Stop
            </button>
            <span className="text-xs text-slate-400">
              Clique em <strong className="text-slate-200">Start</strong> para iniciar ou reiniciar a rodada.
            </span>
          </div>

          <div className="overflow-x-auto">
            <div className="grid min-w-[720px] grid-cols-12 gap-2">
              {CHROMATIC_NOTES.map((note) => {
                const isSharp = note.includes("#");
                return (
                  <button
                    key={note}
                    type="button"
                    onClick={(event) => answerNote(note, event.timeStamp)}
                    disabled={!isRunning || isAdvancing}
                    className={`h-11 rounded-lg border text-sm font-semibold transition ${
                      isSharp
                        ? "border-slate-700 bg-black text-white hover:bg-slate-900"
                        : "border-slate-300 bg-white text-black hover:bg-slate-200"
                    } disabled:cursor-not-allowed disabled:opacity-45`}
                  >
                    {note}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-4 grid gap-2 rounded-xl border border-fuchsia-400/20 bg-slate-950/65 p-3 text-sm text-slate-200 md:grid-cols-3">
            <p>
              <span className="text-slate-400">Total:</span>
              {" "}
              <strong>{totals.total}</strong>
            </p>
            <p>
              <span className="text-slate-400">Acertos:</span>
              {" "}
              <strong>{totals.correct}</strong>
              {"   "}
              <span className="text-emerald-300">{totalPercent.toFixed(0)}%</span>
            </p>
            <p>
              <span className="text-slate-400">Erros:</span>
              {" "}
              <strong>{totals.wrong}</strong>
              {"   "}
              <span className="text-rose-300">{wrongPercent.toFixed(0)}%</span>
            </p>
          </div>
        </section>

        <section className="mt-3 rounded-2xl border border-cyan-300/20 bg-slate-900/70 p-3 md:p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-cyan-100">
            Heat map de memória por corda e casa
          </h2>
          <div className="overflow-x-auto">
            <table className="min-w-[980px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-2 py-2">Corda</th>
                  <th className="px-2 py-2">Casa</th>
                  <th className="px-2 py-2">Nota</th>
                  <th className="px-2 py-2">Qnt. de testes</th>
                  <th className="px-2 py-2">Acertos</th>
                  <th className="px-2 py-2">Erros</th>
                  <th className="px-2 py-2">Tempo médio de acerto</th>
                </tr>
              </thead>
              <tbody>
                {statsRows.map((row) => {
                  const avgSec = row.correct > 0 ? row.correctTimeMsTotal / row.correct / 1000 : null;
                  return (
                    <tr key={row.id} className="border-b border-slate-800/80 text-slate-200">
                      <td className="px-2 py-2">{row.stringLabel}</td>
                      <td className="px-2 py-2">{row.fret}</td>
                      <td className="px-2 py-2">{row.note}</td>
                      <td className="px-2 py-2">{row.tests}</td>
                      <td className="px-2 py-2">{row.correct}</td>
                      <td className="px-2 py-2">{row.wrong}</td>
                      <td className="px-2 py-2">{avgSec === null ? "-" : `${avgSec.toFixed(1)}s`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
