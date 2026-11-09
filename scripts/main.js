// ==========================================
// VISUALIZER VARIABLES
// ==========================================
const vizCanvas = document.getElementById('audio-viz');
const ctx = vizCanvas.getContext('2d');
const lambdaCircle = document.querySelector('.lambda-circle');

var smoothSample = new Array(64).fill(0);
var smooth = new Array(64).fill(0);
var audioSampleA = new Array(64).fill(0);
var audioSample = new Array(128).fill(0);
var pinkNoise = [1.0548608488838,0.76054078751554,0.61124787706261,0.52188737442096,0.47582581340335,0.442985940855,0.39506604448116,0.38179901474466,0.3791498265819,0.35862620105656,0.34117808276167,0.31407858754586,0.32956896818321,0.32649587026332,0.32553041354753,0.33023063745582,0.33723850113961,0.32845876137105,0.32345077632073,0.33371703524763,0.33559351013352,0.32755038614695,0.33723270172874,0.33152196761531,0.34253960054833,0.33996676648346,0.35007384375669,0.34140414964718,0.35276302794926,0.45428847576802,0.57092841582994,0.56249676873287,0.64297260455787,0.64261475342015,0.72339198663831,0.73733259583513,0.83130048006773,0.86110594108701,0.93924222866694,0.97183918188016,1.0510377466679,1.1248085597157,1.1805661781629,1.2060520313183,1.2870901748538,1.3467060487469,1.419748566548,1.4930113442739,1.5233661865195,1.6291546697418,1.6687760437528,1.7517802578211,1.7828743148843,1.8640559593836,1.9024009352922,1.9445452898741,2.0042892436186,2.0429756359259,2.0702872782946,2.0901099761327,2.0997672257821,2.1029779444138,2.0654643664757,2.0357843961318];

let isHeartbeatEnabled = false;
let currentAnimSpeed = 3;
let currentBpm = 72; 
let heartbeatPulse = 0; 
let colLambda = { r: 255, g: 255, b: 255 };
let colCircle = { r: 255, g: 255, b: 255 };
let colBars = { r: 255, g: 115, b: 0 };
let colLine = { r: 255, g: 115, b: 0 };
let colShadow = { r: 255, g: 115, b: 0 };
let currentScale = 1.0;
let targetScale = 1.0;
let lastPacketTime = 0;
let lastSoundTime = 0;
let audioMix = 0;
let bassMultiplier = 3.0;
let customLogoScale = 1.0;
let minScale = 0.5;
let maxScale = 1.0;
// --- BACKGROUND PICTURE STATE ---
let bgImagePath = '';
let bgEnabled   = false;
let bgFit       = 'cover';
let bgOpacity   = 1.0;
let bgBlur      = 0;
let bgDim       = 0.3;
let lineBlur       = 1.5;                       // px, softens the line itself
let lineShadowBlur = 8;                         // px, colored glow size
let colLineShadow  = { r: 255, g: 115, b: 0 }; 

class SmartwatchDevice {
    constructor() { this.baseBpm = 72; this.isMonitoring = false; this.timer = null; this.onBeatCallback = null; }
    startMonitoring(onBeat) { this.onBeatCallback = onBeat; this.isMonitoring = true; this._scheduleNextBeat(); }
    stopMonitoring() { this.isMonitoring = false; if (this.timer) clearTimeout(this.timer); }
    setBpm(bpm) { this.baseBpm = bpm; }
    _scheduleNextBeat() {
        if (!this.isMonitoring) return;
        const currentBpm = this.baseBpm + (Math.random() - 0.5) * 4;
        const msPerBeat = 60000 / currentBpm;
        if (this.onBeatCallback) this.onBeatCallback();
        this.timer = setTimeout(() => this._scheduleNextBeat(), msPerBeat);
    }
}
const myWatch = new SmartwatchDevice();

