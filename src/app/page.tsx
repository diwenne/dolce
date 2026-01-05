"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import AbcRenderer from "@/components/AbcRenderer";

const DEFAULT_ABC = `X:1759
T:Fur Elise (with extra dynamics)
T:Bagatelle No.25 in A, WoO.59
C:Ludwig van Beethoven
Z:Base ABC transcription: Frank Nordberg (Musica Viva). Dynamics added.
V:1
V:2 clef=bass
M:3/8
L:1/16
Q:3/8=40
K:Am
%%staves {(1) (2)}

V:1
!pp!e^d|e^deB=dc|A2 z !p!CEA|B2 z E^GB|c2 z Ee^d|
V:2
z2|z6|!pp!A,,E,A, z z2|E,,E,^G, z z2|A,,E,A, z z2|
%
V:1
e^deB=dc|A2 z CEA|B2 z EcB|[1A2 z2:|[2A2z !<(!Bcd!<)!|
V:2
z6|A,,E,A, z z2|E,,E,^G, z z2|[1A,,E,A, z :|[2A,,E,A, z z2|
%
V:1
|:!mp!e3 Gfe|d3 !mf!Fed|c3 Edc|B2 z !>(!Ee z!>)!|z ee' z z ^d|
V:2
|:!mp!C,E,C z z2|G,,G,B, z z2|A,,E,A, z z2|E,,E,E z z E|e z z ^de z|
%
V:1
!p!e z z ^ded|e^deB=dc|A2 z CEA|B2 z E^GB|c2 z Ee^d|
V:2
z ^de z z2|z6|!p!A,,E,A, z z2|E,,E,^G, z z2|A,,E,A, z z2|
%
V:1
e^deB=dc|A2 z CEA|B2 z EcB|[1A2 z Bcd:|
V:2
z6|A,,E,A, z z2|E,,E,^G, z z2|[1A,,E,A, z z2:|
%
V:1
[2!mf!A2 z [Ec][Fc][EGc]|c4 !<(!f>e!<)!|!f!e2d2 _b>a|agfedc|
V:2
[2!mf!A,,E,A, [_B,C][A,C][G,B,C]|F,A,CA,CA,|F,_B,DB,DB,|F,E[F,G,_B,]E[F,G,B,]E|
%
V:1
!mf!_B2A2 A/G/A/B/|c4 d^d|!<(!e3 efA!<)!|c4 !f!d>B|
V:2
!mf!F,A,CA,CA,|F,A,CA,CA,|E,A,CA,[D,D]F,|G,EG,EG,F|
%
V:1
!f!c/g/G/g/ A/g/B/g/ c/g/d/g/|e/g/c'/b/ a/g/f/e/ d/g/f/d/|c/g/G/g/ A/g/B/g/ c/g/d/g/|
V:2
!f![C2E2] z [FG][EG][DFG]|[C2E2G2] [F,2A,2][F,2A,2]|C2 z [FG][EG][DFG]|
%
V:1
e/g/c'/b/ a/g/f/e/ d/g/f/d/|!>(!e/f/e/^d/ e/B/e/d/ e/B/e/d/!>)!|!p!e3 Be^d|e3 Be z|
V:2
[C2E2G2] [F,2A,2][G,2B,2]|[^G,2B,2] z2 z2|!p!z6|z4 z ^d|
%
V:1
z ^de z z d|!pp!e^deB=dc|A2 z CEA|B2 z E^GB|c2 z Ee^d|
V:2
e z z ^de z|z6|!pp!A,,E,A, z z2|E,,E,^G, z z2|A,,E,A, z z2|
%
V:1
e^deB=dc|A2 z CEA|B2 z EcB|A2 z Bcd|!mp!e3 Gfe|
V:2
z6|A,,E,A, z z2|E,,E,^G, z z2|A,,E,A, z z2|!mp!C,E,C z z2|
%
V:1
d3 !mf!Fed|c3 Edc|B2 z Ee z|z ee' zz ^d|!p!e z z ^ded|
V:2
G,,G,B, z z2|!mf!A,,E,A, z z2|E,,E,E z z E|e z z ^de z|!p!z ^de z z2|
%
V:1
e^deB=dc|A2 z CEA|B2 z E^GB|c2 z Ee^d|e^deB=dc|A2 z CEA|
V:2
z6|A,,E,A, z z2|E,,E,^G, z z2|A,,E,A, z z2|z6|A,,E,A, z z2|
%
V:1
B2 z EcB|A2 z2 z2|!<(![E6G6_B6^c6]!<)!|!f![F4A4d4][^ce][df]|[^G4d4f4][G2d2f2]|!ff![A6c6e6]|
V:2
E,,E,^G, z z2|A,,A,,A,,A,,A,,A,,|!<(!A,,A,,A,,A,,A,,A,,!<)!|!f!A,,A,,A,,A,,A,,A,,|A,,A,,A,,A,,A,,A,,|!ff!A,,A,,A,,A,,A,,A,,|
%
V:1
!ff![F4d4][Ec][DB]|[C4^F4A4][C2A2][C2A2][E2c2][D2B2]|!mf![C6A6]|[E6G6_B6^c6]|[F4A4d4][^ce][df]|
V:2
!ff![D,,A,,][D,,A,,][D,,A,,][D,,A,,][D,,A,,][D,,A,,]|[^D,,A,,][D,,A,,][D,,A,,][D,,A,,][D,,A,,][D,,A,,]|!mf![E,,A,,][E,,A,,][E,,A,,][E,,A,,][E,,^G,,][E,,G,,]|[A,,,A,,]A,,A,,A,,A,,A,,|A,,A,,A,,A,,A,,A,,|A,,A,,A,,A,,A,,A,,|
%
V:1
!mf![d4f4][d2f2]|[d6f6]|[G4_e4][Fd][_Ec]|[D4F4_B4][D2F2A2]|[D4F4^G4][D2F2G2]|!p![C2E2A2] z2 z2|
V:2
!mf!A,,A,,A,,A,,A,,A,,|_B,,B,,B,,B,,B,,B,,|_B,,B,,B,,B,,B,,B,,|_B,,B,,B,,B,,B,,B,,|=B,,B,,B,,B,,B,,B,,|!p!C,2 z2 z2|
%
V:1
!pp![E2B2] z2 z2|(3A,CE (3Ace (3dcB|(3Ace (3ac'e' (3d'c'b|(3Ace (3ac'e' (3d'c'b|
V:2
!pp![E,2^G,2] z2 z2|A,,,2 z2 [A,2C2E2]|[A,2C2E2] z2 [A,2C2E2]|[A,2C2E2] z2 [A,2C2E2]|
%
V:1
(3_ba_a (3g_gf (3e_ed|(3_d'c'b (3_ba_b (3g_gf|!p!e^deB=dc|A2 z CEA|
V:2
[A,2C2E2] z2 z2|z6|!p!z6|A,,E,A, z z2|
%
V:1
B2 z E^GB|c2 z Ee^d|e^deB=dc|A2 z CEA|B2 z EcB|
V:2
E,,E,^G, z z2|A,,E,A, z z2|z6|A,,E,A, z z2|E,,E,^G, z z2|
%
V:1
A2 z Bcd|!mp!e3 Gfe|d3 Fed|c3 !>(!Edc!>)!|B2 z !pp!Ee z|
V:2
A,,E,A, z z2|!mp!C,E,C z z2|G,,G,B, z z2|A,,E,A, z z2|E,,E,E z z E|
%
V:1
z ee' z z ^d|e z z ^ded|e^deB=dc|A2 z CEA|B2 z E^GB|
V:2
e z z ^de z|z ^de z z2|z6|!pp!A,,E,A, z z2|E,,E,^G, z z2|
%
V:1
c2 z Ee^d|e^deB=dc|A2 z CEA|B2 z DcB|!pp![C4A4]|]
V:2
A,,E,A, z z2|z6|A,,E,A, z z2|E,,E,^G, z z2|!pp![A,,,4A,,4]|]
`;

