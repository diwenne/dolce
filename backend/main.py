"""
Dolce Backend: Expressive ABC to Audio Synthesis
Uses music21 for ABC parsing and FluidSynth for high-quality audio synthesis.
"""

import os
import re
import subprocess
import tempfile
import logging
from pathlib import Path

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
import music21
import torch
import librosa
from piano_transcription_inference import PianoTranscription, sample_rate as pt_sample_rate

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Dolce Audio Synthesis API",
    description="Convert ABC notation to high-quality audio using music21 and FluidSynth",
    version="1.0.0",
)

print("\n\n--- LOADED LATEST VERSION (With Piano Transcription) ---\n\n")

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Path to SoundFont directory
SOUNDFONT_DIR = Path(__file__).parent / "soundfonts"

# Path to piano transcription model checkpoint
CHECKPOINT_PATH = Path.home() / "piano_transcription_inference_data" / "note_F1=0.9677_pedal_F1=0.9186.pth"

# Lazy-loaded transcriptor
_transcriptor = None

# Detect device once at module level
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'
print(f"Using device: {DEVICE}" + (" (GPU acceleration enabled)" if DEVICE == 'cuda' else " (CPU mode - slower)"))


def get_transcriptor():
    """Get or create the piano transcriptor (lazy load for faster startup)."""
    global _transcriptor
    if _transcriptor is None:
        logger.info(f"Initializing PianoTranscription on device: {DEVICE}")
        logger.info(f"Loading checkpoint from: {CHECKPOINT_PATH}")
        if not CHECKPOINT_PATH.exists():
            raise RuntimeError(
                f"Model checkpoint not found at {CHECKPOINT_PATH}. "
                f"Please download from https://zenodo.org/record/4034264"
            )
        _transcriptor = PianoTranscription(device=DEVICE, checkpoint_path=str(CHECKPOINT_PATH))
    return _transcriptor


def find_soundfont() -> Path | None:
    """Find any .sf2 file in the soundfonts directory."""
    if not SOUNDFONT_DIR.exists():
        return None
    
    sf2_files = list(SOUNDFONT_DIR.glob("*.sf2"))
    if sf2_files:
        return sf2_files[0]
    return None


def preprocess_abc_for_midi(abc_content: str) -> str:
    """
    Preprocess ABC content to make it palatable for abc2midi.
    This handles issues with multi-voice syntax, dynamics, and headers
    that can cause abc2midi to fail or produce empty files.
    """
    lines = abc_content.split('\n')
    processed_lines = []
    in_header = True
    
    for line in lines:
        stripped = line.strip()
        if not stripped: 
            continue
            
        if in_header:
            if stripped.startswith('K:'):
                in_header = False
                processed_lines.append(line)
                continue
            
            # Skip V lines in header (let them be defined lazily in body)
            if stripped.startswith('V:'):
                continue
            # Skip comments
            if stripped.startswith('%'):
                continue
                
            processed_lines.append(line)
            continue
            
        # In Body
        if stripped.startswith('%'): continue
        
        if stripped.startswith('V:'):
             # Just V:ID, strip everything else (Program, clef, etc)
             # This ensures abc2midi recognizes the voice switch without getting confused by properties
             match = re.match(r'^V:\s*([\w\d]+)', stripped)
             if match:
                 voice_id = match.group(1)
                 processed_lines.append(f"V:{voice_id}")
                 continue
                 
        # Strip dynamics !...! which can cause abc2midi to drop lines
        line = re.sub(r'![^!]+!', '', line)
        
        # Strip inline comments
        if '%' in line:
            line = line.split('%')[0].strip()
            
        processed_lines.append(line)
    
    return '\n'.join(processed_lines)


