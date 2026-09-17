// ==========================================
// VOICEBRIDGE — REAL-TIME PITCH ANALYSIS
// ==========================================

let mediaRecorder;
let audioChunks = [];
let stream;

let audioContext;
let analyser;
let source;

let pitchSamples = [];
let detectedFrequencies = [];
let analysisFrames = [];

let timerInterval;
let seconds = 0;
let isAnalyzing = false;
const MIN_CONFIDENCE_SAMPLES = 12;
const MIN_PITCH_CONFIDENCE = 0.7;
const MIN_ANALYSIS_SECONDS = 3;


// ==========================================
// ELEMENTS
// ==========================================

const recordBtn = document.getElementById("recordBtn");
const stopBtn = document.getElementById("stopBtn");
const deleteAudioBtn = document.getElementById("deleteAudioBtn");

const timer = document.getElementById("timer");
const recordStatus = document.getElementById("recordStatus");

const audioPlayer = document.getElementById("audioPlayer");
const exerciseList = document.getElementById("exerciseList");
const detectedKey = document.getElementById("detectedKey");
const liveNote = document.getElementById("liveNote");
const clearHistoryBtn = document.getElementById("clearHistoryBtn");

clearHistoryBtn.addEventListener("click", () => {
    const history = JSON.parse(localStorage.getItem("voiceHistory") || "[]");

    if (!history.length) {
        recordStatus.textContent = "Recording history is already empty.";
        return;
    }

    if (!window.confirm("Delete all recording history? This cannot be undone.")) return;

    localStorage.removeItem("voiceHistory");
    displayHistory();
    recordStatus.textContent = "Recording history deleted.";
});


// ==========================================
// THEME
// ==========================================

const themeBtn = document.getElementById("themeBtn");

themeBtn.addEventListener("click", () => {

    document.body.classList.toggle("dark");

    if (document.body.classList.contains("dark")) {

        themeBtn.textContent = "☀️";

        localStorage.setItem("theme", "dark");

    } else {

        themeBtn.textContent = "🌙";

        localStorage.setItem("theme", "light");

    }

});


if (localStorage.getItem("theme") === "dark") {

    document.body.classList.add("dark");

    themeBtn.textContent = "☀️";

}


// ==========================================
// START RECORDING
// ==========================================

recordBtn.addEventListener("click", async () => {

    try {

        stream =
            await navigator.mediaDevices.getUserMedia({
                audio: true
            });


        // Create audio context
        audioContext = audioContext || new AudioContext();

        if (audioContext.state === "suspended") {
            await audioContext.resume();
        }


        analyser =
            audioContext.createAnalyser();


        analyser.fftSize = 2048;


        source =
            audioContext.createMediaStreamSource(stream);


        source.connect(analyser);

        // Clear old data
        detectedFrequencies = [];

        pitchSamples = [];

        analysisFrames = [];
        detectedKey.textContent = "Listening...";
        liveNote.textContent = "Sing a steady note or phrase";

        // Start microphone analysis
        isAnalyzing = true;

        analyzePitch();


        // Recorder
        mediaRecorder =
            new MediaRecorder(stream);


        audioChunks = [];


        mediaRecorder.addEventListener(
            "dataavailable",
            event => {

                audioChunks.push(event.data);

            }
        );


        mediaRecorder.addEventListener(
            "stop",
            createAudio
        );


        mediaRecorder.start();

        // Timer
        seconds = 0;

        timer.textContent = "00:00";

        timerInterval =
            setInterval(updateTimer, 1000);


        recordStatus.textContent =
            "🔴 Listening to your voice...";


        recordBtn.disabled = true;

        stopBtn.disabled = false;


    } catch (error) {

        console.error(error);

        alert(
            "Please allow microphone access to use VoiceBridge."
        );

    }

});


// ==========================================
// STOP RECORDING
// ==========================================

stopBtn.addEventListener("click", () => {

    if (
        mediaRecorder &&
        mediaRecorder.state !== "inactive"
    ) {

        mediaRecorder.stop();

    }


    isAnalyzing = false;


    clearInterval(timerInterval);


    if (stream) {

        stream
            .getTracks()
            .forEach(track => track.stop());

    }

    if (audioContext) {

        audioContext.suspend();

        source.disconnect();

    }


    recordBtn.disabled = false;

    stopBtn.disabled = true;


    recordStatus.textContent =
        "⏳ Analyzing your voice...";

});


