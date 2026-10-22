const assert = require("node:assert/strict");
const test = require("node:test");
const { createChannel } = require("../static/js/battle-events.js");

test("事件唯一、有序且复制冻结载荷，不能泄漏可变实体", () => {
  const channel = createChannel(), next = createChannel();
  const source = { type:"enemy_hit",time:1,position:[10,20],source_id:"player",target_id:"enemy-1",entity:{hp:100} };
  const event = channel.emit(source);
  source.position[0]=999;
  assert.deepEqual(event.position,[10,20]);
  assert.equal(event.entity,undefined);
  assert.ok(Object.isFrozen(event)); assert.ok(Object.isFrozen(event.position));
  const second = channel.emit({type:"slash_started"});
  assert.equal(second.sequence,event.sequence+1);
  assert.notEqual(event.id,second.id); assert.notEqual(next.id,channel.id);
});

test("失败监听隔离，解除订阅和关闭后不调用，历史有界", () => {
  const channel=createChannel(); let count=0;
  channel.subscribe(()=>{throw new Error("反馈故障");});
  const unsubscribe=channel.subscribe(()=>count++);
  for(let i=0;i<100;i++) channel.emit({type:"enemy_hit"});
  assert.equal(count,100); assert.equal(channel.failure_count,100);
  assert.equal(channel.recent.length,64); assert.equal(channel.recent[0].sequence,37);
  assert.ok(Object.isFrozen(channel.recent));
  unsubscribe(); channel.emit({type:"slash_started"}); assert.equal(count,100);
  channel.close();
  assert.equal(channel.emit({type:"enemy_hit"}),null);
  channel.subscribe(()=>count++);
  assert.equal(count,100);
});