// ==========================================
// THE ONLY LISTENER
// ==========================================
window.wallpaperPropertyListener = {
    applyUserProperties: function(properties) {
        
        // --- VISUALIZER SETTINGS ---
        if (properties.bass_intensity) bassMultiplier = properties.bass_intensity.value;
        if (properties.heartbeat_enabled) isHeartbeatEnabled = properties.heartbeat_enabled.value;
        if (properties.lambda_speed) currentAnimSpeed = properties.lambda_speed.value;
        if (properties.bpm) currentBpm = properties.bpm.value;
        if (properties.min_scale) minScale = properties.min_scale.value;
        if (properties.max_scale) maxScale = properties.max_scale.value;

        if (properties.custom_logo_size) {
            customLogoScale = properties.custom_logo_size.value;
            const customImg = document.getElementById('custom-logo');
            if (customImg) customImg.style.transform = `scale(${customLogoScale})`;
        }

        if (properties.custom_logo) {
            const polygon = document.getElementById('lambda-polygon');
            const container = document.getElementById('custom-logo-container');
            const customImg = document.getElementById('custom-logo');
            
            if (properties.custom_logo.value) {
                polygon.style.display = 'none';
                container.style.display = 'block';
                const imageUrl = `url('file:///${properties.custom_logo.value.replace(/\\/g, '/')}')`;
                customImg.style.webkitMaskImage = imageUrl;
                customImg.style.maskImage = imageUrl;
                customImg.style.transform = `scale(${customLogoScale})`;
            } else {
                polygon.style.display = 'block';
                container.style.display = 'none';
                customImg.style.webkitMaskImage = 'none';
                customImg.style.maskImage = 'none';
            }
        }

        if (properties.background_image)   bgImagePath = properties.background_image.value   || '';
        if (properties.background_enabled) bgEnabled   = properties.background_enabled.value;
        if (properties.background_fit)     bgFit       = properties.background_fit.value;
        if (properties.background_opacity) bgOpacity   = properties.background_opacity.value;
        if (properties.background_blur)    bgBlur      = properties.background_blur.value;
        if (properties.background_dim)     bgDim       = properties.background_dim.value;

        refreshBackground();

        const parseColor = (val) => {
            const c = val.split(' ').map(v => Math.round(v * 255));
            return { r: c[0], g: c[1], b: c[2] };
        };

        if (properties.color_lambda) colLambda = parseColor(properties.color_lambda.value);
        if (properties.color_circle) colCircle = parseColor(properties.color_circle.value);
        if (properties.color_bars) colBars = parseColor(properties.color_bars.value);
        if (properties.color_bar_line) colLine = parseColor(properties.color_bar_line.value);
        if (properties.color_shadow) colShadow = parseColor(properties.color_shadow.value);
                // NEW ↓
        if (properties.line_blur)         lineBlur       = properties.line_blur.value;
        if (properties.line_shadow_blur)  lineShadowBlur = properties.line_shadow_blur.value;
        if (properties.color_line_shadow) colLineShadow  = parseColor(properties.color_line_shadow.value);

        updateSVGColors(); 
        updateHeartbeatState();
    }
};

// ==========================================
// VISUALIZER FUNCTIONS
// ==========================================
function updateSVGColors() {
    const pStr = `rgb(${colLambda.r}, ${colLambda.g}, ${colLambda.b})`;
    const cStr = `rgb(${colCircle.r}, ${colCircle.g}, ${colCircle.b})`;
    const sStr = `rgba(${colShadow.r}, ${colShadow.g}, ${colShadow.b}, 1)`;
    const filterStr = `drop-shadow(0 0 10px rgba(255, 255, 255, 0.8)) drop-shadow(0 0 25px ${sStr}) drop-shadow(0 0 50px ${sStr})`;

    const ring = document.getElementById('lambda-ring');
    const poly = document.getElementById('lambda-polygon');
    if (ring) ring.setAttribute('stroke', cStr);
    if (poly) poly.setAttribute('fill', pStr);

    const svg = document.querySelector('.lambda-svg');
    if (svg) svg.style.filter = filterStr;
    const container = document.getElementById('custom-logo-container');
    if (container) container.style.filter = filterStr;
    const customImg = document.getElementById('custom-logo');
    if (customImg) customImg.style.backgroundColor = pStr;
}

function updateHeartbeatState() {
    if (isHeartbeatEnabled) {
        myWatch.setBpm(currentBpm);
        myWatch.startMonitoring(() => { heartbeatPulse = 1.0; });
    } else {
        myWatch.stopMonitoring();
        heartbeatPulse = 0;
    }
}