deleteAudioBtn.addEventListener("click", () => {

    if (audioPlayer.src) {

        audioPlayer.pause();
        audioPlayer.removeAttribute("src");
        audioPlayer.load();
        audioPlayer.style.display = "none";

    }

    const history = JSON.parse(
        localStorage.getItem("voiceHistory") || "[]"
    );

    if (history.length > 0) {

        history.pop();

        localStorage.setItem(
            "voiceHistory",
            JSON.stringify(history)
        );

    }

    displayHistory();
    renderExercises(0, 0, 0, 0, 0);

    recordStatus.textContent =
        "🗑 Audio deleted. Record again to start a new analysis.";

});


// ==========================================
// TIMER
// ==========================================

function updateTimer() {

    seconds++;


    let minutes =
        Math.floor(seconds / 60);


    let remainingSeconds =
        seconds % 60;


    minutes =
        String(minutes)
            .padStart(2, "0");


    remainingSeconds =
        String(remainingSeconds)
            .padStart(2, "0");


    timer.textContent =
        `${minutes}:${remainingSeconds}`;

}


// ==========================================
// CREATE AUDIO
// ==========================================

function createAudio() {

    const audioBlob =
        new Blob(
            audioChunks,
            {
                type: "audio/webm"
            }
        );


    const audioURL =
        URL.createObjectURL(audioBlob);


    audioPlayer.src =
        audioURL;


    audioPlayer.style.display =
        "block";


    finishAnalysis();

}


// ==========================================
// REAL-TIME PITCH DETECTION
// ==========================================

function analyzePitch() {

    if (!isAnalyzing || !analyser || !audioContext) return;


    const bufferLength =
        analyser.fftSize;


    const buffer =
        new Float32Array(bufferLength);


    analyser.getFloatTimeDomainData(buffer);


    const amplitude =
        getRms(buffer);


    const spectrum =
        new Uint8Array(
            analyser.frequencyBinCount
        );


    analyser.getByteFrequencyData(
        spectrum
    );


    let totalMagnitude = 0;
    let weightedFrequency = 0;


    for (
        let i = 0;
        i < spectrum.length;
        i++
    ) {

        const magnitude =
            spectrum[i];

        totalMagnitude +=
            magnitude;

        weightedFrequency +=
            magnitude * i;

    }


    const centroidBin =
        totalMagnitude > 0
            ? weightedFrequency / totalMagnitude
            : 0;

    const binFrequency =
        audioContext.sampleRate / analyser.fftSize;

    const centroid = centroidBin * binFrequency;

    const highFrequencyEnergy = spectrum.reduce(
        (sum, magnitude, index) =>
            sum + (index * binFrequency >= 1800 ? magnitude : 0),
        0
    );

    const totalEnergy = spectrum.reduce(
        (sum, magnitude) => sum + magnitude,
        0
    );

    analysisFrames.push({
        time: performance.now(),
        amplitude,
        centroid,
        highFrequencyRatio: totalEnergy > 0 ? highFrequencyEnergy / totalEnergy : 0,
        frequency: -1
    });


    const frequency =
        estimatePitchFrequency(
            buffer,
            audioContext.sampleRate,
            analyser
        );


    if (
        frequency !== -1 &&
        frequency >= 50 &&
        frequency <= 1500 &&
        amplitude > 0.006
    ) {

        detectedFrequencies.push(
            frequency
        );

        liveNote.textContent = `Current note: ${frequencyToNote(frequency)}`;

        pitchSamples.push({
            time: performance.now(),
            frequency,
            amplitude,
            centroid,
            highFrequencyRatio: totalEnergy > 0 ? highFrequencyEnergy / totalEnergy : 0
        });

        analysisFrames[analysisFrames.length - 1].frequency = frequency;

    }


    if (
        pitchSamples.length > 2000
    ) {

        pitchSamples.shift();

    }


    requestAnimationFrame(
        analyzePitch
    );

}


