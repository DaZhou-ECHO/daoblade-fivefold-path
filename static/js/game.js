"use strict";

const RULES = globalThis.DaoBladeRules.createRuntime(globalThis.DaoBladeRuleset);
const { elements: ELEMENTS, trigrams: TRIGRAMS, affixes: AFFIXES, qualities: QUALITY } = RULES.config;

const LEVELS = globalThis.DaoBladeLevels;
const REALMS = LEVELS.realms;
const TRIALS = globalThis.DaoBladeTrialState;

const DEFAULT_STATE = () => RULES.defaultState();

let saveData = DEFAULT_STATE();
let currentUser = null;
let csrfToken = "";
let saveRevision = 0;
let saveBlocked = false;
let saveQueue = Promise.resolve();
let selectedBeadId = null;
let pendingSocket = null;
let keepSocketPreview = false;
let activeGame = null;
let toastTimer = 0;
let pendingRebindListener = null;
const DEFAULT_CONTROLS = Object.freeze({ left: "KeyA", right: "KeyD", jump: "Space", slash: "KeyJ", block: "KeyK", qi: "KeyL", dao: "KeyQ", dao2: "KeyE", dash: "ShiftLeft", pause: "Escape" });
let controls = loadControls();
let feedback = loadFeedback();
let battleAudio = null;
const ACTION_LABELS = { left: "左移", right: "右移", jump: "跳跃", slash: "劈砍", block: "格挡", qi: "剑气", dao: "技能一", dao2: "技能二", dash: "闪避", pause: "暂停" };

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const esc = value => String(value).replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const randomItem = items => items[Math.floor(Math.random() * items.length)];
const elementColor = key => key ? ELEMENTS[key].color : "#dce8ee";

function loadControls() {
  try {
    const saved = JSON.parse(localStorage.getItem("daoblade-controls") || "null");
    if (saved && Object.keys(DEFAULT_CONTROLS).filter(key => key !== "dao2").every(key => typeof saved[key] === "string" && saved[key])) return { ...DEFAULT_CONTROLS, ...saved };
  } catch (_) { /* 损坏的本地设置使用默认按键。 */ }
  return { ...DEFAULT_CONTROLS };
}

function loadFeedback() {
  try {
    const saved = JSON.parse(localStorage.getItem("daoblade-feedback") || "null");
    if (saved && typeof saved.shake === "boolean" && typeof saved.sound === "boolean") return { ...saved, combatText: saved.combatText !== false };
  } catch (_) { /* 损坏的本地设置使用默认效果。 */ }
  return { shake: true, sound: false, combatText: true };
}

function playBattleSound(event) {
  if (!globalThis.DaoBladeBattleAudio) return;
  battleAudio ||= globalThis.DaoBladeBattleAudio.createPlayer({
    createContext: () => window.AudioContext ? new window.AudioContext() : null,
    enabled: () => feedback.sound,
  });
  battleAudio.play(event);
}

function actionForCode(code) {
  if (code === "KeyW" && controls.jump === "Space") return "jump";
  if (code === "ShiftRight" && controls.dash === "ShiftLeft") return "dash";
  return Object.keys(controls).find(action => controls[action] === code) || null;
}

function keyLabel(code) {
  return code.replace(/^Key|^Digit/, "").replace("ShiftLeft", "Shift").replace("Escape", "Esc").replace("Space", "空格").replace("Arrow", "方向");
}

function renderControls() {
  $$('[data-control]').forEach(node => { node.textContent = keyLabel(controls[node.dataset.control]); });
  $("#control-settings").innerHTML = Object.entries(ACTION_LABELS).map(([action, label]) => `<button type="button" class="pixel-button" data-rebind="${action}"><span>${label}</span><kbd>${keyLabel(controls[action])}</kbd></button>`).join("");
  $$('[data-rebind]').forEach(button => button.addEventListener("click", () => {
    if (pendingRebindListener) window.removeEventListener("keydown", pendingRebindListener, true);
    $$('[data-rebind]').forEach(other => other.classList.remove("listening"));
    button.classList.add("listening"); button.querySelector("kbd").textContent = "请按键";
    const listener = event => {
      event.preventDefault(); event.stopPropagation();
      window.removeEventListener("keydown", listener, true);
      pendingRebindListener = null;
      const action = button.dataset.rebind;
      if (event.code !== "Escape" || action === "pause") {
        if (Object.entries(controls).some(([key, value]) => key !== action && value === event.code)) showToast("该按键已被其他动作使用", true);
        else { controls[action] = event.code; localStorage.setItem("daoblade-controls", JSON.stringify(controls)); }
      }
      renderControls();
    };
    pendingRebindListener = listener;
    window.addEventListener("keydown", listener, true);
  }));
}

function showToast(message, danger = false) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.style.borderColor = danger ? "#ef5c45" : "#dfad4c";
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
}

async function loadState() {
  try {
    const response = await fetch("/api/state");
    if (!response.ok) throw new Error("无法读取服务器存档");
    const payload = await response.json();
    saveData = payload.state;
    saveRevision = payload.revision;
    saveBlocked = false;
    writeBackup();
    $("#save-status").textContent = "SQLite 已连接";
  } catch (error) {
    const backup = readBackup();
    try { saveData = backup ? JSON.parse(backup) : DEFAULT_STATE(); }
    catch (_) { saveData = DEFAULT_STATE(); }
    saveBlocked = true;
    $("#save-status").textContent = "本地备用存档";
    showToast("服务器存档不可用，已切换到浏览器备用存档", true);
  }
  normalizeState();
  renderAll();
  renderCheckpointRecovery();
}

function normalizeState() {
  const fresh = DEFAULT_STATE();
  saveData.player = { ...fresh.player, ...(saveData.player || {}) };
  saveData.inventory = Array.isArray(saveData.inventory) ? saveData.inventory : [];
  saveData.cultivation = { ...fresh.cultivation, ...(saveData.cultivation || {}) };
  saveData.loadout = { ...fresh.loadout, ...(saveData.loadout || {}) };
  saveData.progress = { ...fresh.progress, ...(saveData.progress || {}) };
  saveData.progress.clears = { ...fresh.progress.clears, ...(saveData.progress.clears || {}) };
}

async function saveState(message = "进度已保存") {
  writeBackup();
  if (saveBlocked) { showToast("存档尚未同步，请重新登录或刷新后检查", true); return false; }
  const accountId = currentUser?.id || null;
  saveQueue = saveQueue.then(async () => {
    if (saveBlocked || accountId !== (currentUser?.id || null)) return false;
    try {
      const requestBody = currentUser ? { state: saveData, revision: saveRevision } : saveData;
      const response = await fetch("/api/state", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken }, body: JSON.stringify(requestBody) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "保存失败");
      saveRevision = payload.revision;
      $("#save-status").textContent = "进度已保存";
      if (message) showToast(message);
      return true;
    } catch (error) {
      saveBlocked = true;
      $("#save-status").textContent = "存档未同步";
      showToast(`存档未同步：${error.message}。请检查后刷新。`, true);
      return false;
    }
  });
  return saveQueue;
}

function readBackup() {
  try { return localStorage.getItem(backupKey()); } catch (_) { return null; }
}

function writeBackup() {
  // 浏览器空间不足或禁用存储不能阻止SQLite主存档保存。
  try { localStorage.setItem(backupKey(), JSON.stringify(saveData)); } catch (_) { /* 主存档状态仍由服务器响应决定。 */ }
}

function backupKey() { return currentUser ? `daoblade-backup-user-${currentUser.id}` : "daoblade-backup"; }

async function initializeSession() {
  try {
    const response = await fetch("/api/auth/me");
    if (!response.ok) throw new Error("无法检查登录状态");
    const payload = await response.json();
    currentUser = payload.user;
    csrfToken = payload.csrf_token;
  } catch (_) { currentUser = null; }
  renderAccount();
  await loadState();
}

function renderAccount() {
  globalThis.DaoBladeArrayLabUI?.reset();
  $("#account-label").textContent = currentUser ? `剑客 ${currentUser.username}` : "游客试玩";
  $("#account-login").hidden = Boolean(currentUser);
  $("#account-logout").hidden = !currentUser;
  $("#account-import").hidden = !currentUser;
}

