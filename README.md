# 常用小工具

这里收集我平时自用并持续整理的小工具，主要分为浏览器增强、网络规则清单和服务器初始化三类。

这些工具均为个人维护，与文中提到的网站、公司或游戏没有官方关联。使用前请先阅读对应说明；涉及账号、订单或支付的操作，请先确认页面和脚本设置。

表中的“最后更新”按对应文件在 Git 中的最后一次修改日期统计，截至 2026-10-18。

## 浏览器增强

这一类是 Tampermonkey 用户脚本，用于给已有网页补充更顺手的功能。安装脚本前，需要先安装并启用 Tampermonkey 一类的用户脚本管理器。

### 登录与网页

| 工具 | 用途 | 最后更新 | 安装 |
| --- | --- | --- | --- |
| WorkBuddy 国际版登录增强 | 恢复 WorkBuddy 国际版登录页原本已有的 Google、GitHub 和 X 登录入口 | 2026-10-18 | [安装](https://raw.githubusercontent.com/iamvicliu/Script/main/Tampermonkey/WorkBuddy-restore-third-party-login/WorkBuddy-restore-third-party-login.user.js) |
| PoEDB / POE2DB 多语言助手 | 提供多语言名称显示、三语搜索和复制功能 | 2026-07-26 | [安装](https://raw.githubusercontent.com/iamvicliu/Script/main/Tampermonkey/POE2DB-multilingual-helper.user.js) |
| Offcloud 远程下载切换 | 调整 Offcloud 页面中 Remote 功能的发送对象 | 2022-03-19 | [安装](https://raw.githubusercontent.com/iamvicliu/Script/main/Tampermonkey/Offcloud-Remote-Switch.js) |
| Pico 论坛标题整理 | 整理帖子、版块和个人主页的浏览器标题 | 2022-09-27 | [安装](https://raw.githubusercontent.com/iamvicliu/Script/main/Tampermonkey/Pico.js) |

![WorkBuddy 国际版登录页恢复后的 Google、GitHub 和 X 登录按钮](Tampermonkey/WorkBuddy-restore-third-party-login/workbuddy-third-party-login.png)

### 《流放之路 2》BD 整理

| 工具 | 用途 | 最后更新 | 安装 |
| --- | --- | --- | --- |
| POE2 NinjaBD 增强 | 把 poe.ninja 公开角色页的装备、药剂、珠宝和技能整理成便于复制的表格，并支持名称语言切换 | 2026-07-07 | [安装](https://raw.githubusercontent.com/iamvicliu/Script/main/Tampermonkey/POE2-NinjaBD-enhancer/POE2-NinjaBD-enhancer.user.js) |
| POE2 WeGameBD 增强 | 把 WeGame BD 分享页的技能信息整理成便于查看、筛选和复制的表格 | 2026-07-07 | [安装](https://raw.githubusercontent.com/iamvicliu/Script/main/Tampermonkey/POE2-WeGameBD-enhancer/POE2-WeGameBD-enhancer.user.js) |
| POE2 名称词典 | 保存脚本使用的公开名称对照数据 | 2026-07-08 | [查看](Tampermonkey/POE2-data/poe2-name-dict-v1.json) |

### 《暗黑破坏神 4》BD 整理

| 工具 | 用途 | 最后更新 | 安装 |
| --- | --- | --- | --- |
| 暗黑核 D2Core BD 增强 | 为暗黑核 BD 页面增加全屏浏览、模块切换和变体切换 | 2026-09-29 | [安装](https://raw.githubusercontent.com/iamvicliu/Script/main/Tampermonkey/D4-D2Core-fullscreen-enhancer/D4-D2Core-fullscreen-enhancer.user.js) |

### 订单填单辅助

> **注意：** 这个脚本会参与订单确认和支付流程，不属于单纯页面显示调整。使用前必须逐项检查页面选项、金额和最终提交内容；不要在不清楚影响时启用自动下单或支付。

| 工具 | 用途 | 最后更新 | 安装 |
| --- | --- | --- | --- |
| 7881 购买填单助手 | 按页面默认选项勾选购买协议、安全服务和确认提醒；按脚本设置可继续自动下单或支付 | 2026-06-16 | [安装](https://raw.githubusercontent.com/iamvicliu/Script/main/Tampermonkey/auto-order-form-helper.user.js) |

## 网络规则清单

这一类是供代理或分流工具读取的域名清单，不是浏览器脚本。

| 文件 | 内容 | 地址 |
| --- | --- | --- |
| OpenAI 域名清单 | OpenAI 相关域名及其分组标签 | [查看](OpenAI.list) · [订阅原文](https://raw.githubusercontent.com/iamvicliu/Script/main/OpenAI.list) |

个人使用的 Loon 分流规则不放在这个公开仓库中。

## 服务器初始化

这一类用于新服务器的初始环境准备。脚本会修改系统软件、时区和网络参数，执行前应先阅读脚本，并确认目标系统与现有配置。

| 文件 | 用途 | 最后更新 | 地址 |
| --- | --- | --- | --- |
| Debian / Ubuntu 初始化说明 | 安装常用工具、Python 和 Docker，设置时区并启用 BBR | 2026-03-13 | [查看说明](Linux/README.md) |
| VPS 初始化脚本 | 按上述说明执行系统初始化 | 2025-02-04 | [查看脚本](Linux/VPS_Setup.sh) · [下载运行](https://raw.githubusercontent.com/iamvicliu/Script/main/Linux/VPS_Setup.sh) |

## 使用提醒

- 先阅读对应目录中的说明，再决定是否安装或运行。
- 网页改版后，部分浏览器脚本可能需要跟着更新。
- 脚本不会替你保存密码、验证码或登录凭证。
- 涉及订单、支付、系统配置或网络设置时，请先确认作用范围，并保留可回退的方法。
