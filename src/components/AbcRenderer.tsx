"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import abcjs from "abcjs";

interface AbcRendererProps {
  notation: string;
  onElementClick?: (position: { start: number; end: number }) => void;
  onNotationChange?: (newNotation: string) => void;
}

// Cursor control class for playback visualization
class CursorControl {
  private cursor: SVGLineElement | null = null;
  private svg: SVGSVGElement | null = null;
  private lastHighlighted: SVGElement[] = [];

  onStart() {
    // Remove any existing cursor
    if (this.cursor) {
      this.cursor.remove();
    }
  }

  onEvent(event: {
    elements?: SVGElement[][];
    measureStart?: boolean;
    left?: number;
    top?: number;
    height?: number;
  }) {
    // Remove previous highlights
    this.lastHighlighted.forEach((el) => {
      el.classList.remove("abcjs-highlight");
    });
    this.lastHighlighted = [];

    // Highlight current notes
    if (event.elements) {
      event.elements.forEach((elementGroup) => {
        elementGroup.forEach((element) => {
          if (element) {
            element.classList.add("abcjs-highlight");
            this.lastHighlighted.push(element);

            // Create/move cursor line
            if (!this.svg) {
              this.svg = element.closest("svg");
            }
            if (this.svg && event.left !== undefined && event.top !== undefined && event.height !== undefined) {
              this.updateCursor(event.left, event.top, event.height);
            }
          }
        });
      });
    }
  }

  private updateCursor(left: number, top: number, height: number) {
    if (!this.svg) return;

    if (!this.cursor) {
      this.cursor = document.createElementNS("http://www.w3.org/2000/svg", "line");
      this.cursor.setAttribute("class", "abcjs-cursor");
      this.cursor.setAttribute("stroke", "#10b981");
      this.cursor.setAttribute("stroke-width", "2");
      this.svg.appendChild(this.cursor);
    }

    this.cursor.setAttribute("x1", String(left));
    this.cursor.setAttribute("x2", String(left));
    this.cursor.setAttribute("y1", String(top));
    this.cursor.setAttribute("y2", String(top + height));
  }

  onFinished() {
    // Remove highlights and cursor
    this.lastHighlighted.forEach((el) => {
      el.classList.remove("abcjs-highlight");
    });
    this.lastHighlighted = [];
    if (this.cursor) {
      this.cursor.remove();
      this.cursor = null;
    }
  }
}

/**
 * Preprocess ABC notation to make it compatible with abcjs renderer.
 * Strips MIDI-specific extensions. If multi-voice, extract just the melody (V:1).
 */
function preprocessAbcForRendering(abc: string): string {
  const lines = abc.split('\n');
  const resultLines: string[] = [];
  let currentVoice: string | null = null;
  let hasMultipleVoices = false;
  let inHeader = true;
  
  // First pass: detect if multiple voices and clean MIDI stuff
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Detect voice definitions
    if (/^V:\s*\S+/.test(trimmed)) {
      const match = trimmed.match(/^V:\s*(\S+)/);
      if (match && match[1] !== '1') {
        hasMultipleVoices = true;
      }
    }
  }
  
  // Second pass: build the result
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Skip empty lines and comments
    if (trimmed === '' || (trimmed.startsWith('%') && !trimmed.startsWith('%%'))) {
      continue;
    }
    
    // Remove MIDI-only directives
    if (trimmed.startsWith('%%MIDI')) {
      continue;
    }
    
    // Handle voice definitions in header
    if (/^V:\s*\S+/.test(trimmed)) {
      const voiceMatch = trimmed.match(/^V:\s*(\S+)/);
      if (voiceMatch) {
        const voiceId = voiceMatch[1];
        
        // If this is a header voice definition (before K:)
        if (inHeader) {
          // Clean it but only include V:1 for multi-voice pieces
          if (!hasMultipleVoices || voiceId === '1') {
            let cleanedLine = `V:${voiceId}`;
            const clefMatch = trimmed.match(/clef=\S+/i);
            if (clefMatch) cleanedLine += ' ' + clefMatch[0];
            resultLines.push(cleanedLine);
          }
        } else {
          // Voice switch in body
          currentVoice = voiceId;
          // For multi-voice, only add V:1 switch (skip others)
          if (!hasMultipleVoices) {
            resultLines.push(`V:${voiceId}`);
          }
        }
        continue;
      }
    }
    
    // K: ends the header
    if (/^K:\s*\S+/.test(trimmed)) {
      resultLines.push(trimmed);
      inHeader = false;
      currentVoice = '1'; // Start assuming voice 1
      continue;
    }
    
    // Header lines - just clean and add
    if (inHeader && /^[A-Za-z]:/.test(trimmed)) {
      resultLines.push(trimmed);
      continue;
    }
    
    // Music content
    if (!inHeader) {
      // For multi-voice pieces, only include voice 1 content
      if (hasMultipleVoices) {
        if (currentVoice === '1') {
          resultLines.push(trimmed);
        }
        // Skip other voices
      } else {
        resultLines.push(trimmed);
      }
    }
  }
  
  return resultLines.join('\n');
}