def abc2midi_convert(abc_content: str, midi_path: str) -> bool:
    """
    Convert ABC notation to MIDI using abc2midi command line tool.
    This properly handles multi-voice notation that music21 struggles with.
    Returns True on success, False on failure.
    """
    logger.info(f"Original ABC size: {len(abc_content)}")
    
    # Preprocess ABC to fix syntax issues
    clean_abc = preprocess_abc_for_midi(abc_content)
    logger.info(f"Preprocessed ABC size: {len(clean_abc)}")
    logger.info(f"Preprocessed Head:\n{clean_abc[:200]}")
    
    # Write ABC to temp file
    with tempfile.NamedTemporaryFile(mode='w', suffix='.abc', delete=False) as abc_file:
        abc_file.write(clean_abc)
        abc_path = abc_file.name
    
    try:
        logger.info(f"Converting ABC to MIDI: {abc_path} -> {midi_path}")
        result = subprocess.run(
            ["abc2midi", abc_path, "-o", midi_path],
            capture_output=True,
            text=True,
            timeout=30
        )
        
        if result.returncode != 0:
            logger.error(f"abc2midi error: {result.stderr}")
            # Also log stdout as abc2midi often prints errors there
            logger.error(f"abc2midi stdout: {result.stdout}")
            return False
        
        # Check if MIDI file was created and has content
        if os.path.exists(midi_path):
            size = os.path.getsize(midi_path)
            logger.info(f"Generated MIDI size: {size} bytes")
            if size > 0:
                return True
            else:
                logger.error("abc2midi produced empty output")
                return False
        else:
            logger.error("abc2midi did not produce output file")
            return False
            
    except FileNotFoundError:
        logger.error("abc2midi not found - install with: brew install abcmidi")
        return False
    except subprocess.TimeoutExpired:
        logger.error("abc2midi timed out")
        return False
    except Exception as e:
        logger.error(f"abc2midi exception: {e}")
        return False
    finally:
        # Clean up temp ABC file
        if os.path.exists(abc_path):
            os.unlink(abc_path)


def fluidsynth_midi_to_wav(midi_path: str, wav_path: str, soundfont_path: str) -> bool:
    """
    Convert MIDI to WAV using FluidSynth command line.
    This avoids issues with the midi2audio library.
    """
    cmd = [
        "fluidsynth",
        "-ni",  # No interactive mode, no shell
        "-F", wav_path,  # Output file (must come before soundfont)
        "-r", "44100",  # Sample rate
        "-g", "1.0",  # Gain
        soundfont_path,
        midi_path,
    ]
    
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=60
        )
        if result.returncode != 0:
            logger.error(f"FluidSynth error: {result.stderr}")
            return False
        return os.path.exists(wav_path) and os.path.getsize(wav_path) > 0
    except subprocess.TimeoutExpired:
        logger.error("FluidSynth timed out")
        return False
    except Exception as e:
        logger.error(f"FluidSynth exception: {e}")
        return False


class SynthesizeRequest(BaseModel):
    abc: str
    format: str = "wav"


@app.get("/health")
def health_check():
    """Health check endpoint."""
    soundfont = find_soundfont()
    return {
        "status": "ok",
        "soundfont_found": soundfont is not None,
        "soundfont_path": str(soundfont) if soundfont else None,
        "soundfont_dir": str(SOUNDFONT_DIR),
    }


