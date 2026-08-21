"""
=== DOOOODLE — One-Click Colab Backend ===
Paste this entire file into a SINGLE Colab cell and run it.
Prerequisites: Set runtime to GPU (Runtime > Change runtime type > T4 GPU)

Replace NGROK_TOKEN below with your token from:
https://dashboard.ngrok.com/get-started/your-authtoken
"""

NGROK_TOKEN = "PASTE_YOUR_NGROK_TOKEN_HERE"

# ===========================================================
import subprocess, sys, os, time

def run(cmd, check=True):
    print(f"\n{'='*60}\n▶ {cmd}\n{'='*60}")
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if result.stdout.strip():
        # Only print last 20 lines to keep output manageable
        lines = result.stdout.strip().split('\n')
        if len(lines) > 20:
            print(f"  ... ({len(lines)-20} lines hidden)")
        for line in lines[-20:]:
            print(f"  {line}")
    if result.returncode != 0 and check:
        print(f"  ❌ STDERR: {result.stderr.strip()[-500:]}")
        raise RuntimeError(f"Command failed: {cmd}")
    return result

# --- Step 1: Clone the repo ---
os.chdir("/content")
if os.path.exists("Doooooodle"):
    run("rm -rf Doooooodle")
run("git clone https://github.com/Manas-bhavsar/Doooooodle.git")
os.chdir("/content/Doooooodle")
assert os.path.exists("backend/app.py"), "❌ backend/app.py not found after clone!"
print("\n✅ Repo cloned successfully")

# --- Step 2: Install dependencies ---
run(f"{sys.executable} -m pip install -q --upgrade pip")
run(f"{sys.executable} -m pip install -q flask flask-cors pillow pypdfium2 numpy opencv-python-headless")
run(f"{sys.executable} -m pip install -q paddlepaddle-gpu paddleocr")
run(f"{sys.executable} -m pip install -q transformers sentencepiece accelerate safetensors")
run(f"{sys.executable} -m pip install -q datasets evaluate jiwer pandas")
run(f"{sys.executable} -m pip install -q pyngrok")
print("\n✅ All dependencies installed")

# --- Step 3: Quick sanity check ---
print("\n🔍 Verifying imports...")
check_code = """
import torch
print(f"  PyTorch: {torch.__version__}, CUDA: {torch.cuda.is_available()}")
from transformers import TrOCRProcessor, VisionEncoderDecoderModel
print("  Transformers: OK")
from paddleocr import PaddleOCR
print("  PaddleOCR: OK")
from flask import Flask
print("  Flask: OK")
"""
result = subprocess.run([sys.executable, "-c", check_code], capture_output=True, text=True, cwd="/content/Doooooodle")
print(result.stdout)
if result.returncode != 0:
    print(f"❌ Import check failed:\n{result.stderr[-1000:]}")
    raise RuntimeError("Dependencies broken")
print("✅ All imports verified")

# --- Step 4: Start Flask backend ---
print("\n🚀 Starting Flask backend...")
env = os.environ.copy()
env["USE_TF"] = "0"
proc = subprocess.Popen(
    [sys.executable, "backend/app.py"],
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    cwd="/content/Doooooodle",
    env=env
)

# Wait for it to be ready
for i in range(30):
    time.sleep(2)
    try:
        import requests
        r = requests.get("http://localhost:5000/health", timeout=3)
        if r.status_code == 200:
            print(f"✅ Backend is healthy: {r.json()}")
            break
    except:
        pass
    if i == 29:
        output = proc.stdout.read(3000).decode() if proc.stdout else "no output"
        print(f"❌ Backend didn't start in 60s. Logs:\n{output}")
        raise RuntimeError("Backend failed to start")
    print(f"  Waiting... ({(i+1)*2}s)")

# --- Step 5: Start ngrok tunnel ---
print("\n🌐 Setting up ngrok tunnel...")
from pyngrok import ngrok
ngrok.set_auth_token(NGROK_TOKEN)

# Kill any existing tunnels
for tunnel in ngrok.get_tunnels():
    ngrok.disconnect(tunnel.public_url)

public_url = ngrok.connect(5000, "http").public_url

print(f"""
{'='*60}
🎉 DONE! Your backend is live.
{'='*60}

🔗 Backend URL: {public_url}

📋 Next steps on your LOCAL machine:
   1. Open frontend/.env.local
   2. Set: NEXT_PUBLIC_API_URL={public_url}
   3. Run: cd frontend && npm run dev
   4. Open: http://localhost:3000

⚠️  Keep this Colab tab open!
    Free tier disconnects after ~90 min of inactivity.
{'='*60}
""")

# Keep the cell alive (prevents Colab from thinking execution ended)
print("Backend logs (live):")
while True:
    line = proc.stdout.readline()
    if line:
        print(f"  {line.decode().rstrip()}")
    if proc.poll() is not None:
        print("❌ Backend process died!")
        break
    time.sleep(0.1)