export default function AbcRenderer({
  notation,
  onElementClick,
  onNotationChange,
}: AbcRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const audioControlRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const synthRef = useRef<any>(null);
  const visualObjRef = useRef<abcjs.TuneObject[] | null>(null);
  const cursorControlRef = useRef<CursorControl | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Initialize and render
  useEffect(() => {
    // Only run on client side (abcjs needs DOM)
    if (typeof window === "undefined") return;

    if (containerRef.current && notation) {
      try {
        // Preprocess notation to strip MIDI-specific extensions for rendering
        const renderableNotation = preprocessAbcForRendering(notation);
        const visualObj = abcjs.renderAbc(containerRef.current, renderableNotation, {
          responsive: "resize",
          add_classes: true,
          clickListener: (
            abcElem: unknown,
            _tuneNumber: number,
            _classes: string,
            analysis: unknown
          ) => {
            const analysisObj = analysis as
              | { startChar?: number; endChar?: number }
              | undefined;
            if (
              onElementClick &&
              analysisObj &&
              typeof analysisObj.startChar === "number" &&
              typeof analysisObj.endChar === "number"
            ) {
              onElementClick({
                start: analysisObj.startChar,
                end: analysisObj.endChar,
              });
            }
          },
        });

        // Check if render was successful
        if (visualObj && visualObj.length > 0) {
          visualObjRef.current = visualObj;
        } else {
          visualObjRef.current = null;
          console.warn("abcjs: No valid tunes rendered from notation");
        }

        // Fix SVG colors after render
        const svg = containerRef.current.querySelector("svg");
        if (svg) {
          svg.querySelectorAll("path").forEach((path) => {
            path.setAttribute("fill", "#1a1a1a");
            path.setAttribute("stroke", "#1a1a1a");
          });
          svg.querySelectorAll("text").forEach((text) => {
            text.setAttribute("fill", "#1a1a1a");
          });
          svg.querySelectorAll("line").forEach((line) => {
            line.setAttribute("stroke", "#1a1a1a");
          });
        }
      } catch (err) {
        console.error("abcjs render error:", err);
        visualObjRef.current = null;
      }
    }

    // Cleanup
    return () => {
      if (synthRef.current) {
        synthRef.current.stop();
        setIsPlaying(false);
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (cursorControlRef.current) {
        cursorControlRef.current.onFinished();
      }
    };
  }, [notation, onElementClick]);

  const handlePlayStop = useCallback(async () => {
    if (isPlaying && synthRef.current) {
      synthRef.current.stop();
      setIsPlaying(false);
      if (cursorControlRef.current) {
        cursorControlRef.current.onFinished();
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      return;
    }

    if (!visualObjRef.current || visualObjRef.current.length === 0) return;

    try {
      // Initialize cursor control
      const cursorControl = new CursorControl();
      cursorControlRef.current = cursorControl;

      // Create synth with timing callbacks
      const synth = new abcjs.synth.CreateSynth();
      await synth.init({
        visualObj: visualObjRef.current[0],
        options: {
          soundFontUrl: "https://paulrosen.github.io/midi-js-soundfonts/FluidR3_GM/",
        },
      });

      // Prime the audio
      await synth.prime();
      synthRef.current = synth;

      // Start cursor
      cursorControl.onStart();

      // Setup timing callback using abcjs TimingCallbacks
      const timingCallbacks = new abcjs.TimingCallbacks(visualObjRef.current[0], {
        eventCallback: (event: unknown) => {
          if (event) {
            cursorControl.onEvent(event as Parameters<CursorControl["onEvent"]>[0]);
          } else {
            // Playback finished
            cursorControl.onFinished();
            setIsPlaying(false);
          }
          return undefined;
        },
      });

      // Start playback
      synth.start();
      timingCallbacks.start();
      setIsPlaying(true);

    } catch (err) {
      console.error("Audio playback error:", err);
      setIsPlaying(false);
    }
  }, [isPlaying]);

  // Pro playback using Python backend
  const [isProLoading, setIsProLoading] = useState(false);
  const [isProPlaying, setIsProPlaying] = useState(false);
  const proAudioRef = useRef<HTMLAudioElement | null>(null);

  // Transcribe state
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isTranscribedPlaying, setIsTranscribedPlaying] = useState(false);
  const transcribedAudioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handlePlayPro = useCallback(async () => {
    // Stop if already playing
    if (proAudioRef.current) {
      proAudioRef.current.pause();
      proAudioRef.current = null;
      setIsProPlaying(false);
      return;
    }

    setIsProLoading(true);

    try {
      const response = await fetch("http://localhost:8000/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ abc: notation }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Synthesis failed");
      }

      const blob = await response.blob();
      const audioUrl = URL.createObjectURL(blob);

      const audio = new Audio(audioUrl);
      proAudioRef.current = audio;

      audio.onended = () => {
        proAudioRef.current = null;
        setIsProPlaying(false);
        URL.revokeObjectURL(audioUrl);
      };

      await audio.play();
      setIsProPlaying(true);
    } catch (err) {
      console.error("Pro playback error:", err);
      alert(`Pro playback error: ${err}`);
    } finally {
      setIsProLoading(false);
    }
  }, [notation]);

  const handleTranscribeClick = useCallback(() => {
    // If already playing transcribed audio, stop it
    if (transcribedAudioRef.current) {
      transcribedAudioRef.current.pause();
      transcribedAudioRef.current = null;
      setIsTranscribedPlaying(false);
      return;
    }
    // Open file picker
    fileInputRef.current?.click();
  }, []);

  const handleFileSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset file input for future selections
    e.target.value = "";

    setIsTranscribing(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      // Use /transcribe-to-abc endpoint to get both ABC notation and audio
      const response = await fetch("http://localhost:8000/transcribe-to-abc", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Transcription failed");
      }

      const result = await response.json();

      // Update the notation in the parent component for sheet music display
      if (onNotationChange && result.abc) {
        onNotationChange(result.abc);
      }

      // Play the audio (base64 encoded)
      if (result.audio_base64) {
        const audioBlob = new Blob(
          [Uint8Array.from(atob(result.audio_base64), c => c.charCodeAt(0))],
          { type: 'audio/wav' }
        );
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        transcribedAudioRef.current = audio;

        audio.onended = () => {
          transcribedAudioRef.current = null;
          setIsTranscribedPlaying(false);
          URL.revokeObjectURL(audioUrl);
        };

        await audio.play();
        setIsTranscribedPlaying(true);
      }
    } catch (err) {
      console.error("Transcription error:", err);
      alert(`Transcription error: ${err}`);
    } finally {
      setIsTranscribing(false);
    }
  }, [onNotationChange]);

  return (
    <div className="relative w-full h-full">
      {/* Hidden audio control div */}
      <div ref={audioControlRef} className="hidden" />

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/wav,audio/*"
        onChange={handleFileSelected}
        className="hidden"
      />

      {/* Button Container */}
      <div className="absolute top-2 right-2 z-10 flex items-center gap-2">
        {/* Transcribe Button */}
        <button
          onClick={handleTranscribeClick}
          disabled={isTranscribing}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-purple-800 text-white text-sm font-medium rounded-md transition-colors shadow-md"
          title="Upload audio and transcribe to piano"
        >
          {isTranscribing ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Transcribing...
            </>
          ) : isTranscribedPlaying ? (
            <>
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
              Stop
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z" />
              </svg>
              Transcribe Audio
            </>
          )}
        </button>

        {/* Play Button */}
        <button
          onClick={handlePlayPro}
          disabled={isProLoading}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 text-white text-sm font-medium rounded-md transition-colors shadow-md"
          title="High-quality playback (FluidSynth)"
        >
          {isProLoading ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Synthesizing...
            </>
          ) : isProPlaying ? (
            <>
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
              Stop
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <polygon points="5,3 19,12 5,21" />
              </svg>
              Play
            </>
          )}
        </button>
      </div>

      {/* Sheet Music Container */}
      <div
        ref={containerRef}
        className="abcjs-container w-full h-full overflow-auto bg-white p-4 rounded-lg pt-12"
      />
    </div>
  );
}

