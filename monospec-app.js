const SAMPLE_DATA = {
  collections: [
    { id: 'handhelds', name: 'Handhelds', items: [] },
    {
      id: 'print-models',
      name: '3D Print Models',
      items: [
        {
          id: 'STL-SAMPLE-001',
          name: 'Calibration Cube - 20mm',
          thumb: '',
          tags: ['3d-print', 'stl', 'test-part'],
          asset: { type: 'stl', src: 'assets/models/calibration-cube.stl' },
          description: 'Sample STL profile for viewer validation.',
          details: { Category: '3D Print', Source: 'Local' },
          specs: { Material: 'PLA', LayerHeight: '0.2mm' }
        }
      ]
    }
  ]
};

const ui = {
  tabs: document.getElementById('tabs'),
  list: document.getElementById('list'),
  filter: document.getElementById('filterInput'),
  plane: document.getElementById('assetPlane'),
  details: document.getElementById('detailBody'),
  statusText: document.getElementById('statusText'),
  led: document.getElementById('led'),
  profileCount: document.getElementById('profileCount'),
  collectionCount: document.getElementById('collectionCount')
};

const state = {
  data: null,
  currentCol: null,
  filtered: [],
  index: 0,
  selectionToken: 0
};

const placeholderThumbSvg =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="96"><rect width="128" height="96" fill="#081009"/><rect x="3" y="3" width="122" height="90" fill="none" stroke="#1f6b43" stroke-width="2"/><text x="64" y="52" fill="#3bbf73" font-size="12" text-anchor="middle" font-family="monospace">NO THUMB</text></svg>'
  );

let currentPlayerCleanup = null;
let cachedThree = null;

function setStatus(text, good = false) {
  ui.statusText.textContent = text;
  ui.led.style.background = good ? 'var(--accent)' : 'var(--hud-dim)';
  ui.led.style.boxShadow = good ? '0 0 10px var(--accent)' : '0 0 6px var(--hud-dim)';
}

function sanitizeItem(item) {
  const safe = item || {};
  return {
    id: String(safe.id || 'UNSET-ID'),
    name: String(safe.name || 'Unnamed Item'),
    thumb: String(safe.thumb || ''),
    tags: Array.isArray(safe.tags) ? safe.tags.map(String) : [],
    asset: safe.asset && typeof safe.asset === 'object' ? safe.asset : { type: 'img', src: '' },
    description: String(safe.description || ''),
    details: safe.details && typeof safe.details === 'object' ? safe.details : {},
    specs: safe.specs && typeof safe.specs === 'object' ? safe.specs : {}
  };
}

function normalizeData(data) {
  const inCols = Array.isArray(data && data.collections) ? data.collections : [];
  return {
    collections: inCols.map((col, idx) => ({
      id: String((col && col.id) || `collection-${idx + 1}`),
      name: String((col && col.name) || (col && col.id) || `Collection ${idx + 1}`),
      items: Array.isArray(col && col.items) ? col.items.map(sanitizeItem) : []
    }))
  };
}

function validateData(data) {
  if (!data || !Array.isArray(data.collections)) throw new Error('Invalid data: missing collections');
  const ids = new Set();
  for (const col of data.collections) {
    for (const it of col.items || []) {
      if (!it.id) throw new Error('Item missing id');
      if (ids.has(it.id)) console.warn('[MonoSpec] Duplicate item id:', it.id);
      ids.add(it.id);
    }
  }
}

