(function() {
'use strict';

const canvas = document.getElementById('fluid-canvas');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const params = { alpha: true, depth: false, stencil: false, antialias: false, preserveDrawingBuffer: false };
const gl = canvas.getContext('webgl2', params);

if (!gl) {
    console.error("WebGL2 is not supported in this environment.");
    return;
}

const ext = {
    colorBufferFloat: gl.getExtension('EXT_color_buffer_float'),
    linearFiltering: gl.getExtension('OES_texture_float_linear'),
    halfFloat: gl.HALF_FLOAT
};

const config = {
    SIM_RESOLUTION: 128, DYE_RESOLUTION: 1024, DENSITY_DISSIPATION: 1.0, VELOCITY_DISSIPATION: 0.2,
    PRESSURE: 0.8, PRESSURE_ITERATIONS: 20, CURL: 30, SPLAT_RADIUS: 0.25, SPLAT_FORCE: 6000
};

let pointers = [{ id: -1, texcoordX: 0, texcoordY: 0, prevTexcoordX: 0, prevTexcoordY: 0, deltaX: 0, deltaY: 0, down: false, moved: false, color: { r: 0, g: 0, b: 0 } }];

const baseVertexShader = compileShader(gl.VERTEX_SHADER, `precision highp float; attribute vec2 aPosition; varying vec2 vUv; varying vec2 vL; varying vec2 vR; varying vec2 vT; varying vec2 vB; uniform vec2 texelSize; void main () { vUv = aPosition * 0.5 + 0.5; vL = vUv - vec2(texelSize.x, 0.0); vR = vUv + vec2(texelSize.x, 0.0); vT = vUv + vec2(0.0, texelSize.y); vB = vUv - vec2(0.0, texelSize.y); gl_Position = vec4(aPosition, 0.0, 1.0); }`);
const copyShader = compileShader(gl.FRAGMENT_SHADER, `precision mediump float; precision mediump sampler2D; varying highp vec2 vUv; uniform sampler2D uTexture; void main () { gl_FragColor = texture2D(uTexture, vUv); }`);
const clearShader = compileShader(gl.FRAGMENT_SHADER, `precision mediump float; precision mediump sampler2D; varying highp vec2 vUv; uniform sampler2D uTexture; uniform float value; void main () { gl_FragColor = value * texture2D(uTexture, vUv); }`);
const splatShader = compileShader(gl.FRAGMENT_SHADER, `precision highp float; precision highp sampler2D; varying vec2 vUv; uniform sampler2D uTarget; uniform float aspectRatio; uniform vec3 color; uniform vec2 point; uniform float radius; void main () { vec2 p = vUv - point.xy; p.x *= aspectRatio; vec3 splat = exp(-dot(p, p) / radius) * color; vec3 base = texture2D(uTarget, vUv).xyz; gl_FragColor = vec4(base + splat, 1.0); }`);
const advectionShader = compileShader(gl.FRAGMENT_SHADER, `precision highp float; precision highp sampler2D; varying vec2 vUv; uniform sampler2D uVelocity; uniform sampler2D uSource; uniform vec2 texelSize; uniform float dt; uniform float dissipation; void main () { vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize; float decay = 1.0 + dissipation * dt; gl_FragColor = texture2D(uSource, coord) / decay; }`);
const divergenceShader = compileShader(gl.FRAGMENT_SHADER, `precision mediump float; precision mediump sampler2D; varying highp vec2 vUv; varying highp vec2 vL; varying highp vec2 vR; varying highp vec2 vT; varying highp vec2 vB; uniform sampler2D uVelocity; void main () { float L = texture2D(uVelocity, vL).x; float R = texture2D(uVelocity, vR).x; float T = texture2D(uVelocity, vT).y; float B = texture2D(uVelocity, vB).y; vec2 C = texture2D(uVelocity, vUv).xy; if (vL.x < 0.0) { L = -C.x; } if (vR.x > 1.0) { R = -C.x; } if (vT.y > 1.0) { T = -C.y; } if (vB.y < 0.0) { B = -C.y; } gl_FragColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0); }`);
const curlShader = compileShader(gl.FRAGMENT_SHADER, `precision mediump float; precision mediump sampler2D; varying highp vec2 vUv; varying highp vec2 vL; varying highp vec2 vR; varying highp vec2 vT; varying highp vec2 vB; uniform sampler2D uVelocity; void main () { float L = texture2D(uVelocity, vL).y; float R = texture2D(uVelocity, vR).y; float T = texture2D(uVelocity, vT).x; float B = texture2D(uVelocity, vB).x; gl_FragColor = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0); }`);
const vorticityShader = compileShader(gl.FRAGMENT_SHADER, `precision highp float; precision highp sampler2D; varying vec2 vUv; varying vec2 vL; varying vec2 vR; varying vec2 vT; varying vec2 vB; uniform sampler2D uVelocity; uniform sampler2D uCurl; uniform float curl; uniform float dt; void main () { float L = texture2D(uCurl, vL).x; float R = texture2D(uCurl, vR).x; float T = texture2D(uCurl, vT).x; float B = texture2D(uCurl, vB).x; float C = texture2D(uCurl, vUv).x; vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L)); force /= length(force) + 0.0001; force *= curl * C; force.y *= -1.0; vec2 velocity = texture2D(uVelocity, vUv).xy + force * dt; gl_FragColor = vec4(min(max(velocity, -1000.0), 1000.0), 0.0, 1.0); }`);
const pressureShader = compileShader(gl.FRAGMENT_SHADER, `precision mediump float; precision mediump sampler2D; varying highp vec2 vUv; varying highp vec2 vL; varying highp vec2 vR; varying highp vec2 vT; varying highp vec2 vB; uniform sampler2D uPressure; uniform sampler2D uDivergence; void main () { float L = texture2D(uPressure, vL).x; float R = texture2D(uPressure, vR).x; float T = texture2D(uPressure, vT).x; float B = texture2D(uPressure, vB).x; float divergence = texture2D(uDivergence, vUv).x; gl_FragColor = vec4((L + R + B + T - divergence) * 0.25, 0.0, 0.0, 1.0); }`);
const gradientSubtractShader = compileShader(gl.FRAGMENT_SHADER, `precision mediump float; precision mediump sampler2D; varying highp vec2 vUv; varying highp vec2 vL; varying highp vec2 vR; varying highp vec2 vT; varying highp vec2 vB; uniform sampler2D uPressure; uniform sampler2D uVelocity; void main () { float L = texture2D(uPressure, vL).x; float R = texture2D(uPressure, vR).x; float T = texture2D(uPressure, vT).x; float B = texture2D(uPressure, vB).x; vec2 velocity = texture2D(uVelocity, vUv).xy - vec2(R - L, T - B); gl_FragColor = vec4(velocity, 0.0, 1.0); }`);
const displayShader = compileShader(gl.FRAGMENT_SHADER, `precision highp float; precision highp sampler2D; varying vec2 vUv; uniform sampler2D uTexture; void main () { vec3 c = texture2D(uTexture, vUv).rgb; gl_FragColor = vec4(c, max(c.r, max(c.g, c.b))); }`);

const copyProgram = createProgram(gl, baseVertexShader, copyShader);
const clearProgram = createProgram(gl, baseVertexShader, clearShader);
const splatProgram = createProgram(gl, baseVertexShader, splatShader);
const advectionProgram = createProgram(gl, baseVertexShader, advectionShader);
const divergenceProgram = createProgram(gl, baseVertexShader, divergenceShader);
const curlProgram = createProgram(gl, baseVertexShader, curlShader);
const vorticityProgram = createProgram(gl, baseVertexShader, vorticityShader);
const pressureProgram = createProgram(gl, baseVertexShader, pressureShader);
const gradienSubtractProgram = createProgram(gl, baseVertexShader, gradientSubtractShader);
const displayProgram = createProgram(gl, baseVertexShader, displayShader);

const blit = (() => {
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(0);
    return (target) => {
        if (target == null) { gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight); gl.bindFramebuffer(gl.FRAMEBUFFER, null); }
        else { gl.viewport(0, 0, target.width, target.height); gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo); }
        gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    }
})();

