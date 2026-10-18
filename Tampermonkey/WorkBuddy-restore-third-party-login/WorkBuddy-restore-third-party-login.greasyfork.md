# WorkBuddy 恢复第三方登录

WorkBuddy 的登录页有时只显示企业账号和邮箱，原本存在的 Google、GitHub 和 X 登录按钮会被藏起来。这个小工具会把页面里已经有的登录按钮重新显示出来。

它不会创建账号，不会替你登录，也不会修改账号设置。

## 安装

- GitHub 直装地址：
  `https://raw.githubusercontent.com/iamvicliu/Script/main/Tampermonkey/WorkBuddy-restore-third-party-login/WorkBuddy-restore-third-party-login.user.js`

安装前请先装好 Tampermonkey 一类的用户脚本管理器。

## 使用

1. 安装并启用脚本。
2. 打开或刷新 WorkBuddy 登录页。
3. 登录区域会显示 Google、GitHub 和 X 按钮；页面实际支持哪些按钮，就显示哪些。
4. 选择你平时使用的登录方式即可。

## 说明

- 脚本只调整登录页的显示，不读取或保存密码、Cookie、验证码和登录凭证。
- 脚本不会自动点击登录，也不会替你同意任何服务条款。
- 能否登录仍由 WorkBuddy 和对应账号服务决定。如果 WorkBuddy 以后改版，按钮的位置或页面结构变化时，脚本可能需要更新。
- 这是个人维护的页面显示辅助工具，与 WorkBuddy 没有官方关联。