function getRms(buffer) {

    let sum = 0;


    for (
        let i = 0;
        i < buffer.length;
        i++
    ) {

        sum +=
            buffer[i] * buffer[i];

    }


    return Math.sqrt(
        sum / buffer.length
    );

}


function clamp(value, min, max) {

    return Math.min(
        max,
        Math.max(
            min,
            value
        )
    );

}


function mean(values) {

    if (!values.length) return 0;


    return values.reduce(
        (sum, value) => sum + value,
        0
    ) / values.length;

}


function median(values) {

    if (!values.length) return 0;


    const sorted = [...values].sort(
        (a, b) => a - b
    );


    const middle =
        Math.floor(
            sorted.length / 2
        );


    if (
        sorted.length % 2 === 0
    ) {

        return (
            sorted[middle - 1] +
            sorted[middle]
        ) / 2;

    }


    return sorted[middle];

}


function standardDeviation(values) {

    if (values.length < 2) return 0;


    const average = mean(values);


    const variance =
        values.reduce(
            (sum, value) =>
                sum +
                (value - average) ** 2,
            0
        ) / values.length;


    return Math.sqrt(variance);

}


// ==========================================
// AUTOCORRELATION
// ==========================================

function estimatePitchFrequency(
    buffer,
    sampleRate,
    analyserNode
) {

    const autoFrequency =
        autoCorrelate(
            buffer,
            sampleRate
        );


    if (
        autoFrequency > 0
    ) {

        return autoFrequency;

    }


    if (!analyserNode) {

        return -1;

    }


    const frequencyData =
        new Uint8Array(
            analyserNode.frequencyBinCount
        );


    analyserNode.getByteFrequencyData(
        frequencyData
    );


    const minFrequency = 70;
    const maxFrequency = 1000;

    const nyquist =
        sampleRate / 2;

    const binSize =
        nyquist / frequencyData.length;


    let strongestBin = -1;
    let strongestMagnitude = -1;


    for (
        let i = 0;
        i < frequencyData.length;
        i++
    ) {

        const frequency =
            i * binSize;


        if (
            frequency < minFrequency ||
            frequency > maxFrequency
        ) {

            continue;

        }


        const magnitude =
            frequencyData[i];


        if (
            magnitude > strongestMagnitude
        ) {

            strongestMagnitude = magnitude;
            strongestBin = i;

        }

    }


    if (
        strongestBin === -1
    ) {

        return -1;

    }


    return strongestBin * binSize;

}


function autoCorrelate(
    buffer,
    sampleRate
) {

    const SIZE =
        buffer.length;


    let rms = 0;


    for (
        let i = 0;
        i < SIZE;
        i++
    ) {

        rms +=
            buffer[i] *
            buffer[i];

    }


    rms =
        Math.sqrt(
            rms / SIZE
        );


    if (rms < 0.006) {

        return -1;

    }


    const minFrequency = 70;
    const maxFrequency = 1000;

    const minLag =
        Math.floor(
            sampleRate / maxFrequency
        );

    const maxLag =
        Math.ceil(
            sampleRate / minFrequency
        );


    let bestLag = -1;
    let bestScore = 0;


    for (
        let lag = minLag;
        lag <= maxLag;
        lag++
    ) {

        let numerator = 0;
        let sumA = 0;
        let sumB = 0;


        for (
            let i = 0;
            i < SIZE - lag;
            i++
        ) {

            const a = buffer[i];
            const b = buffer[i + lag];

            numerator +=
                a * b;

            sumA += a * a;
            sumB += b * b;

        }


        if (
            sumA === 0 ||
            sumB === 0
        ) {

            continue;

        }


        const score =
            numerator /
            Math.sqrt(sumA * sumB);


        if (
            score > bestScore
        ) {

            bestScore = score;
            bestLag = lag;

        }

    }


    if (
        bestLag > 0 &&
        bestScore > 0.15
    ) {

        return sampleRate / bestLag;

    }

    return -1;

}


// ==========================================
// FINISH ANALYSIS
// ==========================================

