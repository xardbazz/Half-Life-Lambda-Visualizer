# Half-Life Lambda Visualizer & Night Sky

Hello! This is a Wallpaper Engine Web project I've been suffering through.

It combines a procedural WebGL Night Sky (with live weather API integration), a responsive audio visualizer, and a customizable Half-Life Lambda logo. I'm still working on it, so you just wait my friend.
What it does

Creates an interactive, audio-reactive Wallpaper Engine background. It layers a GPU-rendered night sky, a WebGL/Canvas audio visualizer, and a customizable logo that breathes, scales, and thumps to your music (or your smartwatch's heartbeat). It also features a custom mouse fluid trail and live weather synchronization.
Features

    Live Weather Syncing: Pulls real-time weather data for Moscow via Open-Meteo API and automatically adjusts the Night Sky shaders (rain, snow, fog, aurora).

    Audio Visualizer: 128-band circular audio visualizer that reacts to system audio, featuring smooth audio decay, pink noise compensation, and a connecting "web" wireframe.

    Dynamic Logo Scaling: The Lambda logo scales perfectly in sync with the visualizer bars based on strict Min/Max sliders. Includes a "Smartwatch Heartbeat" simulation mode.

    Custom Logo Injection: Upload any transparent .png to replace the Lambda logo. The image is automatically masked and color-tinted to match your chosen theme.

    Night Sky Audio Engine: A separate, custom-built background audio engine that dynamically crossfades nature sounds (wind, rain, crickets, campfire) based on the live weather mode.

    Mouse Fluid Trails: (Currently swapping between a lightweight 2D Canvas particle system and a heavy WebGL fluid simulation).

The Readme of My Suffering

This project is an absolute total war. Here is a log of the battle:

    The Wallpaper Engine Audio API: window.wallpaperRegisterAudioListener works when it wants to. Sometimes it needs to be called inside window.onload, sometimes it needs to be called onFocus, and sometimes it just silently drops the connection when you switch from speakers to headphones. We literally had to write a hook function just to yell at the API to wake up.

    The WebGL Fluid Nightmare: Trying to get Pavel Dobryakov's legendary WebGL fluid simulation to run inside a Wallpaper Engine iframe was a mistake. It relies on a missing LDR_LLL1_0.png texture, a dat.gui dependency, and Google Analytics hooks that crash the whole script silently if it can't find them. It still doesn't work perfectly.

    The Battle of the Scales: Having a lambda_size slider and a min_scale/max_scale slider at the same time created a CSS/JS mathematical black hole. The logo was scaling to 400% of the screen size because the sliders were multiplying against each other. We eventually had to execute lambda_size to restore order.

    The Smartwatch Integration: Trying to get a real Huawei Watch Fit 4 or a Mi Band 4 to talk to Wallpaper Engine through Python scripts, Xiaomi authentication keys, and Pulsoid WebSockets was a multi-day descent into madness. It is currently a simulated heartbeat. We do not speak of the Mi Band authentication keys.

    The CSS Mask Betrayal: Custom logo colors broke because applying a drop-shadow to a masked <div> inside Chromium makes the shadow render as a solid square. We had to create an entire wrapper <div> just to hold the shadow so the inner mask could do its job.

Status

**Work In Progress. The WebGL fluid simulation is currently broken and the audio devices are acting up. We will return to this later. Do not judge me.**
