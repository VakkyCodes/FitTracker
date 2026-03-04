/**
 * FitTracker - Step Counter PWA with USP Features
 * 
 * USPs that other apps don't have:
 * 1. Self-calibration wizard (walk 20 steps to auto-tune)
 * 2. 100% Privacy Dashboard with proof
 * 3. Achievement & Streak system (no account needed)
 * 4. Quick Walking Challenges
 * 5. Full CSV data export
 * 6. Open source, zero tracking, zero ads
 */

(function () {
    'use strict';

    // ==================== CONFIG ====================
    const CONFIG = {
        SAMPLE_RATE: 60,
        LOW_PASS_ALPHA: 0.3,
        HIGH_PASS_ALPHA: 0.8,
        THRESHOLDS: {
            low:    { peak: 1.8, minInterval: 400, maxInterval: 2000 },
            medium: { peak: 1.2, minInterval: 333, maxInterval: 2000 },
            high:   { peak: 0.8, minInterval: 300, maxInterval: 2500 }
        },
        DYNAMIC_THRESHOLD_WINDOW: 40,
        DYNAMIC_THRESHOLD_FACTOR: 0.6,
        MIN_CONSECUTIVE_STEPS: 3,
        CONSECUTIVE_WINDOW_MS: 4000,
        CADENCE_MIN: 30,
        CADENCE_MAX: 220,
        CALORIES_PER_STEP: 0.04,
        PACE_WINDOW_MS: 10000,
        AUTO_SAVE_INTERVAL: 30000,
        SENSOR_TEST_TIMEOUT: 3000,
    };

    // ==================== ACHIEVEMENTS DEFINITION ====================
    const ACHIEVEMENTS = [
        { id: 'first_step',   icon: '👶', name: 'First Step',     desc: 'Count your first step',        check: s => s.totalSteps >= 1 },
        { id: 'century',      icon: '💯', name: 'Century',        desc: 'Walk 100 steps in a day',      check: s => s.todaySteps >= 100 },
        { id: 'half_k',       icon: '🚶', name: 'Half K',         desc: '500 steps in a day',           check: s => s.todaySteps >= 500 },
        { id: 'one_k',        icon: '🏃', name: '1K Club',        desc: '1,000 steps in a day',         check: s => s.todaySteps >= 1000 },
        { id: 'five_k',       icon: '⭐', name: '5K Steps',       desc: '5,000 steps in a day',         check: s => s.todaySteps >= 5000 },
        { id: 'ten_k',        icon: '🏆', name: '10K Champion',   desc: '10,000 steps in a day',        check: s => s.todaySteps >= 10000 },
        { id: 'twenty_k',     icon: '👑', name: 'Marathon Mind',  desc: '20,000 steps in a day',        check: s => s.todaySteps >= 20000 },
        { id: 'streak_3',     icon: '🔥', name: 'On Fire',        desc: '3-day streak',                 check: s => s.streak >= 3 },
        { id: 'streak_7',     icon: '💪', name: 'Week Warrior',   desc: '7-day streak',                 check: s => s.streak >= 7 },
        { id: 'streak_30',    icon: '🌟', name: 'Monthly Legend',  desc: '30-day streak',                check: s => s.streak >= 30 },
        { id: 'calibrated',   icon: '🎯', name: 'Precision',      desc: 'Complete calibration',         check: s => s.calibrated },
        { id: 'challenge_w',  icon: '⚡', name: 'Challenger',     desc: 'Win a challenge',              check: s => s.challengesWon >= 1 },
    ];

    // ==================== STATE ====================
    let state = {
        isTracking: false,
        steps: 0,
        startTime: null,
        elapsedMs: 0,
        lastTickTime: null,

        mode: 'sensor',
        sensorAvailable: false,
        sensorTested: false,
        motionDataReceived: false,

        filteredBuffer: [],
        lowPassValue: null,
        highPassValue: 0,
        prevFilteredAccel: 0,

        lastPeakTime: 0,
        lastValleyTime: 0,
        isPeakPhase: true,
        currentMax: -Infinity,
        currentMin: Infinity,

        pendingSteps: [],
        validatedStepTimes: [],
        dynamicThreshold: 1.2,
        amplitudeHistory: [],

        sensitivity: 'medium',
        stepGoal: 10000,
        strideLength: 75,
        bodyWeight: 70,

        // Achievements & streaks
        unlockedAchievements: [],
        streak: 0,
        bestStreak: 0,
        totalStepsAllTime: 0,
        challengesWon: 0,

        // Challenge
        challengeActive: false,
        challengeGoalSteps: 0,
        challengeTimeMs: 0,
        challengeStartSteps: 0,
        challengeStartTime: 0,

        // Calibration
        isCalibrating: false,
        calibrationPeaks: 0,
        calibrationData: [],
        calibrated: false,

        // Background tracking
        wakeLock: null,
        silentAudioCtx: null,
        silentSource: null,
        backgroundKeepAlive: false,
    };

    const els = {};

    // ==================== DOM CACHE ====================
    function cacheDom() {
        els.permissionScreen = document.getElementById('permission-screen');
        els.trackerScreen = document.getElementById('tracker-screen');
        els.startBtn = document.getElementById('start-btn');
        els.toggleBtn = document.getElementById('toggle-btn');
        els.toggleIcon = document.getElementById('toggle-icon');
        els.toggleText = document.getElementById('toggle-text');
        els.resetBtn = document.getElementById('reset-btn');
        els.stepCount = document.getElementById('step-count');
        els.distance = document.getElementById('distance');
        els.calories = document.getElementById('calories');
        els.duration = document.getElementById('duration');
        els.pace = document.getElementById('pace');
        els.progressRing = document.getElementById('progress-ring');
        els.stepGoalText = document.getElementById('step-goal-text');
        els.currentDate = document.getElementById('current-date');
        els.historyList = document.getElementById('history-list');

        els.statusBanner = document.getElementById('status-banner');
        els.statusIcon = document.getElementById('status-icon');
        els.statusMessage = document.getElementById('status-message');
        els.modeBadge = document.getElementById('mode-badge');

        els.manualStepSection = document.getElementById('manual-step-section');
        els.manualStepBtn = document.getElementById('manual-step-btn');

        // Streak
        els.streakBanner = document.getElementById('streak-banner');
        els.streakCount = document.getElementById('streak-count');
        els.streakBest = document.getElementById('streak-best');
        els.streakIcon = document.getElementById('streak-icon');

        // Achievements
        els.achievementsGrid = document.getElementById('achievements-grid');

        // Challenge
        els.challengeButtons = document.getElementById('challenge-buttons');
        els.challengeActive = document.getElementById('challenge-active');
        els.challengeResult = document.getElementById('challenge-result');
        els.challengeTitle = document.getElementById('challenge-title');
        els.challengeBar = document.getElementById('challenge-bar');
        els.challengeSteps = document.getElementById('challenge-steps');
        els.challengeTimer = document.getElementById('challenge-timer');
        els.challengeCancel = document.getElementById('challenge-cancel');
        els.challengeResultText = document.getElementById('challenge-result-text');
        els.challengeDismiss = document.getElementById('challenge-dismiss');

        // Privacy
        els.storageUsed = document.getElementById('storage-used');
        els.exportBtn = document.getElementById('export-btn');
        els.deleteAllBtn = document.getElementById('delete-all-btn');

        // Calibration
        els.calibrateBtn = document.getElementById('calibrate-btn');
        els.calibrationActive = document.getElementById('calibration-active');
        els.calibrationStatus = document.getElementById('calibration-status');
        els.calibrationCount = document.getElementById('calibration-count');
        els.calibrateDoneBtn = document.getElementById('calibrate-done-btn');
        els.calibrateCancelBtn = document.getElementById('calibrate-cancel-btn');
        els.calibrationResult = document.getElementById('calibration-result');
        els.calibrationResultText = document.getElementById('calibration-result-text');
        els.calibrationDismiss = document.getElementById('calibration-dismiss');
        els.calibrationStatusLine = document.getElementById('calibration-status-line');

        // Settings
        els.stepGoalInput = document.getElementById('step-goal');
        els.strideLengthInput = document.getElementById('stride-length');
        els.bodyWeightInput = document.getElementById('body-weight');
        els.sensitivitySelect = document.getElementById('sensitivity');

        els.debugSection = document.getElementById('debug-section');
        els.debugOutput = document.getElementById('debug-output');
        els.debugToggle = document.getElementById('debug-toggle');

        // Background tracking
        els.bgToggle = document.getElementById('bg-toggle');
        els.bgStatus = document.getElementById('bg-status');
        els.bgIndicator = document.getElementById('bg-indicator');
    }

    // ==================== INIT ====================
    function init() {
        cacheDom();
        loadSettings();
        loadTodayData();
        loadAchievements();
        loadHistory();
        calculateStreak();
        setupEventListeners();
        updateDateDisplay();
        renderAchievements();
        updateStreakUI();
        updateStorageUsed();
        updateCalibrationStatus();
        updateUI();

        if ('serviceWorker' in navigator && location.protocol === 'https:') {
            navigator.serviceWorker.register('sw.js').catch(() => {});
        }

        checkSensorPermission();
        setInterval(autoSave, CONFIG.AUTO_SAVE_INTERVAL);
        setInterval(checkMidnightReset, 60000);

        // Restore background mode preference
        if (els.bgToggle) {
            const bgPref = localStorage.getItem('fittracker_bgMode');
            els.bgToggle.checked = bgPref === '1';
        }

        // Auto-resume tracking if page was killed while tracking
        if (state._shouldAutoResume) {
            delete state._shouldAutoResume;
            setTimeout(() => {
                startTracking();
                showStatus('info', '🔄', 'Tracking auto-resumed from previous session');
                setTimeout(() => {
                    if (!els.statusBanner.classList.contains('status-error')) {
                        els.statusBanner.classList.add('hidden');
                    }
                }, 3000);
            }, 500);
        }
    }

    // ==================== SENSOR DETECTION ====================
    async function checkSensorPermission() {
        if (typeof DeviceMotionEvent === 'undefined') {
            state.sensorAvailable = false;
            state.sensorTested = true;
            showTrackerScreen();
            switchToManualMode('Motion sensors not supported in this browser.');
            return;
        }
        if (typeof DeviceMotionEvent.requestPermission === 'function') {
            return;
        }
        showTrackerScreen();
        showStatus('info', '📡', 'Testing motion sensors...');
        testSensorAvailability();
    }

    function testSensorAvailability() {
        let received = false;
        const testHandler = (e) => {
            const acc = e.accelerationIncludingGravity || e.acceleration;
            if (acc && (acc.x !== null || acc.y !== null || acc.z !== null)) {
                received = true;
                state.motionDataReceived = true;
                state.sensorAvailable = true;
                state.sensorTested = true;
                state.mode = 'sensor';
                window.removeEventListener('devicemotion', testHandler);
                showStatus('success', '✅', 'Sensors active! Tap Start and put phone in pocket.');
                updateModeBadge();
                setTimeout(() => {
                    if (els.statusBanner.classList.contains('status-success')) {
                        els.statusBanner.classList.add('hidden');
                    }
                }, 4000);
            }
        };
        window.addEventListener('devicemotion', testHandler);
        setTimeout(() => {
            if (!received) {
                window.removeEventListener('devicemotion', testHandler);
                state.sensorAvailable = false;
                state.sensorTested = true;
                const isSecure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
                if (!isSecure) {
                    switchToManualMode('Sensors blocked — HTTPS required! Deploy to GitHub Pages (free) for auto step detection. Using manual tap for now.');
                } else {
                    switchToManualMode('No sensor data received. Using manual tap mode.');
                }
            }
        }, CONFIG.SENSOR_TEST_TIMEOUT);
    }

    function switchToManualMode(message) {
        state.mode = 'manual';
        showStatus('error', '👆', message);
        els.manualStepSection.classList.remove('hidden');
        updateModeBadge();
    }

    function showStatus(type, icon, message) {
        els.statusBanner.classList.remove('hidden', 'status-error', 'status-success');
        if (type === 'error') els.statusBanner.classList.add('status-error');
        if (type === 'success') els.statusBanner.classList.add('status-success');
        els.statusIcon.textContent = icon;
        els.statusMessage.textContent = message;
    }

    function updateModeBadge() {
        els.modeBadge.classList.remove('sensor-active', 'manual-active');
        if (state.mode === 'sensor') {
            els.modeBadge.textContent = '📡 Sensor Mode';
            els.modeBadge.classList.add('sensor-active');
        } else {
            els.modeBadge.textContent = '👆 Manual Mode';
            els.modeBadge.classList.add('manual-active');
        }
    }

    function showTrackerScreen() {
        els.permissionScreen.classList.add('hidden');
        els.trackerScreen.classList.remove('hidden');
    }

    // ==================== EVENTS ====================
    function setupEventListeners() {
        els.startBtn.addEventListener('click', requestMotionPermission);
        els.toggleBtn.addEventListener('click', toggleTracking);
        els.resetBtn.addEventListener('click', resetCounter);
        els.manualStepBtn.addEventListener('click', handleManualStep);

        // Settings
        els.stepGoalInput.addEventListener('change', () => {
            state.stepGoal = parseInt(els.stepGoalInput.value) || 10000;
            els.stepGoalText.textContent = `Goal: ${state.stepGoal.toLocaleString()}`;
            saveSettings(); updateProgressRing();
        });
        els.strideLengthInput.addEventListener('change', () => {
            state.strideLength = parseInt(els.strideLengthInput.value) || 75;
            saveSettings(); updateUI();
        });
        els.bodyWeightInput.addEventListener('change', () => {
            state.bodyWeight = parseInt(els.bodyWeightInput.value) || 70;
            saveSettings(); updateUI();
        });
        els.sensitivitySelect.addEventListener('change', () => {
            state.sensitivity = els.sensitivitySelect.value;
            saveSettings();
        });
        els.debugToggle.addEventListener('click', () => {
            els.debugSection.classList.toggle('hidden');
        });

        // Challenge buttons
        els.challengeButtons.querySelectorAll('.btn-challenge').forEach(btn => {
            btn.addEventListener('click', () => {
                startChallenge(parseInt(btn.dataset.steps), parseInt(btn.dataset.time));
            });
        });
        els.challengeCancel.addEventListener('click', cancelChallenge);
        els.challengeDismiss.addEventListener('click', dismissChallengeResult);

        // Privacy
        els.exportBtn.addEventListener('click', exportCSV);
        els.deleteAllBtn.addEventListener('click', deleteAllData);

        // Calibration
        els.calibrateBtn.addEventListener('click', startCalibration);
        els.calibrateDoneBtn.addEventListener('click', finishCalibration);
        els.calibrateCancelBtn.addEventListener('click', cancelCalibration);
        els.calibrationDismiss.addEventListener('click', () => {
            els.calibrationResult.classList.add('hidden');
            els.calibrateBtn.style.display = '';
        });

        // Background tracking toggle
        if (els.bgToggle) {
            els.bgToggle.addEventListener('change', toggleBackgroundMode);
        }

        document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    async function requestMotionPermission() {
        try {
            if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                const permission = await DeviceMotionEvent.requestPermission();
                if (permission === 'granted') { showTrackerScreen(); testSensorAvailability(); }
                else { showTrackerScreen(); switchToManualMode('Sensor permission denied.'); }
            } else {
                showTrackerScreen();
                if (!state.sensorTested) testSensorAvailability();
            }
        } catch (err) {
            showTrackerScreen();
            switchToManualMode('Could not access sensors.');
        }
    }

    // ==================== MANUAL STEP ====================
    function handleManualStep() {
        if (!state.isTracking) startTracking();
        state.steps++;
        state.totalStepsAllTime++;
        state.validatedStepTimes.push(Date.now());
        const cutoff = Date.now() - CONFIG.PACE_WINDOW_MS;
        state.validatedStepTimes = state.validatedStepTimes.filter(t => t > cutoff);
        updateUI();
        checkAchievements();
        updateChallengeProgress();
        quickSave();
        if (navigator.vibrate) navigator.vibrate(30);
        els.manualStepBtn.style.transform = 'scale(0.95)';
        setTimeout(() => { els.manualStepBtn.style.transform = ''; }, 100);
    }

    // ==================== TRACKING ====================
    function toggleTracking() {
        state.isTracking ? stopTracking() : startTracking();
    }

    function startTracking() {
        state.isTracking = true;
        state.lastTickTime = Date.now();
        if (!state.startTime) state.startTime = Date.now();

        if (state.sensorAvailable || !state.sensorTested) {
            window.addEventListener('devicemotion', handleMotion, { frequency: CONFIG.SAMPLE_RATE });
            if (!state.sensorTested) {
                setTimeout(() => {
                    if (!state.motionDataReceived && state.isTracking) {
                        const isSecure = location.protocol === 'https:' || location.hostname === 'localhost';
                        switchToManualMode(isSecure ? 'No sensor data. Use manual tap.' : 'Sensors blocked — HTTPS required!');
                    }
                }, CONFIG.SENSOR_TEST_TIMEOUT);
            }
        }

        // Enable background keep-alive if toggle is on
        if (els.bgToggle && els.bgToggle.checked) {
            enableBackgroundKeepAlive();
        }

        state.timerInterval = setInterval(updateTimer, 1000);
        els.toggleBtn.classList.remove('btn-start');
        els.toggleBtn.classList.add('btn-pause');
        els.toggleIcon.textContent = '⏸';
        els.toggleText.textContent = 'Pause';
        if (navigator.vibrate) navigator.vibrate(50);
    }

    function stopTracking() {
        state.isTracking = false;
        window.removeEventListener('devicemotion', handleMotion);
        if (state.timerInterval) { clearInterval(state.timerInterval); state.timerInterval = null; }
        if (state.lastTickTime) { state.elapsedMs += Date.now() - state.lastTickTime; state.lastTickTime = null; }
        disableBackgroundKeepAlive();
        els.toggleBtn.classList.remove('btn-pause');
        els.toggleBtn.classList.add('btn-start');
        els.toggleIcon.textContent = '▶';
        els.toggleText.textContent = 'Start';
        autoSave();
    }

    // ==================== BACKGROUND KEEP-ALIVE ====================
    function toggleBackgroundMode() {
        if (els.bgToggle.checked) {
            if (state.isTracking) enableBackgroundKeepAlive();
            updateBgStatus('on');
        } else {
            disableBackgroundKeepAlive();
            updateBgStatus('off');
        }
        localStorage.setItem('fittracker_bgMode', els.bgToggle.checked ? '1' : '0');
    }

    function enableBackgroundKeepAlive() {
        if (state.backgroundKeepAlive) return;
        state.backgroundKeepAlive = true;

        // 1) Screen Wake Lock — keeps screen on (dimmed) so JS runs
        requestWakeLock();

        // 2) Silent Audio — the real trick for screen-off on Android
        //    Chrome keeps the page alive if audio is playing
        startSilentAudio();

        updateBgStatus('active');
    }

    function disableBackgroundKeepAlive() {
        state.backgroundKeepAlive = false;

        // Release wake lock
        if (state.wakeLock) {
            state.wakeLock.release().catch(() => {});
            state.wakeLock = null;
        }

        // Stop silent audio
        stopSilentAudio();

        updateBgStatus(els.bgToggle && els.bgToggle.checked ? 'on' : 'off');
    }

    async function requestWakeLock() {
        try {
            if ('wakeLock' in navigator) {
                state.wakeLock = await navigator.wakeLock.request('screen');
                state.wakeLock.addEventListener('release', () => {
                    // Re-acquire if still tracking
                    if (state.isTracking && state.backgroundKeepAlive) {
                        setTimeout(() => requestWakeLock(), 1000);
                    }
                });
            }
        } catch (e) {
            // Wake Lock not available or denied — silent audio still works
        }
    }

    function startSilentAudio() {
        try {
            if (state.silentAudioCtx) return;
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;

            state.silentAudioCtx = new AudioContext();

            // Create a silent oscillator (gain = 0 → no sound)
            const oscillator = state.silentAudioCtx.createOscillator();
            const gainNode = state.silentAudioCtx.createGain();
            gainNode.gain.value = 0.001; // near-silent (0 may be optimized away)
            oscillator.frequency.value = 1; // 1 Hz — below human hearing
            oscillator.connect(gainNode);
            gainNode.connect(state.silentAudioCtx.destination);
            oscillator.start();
            state.silentSource = oscillator;

            // Also create a media element as backup (some Chrome versions need this)
            if (!state.silentAudioEl) {
                const audio = document.createElement('audio');
                // Tiny silent WAV (44 bytes header + minimal data) as base64
                audio.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
                audio.loop = true;
                audio.volume = 0.01;
                audio.setAttribute('playsinline', '');
                state.silentAudioEl = audio;
            }
            state.silentAudioEl.play().catch(() => {});
        } catch (e) {
            // Audio not available
        }
    }

    function stopSilentAudio() {
        if (state.silentSource) {
            try { state.silentSource.stop(); } catch (e) {}
            state.silentSource = null;
        }
        if (state.silentAudioCtx) {
            try { state.silentAudioCtx.close(); } catch (e) {}
            state.silentAudioCtx = null;
        }
        if (state.silentAudioEl) {
            state.silentAudioEl.pause();
            state.silentAudioEl.currentTime = 0;
        }
    }

    function handleVisibilityChange() {
        if (document.visibilityState === 'visible') {
            if (state.isTracking) {
                // Resume ticking from now — elapsed time was already accumulated on hide
                state.lastTickTime = Date.now();
                // Re-acquire wake lock (it may have been released)
                if (state.backgroundKeepAlive) requestWakeLock();
            }
            updateUI();
        } else {
            // Going to background — accumulate elapsed time and save IMMEDIATELY
            if (state.isTracking && state.lastTickTime) {
                state.elapsedMs += Date.now() - state.lastTickTime;
                state.lastTickTime = null; // prevent double-counting
                saveTodayData();
                saveSettings();
            }
        }
    }

    function updateBgStatus(status) {
        if (!els.bgStatus) return;
        if (status === 'active') {
            els.bgStatus.textContent = '🟢 Background tracking active';
            els.bgStatus.className = 'bg-status bg-active';
            if (els.bgIndicator) els.bgIndicator.classList.remove('hidden');
        } else if (status === 'on') {
            els.bgStatus.textContent = 'Will activate when tracking starts';
            els.bgStatus.className = 'bg-status bg-standby';
            if (els.bgIndicator) els.bgIndicator.classList.add('hidden');
        } else {
            els.bgStatus.textContent = '';
            els.bgStatus.className = 'bg-status';
            if (els.bgIndicator) els.bgIndicator.classList.add('hidden');
        }
    }

    function resetCounter() {
        if (state.steps > 0) {
            if (!confirm('Save current session and reset?')) return;
            saveToHistory();
        }
        stopTracking();
        state.steps = 0; state.startTime = null; state.elapsedMs = 0; state.lastTickTime = null;
        state.pendingSteps = []; state.validatedStepTimes = [];
        state.filteredBuffer = []; state.lowPassValue = null; state.highPassValue = 0; state.prevFilteredAccel = 0;
        state.lastPeakTime = 0; state.lastValleyTime = 0; state.isPeakPhase = true;
        state.currentMax = -Infinity; state.currentMin = Infinity;
        state.dynamicThreshold = CONFIG.THRESHOLDS[state.sensitivity].peak;
        state.amplitudeHistory = [];
        saveTodayData(); updateUI();
    }

    // ==================== STEP DETECTION ====================
    function handleMotion(event) {
        if (!state.motionDataReceived) {
            state.motionDataReceived = true; state.sensorAvailable = true; state.sensorTested = true; state.mode = 'sensor';
            els.manualStepSection.classList.add('hidden');
            showStatus('success', '✅', 'Sensors working! Counting automatically.');
            updateModeBadge();
            setTimeout(() => { if (els.statusBanner.classList.contains('status-success')) els.statusBanner.classList.add('hidden'); }, 3000);
        }

        const acc = event.accelerationIncludingGravity;
        if (!acc || acc.x === null) return;

        const now = Date.now();
        const x = acc.x || 0, y = acc.y || 0, z = acc.z || 0;
        const magnitude = Math.sqrt(x * x + y * y + z * z);

        if (state.lowPassValue === null) state.lowPassValue = magnitude;
        state.lowPassValue += CONFIG.LOW_PASS_ALPHA * (magnitude - state.lowPassValue);

        const filteredAccel = CONFIG.HIGH_PASS_ALPHA * (state.highPassValue + state.lowPassValue - state.prevFilteredAccel);
        state.highPassValue = filteredAccel;
        state.prevFilteredAccel = state.lowPassValue;
        const processedValue = Math.abs(filteredAccel);

        state.filteredBuffer.push({ value: processedValue, time: now });
        if (state.filteredBuffer.length > 200) state.filteredBuffer = state.filteredBuffer.slice(-100);

        // Calibration mode: collect raw peaks
        if (state.isCalibrating) {
            state.calibrationData.push({ value: processedValue, time: now, magnitude });
            detectCalibrationPeak(processedValue, now);
        }

        if (state.isTracking && !state.isCalibrating) {
            detectStep(processedValue, now);
        }

        updateDebug(x, y, z, magnitude, processedValue);
    }

    function detectStep(value, now) {
        const thresholds = CONFIG.THRESHOLDS[state.sensitivity];
        state.amplitudeHistory.push(value);
        if (state.amplitudeHistory.length > CONFIG.DYNAMIC_THRESHOLD_WINDOW) state.amplitudeHistory.shift();

        if (state.amplitudeHistory.length >= 10) {
            const sorted = [...state.amplitudeHistory].sort((a, b) => b - a);
            const topAmplitude = sorted[Math.floor(sorted.length * 0.2)];
            state.dynamicThreshold = Math.max(thresholds.peak * 0.5, Math.min(topAmplitude * CONFIG.DYNAMIC_THRESHOLD_FACTOR, thresholds.peak * 2.0));
        }

        const effectiveThreshold = state.dynamicThreshold;

        if (state.isPeakPhase) {
            if (value > state.currentMax) state.currentMax = value;
            if (value < state.currentMax * 0.5 && state.currentMax > effectiveThreshold) {
                const timeSinceLastPeak = now - state.lastPeakTime;
                if (timeSinceLastPeak >= thresholds.minInterval && timeSinceLastPeak <= thresholds.maxInterval) {
                    registerStepCandidate(now, timeSinceLastPeak);
                } else if (timeSinceLastPeak > thresholds.maxInterval) {
                    state.pendingSteps = [{ time: now, interval: 0 }];
                }
                state.lastPeakTime = now;
                state.isPeakPhase = false;
                state.currentMin = Infinity;
            }
        } else {
            if (value < state.currentMin) state.currentMin = value;
            if (value > state.currentMin + effectiveThreshold * 0.3) {
                state.isPeakPhase = true;
                state.currentMax = value;
                state.lastValleyTime = now;
            }
        }
    }

    function registerStepCandidate(time, interval) {
        state.pendingSteps.push({ time, interval });
        state.pendingSteps = state.pendingSteps.filter(s => time - s.time < CONFIG.CONSECUTIVE_WINDOW_MS);

        if (state.pendingSteps.length >= CONFIG.MIN_CONSECUTIVE_STEPS) {
            const intervals = state.pendingSteps.filter(s => s.interval > 0).map(s => s.interval);
            if (intervals.length >= 2) {
                const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
                const cadence = 60000 / avgInterval;
                if (cadence >= CONFIG.CADENCE_MIN && cadence <= CONFIG.CADENCE_MAX) {
                    const variance = intervals.reduce((sum, v) => sum + Math.pow(v - avgInterval, 2), 0) / intervals.length;
                    if (Math.sqrt(variance) / avgInterval < 0.5) {
                        const newSteps = state.pendingSteps.filter(s => !state.validatedStepTimes.includes(s.time));
                        newSteps.forEach(s => {
                            state.steps++;
                            state.totalStepsAllTime++;
                            state.validatedStepTimes.push(s.time);
                        });
                        const cutoff = Date.now() - CONFIG.PACE_WINDOW_MS;
                        state.validatedStepTimes = state.validatedStepTimes.filter(t => t > cutoff || t === time);
                        if (newSteps.length > 0) {
                            updateUI();
                            checkAchievements();
                            updateChallengeProgress();
                            quickSave();
                            if (state.steps % 100 === 0 && navigator.vibrate) navigator.vibrate([50, 30, 50]);
                        }
                    }
                }
            }
        }
    }

    // ==================== CALIBRATION ====================
    let calPeakState = { max: -Infinity, isPeak: true, lastPeakTime: 0, threshold: 0.8 };

    function startCalibration() {
        if (!state.sensorAvailable && state.mode !== 'manual') {
            alert('Sensors must be active for calibration. Please deploy on HTTPS first.');
            return;
        }
        state.isCalibrating = true;
        state.calibrationPeaks = 0;
        state.calibrationData = [];
        calPeakState = { max: -Infinity, isPeak: true, lastPeakTime: 0, threshold: 0.5 };

        els.calibrateBtn.style.display = 'none';
        els.calibrationActive.classList.remove('hidden');
        els.calibrationResult.classList.add('hidden');
        els.calibrationCount.textContent = '0';
        els.calibrationStatus.textContent = 'Walk 20 steps now...';

        // Also start sensor if not already running
        if (!state.isTracking) {
            window.addEventListener('devicemotion', handleMotion, { frequency: CONFIG.SAMPLE_RATE });
        }
    }

    function detectCalibrationPeak(value, now) {
        if (calPeakState.isPeak) {
            if (value > calPeakState.max) calPeakState.max = value;
            if (value < calPeakState.max * 0.4 && calPeakState.max > calPeakState.threshold) {
                const dt = now - calPeakState.lastPeakTime;
                if (dt > 250) {
                    state.calibrationPeaks++;
                    els.calibrationCount.textContent = state.calibrationPeaks;
                    calPeakState.lastPeakTime = now;
                }
                calPeakState.isPeak = false;
                calPeakState.min = Infinity;
            }
        } else {
            if (value < (calPeakState.min || Infinity)) calPeakState.min = value;
            if (value > (calPeakState.min || 0) + calPeakState.threshold * 0.3) {
                calPeakState.isPeak = true;
                calPeakState.max = value;
            }
        }
    }

    function finishCalibration() {
        state.isCalibrating = false;
        if (!state.isTracking) {
            window.removeEventListener('devicemotion', handleMotion);
        }

        const detected = state.calibrationPeaks;
        const expected = 20;
        let resultMsg = '';

        if (detected === 0) {
            resultMsg = '❌ No steps detected. Make sure sensors are working and try again.';
        } else {
            // Calculate accuracy ratio
            const ratio = detected / expected;

            if (ratio > 1.2) {
                // Over-counting: reduce sensitivity
                state.sensitivity = 'low';
                els.sensitivitySelect.value = 'low';
                resultMsg = `📊 Detected ${detected} peaks for 20 steps (over-counting).\n\n✅ Sensitivity set to LOW to reduce false steps.`;
            } else if (ratio < 0.8) {
                // Under-counting: increase sensitivity
                state.sensitivity = 'high';
                els.sensitivitySelect.value = 'high';
                resultMsg = `📊 Detected ${detected} peaks for 20 steps (under-counting).\n\n✅ Sensitivity set to HIGH to catch lighter steps.`;
            } else {
                state.sensitivity = 'medium';
                els.sensitivitySelect.value = 'medium';
                resultMsg = `📊 Detected ${detected} peaks for 20 steps.\n\n✅ Perfect! Sensitivity set to MEDIUM.`;
            }

            // Estimate stride from data timing
            if (state.calibrationData.length > 10) {
                const first = state.calibrationData[0].time;
                const last = state.calibrationData[state.calibrationData.length - 1].time;
                const durationSec = (last - first) / 1000;
                // Average walking speed ~1.4 m/s, so stride ≈ (speed * duration) / steps
                const estimatedStride = Math.round((1.4 * durationSec / expected) * 100);
                if (estimatedStride > 40 && estimatedStride < 120) {
                    state.strideLength = estimatedStride;
                    els.strideLengthInput.value = estimatedStride;
                    resultMsg += `\n📏 Stride length estimated: ${estimatedStride} cm`;
                }
            }

            state.calibrated = true;
            saveSettings();
            checkAchievements();
        }

        els.calibrationActive.classList.add('hidden');
        els.calibrationResultText.textContent = resultMsg;
        els.calibrationResult.classList.remove('hidden');
        updateCalibrationStatus();
    }

    function cancelCalibration() {
        state.isCalibrating = false;
        if (!state.isTracking) {
            window.removeEventListener('devicemotion', handleMotion);
        }
        els.calibrationActive.classList.add('hidden');
        els.calibrateBtn.style.display = '';
    }

    function updateCalibrationStatus() {
        if (state.calibrated) {
            els.calibrationStatusLine.textContent = '✅ Calibrated — sensitivity and stride auto-configured';
        } else {
            els.calibrationStatusLine.textContent = '';
        }
    }

    // ==================== CHALLENGES ====================
    function startChallenge(goalSteps, timeMin) {
        if (!state.isTracking) startTracking();

        state.challengeActive = true;
        state.challengeGoalSteps = goalSteps;
        state.challengeTimeMs = timeMin * 60 * 1000;
        state.challengeStartSteps = state.steps;
        state.challengeStartTime = Date.now();

        els.challengeButtons.classList.add('hidden');
        els.challengeActive.classList.remove('hidden');
        els.challengeResult.classList.add('hidden');
        els.challengeTitle.textContent = `${goalSteps.toLocaleString()} steps in ${timeMin} min`;
        updateChallengeUI();

        state.challengeInterval = setInterval(updateChallengeUI, 1000);
    }

    function updateChallengeProgress() {
        if (!state.challengeActive) return;
        updateChallengeUI();
    }

    function updateChallengeUI() {
        if (!state.challengeActive) return;

        const elapsed = Date.now() - state.challengeStartTime;
        const stepsInChallenge = state.steps - state.challengeStartSteps;
        const progress = Math.min(stepsInChallenge / state.challengeGoalSteps, 1);
        const remaining = Math.max(0, state.challengeTimeMs - elapsed);

        els.challengeBar.style.width = (progress * 100) + '%';
        els.challengeSteps.textContent = `${stepsInChallenge}/${state.challengeGoalSteps} steps`;

        const remMin = Math.floor(remaining / 60000);
        const remSec = Math.floor((remaining % 60000) / 1000);
        els.challengeTimer.textContent = `${remMin}:${remSec.toString().padStart(2, '0')} left`;

        // Check win
        if (stepsInChallenge >= state.challengeGoalSteps) {
            endChallenge(true);
        } else if (remaining <= 0) {
            endChallenge(false);
        }
    }

    function endChallenge(won) {
        state.challengeActive = false;
        if (state.challengeInterval) { clearInterval(state.challengeInterval); state.challengeInterval = null; }

        const stepsInChallenge = state.steps - state.challengeStartSteps;

        if (won) {
            state.challengesWon++;
            els.challengeResultText.textContent = `🎉 Challenge WON! You walked ${stepsInChallenge.toLocaleString()} steps!`;
            if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 200]);
            saveAchievements();
            checkAchievements();
        } else {
            els.challengeResultText.textContent = `⏰ Time's up! You walked ${stepsInChallenge.toLocaleString()}/${state.challengeGoalSteps.toLocaleString()} steps. Try again!`;
        }

        els.challengeActive.classList.add('hidden');
        els.challengeResult.classList.remove('hidden');
    }

    function cancelChallenge() {
        state.challengeActive = false;
        if (state.challengeInterval) { clearInterval(state.challengeInterval); state.challengeInterval = null; }
        els.challengeActive.classList.add('hidden');
        els.challengeButtons.classList.remove('hidden');
    }

    function dismissChallengeResult() {
        els.challengeResult.classList.add('hidden');
        els.challengeButtons.classList.remove('hidden');
    }

    // ==================== ACHIEVEMENTS ====================
    function checkAchievements() {
        const stats = {
            todaySteps: state.steps,
            totalSteps: state.totalStepsAllTime,
            streak: state.streak,
            calibrated: state.calibrated,
            challengesWon: state.challengesWon,
        };

        let newUnlock = false;
        ACHIEVEMENTS.forEach(a => {
            if (!state.unlockedAchievements.includes(a.id) && a.check(stats)) {
                state.unlockedAchievements.push(a.id);
                newUnlock = true;
                // Brief vibration for unlock
                if (navigator.vibrate) navigator.vibrate([50, 50, 100]);
            }
        });

        if (newUnlock) {
            saveAchievements();
            renderAchievements();
        }
    }

    function renderAchievements() {
        els.achievementsGrid.innerHTML = ACHIEVEMENTS.map(a => {
            const unlocked = state.unlockedAchievements.includes(a.id);
            return `
                <div class="achievement-card ${unlocked ? 'unlocked' : ''}">
                    <div class="achievement-icon">${a.icon}</div>
                    <div class="achievement-name">${a.name}</div>
                    <div class="achievement-desc">${a.desc}</div>
                </div>
            `;
        }).join('');
    }

    // ==================== STREAKS ====================
    function calculateStreak() {
        const history = getHistory();
        if (history.length === 0) { state.streak = 0; return; }

        // Check if today has steps (either current session or saved)
        const today = new Date().toISOString().split('T')[0];
        const todayHasSteps = state.steps >= state.stepGoal || history.some(h => h.date === today && h.steps >= (state.stepGoal || 10000));

        let streak = todayHasSteps ? 1 : 0;
        const dates = history.map(h => h.date).sort().reverse();

        // Go backwards from yesterday
        let checkDate = new Date();
        if (!todayHasSteps) {
            // Check if yesterday had steps; if not streak is 0
        }
        checkDate.setDate(checkDate.getDate() - (todayHasSteps ? 1 : 0));

        for (let i = 0; i < 365; i++) {
            const dateStr = checkDate.toISOString().split('T')[0];
            const found = history.find(h => h.date === dateStr);
            if (found && found.steps >= (state.stepGoal || 10000)) {
                streak++;
                checkDate.setDate(checkDate.getDate() - 1);
            } else {
                break;
            }
        }

        state.streak = streak;

        // Load best streak
        const saved = localStorage.getItem('fittracker_bestStreak');
        state.bestStreak = saved ? Math.max(parseInt(saved) || 0, streak) : streak;
        localStorage.setItem('fittracker_bestStreak', state.bestStreak);
    }

    function updateStreakUI() {
        els.streakCount.textContent = state.streak;
        els.streakBest.textContent = state.bestStreak;
        els.streakIcon.textContent = state.streak >= 7 ? '🔥' : state.streak >= 3 ? '🔥' : '💤';
    }

    // ==================== CSV EXPORT ====================
    function exportCSV() {
        const history = getHistory();

        // Also add today's data
        const today = new Date().toISOString().split('T')[0];
        const distanceKm = (state.steps * state.strideLength / 100) / 1000;
        const calories = Math.round(state.steps * CONFIG.CALORIES_PER_STEP * state.bodyWeight);

        let data = [{ date: today, steps: state.steps, distance: distanceKm.toFixed(2), calories, duration: state.elapsedMs }];
        history.forEach(h => {
            if (h.date !== today) data.push(h);
        });

        let csv = 'Date,Steps,Distance (km),Calories (kcal),Duration (min)\n';
        data.forEach(row => {
            csv += `${row.date},${row.steps},${row.distance},${row.calories},${Math.round((row.duration || 0) / 60000)}\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `fittracker-export-${today}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    function deleteAllData() {
        if (!confirm('This will permanently delete ALL your step data, history, achievements, and settings. Are you sure?')) return;
        if (!confirm('Last chance! This cannot be undone. Delete everything?')) return;

        // Clear all fittracker keys
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith('fittracker')) localStorage.removeItem(key);
        });

        state.steps = 0; state.elapsedMs = 0; state.startTime = null;
        state.unlockedAchievements = []; state.streak = 0; state.bestStreak = 0;
        state.totalStepsAllTime = 0; state.challengesWon = 0; state.calibrated = false;

        stopTracking();
        loadHistory();
        renderAchievements();
        updateStreakUI();
        updateStorageUsed();
        updateCalibrationStatus();
        updateUI();
        alert('All data deleted.');
    }

    function updateStorageUsed() {
        let total = 0;
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith('fittracker')) {
                total += localStorage.getItem(key).length * 2; // UTF-16
            }
        });
        if (total < 1024) {
            els.storageUsed.textContent = total + ' B';
        } else {
            els.storageUsed.textContent = (total / 1024).toFixed(1) + ' KB';
        }
    }

    // ==================== UI ====================
    function updateUI() {
        const currentDisplay = parseInt(els.stepCount.textContent.replace(/,/g, '')) || 0;
        if (currentDisplay !== state.steps) animateNumber(els.stepCount, currentDisplay, state.steps);

        const distanceKm = (state.steps * state.strideLength / 100) / 1000;
        els.distance.textContent = distanceKm.toFixed(2);
        els.calories.textContent = Math.round(state.steps * CONFIG.CALORIES_PER_STEP * state.bodyWeight);

        const now = Date.now();
        const recentSteps = state.validatedStepTimes.filter(t => now - t < CONFIG.PACE_WINDOW_MS).length;
        els.pace.textContent = state.isTracking ? Math.round(recentSteps * (60000 / CONFIG.PACE_WINDOW_MS)) : 0;

        updateProgressRing();
        els.stepGoalText.textContent = `Goal: ${state.stepGoal.toLocaleString()}`;
    }

    function updateProgressRing() {
        const progress = Math.min(state.steps / state.stepGoal, 1);
        const c = 2 * Math.PI * 120;
        els.progressRing.style.strokeDasharray = c;
        els.progressRing.style.strokeDashoffset = c * (1 - progress);
        els.progressRing.style.stroke = progress >= 1 ? '#00e676' : progress >= 0.75 ? '#76ff03' : progress >= 0.5 ? '#ffea00' : '#00b4d8';
    }

    function updateTimer() {
        if (!state.isTracking || !state.lastTickTime) return;
        const ms = state.elapsedMs + (Date.now() - state.lastTickTime);
        const s = Math.floor(ms / 1000);
        const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
        els.duration.textContent = h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
    }

    function updateDateDisplay() {
        els.currentDate.textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    }

    function animateNumber(element, from, to) {
        const start = performance.now(), diff = to - from;
        function frame(time) {
            const p = Math.min((time - start) / 300, 1);
            element.textContent = Math.round(from + diff * (1 - Math.pow(1 - p, 3))).toLocaleString();
            if (p < 1) requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
    }

    function updateDebug(x, y, z, mag, proc) {
        if (els.debugSection.classList.contains('hidden')) return;
        const t = CONFIG.THRESHOLDS[state.sensitivity];
        const sec = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
        els.debugOutput.textContent = `Proto: ${location.protocol} (${sec ? 'SECURE' : 'INSECURE'})
Sensor: ${state.sensorAvailable} | Data: ${state.motionDataReceived} | Mode: ${state.mode}
Accel: ${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)} | Mag: ${mag.toFixed(2)}
Filtered: ${proc.toFixed(3)} | Threshold: ${state.dynamicThreshold.toFixed(3)} (${t.peak})
Phase: ${state.isPeakPhase ? 'PEAK' : 'VALLEY'} | Max: ${state.currentMax.toFixed(3)}
Pending: ${state.pendingSteps.length} | Steps: ${state.steps}
Calibrating: ${state.isCalibrating} | Cal Peaks: ${state.calibrationPeaks}`;
    }

    // ==================== PERSISTENCE ====================
    function getTodayKey() {
        const d = new Date();
        return `fittracker_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }

    function saveTodayData() {
        const elapsed = state.isTracking
            ? state.elapsedMs + (Date.now() - (state.lastTickTime || Date.now()))
            : state.elapsedMs;
        localStorage.setItem(getTodayKey(), JSON.stringify({
            steps: state.steps,
            elapsedMs: elapsed,
            startTime: state.startTime,
            wasTracking: state.isTracking,
            timestamp: Date.now()
        }));
    }

    function loadTodayData() {
        const d = localStorage.getItem(getTodayKey());
        if (d) {
            try {
                const p = JSON.parse(d);
                state.steps = p.steps || 0;
                state.elapsedMs = p.elapsedMs || 0;
                state.startTime = p.startTime || null;
                // If we were tracking when the page was killed, auto-resume
                if (p.wasTracking && p.timestamp) {
                    const timeSinceKill = Date.now() - p.timestamp;
                    // Only auto-resume if killed less than 5 minutes ago
                    if (timeSinceKill < 5 * 60 * 1000) {
                        state._shouldAutoResume = true;
                    }
                }
            } catch {}
        }
    }

    function autoSave() { if (state.steps > 0) saveTodayData(); }

    // Quick save — called on every counted step so nothing is lost
    function quickSave() {
        saveTodayData();
        saveSettings();
    }

    function saveSettings() {
        localStorage.setItem('fittracker_settings', JSON.stringify({
            stepGoal: state.stepGoal, strideLength: state.strideLength,
            bodyWeight: state.bodyWeight, sensitivity: state.sensitivity,
            totalStepsAllTime: state.totalStepsAllTime, challengesWon: state.challengesWon,
            calibrated: state.calibrated,
        }));
    }

    function loadSettings() {
        const d = localStorage.getItem('fittracker_settings');
        if (d) {
            try {
                const s = JSON.parse(d);
                state.stepGoal = s.stepGoal || 10000; state.strideLength = s.strideLength || 75;
                state.bodyWeight = s.bodyWeight || 70; state.sensitivity = s.sensitivity || 'medium';
                state.totalStepsAllTime = s.totalStepsAllTime || 0;
                state.challengesWon = s.challengesWon || 0;
                state.calibrated = s.calibrated || false;
                els.stepGoalInput.value = state.stepGoal; els.strideLengthInput.value = state.strideLength;
                els.bodyWeightInput.value = state.bodyWeight; els.sensitivitySelect.value = state.sensitivity;
            } catch {}
        }
    }

    function saveAchievements() {
        localStorage.setItem('fittracker_achievements', JSON.stringify(state.unlockedAchievements));
    }

    function loadAchievements() {
        const d = localStorage.getItem('fittracker_achievements');
        if (d) { try { state.unlockedAchievements = JSON.parse(d) || []; } catch { state.unlockedAchievements = []; } }
    }

    function saveToHistory() {
        const h = getHistory();
        const today = new Date().toISOString().split('T')[0];
        const entry = {
            date: today, steps: state.steps,
            distance: ((state.steps * state.strideLength / 100) / 1000).toFixed(2),
            calories: Math.round(state.steps * CONFIG.CALORIES_PER_STEP * state.bodyWeight),
            duration: state.elapsedMs,
        };
        const i = h.findIndex(x => x.date === today);
        if (i >= 0) h[i] = entry; else h.unshift(entry);
        localStorage.setItem('fittracker_history', JSON.stringify(h.slice(0, 30)));
        loadHistory();
        calculateStreak();
        updateStreakUI();
    }

    function getHistory() {
        try { return JSON.parse(localStorage.getItem('fittracker_history') || '[]'); } catch { return []; }
    }

    function loadHistory() {
        const h = getHistory();
        if (h.length === 0) { els.historyList.innerHTML = '<p class="no-history">No history yet. Start walking!</p>'; return; }
        els.historyList.innerHTML = h.slice(0, 7).map(h => {
            const d = new Date(h.date + 'T00:00:00');
            const ds = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
            return `<div class="history-item"><div class="history-date">${ds}</div><div class="history-steps">${h.steps.toLocaleString()} steps</div><div class="history-details">${h.distance} km · ${h.calories} kcal · ${formatDuration(h.duration)}</div></div>`;
        }).join('');
    }

    function checkMidnightReset() {
        const k = getTodayKey(), last = localStorage.getItem('fittracker_lastDay');
        if (last && last !== k) {
            if (state.steps > 0) saveToHistory();
            state.steps = 0; state.elapsedMs = 0; state.startTime = null;
            calculateStreak(); updateStreakUI(); updateUI();
        }
        localStorage.setItem('fittracker_lastDay', k);
    }

    // ==================== UTILS ====================
    function pad(n) { return n.toString().padStart(2, '0'); }
    function formatDuration(ms) {
        if (!ms) return '0 min';
        const m = Math.floor(ms / 60000), h = Math.floor(m / 60);
        return h > 0 ? `${h}h ${m % 60}m` : `${m % 60} min`;
    }

    // ==================== BOOT ====================
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