export default function Home() {
  const [abcNotation, setAbcNotation] = useState(DEFAULT_ABC);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleNotationChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setAbcNotation(e.target.value);
  };

  // Transcription State
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isTranscribedPlaying, setIsTranscribedPlaying] = useState(false);
  const transcribedAudioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Callback for when transcription updates the notation
  const handleTranscriptionResult = useCallback((newNotation: string) => {
    setAbcNotation(newNotation);
  }, []);

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
      if (result.abc) {
        setAbcNotation(result.abc);
      }

      // Play the audio (base64 encoded) if available
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
  }, []);

  const handleElementClick = useCallback(
    (position: { start: number; end: number }) => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(position.start, position.end);
        // Scroll to the selection
        const lineNumber = abcNotation
          .substring(0, position.start)
          .split("\n").length;
        const lineHeight = 24; // approximate
        textareaRef.current.scrollTop = (lineNumber - 1) * lineHeight;
      }
    },
    [abcNotation]
  );

  // Keyboard shortcut for future AI integration (Cmd+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        // TODO: Open AI command modal
        console.log("Cmd+K pressed - AI command modal placeholder");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="flex flex-col h-screen bg-zinc-900 text-white">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-zinc-700 bg-zinc-800">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight font-[family-name:var(--font-playfair)]">
            <span className="text-white">Dolce</span>
          </h1>
          <span className="text-xs text-zinc-500">The AI-Native Composer</span>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="https://abcnotation.com/wiki/abc:standard:v2.1"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-zinc-400 bg-zinc-700 hover:bg-zinc-600 px-2 py-1 rounded transition-colors"
            title="Learn ABC Notation"
          >
            ? ABC Guide
          </a>
          <span className="text-xs text-zinc-500 bg-zinc-700 px-2 py-1 rounded">
            Cmd+K for AI
          </span>
          
           {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/wav,audio/*"
            onChange={handleFileSelected}
            className="hidden"
          />

          {/* Transcribe Button */}
          <button
            onClick={handleTranscribeClick}
            disabled={isTranscribing}
            className="flex items-center gap-2 px-3 py-1 bg-purple-600 hover:bg-purple-500 disabled:bg-purple-800 text-white text-xs font-medium rounded transition-colors shadow-sm"
            title="Upload audio and transcribe to piano"
          >
            {isTranscribing ? (
              <>
                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Transcribing...
              </>
            ) : isTranscribedPlaying ? (
              <>
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="4" width="4" height="16" />
                  <rect x="14" y="4" width="4" height="16" />
                </svg>
                Stop Audio
              </>
            ) : (
              <>
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z" />
                </svg>
                Transcribe Audio
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main Split View */}
      <main className="flex flex-1 overflow-hidden">
        {/* Left Pane: Code Editor */}
        <div className="w-1/2 flex flex-col border-r border-zinc-700">
          <div className="px-4 py-2 border-b border-zinc-700 bg-zinc-800 text-xs text-zinc-400">
            ABC Notation (Source)
          </div>
          <textarea
            ref={textareaRef}
            value={abcNotation}
            onChange={handleNotationChange}
            className="flex-1 w-full p-4 bg-zinc-950 text-zinc-100 font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            spellCheck={false}
            placeholder="Type ABC notation here..."
          />
        </div>

        {/* Right Pane: Sheet Music Preview */}
        <div className="w-1/2 flex flex-col bg-zinc-100">
          <div className="px-4 py-2 border-b border-zinc-300 bg-zinc-200 text-xs text-zinc-600">
            Sheet Music Preview
          </div>
          <div className="flex-1 overflow-auto">
            <AbcRenderer
              notation={abcNotation}
              onElementClick={handleElementClick}
              onNotationChange={handleTranscriptionResult}
            />
          </div>
        </div>
      </main>

      {/* Status Bar */}
      <footer className="px-6 py-2 border-t border-zinc-700 bg-zinc-800 text-xs text-zinc-500 flex justify-between">
        <span>Grand Staff (Piano)</span>
        <span>
          {abcNotation.split("\n").length} lines
        </span>
      </footer>
    </div>
  );
}
