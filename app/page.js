"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppLanguage } from "./i18n-provider";
import FloatingBackButton from "./components/floating-back-button";

const STANDARD_NOTES = ["a", "b", "c", "d", "e", "f", "g"];
const SHARP_NOTES = ["a#", "c#", "d#", "e#", "f#", "g#", "b#"];
const FLAT_NOTES = ["ab", "bb", "cb", "db", "eb", "fb", "gb"];
const DEFAULT_SELECTED = [
  ...STANDARD_NOTES,
  ...SHARP_NOTES,
  ...FLAT_NOTES,
];
const NOTES_DEFAULTS_VERSION = 2;
const BEAT_OPTIONS = [2, 3, 4, 6, 8];
const NOTE_ROWS = [
  { label: "Sharps", items: ["c#", "d#", "e#", "f#", "g#", "a#", "b#"] },
  { label: "Natural Notes", items: ["c", "d", "e", "f", "g", "a", "b"] },
  { label: "Flats", items: ["cb", "db", "eb", "fb", "gb", "ab", "bb"] },
];
const PT_NOTE_NAMES = {
  c: "Dó",
  d: "Ré",
  e: "Mi",
  f: "Fá",
  g: "Sol",
  a: "Lá",
  b: "Si",
};

function getStoredNumber(key, fallback) {
  if (typeof window === "undefined") return fallback;
  const value = Number.parseFloat(localStorage.getItem(key) || "");
  return Number.isFinite(value) ? value : fallback;
}

function getStoredJSON(key, fallback) {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function getInitialSelectedNotes() {
  if (typeof window === "undefined") return DEFAULT_SELECTED;

  const savedVersion = Number.parseInt(localStorage.getItem("noteGenerator_notesDefaultsVersion") || "0", 10);
  if (!Number.isFinite(savedVersion) || savedVersion < NOTES_DEFAULTS_VERSION) {
    localStorage.setItem("noteGenerator_selectedNotes", JSON.stringify(DEFAULT_SELECTED));
    localStorage.setItem("noteGenerator_notesDefaultsVersion", String(NOTES_DEFAULTS_VERSION));
    return DEFAULT_SELECTED;
  }

  const saved = getStoredJSON("noteGenerator_selectedNotes", DEFAULT_SELECTED);
  if (!Array.isArray(saved) || saved.length === 0) return DEFAULT_SELECTED;
  return saved;
}

function formatNoteDisplay(note) {
  if (!note) return "";
  if (note.includes("#")) return note.toUpperCase();
  if (note.endsWith("b") && note.length > 1) {
    return `${note[0].toUpperCase()}b`;
  }
  return note.toUpperCase();
}

function pickRandomNote(availableNotes) {
  if (availableNotes.length === 0) return "";
  const index = Math.floor(Math.random() * availableNotes.length);
  return availableNotes[index];
}

function buildWaveShapeFromSamples(samples, ratio = 1, startRatio = 0) {
  const width = 320;
  const height = 44;
  const center = height / 2;
  const bins = 160;
  const data = samples || new Float32Array();

  if (data.length === 0) {
    return {
      areaPath: `M 0 ${center} L ${width} ${center} L ${width} ${center} L 0 ${center} Z`,
      linePath: `M 0 ${center} L ${width} ${center}`,
    };
  }

  const clampedRatio = Math.max(0, Math.min(1, ratio));
  const startBin = Math.max(0, Math.min(bins - 1, Math.round(startRatio * bins)));
  const requestedSpeechBins = clampedRatio > 0 ? Math.max(1, Math.round(bins * clampedRatio)) : 0;
  const speechBins = Math.max(0, Math.min(requestedSpeechBins, bins - startBin));
  const speechEndBin = startBin + speechBins;
  const step = speechBins > 0 ? Math.max(1, Math.floor(data.length / speechBins)) : 1;
  const peaks = [];
  let maxPeak = 0;

  for (let bin = 0; bin < bins; bin += 1) {
    if (bin < startBin || bin >= speechEndBin || speechBins === 0) {
      peaks.push({ peak: 0, avg: 0 });
      continue;
    }

    const speechBinIndex = bin - startBin;
    const start = speechBinIndex * step;
    if (start >= data.length) {
      peaks.push({ peak: 0, avg: 0 });
      continue;
    }

    const end = Math.min(data.length, start + step);
    let peak = 0;
    let sum = 0;
    for (let index = start; index < end; index += 1) {
      const value = data[index];
      const abs = Math.abs(value);
      if (abs > peak) peak = abs;
      sum += value;
    }
    peaks.push({ peak, avg: sum / Math.max(1, end - start) });
    if (peak > maxPeak) maxPeak = peak;
  }

  const normalizedMax = maxPeak > 0 ? maxPeak : 1;
  const topPoints = [];
  const bottomPoints = [];
  let linePath = "";

  for (let index = 0; index < peaks.length; index += 1) {
    const progress = peaks.length > 1 ? index / (peaks.length - 1) : 0;
    const x = progress * width;
    const amplitude = peaks[index].peak > 0 ? (1.5 + (peaks[index].peak / normalizedMax) * 16) : 0;
    const topY = center - amplitude;
    const bottomY = center + amplitude;
    topPoints.push(`${x.toFixed(2)} ${topY.toFixed(2)}`);
    bottomPoints.push(`${x.toFixed(2)} ${bottomY.toFixed(2)}`);
    const midY = center - peaks[index].avg * 8;
    linePath += index === 0 ? `M ${x.toFixed(2)} ${midY.toFixed(2)}` : ` L ${x.toFixed(2)} ${midY.toFixed(2)}`;
  }

  const areaPath = `M ${topPoints.join(" L ")} L ${bottomPoints.reverse().join(" L ")} Z`;
  return { areaPath, linePath };
}

function trimSilenceEdges(samples) {
  if (!samples || samples.length === 0) return new Float32Array();

  let maxAbs = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const abs = Math.abs(samples[index]);
    if (abs > maxAbs) maxAbs = abs;
  }

  const threshold = Math.max(0.01, maxAbs * 0.1);
  let startIndex = 0;
  while (startIndex < samples.length && Math.abs(samples[startIndex]) < threshold) {
    startIndex += 1;
  }
  if (startIndex >= samples.length) return new Float32Array();

  let endIndex = samples.length - 1;
  while (endIndex > startIndex && Math.abs(samples[endIndex]) < threshold) {
    endIndex -= 1;
  }

  return samples.slice(startIndex, endIndex + 1);
}