function finishAnalysis() {
    const frequencies = pitchSamples
        .map(sample => sample.frequency)
        .filter(frequency => Number.isFinite(frequency) && frequency >= 50 && frequency <= 1500);

    if (frequencies.length < MIN_CONFIDENCE_SAMPLES || analysisFrames.length < MIN_ANALYSIS_SECONDS * 30) {
        recordStatus.textContent = "⚠️ We couldn't detect enough clear voice data. Record at least 3 seconds with a steady voice.";
        return;
    }

    const averageFrequency = mean(frequencies);
    const lowestNote = frequencyToNote(Math.min(...frequencies));
    const highestNote = frequencyToNote(Math.max(...frequencies));
    const averageNote = frequencyToNote(averageFrequency);
    const likelyKey = estimateLikelyKey(frequencies);
    const pitchScore = calculatePitchScore(frequencies);
    const stability = calculateStabilityScore(frequencies);
    const rhythm = calculateRhythmScore(analysisFrames);
    const diction = calculateDictionScore(analysisFrames);
    const availableScores = [pitchScore, rhythm, stability, diction]
        .filter(score => Number.isFinite(score));
    const overall = Math.round(availableScores.length ? mean(availableScores) : 0);


    updateAnalysis(
        overall,
        pitchScore,
        rhythm,
        stability,
        diction,
        `${lowestNote} – ${highestNote}`,
        likelyKey
    );


    recordStatus.textContent =
        `✅ Analysis complete — Centered around ${averageNote}`;

}


// ==========================================
// FREQUENCY → NOTE
// ==========================================

function frequencyToNote(frequency) {
    const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const midi = Math.round(69 + 12 * Math.log2(frequency / 440));
    const note = noteNames[((midi % 12) + 12) % 12];
    const octave = Math.floor(midi / 12) - 1;
    return `${note}${octave}`;

}


function estimateLikelyKey(frequencies) {

    const noteNames = [
        "C",
        "C#",
        "D",
        "D#",
        "E",
        "F",
        "F#",
        "G",
        "G#",
        "A",
        "A#",
        "B"
    ];

    const noteCounts = Array(12).fill(0);

    frequencies.forEach(frequency => {
        const midi = Math.round(69 + 12 * Math.log2(frequency / 440));
        noteCounts[((midi % 12) + 12) % 12]++;
    });

    const strongestNote = noteCounts.indexOf(Math.max(...noteCounts));

    return `${noteNames[strongestNote]} (pitch center)`;

}


// ==========================================
// PITCH STABILITY
// ==========================================

function calculateStabilityScore(frequencies) {
    if (frequencies.length < 2) return null;

    const cents = frequencies.map(getCentsFromNearestNote);
    return Math.round(100 * clamp(1 - standardDeviation(cents) / 35, 0, 1));
}


// ==========================================
// PITCH SCORE
// ==========================================

function calculatePitchScore(frequencies) {
    if (frequencies.length === 0) return null;

    const meanCentsError = mean(
        frequencies.map(frequency => Math.abs(getCentsFromNearestNote(frequency)))
    );

    return Math.round(100 * clamp(1 - meanCentsError / 50, 0, 1));
}


function calculateRhythmScore(samples) {
    if (samples.length < 30) return null;

    const amplitudes = samples.map(sample => sample.amplitude);
    const threshold = median(amplitudes) + standardDeviation(amplitudes) * 0.35;
    const onsets = [];
    let lastOnset = -Infinity;

    for (let index = 1; index < samples.length - 1; index++) {
        const sample = samples[index];
        const isPeak = sample.amplitude >= samples[index - 1].amplitude &&
            sample.amplitude >= samples[index + 1].amplitude &&
            sample.amplitude >= threshold;
        const time = sample.time / 1000;

        if (isPeak && time - lastOnset >= 0.18) {
            onsets.push(time);
            lastOnset = time;
        }
    }

    const intervals = onsets.slice(1)
        .map((time, index) => time - onsets[index]);

    if (intervals.length < 2) return null;

    const targetInterval = median(intervals);
    const averageDeviation = mean(
        intervals.map(interval => Math.abs(interval - targetInterval))
    );
    const rhythmError = targetInterval > 0
        ? averageDeviation / targetInterval
        : 1;

    return Math.round(100 * clamp(1 - rhythmError * 2.5, 0, 1));
}


function calculateDictionScore() {
    return 0;
}


// ==========================================
// UPDATE ANALYSIS UI
// ==========================================