let dye, velocity, divergence, curl, pressure;

function createFBO (w, h) {
    gl.activeTexture(gl.TEXTURE0);
    let texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, ext.halfFloat, null);
    let fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.viewport(0, 0, w, h);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return { texture, fbo, width: w, height: h, texelSizeX: 1.0 / w, texelSizeY: 1.0 / h, attach (id) { gl.activeTexture(gl.TEXTURE0 + id); gl.bindTexture(gl.TEXTURE_2D, texture); return id; } };
}

function createDoubleFBO (w, h) {
    let fbo1 = createFBO(w, h);
    let fbo2 = createFBO(w, h);
    return { width: w, height: h, texelSizeX: fbo1.texelSizeX, texelSizeY: fbo1.texelSizeY, get read () { return fbo1; }, set read (value) { fbo1 = value; }, get write () { return fbo2; }, set write (value) { fbo2 = value; }, swap () { let temp = fbo1; fbo1 = fbo2; fbo2 = temp; } };
}

function initFramebuffers () {
    let simRes = getResolution(gl, config.SIM_RESOLUTION);
    let dyeRes = getResolution(gl, config.DYE_RESOLUTION);
    dye = createDoubleFBO(dyeRes.width, dyeRes.height);
    velocity = createDoubleFBO(simRes.width, simRes.height);
    divergence = createFBO(simRes.width, simRes.height);
    curl = createFBO(simRes.width, simRes.height);
    pressure = createDoubleFBO(simRes.width, simRes.height);
}