function noteToSpokenText(note, language) {
  const normalized = (note || "").toLowerCase();
  if (!normalized) return "";

  if (language === "pt-BR") {
    const base = normalized[0];
    const baseName = PT_NOTE_NAMES[base] || base.toUpperCase();
    if (normalized.includes("#")) return `${baseName} sustenido`;
    if (normalized.endsWith("b") && normalized.length > 1) return `${baseName} bemol`;
    return baseName;
  }

  if (normalized.includes("#")) return normalized.replace("#", " sharp");
  if (normalized.endsWith("b") && normalized.length > 1) return normalized.replace(/b$/, " flat");
  return normalized;
}

export function ToolPage() {
  const { tr } = useAppLanguage();
  const [timeInterval, setTimeInterval] = useState(() =>
    getStoredNumber("noteGenerator_timeInterval", 5),
  );
  const [selectedNotes, setSelectedNotes] = useState(getInitialSelectedNotes);
  const [isRunning, setIsRunning] = useState(false);
  const [currentNote, setCurrentNote] = useState("");
  const [isPreloadingAudio, setIsPreloadingAudio] = useState(false);
  const [lastSpokenText, setLastSpokenText] = useState("");
  const [lastSpeechDurationSec, setLastSpeechDurationSec] = useState(0);
  const [cycleProgress, setCycleProgress] = useState(0);
  const [speechWaveSamples, setSpeechWaveSamples] = useState(() =>
    new Float32Array(),
  );
  const [textToSpeechEnabled, setTextToSpeechEnabled] = useState(() =>
    getStoredJSON("noteGenerator_textToSpeechEnabled", true),
  );
  const [metronomeEnabled, setMetronomeEnabled] = useState(() =>
    getStoredJSON("noteGenerator_metronomeEnabled", true),
  );
  const [beatsPerInterval, setBeatsPerInterval] = useState(() => {
    const stored = getStoredNumber("noteGenerator_beatsPerInterval", 8);
    return BEAT_OPTIONS.includes(stored) ? stored : 8;
  });
  const [useHeadTone, setUseHeadTone] = useState(() =>
    getStoredJSON("noteGenerator_useHeadTone", true),
  );
  const [metronomeShiftSeconds, setMetronomeShiftSeconds] = useState(() => {
    const stored = getStoredNumber("noteGenerator_metronomeShiftSeconds", -2.9);
    return Number.isFinite(stored) ? Math.round(stored * 10) / 10 : -2.9;
  });
  const [selectedVoice, setSelectedVoice] = useState(() =>
    typeof window === "undefined"
      ? "Luciana"
      : localStorage.getItem("noteGenerator_selectedVoice") || "Luciana",
  );
  const [language, setLanguage] = useState(() =>
    typeof window === "undefined" ? "pt-BR" : (() => {
      const savedLanguage = localStorage.getItem("noteGenerator_language") || "pt-BR";
      return savedLanguage === "pt" ? "pt-BR" : savedLanguage;
    })(),
  );
  const [allVoices, setAllVoices] = useState([]);

  const intervalRef = useRef(null);
  const lastPlayedNoteRef = useRef("");
  const metronomeTimeoutsRef = useRef([]);
  const audioContextRef = useRef(null);
  const noteAudioRef = useRef(null);
  const activeNoteAudiosRef = useRef(new Set());
  const audioCacheRef = useRef(new Map());
  const audioInflightRef = useRef(new Map());
  const cycleStartMsRef = useRef(0);

  const availableVoices = useMemo(() => {
    if (language === "pt-BR") {
      const ptBrVoices = allVoices.filter((voice) =>
        voice.lang.toLowerCase().startsWith("pt-br"),
      );
      if (ptBrVoices.length > 0) return ptBrVoices;
      return allVoices.filter((voice) => voice.lang.toLowerCase().startsWith("pt"));
    }
    return allVoices.filter((voice) => voice.lang.toLowerCase().startsWith("en"));
  }, [allVoices, language]);
  const resolvedSelectedVoice = useMemo(() => {
    if (selectedVoice === "default") return "default";
    const exists = availableVoices.some((voice) => voice.name === selectedVoice);
    return exists ? selectedVoice : "default";
  }, [availableVoices, selectedVoice]);
  const waveformRatio = useMemo(() => {
    if (!textToSpeechEnabled) return 0;
    return Math.max(0, Math.min(1, lastSpeechDurationSec / Math.max(timeInterval, 0.1)));
  }, [lastSpeechDurationSec, textToSpeechEnabled, timeInterval]);
  const metronomeHeadOffsetSec = useMemo(() => {
    const cycle = Math.max(0.1, timeInterval);
    return ((metronomeShiftSeconds % cycle) + cycle) % cycle;
  }, [metronomeShiftSeconds, timeInterval]);
  const uiMetronomeShiftSeconds = useMemo(
    () => -metronomeShiftSeconds,
    [metronomeShiftSeconds],
  );
  const waveformStartRatio = useMemo(() => {
    const cycle = Math.max(0.1, timeInterval);
    return ((cycle - metronomeHeadOffsetSec) % cycle) / cycle;
  }, [metronomeHeadOffsetSec, timeInterval]);
  const waveformShape = useMemo(
    () => buildWaveShapeFromSamples(speechWaveSamples, waveformRatio, waveformStartRatio),
    [speechWaveSamples, waveformRatio, waveformStartRatio],
  );
  const syncCycleClock = useCallback((noteStartMs = performance.now()) => {
    const cycleMs = Math.max(100, timeInterval * 1000);
    cycleStartMsRef.current = noteStartMs + metronomeHeadOffsetSec * 1000;
    const elapsed = performance.now() - cycleStartMsRef.current;
    const progress = ((elapsed % cycleMs) + cycleMs) % cycleMs / cycleMs;
    setCycleProgress(progress);
  }, [metronomeHeadOffsetSec, timeInterval]);

  const speakWithVoice = useCallback((text, voiceName = resolvedSelectedVoice, options = {}) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const { trackDuration = false } = options;
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.3;
    utterance.pitch = 1;
    utterance.lang = language === "pt-BR" ? "pt-BR" : "en-US";
    utterance.volume = 1;

    if (voiceName !== "default") {
      const voice = availableVoices.find((item) => item.name === voiceName);
      if (voice) utterance.voice = voice;
    }

    if (trackDuration) {
      let startedAt = 0;
      utterance.onstart = () => {
        startedAt = performance.now();
      };
      utterance.onend = (event) => {
        const elapsedByEvent = Number.isFinite(event.elapsedTime) ? event.elapsedTime : 0;
        const elapsed = elapsedByEvent > 0 ? elapsedByEvent : (performance.now() - startedAt) / 1000;
        setLastSpeechDurationSec(Math.max(0.05, elapsed));
      };
      utterance.onerror = () => {
        setLastSpeechDurationSec(0);
      };
    }

    window.speechSynthesis.speak(utterance);
  }, [availableVoices, language, resolvedSelectedVoice]);

  const stopNoteAudio = useCallback(() => {
    activeNoteAudiosRef.current.forEach((audio) => {
      audio.pause();
      audio.src = "";
    });
    activeNoteAudiosRef.current.clear();
    noteAudioRef.current = null;
  }, []);

  const fetchAndPrepareAudio = useCallback(async (spokenText) => {
    const key = `${language}:${spokenText}`;
    if (audioCacheRef.current.has(key)) {
      return audioCacheRef.current.get(key);
    }
    if (audioInflightRef.current.has(key)) {
      return audioInflightRef.current.get(key);
    }

    const promise = (async () => {
      const params = new URLSearchParams({
        q: spokenText,
        tl: language === "pt-BR" ? "pt-BR" : "en",
      });
      const response = await fetch(`/api/tts?${params.toString()}`);
      if (!response.ok) throw new Error("TTS request failed");

      const arrayBuffer = await response.arrayBuffer();
      const audioContext = audioContextRef.current || new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = audioContext;
      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      const decodedAudio = await audioContext.decodeAudioData(arrayBuffer.slice(0));
      const playbackRate = 1.3;
      const rawSamples = decodedAudio.getChannelData(0);
      const trimmedSamples = trimSilenceEdges(rawSamples);
      const samplesForWave = trimmedSamples.length > 0 ? trimmedSamples : rawSamples;
      const durationSec = samplesForWave.length > 0
        ? (samplesForWave.length / decodedAudio.sampleRate) / playbackRate
        : decodedAudio.duration / playbackRate;

      const blob = new Blob([arrayBuffer], { type: "audio/mpeg" });
      const audioUrl = URL.createObjectURL(blob);
      const prepared = {
        url: audioUrl,
        samples: new Float32Array(samplesForWave),
        durationSec: Math.max(0.05, durationSec),
      };
      audioCacheRef.current.set(key, prepared);
      return prepared;
    })().finally(() => {
      audioInflightRef.current.delete(key);
    });

    audioInflightRef.current.set(key, promise);
    return promise;
  }, [language]);

  const preloadSelectedNotes = useCallback(async () => {
    if (!textToSpeechEnabled || selectedNotes.length === 0) return;
    const spokenSet = new Set(selectedNotes.map((note) => noteToSpokenText(note, language)));
    const tasks = Array.from(spokenSet).map((spoken) => fetchAndPrepareAudio(spoken));
    await Promise.allSettled(tasks);
  }, [fetchAndPrepareAudio, language, selectedNotes, textToSpeechEnabled]);

  const speakNote = useCallback(async (note) => {
    if (!note) return;
    const spoken = noteToSpokenText(note, language);

    setLastSpokenText(spoken);
    if (!textToSpeechEnabled) {
      setLastSpeechDurationSec(0);
      setSpeechWaveSamples(new Float32Array());
      return;
    }

    window.speechSynthesis.cancel();

    try {
      const prepared = await fetchAndPrepareAudio(spoken);
      setLastSpeechDurationSec(prepared.durationSec);
      setSpeechWaveSamples(prepared.samples);

      const audio = new Audio(prepared.url);
      audio.playbackRate = 1.3;
      activeNoteAudiosRef.current.add(audio);
      audio.onended = () => {
        activeNoteAudiosRef.current.delete(audio);
      };
      noteAudioRef.current = audio;
      await audio.play();
    } catch {
      setSpeechWaveSamples(new Float32Array());
      speakWithVoice(spoken, undefined, { trackDuration: true });
    }
  }, [fetchAndPrepareAudio, language, speakWithVoice, textToSpeechEnabled]);

  const clearMetronomeSchedule = useCallback(() => {
    metronomeTimeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
    metronomeTimeoutsRef.current = [];
  }, []);

  const playMetronomeClick = useCallback((isDownbeat) => {
    if (typeof window === "undefined") return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextClass();
    }

    const context = audioContextRef.current;
    if (context.state === "suspended") {
      context.resume();
    }

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.value = !useHeadTone || isDownbeat ? 1200 : 880;

    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.15, context.currentTime + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.08);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(context.currentTime);
    oscillator.stop(context.currentTime + 0.09);
  }, [useHeadTone]);

  const scheduleMetronome = useCallback(() => {
    clearMetronomeSchedule();
    if (!metronomeEnabled) return;

    const cycleDurationMs = timeInterval * 1000;
    const beatDurationMs = cycleDurationMs / beatsPerInterval;
    const shiftMs = metronomeShiftSeconds * 1000;

    const scheduledBeats = [];
    for (let beatIndex = 0; beatIndex < beatsPerInterval; beatIndex += 1) {
      const rawDelay = shiftMs + beatIndex * beatDurationMs;
      const normalizedDelay = ((rawDelay % cycleDurationMs) + cycleDurationMs) % cycleDurationMs;
      scheduledBeats.push({
        delayMs: Math.round(normalizedDelay),
        isDownbeat: beatIndex === 0,
      });
    }

    scheduledBeats.sort((first, second) => first.delayMs - second.delayMs);
    scheduledBeats.forEach((scheduledBeat) => {
      const timeoutId = setTimeout(() => {
        playMetronomeClick(scheduledBeat.isDownbeat);
      }, scheduledBeat.delayMs);
      metronomeTimeoutsRef.current.push(timeoutId);
    });
  }, [
    beatsPerInterval,
    clearMetronomeSchedule,
    metronomeEnabled,
    metronomeShiftSeconds,
    playMetronomeClick,
    timeInterval,
  ]);

  const startGenerator = async () => {
    if (selectedNotes.length === 0) return;
    setIsPreloadingAudio(true);
    await preloadSelectedNotes();
    setIsPreloadingAudio(false);
    setIsRunning(true);
    syncCycleClock();
    const firstNote = pickRandomNote(selectedNotes);
    setCurrentNote(firstNote);
    lastPlayedNoteRef.current = firstNote;
    speakNote(firstNote);
    scheduleMetronome();
  };

  const stopGenerator = () => {
    setIsRunning(false);
    setCycleProgress(0);
    setCurrentNote("");
    lastPlayedNoteRef.current = "";
    clearMetronomeSchedule();
    stopNoteAudio();
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  };

  const toggleNote = (note) => {
    const updatedSelection = selectedNotes.includes(note)
      ? selectedNotes.filter((item) => item !== note)
      : [...selectedNotes, note];
    setSelectedNotes(updatedSelection);
    localStorage.setItem("noteGenerator_selectedNotes", JSON.stringify(updatedSelection));

    if (!isRunning) return;
    if (updatedSelection.length === 0) {
      stopGenerator();
      return;
    }

    if (!updatedSelection.includes(lastPlayedNoteRef.current)) {
      syncCycleClock();
      const nextNote = pickRandomNote(updatedSelection);
      setCurrentNote(nextNote);
      lastPlayedNoteRef.current = nextNote;
      speakNote(nextNote);
      scheduleMetronome();
    }
  };

  const onIntervalChange = (value) => {
    const parsed = Number.parseFloat(value);
    const bounded = Number.isFinite(parsed)
      ? Math.min(60, Math.max(0.1, Math.round(parsed * 10) / 10))
      : 0.1;
    setTimeInterval(bounded);
    localStorage.setItem("noteGenerator_timeInterval", bounded.toFixed(1));
  };

  const onMetronomeShiftChange = (value) => {
    const parsed = Number.parseFloat(value);
    const boundedUi = Number.isFinite(parsed)
      ? Math.min(60, Math.max(-60, Math.round(parsed * 10) / 10))
      : 0;
    const internalShift = -boundedUi;
    setMetronomeShiftSeconds(internalShift);
    localStorage.setItem("noteGenerator_metronomeShiftSeconds", internalShift.toFixed(1));
  };

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return undefined;

    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      setAllVoices(voices);
    };

    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
  }, []);

  useEffect(() => {
    if (!isRunning || selectedNotes.length === 0) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      clearMetronomeSchedule();
      return;
    }

    intervalRef.current = setInterval(() => {
      syncCycleClock();
      const availableWithoutLast = selectedNotes.filter(
        (note) => note !== lastPlayedNoteRef.current,
      );
      const notePool = availableWithoutLast.length > 0 ? availableWithoutLast : selectedNotes;
      const randomNote = pickRandomNote(notePool);
      setCurrentNote(randomNote);
      lastPlayedNoteRef.current = randomNote;
      speakNote(randomNote);
      scheduleMetronome();
    }, timeInterval * 1000);
    return () => {
      clearInterval(intervalRef.current);
      clearMetronomeSchedule();
    };
  }, [
    clearMetronomeSchedule,
    isRunning,
    scheduleMetronome,
    selectedNotes,
    speakNote,
    syncCycleClock,
    timeInterval,
  ]);

  useEffect(() => {
    if (!isRunning) return;
    // Immediately re-align metronome beeps when timing settings change.
    syncCycleClock();
    scheduleMetronome();
  }, [isRunning, scheduleMetronome, syncCycleClock]);

  useEffect(() => {
    if (!isRunning) {
      return undefined;
    }

    if (!cycleStartMsRef.current) {
      cycleStartMsRef.current = performance.now();
    }

    let frameId = 0;
    const animate = () => {
      const cycleMs = Math.max(100, timeInterval * 1000);
      const elapsed = performance.now() - cycleStartMsRef.current;
      const progress = ((elapsed % cycleMs) + cycleMs) % cycleMs / cycleMs;
      setCycleProgress(progress);
      frameId = requestAnimationFrame(animate);
    };

    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [isRunning, timeInterval]);

  useEffect(() => {
    const cacheRef = audioCacheRef;
    const inflightRef = audioInflightRef;
    return () => {
      clearMetronomeSchedule();
      stopNoteAudio();
      cacheRef.current.forEach((entry) => {
        URL.revokeObjectURL(entry.url);
      });
      cacheRef.current.clear();
      inflightRef.current.clear();
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [clearMetronomeSchedule, stopNoteAudio]);

  return (
    <div className="soundstage min-h-screen bg-slate-950 px-3 py-4 md:px-6">
      <main className="mx-auto max-w-[920px] rounded-3xl border border-cyan-400/20 bg-slate-950/85 p-3 shadow-2xl shadow-black/50 backdrop-blur-xl md:p-4">
        <header className="mb-4 border-b border-cyan-400/20 pb-3">
          <h1 className="text-center text-2xl font-semibold tracking-tight text-slate-100 md:text-3xl">
            {tr("Music Note Generator", "Gerador de Notas Musicais")}
          </h1>
          <p className="mx-auto mt-1 max-w-3xl text-center text-xs text-slate-400">
            {tr("Dark practice console for random notes, voice and metronome.", "Console de estudo com tema escuro para notas aleatorias, voz e metronomo.")}
          </p>
        </header>

        <section className="mt-3 rounded-2xl border border-cyan-300/20 bg-slate-900/70 p-3">
          <p className="mb-3 text-xs uppercase tracking-[0.18em] text-cyan-200/80">{tr("Select Notes", "Selecionar notas")}</p>
          <div className="space-y-2">
            {NOTE_ROWS.map((row) => (
              <div key={row.label} className="rounded-xl border border-slate-700 bg-slate-950/70 p-2.5">
                <p className="mb-2 text-[10px] uppercase tracking-[0.16em] text-slate-400">
                  {row.label === "Sharps"
                    ? tr("Sharps", "Sustenidos")
                    : row.label === "Natural Notes"
                      ? tr("Natural Notes", "Notas naturais")
                      : tr("Flats", "Bemois")}
                </p>
                <div className="grid grid-cols-7 gap-2">
                  {row.items.map((note) => (
                    <button
                      type="button"
                      key={note}
                      aria-pressed={selectedNotes.includes(note)}
                      onClick={() => toggleNote(note)}
                      className={`h-10 w-10 rounded-full border text-[10px] font-medium transition ${
                        selectedNotes.includes(note)
                          ? "border-cyan-300 bg-cyan-400/15 text-cyan-100"
                          : "border-slate-700 bg-slate-900/45 text-slate-400 opacity-55"
                      } hover:border-cyan-300 hover:text-cyan-100`}
                    >
                      {formatNoteDisplay(note)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-3 grid items-start gap-3 md:grid-cols-[1fr_1fr]">
          <div className="rounded-2xl border border-cyan-300/20 bg-slate-900/70 p-3">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.18em] text-cyan-200/80">{tr("Voice", "Voz")}</p>
              <label className="flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  checked={textToSpeechEnabled}
                  onChange={(event) => {
                    const enabled = event.target.checked;
                    setTextToSpeechEnabled(enabled);
                    localStorage.setItem("noteGenerator_textToSpeechEnabled", JSON.stringify(enabled));
                  }}
                  className="h-4 w-4 accent-cyan-400"
                />
                <span className="sr-only">{tr("Enable text-to-speech", "Ativar texto para fala")}</span>
              </label>
            </div>
            <div className="space-y-2">
              <select
                id="language"
                value={language}
                onChange={(event) => {
                  const nextLanguage = event.target.value;
                  setLanguage(nextLanguage);
                  localStorage.setItem("noteGenerator_language", nextLanguage);
                  setSelectedVoice("default");
                  localStorage.setItem("noteGenerator_selectedVoice", "default");
                }}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-slate-100 outline-none transition focus:border-cyan-300"
              >
                <option value="en">{tr("English", "Ingles")}</option>
                <option value="pt-BR">{tr("Portuguese (Brazil)", "Portugues (Brasil)")}</option>
              </select>

              {textToSpeechEnabled && (
                <div className="flex flex-col gap-2">
                  <select
                    value={resolvedSelectedVoice}
                    onChange={(event) => {
                      const voice = event.target.value;
                      setSelectedVoice(voice);
                      localStorage.setItem("noteGenerator_selectedVoice", voice);
                    }}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-slate-100 outline-none transition focus:border-cyan-300"
                  >
                    <option value="default">{tr("Default Voice", "Voz padrao")}</option>
                    {availableVoices.map((voice) => (
                      <option key={voice.name} value={voice.name}>
                        {voice.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedVoice === "default") {
                        speakWithVoice(
                          language === "pt-BR"
                            ? "Olá, esta é a voz padrão"
                            : "Hello, I am the default voice",
                        );
                        return;
                      }
                      const voice = availableVoices.find((item) => item.name === selectedVoice);
                      if (voice) {
                        speakWithVoice(
                          language === "pt-BR"
                            ? `Olá, eu sou ${voice.name}`
                            : `Hello, I am ${voice.name}`,
                          selectedVoice,
                        );
                      }
                    }}
                    className="w-full rounded-lg border border-cyan-300/60 bg-cyan-400/10 px-2.5 py-1 text-xs font-medium text-cyan-200 transition hover:bg-cyan-300/20"
                  >
                    {tr("Test voice", "Testar voz")}
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-cyan-300/20 bg-slate-900/70 p-3">
            <p className="mb-3 text-xs uppercase tracking-[0.18em] text-cyan-200/80">{tr("Metronome", "Metronomo")}</p>
            <div className="space-y-2">
              <label htmlFor="interval" className="text-[11px] uppercase tracking-wide text-slate-300">
                {tr("Time interval (seconds)", "Intervalo de tempo (segundos)")}
              </label>
              <input
                id="interval"
                type="number"
                min="0.1"
                max="60"
                step="0.1"
                value={timeInterval}
                onFocus={(event) => event.target.select()}
                onChange={(event) => onIntervalChange(event.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-slate-100 outline-none transition focus:border-cyan-300"
              />

              <label className="flex cursor-pointer items-center gap-2 text-xs uppercase tracking-wide text-slate-300">
                <input
                  type="checkbox"
                  checked={metronomeEnabled}
                  onChange={(event) => {
                    const enabled = event.target.checked;
                    setMetronomeEnabled(enabled);
                    localStorage.setItem("noteGenerator_metronomeEnabled", JSON.stringify(enabled));
                  }}
                  className="h-4 w-4 accent-cyan-400"
                />
                {tr("Use metronome", "Usar metronomo")}
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-xs uppercase tracking-wide text-slate-300">
                <input
                  type="checkbox"
                  checked={useHeadTone}
                  onChange={(event) => {
                    const enabled = event.target.checked;
                    setUseHeadTone(enabled);
                    localStorage.setItem("noteGenerator_useHeadTone", JSON.stringify(enabled));
                  }}
                  disabled={!metronomeEnabled}
                  className="h-4 w-4 accent-cyan-400"
                />
                {tr("Use head tone", "Usar tom de cabeca")}
              </label>

              <label htmlFor="beats" className="text-[11px] uppercase tracking-wide text-slate-300">
                {tr("Beats inside interval", "Batidas dentro do intervalo")}
              </label>
              <select
                id="beats"
                value={beatsPerInterval}
                onChange={(event) => {
                  const beats = Number.parseInt(event.target.value, 10);
                  if (!BEAT_OPTIONS.includes(beats)) return;
                  setBeatsPerInterval(beats);
                  localStorage.setItem("noteGenerator_beatsPerInterval", String(beats));
                }}
                disabled={!metronomeEnabled}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-slate-100 outline-none transition focus:border-cyan-300 disabled:opacity-40"
              >
                {BEAT_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>

              <label htmlFor="metronomeShift" className="text-[11px] uppercase tracking-wide text-slate-300">
                {tr("Metronome shift (seconds)", "Deslocamento do metronomo (segundos)")}
              </label>
              <input
                id="metronomeShift"
                type="number"
                min="-60"
                max="60"
                step="0.1"
                value={uiMetronomeShiftSeconds}
                onChange={(event) => onMetronomeShiftChange(event.target.value)}
                disabled={!metronomeEnabled}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-slate-100 outline-none transition focus:border-cyan-300 disabled:opacity-40"
              />
            </div>
          </div>
        </section>

        <section className="mt-3 grid items-center gap-2 rounded-2xl border border-fuchsia-400/20 bg-slate-900/70 p-3 md:grid-cols-[1fr_180px]">
          <div className="rounded-xl border border-fuchsia-400/30 bg-gradient-to-br from-slate-900 to-slate-950 p-3 text-center shadow-inner shadow-black/30">
            <p className="mb-2 text-[10px] uppercase tracking-[0.2em] text-fuchsia-200/70">{tr("Current Note", "Nota atual")}</p>
            <div className="flex min-h-20 items-center justify-center">
              {currentNote ? (
                <p className="animate-pop text-5xl font-black tracking-tight text-cyan-100 md:text-6xl">
                  {formatNoteDisplay(currentNote)}
                </p>
              ) : (
                <p className="text-sm text-slate-500">{tr("Press Go to start", "Pressione Iniciar para comecar")}</p>
              )}
            </div>
            <div className="mt-2 rounded-lg border border-cyan-300/20 bg-slate-950/60 p-1.5">
              <div className="relative h-12 overflow-hidden rounded-md bg-slate-900/70">
                <div className="absolute inset-y-0 left-0 w-px bg-cyan-300/50" />
                <svg
                  viewBox="0 0 320 44"
                  preserveAspectRatio="none"
                  className="absolute inset-0 h-full w-full"
                >
                  <line
                    x1="0"
                    y1="22"
                    x2="320"
                    y2="22"
                    stroke="rgba(148, 163, 184, 0.55)"
                    strokeWidth="1"
                  />
                  <path
                    d={waveformShape.areaPath}
                    fill="rgba(56, 189, 248, 0.72)"
                    stroke="rgba(56, 189, 248, 0.9)"
                    strokeWidth="0.8"
                  />
                  <path
                    d={waveformShape.linePath}
                    fill="none"
                    stroke="rgba(186, 230, 253, 0.9)"
                    strokeWidth="1"
                    strokeLinecap="round"
                  />
                </svg>
                <div
                  className="absolute inset-y-0 z-10 w-px bg-fuchsia-300 shadow-[0_0_8px_rgba(244,114,182,0.8)]"
                  style={{ left: `${(cycleProgress * 100).toFixed(2)}%` }}
                />
              </div>
              <p className="mt-1 text-[10px] text-slate-500">
                {tr("Voice span", "Duracao da voz")} {(lastSpeechDurationSec || 0).toFixed(1)}s / {timeInterval.toFixed(1)}s
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={startGenerator}
              disabled={isRunning || isPreloadingAudio || selectedNotes.length === 0}
              className="rounded-lg border border-emerald-400/60 bg-emerald-400/20 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-100 transition hover:bg-emerald-400/30 disabled:opacity-40"
            >
              {isPreloadingAudio ? tr("Loading...", "Carregando...") : tr("Go", "Iniciar")}
            </button>
            <button
              onClick={stopGenerator}
              disabled={!isRunning}
              className="rounded-lg border border-pink-400/60 bg-pink-400/20 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-pink-100 transition hover:bg-pink-400/30 disabled:opacity-40"
            >
              {tr("Stop", "Parar")}
            </button>
          </div>
        </section>
      </main>
      <FloatingBackButton href="/tools" />
    </div>
  );
}

export default function HomeLanding() {
  const { tr } = useAppLanguage();
  return (
    <div className="soundstage min-h-screen bg-slate-950 px-4 py-8 md:px-6">
      <main className="mx-auto max-w-4xl rounded-3xl border border-cyan-400/20 bg-slate-950/85 p-6 shadow-2xl shadow-black/50 backdrop-blur-xl md:p-10">
        <pre className="mb-6 text-center text-cyan-200/90">
{`╔═══╗
║● ●║
║● ●║
╚═══╝`}
        </pre>

        <h1 className="text-center text-3xl font-semibold tracking-tight text-slate-100 md:text-4xl">
          frets.dev
        </h1>

        <div className="mt-6 space-y-4 text-justify text-sm leading-7 text-slate-300 md:text-base">
          <p>
            {tr(
              "frets.dev exists to build a global open source community dedicated to mastering the instrument fretboard.",
              "frets.dev existe para construir uma comunidade open source mundial dedicada a dominar o braço do instrumento.",
            )}
          </p>
          <p>
            {tr(
              "Learning guitar, bass, and similar instruments should not depend on closed platforms, abandoned apps, or expensive tools. The fretboard of string instruments is, in itself, a universal musical language, and the tools to explore it should be equally open. frets.dev begins with a simple belief: the best learning tools emerge when musicians and developers build together.",
              "Aprender guitarra, baixo e outros instrumentos semelhantes não deveria depender de plataformas fechadas, apps abandonados ou ferramentas caras. O braço dos instrumentos de cordas é por si mesmo uma linguagem musical universal, e as ferramentas para explorá-lo devem ser igualmente abertas. frets.dev começa com uma crença simples: as melhores ferramentas de aprendizado surgem quando músicos e desenvolvedores constroem juntos.",
            )}
          </p>
          <p>
            {tr(
              "This project aims to grow into a global, open source, multilingual ecosystem of fretboard tools — trainers, visualizers, practice systems, and experiments — all free, transparent, and community-driven. If you love music, code, or both, frets.dev is a place to create tools that help musicians around the world understand the fretboard more deeply.",
              "Este projeto busca crescer como um ecossistema global open source e multilíngue de ferramentas para o braço — treinadores, visualizadores, sistemas de prática e experimentos — tudo gratuito, transparente e guiado pela comunidade. Se você ama música, código ou ambos, frets.dev é um lugar para criar ferramentas que ajudam músicos do mundo inteiro a entender o braço com mais profundidade.",
            )}
          </p>
        </div>

        <div className="mt-8 flex justify-center">
          <a
            href="/tools"
            className="rounded-lg border border-cyan-300/60 bg-cyan-400/10 px-5 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-300/20"
          >
            {tr("Explore now >", "Explorar agora >")}
          </a>
        </div>
      </main>
    </div>
  );
}