function updateAnalysis(overall, pitch, rhythm, stability, diction, range, likelyKey) {
    const formatMetric = value => `${Number.isFinite(value) ? value : 0}%`;
    const metricWidth = value => `${Number.isFinite(value) ? value : 0}%`;

    document.getElementById("overallScore").textContent = overall;
    document.getElementById("pitchScore").textContent = formatMetric(pitch);
    document.getElementById("rhythmScore").textContent = formatMetric(rhythm);
    document.getElementById("stabilityScore").textContent = formatMetric(stability);
    document.getElementById("dictionScore").textContent = formatMetric(diction);
    document.getElementById("pitchBar").style.width = metricWidth(pitch);
    document.getElementById("rhythmBar").style.width = metricWidth(rhythm);
    document.getElementById("stabilityBar").style.width = metricWidth(stability);
    document.getElementById("dictionBar").style.width = metricWidth(diction);
    document.getElementById("vocalRange").textContent = range;
    detectedKey.textContent = likelyKey;
    liveNote.textContent = "Based on the notes detected in this recording";
    document.getElementById("analysisMessage").textContent = getAnalysisMessage(overall);

    saveProgress(overall, pitch, rhythm, stability, diction, range, likelyKey);
    renderExercises(overall, pitch, rhythm, stability, diction);
}


function renderExercises(overall, pitch, rhythm, stability, diction) {
    if (!exerciseList) return;

    const scores = { pitch, rhythm, stability, diction };
    const measuredScores = Object.entries(scores)
        .filter(([, score]) => Number.isFinite(score));

    if (!measuredScores.length) return;

    const weakestMetric = measuredScores
        .sort((a, b) => a[1] - b[1])[0][0];

    const exerciseMap = {
        pitch: {
            icon: "🎵",
            title: "Pitch matching drill",
            detail: "Hum a single note for 6 seconds, then match it to a reference pitch 5 times. Focus on staying centered and smooth."
        },
        rhythm: {
            icon: "🥁",
            title: "Rhythm clapping",
            detail: "Tap or clap on every beat for 2 minutes while singing the same phrase. Keep the pulse steady and even."
        },
        stability: {
            icon: "🎯",
            title: "Long-note hold",
            detail: "Hold one note for 8–12 seconds at a comfortable pitch. Try not to let the tone drift upward or downward."
        },
        diction: {
            icon: "🗣️",
            title: "Clear consonant phrase",
            detail: "Add the lyrics you intend to sing, then practice consonants like t, d, k, p, and b clearly."
        }
    };

    const recommendationList = [exerciseMap[weakestMetric], {
        icon: "🌬️",
        title: "Breath control warm-up",
        detail: "Breathe in for 4 counts, hold for 2, and sing on a gentle hum for 8 counts. Repeat 6 times."
    }, {
        icon: "📈",
        title: "Range expansion",
        detail: "Start from your easiest note and move upward by half-steps, only until the tone stays clean and relaxed."
    }];

    exerciseList.innerHTML = recommendationList.map(item => `
        <div class="exercise-card">
            <div class="exercise-icon">${item.icon}</div>
            <div><h3>${item.title}</h3><p>${item.detail}</p></div>
        </div>
    `).join("");
}


// ==========================================
// ANALYSIS MESSAGE
// ==========================================

function getAnalysisMessage(
    score
) {

    if (score >= 90) {

        return "Excellent performance! Your voice shows strong control.";

    }


    if (score >= 80) {

        return "Great work! Your voice is developing very well.";

    }


    if (score >= 70) {

        return "Good foundation. Keep practicing consistently.";

    }


    return "Keep training. Your voice can improve with regular practice.";

}


// ==========================================
// SAVE PROGRESS
// ==========================================

function saveProgress(
    overall,
    pitch,
    rhythm,
    stability,
    diction,
    range,
    likelyKey
) {

    let history =
        JSON.parse(
            localStorage.getItem(
                "voiceHistory"
            )
        ) || [];


    history.push({

        date:
            new Date()
                .toLocaleString(),

        score:
            overall,

        pitch:
            pitch,

        rhythm:
            rhythm,

        stability:
            stability,

        diction:
            diction,

        range:
            range,

        likelyKey:
            likelyKey

    });


    localStorage.setItem(
        "voiceHistory",
        JSON.stringify(history)
    );


    displayHistory();

}


