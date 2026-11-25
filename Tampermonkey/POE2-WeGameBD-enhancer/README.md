# POE2 WeGameBD增强

面向 WeGame《流放之路 2》BD 分享页的浏览器增强脚本。从 WeGame 公开 BD 分享页读取技能信息，在页面下方整理成易于查看、筛选与复制的文字表格，并支持多语言切换。

## 核心功能

### 技能表格化展示

- 在 BD 分享页技能区域下方插入「技能」面板，展示技能名称、类型、等级、品质、孔数、标签与需求。
- 将辅助石与嵌套主动技能统一放入「已插入技能」表格，方便横向对比。
- 按颜色区分主动、被动、精魂及装备赋予技能。
- 支持按技能类型筛选、按原顺序或类型排序，以及一键复制完整技能文本或手动复制。

### 多语言切换

- 支持简体中文（默认）、繁体中文、English 三种技能名称显示切换。
- 繁体与英文名称来自 POE2DB 公开名称数据，仅用于本地显示转换。

## 适用页面

```text
https://www.wegame.com.cn/helper/poe2/#/share/xxxx
```

## 安装入口

1. **安装脚本管理器**：先在浏览器安装 Tampermonkey（油猴）等用户脚本管理器。
2. **选择安装源**：
   - GitHub 一键安装：[点击安装 POE2 WeGameBD增强](https://raw.githubusercontent.com/iamvicliu/Script/main/Tampermonkey/POE2-WeGameBD-enhancer/POE2-WeGameBD-enhancer.user.js)
   - 国内 Gitee 镜像：[点击从 Gitee 安装](https://gitee.com/aprilfool/Script/raw/main/Tampermonkey/POE2-WeGameBD-enhancer/POE2-WeGameBD-enhancer.user.js)（适合国内网络环境）

## 说明与免责声明

- 脚本仅读取 WeGame 公开 BD 分享网页可见信息，不修改游戏、账号、客户端或服务器数据。
- “被动技能”依据永久性、光环、捷等标签识别；仅当公开数据中能明确看到精魂消耗或保留时显示为“精魂技能”。
- 等级达到 20 及以上若页面未标注“最高等级”会自动补充；主动技能品质为空或 `-` 显示为 `品质0%`，被动辅助石无品质时显示 `-`；缺失需求自动隐藏或显示 `-`。
- 个人维护的页面增强工具，以 MIT 协议开源，与 WeGame、腾讯、Grinding Gear Games、Path of Exile 2、POE2DB 均无官方关联；实际数据以 WeGame 页面为准。
