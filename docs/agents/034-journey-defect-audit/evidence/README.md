# 证据范围

- touch-before-375是修前固定单行按钮，最右500px；touch-after-375是初次修按钮换行后的中间测量，不代表最终全部布局。
- viewport-before-tablet-fix记录进一步发现的800×600画布不可见问题；viewport-matrix是最终布局，四视口画布和九按钮在屏内且不互相遮挡。canvas矩形是DOM容器，实际绘图object-fit保留16:9，375/800 PNG已查看。
- portrait-after-375、tablet-800-after为最终CSS实际截图；landscape-667-intermediate仅为迭代中间图，不冒充最终版。
- draft-preserved记录跨宫未保存草稿、禁止开战；final-saved-build记录普通UI恢复并保存原八珠后刷新v58；final-save-audit是事后mode=ro SQLite核对，未写战果。
- screen-buttons-before-checkpoint是第一次清前三敌但未到碑就退出的现场；checkpoint/restored才是真正到碑后刷新保留三敌的证据，均有完整可访问树。
- screen-buttons-defeat是正常首领战败；defeat-continued是按原构筑从剑碑续关。之后正常放弃测试局，没有冒称屏幕按钮全局胜利。
- screen-button-samples有97次可见敌情与普通指针按钮持有采样，跨两次入口尝试/剑碑恢复/失败续关；手动菜单、最初右移和手动撤离未完整采样，不是完整重放。driver仅供CUA REPL，非独立Node程序；后半调整了短转向策略，旧样本反映当时动作。
- pause-before、stale-error-before、stale-resume-before分别是真正修前失败的回归输出；未模拟当前浏览器胜利。首次读取失败重试为本轮新增锁定逻辑的回归防护。
- checks是中间110/183；final-checks是第二轮110/185；release-checks才是包含首次读档重试的最终结果。后续仅文档/证据收尾，不重复跑已验十图。
- 模拟视口与普通鼠标/指针操作不等于真实手机/多指；测试后视口已reset，测试挑战已正常放弃，未上传任何内容。

- 目视复核发现restored截图只抓到背景过渡帧，已标名screen-buttons-restored-capture-invalid.png，不作为恢复证明；恢复以完整restored.txt与当时三敌/剑碑可见状态为证。final-saved-build.png已重新捕获、目视确认v58后保存同一图像字节，避免旧洞府帧冒充结果。
