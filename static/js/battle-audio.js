"use strict";

(function (root) {
  const profiles = {
    slash_started: { wave: "triangle", from: 340, to: 150, gain: .012, duration: .055, priority: 0 },
    enemy_hit: { wave: "square", from: 180, to: 90, gain: .025, duration: .085, priority: 1 },
    player_blocked: { wave: "triangle", from: 260, to: 130, gain: .018, duration: .075, priority: 2 },
    player_parried: { wave: "triangle", from: 740, to: 420, gain: .025, duration: .085, priority: 3 },
    player_hurt: { wave: "sawtooth", from: 115, to: 60, gain: .018, duration: .09, priority: 2 },
  };

  function createPlayer({ createContext, enabled = () => true }) {
    let context = null, disposed = false;
    const active = new Set(), lastTimes = new Map(), sequences = new Map();
    function release(voice, stop = false) {
      if (voice.closed) return;
      voice.closed = true; active.delete(voice);
      if (stop) { try { voice.oscillator?.stop(); } catch (_) { /* 已结束或未启动。 */ } }
      try { voice.oscillator?.disconnect(); voice.gain?.disconnect(); } catch (_) { /* 可选反馈清理不阻断游戏。 */ }
    }
    function stop() {
      for (const voice of [...active]) release(voice, true);
      lastTimes.clear();
    }
    return Object.freeze({
      get status() { return Object.freeze({ active_voices: active.size, remembered_battles: sequences.size, disposed }); },
      play(event) {
        const profile = Object.hasOwn(profiles, event?.type) ? profiles[event.type] : null;
        if (disposed || !profile || event.periodic || typeof event.battle_id !== "string" || !Number.isInteger(event.sequence)) return false;
        // 同步事件按局内序号前进，静音期间也消费序号，恢复后不补播旧反馈。
        if (event.sequence <= (sequences.get(event.battle_id) || 0)) return false;
        sequences.set(event.battle_id, event.sequence);
        if (sequences.size > 16) sequences.delete(sequences.keys().next().value);
        let voice = null;
        try {
          if (!enabled()) return false;
          context ||= createContext();
          if (!context || context.state === "closed") return false;
          if (context.state !== "running") {
            if (context.resume) Promise.resolve(context.resume()).catch(() => {});
            return false; // 不在暂停的音频时钟上排程，避免稍后恢复时补播旧声音。
          }
          const now = context.currentTime;
          if (now - (lastTimes.get(event.type) ?? -Infinity) < .06) return false;
          if (active.size >= 4) {
            const lower = [...active].find(item => item.priority < profile.priority);
            if (!lower) return false;
            release(lower, true);
          }
          voice = { oscillator: null, gain: null, closed: false, priority: profile.priority };
          voice.oscillator = context.createOscillator();
          voice.gain = context.createGain();
          const oscillator = voice.oscillator, gain = voice.gain;
          oscillator.type = profile.wave;
          oscillator.frequency.setValueAtTime(profile.from, now);
          oscillator.frequency.exponentialRampToValueAtTime(profile.to, now + profile.duration - .01);
          gain.gain.setValueAtTime(profile.gain, now);
          gain.gain.exponentialRampToValueAtTime(.001, now + profile.duration - .005);
          oscillator.connect(gain); gain.connect(context.destination);
          oscillator.onended = () => release(voice);
          active.add(voice);
          oscillator.start(now); oscillator.stop(now + profile.duration);
          lastTimes.set(event.type, now);
          return true;
        } catch (_) {
          if (voice) release(voice, true);
          return false;
        }
      },
      stop,
      dispose() {
        stop(); disposed = true;
        try { if (context?.close) Promise.resolve(context.close()).catch(() => {}); } catch (_) { /* 不影响战斗。 */ }
      },
    });
  }
  const api = Object.freeze({ createPlayer });
  root.DaoBladeBattleAudio = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
