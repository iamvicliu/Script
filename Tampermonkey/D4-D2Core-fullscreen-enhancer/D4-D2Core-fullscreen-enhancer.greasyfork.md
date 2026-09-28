# 暗黑核-暗黑破坏神4 BD增强

面向暗黑核《暗黑破坏神4》BD 规划器的全屏浏览增强脚本。

## 功能

### 全屏模块切换

- 全屏顶部增加“总览 / 技能 / 巅峰 / 雇佣兵”切换栏。
- 四个模块可以在全屏状态下直接切换，无需反复退出全屏。
- 总览和雇佣兵也可以全屏查看。
- 总览和雇佣兵普通页面增加“全屏”入口。
- 全屏顶部可以直接切换当前 BD 的不同变体。
- 当前模块使用黄色高亮显示。

### 巅峰信息保留

- 巅峰全屏时继续显示底部“面板与雕文”。
- 保留面板编号、名称、雕文图标和镶嵌状态。
- 页面可纵向滚动，方便同时查看巅峰盘和面板信息。

### 操作体验

- 切换模块时使用平滑过渡，避免露出底层页面或连续闪烁。
- 支持点击“退出全屏”返回普通页面。
- 支持按 `Esc` 退出当前全屏。
- 保留技能树、巅峰盘原有的拖动、缩放、搜索和属性统计功能。

## 安装入口

- GitHub 源码及说明：
  `https://github.com/iamvicliu/Script/tree/main/Tampermonkey/D4-D2Core-fullscreen-enhancer`
- GitHub 直装地址：
  `https://raw.githubusercontent.com/iamvicliu/Script/main/Tampermonkey/D4-D2Core-fullscreen-enhancer/D4-D2Core-fullscreen-enhancer.user.js`
- 国内用户可从 Gitee 镜像安装：
  `https://gitee.com/aprilfool/Script/raw/main/Tampermonkey/D4-D2Core-fullscreen-enhancer/D4-D2Core-fullscreen-enhancer.user.js`

## 使用方法

1. 安装并启用脚本，然后刷新暗黑核 BD 规划器页面。
2. 打开任意支持的模块，点击页面中的“全屏”按钮。
3. 使用顶部切换栏查看总览、技能、巅峰或雇佣兵，也可以切换 BD 变体。
4. 点击“退出全屏”或按 `Esc` 返回普通页面。

## 适用页面

```text
https://www.d2core.com/d4/planner*
```

## 说明

- 脚本只调整页面显示，不会修改账号、角色或 BD 数据。
- 如果暗黑核以后改版，部分功能可能需要更新。

## 免责声明

- 本脚本是第三方浏览器页面增强工具，与暗黑核、暴雪娱乐及《暗黑破坏神4》均无官方关联。
- 页面内容及 BD 数据以暗黑核实际显示为准。