// ==========================================
// BACKGROUND PICTURE
// ==========================================
function toFileUrl(rawPath) {
    if (!rawPath) return '';
    let p = String(rawPath).replace(/\\/g, '/');
    if (/^(file|https?):/i.test(p)) return p;          // already a URL
    p = p.replace(/^\/+/, '');
    return encodeURI('file:///' + p);
}

// ==========================================
// BACKGROUND PICTURE
// ==========================================
function refreshBackground() {
    const layer = document.getElementById('bg-layer');
    if (!layer) return;

    if (bgImagePath) {
        // --- exact same URL form as custom_logo ---
        const imageUrl = `url('file:///${bgImagePath.replace(/\\/g, '/')}')`;
        layer.style.backgroundImage = imageUrl;

        switch (bgFit) {
            case 'contain': layer.style.backgroundSize = 'contain';    break;
            case 'stretch': layer.style.backgroundSize = '100% 100%';  break;
            case 'tile':    layer.style.backgroundSize = 'auto';       break;
            default:        layer.style.backgroundSize = 'cover';      break;
        }
        // enabled is the "apply" button — off = hide, on = show
        layer.style.opacity = bgEnabled ? String(bgOpacity) : '0';
    } else {
        layer.style.backgroundImage = 'none';
        layer.style.opacity = '0';
    }

    layer.style.filter    = `blur(${bgBlur}px) brightness(${Math.max(0, 1 - bgDim)})`;
    layer.style.transform = bgBlur > 0 ? 'scale(1.1)' : 'none';
}

function wallpaperAudioListener(audioArray) {
    lastPacketTime = Date.now(); 
    for(var i=0; i<64; i++) smoothSample[i] = (audioArray[i] / pinkNoise[i]);
    for(var i=0; i<64; i++){
        if(i == 0) smooth[i] = (smoothSample[i] + smoothSample[i+1]) / 2;
        else if(i == 63) smooth[i] = (smoothSample[i-1] + smoothSample[i]) / 2;
        else smooth[i] = (smoothSample[i-1] + 2 * smoothSample[i] + smoothSample[i+1]) / 4;
    }
    for(var i=0; i<64; i++){
        audioSampleA[i] = smooth[i] * 0.4 + audioSampleA[i] * 0.6;
        audioSample[i] = audioSampleA[i];
        audioSample[128-i-1] = audioSampleA[i];
    }
}

function hookAudioListener() {
    if (window.wallpaperRegisterAudioListener) {
        window.wallpaperRegisterAudioListener(wallpaperAudioListener);
    } else {
        window.wallpaperAudioListener = wallpaperAudioListener;
    }
}
hookAudioListener();
window.addEventListener('focus', hookAudioListener);
window.addEventListener('click', hookAudioListener);
if (navigator.mediaDevices) {
    navigator.mediaDevices.addEventListener('devicechange', () => {
        hookAudioListener();
        audioSample.fill(0); audioSampleA.fill(0);
        lastPacketTime = Date.now(); 
    });
}

