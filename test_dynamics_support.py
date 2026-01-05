
import subprocess
import os
import re
import tempfile

def preprocess_abc_with_dynamics(abc_content: str) -> str:
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
            
            # Skip V lines in header
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
             match = re.match(r'^V:\s*([\w\d]+)', stripped)
             if match:
                 voice_id = match.group(1)
                 processed_lines.append(f"V:{voice_id}")
                 continue
                 
        # DO NOT STRIP DYNAMICS
        # line = re.sub(r'![^!]+!', '', line)
        
        # Strip inline comments
        if '%' in line:
            line = line.split('%')[0].strip()
            
        processed_lines.append(line)
    
    return '\n'.join(processed_lines)

try:
    with open("/Users/diwenhuang/legato/furelise.txt", "r") as f:
        real_content = f.read()
except FileNotFoundError:
    print("test.txt not found")
    exit(1)

clean_abc = preprocess_abc_with_dynamics(real_content)

print(f"Preprocessed with dynamics size: {len(clean_abc)}")
print(f"Head:\n{clean_abc[:200]}")

with tempfile.NamedTemporaryFile(mode='w', suffix='.abc', delete=False) as abc_file:
    abc_file.write(clean_abc)
    abc_path = abc_file.name

midi_path = abc_path.replace('.abc', '.mid')

try:
    print(f"Converting {abc_path} -> {midi_path}")
    result = subprocess.run(
        ["abc2midi", abc_path, "-o", midi_path],
        capture_output=True,
        text=True,
        timeout=30
    )
    
    print(f"Return code: {result.returncode}")
    print(f"Stderr: {result.stderr}")
    
    if os.path.exists(midi_path):
        size = os.path.getsize(midi_path)
        print(f"MIDI size: {size} bytes")
    else:
        print("No MIDI file created")

finally:
    if os.path.exists(abc_path):
        os.unlink(abc_path)
    if os.path.exists(midi_path):
        os.unlink(midi_path)
