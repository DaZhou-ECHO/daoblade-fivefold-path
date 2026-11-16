const {test}=require('node:test'),assert=require('node:assert/strict');
const {calculate}=require('../static/js/battle-viewport.js');
for(const [w,h] of [[1920,1080],[1366,768],[2560,1080],[1280,1024]])test(`048 viewport ${w}x${h} preserves reference field and aspect`,()=>{
  for(const camera of [0,1100,2240]){
    const v=calculate(w,h,camera,3200,3);
    assert.ok(v.w>=960-.001&&v.h>=540-.001);
    assert.ok(Math.abs(v.w*v.scale-w)<.001&&Math.abs(v.h*v.scale-h)<.001);
    assert.ok(v.camera>=0&&v.camera+v.w<=3200+.001);
    assert.equal(v.pixels,2);
    assert.ok(v.y>=0&&v.y+540<=v.h+.001);
  }
});
