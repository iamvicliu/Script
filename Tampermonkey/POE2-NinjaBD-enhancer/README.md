# POE2 NinjaBD增强

面向 poe.ninja《流放之路 2》BD 角色页的浏览器增强脚本。将公开角色页里的装备、药剂、珠宝和技能整理成可复制的表格，并支持 English、简体中文、繁体中文名称切换，方便抄作业时对照国际服与国服名称。

## 核心功能

### BD 信息表格化展示

- 在 poe.ninja POE2 角色页底部插入「BD信息」面板，将装备、药剂、珠宝整理成可复制的表格。
- 装备展示包含部位、名称、稀有度、属性/需求、插槽内容与词缀（列表形式便于逐条查看），按武器、副手、防具、首饰、腰带、药剂/咒符排序。
- 技能以卡片与表格展示（含名称、类型、等级、品质、孔数、标签、需求及 DPS）；辅助石、血脉辅助与嵌套主动技能统一整理进「已插入技能」表格。
- 支持按技能类型筛选，按原顺序或类型排序，并支持一键复制完整文字或手动选中复制。

### 多语言名称对照

- 支持 English（默认）、简体中文、繁体中文三种显示切换。
- 简体与繁体名称源自 POE2DB 公开名称数据，仅作本地显示对照；传奇装备、技能、辅助石等固定名称可跨服对照，稀有装备保留原随机名，并对常见属性、需求、稀有度和词缀做基础中文化。

### 镜像站支持

- 默认支持 `poe.ninja`、`poe.show`、`ninja.710421059.xyz`，也可在油猴菜单中添加其他镜像站域名。

## 适用页面

```text
https://poe.ninja/poe2/builds/<league>/character/<account>/<character>
https://poe.ninja/poe2/profile/<account>/<league>/character/<character>
```

保留类似路径的镜像站也可通过油猴脚本菜单添加域名后启用。

## 安装入口

1. **安装脚本管理器**：先在浏览器安装 Tampermonkey（油猴）等用户脚本管理器。
2. **选择安装源**：
   - GitHub 一键安装：[点击安装 POE2 NinjaBD增强](https://raw.githubusercontent.com/iamvicliu/Script/main/Tampermonkey/POE2-NinjaBD-enhancer/POE2-NinjaBD-enhancer.user.js)
   - 国内 Gitee 镜像：[点击从 Gitee 安装](https://gitee.com/aprilfool/Script/raw/main/Tampermonkey/POE2-NinjaBD-enhancer/POE2-NinjaBD-enhancer.user.js)（适合国内网络环境）

## 说明与免责声明

- 脚本只读取 poe.ninja 公开角色页可见信息，不修改或写入任何游戏、账号、客户端或网站数据。
- “被动技能”依据永久性、光环、捷、Buff 等标签识别；仅在公开数据中明确看到精魂消耗或保留时才标记为“精魂技能”；缺失字段会隐藏或显示 `-`。
- 个人维护的页面增强工具，以 MIT 协议开源，与 poe.ninja、Grinding Gear Games、Path of Exile 2、POE2DB 均无官方关联；实际数据以 poe.ninja 页面为准。
