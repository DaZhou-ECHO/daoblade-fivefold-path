"use strict";
(function(root) {
  const copy = value => JSON.parse(JSON.stringify(value));
  const freeze = value => {
    if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  };
  function createRuntime(config) {
    if (config.ruleset_id !== "array-lab-v1" || config.rules_version !== 2 || config.schema_version !== 2) throw new Error("试验规则不受支持");
    const cfg = freeze(copy(config));
    function validate(state) {
      if (!state || Object.keys(state).sort().join(",") !== "active_trial,beads,nodes,progress,rules_version,ruleset_id,schema_version,stage"
        || state.ruleset_id !== cfg.ruleset_id || state.schema_version !== 2 || state.rules_version !== 2 || state.stage !== cfg.stage)
        throw new Error("阵盘试验规则或阶段不受支持");
      if (!Array.isArray(state.beads)||state.beads.length!==cfg.beads.length) throw new Error("试验珠目录无效");
      for(let i=0;i<state.beads.length;i++) {
        const bead=state.beads[i],seed=cfg.beads[i];
        if(!bead||Object.keys(bead).sort().join(",")!==Object.keys(seed).sort().join(",")||["id","name","element","role"].some(key=>bead[key]!==seed[key])) throw new Error("试验珠身份不能修改或复制");
        if(!Number.isInteger(bead.level)||bead.level<1||bead.level>cfg.growth.max_level||!Number.isInteger(bead.xp)||bead.xp<0||bead.xp>=cfg.growth.xp_per_level||(bead.level===cfg.growth.max_level&&bead.xp!==0)) throw new Error("试验珠等级或经验无效");
      }
      if(!state.progress||Object.keys(state.progress).sort().join(",")!=="runs,spirit,victories"||Object.values(state.progress).some(value=>!Number.isInteger(value)||value<0)) throw new Error("试验成长记录无效");
      if (!state.nodes || Object.keys(state.nodes).sort().join(",") !== cfg.nodes.map(n=>n.id).sort().join(",")) throw new Error("阵盘节点无效");
      const assigned=[];
      for(const node of cfg.nodes) {
        const id=state.nodes[node.id]; if(id===null) continue;
        const bead=state.beads.find(b=>b.id===id);
        if(!bead) throw new Error("试验珠不存在");
        if(node.min_stage>state.stage) throw new Error("当前阶段尚未开放该节点");
        if(bead.element!=="fire") throw new Error("离宫只接受本位火行珠");
        if(bead.role!==node.role) throw new Error("珠子功能与节点不匹配");
        assigned.push(id);
      }
      if(new Set(assigned).size!==assigned.length) throw new Error("同一颗珠不能同时装在两个节点");
      if(assigned.length>cfg.capacity) throw new Error("超过当前阶段容量");
      if(cfg.exclusive.some(group=>group.filter(id=>state.nodes[id]!==null).length>1)) throw new Error("聚焰、引爆和回火分支互斥");
      return state;
    }
    function compile(state) {
      validate(state);
      const effective=[],inactive={};
      for(const node of cfg.nodes) if(state.nodes[node.id]!==null) {
        if(node.parent&&!effective.includes(node.parent)) inactive[node.id]="未连接离火核心";
        else effective.push(node.id);
      }
      const levels=Object.fromEntries(effective.map(id=>[id,state.beads.find(bead=>bead.id===state.nodes[id]).level]));
      const growth=cfg.growth,skill=copy(cfg.skill),bonus=((levels["li.core"]||1)-1)*growth.core_damage_per_level;
      skill.damage+=bonus;skill.focus_damage+=bonus;
      skill.burn_damage+=((levels["li.focus"]||1)-1)*growth.focus_burn_per_level;
      skill.burst_per_mark+=((levels["li.burst"]||1)-1)*growth.burst_per_level;
      skill.qi-=((levels["li.mark"]||1)-1)*growth.mark_qi_reduction_per_level;
      const enabled=effective.includes("li.core");
      return freeze({ruleset_id:cfg.ruleset_id,rules_version:cfg.rules_version,schema_version:cfg.schema_version,used:Object.values(state.nodes).filter(Boolean).length,capacity:cfg.capacity,effective,inactive,
        skill:{enabled,element:enabled?"fire":null,mark:effective.includes("li.mark"),focus:effective.includes("li.focus"),burst:effective.includes("li.burst"),...skill}});
    }
    function equip(state,nodeId,beadId) {
      const next=copy(state); if(!Object.hasOwn(next.nodes,nodeId)) throw new Error("阵盘节点无效");
      next.nodes[nodeId]=beadId; validate(next); return next;
    }
    return Object.freeze({config:cfg,validate,compile,equip});
  }
  const api=Object.freeze({createRuntime});root.DaoBladeArrayLabRules=api;
  if(typeof module!=="undefined"&&module.exports) module.exports=api;
})(typeof globalThis!=="undefined"?globalThis:window);