function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    vizCanvas.width = window.innerWidth * dpr;
    vizCanvas.height = window.innerHeight * dpr;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function drawVisualizer() {
    requestAnimationFrame(drawVisualizer);
    ctx.clearRect(0, 0, vizCanvas.width, vizCanvas.height);

    const dpr = window.devicePixelRatio || 1;
    const centerX = vizCanvas.width / 2;
    const centerY = vizCanvas.height / 2;
    const now = Date.now();
    
    let sumAudio = 0;
    for(let i=0; i<10; i++) sumAudio += audioSample[i];
    let bassAvg = (audioSample[0] + audioSample[1] + audioSample[2] + audioSample[3]) / 4;
    let time = now / 1000;

    const isAudioProcessing = (now - lastPacketTime) < 200; 
    if (!isAudioProcessing) {
        audioMix = 0;
        audioSample.fill(0); 
    } else {
        if (sumAudio > 0.05) lastSoundTime = now;
        const isAudioActive = (now - lastSoundTime) < 3000;
        if (isAudioActive) {
            audioMix += (1 - audioMix) * 0.1; 
        } else {
            audioMix -= 0.005; 
            if (audioMix < 0) audioMix = 0;
        }
    }

    let safeMin = Math.max(0.01, minScale);
    let safeMax = Math.max(safeMin, maxScale);
    const scaleRange = safeMax - safeMin; 

    if (isHeartbeatEnabled) {
        targetScale = safeMin + (heartbeatPulse * scaleRange);
        heartbeatPulse *= 0.85; 
    } else {
        let safeSpeed = Math.max(0.3, currentAnimSpeed); 
        const idleScale = safeMin + (((Math.sin(time * safeSpeed) + 1) / 2) * scaleRange);
        const bassRatio = Math.min(1.0, bassAvg * bassMultiplier); 
        const audioScale = safeMin + (bassRatio * scaleRange);
        targetScale = (idleScale * (1 - audioMix)) + (audioScale * audioMix);
    }

    if (targetScale > safeMax) targetScale = safeMax;
    if (targetScale < safeMin) targetScale = safeMin;
    currentScale += (targetScale - currentScale) * 0.15;
    if (currentScale > safeMax) currentScale = safeMax;
    if (currentScale < safeMin) currentScale = safeMin;
    
    lambdaCircle.style.transform = `scale(${currentScale})`;

    const rect = lambdaCircle.getBoundingClientRect();
    const radiusRatio = 121 / 256; 
    const baseRadius = (rect.width / 2) * (radiusRatio * 2) * dpr; 

    ctx.beginPath();
    ctx.arc(centerX, centerY, baseRadius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${colCircle.r}, ${colCircle.g}, ${colCircle.b}, 0.4)`; 
    ctx.lineWidth = 2 * dpr;
    ctx.stroke();

    ctx.lineWidth = 3 * dpr; 
    ctx.lineCap = 'round';
    const totalBars = 128;
    const angleStep = (Math.PI * 2) / totalBars;
    const points = [];
    const barStartColor = `rgba(${colBars.r}, ${colBars.g}, ${colBars.b}, 1)`;
    const barEndColor = `rgba(${colShadow.r}, ${colShadow.g}, ${colShadow.b}, 1)`;

    for (let i = 0; i < totalBars; i++) {
        let audioValue = audioSample[i];
        if (audioValue < 0.02) audioValue = 0; 
        let extraBeatHeight = isHeartbeatEnabled ? (heartbeatPulse * 200 * dpr) : 0;
        const barHeight = (audioValue * 250 * dpr) + extraBeatHeight; 
        
        const angle = i * angleStep - Math.PI / 2;
        const startX = centerX + Math.cos(angle) * baseRadius;
        const startY = centerY + Math.sin(angle) * baseRadius;
        const endX = centerX + Math.cos(angle) * (baseRadius + barHeight);
        const endY = centerY + Math.sin(angle) * (baseRadius + barHeight);

        points.push({x: endX, y: endY});

        if (barHeight > 1 && audioMix > 0.01) {
            const gradient = ctx.createLinearGradient(startX, startY, endX, endY);
            gradient.addColorStop(0, barStartColor); 
            gradient.addColorStop(1, barEndColor); 
            ctx.strokeStyle = gradient;
            ctx.shadowBlur = 15 * dpr;
            ctx.shadowColor = `rgba(${colShadow.r}, ${colShadow.g}, ${colShadow.b}, 1)`;
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
            ctx.stroke();
        }
    }

    if (audioMix > 0.01) {
        ctx.save();
        ctx.beginPath();
        ctx.strokeStyle = `rgba(${colLine.r}, ${colLine.g}, ${colLine.b}, 0.6)`; 
        ctx.lineWidth = 1 * dpr;

        // --- Blur the line itself (canvas filter, Chrome/CEF 52+) ---
        if (lineBlur > 0) ctx.filter = `blur(${lineBlur * dpr}px)`;

        // --- Small colored glow behind the line ---
        if (lineShadowBlur > 0) {
            ctx.shadowBlur  = lineShadowBlur * dpr;
            ctx.shadowColor = `rgba(${colLineShadow.r}, ${colLineShadow.g}, ${colLineShadow.b}, 0.8)`;
        } else {
            ctx.shadowBlur  = 0;
        }

        for (let i = 0; i < points.length; i++) {
            if (i === 0) ctx.moveTo(points[i].x, points[i].y);
            else ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
    }
}

window.onload = function() {
    refreshBackground();
    updateHeartbeatState();
    updateSVGColors(); 
    drawVisualizer();
};