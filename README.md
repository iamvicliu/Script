# 个人常用工具脚本

这里收集本人平时自用并持续整理的小工具，这些工具均为个人维护，与文中提到的网站、公司或游戏没有官方关联。使用前请先阅读对应说明；涉及账号、订单或支付的操作，请先确认页面和脚本设置。
使用提醒:
- 先阅读对应目录中的说明，再决定是否安装或运行。
- 网页改版后，部分浏览器脚本可能需要跟着更新。
- 脚本不会替你保存密码、验证码或登录凭证。
- 涉及订单、支付、系统配置或网络设置时，请先确认作用范围，并保留可回退的方法。

## Tampermonkey油猴脚本

这一类是 Tampermonkey 用户脚本，用于给已有网页补充更顺手的功能。安装脚本前，需要先安装并启用 Tampermonkey 一类的用户脚本管理器。

### 工具辅助

| 工具 | 用途 | 安装 | 说明 |
| --- | --- | --- | --- |
| WorkBuddy 国际版登录增强 | 恢复 WorkBuddy 国际版登录页原本已有的 Google、GitHub 和 X 登录入口 | [安装](https://raw.githubusercontent.com/iamvicliu/Script/main/Tampermonkey/WorkBuddy-restore-third-party-login/WorkBuddy-restore-third-party-login.user.js) | [说明](Tampermonkey/WorkBuddy-restore-third-party-login/WorkBuddy-restore-third-party-login.greasyfork.md) |
| Offcloud 远程下载切换 | 调整 Offcloud 页面中 Remote 功能的发送对象 | [安装](https://raw.githubusercontent.com/iamvicliu/Script/main/Tampermonkey/Offcloud-Remote-Switch.js) | 个人旧版辅助脚本 |
| Pico 论坛标题整理 | 整理帖子、版块和个人主页的浏览器标题 | [安装](https://raw.githubusercontent.com/iamvicliu/Script/main/Tampermonkey/Pico.js) | 适用于 Pico 论坛 |

### 《流放之路 2》

| 工具 | 用途 | 安装 | 说明 |
| --- | --- | --- | --- |
| PoEDB / POE2DB 多语言助手 | 提供多语言名称显示、三语搜索和复制功能 | [安装](https://raw.githubusercontent.com/iamvicliu/Script/main/Tampermonkey/POE2DB-multilingual-helper.user.js) | 适用于 PoEDB 和 POE2DB |
| POE2 NinjaBD 增强 | 把 poe.ninja 公开角色页的装备、药剂、珠宝和技能整理成便于复制的表格，并支持名称语言切换 | [安装](https://raw.githubusercontent.com/iamvicliu/Script/main/Tampermonkey/POE2-NinjaBD-enhancer/POE2-NinjaBD-enhancer.user.js) | [说明](Tampermonkey/POE2-NinjaBD-enhancer/POE2-NinjaBD-enhancer.greasyfork.md) |
| POE2 WeGameBD 增强 | 把 WeGame BD 分享页的技能信息整理成便于查看、筛选和复制的表格 | [安装](https://raw.githubusercontent.com/iamvicliu/Script/main/Tampermonkey/POE2-WeGameBD-enhancer/POE2-WeGameBD-enhancer.user.js) | [说明](Tampermonkey/POE2-WeGameBD-enhancer/POE2-WeGameBD-enhancer.greasyfork.md) |
| POE2 名称词典 | 保存脚本使用的公开名称对照数据 | [查看](Tampermonkey/POE2-data/poe2-name-dict-v1.json) | 辅助数据，不是独立安装的脚本 |

### 《暗黑破坏神 4》

| 工具 | 用途 | 安装 | 说明 |
| --- | --- | --- | --- |
| 暗黑核 D2Core BD 增强 | 为暗黑核 BD 页面增加全屏浏览、模块切换和变体切换 | [安装](https://raw.githubusercontent.com/iamvicliu/Script/main/Tampermonkey/D4-D2Core-fullscreen-enhancer/D4-D2Core-fullscreen-enhancer.user.js) | [说明](Tampermonkey/D4-D2Core-fullscreen-enhancer/D4-D2Core-fullscreen-enhancer.greasyfork.md) |

### 7881填单辅助

| 工具 | 用途 | 安装 | 说明 |
| --- | --- | --- | --- |
| 7881 购买填单助手 | 按页面默认选项勾选购买协议、安全服务和确认提醒；按脚本设置可继续自动下单或支付 | [安装](https://raw.githubusercontent.com/iamvicliu/Script/main/Tampermonkey/auto-order-form-helper.user.js) | 会改变订单流程，使用前请检查设置 |



## 服务器运维

这一类用于新服务器的初始环境准备。脚本会修改系统软件、时区和网络参数，执行前应先阅读脚本，并确认目标系统与现有配置。

| 文件 | 用途 | 地址 |
| --- | --- | --- |
| VPS 初始化脚本 | 按上述说明执行系统初始化 | [查看脚本](Linux/VPS_Setup.sh) · [下载运行](https://raw.githubusercontent.com/iamvicliu/Script/main/Linux/VPS_Setup.sh) |