// ==========================================
// DISPLAY HISTORY
// ==========================================

function displayHistory() {

    let history =
        JSON.parse(
            localStorage.getItem(
                "voiceHistory"
            )
        ) || [];


    const historyList =
        document.getElementById(
            "historyList"
        );


    if (
        history.length === 0
    ) {

        historyList.innerHTML =
            `<p class="empty">
                Your recording history will appear here.
            </p>`;

        updateStatistics([]);

        return;

    }


    historyList.innerHTML = "";


    history
        .slice()
        .reverse()
        .forEach(
            (item, index) => {

                const div =
                    document.createElement(
                        "div"
                    );


                div.className =
                    "history-item";


                div.innerHTML = `

                    <div>

                        <strong>
                            Recording ${history.length - index}
                        </strong>

                        <br>

                        <small>
                            ${item.date}
                        </small>

                        <br>

                        <small>
                            Range: ${item.range}
                        </small>

                        <br>

                        <small>
                            Key: ${item.likelyKey || "--"}
                        </small>

                    </div>

                    <strong>
                        ${item.score}/100
                    </strong>

                `;


                historyList.appendChild(
                    div
                );

            }
        );


    updateStatistics(
        history
    );

}


// ==========================================
// STATISTICS
// ==========================================

function updateStatistics(
    history
) {

    const recordings =
        history.length;


    document.getElementById(
        "recordings"
    ).textContent =
        recordings;


    if (
        recordings === 0
    ) {
        document.getElementById("bestScore").textContent = "--";
        document.getElementById("streak").textContent = "0";
        document.getElementById("practiceTime").textContent = "0m";
        return;
    }


    const scores =
        history.map(
            item => item.score
        );


    const best =
        Math.max(
            ...scores
        );


    document.getElementById(
        "bestScore"
    ).textContent =
        best;


    document.getElementById(
        "streak"
    ).textContent =
        Math.min(
            recordings,
            30
        );


    document.getElementById(
        "practiceTime"
    ).textContent =
        recordings * 10 + "m";

}


// ==========================================
// VOICE AI SEARCH
// ==========================================

const voiceSearchInput = document.getElementById("voiceSearchInput");
const voiceSearchBtn = document.getElementById("voiceSearchBtn");
const aiAnswerBox = document.getElementById("aiAnswerBox");
const apiKeyInput = document.getElementById("apiKeyInput");
const saveApiKeyBtn = document.getElementById("saveApiKeyBtn");

const savedApiKey = localStorage.getItem("voicebridge_openai_key") || "";
if (savedApiKey && apiKeyInput) {
    apiKeyInput.value = savedApiKey;
}

