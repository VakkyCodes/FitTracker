# FitTracker - Accurate Step Counter PWA

A free, accurate step counter that runs as a Progressive Web App (PWA) on your Android phone. No app store needed — just open a URL and install it to your home screen.

## Features

- **Accurate step detection** using accelerometer with multi-stage signal processing:
  - Low-pass filter for noise removal
  - High-pass filter to remove gravity
  - Dynamic threshold adaptation
  - Consecutive step validation (rejects random movements)
  - Cadence analysis for false-positive prevention

- **Real-time stats**: Steps, distance (km), calories burned, active time, pace
- **Progress ring** with daily goal tracking
- **Adjustable sensitivity**: Low / Medium / High
- **Customizable**: Step goal, stride length, body weight
- **History**: Last 7 days visible, 30 days stored
- **Offline capable**: Works without internet after first load
- **Installable**: Add to home screen like a native app
- **Privacy first**: All data stays on your device (localStorage)

## How to Deploy (Free)

### Option 1: GitHub Pages (Recommended)

1. Create a GitHub account at [github.com](https://github.com)
2. Create a new repository named `fittracker`
3. Upload all project files to the repository
4. Go to **Settings → Pages → Source** → select `main` branch
5. Your app will be live at `https://yourusername.github.io/fittracker/`

### Option 2: Netlify (Drag & Drop)

1. Go to [netlify.com](https://netlify.com) and sign up free
2. Drag the entire project folder onto the deploy area
3. Your app gets a URL like `https://random-name.netlify.app`

### Option 3: Vercel

1. Go to [vercel.com](https://vercel.com) and sign up free
2. Import your GitHub repo or drag & drop
3. Auto-deployed with a free URL

## How to Install on Android

1. Open the deployed URL in **Chrome** on your Android phone
2. You'll see an **"Add to Home Screen"** prompt (or tap the 3-dot menu → "Install app")
3. The app appears on your home screen like a regular app
4. Open it — it works offline!

## Tips for Maximum Accuracy

- **Keep your phone in your pocket** (front pocket or back pocket works best)
- The phone should move naturally with each step
- Start with **Medium sensitivity** — adjust if needed:
  - Too many false steps? → Switch to **Low**
  - Missing light steps? → Switch to **High**
- Set your **stride length** accurately (measure 10 steps, divide total distance by 10)
- The algorithm needs ~3 consistent steps before it starts counting (this prevents false positives)

## How the Algorithm Works

1. **Accelerometer data** (x, y, z) is read ~60 times/second
2. **Magnitude** is calculated: `√(x² + y² + z²)` — works regardless of phone orientation
3. **Low-pass filter** smooths out high-frequency vibrations
4. **High-pass filter** removes the constant gravity component, keeping only dynamic motion
5. **Peak detection** finds acceleration spikes that match walking/running patterns
6. **Dynamic threshold** adapts to your walking intensity in real time
7. **Step validation** requires 3+ consistent, rhythmic steps before counting — this eliminates false positives from random movements
8. **Cadence check** ensures detected steps fall within human walking/running range (30-220 steps/min)

## File Structure

```
FitTracker/
├── index.html          # Main app page
├── app.js              # Step detection algorithm & app logic
├── style.css           # Dark theme UI styles
├── sw.js               # Service worker for offline support
├── manifest.json       # PWA manifest for installation
├── icons/              # App icons for various sizes
│   ├── icon-72.png
│   ├── icon-96.png
│   ├── icon-128.png
│   ├── icon-144.png
│   ├── icon-152.png
│   ├── icon-192.png
│   ├── icon-384.png
│   ├── icon-512.png
│   └── icon.svg
├── generate-icons.html # Helper to regenerate nicer icons
└── README.md           # This file
```

## Customizing Icons

Open `generate-icons.html` in a browser to generate prettier icons with emoji. Right-click → Save each icon to the `icons/` folder, replacing the existing ones.

## License

Free to use. No attribution required.
