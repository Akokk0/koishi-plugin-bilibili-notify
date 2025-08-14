# Bilibili-Notify

基于 [koishi](../../../../koishijs/koishi) 框架的B站推送插件

---

- koishi-plugin-bilibili-notify [![npm](https://img.shields.io/npm/v/koishi-plugin-bilibili-notify?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-bilibili-notify)
  - [重新订阅](#重新订阅)
  - [功能](#功能)
  - [注意事项](#注意事项)
  - [安装](#安装)
  - [使用方法](#使用方法)
  - [交流群](#交流群)
  - [感谢](#感谢)
  - [License](#License)

## 重新订阅
> [!NOTE]
>由于版本 `2.0.0-alpha.7` 重构了订阅功能，从 `2.0.0-alpha.7` 以前版本升级到以后版本的需重新订阅

## 功能

订阅B站UP主动态

订阅B站UP主直播

## 注意事项

> [!IMPORTANT]
> 0. 由于 `3.0.2` 动态监测定时器更换为cron定时任务，如果需要测试动态监测功能是否正常，可以> 通过控制台日志输出观察，打印 `动态监测初始化完毕！` 后，可进行测试
> 
> 1. 此插件依赖于 `database` 和 `puppeteer` 服务，同时受权限控制，需要具备 > `authority:3` 及以上的权限才能使用本插件提供的指令，你可以参考下方配置登录插件中的方法得> 到一个超级管理员账号（具有 `authority:5` 的最高权限） 
> 
>    [配置登录插件](https://koishi.chat/zh-CN/manual/usage/platform.> html#%E9%85%8D%E7%BD%AE%E7%99%BB%E5%BD%95%E6%8F%92%E4%BB%B6)
> 
> 2. 您还可以安装 `admin` 插件，给其他用户授予权限，操作方法请参考下方的权限管理
> 
>    [权限管理](https://koishi.chat/zh-CN/manual/usage/customize.html)
> 
> 3. 指令使用方法请参考 `help bili`，子命令使用方法请加 `-h` ，例如 `bili login -h`
> 
> 4. 登录方式为二维码，输入命令 `bili login` 之后扫码登录，您的登录凭证将存储在您的本地数据库，并由您自己填写的密钥加密，所以请保管好你的密钥

## 安装

1. 下载插件运行平台 [Koishi](https://koishi.chat/)
2. 在插件平台的 **`插件市场`** 中搜索 **`bilibili-notify`** 并安装

## 使用方法

登录B站：进行任何操作前，请先登录B站

- 使用指令 `bili login` 获取登录二维码，使用B站扫码登录

订阅UP主：订阅你想要推送的UP主

在插件配置中配置需要订阅的UP主

查看目前已订阅的UP主：

- 使用指令 `bili list`

查看目前订阅直播的UP主们的直播情况：

- 使用指令 `bili ll`

推送指定UP主指定动态：

- 使用指令 `bili dyn <uid> [index]`

uid为必填参数，为要推送的UP主的UID，index为可选参数，为要推送的动态排序，不应超过15，不填默认第一条。例如要推送UID为 `233` 的UP主的第九条动态 `bili dyn 233 9`

插件的启动、停止和重启

- 使用指令 `sys`
- 子命令：`start`、`stop`、`restart` 分别代表插件的启动，停止和重启

## 交流群

> [!TIP]
> 801338523 使用问题或bug都可以在群里提出

## 感谢

[koishijs](https://github.com/koishijs/koishi) 感谢官方提供的插件开发框架, 以及技术指导

[blive-message-listener](https://github.com/ddiu8081/blive-message-listener) 感谢 `ddiu8081` 提供简单方便的B站直播监听依赖

[bilibili-API-collect](https://github.com/SocialSisterYi/bilibili-API-collect) 感谢 `SocialSisterYi` 提供B站API参考

[bilibili-dynamic-mirai-plugin](https://github.com/Colter23/bilibili-dynamic-mirai-plugin) 感谢 `Colter23` 提供推送卡片灵感参考

## License

MIT