function getLocalVoiceAnswer(question) {
    const text = question.toLowerCase();

    if (text.includes("breath") || text.includes("support") || text.includes("breathe")) {
        return "Breath support starts with low, steady breathing from the diaphragm. Try this: inhale for 4 counts, expand the ribs and lower belly, then sing a gentle hum on 6 counts. Keep the shoulders relaxed and avoid pushing the voice from the throat. Practice 5 rounds of sustained hums to build control.";
    }

    if (text.includes("warm") || text.includes("voice") && text.includes("tired") || text.includes("fatigue") || text.includes("hoarse")) {
        return "If the voice feels tired or hoarse, start with gentle humming, lip trills, and easy sirens. Avoid yelling or hard high notes. Drink water, rest your speaking voice, and keep the warm-up soft for 5 to 10 minutes before a full vocal session.";
    }

    if (text.includes("resonance") || text.includes("tone") || text.includes("ring")) {
        return "Resonance is created when the sound vibrates in the mouth, nose, and facial spaces without strain. Try forward placement by humming and then opening to an 'ah' or 'ee' while keeping the jaw loose. Focus on bright but relaxed tone, not forcing volume.";
    }

    if (text.includes("high") || text.includes("higher") || text.includes("pitch") || text.includes("strain")) {
        return "To sing higher notes without strain, stay relaxed and let the breath support the pitch instead of squeezing the throat. Start with sirens from your comfortable range upward by small steps, then stop before tension starts. Keep the soft palate lifted and the neck relaxed.";
    }

    if (text.includes("diction") || text.includes("pronunciation") || text.includes("clear")) {
        return "Clear diction comes from precise consonants and relaxed vowels. Practice short phrases slowly, then exaggerate the consonants like t, d, k, p, and b. Keep the lips and jaw moving clearly, and don't rush the words; clarity is more important than volume.";
    }

    if (text.includes("range") || text.includes("extend") || text.includes("expand")) {
        return "Build range gradually with half-step sirens, scales, and comfortable slides. Work only in a range that feels easy and relaxed. Increase by small steps, and stop if you feel tightness or a gritty sound. Consistent, easy work is better than forcing high notes.";
    }

    if (text.includes("lesson") || text.includes("training") || text.includes("practice")) {
        return "A solid voice lesson plan includes: 1) gentle warm-up, 2) breath support exercises, 3) pitch matching, 4) resonance and vowel focus, 5) diction work, and 6) a short cool-down. Practice 15 to 20 minutes daily for best progress and keep each exercise relaxed and controlled.";
    }

    return "A strong singing technique usually starts with relaxed breathing, a clear jaw and neck, steady breath support, and easy resonance. For your goal, begin with a 5-minute hum and siren warm-up, sing slowly on comfortable notes, then focus on one skill at a time such as breath, pitch, or diction. Small, consistent practice is the fastest way to improve.";
}

async function askVoiceAi() {
    const question = (voiceSearchInput?.value || "").trim();

    if (!question) {
        if (aiAnswerBox) {
            aiAnswerBox.innerHTML = '<div class="ai-bubble">Please type a voice question or choose a suggestion.</div>';
        }
        return;
    }

    if (aiAnswerBox) {
        aiAnswerBox.innerHTML = '<div class="ai-bubble">Thinking through your voice question...</div>';
    }

    const apiKey = localStorage.getItem("voicebridge_openai_key") || "";

    if (apiKey) {
        try {
            const response = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: "gpt-4o-mini",
                    messages: [
                        {
                            role: "system",
                            content: "You are a professional vocal coach and singing teacher. Give short, practical, encouraging answers about breathing, pitch, resonance, diction, rehearsal, and vocal health. Keep suggestions focused and safe."
                        },
                        {
                            role: "user",
                            content: question
                        }
                    ],
                    temperature: 0.7,
                    max_tokens: 220
                })
            });

            const data = await response.json();

            if (!response.ok || !data.choices || !data.choices[0]?.message?.content) {
                throw new Error(data.error?.message || "OpenAI request failed.");
            }

            const answer = data.choices[0].message.content.trim();

            if (aiAnswerBox) {
                aiAnswerBox.innerHTML = `<div class="ai-bubble">${answer.replace(/\n/g, "<br><br>")}</div>`;
            }

            return;
        } catch (error) {
            console.error(error);
        }
    }

    const fallback = getLocalVoiceAnswer(question);

    if (aiAnswerBox) {
        aiAnswerBox.innerHTML = `<div class="ai-bubble">${fallback.replace(/\n/g, "<br><br>")}</div>`;
    }
}

if (voiceSearchBtn) {
    voiceSearchBtn.addEventListener("click", askVoiceAi);
}

if (voiceSearchInput) {
    voiceSearchInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            askVoiceAi();
        }
    });
}

if (saveApiKeyBtn) {
    saveApiKeyBtn.addEventListener("click", () => {
        const key = (apiKeyInput?.value || "").trim();
        if (!key) {
            localStorage.removeItem("voicebridge_openai_key");
            alert("API key cleared.");
            return;
        }

        localStorage.setItem("voicebridge_openai_key", key);
        alert("OpenAI API key saved. Live AI answers are now enabled.");
    });
}

const voiceChipButtons = document.querySelectorAll(".voice-chip");
voiceChipButtons.forEach(button => {
    button.addEventListener("click", () => {
        const question = button.getAttribute("data-question");
        if (voiceSearchInput) {
            voiceSearchInput.value = question;
        }
        askVoiceAi();
    });
});

// ==========================================
// LOAD HISTORY
// ==========================================

displayHistory();