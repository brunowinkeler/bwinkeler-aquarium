// Phase 0 spike for webOS 4 (Chromium 53). ES5 only: it ships without a build step.
(function () {
  'use strict';

  var config = window.SPIKE_CONFIG || {};
  var baseUrl = String(config.baseUrl || '').replace(/\/+$/, '');
  var TAU = Math.PI * 2;
  var SLICES = 16;
  var TEXTURE_WIDTH = 256;
  var TEXTURE_HEIGHT = 160;
  var KEY_NAMES = {
    13: 'OK',
    37: 'Left',
    38: 'Up',
    39: 'Right',
    40: 'Down',
    403: 'Red',
    404: 'Green',
    405: 'Yellow',
    406: 'Blue',
    461: 'Back',
  };

  var canvas = document.getElementById('stage');
  var video = document.getElementById('video');
  var hud = document.getElementById('hud');

  var state = {
    startedAt: Date.now(),
    spriteCount: config.sprites || 20,
    renderer: 'webgl',
    scale: 1,
    showHud: true,
    lastKey: '-',
    lastKeyAt: Date.now(),
    videoStatus: 'loading',
    lastVideoTime: -1,
    fpsNow: 0,
    fpsHistory: [],
    tests: [],
  };

  var textures = [];
  var sprites = [];
  var gl = null;
  var ctx2d = null;
  var program = null;
  var glTextures = [];
  var uniforms = {};

  function makeFishTexture(hue) {
    var texture = document.createElement('canvas');
    texture.width = TEXTURE_WIDTH;
    texture.height = TEXTURE_HEIGHT;
    var g = texture.getContext('2d');
    g.fillStyle = 'hsl(' + hue + ', 85%, 60%)';
    g.beginPath();
    g.moveTo(8, 20);
    g.lineTo(70, 80);
    g.lineTo(8, 140);
    g.closePath();
    g.fill();
    g.beginPath();
    g.ellipse(150, 80, 95, 58, 0, 0, TAU);
    g.fill();
    g.strokeStyle = 'hsl(' + hue + ', 70%, 35%)';
    g.lineWidth = 6;
    for (var stripe = 0; stripe < 3; stripe++) {
      g.beginPath();
      g.moveTo(110 + stripe * 30, 32);
      g.lineTo(110 + stripe * 30, 128);
      g.stroke();
    }
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(205, 65, 13, 0, TAU);
    g.fill();
    g.fillStyle = '#111';
    g.beginPath();
    g.arc(208, 65, 6, 0, TAU);
    g.fill();
    return texture;
  }

  function Sprite(index) {
    this.texture = index % textures.length;
    this.size = 0.6 + Math.random() * 0.7;
    this.x = Math.random() * window.innerWidth;
    this.baseY = 120 + Math.random() * (window.innerHeight - 240);
    this.y = this.baseY;
    this.speed = 50 + Math.random() * 90;
    this.dir = Math.random() < 0.5 ? -1 : 1;
    this.phase = Math.random() * TAU;
    this.bob = Math.random() * TAU;
  }

  Sprite.prototype.update = function (dt, width) {
    var half = (TEXTURE_WIDTH * this.size) / 2;
    this.x += this.dir * this.speed * dt;
    if (this.x > width + half) this.dir = -1;
    if (this.x < -half) this.dir = 1;
    this.phase += dt * TAU * 1.4;
    this.bob += dt * 0.6;
    this.y = this.baseY + Math.sin(this.bob) * 24;
  };

  function syncSprites() {
    while (sprites.length < state.spriteCount) sprites.push(new Sprite(sprites.length));
    sprites.length = state.spriteCount;
  }

  var VERTEX_SHADER = [
    'attribute vec2 a_uv;',
    'uniform vec2 u_resolution;',
    'uniform vec2 u_center;',
    'uniform vec2 u_size;',
    'uniform float u_dir;',
    'uniform float u_phase;',
    'varying vec2 v_uv;',
    'void main() {',
    '  float tail = 1.0 - a_uv.x;',
    '  float wave = 0.12 * tail * tail * sin(u_phase - tail * 6.2831);',
    '  vec2 local = vec2((a_uv.x - 0.5) * u_size.x * u_dir, (a_uv.y - 0.5 + wave) * u_size.y);',
    '  vec2 clip = ((u_center + local) / u_resolution) * 2.0 - 1.0;',
    '  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);',
    '  v_uv = a_uv;',
    '}',
  ].join('\n');

  var FRAGMENT_SHADER = [
    'precision mediump float;',
    'uniform sampler2D u_texture;',
    'varying vec2 v_uv;',
    'void main() { gl_FragColor = texture2D(u_texture, v_uv); }',
  ].join('\n');

  function compile(type, source) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader));
    }
    return shader;
  }

  function initWebGl() {
    var options = { alpha: true, premultipliedAlpha: true, antialias: false };
    gl = canvas.getContext('webgl', options) || canvas.getContext('experimental-webgl', options);
    if (!gl) return false;
    program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX_SHADER));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
    gl.linkProgram(program);
    gl.useProgram(program);

    var uv = [];
    for (var i = 0; i <= SLICES; i++) uv.push(i / SLICES, 1, i / SLICES, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uv), gl.STATIC_DRAW);
    var location = gl.getAttribLocation(program, 'a_uv');
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);

    ['u_resolution', 'u_center', 'u_size', 'u_dir', 'u_phase', 'u_texture'].forEach(
      function (name) {
        uniforms[name] = gl.getUniformLocation(program, name);
      }
    );
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    glTextures = textures.map(function (source) {
      var texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return texture;
    });
    return true;
  }

  function resizeCanvas() {
    var width = Math.round(window.innerWidth * state.scale);
    var height = Math.round(window.innerHeight * state.scale);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }

  function drawWebGl() {
    var scale = state.scale;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(uniforms.u_resolution, canvas.width, canvas.height);
    gl.uniform1i(uniforms.u_texture, 0);
    for (var i = 0; i < sprites.length; i++) {
      var sprite = sprites[i];
      gl.bindTexture(gl.TEXTURE_2D, glTextures[sprite.texture]);
      gl.uniform2f(uniforms.u_center, sprite.x * scale, sprite.y * scale);
      gl.uniform2f(
        uniforms.u_size,
        TEXTURE_WIDTH * sprite.size * scale,
        TEXTURE_HEIGHT * sprite.size * scale
      );
      gl.uniform1f(uniforms.u_dir, sprite.dir);
      gl.uniform1f(uniforms.u_phase, sprite.phase);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, (SLICES + 1) * 2);
    }
  }

  function draw2d() {
    var scale = state.scale;
    ctx2d.setTransform(1, 0, 0, 1, 0, 0);
    ctx2d.clearRect(0, 0, canvas.width, canvas.height);
    for (var i = 0; i < sprites.length; i++) {
      var sprite = sprites[i];
      var width = TEXTURE_WIDTH * sprite.size * scale;
      var height = TEXTURE_HEIGHT * sprite.size * scale;
      var sliceWidth = TEXTURE_WIDTH / SLICES;
      ctx2d.setTransform(sprite.dir, 0, 0, 1, sprite.x * scale, sprite.y * scale);
      for (var s = 0; s < SLICES; s++) {
        var tail = 1 - (s + 0.5) / SLICES;
        var wave = 0.12 * tail * tail * Math.sin(sprite.phase - tail * TAU);
        ctx2d.drawImage(
          textures[sprite.texture],
          s * sliceWidth,
          0,
          sliceWidth,
          TEXTURE_HEIGHT,
          (s / SLICES - 0.5) * width,
          (wave - 0.5) * height,
          width / SLICES + 1,
          height
        );
      }
    }
  }

  function switchRenderer(name) {
    // A canvas keeps its first context type, so switching needs a fresh element.
    var fresh = document.createElement('canvas');
    fresh.id = 'stage';
    canvas.parentNode.replaceChild(fresh, canvas);
    canvas = fresh;
    gl = null;
    ctx2d = null;
    resizeCanvas();
    if (name === 'webgl' && initWebGl()) {
      state.renderer = 'webgl';
    } else {
      ctx2d = canvas.getContext('2d');
      state.renderer = '2d';
    }
  }

  var lastFrame = 0;
  var framesThisSecond = 0;
  var secondStartedAt = 0;

  function frame(now) {
    if (!lastFrame) {
      lastFrame = now;
      secondStartedAt = now;
    }
    var dt = Math.min((now - lastFrame) / 1000, 0.1);
    lastFrame = now;
    framesThisSecond++;
    if (now - secondStartedAt >= 1000) {
      state.fpsNow = Math.round((framesThisSecond * 1000) / (now - secondStartedAt));
      state.fpsHistory.push(state.fpsNow);
      if (state.fpsHistory.length > 60) state.fpsHistory.shift();
      framesThisSecond = 0;
      secondStartedAt = now;
    }
    resizeCanvas();
    syncSprites();
    for (var i = 0; i < sprites.length; i++) sprites[i].update(dt, window.innerWidth);
    if (gl) drawWebGl();
    else drawAndKeepContext();
    window.requestAnimationFrame(frame);
  }

  function drawAndKeepContext() {
    if (!ctx2d) ctx2d = canvas.getContext('2d');
    draw2d();
  }

  function setTest(name, result) {
    for (var i = 0; i < state.tests.length; i++) {
      if (state.tests[i].name === name) {
        state.tests[i].result = result;
        return;
      }
    }
    state.tests.push({ name: name, result: result });
  }

  function request(method, path, token, done) {
    var xhr = new XMLHttpRequest();
    var started = Date.now();
    xhr.open(method, baseUrl + path);
    if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);
    xhr.timeout = 10000;
    xhr.onload = function () {
      var body;
      try {
        body = JSON.parse(xhr.responseText);
      } catch (error) {
        body = null;
      }
      done(xhr.status, body, Date.now() - started);
    };
    xhr.onerror = function () {
      done(0, null, Date.now() - started);
    };
    xhr.ontimeout = xhr.onerror;
    xhr.send();
  }

  function describe(status, ms) {
    return (status === 0 ? 'network/TLS/CORS error' : 'HTTP ' + status) + ' in ' + ms + ' ms';
  }

  function runNetworkTests() {
    state.tests = [];
    setTest('base URL', baseUrl || '(empty: edit spike-config.js)');
    setTest('GET /health/live', 'running');
    request('GET', '/health/live', null, function (status, body, ms) {
      setTest('GET /health/live', describe(status, ms));
      setTest('POST /api/tv/aquariums', 'running');
      request('POST', '/api/tv/aquariums', null, function (createStatus, created, createMs) {
        setTest('POST /api/tv/aquariums', describe(createStatus, createMs));
        if (createStatus !== 201 || !created) return;
        testSocket(created, function () {
          request('POST', '/api/tv/join-code', created.token, function (codeStatus, code, codeMs) {
            setTest(
              'POST /api/tv/join-code',
              describe(codeStatus, codeMs) + (code && code.code ? ' code ' + code.code : '')
            );
            request('DELETE', '/api/tv/aquarium', created.token, function (endStatus, _, endMs) {
              setTest('DELETE /api/tv/aquarium', describe(endStatus, endMs));
            });
          });
        });
      });
    });
  }

  function testSocket(created, next) {
    var name = 'WSS auth + snapshot + pong';
    var url = baseUrl.replace(/^http/, 'ws') + '/ws/tv/' + created.aquariumId;
    var started = Date.now();
    var pingSentAt = 0;
    var finished = false;
    var socket;
    function finish(result) {
      if (finished) return;
      finished = true;
      setTest(name, result);
      try {
        socket.close(1000, 'spike done');
      } catch (error) {
        setTest('WSS close', String(error));
      }
      next();
    }
    setTest(name, 'connecting');
    try {
      socket = new WebSocket(url);
    } catch (error) {
      finish('constructor failed: ' + error);
      return;
    }
    socket.onopen = function () {
      setTest(name, 'open in ' + (Date.now() - started) + ' ms, authenticating');
      socket.send(JSON.stringify({ type: 'auth', token: created.token }));
    };
    socket.onmessage = function (event) {
      var message = JSON.parse(event.data);
      if (message.type === 'snapshot') {
        pingSentAt = Date.now();
        socket.send('{"type":"ping"}');
      } else if (message.type === 'pong') {
        finish('OK, snapshot then pong RTT ' + (Date.now() - pingSentAt) + ' ms');
      }
    };
    socket.onerror = function () {
      finish('error after ' + (Date.now() - started) + ' ms');
    };
    socket.onclose = function (event) {
      finish('closed with code ' + event.code);
    };
    window.setTimeout(function () {
      finish('timeout');
    }, 15000);
  }

  function runStorageTest() {
    var name = 'IndexedDB Blob round trip';
    if (!window.indexedDB) {
      setTest(name, 'indexedDB missing');
      return;
    }
    setTest(name, 'running');
    var open = window.indexedDB.open('aquarium-spike', 1);
    open.onupgradeneeded = function () {
      open.result.createObjectStore('blobs');
    };
    open.onerror = function () {
      setTest(name, 'open failed: ' + (open.error && open.error.name));
    };
    open.onsuccess = function () {
      var db = open.result;
      var blob = new Blob([new Uint8Array(200000)], { type: 'image/png' });
      var write = db.transaction('blobs', 'readwrite');
      try {
        write.objectStore('blobs').put(blob, 'sample');
      } catch (error) {
        setTest(name, 'put threw ' + error.name);
        return;
      }
      write.oncomplete = function () {
        var read = db.transaction('blobs', 'readonly').objectStore('blobs').get('sample');
        read.onsuccess = function () {
          var value = read.result;
          setTest(
            name,
            value instanceof Blob
              ? 'OK, Blob of ' + value.size + ' bytes'
              : 'stored as ' + typeof value
          );
        };
      };
      write.onerror = function () {
        setTest(name, 'put failed: ' + (write.error && write.error.name));
      };
    };
  }

  function onKey(event) {
    var code = event.keyCode;
    state.lastKey = code + ' (' + (KEY_NAMES[code] || 'other') + ')';
    state.lastKeyAt = Date.now();
    if (code === 37) state.spriteCount = Math.max(0, state.spriteCount - 5);
    else if (code === 39) state.spriteCount = Math.min(60, state.spriteCount + 5);
    else if (code === 38) state.scale = state.scale === 1 ? 2 / 3 : 1;
    else if (code === 403) switchRenderer(state.renderer === 'webgl' ? '2d' : 'webgl');
    else if (code === 404) runNetworkTests();
    else if (code === 405) toggleVideo();
    else if (code === 406) state.showHud = !state.showHud;
    else if (code === 13) runStorageTest();
    else if (code === 461) window.close();
    else return;
    event.preventDefault();
  }

  function toggleVideo() {
    if (video.paused) video.play();
    else video.pause();
  }

  function watchVideo() {
    video.addEventListener('playing', function () {
      state.videoStatus = 'playing';
    });
    video.addEventListener('pause', function () {
      state.videoStatus = 'paused';
    });
    video.addEventListener('error', function () {
      state.videoStatus = 'error: copy a background.mp4 into spikes/tv-spike before packaging';
    });
  }

  function capabilities() {
    var probe = document.createElement('canvas');
    var probeGl = probe.getContext('webgl') || probe.getContext('experimental-webgl');
    var renderer = 'none';
    var maxTexture = 0;
    if (probeGl) {
      var info = probeGl.getExtension('WEBGL_debug_renderer_info');
      renderer = info
        ? probeGl.getParameter(info.UNMASKED_RENDERER_WEBGL)
        : probeGl.getParameter(probeGl.RENDERER);
      maxTexture = probeGl.getParameter(probeGl.MAX_TEXTURE_SIZE);
    }
    return [
      'UA: ' + navigator.userAgent,
      'GPU: ' + renderer + ' (max texture ' + maxTexture + ')',
      'screen ' +
        window.screen.width +
        'x' +
        window.screen.height +
        ', window ' +
        window.innerWidth +
        'x' +
        window.innerHeight +
        ', dpr ' +
        window.devicePixelRatio,
      'createImageBitmap: ' +
        (typeof window.createImageBitmap === 'function') +
        ', fetch: ' +
        (typeof window.fetch === 'function') +
        ', Promise: ' +
        (typeof window.Promise === 'function'),
    ].join('\n');
  }

  function formatDuration(ms) {
    var seconds = Math.floor(ms / 1000);
    var minutes = Math.floor(seconds / 60);
    var hours = Math.floor(minutes / 60);
    return hours + 'h ' + (minutes % 60) + 'm ' + (seconds % 60) + 's';
  }

  function renderHud(staticInfo) {
    hud.style.display = state.showHud ? 'block' : 'none';
    if (!state.showHud) return;
    var history = state.fpsHistory;
    var min = history.length ? Math.min.apply(Math, history) : 0;
    var sum = 0;
    for (var i = 0; i < history.length; i++) sum += history[i];
    var currentTime = video.currentTime;
    var videoMoving = currentTime !== state.lastVideoTime;
    state.lastVideoTime = currentTime;
    var memory = window.performance && window.performance.memory;
    var lines = [
      staticInfo,
      '',
      'renderer ' +
        state.renderer +
        ', scale ' +
        state.scale.toFixed(2) +
        ', canvas ' +
        canvas.width +
        'x' +
        canvas.height +
        ', sprites ' +
        sprites.length,
      'fps now ' +
        state.fpsNow +
        ', min ' +
        min +
        ', avg ' +
        (history.length ? Math.round(sum / history.length) : 0) +
        ' (last 60 s)',
      'video ' +
        state.videoStatus +
        ', t=' +
        currentTime.toFixed(1) +
        (videoMoving ? ' (moving)' : ''),
      'uptime ' +
        formatDuration(Date.now() - state.startedAt) +
        ', idle since last key ' +
        formatDuration(Date.now() - state.lastKeyAt) +
        ', last key ' +
        state.lastKey,
      memory ? 'JS heap ' + Math.round(memory.usedJSHeapSize / 1048576) + ' MB' : 'JS heap n/a',
      '',
    ];
    for (var t = 0; t < state.tests.length; t++) {
      lines.push(state.tests[t].name + ': ' + state.tests[t].result);
    }
    lines.push(
      '',
      'Left/Right sprites -/+5 | Up 1080p/720p | Red WebGL/2D | Green network | Yellow video | OK IndexedDB | Blue HUD | Back exit'
    );
    hud.textContent = lines.join('\n');
  }

  for (var hue = 0; hue < 360; hue += 45) textures.push(makeFishTexture(hue));
  watchVideo();
  switchRenderer('webgl');
  var staticInfo = capabilities();
  document.addEventListener('keydown', onKey);
  window.setInterval(function () {
    renderHud(staticInfo);
  }, 500);
  window.requestAnimationFrame(frame);
})();