@app.post("/synthesize")
async def synthesize(request: SynthesizeRequest):
    """
    Convert ABC notation to audio.
    
    Pipeline:
    1. Parse ABC with music21
    2. Export to MIDI
    3. Synthesize MIDI to audio with FluidSynth
    """
    # Find SoundFont
    soundfont = find_soundfont()
    if soundfont is None:
        raise HTTPException(
            status_code=500,
            detail=f"No SoundFont (.sf2) found in {SOUNDFONT_DIR}. "
                   f"Download one from https://musical-artifacts.com/artifacts?formats=sf2"
        )

    abc_content = request.abc.strip()
    if not abc_content:
        raise HTTPException(status_code=400, detail="ABC notation is empty")

    midi_path = None
    audio_path = None
    
    with tempfile.NamedTemporaryFile(suffix=".mid", delete=False) as midi_file:
        midi_path = midi_file.name
    
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as audio_file:
        audio_path = audio_file.name

    try:
        # Convert ABC to MIDI using abc2midi (better multi-voice support)
        abc_success = abc2midi_convert(abc_content, midi_path)
        
        if not abc_success:
            # Fallback to music21 if abc2midi fails
            logger.info("abc2midi failed, falling back to music21")
            try:
                s = music21.converter.parse(abc_content, format='abc')
                from copy import deepcopy
                fresh_stream = music21.stream.Score()
                for part in s.parts:
                    new_part = music21.stream.Part()
                    for element in part.flatten().notesAndRests:
                        new_part.append(deepcopy(element))
                    fresh_stream.append(new_part)
                if len(fresh_stream.parts) == 0:
                    fresh_stream = s
                fresh_stream.write('midi', fp=midi_path)
            except Exception as e:
                logger.error(f"music21 fallback failed: {e}")
                raise Exception(f"ABC to MIDI conversion failed: {e}")

        # Synthesize to MIDI using direct FluidSynth call
        logger.info(f"Synthesizing with SoundFont: {soundfont}")
        success = fluidsynth_midi_to_wav(midi_path, audio_path, str(soundfont))
        
        if not success:
            raise Exception("FluidSynth synthesis failed")

        # Clean up MIDI file
        if midi_path and os.path.exists(midi_path):
            os.unlink(midi_path)

        # Return audio file
        logger.info(f"Returning audio file: {audio_path} ({os.path.getsize(audio_path)} bytes)")
        
        return FileResponse(
            audio_path,
            media_type="audio/wav",
            filename="dolce_output.wav",
        )

    except Exception as e:
        logger.error(f"Synthesis error: {e}")
        # Clean up temp files on error
        if midi_path and os.path.exists(midi_path):
            os.unlink(midi_path)
        if audio_path and os.path.exists(audio_path):
            os.unlink(audio_path)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    """
    Transcribe a WAV audio file to piano MIDI, then synthesize with SoundFont.
    
    Pipeline:
    1. Load uploaded WAV with librosa
    2. Transcribe to MIDI using piano_transcription_inference
    3. Synthesize MIDI to WAV with FluidSynth
    4. Return the synthesized audio
    """
    # Find SoundFont
    soundfont = find_soundfont()
    if soundfont is None:
        raise HTTPException(
            status_code=500,
            detail=f"No SoundFont (.sf2) found in {SOUNDFONT_DIR}."
        )

    # Create temp files
    input_wav_path = None
    midi_path = None
    output_wav_path = None

    try:
        # Save uploaded file
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as input_file:
            input_wav_path = input_file.name
            content = await file.read()
            input_file.write(content)
        
        logger.info(f"Received audio file: {file.filename} ({len(content)} bytes)")

        # Load audio with librosa at the correct sample rate
        logger.info(f"Loading audio with librosa...")
        audio, _ = librosa.load(input_wav_path, sr=pt_sample_rate, mono=True)
        logger.info(f"Audio loaded: {len(audio)} samples at {pt_sample_rate}Hz")

        # Transcribe to MIDI
        logger.info("Transcribing audio to MIDI...")
        transcriptor = get_transcriptor()
        
        with tempfile.NamedTemporaryFile(suffix=".mid", delete=False) as midi_file:
            midi_path = midi_file.name
        
        transcriptor.transcribe(audio, midi_path)
        logger.info(f"Transcription complete: {midi_path}")

        # Synthesize MIDI to WAV
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as output_file:
            output_wav_path = output_file.name

        logger.info(f"Synthesizing with SoundFont: {soundfont}")
        success = fluidsynth_midi_to_wav(midi_path, output_wav_path, str(soundfont))
        
        if not success:
            raise Exception("FluidSynth synthesis failed")

        # Clean up input and midi files
        if input_wav_path and os.path.exists(input_wav_path):
            os.unlink(input_wav_path)
        if midi_path and os.path.exists(midi_path):
            os.unlink(midi_path)

        logger.info(f"Returning synthesized audio: {output_wav_path}")
        return FileResponse(
            output_wav_path,
            media_type="audio/wav",
            filename="transcribed_output.wav",
        )

    except Exception as e:
        logger.error(f"Transcription error: {e}")
        # Clean up temp files on error
        for path in [input_wav_path, midi_path, output_wav_path]:
            if path and os.path.exists(path):
                os.unlink(path)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/transcribe-to-abc")
