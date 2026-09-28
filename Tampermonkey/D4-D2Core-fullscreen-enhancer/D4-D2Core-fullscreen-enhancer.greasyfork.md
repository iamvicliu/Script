# D4 D2Core规划器全屏增强

面向 D2Core《暗黑破坏神 IV》BD 规划器的浏览器增强脚本。它保留并增强网站自带的全屏模式，不调用浏览器原生全屏。

## 功能

- 在网站自带的全屏层顶部增加“技能 / 巅峰”切换。
- 可以在全屏状态下直接切换技能和巅峰，并自动进入目标模块自带的全屏模式。
- 巅峰全屏时保留底部“面板与雕文”区域。
- 顶部页签栏保持固定，长内容可以纵向滚动。
- 再次点击页面原有的“全屏”按钮或按 `Esc` 即可退出。
- 不接管网站原有的进入/退出全屏按钮，页面原有的技能树和巅峰盘交互保持不变。

## 安装入口

- GitHub 源码及说明：
  `https://github.com/iamvicliu/Script/tree/main/Tampermonkey/D4-D2Core-fullscreen-enhancer`
- 油猴脚本直装地址：
  `https://raw.githubusercontent.com/iamvicliu/Script/main/Tampermonkey/D4-D2Core-fullscreen-enhancer/D4-D2Core-fullscreen-enhancer.user.js`

## 适用页面

```text
https://www.d2core.com/d4/planner*
```

## 使用方法

1. 安装并启用脚本后刷新 D2Core 规划器页面。
2. 打开“技能”或“巅峰”页签。
3. 点击页面右上角原有的“全屏”按钮。
4. 在全屏顶部直接切换技能或巅峰；巅峰底部可查看面板与雕文。
5. 再次点击“全屏”按钮或按 `Esc` 退出。

## 说明

- 脚本依赖 D2Core 当前页面结构；如果网站后续调整规划器 DOM，可能需要同步更新选择器。
- 脚本只增强网站自带全屏层的布局，不读取、上传或修改账号及 BD 数据，也不调用浏览器原生全屏。

## 免责声明

- 本脚本是第三方浏览器页面增强工具，与 D2Core、暴雪娱乐及《暗黑破坏神 IV》均无官方关联。
- 页面内容及 BD 数据以 D2Core 实际显示为准。
