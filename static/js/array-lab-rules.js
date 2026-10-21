"use strict";
(function(root) {
  const stable = value => JSON.stringify(value, (_key,item) => item && !Array.isArray(item) && typeof item === "object" ? Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])) : item);
  const copy = value => JSON.parse(JSON.stringify(value));
  const freeze = value => {
    if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  };
  function createRuntime(config) {
    if (config.ruleset_id !== "array-lab-v1" || config.rules_version !== 1) throw new Error("试验规则不受支持");
    const cfg = freeze(copy(config));
    function validate(state) {
      if (!state || Object.keys(state).sort().join(",") !== "beads,nodes,rules_version,ruleset_id,schema_version,stage"
        || state.ruleset_id !== cfg.ruleset_id || state.schema_version !== 1 || state.rules_version !== 1 || state.stage !== cfg.stage)
        throw new Error("阵盘试验规则或阶段不受支持");
      if (stable(state.beads) !== stable(cfg.beads)) throw new Error("试验珠身份、等级和经验不能修改");
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
      const enabled=effective.includes("li.core");
      return freeze({ruleset_id:cfg.ruleset_id,used:Object.values(state.nodes).filter(Boolean).length,capacity:cfg.capacity,effective,inactive,
        skill:{enabled,element:enabled?"fire":null,mark:effective.includes("li.mark"),focus:effective.includes("li.focus"),burst:effective.includes("li.burst"),...cfg.skill}});
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