async function submitAccount(action) {
  if (activeGame && !activeGame.finished) return showToast("请先退出当前闯关再切换账号", true);
  await saveQueue;
  const username = $("#account-username").value.trim();
  const password = $("#account-password").value;
  try {
    const response = await fetch(`/api/auth/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "账号操作失败");
    if (activeGame) { activeGame.destroy(); activeGame = null; }
    currentUser = payload.user;
    csrfToken = payload.csrf_token;
    selectedBeadId = null;
    pendingSocket = null;
    $("#account-password").value = "";
    $("#account-dialog").close();
    renderAccount();
    await loadState();
    showPanel("sanctuary");
    showToast(`欢迎，${currentUser.username}`);
  } catch (error) { showToast(error.message, true); }
}

function showPanel(name) {
  if (name !== "game" && activeGame?.defeat) {
    activeGame.destroy(); activeGame = null;
  }
  if (activeGame && name !== "game" && !activeGame.finished) activeGame.setPause(true);
  $$(".panel").forEach(panel => panel.classList.toggle("active", panel.id === `panel-${name}`));
  $$(".nav-button").forEach(button => button.classList.toggle("active", button.dataset.panel === name));
  if (name === "inventory") renderInventory();
  if (name === "cultivation") renderCultivation();
  if (name === "realms") renderRealms();
  if (name === "arraylab") void globalThis.DaoBladeArrayLabUI?.load();
  renderCheckpointRecovery();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// 为现有界面保留调用名；计算只有独立规则适配器一份实现。
function elementTotals(state = saveData) { return RULES.elementTotals(state); }
function primarySecondary(state = saveData) { return RULES.primarySecondary(state); }
function socketedBeads(state = saveData) { return RULES.socketedBeads(state); }
function getAffixTotals(state = saveData) { return RULES.getAffixTotals(state); }
function calculateStats(state = saveData) { return RULES.calculateStats(state); }

function renderHeader() {
  const stats = calculateStats();
  $("#spirit-value").textContent = saveData.player.spirit;
  $("#primary-label").textContent = stats.primary ? ELEMENTS[stats.primary].zh : "未定";
  $("#primary-label").style.color = stats.primary ? elementColor(stats.primary) : "#9aabbd";
  $("#secondary-label").textContent = stats.secondary ? ELEMENTS[stats.secondary].zh : "未定";
  $("#secondary-label").style.color = stats.secondary ? elementColor(stats.secondary) : "#9aabbd";
  $("#inventory-count").textContent = saveData.inventory.length;
  $("#runs-value").textContent = saveData.progress.runs;
  $("#victories-value").textContent = saveData.progress.victories;
  $("#socketed-value").textContent = `${socketedBeads().length} / 24`;
  const cleared = Object.values(saveData.progress.clears).filter(value => value > 0).length;
  $("#realm-clear-value").textContent = `${cleared} / 5`;
}

function renderRealms() {
  $("#realm-grid").innerHTML = Object.entries(ELEMENTS).map(([key, element]) => {
    const realm = REALMS[key];
    const clears = saveData.progress.clears[key];
    return `<article class="realm-card" style="--realm-color:${element.color}">
      <span class="realm-symbol">${element.symbol}</span><h3>${element.realm}</h3><small>通关 ${clears} 次</small>
      <p>${element.desc}</p><ul>${realm.enemies.map(name => `<li>${name}</li>`).join("")}<li>首领：${realm.boss}</li></ul>
      <p>主要掉落：${element.drops}</p><button class="pixel-button" data-start-realm="${key}">进入试炼</button>
    </article>`;
  }).join("");
  $$('[data-start-realm]').forEach(button => button.addEventListener("click", () => startRealm(button.dataset.startRealm)));
}

function qualityForDrop() {
  const roll = Math.random();
  return roll < .65 ? 1 : roll < .9 ? 2 : 3;
}

function nextId() { return `bead-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`; }

function makeBead(elementKey, forcedQuality = null) {
  const quality = forcedQuality || qualityForDrop();
  const shuffled = [...AFFIXES[elementKey]].sort(() => Math.random() - .5).slice(0, quality);
  const nouns = { metal: ["断锋", "鸣铁", "白藏"], wood: ["青芽", "长生", "灵藤"], water: ["玄潮", "寒渊", "流光"], fire: ["赤心", "焚羽", "离焰"], earth: ["镇岳", "厚土", "岩魂"] };
  return {
    id: nextId(), element: elementKey, quality, level: quality, xp: 0,
    name: `${randomItem(nouns[elementKey])}·${QUALITY[quality].zh}珠`,
    affixes: shuffled.map(([key, label, base]) => ({ key, label, value: base + Math.floor(Math.random() * 4) })),
  };
}

function beadStyle(bead) { return `--element-color:${ELEMENTS[bead.element].color};--quality-color:${QUALITY[bead.quality].color}`; }

function renderInventory() {
  const list = $("#bead-list");
  if (!saveData.inventory.length) {
    list.innerHTML = '<div class="empty-message">珠匣尚空。前往五行秘境击败首领，即可获得第一批灵珠。</div>';
    $("#bead-detail").className = "bead-detail empty";
    $("#bead-detail").textContent = "选择一颗灵珠查看词条";
    return;
  }
  list.innerHTML = saveData.inventory.map(bead => `<button class="bead-card ${bead.id === selectedBeadId ? "selected" : ""}" data-bead-id="${esc(bead.id)}" style="${beadStyle(bead)}">
    <span class="bead-icon">${ELEMENTS[bead.element].zh}</span><h3>${esc(bead.name)}</h3><small>${QUALITY[bead.quality].zh} · 等级 ${bead.level} · ${bead.affixes.length} 词条</small>
  </button>`).join("");
  $$('[data-bead-id]').forEach(button => button.addEventListener("click", () => selectBead(button.dataset.beadId)));
  if (selectedBeadId) {
    const bead = saveData.inventory.find(item => item.id === selectedBeadId);
    if (bead) renderBeadDetail(bead); else selectedBeadId = null;
  }
}

function selectBead(id) {
  selectedBeadId = id;
  renderInventory();
  const bead = saveData.inventory.find(item => item.id === id);
  if (bead) renderBeadDetail(bead);
}

function renderBeadDetail(bead) {
  const detail = $("#bead-detail");
  detail.className = "bead-detail";
  detail.style.cssText = beadStyle(bead);
  const nextXp = bead.level * 30;
  detail.innerHTML = `<span class="bead-icon">${ELEMENTS[bead.element].zh}</span><h3>${esc(bead.name)}</h3>
    <p>${QUALITY[bead.quality].zh}灵珠 · 初始等级 ${bead.quality}</p><p>当前修为：${bead.xp} / ${nextXp}</p>
    <ul class="affix-list">${bead.affixes.map(a => `<li>${esc(a.label)} +${a.value}%</li>`).join("")}</ul>
    <p class="warning">镶嵌后无法取下。低阶灵珠可通过闯关升级并补充词条。</p>
    <button class="pixel-button primary wide" id="go-socket">前往八卦图选择道路</button>`;
  $("#go-socket").addEventListener("click", () => showPanel("cultivation"));
}

function renderCultivation() {
  const board = $("#bagua-board");
  board.querySelectorAll(".path-line,.path-label,.cultivation-node").forEach(node => node.remove());
  const selected = saveData.inventory.find(item => item.id === selectedBeadId) || null;
  const boardSize = Math.min(board.clientWidth || 700, 700);
  const radiusSteps = [105, 178, 250];
  Object.entries(TRIGRAMS).forEach(([key, trigram]) => {
    const line = document.createElement("div");
    line.className = "path-line";
    line.style.transform = `rotate(${trigram.angle}deg)`;
    board.appendChild(line);
    const radians = trigram.angle * Math.PI / 180;
    const label = document.createElement("div");
    label.className = "path-label";
    label.style.left = `calc(50% + ${Math.cos(radians) * 285}px)`;
    label.style.top = `calc(50% + ${Math.sin(radians) * 285}px)`;
    label.textContent = `${trigram.zh} · ${trigram.use}`;
    board.appendChild(label);
    const slots = saveData.cultivation[key];
    const nextIndex = slots.findIndex(bead => bead === null);
    radiusSteps.forEach((radius, index) => {
      const bead = slots[index];
      const node = document.createElement("button");
      const ready = selected && index === nextIndex && canSocket(key, index);
      node.className = `cultivation-node ${bead ? "filled" : ""} ${ready ? "available" : ""}`;
      node.style.left = `calc(50% + ${Math.cos(radians) * radius}px)`;
      node.style.top = `calc(50% + ${Math.sin(radians) * radius}px)`;
      node.title = bead ? `${bead.name}：${trigram.effects[index]}` : `${trigram.zh}卦${index + 1}层：${trigram.effects[index]}`;
      node.textContent = bead ? ELEMENTS[bead.element].zh : String(index + 1);
      if (bead) node.style.setProperty("--element-color", ELEMENTS[bead.element].color);
      node.disabled = !bead && !ready;
      node.addEventListener("click", () => bead ? showToast(`${bead.name} · ${trigram.effects[index]}`) : openSocketDialog(key, index));
      board.appendChild(node);
    });
  });
  $("#path-legend").innerHTML = Object.values(TRIGRAMS).map(t => `<span><b>${t.zh}</b> ${t.use}</span>`).join("");
  const totals = elementTotals();
  const max = Math.max(...Object.values(totals), 10);
  $("#element-bars").innerHTML = Object.entries(ELEMENTS).map(([key, element]) => `<div class="element-row" style="--element-color:${element.color}"><b>${element.zh}</b><span class="element-track"><i style="width:${Math.max(5, totals[key] / max * 100)}%"></i></span><em>${totals[key]}</em></div>`).join("");
  $("#selected-bead-summary").innerHTML = selected ? `<b style="color:${QUALITY[selected.quality].color}">${esc(selected.name)}</b><br>${ELEMENTS[selected.element].zh}行 · 等级 ${selected.level}<br><small>点击任意闪烁节点选择道路</small>` : "请先在珠匣选择灵珠";
  $("#current-build").innerHTML = buildSummary(saveData);
  renderLoadout();
}

function canSocket(key, layer) {
  if (layer === 0) return true;
  const previous = saveData.cultivation[key][layer - 1];
  return Boolean(previous && previous.level >= layer + 1);
}

function renderLoadout() {
  const names = { active: "主动技能", passive: "心法" };
  $("#loadout-panel").innerHTML = Object.entries(names).map(([kind, label]) => {
    const requiredLayer = kind === "active" ? 1 : 0;
    const learned = Object.keys(TRIGRAMS).filter(key => saveData.cultivation[key][requiredLayer]);
    return `<div class="loadout-group"><h3>${label}</h3><div>${saveData.loadout[kind].map((selected, slot) =>
      `<label>${kind === "active" ? (slot === 0 ? "Q" : "E") : `心法 ${slot + 1}`}<select data-equip-kind="${kind}" data-equip-slot="${slot}">
      <option value="">空栏位</option>${learned.map(key => `<option value="${key}" ${selected === key ? "selected" : ""}>${TRIGRAMS[key].zh} · ${kind === "active" ? TRIGRAMS[key].skill : TRIGRAMS[key].effects[0]}</option>`).join("")}</select></label>`).join("")}</div></div>`;
  }).join("");
  $$('[data-equip-kind]').forEach(select => select.addEventListener("change", async () => {
    if (activeGame && !activeGame.finished) { renderLoadout(); return showToast("请在关外调整配招", true); }
    const kind = select.dataset.equipKind;
    const slot = Number(select.dataset.equipSlot);
    const choice = select.value || null;
    if (choice && saveData.loadout[kind].includes(choice)) { renderLoadout(); return showToast("同一卦路不能重复装备", true); }
    saveData.loadout[kind][slot] = choice;
    renderCultivation();
    await saveState("出战配置已保存");
  }));
}

function moveDescriptions(stats) {
  const styles = {
    metal: ["第三剑延长剑锋并增强破甲", "反击更适合穿透正面防线", "剑气可额外穿透两名敌人"],
    wood: ["灵种叠层，第三剑消耗灵种恢复生命", "完美格挡小幅回血", "剑气快速种下灵种"],
    water: ["劈砍附加寒滞", "完美格挡令近敌减速", "剑气延长控制时间"],
    fire: ["劈砍点燃，第三剑引爆燃烧", "完美格挡强化下一剑", "剑气延长燃烧"],
    earth: ["第三剑重击并击退", "完美格挡获得护盾", "剑气稳定击退敌人"],
  };
  return styles[stats.primary] || ["标准三段连斩", "完美格挡后按劈砍反击", "标准远程剑气"];
}

function buildSummary(state) {
  const stats = calculateStats(state);
  const moves = moveDescriptions(stats);
  const main = stats.primary ? ELEMENTS[stats.primary].zh : "未定";
  const sub = stats.secondary ? ELEMENTS[stats.secondary].zh : "未定";
  const values = Object.entries(ELEMENTS).map(([key, item]) => `${item.zh}${stats.totals[key]}`).join(" · ");
  return `<div class="build-preview"><p>${values}</p><p>主修 ${main} · 辅修 ${sub} · 攻击 ${stats.attack.toFixed(1)} · 生命 ${stats.hpMax} · 剑意 ${stats.qiMax}</p>
    <p>劈砍：${moves[0]}</p><p>格挡：${moves[1]}</p><p>剑气：${moves[2]}</p>
    <p>出战：${stats.loadout.active.map(key => key ? `${TRIGRAMS[key].zh}·${TRIGRAMS[key].skill}` : "空").join(" / ")}；心法：${stats.loadout.passive.map(key => key ? TRIGRAMS[key].zh : "空").join(" / ")}</p></div>`;
}

function previewSocketState(socket = pendingSocket) {
  const state = JSON.parse(JSON.stringify(saveData));
  if (!socket) return state;
  const index = state.inventory.findIndex(bead => bead.id === socket.beadId);
  if (index < 0 || state.cultivation[socket.trigramKey]?.[socket.layer] !== null) return state;
  state.cultivation[socket.trigramKey][socket.layer] = state.inventory.splice(index, 1)[0];
  return state;
}

function openSocketDialog(trigramKey, layer) {
  const bead = saveData.inventory.find(item => item.id === selectedBeadId);
  if (!bead) return showToast("请先在珠匣选择一颗灵珠", true);
  if (!canSocket(trigramKey, layer)) return showToast("前一层灵珠尚需继续修炼", true);
  pendingSocket = { trigramKey, layer, beadId: bead.id };
  const trigram = TRIGRAMS[trigramKey];
  $("#socket-title").textContent = `${trigram.zh}卦 · ${["入门", "化境", "道法"][layer]}层`;
  $("#socket-preview").innerHTML = `<p><b style="color:${ELEMENTS[bead.element].color}">${esc(bead.name)}</b></p><p>${esc(trigram.effects[layer])}</p>
    <div class="preview-grid"><div><b>当前</b>${buildSummary(saveData)}</div><div><b>镶嵌后</b>${buildSummary(previewSocketState())}</div></div>`;
  $("#socket-dialog").showModal();
}

async function confirmSocket(event) {
  event.preventDefault();
  if (!pendingSocket) return;
  const { trigramKey, layer, beadId } = pendingSocket;
  const index = saveData.inventory.findIndex(item => item.id === beadId);
  if (index < 0 || saveData.cultivation[trigramKey][layer] || !canSocket(trigramKey, layer)) return;
  const [bead] = saveData.inventory.splice(index, 1);
  saveData.cultivation[trigramKey][layer] = bead;
  saveData.player.spirit += bead.level;
  const kind = layer === 0 ? "passive" : layer === 1 ? "active" : null;
  if (kind) {
    const empty = saveData.loadout[kind].indexOf(null);
    if (empty >= 0) saveData.loadout[kind][empty] = trigramKey;
  }
  selectedBeadId = null;
  pendingSocket = null;
  $("#socket-dialog").close();
  renderAll();
  await saveState(`${bead.name} 已永久镶入${TRIGRAMS[trigramKey].zh}卦`);
}

function renderAll() { renderHeader(); renderRealms(); renderInventory(); renderCultivation(); }

function grantBeadExperience(amount) {
  const evolved = [];
  socketedBeads().forEach(bead => {
    bead.xp += amount;
    while (bead.level < RULES.config.limits.bead_level && bead.xp >= bead.level * 30) {
      bead.xp -= bead.level * 30;
      bead.level += 1;
      saveData.player.spirit += 1;
      const targetAffixes = bead.level >= 6 ? 3 : bead.level >= 3 ? 2 : 1;
      if (bead.affixes.length < targetAffixes) {
        const options = AFFIXES[bead.element].filter(([key]) => !bead.affixes.some(item => item.key === key));
        if (options.length) {
          const [key, label, base] = randomItem(options);
          bead.affixes.push({ key, label, value: base + Math.floor(Math.random() * 4) });
        }
      }
      evolved.push(bead.name);
    }
  });
  return evolved;
}

function startRealm(key, options = {}) {
  if (saveBlocked && !options.practice && !options.labTrial) return showToast("存档未同步，请先刷新或重新登录；仍可进入练功场临时试招", true);
  showPanel("game");
  if (activeGame) activeGame.destroy();
  activeGame = new BattleGame(key, options);
  activeGame.start();
}

function renderCheckpointRecovery() {
  const available = Boolean(saveData.active_trial && (!activeGame || activeGame.finished));
  $("#restore-checkpoint").hidden = !available;
  $("#checkpoint-status").hidden = !available;
  $("#checkpoint-status").textContent = available ? "有未完成的火境剑碑试炼，将按原构筑恢复；重新开战会替换它。" : "";
}

function restoreCheckpoint() {
  if (saveBlocked) return showToast("存档未同步，请刷新后确认剑碑记录", true);
  if (activeGame && !activeGame.finished) return showToast("请先结束当前试炼", true);
  try {
    const trial = TRIALS.restore(saveData.active_trial, RULES);
    startRealm("fire", { trial });
  } catch (error) { showToast(error.message, true); }
}

function abandonCheckpoint(game) {
  if (game?.practice || !saveData.active_trial || saveData.active_trial.id !== game?.trial?.id) return;
  saveData.active_trial = null;
  renderCheckpointRecovery();
  void saveState("");
}

function continueCheckpoint() {
  const game = activeGame;
  if(game?.labRun){ if(!game.canContinueCheckpoint())return; $("#result-dialog").close(); void globalThis.DaoBladeArrayLabUI.resumeTrial().catch(error=>{game.quit();showToast(error.message,true);}); return; }
  if (saveBlocked) return showToast("存档未同步，暂不能继续正式试炼", true);
  if (!game?.canContinueCheckpoint()) return;
  $("#result-dialog").close();
  startRealm(game.realmKey, { trial: game.trial });
}

globalThis.DaoBladeStartArrayTrial = (trial,compiled) => startRealm(trial.realm_id, {labTrial:trial,labCompiled:compiled});

globalThis.DaoBladeStartArrayLab = compiled => startRealm("fire", { practice: true, labCompiled: compiled });

class BattleGame {
  constructor(realmKey, options = {}) {
    this.realmKey = realmKey;
    this.practice = Boolean(options.practice);
    this.labRun=Boolean(options.labTrial);
    this.labTrial=options.labTrial||null;
    this.labTrialId=this.labTrial?.id||null;
    this.labPending=false; this.labError=false;
    this.lab = this.practice||this.labRun ? options.labCompiled || null : null;
    this.labMetrics = { direct: 0, burn: 0, burst: 0 };
    this.skillInput=null;
    this.level = LEVELS.getDefinition(realmKey);
    this.checkpoint=this.labRun ? this.level.checkpoint||this.level.lab_checkpoint : this.level.checkpoint;
    if(this.labRun && (!this.checkpoint || this.labTrial.realm_id!==realmKey))throw new Error("试炼秘境与地图不匹配");
    this.realm = REALMS[realmKey];
    this.element = ELEMENTS[realmKey];
    this.canvas = $("#game-canvas");
    this.ctx = this.canvas.getContext("2d");
    this.ctx.imageSmoothingEnabled = false;
    this.width = this.canvas.width;
    this.height = this.canvas.height;
    this.worldWidth = this.level.world.width;
    this.floorY = this.level.world.floor_y;
    this.cameraX = 0;
    this.pause = false;
    this.finished = false;
    this.disposed = false;
    this.defeat = null;
    this.lastTime = performance.now();
    this.elapsed = 0;
    this.screenShake = 0;
    this.hitStop = 0;
    this.shockwaveAttackId = -1;
    this.keys = new Set();
    this.keyboardKeys = new Set();
    this.touchPointers = new Map();
    this.events = globalThis.DaoBladeBattleEvents?.createChannel() || null;
    this.feedbackLayer = globalThis.DaoBladeCombatFeedback?.createLayer({ enabled: () => feedback.combatText }) || null;
    this.events?.subscribe(event => this.feedbackLayer?.push(event));
    this.events?.subscribe(event => this.handleBattleEvent(event));
    this.nextEnemyId = 1;
    this.projectiles = [];
    this.particles = [];
    this.skillEffects = [];
    this.resuming = this.labRun ? Boolean(this.labTrial.checkpoint) : Boolean(!this.practice && this.checkpoint && options.trial?.activated && !options.trial.settled);
    this.trial = !this.practice && !this.labRun && this.checkpoint
      ? (this.resuming ? options.trial : TRIALS.create(options.state || saveData, RULES)) : null;
    this.snapshot = this.lab ? Object.freeze({ruleset_id: "array-lab-v1", rules_version: this.lab.rules_version, stats: RULES.createCombatSnapshot(DEFAULT_STATE()).stats, skill: this.lab.skill}) : this.trial?.snapshot || RULES.createCombatSnapshot(options.state || saveData);
    this.stats = this.snapshot.stats;
    this.characterArt = globalThis.DaoBladeCharacterArt?.renderer || null;
    if (this.characterArt) void this.characterArt.load();
    this.player = this.makePlayer();
    this.platforms = this.level.platforms.map(platform => ({ ...platform }));
    this.altars = this.practice ? [] : this.level.altars.map(altar => {
      const anchor = this.level.anchors[altar.anchor_id];
      return { id: altar.id, x: anchor.x, y: anchor.y - 28, taken: this.labRun ? this.labTrial.claimed_altars.includes(altar.id) : this.trial?.claimedAltars.has(altar.id) || false };
    });
    this.hazards = this.practice ? [] : this.level.hazards.map(hazard => ({ ...hazard }));
    this.hazardTimer = 0;
    this.enemies = this.practice ? [this.enemy("dummy", "试剑木桩", 620, 99999, "dummy")] : this.makeEnemies();
    if (this.lab && this.practice) { this.player.x = 240; this.enemies[0].x = 340; }
    if (this.resuming) {
      const anchor = this.level.anchors[this.checkpoint.anchor_id];
      this.player.x = anchor.x; this.player.y = anchor.y - this.player.h;
      for (const enemy of this.enemies) if (this.checkpoint.cleared_ids.includes(enemy.id)) { enemy.dead = true; enemy.hp = 0; }
      this.cameraX = clamp(this.player.x - this.width * .42, 0, this.worldWidth - this.width);
    }
    this.boundKeyDown = event => this.keyDown(event);
    this.boundKeyUp = event => this.keyUp(event);
    this.boundBlur = () => this.setPause(true);
    this.boundVisibility = () => { if (document.hidden) this.setPause(true); };
    this.boundPointerEnd = event => this.endTouchPointer(event.pointerId);
  }

  makePlayer() {
    const spawn = this.level.anchors.spawn;
    return { x: spawn.x, y: spawn.y - 70, w: 38, h: 70, vx: 0, vy: 0, face: 1, onGround: true, hp: this.stats.hpMax, qi: this.stats.qiMax, invuln: 0, slash: 0, slashDuration: .28, slashCooldown: 0, qiCast: 0, qiCooldown: 0, skillCooldowns: [0, 0], attackId: 0, combo: 0, lastSlashAt: -10, blocking: false, blockStarted: -10, parryArmed: 0, parryLock: 0, counterWindow: 0, counterAttack: false, blockFlash: 0, dash: 0, dashCooldown: 0, dashDirection: 1, jumpCount: 0, jumpBuffer: 0, coyote: .1, queuedSlash: 0, hurt: 0, shield: 0, shieldTime: 0, flameBuff: 0, healCooldown: 0, animTime: 0 };
  }

  makeEnemies() {
    return this.level.encounters.map(spec => {
      const anchor = this.level.anchors[spec.anchor_id];
      const name = spec.kind === "boss" ? this.realm.boss : this.realm.enemies[spec.name_index];
      const enemy = this.enemy(spec.kind, name, anchor.x, spec.hp, spec.variant);
      enemy.y = anchor.y - enemy.h;
      enemy.spawn_anchor = spec.anchor_id;
      return enemy;
    });
  }

  enemy(kind, name, x, hp, variant = kind) {
    const boss = kind === "boss";
    const height = boss ? 100 : variant === "caster" ? 64 : 62;
    const width = boss ? 66 : variant === "charger" ? 48 : 42;
    return { id: `enemy-${this.nextEnemyId++}`, kind, variant, name, x, y: this.floorY - height, w: width, h: height, hp, maxHp: hp, vx: 0, face: -1, attackCd: .8 + Math.random(), attackState: "idle", attackTimer: 0, attackType: "", attackHit: false, attackDirection: -1, comboStep: 0, hurt: 0, burn: 0, burnTick: 0, slow: 0, chill: 0, seeds: 0, engaged: false, dead: false, lastHit: -1 };
  }

  start() {
    $("#leave-run").textContent=this.labRun?"返回阵盘（保留剑碑）":"放弃闯关";
    $("#return-sanctuary").textContent=this.labRun?"返回阵盘":"返回洞府";
    $("#realm-name").textContent = this.labRun ? `阵盘挑战 · ${this.element.realm}` : this.lab ? "阵盘试验 · 离火试招" : this.practice ? "练功场 · 临时试招" : `${this.element.zh} · ${this.element.realm}`;
    $("#objective-text").textContent = this.labRun ? "冻结配珠挑战 · 清除六敌胜利成长；剑碑保存后可续关" : this.lab ? "只读已保存配置 · Q施招，E按方案引爆/回火；无奖励，退出回阵盘" : this.practice ? "木桩会恢复，不结算战利品" : `击败 ${this.realm.enemies.join("、")}与${this.realm.boss}`;
    if (!this.practice && !this.labRun && !this.resuming) { saveData.active_trial = null; saveData.progress.runs += 1; void saveState(""); }
    renderCheckpointRecovery();
    $("#pause-overlay").classList.add("hidden");
    window.addEventListener("keydown", this.boundKeyDown);
    window.addEventListener("keyup", this.boundKeyUp);
    window.addEventListener("blur", this.boundBlur);
    window.addEventListener("pointerup", this.boundPointerEnd);
    window.addEventListener("pointercancel", this.boundPointerEnd);
    document.addEventListener("visibilitychange", this.boundVisibility);
    this.bindTouch();
    this.updateHud();
    requestAnimationFrame(time => this.loop(time));
  }

  destroy() {
    this.endBattleEvents("abandoned");
    this.feedbackLayer?.clear();
    this.disposed = true;
    this.finished = true;
    if (this.defeat) { this.defeat.resolve(false); this.defeat = null; }
    window.removeEventListener("keydown", this.boundKeyDown);
    window.removeEventListener("keyup", this.boundKeyUp);
    window.removeEventListener("blur", this.boundBlur);
    window.removeEventListener("pointerup", this.boundPointerEnd);
    window.removeEventListener("pointercancel", this.boundPointerEnd);
    document.removeEventListener("visibilitychange", this.boundVisibility);
    this.clearInput();
    $("#pause-overlay").classList.add("hidden");
  }

  emitBattleEvent(type, data = {}) {
    const p = this.player;
    return this.events?.emit({ type, time: this.elapsed, source_id: "player", element: this.stats.primary,
      position: [p.x + p.w / 2, p.y + p.h / 2], ...data });
  }

  handleBattleEvent(event) {
    if (event.type === "battle_ended") battleAudio?.stop();
    else playBattleSound(event);
  }

  endBattleEvents(outcome) {
    if (!this.events || this.events.closed || this.eventsEnding) return;
    this.eventsEnding = true;
    try { this.emitBattleEvent("battle_ended", { action_id: "battle", phase: "complete", outcome }); }
    finally { this.events.close(); this.eventsEnding = false; }
  }

  clearInput() {
    this.skillInput=null;
    const pointers = [...this.touchPointers];
    this.touchPointers.clear(); this.keyboardKeys.clear(); this.keys.clear();
    for (const [id, { button }] of pointers) this.releaseTouchCapture(button, id);
    this.player.blocking = false; this.player.parryArmed = 0; this.player.queuedSlash = 0; this.player.jumpBuffer = 0;
  }

  releaseTouchCapture(button, id) {
    try { if (button.hasPointerCapture?.(id)) button.releasePointerCapture(id); }
    catch (_) { /* 浏览器可能已自动释放；输入来源已先清理。 */ }
  }

  endTouchPointer(id) {
    const pointer = this.touchPointers.get(id);
    if (!pointer) return;
    this.touchPointers.delete(id);
    const { action, button } = pointer;
    if (!this.keyboardKeys.has(action) && ![...this.touchPointers.values()].some(item => item.action === action)) this.keys.delete(action);
    if (action === "block" && !this.keys.has("block")) this.player.blocking = false;
    this.releaseTouchCapture(button, id);
  }

  quit() { const target = this.lab ? "arraylab" : this.practice ? "cultivation" : "realms"; abandonCheckpoint(this); this.destroy(); activeGame = null; showPanel(target); }

  setPause(value) {
    if (this.finished || (!value && (this.labPending||this.labError))) return;
    this.pause = value;
    if (value) battleAudio?.stop();
    this.lastTime = performance.now();
    this.clearInput();
    $("#pause-overlay").classList.toggle("hidden", !value);
  }

  keyDown(event) {
    const action = actionForCode(event.code);
    if (action) event.preventDefault();
    if (event.repeat) return;
    if (action === "pause") return this.setPause(!this.pause);
    if (this.finished || this.pause || this.labPending || this.labError || !action) return;
    this.keyboardKeys.add(action);
    this.keys.add(action);
    this.performAction(action);
  }

  keyUp(event) {
    const action = actionForCode(event.code);
    if (action) {
      this.keyboardKeys.delete(action);
      if (![...this.touchPointers.values()].some(pointer => pointer.action === action)) this.keys.delete(action);
    }
    if (action === "block" && !this.keys.has("block")) this.player.blocking = false;
  }

  performAction(action) {
    if (this.disposed || this.finished || this.pause || this.labPending || this.labError) return;
    if(["slash","qi","block","dash"].includes(action))this.skillInput=null;
    if (action === "jump") this.jump();
    else if (action === "slash") this.slash();
    else if (action === "block") this.beginBlock();
    else if (action === "qi") this.swordQi();
    else if (action === "dao") this.requestDaoSkill(0);
    else if (action === "dao2") this.requestDaoSkill(1);
    else if (action === "dash") this.dash();
  }

  bindTouch() {
    $$('[data-touch]').forEach(button => {
      button.onpointerdown = event => {
        event.preventDefault();
        const action = button.dataset.touch;
        if (this.finished || this.disposed || this.pause || this.labPending || this.labError || (event.button !== undefined && event.button !== 0)) return;
        this.endTouchPointer(event.pointerId);
        this.touchPointers.set(event.pointerId, { action, button });
        try { button.setPointerCapture?.(event.pointerId); }
        catch (_) { /* 显式捕获不可用时由窗口pointerup/cancel兜底。 */ }
        this.keys.add(action);
        this.performAction(action);
      };
      button.onpointerup = button.onpointercancel = button.onlostpointercapture = event => this.endTouchPointer(event.pointerId);
    });
  }

  jump() {
    this.player.jumpBuffer = .14;
    this.tryJump();
  }

  tryJump() {
    const p = this.player;
    const first = p.onGround || p.coyote > 0;
    if (!p.jumpBuffer || p.dash > 0 || p.hurt > 0 || (!first && (this.stats.mastery.xun < 1 || p.jumpCount >= 2))) return;
    p.vy = -500; p.onGround = false; p.coyote = 0; p.jumpCount = first ? 1 : p.jumpCount + 1; p.jumpBuffer = 0;
    this.burst(p.x + 16, p.y + p.h, "#dbe8ed", 7);
  }

  slash() {
    const p = this.player;
    if (p.dash > 0 || p.hurt > 0 || p.qiCast > 0) return;
    if (p.slashCooldown > 0 || p.slash > 0) { p.queuedSlash = .2; return; }
    this.beginSlash();
  }

  beginSlash() {
    const p = this.player;
    p.blocking = false; p.parryArmed = 0;
    p.counterAttack = p.counterWindow > 0;
    p.counterWindow = 0;
    p.combo = this.elapsed - p.lastSlashAt < .68 ? p.combo % 3 + 1 : 1;
    p.lastSlashAt = this.elapsed;
    p.slashDuration = p.combo === 3 ? .36 : .28;
    p.slash = p.slashDuration;
    p.slashCooldown = (p.combo === 3 ? .47 : .32) * this.stats.cooldown;
    p.queuedSlash = 0;
    p.attackId += 1;
    this.emitBattleEvent("slash_started", { action_id: "slash", attack_id: p.attackId, combo: p.combo, phase: "windup" });
    p.vx += p.face * (p.combo === 3 ? 105 : 48);
    this.burst(p.x + p.w / 2 + p.face * 28, p.y + 34, elementColor(this.stats.primary), p.counterAttack ? 14 : 5);
  }

  beginBlock() {
    const p = this.player;
    if (p.dash > 0 || p.hurt > 0 || p.qiCast > 0 || (p.slash > .12)) return;
    if (p.slash > 0 && p.combo === 3) return;
    p.slash = 0; p.queuedSlash = 0; p.blocking = true; p.blockStarted = this.elapsed;
    p.parryArmed = p.parryLock <= 0 ? .22 : 0;
    p.parryLock = .5;
  }

  dash() {
    const p = this.player;
    if (p.dashCooldown > 0 || p.dash > 0 || p.hurt > 0 || p.qiCast > 0 || (p.slash > 0 && (p.combo === 3 || p.slash > .12))) return;
    p.blocking = false; p.parryArmed = 0; p.slash = 0; p.queuedSlash = 0;
    p.dash = .2; p.dashCooldown = .88; p.dashDirection = (this.keys.has("right") ? 1 : 0) - (this.keys.has("left") ? 1 : 0) || p.face;
    p.face = p.dashDirection; p.vy = Math.min(0, p.vy);
    this.burst(p.x + p.w / 2, p.y + p.h / 2, elementColor(this.stats.primary), 9);
  }

  swordQi() {
    const p = this.player;
    if (p.qi < 20 || p.qiCooldown > 0 || p.dash > 0 || p.hurt > 0 || p.blocking || p.slash > 0) return;
    p.qi -= 20; p.qiCooldown = .65 * this.stats.cooldown;
    p.skillPose = null;
    const damage = this.stats.attack * (.72 + this.stats.mastery.qian * .12) * (1 + (this.stats.affixes.qiPower || 0) / 100);
    p.qiCast = .25;
    p.vx -= p.face * 35;
    this.projectiles.push({ type: "swordQi", owner: "player", x: p.x + (p.face > 0 ? p.w : -38), y: p.y + 24, vx: p.face * (this.stats.primary === "earth" ? 430 : 640), vy: 0, w: this.stats.primary === "earth" ? 58 : 48, h: this.stats.primary === "earth" ? 26 : 20, damage, life: 1.8, maxLife: 1.8, pierce: (this.stats.primary === "metal" ? 2 : 0) + (this.stats.secondary === "metal" ? 1 : 0) + (this.stats.mastery.qian >= 1 ? 1 : 0), hitIds: new Set(), color: elementColor(this.stats.primary) });
    this.burst(p.x + p.w / 2 + p.face * 32, p.y + 33, "#dff6ff", 12);
  }

  skillInputBlocked(slot) {
    const p=this.player;
    return p.slash>0||p.hurt>0||p.qiCast>0||p.dash>0||p.skillCooldowns[slot]>0;
  }

  requestDaoSkill(slot) {
    if(this.disposed||this.finished||this.pause||this.labPending||this.labError)return;
    this.skillInput=null;
    if(this.player.blocking)return;
    this.player.queuedSlash=0;
    if(this.skillInputBlocked(slot)){this.skillInput={slot,remaining:.18};return;}
    this.daoSkill(slot);
  }

  flushSkillInput(dt) {
    const input=this.skillInput;if(!input)return;
    input.remaining=Math.max(0,input.remaining-dt);
    if(input.remaining===0||this.player.blocking){this.skillInput=null;return;}
    if(this.skillInputBlocked(input.slot))return;
    this.skillInput=null;
    // Cost, current build, facing and targets are checked by the real cast, not at keydown.
    this.daoSkill(input.slot);
  }

  arrayLabSkill(slot) {
    const skill = this.lab.skill, p = this.player;
    if (!skill.enabled) return showToast("离火核心未连接，技能暂时停用", true);
    if (slot !== 0 && !skill.burst && !skill.cycle) return showToast("当前方案未启用E变式", true);
    if (this.pause || this.finished || this.disposed || this.labPending || this.labError || p.hurt > 0 || p.slash > 0 || p.qiCast > 0 || p.dash > 0 || p.blocking || p.skillCooldowns[slot] > 0) return;
    const reach = skill.focus ? skill.focus_range : skill.range;
    const targets = this.enemies.filter(e => !e.dead && (e.x + e.w / 2 - p.x - p.w / 2) * p.face >= 0 && (e.x + e.w / 2 - p.x - p.w / 2) * p.face <= reach && Math.abs(e.y + e.h / 2 - p.y - p.h / 2) < 105);
    if (slot === 1 && !targets.some(e => e.labMarks > 0)) return showToast("前方没有可消耗火痕；先用Q留痕", true);
    const cost = slot ? (skill.cycle ? 0 : skill.burst_qi) : skill.qi;
    if (p.qi < cost) return showToast("剑意不足", true);
    p.qi -= cost; p.skillCooldowns[slot] = slot ? (skill.cycle ? skill.cycle_cooldown : skill.burst_cooldown) : skill.cooldown;
    p.qiCast = .22; p.skillPose = "li";
    let returnedMarks=0;
    for (const enemy of targets) {
      if (slot) {
        const marks = enemy.labMarks || 0; if (!marks) continue;
        enemy.labMarks = 0;
        if(skill.cycle){returnedMarks+=marks;continue;}
        this.hitEnemy(enemy, marks * skill.burst_per_mark, false, false, "lab_burst", "fire");
      } else {
        this.hitEnemy(enemy, skill.focus ? skill.focus_damage : skill.cycle ? skill.cycle_damage : skill.damage, false, false, "lab_fire", "fire");
        if (skill.mark) enemy.labMarks = Math.min(skill.max_marks, (enemy.labMarks || 0) + 1);
        if (skill.focus) { enemy.labBurn = skill.burn_seconds; enemy.labBurnTick = 1; }
      }
    }
    if(slot&&skill.cycle){
      p.qi=Math.min(this.stats.qiMax,p.qi+Math.min(skill.cycle_max_qi,returnedMarks*skill.cycle_qi_per_mark));
      p.shield=Math.max(p.shield,Math.min(skill.cycle_max_shield,returnedMarks*skill.cycle_shield_per_mark));
      p.shieldTime=Math.max(p.shieldTime,skill.cycle_shield_seconds);
    }
    this.skillEffects.push({x:p.x+p.w/2+p.face*reach/2,y:p.y+p.h/2,radius:reach/2,kind:"line",color:ELEMENTS.fire.color,life:.38});
    showToast(slot ? (skill.cycle ? "回火 · 收痕回剑意，短时护体" : "离火 · 消耗火痕引爆") : skill.focus ? "离火 · 聚焰持续灼烧" : "离火 · 留痕剑式");
  }

  daoSkill(slot = 0) {
    if (this.lab) return this.arrayLabSkill(slot);
    const dao = this.stats.loadout.active[slot];
    if (!dao || this.stats.depth[dao] < 2) return showToast("先修至第二层，并在洞府装备主动技能", true);
    const p = this.player;
    if (p.skillCooldowns[slot] > 0 || p.qi < 30 || p.dash > 0 || p.hurt > 0 || p.qiCast > 0 || p.slash > 0 || p.blocking) return;
    p.qi -= 30;
    p.skillCooldowns[slot] = 8 * this.stats.cooldown;
    p.qiCast = .22;
    p.skillPose = dao;
    const upgraded = this.stats.depth[dao] === 3;
    const beforeX = p.x;
    const cx = p.x + p.w / 2;
    const cy = p.y + p.h / 2;
    const close = (reach) => this.enemies.filter(enemy => !enemy.dead && Math.abs(enemy.x - cx) < reach && Math.abs(enemy.y + enemy.h / 2 - cy) < 105);
    const strike = (enemy, scale = 1.6) => this.hitEnemy(enemy, this.stats.attack * scale, false, false, "skill");
    if (dao === "qian") {
      this.enemies.filter(enemy => !enemy.dead && (enemy.x - cx) * p.face > -15 && (enemy.x - cx) * p.face < (upgraded ? 550 : 390) && Math.abs(enemy.y - p.y) < 75).forEach(enemy => strike(enemy, upgraded ? 2.4 : 1.9));
      this.skillEffects.push({ x: cx + p.face * 170, y: cy, radius: upgraded ? 350 : 250, kind: "line", color: elementColor(this.stats.primary), life: .38 });
    } else if (dao === "xun") {
      p.x = clamp(p.x + p.face * (upgraded ? 240 : 190), 0, this.worldWidth - p.w);
      p.invuln = Math.max(p.invuln, .35);
      this.enemies.filter(enemy => !enemy.dead && enemy.x >= Math.min(beforeX, p.x) - 25 && enemy.x <= Math.max(beforeX, p.x) + 70 && Math.abs(enemy.y - p.y) < 70).forEach(enemy => strike(enemy, upgraded ? 2.2 : 1.5));
      this.skillEffects.push({ x: (beforeX + p.x) / 2, y: cy, radius: Math.abs(p.x - beforeX) / 2 + 45, kind: "line", color: elementColor(this.stats.primary), life: .34 });
    } else if (dao === "kan") {
      close(upgraded ? 255 : 185).forEach(enemy => { enemy.slow = Math.max(enemy.slow, enemy.kind === "boss" ? 1 : 2.5); if (enemy.kind !== "boss") enemy.x += Math.sign(cx - enemy.x) * (upgraded ? 65 : 35); strike(enemy, .85); });
    } else if (dao === "gen") {
      p.parryArmed = upgraded ? .9 : .6;
      p.parryLock = p.parryArmed;
      p.blocking = true;
      p.skillParry = upgraded;
      p.skillGuard = p.parryArmed;
    } else if (dao === "kun") {
      p.shield = Math.min(35, p.shield + (upgraded ? 26 : 18));
      p.shieldTime = 5;
      p.skillShieldCounter = upgraded;
    } else if (dao === "zhen") {
      close(upgraded ? 260 : 180).forEach(enemy => { strike(enemy, 1.45); enemy.attackCd = Math.max(enemy.attackCd, enemy.kind === "boss" ? .45 : 1); });
    } else if (dao === "li") {
      close(upgraded ? 235 : 170).forEach(enemy => { strike(enemy, upgraded ? 2.4 : 1.8); enemy.burn = Math.max(enemy.burn, upgraded ? 4 : 2.5); });
    } else if (dao === "dui") {
      p.hp = Math.min(this.stats.hpMax, p.hp + this.stats.hpMax * (upgraded ? .27 : .18));
      p.qi = Math.min(this.stats.qiMax, p.qi + (upgraded ? 20 : 12));
      if (upgraded) p.nextSlashBuff = 1;
    }
    if (!this.skillEffects.some(effect => effect.kind === "line" && effect.life === .38)) {
      this.skillEffects.push({ x: cx, y: cy, radius: dao === "kun" || dao === "gen" ? 75 : 160, kind: "ring", color: elementColor(this.stats.primary), life: .48 });
    }
    this.burst(cx, cy, elementColor(this.stats.primary), 24);
    showToast(`${TRIGRAMS[dao].zh}卦 · ${TRIGRAMS[dao].skill}${upgraded ? "·通玄" : ""}`);
  }

  loop(time) {
    if (this.disposed || (this.finished && !this.defeat)) return;
    const dt = Math.max(0, Math.min((time - this.lastTime) / 1000, .034));
    this.lastTime = time;
    if (this.defeat) {
      if (!document.hidden) this.advanceDefeat(dt);
    } else if (!this.pause && !this.labPending && !this.labError) {
      this.screenShake = Math.max(0, this.screenShake - dt);
      if (this.hitStop > 0) this.hitStop = Math.max(0, this.hitStop - dt);
      else this.update(dt);
    }
    this.draw();
    // 先画出最终倒地帧，再允许结算对话框出现。
    if (this.defeat && this.defeat.elapsed >= this.defeat.duration) {
      this.defeat.resolve(true); this.defeat = null;
    }
    if (!this.disposed && (!this.finished || this.defeat)) requestAnimationFrame(next => this.loop(next));
  }

  advanceDefeat(dt) {
    if (!this.defeat) return;
    this.defeat.elapsed = Math.min(this.defeat.duration, this.defeat.elapsed + Math.max(0, dt));
    this.feedbackLayer?.update(dt);
    this.player.deathTime = this.defeat.elapsed;
    const fall = Math.min(1, this.defeat.elapsed / .45);
    this.player.deathDrop = this.defeat.initialOffset + this.defeat.drop * fall * fall;
  }

  defeatVisual() {
    this.player.deathTime = 0;
    const foot = this.player.y + this.player.h;
    const ground = this.platforms.filter(platform => platform.y >= foot - 1
      && this.player.x + this.player.w > platform.x && this.player.x < platform.x + platform.w)
      .reduce((nearest, platform) => Math.min(nearest, platform.y), this.floorY);
    const initialOffset = Math.min(0, this.floorY - foot);
    this.player.deathDrop = initialOffset;
    return new Promise(resolve => {
      this.defeat = { elapsed: 0, duration: globalThis.DaoBladeCharacterArt?.DEFEAT_DURATION || 1.05,
        initialOffset, drop: Math.max(0, ground - foot - initialOffset), resolve };
    });
  }

  update(dt) {
    if(this.labPending||this.labError)return;
    if (this.finished) return;
    const p = this.player;
    this.elapsed += dt;
    this.feedbackLayer?.update(dt);
    p.animTime += dt;
    p.invuln = Math.max(0, p.invuln - dt); p.slash = Math.max(0, p.slash - dt); p.slashCooldown = Math.max(0, p.slashCooldown - dt); p.qiCast = Math.max(0, p.qiCast - dt); p.qiCooldown = Math.max(0, p.qiCooldown - dt); p.skillCooldowns = p.skillCooldowns.map(value => Math.max(0, value - dt)); p.blockFlash = Math.max(0, p.blockFlash - dt);
    p.parryArmed = Math.max(0, p.parryArmed - dt); p.parryLock = Math.max(0, p.parryLock - dt);
    if (p.skillGuard > 0) { p.skillGuard = Math.max(0, p.skillGuard - dt); if (p.skillGuard === 0) { p.skillParry = false; if (!this.keys.has("block")) p.blocking = false; } }
    p.counterWindow = Math.max(0, p.counterWindow - dt); p.queuedSlash = Math.max(0, p.queuedSlash - dt);
    p.jumpBuffer = Math.max(0, p.jumpBuffer - dt); p.dashCooldown = Math.max(0, p.dashCooldown - dt);
    p.dash = Math.max(0, p.dash - dt); p.hurt = Math.max(0, p.hurt - dt);
    p.shieldTime = Math.max(0, p.shieldTime - dt); if (!p.shieldTime) { p.shield = 0; p.skillShieldCounter = false; }
    p.flameBuff = Math.max(0, p.flameBuff - dt); p.healCooldown = Math.max(0, p.healCooldown - dt);
    p.slowTime = Math.max(0, (p.slowTime || 0) - dt);
    if (p.queuedSlash > 0 && p.slashCooldown <= 0 && p.slash <= 0 && p.dash <= 0 && p.hurt <= 0 && p.qiCast <= 0) this.beginSlash();
    p.qi = Math.min(this.stats.qiMax, p.qi + this.stats.qiRegen * dt);
    const move = (this.keys.has("right") ? 1 : 0) - (this.keys.has("left") ? 1 : 0);
    if (move && p.dash <= 0 && p.slash <= 0 && p.hurt <= 0 && !p.blocking) p.face = move;
    this.flushSkillInput(dt);
    if (p.hurt > 0) p.vx *= Math.pow(.02, dt);
    else if (p.dash > 0) p.vx = p.dashDirection * 570;
    else {
      const speed = this.stats.speed * (p.slowTime > 0 ? .7 : 1);
      const target = p.blocking || p.qiCast > 0 ? move * speed * .35 : move * speed;
      p.vx += (target - p.vx) * Math.min(1, dt * 11);
      if (!move) p.vx *= Math.pow(.001, dt);
    }
    p.vy += 1250 * dt;
    p.x = clamp(p.x + p.vx * dt, 0, this.worldWidth - p.w);
    p.y += p.vy * dt;
    const wasGrounded = p.onGround;
    p.onGround = false;
    for (const platform of this.platforms) {
      const oldBottom = p.y + p.h - p.vy * dt;
      if (p.vy >= 0 && p.x + p.w > platform.x && p.x < platform.x + platform.w && p.y + p.h >= platform.y && oldBottom <= platform.y + 8) {
        p.y = platform.y - p.h; p.vy = 0; p.onGround = true; p.jumpCount = 0;
      }
    }
    p.coyote = p.onGround ? .11 : wasGrounded ? .11 : Math.max(0, p.coyote - dt);
    this.tryJump();
    this.hazardTimer = Math.max(0, this.hazardTimer - dt);
    if (p.onGround && this.hazardTimer === 0 && Math.sin(this.elapsed * 3) > .45 && this.hazards.some(h => p.x + p.w > h.x && p.x < h.x + h.w)) {
      this.hazardTimer = 1;
      this.damagePlayer(9, p.x + (p.face > 0 ? 100 : -100));
    }
    if (this.finished) { this.updateHud(); return; }
    this.altars.forEach(altar => {
      if (!altar.taken && this.overlap(p.x, p.y, p.w, p.h, altar.x, altar.y, 28, 28)) {
        if(this.labRun){
          this.labRecord("altar",{altar_id:altar.id},()=>{
            altar.taken=true;this.player.hp=Math.min(this.stats.hpMax,this.player.hp+12);
            this.player.qi=Math.min(this.stats.qiMax,this.player.qi+18);
            showToast("祭坛已保存：恢复气血与剑意，不重复领取");
          });return;
        }
        altar.taken = true;
        this.trial?.claimedAltars.add(altar.id);
        if (this.trial?.activated) this.persistCheckpoint();
        p.hp = Math.min(this.stats.hpMax, p.hp + 12);
        p.qi = Math.min(this.stats.qiMax, p.qi + 18);
        this.burst(altar.x + 14, altar.y + 14, "#dfad4c", 16);
        showToast("发现支路祭坛：恢复气血，通关后额外得珠");
      }
    });
    if(this.labPending)return;
    if (p.y > this.height + 120) this.damagePlayer(30, p.x - 20);
    if (this.finished) { this.updateHud(); return; }
    if (p.y > this.height + 80) { p.x = Math.max(40, p.x - 180); p.y = 280; p.vy = 0; }

    if (p.slash > 0) {
      const progress = 1 - p.slash / p.slashDuration;
      const active = progress > .18 && progress < .78;
      const range = (p.combo === 3 ? (this.stats.primary === "metal" ? 132 : 104) : 82) + (this.stats.secondary === "metal" ? 10 : 0); const left = p.face > 0 ? p.x + p.w - 4 : p.x - range + 4;
      this.enemies.filter(e => active && !e.dead && e.lastHit !== p.attackId && this.overlap(left, p.y + 4, range, 62, e.x, e.y, e.w, e.h)).forEach(e => {
        e.lastHit = p.attackId;
        let damage = this.stats.attack * [1, 1, 1.12, 1.34][p.combo] * (1 + (this.stats.affixes.attack || 0) / 100);
        const crit = Math.random() < this.stats.crit;
        if (crit) damage *= 1.75;
        this.hitEnemy(e, damage * (p.counterAttack ? 1.35 : 1) * (p.nextSlashBuff ? 1.35 : 1), crit, false, "slash");
        p.nextSlashBuff = 0;
        p.qi = Math.min(this.stats.qiMax, p.qi + 3 + (this.stats.secondary === "water" ? 1 : 0));
      });
    }
    this.updateEnemies(dt);
    if (this.finished) { this.updateHud(); return; }
    this.updateProjectiles(dt);
    this.particles.forEach(particle => { particle.x += particle.vx * dt; particle.y += particle.vy * dt; particle.life -= dt; });
    this.particles = this.particles.filter(particle => particle.life > 0);
    this.skillEffects.forEach(effect => { effect.life -= dt; });
    this.skillEffects = this.skillEffects.filter(effect => effect.life > 0);
    this.cameraX += (clamp(p.x - this.width * .42, 0, this.worldWidth - this.width) - this.cameraX) * Math.min(1, dt * 5);
    this.updateCheckpoint();
    this.updateHud();
    if (!this.practice && !this.finished && !this.labPending && this.enemies.every(enemy => enemy.dead)) this.finish(true);
  }

  updateEnemies(dt) {
    const p = this.player;
    for (const enemy of this.enemies) {
      if (this.finished) break;
      if (enemy.dead) continue;
      if (this.lab && enemy.labBurn > 0) {
        const active = Math.min(dt, enemy.labBurn);
        enemy.labBurn = Math.max(0, enemy.labBurn - dt); enemy.labBurnTick -= active;
        if (enemy.labBurnTick <= .00001) { enemy.labBurnTick += 1; this.hitEnemy(enemy, this.lab.skill.burn_damage, false, true, "lab_burn", "fire"); }
      }
      if (enemy.kind === "dummy") { enemy.hp = Math.min(enemy.maxHp, enemy.hp + 60 * dt); enemy.hurt = Math.max(0, enemy.hurt - dt); continue; }
      enemy.hurt = Math.max(0, enemy.hurt - dt); enemy.attackCd -= dt; enemy.slow = Math.max(0, enemy.slow - dt);
      if (enemy.slow === 0) enemy.chill = 0;

      if (enemy.burn > 0) { enemy.burn -= dt; enemy.burnTick -= dt; if (enemy.burnTick <= 0) { enemy.burnTick = .55; this.hitEnemy(enemy, 2 + (this.stats.affixes.burn || 0) * .08, false, true, "burn"); } }
      if (enemy.dead || this.finished) continue;
      const dx = p.x - enemy.x; const distance = Math.abs(dx); const direction = Math.sign(dx) || 1; const speed = (enemy.kind === "boss" ? 105 : enemy.variant === "stalker" ? 115 : 82) * (enemy.slow > 0 ? .55 : 1);
      if (enemy.attackState === "idle") enemy.face = direction;
      if (this.realmKey === "fire") {
        this.updateFireEnemy(enemy, dt, distance, direction, speed);
        continue;
      }
      if (enemy.attackState !== "idle") {
        enemy.attackTimer -= dt;
        if (enemy.attackState === "windup" && enemy.attackTimer <= 0) {
          enemy.attackState = "recover";
          enemy.attackTimer = .24;
          enemy.attackCd = enemy.kind === "boss" ? 1.05 : enemy.kind === "ranged" ? 1.8 : 1.2;
          if (enemy.kind === "ranged" || enemy.attackType === "bolt") this.enemyShot(enemy, enemy.attackDirection);
          else {
            const reach = enemy.kind === "boss" ? 100 : enemy.variant === "crusher" ? 80 : 65;
            const attackX = enemy.attackDirection > 0 ? enemy.x + enemy.w - 5 : enemy.x - reach + 5;
            if (this.overlap(attackX, enemy.y + 6, reach, enemy.h - 10, p.x, p.y, p.w, p.h)) this.damagePlayer(enemy.kind === "boss" ? 23 : enemy.variant === "crusher" ? 17 : 12, enemy.x + enemy.w / 2, enemy.id, enemy.attackType);
          }
        } else if (enemy.attackState === "recover" && enemy.attackTimer <= 0) enemy.attackState = "idle";
      } else if (enemy.kind === "ranged") {
        if (distance < 190) enemy.x -= direction * speed * dt;
        else if (distance > 380 && (distance < 660 || enemy.engaged)) enemy.x += direction * speed * dt;
        if (distance < 660 && enemy.attackCd <= 0) this.beginEnemyAttack(enemy, "bolt", .55);
      } else {
        if (distance > 65 && (distance < 525 || enemy.engaged)) enemy.x += direction * speed * dt;
        if (distance < (enemy.kind === "boss" ? 160 : 115) && enemy.attackCd <= 0) {
          const rangedBoss = enemy.kind === "boss" && distance > 110;
          this.beginEnemyAttack(enemy, rangedBoss ? "bolt" : "slash", enemy.variant === "crusher" ? .7 : enemy.kind === "boss" ? .55 : .38);
        }
      }
      enemy.x = clamp(enemy.x, 40, this.worldWidth - 80);
    }
  }

  updateFireEnemy(enemy, dt, distance, direction, speed) {
    if (enemy.attackState !== "idle") {
      enemy.attackTimer -= dt;
      if (enemy.attackState === "windup" && enemy.attackTimer <= 0) {
        enemy.attackState = "strike";
        enemy.attackTimer = enemy.attackType === "dash" ? .34 : .22;
        enemy.attackHit = false;
        if (enemy.attackType === "fireball") this.enemyShot(enemy, enemy.attackDirection, "fireball");
        if (enemy.attackType === "wave") this.enemyShot(enemy, enemy.attackDirection, "wave");
      } else if (enemy.attackState === "strike") {
        if (enemy.attackType === "dash") enemy.x += enemy.attackDirection * (enemy.kind === "boss" ? 470 : 380) * dt;
        const reach = enemy.kind === "boss" ? 106 : enemy.variant === "charger" ? 84 : 66;
        const frontX = enemy.attackDirection > 0 ? enemy.x + enemy.w - 5 : enemy.x - reach + 5;
        if (!enemy.attackHit && ["slash", "dash"].includes(enemy.attackType) && this.overlap(frontX, enemy.y + 7, reach, enemy.h - 12, this.player.x, this.player.y, this.player.w, this.player.h)) {
          enemy.attackHit = true;
          this.damagePlayer(enemy.kind === "boss" ? 24 : enemy.variant === "charger" ? 16 : 12, enemy.x + enemy.w / 2, enemy.id, enemy.attackType);
        }
        if (enemy.attackTimer <= 0) {
          enemy.attackState = "recover";
          enemy.attackTimer = enemy.kind === "boss" ? .32 : .26;
        }
      } else if (enemy.attackState === "recover" && enemy.attackTimer <= 0) {
        enemy.attackState = "idle";
        enemy.attackCd = enemy.kind === "boss" ? .65 : 1 + Math.random() * .35;
      }
      enemy.x = clamp(enemy.x, 40, this.worldWidth - 80);
      return;
    }

    // 近战敌人会包围玩家，但同一时间只允许一名敌人正式出招。
    // 这样仍有压迫感，也能让蓄力提示和格挡时机保持清晰。
    const attackBusy = this.enemies.some(other => other !== enemy && !other.dead && ["windup", "strike"].includes(other.attackState) && Math.abs(other.x - this.player.x) < 260);
    const nearby = this.enemies.find(other => other !== enemy && !other.dead && Math.abs(other.x - enemy.x) < (enemy.w + other.w) * .55);
    if (nearby) enemy.x += (enemy.x >= nearby.x ? 1 : -1) * speed * .42 * dt;

    if (enemy.kind === "ranged") {
      if (distance < 230) enemy.x -= direction * speed * dt;
      else if (distance > 430 && (distance < 720 || enemy.engaged)) enemy.x += direction * speed * .65 * dt;
      if (!attackBusy && distance < 720 && enemy.attackCd <= 0) this.beginEnemyAttack(enemy, "fireball", .58);
    } else if (enemy.kind === "boss") {
      if (distance > 115 && (distance < 650 || enemy.engaged)) enemy.x += direction * speed * dt;
      if (!attackBusy && enemy.attackCd <= 0 && distance < 650) {
        enemy.comboStep += 1;
        if (distance < 135) this.beginEnemyAttack(enemy, enemy.comboStep % 3 === 0 ? "dash" : "slash", .38);
        else this.beginEnemyAttack(enemy, enemy.comboStep % 2 ? "wave" : "dash", .52);
      }
    } else {
      const preferred = enemy.variant === "charger" ? 150 : 62;
      if (distance > preferred && (distance < 560 || enemy.engaged)) enemy.x += direction * speed * (enemy.variant === "charger" ? 1.18 : 1) * dt;
      if (!attackBusy && enemy.attackCd <= 0 && distance < (enemy.variant === "charger" ? 245 : 76)) {
        this.beginEnemyAttack(enemy, enemy.variant === "charger" ? "dash" : "slash", enemy.variant === "charger" ? .46 : .3);
      }
    }
    enemy.x = clamp(enemy.x, 40, this.worldWidth - 80);
  }

  beginEnemyAttack(enemy, type, windup) {
    enemy.attackType = type;
    enemy.attackState = "windup";
    enemy.attackTimer = windup;
    enemy.attackHit = false;
    enemy.attackDirection = enemy.face;
  }

  enemyShot(enemy, direction, type = "bolt") {
    const wave = type === "wave";
    this.projectiles.push({ type, owner: "enemy", source_id: enemy.id, x: enemy.x + enemy.w / 2, y: wave ? this.floorY - 28 : enemy.y + enemy.h * .35, vx: direction * (wave ? 360 : type === "fireball" ? 285 : 260), vy: type === "fireball" ? -45 : 0, gravity: type === "fireball" ? 95 : 0, w: wave ? 46 : 20, h: wave ? 28 : 18, damage: enemy.kind === "boss" ? 18 : 10, life: wave ? 2.2 : 3, maxLife: wave ? 2.2 : 3, color: this.element.color });
  }

  updateProjectiles(dt) {
    for (const shot of this.projectiles) {
      if (this.finished) break;
      shot.vy += (shot.gravity || 0) * dt;
      shot.x += shot.vx * dt; shot.y += shot.vy * dt; shot.life -= dt;
      if (shot.owner === "player") {
        for (const enemy of this.enemies) {
          if (!enemy.dead && !shot.hitIds.has(enemy) && this.overlap(shot.x, shot.y, shot.w, shot.h, enemy.x, enemy.y, enemy.w, enemy.h)) {
            shot.hitIds.add(enemy);
            this.hitEnemy(enemy, shot.damage, false, false, "qi");
            if (this.stats.primary === "fire") {
              this.enemies.filter(other => other !== enemy && !other.dead && Math.abs(other.x - enemy.x) < 72 && Math.abs(other.y - enemy.y) < 65).slice(0, 3).forEach(other => this.hitEnemy(other, shot.damage * .28, false, false, "burst"));
              this.burst(enemy.x, enemy.y, "#ffb15b", 12);
            }
            shot.pierce -= 1; if (shot.pierce < 0) { shot.life = 0; break; }
          }
        }
      } else if (this.overlap(shot.x, shot.y, shot.w, shot.h, this.player.x, this.player.y, this.player.w, this.player.h)) { this.damagePlayer(shot.damage, shot.x + shot.w / 2, shot.source_id || "enemy-projectile", shot.type); if (this.realmKey === "water") this.player.slowTime = 1.2; shot.life = 0; }
    }
    this.projectiles = this.projectiles.filter(shot => shot.life > 0 && shot.x > -100 && shot.x < this.worldWidth + 100);
  }

  hitEnemy(enemy, damage, crit = false, dot = false, kind = "skill", skillElement = null) {
    if (this.finished || enemy.dead) return;
    const p = this.player;
    if (!dot) {
      if (this.stats.primary === "fire") {
        enemy.burn = Math.max(enemy.burn, kind === "qi" ? 3.2 : 2.4);
        if (kind === "slash" && p.combo === 3) {
          damage += Math.min(16, 5 + enemy.burn * 3);
          enemy.burn = 0;
          this.burst(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2, "#ffb15b", 12);
          this.enemies.filter(other => other !== enemy && !other.dead && Math.abs(other.x - enemy.x) < 60 && Math.abs(other.y - enemy.y) < 65).slice(0, 2).forEach(other => this.hitEnemy(other, Math.min(9, damage * .2), false, true, "burst"));
        }
      }
      if (this.stats.primary === "water") {
        enemy.chill = Math.min(3, enemy.chill + (kind === "qi" ? 2 : 1));
        enemy.slow = Math.max(enemy.slow, enemy.kind === "boss" ? .8 : kind === "slash" && p.combo === 3 ? 2.4 : .75 + enemy.chill * .45);
      }
      if (this.stats.primary === "wood") {
        enemy.seeds = Math.min(3, enemy.seeds + (kind === "qi" ? 2 : 1));
        if (kind === "slash" && p.combo === 3 && enemy.seeds >= 2 && p.healCooldown <= 0) {
          p.hp = Math.min(this.stats.hpMax, p.hp + Math.min(10, 4 + enemy.seeds * 2));
          p.healCooldown = 1.4; enemy.seeds = 0;
        }
      }
      if (this.stats.primary === "metal" && ((kind === "slash" && p.combo === 3) || kind === "skill")) damage *= 1.18;
      if (this.stats.primary === "earth") {
        enemy.x = clamp(enemy.x + p.face * (kind === "slash" && p.combo === 3 ? 48 : 18) * this.stats.stagger, 40, this.worldWidth - 80);
        if (kind === "slash" && p.combo === 3) {
          enemy.slow = Math.max(enemy.slow, .55);
          if (this.shockwaveAttackId !== p.attackId) {
            this.shockwaveAttackId = p.attackId;
            this.enemies.filter(other => other !== enemy && !other.dead && Math.abs(other.x - enemy.x) < 90 && Math.abs(other.y - enemy.y) < 65).slice(0, 2).forEach(other => {
              other.x = clamp(other.x + p.face * 30, 40, this.worldWidth - 80);
              other.slow = Math.max(other.slow, .55);
            });
            this.burst(enemy.x, enemy.y + enemy.h - 8, "#cf9849", 14);
          }
        }
      }
      if (kind === "qi" && this.stats.mastery.kan >= 1) enemy.slow = Math.max(enemy.slow, enemy.kind === "boss" ? .8 : 1.3);
      if (this.stats.mastery.zhen >= 2) enemy.attackCd = Math.max(enemy.attackCd, enemy.kind === "boss" ? .08 : .16);
      if (crit && this.stats.mastery.li >= 2 && enemy.burn > 0) { damage += Math.min(12, enemy.burn * 3); enemy.burn = 0; }
      // 副属性只提供一项轻量增益，不重复触发主属性整套机制。
      if (this.stats.secondary === "fire") enemy.burn = Math.max(enemy.burn, .8);
      else if (this.stats.secondary === "water") enemy.slow = Math.max(enemy.slow, .45);
      else if (this.stats.secondary === "wood" && kind === "slash" && p.healCooldown <= 0) { p.hp = Math.min(this.stats.hpMax, p.hp + 2); p.healCooldown = 2; }
      else if (this.stats.secondary === "metal") damage *= 1.05;
      else if (this.stats.secondary === "earth") enemy.x = clamp(enemy.x + p.face * 7, 40, this.worldWidth - 80);
      if ((this.stats.affixes.seed || 0) && Math.random() < .16) damage += this.stats.affixes.seed;
      if (kind === "slash" && p.flameBuff > 0) { enemy.burn = Math.max(enemy.burn, 2.5); p.flameBuff = 0; }
    }
    if (!dot && enemy.variant === "guard") damage *= .82;
    if ((this.stats.affixes.burst || 0) && enemy.hp / enemy.maxHp < .3) damage *= 1 + this.stats.affixes.burst / 100;
    if (this.lab) this.labMetrics[kind === "lab_burn" ? "burn" : kind === "lab_burst" ? "burst" : "direct"] += damage;
    // Actual damage starts local engagement; an unhit encounter keeps its original notice range.
    if(damage>0&&enemy.kind!=="dummy")enemy.engaged=true;
    enemy.hp -= damage; enemy.hurt = .16; this.burst(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2, crit ? "#fff0a5" : this.element.color, crit ? 12 : 6);
    this.emitBattleEvent("enemy_hit", { element: skillElement || this.stats.primary, target_id: enemy.id, action_id: kind, attack_id: kind === "slash" ? p.attackId : 0,
      phase: "impact", position: [enemy.x + enemy.w / 2, enemy.y + enemy.h / 2], amount: damage, critical: crit, periodic: dot, combo: kind === "slash" ? p.combo : 0 });
    if (!dot) { this.hitStop = Math.max(this.hitStop, .026); this.screenShake = Math.max(this.screenShake, .11); }
    if (enemy.hp <= 0) {
      if (enemy.kind === "dummy") { enemy.hp = enemy.maxHp; return; }
      enemy.dead = true;
      if (this.stats.mastery.dui > 0 || this.stats.affixes.heal) p.hp = Math.min(this.stats.hpMax, p.hp + 3 + this.stats.mastery.dui * 2 + (this.stats.affixes.heal || 0) * .2);
    }
  }

  damagePlayer(amount, sourceX, sourceId = "environment", actionId = "hazard") {
    const p = this.player;
    if (this.finished || p.invuln > 0 || (p.dash > .08 && p.dash <= .2)) return;
    const attackFromFront = Math.sign(sourceX - (p.x + p.w / 2)) === p.face;
    if (p.blocking && attackFromFront) {
      if (p.parryArmed > 0) {
        p.parryArmed = 0; p.invuln = .38; p.blockFlash = .32; p.counterWindow = .7;
        if (p.skillParry) {
          this.enemies.filter(e => !e.dead && Math.abs(e.x - p.x) < 135).slice(0, 3).forEach(e => this.hitEnemy(e, this.stats.attack * .75, false, false, "counter"));
          p.skillParry = false;
        }
        p.qi = Math.min(this.stats.qiMax, p.qi + 8);
        if (this.stats.primary === "metal") this.enemies.filter(e => !e.dead && Math.abs(e.x - p.x) < 100 && Math.sign(e.x + e.w / 2 - p.x - p.w / 2) === p.face).slice(0, 2).forEach(e => this.hitEnemy(e, this.stats.attack * .65, false, false, "counter"));
        if (this.stats.primary === "earth" || this.stats.mastery.gen >= 1) { p.shield = Math.min(18, p.shield + 9); p.shieldTime = 4; }
        if (this.stats.primary === "wood" && p.healCooldown <= 0) { p.hp = Math.min(this.stats.hpMax, p.hp + 5); p.healCooldown = 2; }
        if (this.stats.primary === "fire") p.flameBuff = 3;
        if (this.stats.primary === "water") this.enemies.filter(e => !e.dead && Math.abs(e.x - p.x) < 140).forEach(e => { e.slow = Math.max(e.slow, 1.5); });
        this.screenShake = Math.max(this.screenShake, .16);
        this.emitBattleEvent("player_parried", { source_id: sourceId, target_id: "player", action_id: actionId, element: this.realmKey, phase: "defense", amount });
        this.burst(p.x + p.w / 2, p.y + 30, "#fff0a5", 20); return;
      }
      this.emitBattleEvent("player_blocked", { source_id: sourceId, target_id: "player", action_id: actionId, element: this.realmKey, phase: "defense", amount });
      amount *= 1 - this.stats.block;
    }
    amount = Math.max(1, amount - this.stats.defense);
    if (p.shield > 0) {
      const absorbed = Math.min(p.shield, amount);
      p.shield -= absorbed; amount -= absorbed;
      if (absorbed && p.skillShieldCounter) {
        this.enemies.filter(e => !e.dead && Math.abs(e.x - p.x) < 110).slice(0, 2).forEach(e => this.hitEnemy(e, this.stats.attack * .45, false, false, "counter"));
        p.skillShieldCounter = false;
      }
    }
    if (amount <= 0) return;
    p.hp -= amount; p.invuln = .65; p.vx = sourceX < p.x + p.w / 2 ? 180 : -180; this.burst(p.x + p.w / 2, p.y + 30, "#ef5c45", 10);
    this.screenShake = Math.max(this.screenShake, .2);
    this.skillInput=null;
    p.hurt = .2; p.queuedSlash = 0; p.jumpBuffer = 0; p.slash = 0; p.dash = 0; p.qiCast = 0; p.blocking = false; p.skillGuard = 0; p.skillParry = false;
    this.emitBattleEvent("player_hurt", { source_id: sourceId, target_id: "player", action_id: actionId, element: this.realmKey, phase: "impact", amount });
    if (p.hp <= 0) this.finish(false);
  }

  burst(x, y, color, count) { for (let i = 0; i < count; i++) this.particles.push({ x, y, vx: (Math.random() - .5) * 180, vy: (Math.random() - .5) * 160, life: .25 + Math.random() * .35, color }); }
  overlap(ax, ay, aw, ah, bx, by, bw, bh) { return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by; }

  defeatedIds(){return this.enemies.filter(e=>e.dead).map(e=>e.id);}

  async labRecord(action,extra,onSaved=()=>{}) {
    if(this.labPending||this.labError||this.disposed)return;
    this.labPending=true;this.clearInput();
    try {
      const payload=await globalThis.DaoBladeArrayLabUI.trialAction(action,{trial_id:this.labTrial.id,...extra});
      if(this.disposed)return;
      if(payload.state.active_trial)this.labTrial=JSON.parse(JSON.stringify(payload.state.active_trial));
      onSaved(payload);
    } catch(error) {
      if(!this.disposed){this.labError=true;this.setPause(true);showToast(error.message+"；退出回阵盘重新读取后恢复",true);}
    } finally {this.labPending=false;}
  }

  updateCheckpoint() {
    if(this.labPending||this.labError||this.finished)return;
    if(this.labRun ? this.labTrial.checkpoint : !this.trial || this.trial.activated)return;
    const checkpoint = this.checkpoint, anchor = this.level.anchors[checkpoint.anchor_id];
    if (!checkpoint.cleared_ids.every(id => this.enemies.some(enemy => enemy.id === id && enemy.dead))) return;
    const p = this.player;
    if (!p.onGround || Math.abs(p.x - anchor.x) > 70 || Math.abs(p.y + p.h - anchor.y) > 2) return;
    if(this.labRun){
      void this.labRecord("checkpoint",{defeated_ids:this.defeatedIds()},()=>{
        p.hp=this.stats.hpMax;p.qi=this.stats.qiMax;
        showToast("剑碑已保存：原配珠冻结，失败或刷新可从此续关");
      });return;
    }
    this.trial.activated = true;
    p.hp = this.stats.hpMax; p.qi = this.stats.qiMax;
    this.persistCheckpoint();
    showToast("剑碑已激活：恢复气血与剑意。刷新后可从洞府继续；保存状态见顶部");
  }

  persistCheckpoint() {
    saveData.active_trial = TRIALS.encode(this.trial);
    renderCheckpointRecovery();
    void saveState("");
  }

  canContinueCheckpoint() {
    if(this.labRun)return Boolean(this.finished&&!this.labPending&&!this.labError&&this.lastOutcome==="defeat"&&this.labTrial?.checkpoint&&!this.disposed);
    return Boolean(this.finished && this.lastOutcome === "defeat" && !this.disposed && this.trial?.activated && !this.trial.settled);
  }

  async finish(win) {
    if (this.finished || this.trial?.settled) return;
    this.lastOutcome = win ? "victory" : "defeat";
    if (win && this.trial) this.trial.settled = true;
    this.finished = true;
    this.endBattleEvents(win ? "victory" : "defeat");
    window.removeEventListener("keydown", this.boundKeyDown); window.removeEventListener("keyup", this.boundKeyUp);
    window.removeEventListener("pointerup", this.boundPointerEnd); window.removeEventListener("pointercancel", this.boundPointerEnd);
    window.removeEventListener("blur", this.boundBlur); document.removeEventListener("visibilitychange", this.boundVisibility);
    this.clearInput(); $("#pause-overlay").classList.add("hidden");
    const visual = win ? Promise.resolve(true) : this.defeatVisual();
    if (this.practice) {
      if (await visual && !this.disposed) { activeGame = null; showPanel(this.lab ? "arraylab" : "cultivation"); }
      return;
    }
    if(this.labRun){await this.finishLab(win,visual);return;}
    $("#continue-checkpoint").hidden = !this.canContinueCheckpoint();
    const rewards = [];
    if (win) {
      saveData.active_trial = null;
      saveData.progress.victories += 1; saveData.progress.clears[this.realmKey] += 1; saveData.player.spirit += 12;
      const count = 2 + (Math.random() < .35 ? 1 : 0) + this.altars.filter(altar => altar.taken).length;
      for (let i = 0; i < count && saveData.inventory.length < RULES.config.limits.inventory; i++) {
        const element = Math.random() < .72 ? this.realmKey : randomItem(Object.keys(ELEMENTS));
        const bead = makeBead(element); rewards.push(bead); saveData.inventory.push(bead);
      }
      const evolved = grantBeadExperience(18 + this.stats.mastery.dui * 4);
      $("#result-title").textContent = `${this.element.realm} · 试炼成功`;
      $("#result-message").textContent = evolved.length ? `已镶灵珠获得修为。${evolved.join("、")}完成进化。` : "已镶灵珠获得修为，本命剑进一步成长。";
    } else {
      grantBeadExperience(5);
      $("#result-title").textContent = "道心未折";
      $("#result-message").textContent = this.canContinueCheckpoint()
        ? "剑碑仍在：续关保留原构筑与已领祭坛，后段敌人重置。刷新后可从洞府继续，请确认顶部保存状态。"
        : "本次未能击败守境者，已镶灵珠仍获得少量修为。调整路线后可以再次挑战。";
    }
    $("#reward-list").innerHTML = rewards.length ? rewards.map(bead => `<div class="reward-item" style="${beadStyle(bead)}"><b>${esc(bead.name)}</b><small>${QUALITY[bead.quality].zh} · ${bead.affixes.length}词条</small></div>`).join("") : '<div class="empty-message">本次没有获得新灵珠</div>';
    // 原有奖励和保存仍只执行一次；延迟的仅是结果窗口。
    renderAll();
    renderCheckpointRecovery();
    const [, present] = await Promise.all([saveState(""), visual]);
    if (present && !this.disposed) $("#result-dialog").showModal();
  }

  async finishLab(win,visual=Promise.resolve(true)) {
    this.labPending=true;
    try {
      if(this.labError){await globalThis.DaoBladeArrayLabUI.load(true);this.labError=false;}
      const payload=await globalThis.DaoBladeArrayLabUI.trialAction("settle",{trial_id:this.labTrial.id,win,defeated_ids:this.defeatedIds()});
      if(this.disposed)return;
      this.labTrial=payload.state.active_trial;this.labPending=false;
      $("#result-title").textContent=win?`${this.element.realm} · 阵盘试炼成功`:"阵盘试炼 · 道心未折";
      $("#result-message").textContent=win?`胜利已保存：修为 +${payload.receipt.spirit}，仅有效出战珠成长。返回阵盘可拆换并再次挑战。`:this.labTrial?.checkpoint?"剑碑已保存，原配珠与已领祭坛保留；续关重置后段敌人。失败不发经验。":"本次失败已保存，无经验奖励。返回阵盘调整，或重新挑战。";
      $("#reward-list").innerHTML=win?payload.receipt.xp_awards.map(a=>`<div class="reward-item"><b>${esc(payload.state.beads?.find(b=>b.id===a.id)?.name||a.id)}</b><small>经验 +${a.amount} → Lv${a.level}</small></div>`).join(""):'<div class="empty-message">未获得奖励</div>';
    } catch(error) {
      if(this.disposed)return;
      this.labError=true;this.labPending=false;
      $("#result-title").textContent="结算未确认";
      $("#result-message").textContent=error.message+"；重新挑战按钮会先重读并重试本次结算，服务器按试炼编号去重。也可返回阵盘核对。";
      $("#reward-list").textContent="尚未确认奖励，未在客户端发奖";
    }
    if(await visual&&!this.disposed){$("#continue-checkpoint").hidden=!this.canContinueCheckpoint();$("#result-dialog").showModal();}
  }

  async restartLab() {
    if(this.labPending||this.disposed)return;
    if(this.labError&&this.finished){await this.finishLab(this.lastOutcome==="victory");return;}
    const ui=globalThis.DaoBladeArrayLabUI;
    try {if(this.labError)await ui.load(true);await ui.restartTrial(this.labTrialId);}catch(error){showToast(error.message,true);}
  }

  nearestEnemy() {
    const p=this.player,cx=p.x+p.w/2,cy=p.y+p.h/2;
    let nearest=null,best=Infinity;
    for(const enemy of this.enemies){
      if(enemy.dead)continue;
      const distance=Math.hypot(enemy.x+enemy.w/2-cx,enemy.y+enemy.h/2-cy);
      if(distance<best){nearest=enemy;best=distance;}
    }
    return nearest;
  }

  enemyReadout() {
    const enemy=this.nearestEnemy();if(!enemy)return "敌人已肃清";
    const p=this.player,dx=enemy.x+enemy.w/2-p.x-p.w/2,dy=enemy.y+enemy.h/2-p.y-p.h/2;
    const side=Math.abs(dx)<8?"贴身":dx<0?"左侧":"右侧";
    if(Math.hypot(dx,dy)>600)return `${side}远处有敌人，靠近后观察`;
    const behind=dx*p.face < -8?" · 身后，请转身":"";
    const warnings={dash:"蓄力突进",slash:"准备挥击",fireball:"准备火球",wave:"准备剑波",bolt:"准备远程攻击"};
    const phase=enemy.attackState==="windup"?(warnings[enemy.attackType]||"准备攻击"):
      enemy.attackState==="strike"?"正在出招":enemy.attackState==="recover"?"收招中":enemy.hurt>0?"受击中":"观察中";
    return `近敌 ${enemy.name} · ${side}${behind} · 气血 ${Math.ceil(clamp(enemy.hp,0,enemy.maxHp))}/${enemy.maxHp} · ${phase}`;
  }

  updateHud() {
    if (!this.practice) {
      const objective = globalThis.DaoBladeLevelProgress?.objective(this.realmKey, this.player.x, this.enemies);
      if (objective) $("#objective-text").textContent = objective + (this.labRun ? (this.labTrial?.checkpoint ? " · 剑碑已保存" : " · 前段清场后前往剑碑") : this.trial
        ? this.trial.activated ? " · 剑碑已激活" : " · 前段清场后前往剑碑恢复"
        : "");
    }
    $("#hud-hp").textContent = `${Math.ceil(Math.max(0, this.player.hp))} / ${this.stats.hpMax}`;
    $("#hud-qi").textContent = `${Math.floor(this.player.qi)} / ${this.stats.qiMax}`;
    $("#hud-enemies").textContent = this.enemies.filter(enemy => !enemy.dead).length;
    $("#skill-hud").textContent = this.stats.loadout.active.map((key, index) => `${index ? "E" : "Q"} ${key ? TRIGRAMS[key].skill : "未装备"}${this.player.skillCooldowns[index] > 0 ? ` ${this.player.skillCooldowns[index].toFixed(1)}s` : ""}`).join(" · ");
    $("#enemy-readout").textContent=this.enemyReadout();
    const markedTarget=this.nearestEnemy();
    if (this.lab) $("#skill-hud").textContent = `${this.lab.skill.enabled ? "Q " + (this.lab.skill.focus ? "聚焰" : "离火留痕") + (this.lab.skill.burst ? " · E引爆" : this.lab.skill.cycle ? " · E回火" : "") : "核心未连接 · 技能停用"} · Q ${this.player.skillCooldowns[0].toFixed(1)}s${(this.lab.skill.burst||this.lab.skill.cycle)?" / E "+this.player.skillCooldowns[1].toFixed(1)+"s":""} · 护盾${Math.ceil(this.player.shield)} · 近敌火痕 ${markedTarget?.labMarks || 0}/3 · 直伤${Math.round(this.labMetrics.direct)} / 灼烧${this.labMetrics.burn} / 引爆${this.labMetrics.burst}`;
  }

  draw() {
    const ctx = this.ctx; const camera = this.cameraX; const [dark, light] = this.realm.bg;
    const gradient = ctx.createLinearGradient(0, 0, 0, this.height); gradient.addColorStop(0, dark); gradient.addColorStop(1, light); ctx.fillStyle = gradient; ctx.fillRect(0, 0, this.width, this.height);
    this.drawBackground(ctx, camera);
    ctx.save(); ctx.translate(-camera + (feedback.shake && this.screenShake > 0 ? (Math.random() - .5) * 6 : 0), feedback.shake && this.screenShake > 0 ? (Math.random() - .5) * 4 : 0);
    for (const platform of this.platforms) this.drawPlatform(ctx, platform);
    this.hazards.forEach(hazard => {
      ctx.fillStyle = this.element.color; ctx.globalAlpha = Math.sin(this.elapsed * 3) > .45 ? .78 : .3;
      for (let x = hazard.x; x < hazard.x + hazard.w; x += 15) { ctx.fillRect(x, this.floorY - 8, 9, 8); ctx.fillRect(x + 3, this.floorY - 17, 3, 9); }
      ctx.globalAlpha = 1;
    });
    this.altars.filter(altar => !altar.taken).forEach(altar => {
      ctx.fillStyle = "#6b5436"; ctx.fillRect(altar.x + 4, altar.y + 17, 20, 11);
      ctx.fillStyle = "#dfad4c"; ctx.fillRect(altar.x + 10, altar.y + 2, 8, 15);
      ctx.fillStyle = "#fff0b5"; ctx.fillRect(altar.x + 13, altar.y - 3, 2, 8);
    });
    if (this.trial||this.labRun) {
      const activated=this.labRun?Boolean(this.labTrial?.checkpoint):this.trial.activated;
      const anchor = this.level.anchors[this.checkpoint.anchor_id];
      ctx.fillStyle = activated ? "#f4d576" : "#858991";
      ctx.fillRect(anchor.x + 8, anchor.y - 62, 20, 62);
      ctx.fillRect(anchor.x, anchor.y - 12, 36, 12);
      ctx.font = "14px sans-serif"; ctx.textAlign = "center";
      ctx.fillText(activated ? "剑碑 · 已激活" : "剑碑 · 清除前段守卫", anchor.x + 18, anchor.y - 74);
      ctx.textAlign = "left";
    }
    this.enemies.forEach(enemy => { if (!enemy.dead) this.drawEnemy(ctx, enemy); });
    this.projectiles.forEach(shot => this.drawProjectile(ctx, shot));
    this.skillEffects.forEach(effect => {
      ctx.save(); ctx.globalAlpha = clamp(effect.life * 2, 0, 1); ctx.strokeStyle = effect.color; ctx.lineWidth = 5;
      if (effect.kind === "line") ctx.strokeRect(effect.x - effect.radius, effect.y - 12, effect.radius * 2, 24);
      else { ctx.beginPath(); ctx.arc(effect.x, effect.y, effect.radius * (1.35 - effect.life * .5), 0, Math.PI * 2); ctx.stroke(); }
      ctx.restore();
    });
    this.particles.forEach(particle => { ctx.globalAlpha = clamp(particle.life * 2, 0, 1); ctx.fillStyle = particle.color; ctx.fillRect(Math.round(particle.x), Math.round(particle.y), 4, 4); }); ctx.globalAlpha = 1;
    this.drawPlayer(ctx, this.player);
    this.feedbackLayer?.draw(ctx);
    ctx.restore();
    this.drawMinimap(ctx);
  }

  drawBackground(ctx, camera) {
    ctx.fillStyle = "rgba(5,10,18,.36)";
    for (let i = -1; i < 8; i++) { const x = i * 310 - (camera * .18 % 310); ctx.beginPath(); ctx.moveTo(x, 420); ctx.lineTo(x + 130, 190 - (i % 2) * 55); ctx.lineTo(x + 285, 420); ctx.fill(); }
    ctx.save();
    ctx.globalAlpha = .24;
    for (let i = -1; i < 9; i++) {
      const x = i * 190 - (camera * .35 % 190);
      if (this.realmKey === "metal") {
        ctx.fillStyle = "#8d9aa8"; ctx.fillRect(x + 62, 245, 14, 205); ctx.fillRect(x + 49, 241, 40, 8);
        ctx.fillStyle = "#e7e4d6"; ctx.fillRect(x + 66, 205, 6, 50);
      } else if (this.realmKey === "wood") {
        ctx.fillStyle = "#214a38"; ctx.fillRect(x + 58, 245, 27, 205);
        ctx.fillStyle = "#52be7b"; ctx.fillRect(x + 17, 205, 111, 52); ctx.fillRect(x + 34, 175, 81, 32);
      } else if (this.realmKey === "water") {
        ctx.fillStyle = "#4083a0"; ctx.fillRect(x + 24, 247, 17, 190); ctx.fillRect(x + 105, 247, 17, 190); ctx.fillRect(x + 14, 233, 118, 14);
        ctx.fillStyle = "#8bcce0"; ctx.fillRect(x + 63, 258, 5, 179);
      } else if (this.realmKey === "fire") {
        ctx.fillStyle = "#7e302b"; ctx.fillRect(x + 43, 278, 72, 158); ctx.fillRect(x + 25, 262, 108, 17);
        ctx.fillStyle = "#ef5c45"; ctx.fillRect(x + 52, 305, 55, 9); ctx.fillRect(x + 65, 341, 27, 65);
      } else {
        ctx.fillStyle = "#a48a67"; ctx.fillRect(x + 35, 257, 82, 177); ctx.fillRect(x + 23, 246, 105, 13);
        ctx.fillStyle = "#cf9849"; ctx.fillRect(x + 64, 275, 23, 90);
      }
    }
    ctx.restore();
    ctx.fillStyle = this.element.color; ctx.globalAlpha = .1;
    for (let i = 0; i < 22; i++) ctx.fillRect((i * 173 - camera * .6) % 1250, 135 + (i * 61 % 250), 18, 3);
    ctx.globalAlpha = 1;
  }

  drawPlatform(ctx, platform) {
    ctx.fillStyle = this.realmKey === "wood" ? "#183c2d" : this.realmKey === "water" ? "#183e55" : this.realmKey === "fire" ? "#3b1c1a" : this.realmKey === "earth" ? "#4a3926" : "#323d4b";
    ctx.fillRect(platform.x, platform.y, platform.w, platform.h); ctx.fillStyle = this.element.color; ctx.globalAlpha = .35; ctx.fillRect(platform.x, platform.y, platform.w, 6); ctx.globalAlpha = 1;
    for (let x = platform.x + 12; x < platform.x + platform.w; x += 32) { ctx.fillStyle = "rgba(0,0,0,.22)"; ctx.fillRect(x, platform.y + 18, 14, 6); }
  }

  drawPlayer(ctx, p) {
    const actionState = globalThis.DaoBladeActions?.createActionState(p);
    if (actionState && this.characterArt?.drawState(ctx, actionState, elementColor(this.stats.primary))) {
      const x = Math.round(p.x), y = Math.round(p.y);
      if (p.shield > 0) {
        ctx.strokeStyle = "#dfad4c"; ctx.lineWidth = 3;
        ctx.strokeRect(x - 5, y - 5, p.w + 10, p.h + 10);
      }
      return;
    }
    if (p.hp <= 0 && Number.isFinite(p.deathTime)) {
      // 缺图/模块失败时也展示完整倒地；只变换绘制副本，不移动实体。
      const progress = clamp(p.deathTime / 1.05, 0, 1);
      const eased = progress * progress * (3 - 2 * progress);
      const angle = Math.PI / 2 * eased;
      ctx.save();
      try {
        ctx.translate(Math.round(p.x + p.w / 2), Math.round(p.y + p.h));
        ctx.scale(p.face < 0 ? -1 : 1, 1);
        ctx.translate(8 * progress, (p.deathDrop || 0) - 20 * Math.abs(Math.sin(angle)));
        ctx.rotate(angle);
        this.drawPlayerCanvas(ctx, { ...p, x: -p.w / 2, y: -p.h, face: 1, vx: 0 });
      } finally { ctx.restore(); }
    } else this.drawPlayerCanvas(ctx, p);
  }

  drawPlayerCanvas(ctx, p) {
    const hitFlicker = p.hp > 0 && p.invuln > 0 && Math.floor(p.invuln * 20) % 2;
    const x = Math.round(p.x), y = Math.round(p.y);
    const running = p.onGround && Math.abs(p.vx) > 35;
    const bob = running ? Math.round(Math.sin(p.animTime * 15) * 2) : 0;
    const step = running ? Math.sin(p.animTime * 15) * 4 : 0;
    ctx.fillStyle = "rgba(0,0,0,.35)";
    ctx.fillRect(x - 5, y + p.h - 3, p.w + 14, 6);
    ctx.save();
    if (hitFlicker) ctx.globalAlpha = .38;
    if (p.face < 0) { ctx.translate(x + p.w, y + bob); ctx.scale(-1, 1); } else ctx.translate(x, y + bob);

    // 发带与束发让剪影更接近国风剑客。
    ctx.fillStyle = "#101722"; ctx.fillRect(11, 0, 19, 7); ctx.fillRect(16, -6, 9, 7); ctx.fillRect(7, 5, 25, 8);
    ctx.fillStyle = "#b73e35"; ctx.fillRect(5 - Math.round(Math.abs(p.vx) / 90), 7, 13, 3); ctx.fillRect(1 - Math.round(Math.abs(p.vx) / 65), 11, 17, 3);
    ctx.fillStyle = "#e7c6a5"; ctx.fillRect(12, 12, 17, 16); ctx.fillStyle = "#202a38"; ctx.fillRect(10, 25, 23, 28);
    ctx.fillStyle = "#34465a"; ctx.fillRect(6, 30, 8, 25); ctx.fillRect(29, 29, 8, 25);
    ctx.fillStyle = "#af3f35"; ctx.fillRect(7, 48, 30, 6); ctx.fillStyle = "#dfad4c"; ctx.fillRect(20, 48, 5, 6);
    ctx.fillStyle = "#172230"; ctx.fillRect(9, 54, 26, 8); ctx.fillRect(8 + step, 61, 10, 9); ctx.fillRect(25 - step, 61, 10, 9);
    ctx.fillStyle = "#d4c4a6"; ctx.fillRect(12, 26, 15, 3); ctx.fillRect(20, 29, 3, 10); ctx.fillRect(25, 31, 5, 3);
    ctx.fillStyle = "#b73e35"; ctx.fillRect(11, 50, 25, 3); ctx.fillRect(29, 53, 5, 13);
    ctx.fillStyle = "#dfad4c"; ctx.fillRect(15, 43, 8, 3);
    if (this.stats.primary) { ctx.fillStyle = elementColor(this.stats.primary); ctx.fillRect(16, 42, 5, 5); }
    ctx.fillStyle = elementColor(this.stats.primary); ctx.fillRect(9, 27, 3, 21); ctx.fillRect(32, 29, 3, 17);
    ctx.fillStyle = "#0a0f16"; ctx.fillRect(25, 17, 3, 3);

    if (p.blocking) {
      ctx.save(); ctx.translate(30, 34); ctx.rotate(-.78); ctx.fillStyle = "#dce8ee"; ctx.fillRect(-3, -28, 6, 59); ctx.fillStyle = "#dfad4c"; ctx.fillRect(-8, 17, 16, 5); ctx.restore();
      ctx.strokeStyle = p.blockFlash > 0 ? "#fff0a5" : "rgba(126,196,229,.72)"; ctx.lineWidth = p.blockFlash > 0 ? 6 : 3;
      ctx.beginPath(); ctx.moveTo(50, 11); ctx.lineTo(61, 23); ctx.lineTo(61, 46); ctx.lineTo(50, 58); ctx.lineTo(39, 46); ctx.lineTo(39, 23); ctx.closePath(); ctx.stroke();
      ctx.fillStyle = "rgba(78,178,224,.12)"; ctx.fill();
    } else if (p.slash > 0) {
      const progress = 1 - p.slash / p.slashDuration;
      const start = p.combo === 2 ? 1.65 : p.combo === 3 ? -.15 : -1.25;
      const sweep = p.combo === 2 ? -2.45 : p.combo === 3 ? 3.5 : 2.35;
      const angle = start + sweep * progress;
      ctx.save(); ctx.translate(31, 34); ctx.rotate(angle); ctx.fillStyle = "#dfad4c"; ctx.fillRect(-7, -4, 14, 7); ctx.fillStyle = "#eef5f5"; ctx.fillRect(4, -2, p.combo === 3 ? 63 : 52, 5); ctx.fillStyle = "#91a8b8"; ctx.fillRect(15, 3, 40, 2); ctx.restore();
      ctx.strokeStyle = elementColor(this.stats.primary); ctx.globalAlpha = .25 + Math.sin(progress * Math.PI) * .7; ctx.lineWidth = p.combo === 3 ? 11 : 7; ctx.beginPath();
      if (p.combo === 2) ctx.arc(30, 34, 58, 1.8, -.85, true); else ctx.arc(30, 34, p.combo === 3 ? 70 : 58, -1.35, 1.1); ctx.stroke(); ctx.globalAlpha = 1;
      if (p.combo === 3 && this.stats.primary === "metal") { ctx.fillStyle = "rgba(231,228,214,.58)"; ctx.fillRect(72, 27, 65, 7); }
      if (p.combo === 3 && this.stats.primary === "earth") { ctx.fillStyle = "rgba(207,152,73,.54)"; ctx.fillRect(44, 57, 90, 10); }
    } else if (p.qiCast > 0) {
      ctx.fillStyle = "#dfad4c"; ctx.fillRect(27, 30, 11, 6); ctx.fillStyle = "#eaf7ff"; ctx.fillRect(35, 31, 48, 4);
      ctx.strokeStyle = elementColor(this.stats.primary); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(42, 34, 20 + p.qiCast * 35, 0, Math.PI * 2); ctx.stroke();
      if (p.skillPose) {
        ctx.fillStyle = elementColor(this.stats.primary);
        ctx.fillRect(43, 3, 25, 3); ctx.fillRect(46, 11, 21, 3); ctx.fillRect(48, 19, 17, 3);
        ctx.fillStyle = "#fff4d3"; ctx.fillRect(55, 4, 4, 17);
      }
    } else {
      ctx.save(); ctx.translate(28, 30); ctx.rotate(-.58); ctx.fillStyle = "#dfad4c"; ctx.fillRect(-5, -3, 13, 6); ctx.fillStyle = "#dce8ee"; ctx.fillRect(7, -2, 43, 4); ctx.restore();
    }
    ctx.restore();
    if (p.dash > 0) { ctx.fillStyle = elementColor(this.stats.primary); ctx.globalAlpha = .25; ctx.fillRect(x - p.face * 26, y + 10, p.w, p.h - 18); ctx.globalAlpha = 1; }
    if (p.shield > 0) { ctx.strokeStyle = "#dfad4c"; ctx.lineWidth = 3; ctx.strokeRect(x - 5, y - 5, p.w + 10, p.h + 10); }
  }

  drawEnemy(ctx, enemy) {
    if (enemy.kind === "dummy") {
      const x = Math.round(enemy.x), y = Math.round(enemy.y);
      ctx.fillStyle = "#6b4e35"; ctx.fillRect(x + 15, y + 10, 12, enemy.h - 10);
      ctx.fillStyle = "#bd9060"; ctx.fillRect(x + 5, y + 8, enemy.w - 10, 35);
      ctx.fillStyle = "#e6c390"; ctx.fillRect(x + 10, y + 13, enemy.w - 20, 7);
      ctx.fillStyle = "#ffdb9a"; ctx.fillRect(x + 19, y + 21, 5, 5); return;
    }
    if (this.realmKey === "fire") return this.drawFireEnemy(ctx, enemy);
    const x = Math.round(enemy.x), y = Math.round(enemy.y); ctx.save(); if (enemy.hurt > 0) ctx.globalAlpha = .55;
    if (enemy.attackState === "windup") { ctx.strokeStyle = "#ffe29b"; ctx.lineWidth = 3; ctx.strokeRect(x - 8, y - 7, enemy.w + 16, enemy.h + 14); }
    const body = { metal: "#344051", wood: "#244536", water: "#234e66", earth: "#55402e" }[this.realmKey];
    ctx.fillStyle = body; ctx.fillRect(x + 5, y + 18, enemy.w - 10, enemy.h - 20);
    ctx.fillStyle = this.element.color; ctx.fillRect(x + 3, y + 8, enemy.w - 6, 12);
    ctx.fillStyle = "#111925"; ctx.fillRect(x + 9, y + 15, enemy.w - 18, 6);
    ctx.fillStyle = "#f4e1bb"; ctx.fillRect(x + enemy.w / 2 + enemy.face * 5, y + 24, 5, 5);
    ctx.fillStyle = "#101a22"; ctx.fillRect(x + 7, y + enemy.h - 14, 10, 14); ctx.fillRect(x + enemy.w - 17, y + enemy.h - 14, 10, 14);
    if (enemy.variant === "guard" || enemy.variant === "crusher") { ctx.fillStyle = this.element.color; ctx.fillRect(x - 7, y + 25, 12, 30); ctx.fillRect(x + enemy.w - 5, y + 25, 12, 30); }
    if (enemy.variant === "stalker") { ctx.fillStyle = "#6ed193"; ctx.fillRect(x - 13, y + 29, 17, 5); ctx.fillRect(x + enemy.w, y + 37, 17, 5); }
    if (enemy.variant === "skirmisher") { ctx.fillStyle = "#8ccfe8"; ctx.fillRect(x - 11, y + 41, 13, 5); ctx.fillRect(x + enemy.w - 2, y + 41, 13, 5); }
    if (enemy.kind === "ranged") { ctx.fillStyle = this.element.color; ctx.fillRect(x + enemy.w - 2, y + 29, 16, 5); ctx.fillRect(x + enemy.w + 8, y + 23, 8, 17); }
    if (enemy.kind === "boss") { ctx.fillStyle = "#dfad4c"; ctx.fillRect(x - 9, y + 12, 8, 48); ctx.fillRect(x + enemy.w + 1, y + 12, 8, 48); ctx.fillRect(x + 12, y - 8, enemy.w - 24, 13); }
    ctx.fillStyle = "#08101a"; ctx.fillRect(x, y - 12, enemy.w, 6); ctx.fillStyle = this.element.color; ctx.fillRect(x, y - 12, enemy.w * clamp(enemy.hp / enemy.maxHp, 0, 1), 6); ctx.restore();
  }

  drawFireEnemy(ctx, enemy) {
    const x = Math.round(enemy.x), y = Math.round(enemy.y);
    const striking = enemy.attackState === "strike";
    ctx.save();
    if (enemy.face < 0) { ctx.translate(x + enemy.w, y); ctx.scale(-1, 1); } else ctx.translate(x, y);
    if (enemy.hurt > 0) ctx.globalAlpha = .55;
    if (enemy.attackState === "windup") {
      ctx.fillStyle = "rgba(239,92,69,.18)"; ctx.fillRect(-12, -10, enemy.w + 24, enemy.h + 18);
      ctx.strokeStyle = "#ffb15b"; ctx.lineWidth = 3; ctx.strokeRect(-8, -6, enemy.w + 16, enemy.h + 10);
    }

    if (enemy.variant === "caster") {
      ctx.fillStyle = "#24151d"; ctx.fillRect(8, 23, 28, 35); ctx.fillStyle = "#6d2430"; ctx.fillRect(4, 32, 36, 10);
      ctx.fillStyle = "#f0b36b"; ctx.fillRect(12, 9, 20, 17); ctx.fillStyle = "#4b1823"; ctx.fillRect(8, 5, 28, 8);
      ctx.fillStyle = "#ff6b45"; ctx.fillRect(17, 14, 4, 4); ctx.fillRect(26, 14, 4, 4);
      const orbX = striking ? 55 : 45; ctx.fillStyle = "#ffcf67"; ctx.fillRect(orbX, 25, 10, 10); ctx.fillStyle = "#ef5c45"; ctx.fillRect(orbX + 2, 21, 6, 18);
      ctx.fillStyle = "rgba(239,92,69,.6)"; ctx.fillRect(10, 58, 24, 4);
    } else {
      const boss = enemy.variant === "boss";
      const body = boss ? 52 : enemy.variant === "charger" ? 38 : 34;
      ctx.fillStyle = boss ? "#160f16" : "#21151a"; ctx.fillRect(6, 21, body, enemy.h - 25);
      ctx.fillStyle = boss ? "#b4332d" : enemy.variant === "charger" ? "#8e2e28" : "#5f2428"; ctx.fillRect(3, 27, body + 6, 17); ctx.fillRect(8, 49, body - 4, 9);
      ctx.fillStyle = "#d58a52"; ctx.fillRect(12, 7, body - 12, 17); ctx.fillStyle = "#24131a"; ctx.fillRect(7, 2, body - 2, 9);
      ctx.fillStyle = "#ef5c45"; ctx.fillRect(10, 0, 7, 8); ctx.fillRect(body - 1, 0, 7, 8); ctx.fillStyle = "#ffd16b"; ctx.fillRect(body - 2, 13, 4, 4);
      ctx.fillStyle = "#151018"; ctx.fillRect(8, enemy.h - 13, 12, 13); ctx.fillRect(body - 8, enemy.h - 13, 12, 13);
      ctx.save(); ctx.translate(body, boss ? 45 : 37); ctx.rotate(striking ? .12 : enemy.attackState === "windup" ? -1.05 : -.45);
      ctx.fillStyle = "#e8ddd0"; ctx.fillRect(0, -3, boss ? 74 : 52, boss ? 8 : 6); ctx.fillStyle = "#ff6b45"; ctx.fillRect(boss ? 48 : 34, -2, boss ? 24 : 17, boss ? 5 : 3); ctx.fillStyle = "#d19b47"; ctx.fillRect(-7, -6, 12, 12); ctx.restore();
      if (enemy.variant === "charger") { ctx.fillStyle = "#d44b35"; ctx.fillRect(-6, 31, 13, 6); ctx.fillRect(-12, 37, 19, 5); }
      if (boss) { ctx.fillStyle = "#dfad4c"; ctx.fillRect(-5, 26, 8, 48); ctx.fillRect(body + 6, 26, 8, 48); ctx.fillStyle = "#8f2f2b"; ctx.fillRect(13, 58, 36, 25); }
    }
    ctx.restore();
    ctx.fillStyle = "#08101a"; ctx.fillRect(x, y - 13, enemy.w, 6); ctx.fillStyle = enemy.variant === "boss" ? "#dfad4c" : "#ef5c45"; ctx.fillRect(x, y - 13, enemy.w * clamp(enemy.hp / enemy.maxHp, 0, 1), 6);
  }

  drawProjectile(ctx, shot) {
    const x = Math.round(shot.x), y = Math.round(shot.y); const facing = shot.vx >= 0 ? 1 : -1;
    ctx.save(); ctx.translate(x, y); if (facing < 0) ctx.scale(-1, 1);
    if (shot.type === "swordQi") {
      ctx.globalAlpha = .24; ctx.fillStyle = shot.color; ctx.fillRect(-30, 4, 62, 12); ctx.globalAlpha = 1;
      ctx.fillStyle = "#f4fbff"; ctx.fillRect(2, 7, 43, 5); ctx.fillStyle = shot.color; ctx.fillRect(-10, 4, 47, 3); ctx.fillRect(-20, 15, 50, 3);
      ctx.fillStyle = "rgba(255,255,255,.75)"; ctx.fillRect(-42, 9, 28, 2);
    } else if (shot.type === "fireball") {
      ctx.fillStyle = "rgba(239,92,69,.35)"; ctx.fillRect(-18, 0, 34, 18); ctx.fillStyle = "#ef5c45"; ctx.fillRect(-7, 3, 23, 13); ctx.fillStyle = "#ffcf67"; ctx.fillRect(5, 6, 11, 7); ctx.fillStyle = "#7b2725"; ctx.fillRect(-20, 6, 10, 6);
    } else if (shot.type === "wave") {
      ctx.fillStyle = "#8f2523"; ctx.fillRect(-4, 12, 47, 13); ctx.fillStyle = "#ef5c45"; ctx.fillRect(4, 5, 34, 13); ctx.fillStyle = "#ffb15b"; ctx.fillRect(15, 0, 20, 12);
    } else {
      ctx.fillStyle = shot.color; ctx.fillRect(0, 0, shot.w, shot.h); ctx.fillStyle = "#fff"; ctx.fillRect(shot.w - 5, 3, 5, 5);
    }
    ctx.restore();
  }

  drawMinimap(ctx) {
    const x = 720, y = 18, w = 210; ctx.fillStyle = "rgba(4,9,16,.72)"; ctx.fillRect(x - 8, y - 8, w + 16, 30); ctx.fillStyle = "#405269"; ctx.fillRect(x, y + 5, w, 4);
    ctx.fillStyle = "#f1eadb"; ctx.fillRect(x + this.player.x / this.worldWidth * w - 3, y, 6, 14);
    this.enemies.filter(e => !e.dead).forEach(e => { ctx.fillStyle = e.kind === "boss" ? "#dfad4c" : this.element.color; ctx.fillRect(x + e.x / this.worldWidth * w - 2, y + 3, e.kind === "boss" ? 7 : 4, e.kind === "boss" ? 8 : 5); });
  }
}

function bindUi() {
  $("#result-dialog").addEventListener("cancel", event => event.preventDefault());
  $("#restore-checkpoint").addEventListener("click", restoreCheckpoint);
  $("#account-login").addEventListener("click", () => $("#account-dialog").showModal());
  $("#close-account").addEventListener("click", () => $("#account-dialog").close());
  $("#submit-login").addEventListener("click", () => submitAccount("login"));
  $("#submit-register").addEventListener("click", () => submitAccount("register"));
  $("#account-logout").addEventListener("click", async () => {
    if (activeGame) { activeGame.destroy(); activeGame = null; }
    await saveQueue;
    try {
      const response = await fetch("/api/auth/logout", { method: "POST", headers: { "X-CSRF-Token": csrfToken } });
      if (!response.ok) throw new Error("退出失败，请重试");
      currentUser = null; csrfToken = ""; saveRevision = 0; saveBlocked = false;
      selectedBeadId = null; pendingSocket = null;
      await initializeSession();
      showPanel("sanctuary");
    } catch (error) { showToast(error.message, true); }
  });
  $("#account-import").addEventListener("click", async () => {
    if (!currentUser || !window.confirm("仅当账号没有存档时可以导入游客存档。确定导入吗？")) return;
    try {
      const response = await fetch("/api/auth/import-guest", { method: "POST", headers: { "X-CSRF-Token": csrfToken } });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "导入失败");
      await loadState();
      showToast("游客存档已导入当前账号");
    } catch (error) { showToast(error.message, true); }
  });
  $$(".nav-button").forEach(button => button.addEventListener("click", () => showPanel(button.dataset.panel)));
  $$('[data-go]').forEach(button => button.addEventListener("click", () => showPanel(button.dataset.go)));
  $("#confirm-socket").addEventListener("click", confirmSocket);
  $("#socket-dialog").addEventListener("close", () => { if (!keepSocketPreview) pendingSocket = null; keepSocketPreview = false; });
  $("#preview-practice").addEventListener("click", () => { keepSocketPreview = true; startRealm("fire", { practice: true, state: previewSocketState() }); });
  $("#practice-run").addEventListener("click", () => startRealm("fire", { practice: true, state: previewSocketState() }));
  $("#pause-run").addEventListener("click", () => activeGame?.setPause(!activeGame.pause));
  $("#resume-run").addEventListener("click", () => activeGame?.setPause(false));
  $("#retry-run").addEventListener("click", () => { if(activeGame?.labRun){void activeGame.restartLab();return;} if (activeGame) startRealm(activeGame.realmKey, { practice: activeGame.practice, labCompiled: activeGame.lab, state: activeGame.practice ? previewSocketState() : saveData }); });
  $("#quit-run").addEventListener("click", () => activeGame?.quit());
  $("#leave-run").addEventListener("click", () => activeGame?.quit());
  $("#settings-run").addEventListener("click", () => { renderControls(); $("#settings-dialog").showModal(); });
  $("#shake-toggle").checked = feedback.shake;
  $("#sound-toggle").checked = feedback.sound;
  $("#combat-text-toggle").checked = feedback.combatText;
  for (const [id, key] of [["shake-toggle", "shake"], ["sound-toggle", "sound"], ["combat-text-toggle", "combatText"]]) {
    $(`#${id}`).addEventListener("change", event => {
      feedback[key] = event.target.checked;
      if (key === "sound" && !feedback.sound) battleAudio?.stop();
      if (key === "combatText" && !feedback.combatText) activeGame?.feedbackLayer?.clear();
      localStorage.setItem("daoblade-feedback", JSON.stringify(feedback));
    });
  }
  $("#settings-dialog").addEventListener("close", () => { if (pendingRebindListener) window.removeEventListener("keydown", pendingRebindListener, true); pendingRebindListener = null; });
  $("#close-settings").addEventListener("click", () => $("#settings-dialog").close());
  $("#reset-controls").addEventListener("click", () => { controls = { ...DEFAULT_CONTROLS }; localStorage.setItem("daoblade-controls", JSON.stringify(controls)); renderControls(); });
  $("#return-sanctuary").addEventListener("click", event => {
    event.preventDefault(); $("#result-dialog").close();
    const target=activeGame?.labRun?"arraylab":"sanctuary"; activeGame?.destroy(); activeGame = null; showPanel(target);
  });
  $("#continue-checkpoint").addEventListener("click", continueCheckpoint);
  $("#retry-result").addEventListener("click", event => {
    event.preventDefault(); $("#result-dialog").close();
    if(activeGame?.labRun){void activeGame.restartLab();return;}
    if (activeGame) startRealm(activeGame.realmKey);
  });
  renderControls();
}

bindUi();
initializeSession();
