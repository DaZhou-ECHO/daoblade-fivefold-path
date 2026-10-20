# 005 浏览器验收

2026-10-21，使用项目隔离Flask服务127.0.0.1:5064，未使用正式存档。

工具viewport覆盖返回成功但实际innerWidth仍1280，因此采用**同源800px iframe**验证响应式触屏按钮。跨源iframe在本工具中无法点击，同源可操作。

复现：临时创建static/touch-harness-local.html，内容如下；启动Flask，打开/static/touch-harness-local.html，进入八卦修行→练功场。完成后删除临时文件，不纳入正式产品。

```html
<!doctype html><meta charset="utf-8"><title>本地800px触控验收</title>
<style>body{margin:0;background:#162030}iframe{width:800px;height:900px;border:0}</style>
<iframe title="800px实际游戏" src="/"></iframe>
```

实际操作：从右方向按钮中心按下并拖动到按钮外空白处，再松手。角色确实向右移动；松手后停止，后续观察不再持续前进。两张截图记录结束及后续稳定状态。另点击格挡按钮，释放后恢复普通持剑。

这是桌面浏览器鼠标指针操作响应式控件，不是手机真机/多指实测。多指、取消、捕获丢失和键盘混合来源由Node回归验证。
