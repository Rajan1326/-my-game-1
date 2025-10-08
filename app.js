/* app.js — Infinite Craft (light demo)
   - deterministic tile generation by coordinates
   - simple gather + craft + inventory + save
*/

(() => {
  // CONFIG
  const TILE_SIZE = 40; // px
  const VIEW_TILES_X = 20;
  const VIEW_TILES_Y = 13;

  // tile types
  const TILES = {
    GRASS: { id: 'grass', color: '#74c267', g: 0.6 },
    TREE:  { id: 'tree',  color: '#2e7d34', g: 0.9, resource: 'wood' },
    STONE: { id: 'stone', color: '#8a8f94', g: 0.2, resource: 'stone' },
    WATER: { id: 'water', color: '#3aa0d8', g: 0.05 }
  };

  const RECIPES = {
    plank: { needs: { wood: 2 }, gives: { plank: 1 } },
    stick: { needs: { plank: 2 }, gives: { stick: 4 } },
    pickaxe: { needs: { stick: 2, stone: 3 }, gives: { pickaxe: 1 } }
  };

  // state
  const state = {
    offsetX: 0, // world coordinate top-left tile (integer)
    offsetY: 0,
    inventory: {},
    stats: { gathered: 0 },
  };

  // DOM
  const canvas = document.getElementById('world');
  const ctx = canvas.getContext('2d');
  const invEl = document.getElementById('inventory');
  const recipesEl = document.getElementById('recipes');
  const statsEl = document.getElementById('stats');
  const saveBtn = document.getElementById('saveBtn');
  const resetBtn = document.getElementById('resetBtn');

  // adjust canvas size to tile config
  function resizeCanvas(){
    canvas.width = VIEW_TILES_X * TILE_SIZE;
    canvas.height = VIEW_TILES_Y * TILE_SIZE;
  }
  resizeCanvas();

  // deterministic pseudo-random based on coordinates
  function hash2(x, y) {
    let s = (x * 374761393 + y * 668265263) ^ (x << 7) ^ (y << 13);
    s = (s ^ (s >> 13)) >>> 0;
    return s;
  }
  function tileForCoord(x, y) {
    const h = hash2(x, y) % 100;
    if (h < 6) return TILES.WATER;
    if (h < 20) return TILES.STONE;
    if (h < 40) return TILES.TREE;
    return TILES.GRASS;
  }

  // drawing
  function draw() {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    for (let ty = 0; ty < VIEW_TILES_Y; ty++) {
      for (let tx = 0; tx < VIEW_TILES_X; tx++) {
        const wx = state.offsetX + tx;
        const wy = state.offsetY + ty;
        const tile = tileForCoord(wx, wy);
        const x = tx * TILE_SIZE;
        const y = ty * TILE_SIZE;

        // base
        ctx.fillStyle = tile.color;
        ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);

        // subtle grid
        ctx.strokeStyle = 'rgba(0,0,0,0.06)';
        ctx.strokeRect(x+0.5, y+0.5, TILE_SIZE-1, TILE_SIZE-1);

        // icons for resources
        if (tile.resource === 'wood') {
          ctx.fillStyle = 'rgba(0,0,0,0.15)';
          ctx.fillRect(x + TILE_SIZE*0.18, y + TILE_SIZE*0.12, TILE_SIZE*0.64, TILE_SIZE*0.76);
          ctx.fillStyle = '#6c3e1b';
          ctx.fillRect(x + TILE_SIZE*0.3, y + TILE_SIZE*0.25, TILE_SIZE*0.4, TILE_SIZE*0.5);
        } else if (tile.resource === 'stone') {
          ctx.fillStyle = '#6d6f71';
          ctx.beginPath();
          ctx.moveTo(x + TILE_SIZE*0.2, y + TILE_SIZE*0.7);
          ctx.lineTo(x + TILE_SIZE*0.4, y + TILE_SIZE*0.3);
          ctx.lineTo(x + TILE_SIZE*0.7, y + TILE_SIZE*0.5);
          ctx.lineTo(x + TILE_SIZE*0.78, y + TILE_SIZE*0.75);
          ctx.closePath();
          ctx.fill();
        } else if (tile === TILES.WATER) {
          // small waves
          ctx.fillStyle = 'rgba(255,255,255,0.08)';
          ctx.fillRect(x + TILE_SIZE*0.15, y + TILE_SIZE*0.18, TILE_SIZE*0.55, TILE_SIZE*0.18);
        }
      }
    }

    // center cursor highlight
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 2;
    ctx.strokeRect((VIEW_TILES_X/2 - 0.5)*TILE_SIZE+1, (VIEW_TILES_Y/2 - 0.5)*TILE_SIZE+1, TILE_SIZE-2, TILE_SIZE-2);
    updateUI();
  }

  // inventory helpers
  function addToInventory(name, qty=1) {
    state.inventory[name] = (state.inventory[name]||0) + qty;
    state.stats.gathered += qty;
  }
  function removeFromInventory(name, qty=1) {
    if (!state.inventory[name] || state.inventory[name] < qty) return false;
    state.inventory[name] -= qty;
    if (state.inventory[name] === 0) delete state.inventory[name];
    return true;
  }

  // interaction: click to gather tile at cursor (centered)
  function gatherAtCenter() {
    const cx = Math.floor(VIEW_TILES_X/2);
    const cy = Math.floor(VIEW_TILES_Y/2);
    const wx = state.offsetX + cx;
    const wy = state.offsetY + cy;
    const tile = tileForCoord(wx, wy);
    // if tile has resource, gather and convert that tile to grass for a short time (we don't mutate infinite gen)
    if (tile.resource === 'wood') {
      addToInventory('wood', 1);
      flashText('+1 wood');
    } else if (tile.resource === 'stone') {
      addToInventory('stone', 1);
      flashText('+1 stone');
    } else {
      flashText('Nothing to gather');
    }
  }

  function flashText(msg) {
    const old = canvas.title;
    canvas.title = msg;
    setTimeout(() => canvas.title = old, 900);
  }

  // recipes UI
  function buildRecipes() {
    recipesEl.innerHTML = '';
    for (const [key, r] of Object.entries(RECIPES)) {
      const div = document.createElement('div');
      div.className = 'recipe';
      const left = document.createElement('div');
      left.innerHTML = `<strong>${key}</strong><div class="needs">${Object.entries(r.needs).map(([n,q])=>`${q}× ${n}`).join(', ')}</div>`;
      const btn = document.createElement('button');
      btn.textContent = 'Craft';
      btn.onclick = () => {
        if (canCraft(r.needs)) {
          for (const [n,q] of Object.entries(r.needs)) removeFromInventory(n,q);
          for (const [n,q] of Object.entries(r.gives)) addToInventory(n,q);
          flashText(`Crafted ${Object.keys(r.gives).join(', ')}`);
          draw();
        } else {
          flashText('Missing materials');
        }
      };
      div.appendChild(left);
      div.appendChild(btn);
      recipesEl.appendChild(div);
    }
  }

  function canCraft(needs){
    for (const [n,q] of Object.entries(needs)) {
      if ((state.inventory[n]||0) < q) return false;
    }
    return true;
  }

  // draw inventory list
  function updateUI(){
    invEl.innerHTML = '';
    const keys = Object.keys(state.inventory);
    if (keys.length === 0) {
      invEl.innerHTML = '<li style="grid-column:1/-1;color:var(--muted)">Empty</li>';
    } else {
      keys.forEach(k=>{
        const li = document.createElement('li');
        li.innerHTML = `<div>${k}</div><span class="item-count">${state.inventory[k]}</span>`;
        invEl.appendChild(li);
      });
    }
    // stats
    statsEl.innerHTML = `Tiles gathered: ${state.stats.gathered}<br>World offset: ${state.offsetX}, ${state.offsetY}`;
  }

  // keyboard pan
  const keys = {};
  window.addEventListener('keydown', (e) => {
    keys[e.key.toLowerCase()] = true;
    if (['w','a','s','d','arrowup','arrowleft','arrowdown','arrowright'].includes(e.key.toLowerCase())) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => keys[e.key.toLowerCase()] = false);

  function handleMove() {
    let moved = false;
    if (keys['w'] || keys['arrowup']) { state.offsetY -= 1; moved = true; }
    if (keys['s'] || keys['arrowdown']) { state.offsetY += 1; moved = true; }
    if (keys['a'] || keys['arrowleft']) { state.offsetX -= 1; moved = true; }
    if (keys['d'] || keys['arrowright']) { state.offsetX += 1; moved = true; }
    if (moved) draw();
  }

  // mouse click: gather at clicked tile relative to canvas center if clicked on center tile else recenters
  canvas.addEventListener('click', (ev) => {
    const rect = canvas.getBoundingClientRect();
    const cx = Math.floor(VIEW_TILES_X/2);
    const cy = Math.floor(VIEW_TILES_Y/2);
    const tx = Math.floor((ev.clientX - rect.left) / TILE_SIZE);
    const ty = Math.floor((ev.clientY - rect.top) / TILE_SIZE);

    // if click was centered tile => gather; otherwise pan so clicked tile becomes center
    if (tx === cx && ty === cy) {
      gatherAtCenter();
    } else {
      // shift offsets so clicked tile becomes center
      state.offsetX += (tx - cx);
      state.offsetY += (ty - cy);
    }
    draw();
  });

  // mouse drag pan
  let dragging = false;
  let dragStart = null;
  canvas.addEventListener('mousedown', (e) => {
    dragging = true;
    dragStart = {x: e.clientX, y: e.clientY};
    canvas.style.cursor = 'grabbing';
  });
  window.addEventListener('mouseup', () => {
    dragging = false;
    canvas.style.cursor = 'grab';
    dragStart = null;
  });
  window.addEventListener('mousemove', (e) => {
    if (!dragging || !dragStart) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    const tileDx = Math.round(dx / TILE_SIZE);
    const tileDy = Math.round(dy / TILE_SIZE);
    if (tileDx !== 0 || tileDy !== 0) {
      state.offsetX -= tileDx;
      state.offsetY -= tileDy;
      dragStart.x += tileDx * TILE_SIZE;
      dragStart.y += tileDy * TILE_SIZE;
      draw();
    }
  });

  // autosave, manual save, reset
  function saveState() {
    localStorage.setItem('infinite-craft-save', JSON.stringify(state));
    flashText('Saved');
  }
  function loadState() {
    const s = localStorage.getItem('infinite-craft-save');
    if (s) {
      try {
        const parsed = JSON.parse(s);
        state.offsetX = parsed.offsetX || 0;
        state.offsetY = parsed.offsetY || 0;
        state.inventory = parsed.inventory || {};
        state.stats = parsed.stats || { gathered: 0 };
      } catch(e) { console.warn('Failed to parse save', e); }
    }
  }
  function resetState() {
    if (confirm('Reset saved game?')) {
      localStorage.removeItem('infinite-craft-save');
      state.offsetX = 0; state.offsetY = 0; state.inventory = {}; state.stats = { gathered: 0 };
      draw();
    }
  }
  saveBtn.addEventListener('click', saveState);
  resetBtn.addEventListener('click', resetState);

  // loop
  buildRecipes();
  loadState();
  draw();
  setInterval(() => { handleMove(); saveState(); }, 2200); // periodic movement handling & periodic autosave

  // small help: center tile highlight already drawn
  // expose gather by pressing space
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') { e.preventDefault(); gatherAtCenter(); draw(); }
  });

  // initial UI state
  updateUI();

})();
