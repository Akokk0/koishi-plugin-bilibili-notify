<div align="center" style="font-size:45px;">
  Bilibili-Notify
</div>

基于 [koishi](../../../../koishijs/koishi) 框架的B站推送插件

---

- **koishi-plugin-bilibili-notify** [![npm](https://img.shields.io/npm/v/koishi-plugin-bilibili-notify?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-bilibili-notify)
  - [功能](#功能)
  - [安装](#安装)
  - [使用方法](#使用方法)
  - [注意事项](#注意事项)
  - [感谢](#感谢)
  - [License](#License)

## 功能

订阅B站UP主动态

订阅B站UP主直播

## 安装

1. 下载插件运行平台 [Koishi](https://koishi.chat/)
2. 在插件平台的 **`插件市场`** 中搜索 **`bilibili-notify`** 并安装

## 使用方法

**登录B站：**进行任何操作前，请先登录B站

- 使用指令 `bili login` 获取登录二维码，使用B站扫码登录

**订阅UP主：**订阅你想要推送的UP主

- 使用指令 `bili sub <uid>` 订阅需要订阅的UP主
- 参数说明：`uid` 为必填参数，为 `up主` 的  `uid` 
- 选项说明：`bili sub <uid>` 有两个选项：-l 和 -d
  - `-l` 为订阅UP主直播间，包括直播开播通知，定时推送直播内容，下播通知
  - `-d` 为订阅UP主动态推送，目前实现推送的动态类型有：普通图文动态，转发动态，直播预约动态

- 例如：
  - `bili sub 1194210119 ` 订阅UID为1194210119的UP主
  - `bili sub 1194210119 -d` 订阅UID为1194210119的UP主动态推送
  - `bili sub 1194210119 -ld` 订阅UID为1194210119的UP主动态推送和直播间
- Tips:
  - 除非使用指令 `bili sub 1194210119 -ld` ，没有加选项或只加了一个选项的指令都会再次询问是否需要订阅另一项。例如：使用指令 `bili sub 1194210119 -d` 机器人会询问是否需要订阅直播间

**取消订阅UP主：**取消订阅不需要推送的UP主

- 使用指令 `bili unsub <uid>` 取消订阅不需要订阅的UP主
- 参数说明：`uid` 为必填参数，为 `up主` 的 `uid`
- 选项说明：`bili unsub <uid>` 有两个选项：-l 和 -d
  - `-l` 为取消订阅UP主直播间
  - `-d` 为取消订阅UP主动态
- 例如：
  - `bili unsub 123456` 取消订阅UID为123456的UP主动态推送和直播间
  - `bili unsub 123456 -d` 取消订阅UID为123456的UP主动态推送
  - `bili unsub 123456 -dl` 取消订阅UID为123456的UP主动态推送和直播间

## 注意事项

1. 此插件依赖于 `database` 和 `puppeteer` 服务，同时受权限控制，需要具备 `authority:3` 及以上的权限才能使用本插件提供的指令，你可以参考下方配置登录插件中的方法得到一个超级管理员账号（具有 `authority:5` 的最高权限） 

   [配置登录插件](https://koishi.chat/zh-CN/manual/usage/platform.html#%E9%85%8D%E7%BD%AE%E7%99%BB%E5%BD%95%E6%8F%92%E4%BB%B6)

2. 您还可以安装 `admin` 插件，给其他用户授予权限，操作方法请参考下方的权限管理

   [权限管理](https://koishi.chat/zh-CN/manual/usage/customize.html)

3. 指令使用方法请参考 `help bili`，子命令使用方法请加 `-h` ，例如 `bili login -h`
4. 登录方式为二维码，输入命令 `bili login` 之后扫码登录，您的登录凭证将存储在您的本地数据库，并由您自己填写的密钥加密，所以请保管好你的密钥

## 感谢

感谢 [koishijs](https://github.com/koishijs/koishi) 官方提供的插件开发框架, 以及技术指导

## License

MIT