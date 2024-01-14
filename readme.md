# koishi-plugin-bilibili-notify

[![npm](https://img.shields.io/npm/v/koishi-plugin-bilibili-notify?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-bilibili-notify)

此插件依赖于"database"和"puppeteer"服务，同时受权限控制，需要具备authority:3及以上的权限才能使用本插件提供的指令，你可以参考下面链接中的方法得到一个超级管理员账号（具有authority:5的最高权限）
https://koishi.chat/zh-CN/manual/usage/platform.html#%E9%85%8D%E7%BD%AE%E7%99%BB%E5%BD%95%E6%8F%92%E4%BB%B6

您还可以安装admin插件，给其他用户授予权限，操作方法请参考下面的链接
https://koishi.chat/zh-CN/manual/usage/customize.html

指令使用方法请参考 help bili，子命令使用方法请加-h，例如bili login -h

本插件功能均建立在B站账号登录之上，所有操作之前请先登录

登录方式为二维码，输入命令bili login之后扫码登录，您的登录凭证将存储在您的本地数据库，并由您自己填写的密钥加密，所以请保管好你的密钥