function step (dt) {
    gl.disable(gl.BLEND);
    gl.useProgram(curlProgram.program); gl.uniform2f(curlProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY); gl.uniform1i(curlProgram.uniforms.uVelocity, velocity.read.attach(0)); blit(curl);
    gl.useProgram(vorticityProgram.program); gl.uniform2f(vorticityProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY); gl.uniform1i(vorticityProgram.uniforms.uVelocity, velocity.read.attach(0)); gl.uniform1i(vorticityProgram.uniforms.uCurl, curl.attach(1)); gl.uniform1f(vorticityProgram.uniforms.curl, config.CURL); gl.uniform1f(vorticityProgram.uniforms.dt, dt); blit(velocity.write); velocity.swap();
    gl.useProgram(divergenceProgram.program); gl.uniform2f(divergenceProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY); gl.uniform1i(divergenceProgram.uniforms.uVelocity, velocity.read.attach(0)); blit(divergence);
    gl.useProgram(clearProgram.program); gl.uniform1i(clearProgram.uniforms.uTexture, pressure.read.attach(0)); gl.uniform1f(clearProgram.uniforms.value, config.PRESSURE); blit(pressure.write); pressure.swap();
    gl.useProgram(pressureProgram.program); gl.uniform2f(pressureProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY); gl.uniform1i(pressureProgram.uniforms.uDivergence, divergence.attach(0));
    for (let i = 0; i < config.PRESSURE_ITERATIONS; i++) { gl.uniform1i(pressureProgram.uniforms.uPressure, pressure.read.attach(1)); blit(pressure.write); pressure.swap(); }
    gl.useProgram(gradienSubtractProgram.program); gl.uniform2f(gradienSubtractProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY); gl.uniform1i(gradienSubtractProgram.uniforms.uPressure, pressure.read.attach(0)); gl.uniform1i(gradienSubtractProgram.uniforms.uVelocity, velocity.read.attach(1)); blit(velocity.write); velocity.swap();
    gl.useProgram(advectionProgram.program); gl.uniform2f(advectionProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY); gl.uniform1i(advectionProgram.uniforms.uVelocity, velocity.read.attach(0)); gl.uniform1i(advectionProgram.uniforms.uSource, velocity.read.attach(0)); gl.uniform1f(advectionProgram.uniforms.dt, dt); gl.uniform1f(advectionProgram.uniforms.dissipation, config.VELOCITY_DISSIPATION); blit(velocity.write); velocity.swap();
    gl.uniform1i(advectionProgram.uniforms.uVelocity, velocity.read.attach(0)); gl.uniform1i(advectionProgram.uniforms.uSource, dye.read.attach(1)); gl.uniform1f(advectionProgram.uniforms.dissipation, config.DENSITY_DISSIPATION); blit(dye.write); dye.swap();
}

