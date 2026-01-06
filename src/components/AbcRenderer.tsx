"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import abcjs from "abcjs";

interface AbcRendererProps {
  notation: string;
  onElementClick?: (position: { start: number; end: number }) => void;
}

// Cursor control class for playback visualization
// Helper to format time
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Cursor control class for playback visualization
class CursorControl {
  cursor: HTMLDivElement | null = null;
  root: HTMLDivElement | null = null;

  constructor(root: HTMLDivElement) {
    this.root = root;
    this.cursor = document.createElement("div");
    this.cursor.setAttribute("class", "abcjs-cursor");
    this.cursor.style.position = "absolute";
    this.cursor.style.backgroundColor = "blue";
    this.cursor.style.width = "2px";
    this.cursor.style.height = "0px";
    this.cursor.style.top = "0px";
    this.cursor.style.left = "0px";
    this.cursor.style.zIndex = "20";
    this.cursor.style.pointerEvents = "none";
    this.root.appendChild(this.cursor);
  }

  remove() {
    if (this.cursor && this.cursor.parentNode) {
      this.cursor.parentNode.removeChild(this.cursor);
    }
  }

  onEvent(event: any) {
    // Hide cursor if event is null (end of playback) or no elements
    if (event === null) {
      if (this.cursor) this.cursor.style.display = "none";
      return;
    }

    // Fixed height for cursor - covers grand staff (treble + bass clef)
    const CURSOR_HEIGHT = 200;

    if (this.cursor && this.root) {
      const rootRect = this.root.getBoundingClientRect();

      // Get horizontal position and vertical position from the note elements first
      let leftPos = 0;
      let noteY = 0;
      if (event.elements && event.elements.length > 0) {
        for (const elemArray of event.elements) {
          for (const elem of elemArray) {
            if (elem && elem.getBoundingClientRect) {
              const rect = elem.getBoundingClientRect();
              leftPos = rect.left - rootRect.left + this.root.scrollLeft;
              noteY = rect.top - rootRect.top + this.root.scrollTop;
              break;
            }
          }
          if (leftPos !== 0) break;
        }
      }

      // Find the staff system that contains this note
      // abcjs creates staff lines with class "abcjs-staff" - for piano there are 2 per system
      const allStaves = this.root.querySelectorAll('.abcjs-staff');
      let middleCY = 0;

      if (allStaves.length >= 2) {
        // Find the staff pair (treble + bass) that contains the current note
        // Staves are in pairs: [0,1] = line 1, [2,3] = line 2, etc.
        for (let i = 0; i < allStaves.length - 1; i += 2) {
          const trebleStaff = allStaves[i];
          const bassStaff = allStaves[i + 1];
          const trebleRect = trebleStaff.getBoundingClientRect();
          const bassRect = bassStaff.getBoundingClientRect();

          const systemTop = trebleRect.top - rootRect.top + this.root.scrollTop;
          const systemBottom = bassRect.bottom - rootRect.top + this.root.scrollTop;

          // Check if the note is within this system's vertical range (with some margin)
          if (noteY >= systemTop - 50 && noteY <= systemBottom + 50) {
            // Middle C is between the bottom of treble staff and top of bass staff
            const trebleBottom = trebleRect.bottom - rootRect.top + this.root.scrollTop;
            const bassTop = bassRect.top - rootRect.top + this.root.scrollTop;
            middleCY = (trebleBottom + bassTop) / 2;
            break;
          }
        }

        // Fallback to first system if no match found
        if (middleCY === 0) {
          const trebleRect = allStaves[0].getBoundingClientRect();
          const bassRect = allStaves[1].getBoundingClientRect();
          const trebleBottom = trebleRect.bottom - rootRect.top + this.root.scrollTop;
          const bassTop = bassRect.top - rootRect.top + this.root.scrollTop;
          middleCY = (trebleBottom + bassTop) / 2;
        }
      } else if (allStaves.length === 1) {
        // Single staff - center on it
        const staffRect = allStaves[0].getBoundingClientRect();
        middleCY = (staffRect.top + staffRect.height / 2) - rootRect.top + this.root.scrollTop;
      }

      // Fallback: use event coordinates for horizontal position
      if (leftPos === 0 && event.left !== undefined) {
        const svg = this.root.querySelector('svg');
        if (svg) {
          const svgRect = svg.getBoundingClientRect();
          leftPos = event.left + (svgRect.left - rootRect.left) + this.root.scrollLeft;

          // Fallback vertical position if no staves found 
          if (middleCY === 0) {
            middleCY = event.top + (svgRect.top - rootRect.top) + this.root.scrollTop + 80;
          }
        }
      }

      if (leftPos !== 0 && middleCY !== 0) {
        const cursorTop = middleCY - (CURSOR_HEIGHT / 2);

        this.cursor.style.display = "block";
        this.cursor.style.left = leftPos + "px";
        this.cursor.style.top = cursorTop + "px";
        this.cursor.style.height = CURSOR_HEIGHT + "px";
      }
    } else if (this.cursor) {
      this.cursor.style.display = "none";
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

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines (optional, but keeps it clean)
    if (trimmed === '') continue;

    // Remove MIDI-only directives to avoid visual clutter/warnings
    // But KEEP all voices (V:1, V:2, etc)
    if (trimmed.startsWith('%%MIDI') || trimmed.startsWith('%%program')) {
      continue;
    }

    // Pass through everything else, including V: header/body lines
    resultLines.push(line);
  }

  return resultLines.join('\n');
}

export default function AbcRenderer({
  notation,
  onElementClick,
}: AbcRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const audioControlRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const synthRef = useRef<any>(null);
  const visualObjRef = useRef<abcjs.TuneObject[] | null>(null);
  const cursorControlRef = useRef<CursorControl | null>(null);
  const timingCallbacksRef = useRef<abcjs.TimingCallbacks | null>(null);
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

          // Initialize TimingCallbacks for Playback Cursor
          if (visualObj[0]) {
            const cursorControl = new CursorControl(containerRef.current);
            cursorControlRef.current = cursorControl;

            // Create TimingCallbacks with qpm from tune or default
            const timingCallbacks = new abcjs.TimingCallbacks(visualObj[0], {
              eventCallback: (event) => {
                cursorControl.onEvent(event);
                return undefined;
              }
            });
            timingCallbacksRef.current = timingCallbacks;
          }

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
        cursorControlRef.current.remove();
        cursorControlRef.current = null;
      }
      timingCallbacksRef.current = null;
    };
  }, [notation, onElementClick]);



  // Pro playback using Python backend
  const [playbackState, setPlaybackState] = useState<'stopped' | 'loading' | 'playing' | 'paused'>('stopped');
  const proAudioRef = useRef<HTMLAudioElement | null>(null);

  const handlePlayPro = useCallback(async () => {
    // If paused, resume
    if (playbackState === 'paused' && proAudioRef.current) {
      await proAudioRef.current.play();
      setPlaybackState('playing');
      return;
    }

    // If playing, pause (should use handlePause, but handling toggle here for safety)
    if (playbackState === 'playing' && proAudioRef.current) {
      proAudioRef.current.pause();
      setPlaybackState('paused');
      return;
    }

    // New playback
    setPlaybackState('loading');

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
        setPlaybackState('stopped');
        // Don't nullify ref immediately if we want to allow replay without re-fetch? 
        // But for now, let's reset to allow re-synthesis or just re-play.
        // User wants "Restart". If stopped, maybe we keep the audio? 
        // For simplicity, stop clears it.
        proAudioRef.current = null;
        URL.revokeObjectURL(audioUrl);
      };

      await audio.play();
      setPlaybackState('playing');
    } catch (err) {
      console.error("Pro playback error:", err);
      alert(`Pro playback error: ${err}`);
      setPlaybackState('stopped');
    }
  }, [notation, playbackState]);

  const handlePause = useCallback(() => {
    if (proAudioRef.current) {
      proAudioRef.current.pause();
      setPlaybackState('paused');
    }
  }, []);

  const handleRestart = useCallback(() => {
    if (proAudioRef.current) {
      proAudioRef.current.currentTime = 0;
      if (proAudioRef.current.paused) {
        proAudioRef.current.play();
      }
      setPlaybackState('playing');
    }
  }, []);

  // Animation Frame Loop for Cursor Sync
  useEffect(() => {
    let animationFrameId: number;

    const updateLoop = () => {
      if (playbackState === 'playing' && proAudioRef.current && timingCallbacksRef.current) {
        const currentTime = proAudioRef.current.currentTime;
        const duration = proAudioRef.current.duration;

        if (duration > 0) {
          const percent = currentTime / duration;
          // Note: abcjs setProgress expects 0-1 if 'units' not specified? 
          // Actually doc says 0 to 1.
          timingCallbacksRef.current.setProgress(percent);
        }

        // Also update seek bar if we implement one (using React state for value?)
        // To avoid too many re-renders, we might update Seek Bar logic via ref?
        // Or just setState here (might be 60fps, careful).
      }
      animationFrameId = requestAnimationFrame(updateLoop);
    };

    if (playbackState === 'playing') {
      animationFrameId = requestAnimationFrame(updateLoop);
    }

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [playbackState]);

  // Handle Seek Bar Change
  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    if (proAudioRef.current) {
      proAudioRef.current.currentTime = value;

      // Initial update of cursor immediately
      if (timingCallbacksRef.current && proAudioRef.current.duration > 0) {
        timingCallbacksRef.current.setProgress(value / proAudioRef.current.duration);
      }
    }
  }, []);

  // Update current time for seek bar display (using state for smooth UI?)
  // Using state for seek bar value might cause re-renders. 
  // Let's use a lightweight update or just re-render. React 18 is fast.
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    if (!proAudioRef.current) return;

    const onTimeUpdate = () => {
      setCurrentTime(proAudioRef.current?.currentTime || 0);
    };
    const onDurationChange = () => {
      setDuration(proAudioRef.current?.duration || 0);
    };

    proAudioRef.current.addEventListener('timeupdate', onTimeUpdate);
    proAudioRef.current.addEventListener('durationchange', onDurationChange);

    return () => {
      proAudioRef.current?.removeEventListener('timeupdate', onTimeUpdate);
      proAudioRef.current?.removeEventListener('durationchange', onDurationChange);
    }
  }, [playbackState]); // Update listeners when audio ref changes (re-created on Play) OR just check ref in loop.
  // Actually proAudioRef changes on Play. So we need to bind listeners when it's set.
  // The handlePlayPro logic sets proAudioRef.current. 
  // We can add listeners there, or use a separate effect that depends on proAudioRef.current? 
  // Ref deps in useEffect are tricky. 
  // Let's bind 'timeupdate' inside handlePlayPro for simplicity, or use the RAF loop to update local state?
  // RAF loop updates cursor. Can also update State for Seek Bar.

  // Revised RAF Loop:
  // Updates cursor via TimingCallbacks
  // Updates currentTime State for Seek Bar


  return (
    <div className="relative w-full h-full">
      {/* Hidden audio control div */}
      <div ref={audioControlRef} className="hidden" />

      {/* Button Container */}
      <div className="absolute top-2 right-2 z-10 flex items-center gap-2">
        {/* Play/Pause Button */}
        <button
          onClick={playbackState === 'playing' ? handlePause : handlePlayPro}
          disabled={playbackState === 'loading'}
          className={`flex items-center gap-2 px-4 py-2 ${playbackState === 'playing' ? 'bg-amber-600 hover:bg-amber-500' : 'bg-emerald-600 hover:bg-emerald-500'
            } disabled:bg-emerald-800 text-white text-sm font-medium rounded-md transition-colors shadow-md`}
          title={playbackState === 'playing' ? "Pause" : "Play High-Quality Audio"}
        >
          {playbackState === 'loading' ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Loading...
            </>
          ) : playbackState === 'playing' ? (
            <>
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
              Pause
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <polygon points="5,3 19,12 5,21" />
              </svg>
              {playbackState === 'paused' ? 'Resume' : 'Play'}
            </>
          )}
        </button>

        {/* Restart Button - only visible when active (playing/paused) */}
        {(playbackState === 'playing' || playbackState === 'paused') && (
          <button
            onClick={handleRestart}
            className="flex items-center gap-2 px-3 py-2 bg-zinc-600 hover:bg-zinc-500 text-white text-sm font-medium rounded-md transition-colors shadow-md"
            title="Restart from beginning"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        )}
      </div>

      {/* Seek Bar (Fixed at bottom of sheet music column only) */}
      {(playbackState === 'playing' || playbackState === 'paused') && (
        <div className="fixed bottom-4 left-1/2 right-4 z-50 flex items-center gap-3 bg-zinc-900/95 p-3 rounded-xl backdrop-blur-md shadow-lg border border-zinc-700">
          <span className="text-sm text-white font-mono min-w-[40px]">{formatTime(currentTime)}</span>
          <input
            type="range"
            min="0"
            max={duration || 100}
            value={currentTime}
            onChange={handleSeek}
            className="flex-1 h-2 bg-zinc-600 rounded-lg appearance-none cursor-pointer accent-emerald-500"
          />
          <span className="text-sm text-zinc-400 font-mono min-w-[40px] text-right">{formatTime(duration)}</span>
        </div>
      )}

      {/* Sheet Music Container */}
      <div
        ref={containerRef}
        className="abcjs-container w-full h-full overflow-auto bg-white p-4 rounded-lg pt-12"
      />
    </div>
  );
}

