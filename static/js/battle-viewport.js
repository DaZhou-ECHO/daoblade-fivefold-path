"use strict";
(function(root){
  function calculate(width,height,camera,worldWidth,dpr=1){
    const scale=Math.min(width/960,height/540),w=width/scale,h=height/scale;
    return {scale,w,h,y:(h-540)*.65,camera:Math.max(0,Math.min(Math.max(0,worldWidth-w),camera-(w-960)*.42)),
      pixels:Math.min(2,Math.max(1,dpr)),width,height};
  }
  root.DaoBladeViewport={calculate};if(typeof module!=='undefined')module.exports=root.DaoBladeViewport;
})(globalThis);