function render () {
    gl.useProgram(displayProgram.program);
    gl.uniform1i(displayProgram.uniforms.uTexture, dye.read.attach(0));
    blit(null);
}

let lastUpdateTime = Date.now();

function update () {
    const dt = Math.min((Date.now() - lastUpdateTime) / 1000, 0.016666);
    lastUpdateTime = Date.now();

    if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        initFramebuffers();
    }
    
    pointers.forEach(p => {
        if (p.moved) {
            p.moved = false;
            let dx = p.deltaX * config.SPLAT_FORCE;
            let dy = p.deltaY * config.SPLAT_FORCE;
            
            gl.useProgram(splatProgram.program);
            gl.uniform1i(splatProgram.uniforms.uTarget, velocity.read.attach(0));
            gl.uniform1f(splatProgram.uniforms.aspectRatio, canvas.width / canvas.height);
            gl.uniform2f(splatProgram.uniforms.point, p.texcoordX, p.texcoordY);
            gl.uniform3f(splatProgram.uniforms.color, dx, dy, 0.0);
            gl.uniform1f(splatProgram.uniforms.radius, config.SPLAT_RADIUS / 100.0);
            blit(velocity.write); velocity.swap();

            gl.uniform1i(splatProgram.uniforms.uTarget, dye.read.attach(0));
            gl.uniform3f(splatProgram.uniforms.color, p.color.r, p.color.g, p.color.b);
            blit(dye.write); dye.swap();
        }
    });

    step(dt);
    render();
    requestAnimationFrame(update);
}

window.addEventListener('mousemove', e => {
    let pointer = pointers[0];
    pointer.down = true;
    let posX = Math.floor(e.clientX * (window.devicePixelRatio || 1));
    let posY = Math.floor(e.clientY * (window.devicePixelRatio || 1));
    
    pointer.prevTexcoordX = pointer.texcoordX;
    pointer.prevTexcoordY = pointer.texcoordY;
    pointer.texcoordX = posX / canvas.width;
    pointer.texcoordY = 1.0 - posY / canvas.height;
    
    let aspectRatio = canvas.width / canvas.height;
    let deltaX = pointer.texcoordX - pointer.prevTexcoordX;
    let deltaY = pointer.texcoordY - pointer.prevTexcoordY;
    
    if (aspectRatio < 1) deltaX *= aspectRatio;
    if (aspectRatio > 1) deltaY /= aspectRatio;
    
    pointer.deltaX = deltaX;
    pointer.deltaY = deltaY;
    pointer.moved = Math.abs(deltaX) > 0 || Math.abs(deltaY) > 0;
    
    if (Math.random() > 0.9) {
        let c = HSVtoRGB(Math.random(), 1.0, 1.0);
        pointer.color = { r: c.r * 0.15, g: c.g * 0.15, b: c.b * 0.15 };
    }
});

function HSVtoRGB (h, s, v) {
    let r, g, b, i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
    switch (i % 6) { case 0: r = v, g = t, b = p; break; case 1: r = q, g = v, b = p; break; case 2: r = p, g = v, b = t; break; case 3: r = p, g = q, b = v; break; case 4: r = t, g = p, b = v; break; case 5: r = v, g = p, b = q; break; }
    return { r, g, b };
}

function getResolution (gl, resolution) {
    let aspectRatio = gl.drawingBufferWidth / gl.drawingBufferHeight;
    if (aspectRatio < 1) aspectRatio = 1.0 / aspectRatio;
    let min = Math.round(resolution);
    let max = Math.round(resolution * aspectRatio);
    return gl.drawingBufferWidth > gl.drawingBufferHeight ? { width: max, height: min } : { width: min, height: max };
}

function compileShader (type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) console.error("Shader compile error:", gl.getShaderInfoLog(shader));
    return shader;
}

function createProgram (gl, vertexShader, fragmentShader) {
    let program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) console.error("Program link error:", gl.getProgramInfoLog(program));
    let uniforms = {};
    let count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
        let name = gl.getActiveUniform(program, i).name;
        uniforms[name] = gl.getUniformLocation(program, name);
    }
    return { program, uniforms };
}

initFramebuffers();
update();
})();
