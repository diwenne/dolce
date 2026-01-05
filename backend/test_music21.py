import music21
import os

abc_content = """
X: 1
T: Scale
M: 4/4
L: 1/4
K: C
C D E F | G A B c |
"""

try:
    print("Parsing ABC...")
    s = music21.converter.parse(abc_content, format='abc')
    print("Writing MIDI...")
    midi_path = "test_output.mid"
    s.write('midi', fp=midi_path)
    print(f"Success! MIDI created at {midi_path}")
    print(f"Size: {os.path.getsize(midi_path)} bytes")
except Exception as e:
    print(f"Error: {e}")