async def transcribe_to_abc(file: UploadFile = File(...)):
    """
    Transcribe a WAV audio file to piano and return ABC notation + audio.
    
    This endpoint returns both the ABC notation (for sheet music display)
    and the synthesized audio file (for playback).
    
    Returns JSON with:
    - abc: ABC notation string
    - audio_url: Path to download the audio
    """
    import base64
    
    # Find SoundFont
    soundfont = find_soundfont()
    if soundfont is None:
        raise HTTPException(
            status_code=500,
            detail=f"No SoundFont (.sf2) found in {SOUNDFONT_DIR}."
        )

    # Create temp files
    input_wav_path = None
    midi_path = None
    output_wav_path = None

    try:
        # Save uploaded file
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as input_file:
            input_wav_path = input_file.name
            content = await file.read()
            input_file.write(content)
        
        logger.info(f"[ABC] Received audio file: {file.filename} ({len(content)} bytes)")

        # Load audio with librosa at the correct sample rate
        logger.info("[ABC] Loading audio with librosa...")
        audio, _ = librosa.load(input_wav_path, sr=pt_sample_rate, mono=True)
        logger.info(f"[ABC] Audio loaded: {len(audio)} samples at {pt_sample_rate}Hz")

        # Transcribe to MIDI
        logger.info("[ABC] Transcribing audio to MIDI...")
        transcriptor = get_transcriptor()
        
        with tempfile.NamedTemporaryFile(suffix=".mid", delete=False) as midi_file:
            midi_path = midi_file.name
        
        transcriptor.transcribe(audio, midi_path)
        logger.info(f"[ABC] Transcription complete: {midi_path}")

        # Convert MIDI to ABC notation using music21
        logger.info("[ABC] Converting MIDI to ABC notation...")
        midi_score = music21.converter.parse(midi_path)
        
        # Extract ABC notation
        abc_notation = None
        try:
            # Create a simplified ABC representation
            abc_lines = [
                "X:1",
                f"T:Transcribed from {file.filename}",
                "C:Piano Transcription AI",
                "M:4/4",
                "L:1/8",
                "Q:1/4=120",
                "K:C",
                "%%MIDI program 0",
            ]
            
            # Get notes from the score
            notes_and_rests = list(midi_score.flatten().notesAndRests)[:200]  # Limit to first 200 elements
            
            abc_notes = []
            for element in notes_and_rests:
                if isinstance(element, music21.note.Note):
                    # Convert pitch to ABC notation
                    pitch_name = element.pitch.name.replace('-', 'b')  # Flat
                    octave = element.pitch.octave
                    
                    # ABC notation: C,, = C2, C, = C3, C = C4, c = C5, c' = C6
                    if octave <= 3:
                        abc_pitch = pitch_name.upper() + "," * (4 - octave)
                    elif octave == 4:
                        abc_pitch = pitch_name.upper()
                    elif octave == 5:
                        abc_pitch = pitch_name.lower()
                    else:
                        abc_pitch = pitch_name.lower() + "'" * (octave - 5)
                    
                    # Duration (simplified)
                    duration = element.duration.quarterLength
                    if duration >= 2:
                        abc_pitch += str(int(duration * 2))
                    elif duration == 0.5:
                        abc_pitch = abc_pitch  # eighth note is default
                    elif duration == 0.25:
                        abc_pitch += "/2"
                    
                    abc_notes.append(abc_pitch)
                elif isinstance(element, music21.note.Rest):
                    abc_notes.append("z")
                elif isinstance(element, music21.chord.Chord):
                    # Handle chords
                    chord_notes = []
                    for p in element.pitches:
                        pitch_name = p.name.replace('-', 'b')
                        octave = p.octave
                        if octave <= 3:
                            abc_pitch = pitch_name.upper() + "," * (4 - octave)
                        elif octave == 4:
                            abc_pitch = pitch_name.upper()
                        elif octave == 5:
                            abc_pitch = pitch_name.lower()
                        else:
                            abc_pitch = pitch_name.lower() + "'" * (octave - 5)
                        chord_notes.append(abc_pitch)
                    abc_notes.append("[" + "".join(chord_notes) + "]")
            
            # Group notes into measures (8 eighth notes per measure in 4/4)
            measures = []
            for i in range(0, len(abc_notes), 8):
                measure = " ".join(abc_notes[i:i+8])
                measures.append(measure)
            
            abc_lines.append(" | ".join(measures) + " |]")
            abc_notation = "\n".join(abc_lines)
            logger.info(f"[ABC] Generated ABC notation ({len(abc_notation)} chars)")
            
        except Exception as abc_error:
            logger.warning(f"[ABC] Could not generate ABC notation: {abc_error}")
            abc_notation = f"X:1\nT:Transcription Error\nK:C\nz4 |]"

        # Synthesize MIDI to WAV
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as output_file:
            output_wav_path = output_file.name

        logger.info(f"[ABC] Synthesizing with SoundFont: {soundfont}")
        success = fluidsynth_midi_to_wav(midi_path, output_wav_path, str(soundfont))
        
        if not success:
            raise Exception("FluidSynth synthesis failed")

        # Read audio file and encode as base64
        with open(output_wav_path, "rb") as audio_file:
            audio_base64 = base64.b64encode(audio_file.read()).decode('utf-8')

        # Clean up temp files
        for path in [input_wav_path, midi_path, output_wav_path]:
            if path and os.path.exists(path):
                os.unlink(path)

        logger.info("[ABC] Returning ABC notation and audio")
        return {
            "abc": abc_notation,
            "audio_base64": audio_base64,
            "device": DEVICE,
        }

    except Exception as e:
        logger.error(f"[ABC] Transcription error: {e}")
        # Clean up temp files on error
        for path in [input_wav_path, midi_path, output_wav_path]:
            if path and os.path.exists(path):
                os.unlink(path)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/")
def root():
    """Root endpoint with API info."""
    soundfont = find_soundfont()
    return {
        "name": "Dolce Audio Synthesis API",
        "device": DEVICE,
        "soundfont_status": "ready" if soundfont else "missing",
        "soundfont_path": str(soundfont) if soundfont else None,
        "endpoints": {
            "/health": "Health check",
            "/synthesize": "POST - Convert ABC to audio",
            "/transcribe": "POST - Transcribe WAV to piano MIDI and synthesize",
            "/transcribe-to-abc": "POST - Transcribe WAV and return ABC notation + audio",
        },
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