async function loadData() {
  for (const source of ['monospec-data.generated.json', 'monospec-data.json']) {
    try {
      const res = await fetch(source, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = normalizeData(await res.json());
      validateData(json);
      setStatus(`DATA: ${source.toUpperCase()}`, true);
      return json;
    } catch (e) {
      console.warn('[MonoSpec] Data source failed:', source, e.message);
    }
  }

  const fallback = normalizeData(SAMPLE_DATA);
  validateData(fallback);
  setStatus('DATA: SAMPLE');
  return fallback;
}

function showDetailsPlaceholder(title, subtitle) {
  ui.details.innerHTML = `<div class="kv"><div class="k">Status</div><div class="v"><strong>${title}</strong></div><div class="k">Hint</div><div class="v">${subtitle}</div></div>`;
}

function showViewerPlaceholder(title, subtitle) {
  ui.plane.innerHTML = `<div style="display:grid;place-items:center;height:100%;text-align:center;color:var(--hud-dim);text-transform:uppercase;letter-spacing:.07em;"><div><div style="color:var(--accent);margin-bottom:8px;font-weight:700">${title}</div><div>${subtitle}</div></div></div>`;
}

function getCurrentCollection() {
  return state.data.collections.find(c => c.id === state.currentCol) || state.data.collections[0] || null;
}

function renderTabs() {
  ui.tabs.innerHTML = '';
  const cols = state.data.collections;
  ui.collectionCount.textContent = cols.length;

  if (cols.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'tab';
    empty.textContent = 'No Collections';
    empty.style.opacity = '0.7';
    ui.tabs.appendChild(empty);
    return;
  }

  cols.forEach(col => {
    const b = document.createElement('button');
    b.className = 'tab';
    b.setAttribute('role', 'tab');
    b.dataset.id = col.id;
    b.textContent = col.name;
    b.addEventListener('click', () => selectCollection(col.id));
    if (col.id === state.currentCol) b.classList.add('active');
    ui.tabs.appendChild(b);
  });
}
function renderList() {
  ui.list.innerHTML = '';

  if (state.filtered.length === 0) {
    const row = document.createElement('div');
    row.className = 'list-item';
    row.style.gridTemplateColumns = '1fr';
    row.style.cursor = 'default';
    row.style.textTransform = 'uppercase';
    row.style.color = 'var(--hud-dim)';
    row.textContent = 'No items for this filter or collection.';
    ui.list.appendChild(row);
    ui.profileCount.textContent = 0;
    return;
  }

  for (let i = 0; i < state.filtered.length; i++) {
    const item = state.filtered[i];
    const row = document.createElement('div');
    row.className = 'list-item';
    row.setAttribute('role', 'option');
    row.dataset.index = i;
    row.innerHTML = `
      <img class="thumb" alt="${item.name} thumbnail" src="${item.thumb || placeholderThumbSvg}" />
      <div class="meta">
        <div class="name">${item.name}</div>
        <div class="id">${item.id}</div>
        <div class="tags">${(item.tags || []).join(' * ')}</div>
      </div>
      <div class="muted">PLAY</div>`;
    const img = row.querySelector('img');
    img.addEventListener('error', () => {
      img.src = placeholderThumbSvg;
    });
    row.addEventListener('click', () => selectIndex(i));
    ui.list.appendChild(row);
  }

  ui.profileCount.textContent = state.filtered.length;
  applyActiveRow();
}

function applyActiveRow() {
  document.querySelectorAll('.list-item').forEach((el, idx) => {
    el.classList.toggle('active', idx === state.index && state.filtered.length > 0);
    if (idx === state.index) el.scrollIntoView({ block: 'nearest' });
  });
}

function renderDetails(item) {
  const chips = (item.tags || []).map(t => `<span class="chip">${t}</span>`).join('');
  const detailKV = Object.entries(item.details || {})
    .map(([k, v]) => `<div class="k">${k}</div><div class="v">${v}</div>`)
    .join('');
  const specsKV = Object.entries(item.specs || {})
    .map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`)
    .join('');

  ui.details.innerHTML = `
    <div class="kv"><div class="k">Object</div><div class="v"><strong>${item.name}</strong></div><div class="k">ID</div><div class="v">${item.id}</div></div>
    <div class="chips">${chips || '<span class="chip">untagged</span>'}</div>
    <p class="mono">${item.description || 'No description provided.'}</p>
    <div class="kv">${detailKV || '<div class="k">Details</div><div class="v">No details provided.</div>'}</div>
    <div class="specs"><h4 class="muted" style="margin:0 0 6px 0;text-transform:uppercase;">Specs</h4><dl>${specsKV || '<dt>Status</dt><dd>No specs provided.</dd>'}</dl></div>`;
}

async function ensureThree() {
  if (cachedThree) return cachedThree;
  const [THREE, controlsMod, loaderMod] = await Promise.all([
    import('https://esm.sh/three@0.160.0'),
    import('https://esm.sh/three@0.160.0/examples/jsm/controls/TrackballControls'),
    import('https://esm.sh/three@0.160.0/examples/jsm/loaders/STLLoader')
  ]);
  cachedThree = { THREE, TrackballControls: controlsMod.TrackballControls, STLLoader: loaderMod.STLLoader };
  return cachedThree;
}

async function renderStlAsset(item, wrap, token) {
  const mount = document.createElement('div');
  Object.assign(mount.style, { position: 'absolute', inset: '0', zIndex: '1' });
  wrap.appendChild(mount);

  try {
    const { THREE, TrackballControls, STLLoader } = await ensureThree();
    if (token !== state.selectionToken) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      45,
      Math.max(1, mount.clientWidth) / Math.max(1, mount.clientHeight),
      0.1,
      2000
    );
    const renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(Math.max(1, mount.clientWidth), Math.max(1, mount.clientHeight));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.className = 'stl-canvas';
    mount.appendChild(renderer.domElement);

    const controls = new TrackballControls(camera, renderer.domElement);
    controls.noPan = false;
    controls.noZoom = false;
    controls.noRotate = false;
    controls.staticMoving = true;
    controls.rotateSpeed = 4.2;
    controls.panSpeed = 0.9;
    controls.zoomSpeed = 1.15;

    scene.add(new THREE.AmbientLight(0x8fd8aa, 0.85));
    const key = new THREE.DirectionalLight(0xffffff, 0.8);
    key.position.set(80, 100, 60);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x82ffb1, 0.55);
    fill.position.set(-70, -40, -50);
    scene.add(fill);

    const geometry = await new Promise((resolve, reject) => new STLLoader().load(item.asset.src, resolve, undefined, reject));
    geometry.computeBoundingBox();
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({ color: 0x7cefa1, metalness: 0.08, roughness: 0.65 });
    const mesh = new THREE.Mesh(geometry, material);
    const center = new THREE.Vector3();
    geometry.boundingBox.getCenter(center);
    mesh.position.sub(center);
    scene.add(mesh);

    const size = new THREE.Vector3();
    geometry.boundingBox.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const distance = maxDim * 1.8;
    const renderNow = () => renderer.render(scene, camera);
    const setCameraView = (x, y, z) => {
      camera.position.set(x * distance, y * distance, z * distance);
      controls.target.set(0, 0, 0);
      controls.update();
      renderNow();
    };
    setCameraView(0.4, 0.55, 1.0);

    const wireBtnStyle = {
      borderColor: 'var(--accent)',
      color: 'var(--accent)',
      background: 'rgba(134, 247, 162, 0.14)'
    };

    const gizmo = document.createElement('div');
    Object.assign(gizmo.style, {
      position: 'absolute',
      right: '8px',
      top: '30px',
      zIndex: '4',
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
      alignItems: 'flex-end'
    });
    const mkBtn = (label, onClick) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      Object.assign(b.style, {
        font: '11px var(--font-ui)',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        border: '1px solid var(--hud-faint)',
        color: 'var(--hud)',
        background: 'rgba(10, 19, 13, 0.8)',
        padding: '4px 6px',
        cursor: 'pointer'
      });
      b.onclick = onClick;
      return b;
    };

    const dpad = document.createElement('div');
    Object.assign(dpad.style, {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, auto)',
      gap: '6px',
      alignItems: 'center',
      justifyItems: 'center'
    });
    const spacer = () => {
      const s = document.createElement('div');
      s.style.width = '58px';
      s.style.height = '1px';
      return s;
    };
    dpad.appendChild(spacer());
    dpad.appendChild(mkBtn('TOP', () => setCameraView(0, 1, 0)));
    dpad.appendChild(spacer());
    dpad.appendChild(mkBtn('LEFT', () => setCameraView(-1, 0, 0)));
    dpad.appendChild(mkBtn('FRONT', () => setCameraView(0, 0, 1)));
    dpad.appendChild(mkBtn('RIGHT', () => setCameraView(1, 0, 0)));
    dpad.appendChild(spacer());
    dpad.appendChild(mkBtn('BOTTOM', () => setCameraView(0, -1, 0)));
    dpad.appendChild(spacer());
    gizmo.appendChild(dpad);

    const aux = document.createElement('div');
    Object.assign(aux.style, { display: 'flex', gap: '6px' });
    aux.appendChild(mkBtn('BACK', () => setCameraView(0, 0, -1)));
    aux.appendChild(mkBtn('ISO', () => setCameraView(0.4, 0.55, 1.0)));
    gizmo.appendChild(aux);

    const row3 = document.createElement('div');
    Object.assign(row3.style, { display: 'flex', gap: '6px' });
    const wireframeBtn = mkBtn('Wireframe', () => {
      material.wireframe = !material.wireframe;
      if (material.wireframe) Object.assign(wireframeBtn.style, wireBtnStyle);
      else {
        wireframeBtn.style.borderColor = 'var(--hud-faint)';
        wireframeBtn.style.color = 'var(--hud)';
        wireframeBtn.style.background = 'rgba(10, 19, 13, 0.8)';
      }
      renderNow();
    });
    row3.appendChild(wireframeBtn);
    gizmo.appendChild(row3);
    wrap.appendChild(gizmo);

    const onResize = () => {
      const w = Math.max(1, mount.clientWidth);
      const h = Math.max(1, mount.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      controls.handleResize();
      renderNow();
    };
    window.addEventListener('resize', onResize);

    let rafId = null;
    let isInteracting = false;
    const loop = () => {
      controls.update();
      renderNow();
      if (isInteracting) rafId = requestAnimationFrame(loop);
      else rafId = null;
    };
    const onStart = () => {
      isInteracting = true;
      if (!rafId) rafId = requestAnimationFrame(loop);
    };
    const onEnd = () => {
      isInteracting = false;
      controls.update();
      renderNow();
    };
    const onChange = () => {
      if (!isInteracting) renderNow();
    };

    controls.addEventListener('start', onStart);
    controls.addEventListener('end', onEnd);
    controls.addEventListener('change', onChange);
    renderNow();

    currentPlayerCleanup = () => {
      if (rafId) cancelAnimationFrame(rafId);
      controls.removeEventListener('start', onStart);
      controls.removeEventListener('end', onEnd);
      controls.removeEventListener('change', onChange);
      window.removeEventListener('resize', onResize);
      controls.dispose();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      mount.innerHTML = '';
    };
  } catch (err) {
    console.warn('[MonoSpec] STL load failed:', err);
    showViewerPlaceholder('STL VIEWER UNAVAILABLE', 'Check STL path and internet access for Three.js CDN.');
  }
}

async function renderAsset(item) {
  if (typeof currentPlayerCleanup === 'function') {
    currentPlayerCleanup();
    currentPlayerCleanup = null;
  }
  ui.plane.innerHTML = '';

  const token = ++state.selectionToken;
  const wrap = document.createElement('div');
  Object.assign(wrap.style, { position: 'relative', display: 'grid', placeItems: 'center', width: '100%', height: '100%' });

  const grid = document.createElement('div');
  Object.assign(grid.style, {
    position: 'absolute',
    inset: '0',
    background: 'linear-gradient(transparent 95%, var(--grid) 95%), linear-gradient(90deg, transparent 95%, var(--grid) 95%)',
    backgroundSize: '100% 20px, 20px 100%',
    zIndex: '0'
  });
  wrap.appendChild(grid);

  const hudTL = document.createElement('div');
  hudTL.textContent = 'CAM: ROTOR FEED 01';
  Object.assign(hudTL.style, { position: 'absolute', left: '8px', top: '8px', fontSize: '11px', color: 'var(--hud-dim)', zIndex: '3' });
  const hudBR = document.createElement('div');
  hudBR.textContent = 'VIS CLR: ALPHA';
  Object.assign(hudBR.style, { position: 'absolute', right: '8px', bottom: '8px', fontSize: '11px', color: 'var(--hud-dim)', zIndex: '3' });
  wrap.appendChild(hudTL);
  wrap.appendChild(hudBR);
  ui.plane.appendChild(wrap);

  let playerEl = null;
  const t = (item.asset || {}).type;

  if (t === 'webm') {
    const v = document.createElement('video');
    v.src = item.asset.src;
    v.autoplay = true;
    v.loop = true;
    v.muted = true;
    v.playsInline = true;
    v.style.filter = 'drop-shadow(0 12px 24px var(--shadow))';
    v.style.zIndex = '1';
    v.onerror = () => showViewerPlaceholder('MEDIA ERROR', 'Video file missing or unsupported.');
    playerEl = v;
    wrap.appendChild(v);
    currentPlayerCleanup = () => {
      v.pause();
      v.src = '';
      v.load();
    };
  } else if (t === 'gif' || t === 'img') {
    const img = document.createElement('img');
    img.src = item.asset.src;
    img.alt = item.name;
    img.style.filter = 'drop-shadow(0 12px 24px var(--shadow))';
    img.style.zIndex = '1';
    img.onerror = () => showViewerPlaceholder('MEDIA ERROR', 'Image file missing or unsupported.');
    playerEl = img;
    wrap.appendChild(img);
  } else if (t === 'pngseq') {
    const { base, count, fps = 12 } = item.asset || {};
    if (!base || !count) {
      showViewerPlaceholder('PNG SEQ MISCONFIGURED', 'Asset needs base and count fields.');
      return;
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    let frame = 0;
    let rafId = null;
    let last = performance.now();

    const images = Array.from({ length: count }, (_, i) => {
      const im = new Image();
      im.src = `${base}${String(i + 1).padStart(4, '0')}.png`;
      im.onload = () => {
        if (!canvas.width && im.width) {
          canvas.width = im.width;
          canvas.height = im.height;
        }
      };
      return im;
    });

    const loop = (ts) => {
      const dt = ts - last;
      if (dt >= 1000 / fps) {
        frame = (frame + 1) % count;
        last = ts;
      }
      if (canvas.width) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const im = images[frame];
        if (im && im.complete) ctx.drawImage(im, 0, 0);
      }
      rafId = requestAnimationFrame(loop);
    };

    currentPlayerCleanup = () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
    playerEl = canvas;
    wrap.appendChild(canvas);
    rafId = requestAnimationFrame(loop);
  } else if (t === 'stl') {
    await renderStlAsset(item, wrap, token);
  } else {
    showViewerPlaceholder('NO ASSET CONFIGURED', 'Set asset.type and asset source fields.');
  }

  ui.plane.onclick = () => {
    if (!playerEl || playerEl.tagName !== 'VIDEO') return;
    if (playerEl.paused) {
      playerEl.play();
      setStatus('PLAY', true);
    } else {
      playerEl.pause();
      setStatus('PAUSE');
    }
  };
}
function selectIndex(idx) {
  if (state.filtered.length === 0) {
    showViewerPlaceholder('NO RESULTS', 'Adjust filter or add content.');
    showDetailsPlaceholder('No Items Found', 'Clear filter or import Obsidian markdown entries.');
    setStatus('EMPTY');
    return;
  }

  state.index = (idx + state.filtered.length) % state.filtered.length;
  const item = state.filtered[state.index];
  applyActiveRow();
  renderAsset(item);
  renderDetails(item);
  setStatus(`SELECT ${item.id}`);
}

function applyFilter(q) {
  const s = (q || '').trim().toLowerCase();
  const col = getCurrentCollection();
  const arr = col ? col.items || [] : [];
  state.filtered = !s
    ? [...arr]
    : arr.filter(it =>
        (it.name || '').toLowerCase().includes(s) ||
        (it.id || '').toLowerCase().includes(s) ||
        (it.tags || []).some(t => (t || '').toLowerCase().includes(s))
      );
  state.index = 0;
  renderList();
  selectIndex(0);
}

function selectCollection(id) {
  state.currentCol = id;
  renderTabs();
  applyFilter(ui.filter.value || '');
  setStatus('COLLECTION: ' + id, true);
}

function toggleFullscreen() {
  const el = document.documentElement;
  if (!document.fullscreenElement) el.requestFullscreen().catch(() => {});
  else document.exitFullscreen().catch(() => {});
}

window.addEventListener('keydown', (e) => {
  const tag = (e.target && e.target.tagName) || '';
  const inInput = tag === 'INPUT' || tag === 'TEXTAREA';
  if (inInput) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    selectIndex(state.index + 1);
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    selectIndex(state.index - 1);
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    document.getElementById('assetPlane').click();
  }
  if (e.key.toLowerCase() === 'f') {
    toggleFullscreen();
  }
});

(async function init() {
  if (window.location.protocol === 'file:') {
    showViewerPlaceholder('LOCAL FILE MODE DETECTED', 'Run via local server or GitHub Pages. file:// blocks JSON fetch.');
    showDetailsPlaceholder('Serve Over HTTP', 'Use Live Server or python -m http.server in _MONOSPEC.');
    setStatus('FILE MODE');
  }

  state.data = await loadData();
  state.currentCol = state.data.collections[0] ? state.data.collections[0].id : null;
  renderTabs();
  ui.filter.addEventListener('input', e => applyFilter(e.target.value));

  if (!state.currentCol) {
    showViewerPlaceholder('NO COLLECTIONS', 'Import markdown entries or define collections in data file.');
    showDetailsPlaceholder('No Data Loaded', 'Generate monospec-data.generated.json from Obsidian notes.');
    return;
  }

  applyFilter('');

  const io = new IntersectionObserver(
    entries => {
      entries.forEach(en => {
        if (en.target.id !== 'assetCard') return;
        const videos = en.target.querySelectorAll('video');
        videos.forEach(v => (en.isIntersecting ? v.play().catch(() => {}) : v.pause()));
      });
    },
    { threshold: 0.1 }
  );
  io.observe(document.getElementById('assetCard'));
})();
