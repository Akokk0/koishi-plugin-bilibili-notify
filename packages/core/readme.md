# Bilibili-Notify

基于 [koishi](../../../../koishijs/koishi) 框架的B站推送插件

---

- koishi-plugin-bilibili-notify [![npm](https://img.shields.io/npm/v/koishi-plugin-bilibili-notify?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-bilibili-notify)
  - [重新订阅](#重新订阅)
  - [功能](#功能)
  - [注意事项](#注意事项)
  - [安装](#安装)
  - [使用方法](#使用方法)
  - [更新日志](#更新日志)
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

## 更新日志

> [!NOTE]
> - ver 1.0.1 修复了一些bug，提供用户自己选择动态检测时间的选项
> - ver 1.0.2 修复时间bug和字体乱码问题
> - ver 1.0.3 修复了一些bug，提供用户自己选择推送卡片字体样式的选项
> - ver 1.0.4 修复了重复推送的bug，提供用户选择推送卡片渲染方式的选项
> - ver 1.0.5 修复了用户非法篡改数据库内容可能导致程序异常运行的bug，修复了UP主开播动态推> 送空白卡片的bug
> - ver 1.0.6 修复了转发动态转发信息出现`undefined`的bug，修复了再次登录订阅显示错误的> bug，优化了动态推送的逻辑
> - ver 1.0.7 修复了在已登录情况下，再次登录会导致重复订阅和提示用户未订阅任何UP主的提示> （实际上已订阅）的bug，新增了订阅对象在控制台的显示，优化了`bili show`指令的逻辑
> - ver 1.0.8 修复了取消订阅的bug
> - ver 1.0.9 更新请求客户端header信息。优化了动态推送卡片的页面布局，增加了字体大小。提供> 用户开放订阅数量限制的选项，提供用户移除推送卡片边框的选项。在控制台页面增加订阅信息提示
> - ver 1.0.10 增加对`onebot`的支持，添加动态关键字屏蔽功能
> - ver 1.0.11 修复了`render`渲染模式下，动态重复推送的问题，修复了没有订阅时，控制台空白> 提示的问题。优化了视频动态缩略图显示不全的问题，优化了部分逻辑。增强容错和增加错误提示
> - ver 1.0.12 提供用户选择动态推送卡片字体增大的选项
> - ver 1.0.13 修复了直播通知卡片连续发三次的bug，修复了多次调用指令 `bili login` 产生> 的bug
> - ver 1.0.14 修复了获取二维码，二维码失效后会多次发送提示的bug，新增对`red`的支持，新增> 开播艾特全体成员功能，优化了部分逻辑
> - ver 1.1.0-alpha.0 修复了直播订阅一段时间过后提示房间不存在的bug，修复了自动登录刷新> 错误的bug
> - ver 1.1.0-beta.0 修复了一个bug(如果本身已经存在乱码问题的情况下，使用page模式仍然会> 乱码)，修复了日志bug
> - ver 1.1.0-rc.0 修复了订阅用户直播一段时间后提示用户直播间不存在并自动取消订阅的bug
> - ver 1.1.0 移除了直播艾特全体成员选项实验性的标志，优化了直播房间号的获取逻辑，移除了部> 分测试代码
> - ver 1.1.1 新增依赖axios
> - ver 1.1.2 修复了对red协议支持的一个bug
> - ver 1.2.0-alpha.0 对自动更新登录信息的功能做了提升，修复了一些bug
> - ver 1.2.0-alpha.1 对推送进行了改进：在开启直播开播艾特全体成员的情况下，发送图片后才> 会艾特全体成员
> - ver 1.2.0-alpha.2 支持QQ群多群推送(实验性)，修复了一些bug
> - ver 1.2.0-alpha.3 修复了指定QQ群订阅时的一个bug
> - ver 1.2.0-alpha.4 对时间获取进行了优化，能够适应不同环境下的时间获取，修复了一些bug
> - ver 1.2.0-alpha.5 修复了与PostgreSQL不兼容的问题，优化了图片推送，增强了推送容错
> - ver 1.2.0-rc.0 现已支持自定义开播和下播提示语(实验性)
> - ver 1.2.0-rc.1 现已支持Telegram平台(实验性)
> - ver 1.2.0-rc.2 添加更多日志输出
> - ver 1.2.0-rc.3 针对Telegram的bug测试版本
> - ver 1.2.0-rc.4 修复了订阅指令的一个bug
> - ver 1.2.0-rc.5 屏蔽动态设置新增是否发送动态被屏蔽消息的选项
> - ver 1.2.0 添加屏蔽转发动态功能，添加发送动态卡片时附带文本信息和动态链接功能，支持订阅> 哔哩哔哩番剧出差
> - ver 1.2.1 现已支持Satori平台(实验性)
> - ver 1.2.2-alpha.0 bug测试
> - ver 1.2.2-beta.0 修复重启koishi后，提示没有任何订阅的bug，新增对chronocat的支持> (实验性)
> - ver 1.2.2-beta.1 现已支持直播开播发送链接(实验性)
> - ver 1.2.2-beta.2 修复了动态推送时图片下方出现空行的情况
> - ver 1.2.3-alpha.0 新增主人账号功能，开启后，会将插件的错误消息向主人账号发送(实验> 性)。修复订阅消息推送失败刷屏的bug
> - ver 1.2.3-beta.0 优化错误推送逻辑，现在只有设置主人账号后才会推送错误消息
> - ver 1.2.3-beta.1 新增指令 `bili private` 方便测试主人账号功能
> - ver 1.2.3-beta.2 功能测试版本，请跳过该版本
> - ver 1.2.3-rc.0 现已支持向机器人加入的所有群发送推送消息(仅支持Q群，实验性)，修复预约> 动态无法正常推送的bug
> - ver 1.2.3-rc.1 修复 `1.2.3-rc.0` 出现的重复推送bug
> - ver 1.2.3-rc.2 bug测试版本，请跳过
> - ver 1.2.3-rc.3 bug测试版本，请跳过
> - ver 1.2.3-rc.4 bug测试版本，请跳过
> - ver 1.2.3-rc.5 修复了第一次使用插件时，扫码登录后没有任何反应，并且仍提示没有登录的> bug
> - ver 1.2.3-rc.6 bug测试版本，请跳过
> - ver 1.2.3-rc.7 尝试修复多群推送时部分群未推送的bug
> - ver 1.2.3-rc.8 修复在 `1.2.3-rc.7` 版本引入的连续推送三次的bug
> - ver 1.2.3-rc.9 完善了插件出错时的日志输出
> - ver 1.2.3-rc.10 修复不能移除边框的bug，对图片布局进行了调整，新增下播消息发送主播头像
> - ver 1.2.3-rc.11 测试版本，请跳过
> - ver 1.2.3 完善主播下播消息发送头像功能，优化控制台订阅信息显示
> - ver 1.2.4 优化了下播消息发送头像图片的质量和插件重启提示
> - ver 1.2.5 修复了在多群订阅的情况下，其中一个群推送失败会导致其余的群全部重新推送的> bug。更换图片处理依赖以解决在插件市场中被标记为不安全插件的问题
> - ver 1.2.6 现在可以随机生成UA，并更新了UA
> - ver 1.2.7 修复不论选择什么渲染模式都是render模式的bug，优化直播卡片推送逻辑
> - ver 1.2.8 修复例如像UP主籽岷使用webp格式的头像，下播通知无法发出的bug
> - ver 1.2.9-alpha.0 bug测试版本，请跳过
> - ver 1.2.10 修复插件启动一段时间后一直报错的问题，更新了UA列表，新增了更多日志输出
> - ver 1.2.11-alpha.0 新增自定义UA的设置。动态推送出错时，现在会直接取消订阅该UP主而不> 是取消订阅动态
> - ver 1.2.11-alpha.1 修复报错 `app TypeError: Cannot read properties of > undefined (reading 'toString')`，添加更多日志输出
> - ver 1.2.12-alpha.0 新增 `sys` 类指令，包括子命令：`start`、`stop`、`restart` > 分别为插件的启动、停止和重启，需要权限等级5才能使用。现在，账号出现某些问题后，不会再清除订> 阅信息，而是停止插件，在排除问题后需要使用指令 `sys start` 手动启动插件。修复一个动态推送> 的bug
> - ver 1.2.12-alpha.1 删除直播推送时的多余空格
> - ver 1.2.12-alpha.2 尝试修复版本 `1.2.12-alpha.0 账号出现某些问题后，不会再清除订> 阅信息` 仍然会清除订阅信息的bug
> - ver 1.2.12-alpha.3 尝试修复订阅时使用 `all` 报错的bug
> - ver 1.2.12 新增动态错误处理
> - ver 1.2.13 现已支持调试模式，目前支持对动态的调试。需要调试模式可在控制台中开启
> - ver 1.2.14 优化调试模式输出，直播推送卡片添加分区信息
> - ver 1.2.15 新增直播推送卡片简介隐藏选项
> - ver 1.2.16 当存储在数据库中的登录信息被篡改时，新增控制台提示
> - ver 1.3.0-alpha.0 对直播推送逻辑进行小型重构，优化了性能。新增功能：定时推送直播卡片> 可选是否发送直播链接；在遇到getMasterInfo()错误时，可切换获取主播信息Api
> - ver 1.3.0-alpha.1 修复bug：发送直播开播通知时，如果在开播语中加入链接，同时开启了推> 送直播卡片发送直播链接，则会发送两条链接
> - ver 1.3.0-rc.0 修复bug：发送直播开播通知时，如果开启了开播发送链接，会在链接末尾添加> 一个false
> - ver 1.3.0 修复bug：渲染动态时，过长的单图会导致渲染错误
> - ver 1.3.1 优化过长单图的显示样式
> - ver 1.3.2 增加对飞书平台的支持
> - ver 1.3.3 新增直播推送人气信息展示
> - ver 1.3.4 新增消息推送失败是否自动重发的选项，修复了一些潜在的bug
> - ver 1.3.5 动态监测循环时间新增20分钟选项
> - ver 1.3.6-alpha.0 修复bug：无限重复的报错提示
> - ver 1.3.6-beta.0 取消出错自动重启插件功能
> - ver 1.3.6-rc.0 修复重启或更新后提示未登录或订阅时提示请登录后再订阅的问题
> - ver 1.3.6 现在基本设置中的userAgent选项为必填项，当因风控订阅失败时会提示更换UA，优> 化直播人气显示
> - ver 1.3.7 新增设置项：插件重启后是否进行直播推送。优化直播人气显示
> 
> - ver 2.0.0-alpha.0 重构：对动态订阅进行了重构，优化了订阅流程
> - ver 2.0.0-alpha.1 修复：无法成功取消订阅自己、用户没有直播间订阅直播出错。对直播订阅> 进行了限制，继承自以前的unlockSubLimits配置项。优化了一些配置项
> - ver 2.0.0-alpha.2 新增：支持Discord平台。优化了下播通知
> - ver 2.0.0-alpha.3 修复：订阅和取消订阅的bug，下播通知的bug
> - ver 2.0.0-alpha.4 修复：初次订阅后不推送动态的bug 优化：下播不再发送链接
> - ver 2.0.0-alpha.5 移除：选项pushUrl，选项platform 新增：选项customLive，主人账> 号中platform选项。支持多平台，且可同时推送不同平台，单个UP主只能推送一个平台
> - ver 2.0.0-alpha.6 修复：直播推送发送失败的bug
> - ver 2.0.0-alpha.7 重构：现已支持同一UP多平台推送
> - ver 2.0.0-alpha.8 新增：重新订阅提示
> - ver 2.0.0-alpha.9 修复：订阅反复提示未加入群组的bug，实际已加入
> - ver 2.0.0-alpha.10 新增：可对每个群聊针对性设置是否艾特全体成员 优化：直播下播通知
> - ver 2.0.0-alpha.11 回档：订阅时可直接接收群号/频道号  修复：直播过程推送消息不成功的> bug
> - ver 2.0.0-alpha.12 更改：开启艾特全体成员后，只有在开播时才艾特全体成员
> - ver 2.0.0-alpha.13 修复：无法对TG群组的特殊频道号进行订阅处理；提示 `您未配置对应平> 台的机器人，不能在该平台进行订阅操作` 仍进行订阅操作
> - ver 2.0.0-alpha.14 修复：订阅TG群组时提示输入无效
> - ver 2.0.0-alpha.15 新增：手动订阅功能  修复：一些潜在的bug
> - ver 2.0.0-alpha.16 优化：手动订阅功能
> - ver 2.0.0-alpha.17 修复：直接订阅当前环境不会推送
> - ver 2.0.0-alpha.18 修复：手动订阅无法推送直播通知；自定义直播中通知语不会发送
> - ver 2.0.0-alpha.19 修复：开播通知后带false；下播通知卡片人气位置显示false
> - ver 2.0.0-alpha.20 修复：直播推送失败 `Error with request send_group_msg`
> - ver 2.0.0-alpha.21 修复：在某些场景下仍会出现 `2.0.0-alpha.19` 和 `2.0.> 0-alpha.20` 版本已修复的问题
> - ver 2.0.0-alpha.22 移除：不需要的服务
> - ver 2.0.0-alpha.23 优化：将艾特全体成员消息单独发送
> 
> - ver 3.0.0-alpha.0 重构：直播  新增：直播弹幕推送到群
> - ver 3.0.0-alpha.1 测试版本
> - ver 3.0.0-alpha.2 修复：只订阅直播也会将该UP主的动态进行推送、推送过的动态过一段时间> 又会再次推送
> - ver 3.0.0-alpha.3 修复：未开启弹幕推送也不会推送直播通知卡片
> - ver 3.0.0-alpha.4 修复：使用了手动订阅，数据库中的订阅不会加载
> - ver 3.0.0-alpha.5 修复：订阅的直播开播后，未开启弹幕推送会一直报错、主播开播推送下播> 卡片，直播时长显示NaN； 新增：直播检测模式选项； 优化：下播卡片内容
> - ver 3.0.0-alpha.6 修复：连续发送两次直播中通知卡片； 优化：下播通知卡片
> - ver 3.0.0-alpha.7 修复：`ver 3.0.0-alpha.5` 未能解决的bug； 优化：ba代码结构
> - ver 3.0.0-alpha.8 修复：开播通知连续发送两次，登录后不会加载手动订阅中的订阅； 优化：> 网络请求报错
> - ver 3.0.0-alpha.9 优化：加强直播推送对获取直播信息的错误处理
> - ver 3.0.0-alpha.10 修复：连续推送两次开播通知
> - ver 3.0.0-alpha.11 新增：直播结束后推送弹幕词云，直播推送上舰消息； 修复：直播推送都> 是同一张画面； 移除：直播推送弹幕消息
> - ver 3.0.0-alpha.12 修复：上一版本无法安装
> - ver 3.0.0-alpha.13 优化：将ESLint替换为Biome； 修复：增加弹幕词云功能产生的bug； > 禁用：弹幕词云功能并不能正常运作，暂时将该功能禁用
> - ver 3.0.0-alpha.14 优化：移除不需要的服务
> - ver 3.0.0-alpha.15 修复：启动插件提示发送群组消息失败、直播推送时间显示为负数(不用再> 特别设置系统时区为UTC+8)
> - ver 3.0.0-alpha.16 重大更新：订阅不再依赖数据库，从指令订阅全面迁移到配置订阅； 修> 复：直播时长有误； 优化：`bili show` 指令更改为 `bili list`
> - ver 3.0.0-alpha.17 新增：更多的提示语变量，开播，当前粉丝数。正在直播，累计观看人数。> 下播，粉丝数变化。选项，新增的提示语变量是否展示到推送卡片中
> - ver 3.0.0-alpha.18 移除：直播检测API模式已被废弃； 优化：更多提示语数据显示优化
> - ver 3.0.0-alpha.19 修复：开播提示语粉丝数单位错误； 优化：订阅配置中所有配置项改为必> 填项
> - ver 3.0.0-alpha.20 优化：订阅配置中开关选项默认为关闭
> - ver 3.0.0-alpha.21 优化：部分代码； 新增：更新插件后，由于机器人还未启动，已开始发送> 消息报错 `this._request is not a function` ，新增报错后自动重新发送消息的功能
> - ver 3.0.0-alpha.22 优化：订阅配置展示优化
> - ver 3.0.0-alpha.23 新增：指令 `bili ll` 可以查看当前订阅直播的UP主们的开播情况
> - ver 3.0.0-alpha.24 新增：配置项，`cardBasePlateColor` 和 > `cardBasePlateBorder`，分别设置卡片底板颜色和底板边框宽度； 优化：部分代码结构
> - ver 3.0.0-alpha.25 修复：输入指令 `bili ll` 时报错 `TypeError: Cannot read > properties of null (reading 'items')`，当某个订阅只订阅动态时无法成功订阅且后续订阅> 都无法加载； 优化：部分代码结构
> - ver 3.0.0-beta.0 移除：配置项 `renderType`，推送卡片渲染模式 `render`，现默认为 > `page` 渲染模式； 优化：部分代码结构
> - ver 3.0.0-beta.1 修复：使用动态屏蔽时，同时开启动态debug模式，当检测到屏蔽动态时会直> 接报错关闭插件； 新增：配置项 `pushImgsInDynamic` 是否推送动态中的图片，默认不开启。开> 启后会单独推送动态中的图片，上舰信息直播间提示
> - ver 3.0.0-beta.2 新增：配置项 `sub.card`，能更改每个订阅的推送卡片样式，未更改的样> 式与全局样式保持一致
> - ver 3.0.0 优化：配置项 `sub.card` 添加实验性标识
> - ver 3.0.1-alpha.0 优化：动态推送逻辑
> - ver 3.0.1-alpha.1 新增：直播提示语换行符，配置项 `sub.name` 为可选项； 修复：> debug模式下动态监测5S一次； 优化：加载订阅
> - ver 3.0.1-alpha.2 优化：改进错误提示，改进订阅加载方式
> - ver 3.0.1 修复：动态推送过程中，如果上一次请求的第一条动态被删除，可能导致动态重复推送> (本次修复并不能完全保障不重复推送，如果第一条和第二条都被删除则可能会出现重复推送)； 新增：> 配置项 `subTimeout` 设置订阅超时时间
> - ver 3.0.2 优化：动态监测，新增依赖服务 `cron`
> - ver 3.0.3 移除：配置项 `dynamicLoopTime` ，动态循环时间将不再可选，默认为两分钟
> - ver 3.0.4 优化：动态监测，增加时间判断，防止出现重复推送问题； 由于 `3.0.2` 动态监测> 定时器更换为cron定时任务，如果需要测试动态监测功能是否正常，可以通过控制台日志输出观察，打> 印 `动态监测初始化完毕！` 后，可进行测试
> - ver 3.0.5-alpha.0 优化：推送卡片渲染，压缩图片； 新增：指令 `bili dyn` 可用于推送> 指定UP主指定动态
> - ver 3.0.5-alpha.1 优化：推送卡片渲染，调整渲染图片格式为 `jpeg`
> - ver 3.0.5-alpha.2 优化：移除多余依赖
> - ver 3.1.0-alpha.0 修复：新插件在第一次订阅时提示 `订阅失败，错误信息：该分组已经存在> `； 移除：消息重发功能； 重构：将消息发送模式改为 `broadcast`
> - ver 3.1.0-alpha.1 修复：无法发送 `@全体成员` 消息，将消息发送模式改回
> - ver 3.1.0 修复：订阅某位UP主直播和动态后，某些群聊只开启推送直播也会推送动态
> - ver 3.1.1-alpha.0 修复：稿件重投后，会将之前日期的动态一起推送； 优化：加强动态debug> 输出； 移除：不必要选项 `live.liveDetectMode`
> - ver 3.1.2-alpha.0 重构：对消息发送模块进行小型重构，多群多平台推送将不再支持艾特全体> 成员，仅单平台单群聊支持； 移除：群聊 `all` 选项
> - ver 3.1.3-alpha.0 移除：订阅超时； 新增：屏蔽专栏动态功能； 优化：改进了加载插件的错> 误提示；
> - ver 3.1.4-alpha.0 修复：动态只推送视频； 优化：动态视频链接将直接发送为视频链接；
> - ver 3.1.5-alpha.0 修复：潜在动态推送bug； 优化：现在动态监测无需等待，当插件初始化完> 成即开始监测、移除多余依赖、移除对 `cron` 服务的依赖、移除选项 `超时订阅`
> - ver 3.1.5-alpha.1 修复：动态不推送的bug；
> - ver 3.1.5-alpha.2 修复：潜在动态推送bug；
> - ver 3.1.5-alpha.3 修复：动态推送时报错：dynamicDetect generateDynamicImg() 推> 送卡片发送失败，原因：Cannot read properties of undefined (reading 'card')；
> - ver 3.1.5 修复：非 `debug` 模式下动态推送，如果在一个监测周期内同一个订阅的up主发送> 多条动态，下一个监测周期会重复推送;
> - ver 3.1.6 修复：视频类动态推送时，发送的视频链接有误；
> - ver 3.1.7-alpha.0 修复：登录账号和订阅账号是同一个账号，动态不会推送，使用 `bili > dyn` 指令，纯文本动态会被跳过； 新增：动态标题；
> - ver 3.1.7-alpha.1 修复：启用自定义卡片样式后取消仍是自定义样式；
> - ver 3.1.7-alpha.2 修复：`liveDetect generateLiveImg() 推送卡片生成失败，原因：> Cannot read properties of undefined (reading 'cardColorStart')`；
> - ver 3.1.7-alpha.3 修复：推送视频类动态报错；
> - ver 3.1.7 修复：第一次使用插件报错 `TypeError: Cannot read properties of > undefined (reading 'dynamic_group_id')`
> - ver 3.2.0-alpha.0 新增：直播检测 `API` 模式； 优化：提升直播检测 `WS` 模式使用体> 验；
> - ver 3.2.0-alpha.1 修复：直播检测 `API` 模式，中途加入推送语无法正确显示直播时长；
> - ver 3.2.0-alpha.2 修复：直播检测 `API` 模式，请求错误优化(防止不停向QQ发送消息)；
> - ver 3.2.0-alpha.3 优化：增加直播检测 `API` 模式轮询时间，防止被暂时风控；
> - ver 3.2.0-alpha.4 修复：直播卡片推送时间会是设置的 `pushTime` 的两倍；
> - ver 3.2.0-alpha.5 修复：直播检测 `WS` 模式下，直播中推送卡片 `累计观看人数` 位置错> 误显示为 `粉丝数变化` 、转发动态的留言文字不显示； 优化：直播检测 `API` 模式下，直播推送> 语 `-watched` 固定显示为 `API模式无法获取`； 
> - ver 3.2.0-alpha.6 优化：调整配置项；
> - ver 3.2.0-alpha.7 修复：自 `3.1.7` 版本 `pushImgsInDynamic` 功能失效；
> - ver 3.2.1-alpha.0 新增：多个相同平台bot可以选择某个群聊/频道指定机器人发送； 优化：> 直播检测 `WS` 模式下播后仍推送、添加依赖 `cacheable-lookup` 优化网络； 修复：打开 > `pushImgsInDynamic` 功能时，如果发送的动态里没有图片则会报错 `TypeError: Cannot > read properties of null (reading 'opus')` 
> - ver 3.2.1-alpha.1 调整：将项目构建产物调整为 `esm`；
> - ver 3.2.1-alpha.2 调整：将项目构建产物调整回 `cjs` 、将依赖 `cacheable-lookup` > 导入方式更改为动态导入；
> - ver 3.2.1-alpha.3 修复：直播检测 `WS` 初始化后自动断开连接；
> - ver 3.2.1-alpha.4 优化：直播监听初始化没有提示；
> - ver 3.2.1-alpha.4 - ver 3.2.1-alpha.8 `deprecate`
> - ver 3.2.1-alpha.9 修复：`bugs`
> - ver 3.2.1-alpha.10 修复：临时切换依赖 `blive-message-listener` 为 `@akokko/> blive-message-listener` 以解决直播检测模式 `WS` 掉线问题、第一次使用插件报错 > `TypeError: Cannot set properties of undefined (setting 'dynamic_group_id')> `；
> - ver 3.2.1-alpha.11 WARNING:测试版本；
> - ver 3.2.1 优化：移除不必要成员变量、创建自动上传npm `github actions`，添加相关开发> 依赖；
> - ver 3.2.2 调整：修改 `github actions`；
> - ver 3.2.3 优化：移除不必要的代码；
> - ver 3.2.4-alpha.0 优化：选项 `pushImgsInDynamic` 发送多图会以转发消息的格式发> 送； 新增：选项 `dynamicVideoUrlToBV` 开启后将链接转换为bv号以用作特殊用途；
> - ver 3.2.4 修复：第一次使用插件时，使用登录指令报错； 插件配置页新增和删除提示信息；
> - ver 3.2.5-alpha.0 优化：新增 `DNS` 缓存，以减少DNS错误；
> - ver 3.2.5-alpha.1 测试版本
> - ver 3.2.5-alpha.2 测试版本
> - ver 3.2.5-alpha.3 更新依赖版本
> - ver 3.2.5-alpha.4 测试版本
> - ver 3.2.5-alpha.5 测试版本
> - ver 3.2.5-alpha.6 测试版本
> - ver 3.2.5-alpha.7 测试版本
> - ver 3.2.5-alpha.8 测试版本
> - ver 3.2.5-alpha.9 测试版本
> - ver 3.2.5-alpha.10 测试版本
> - ver 3.2.5-alpha.11 测试版本
> - ver 3.2.5-alpha.12 测试版本
> - ver 3.2.5-alpha.13 测试版本
> - ver 3.2.5 重构：消息推送逻辑； 新增：选项 `dynamicCron`；
> - ver 3.2.6-alpha.0 优化：更新依赖； 修复：长图动态向下箭头无法显示的bug；
> - ver 3.2.7-alpha.0 优化：将选项 `userAgent` 更改为可选项，在 `cookies` 中添加 `bili_ticket` 降低风控概率；
> - ver 3.2.7-alpha.1 修复：加载 `bili_ticket` 失败会导致插件加载失败；
> - ver 3.2.8-alpha.0 修复：插件重启报错 `RangeError: Invalid time value` ； 新增：选项 `sub.liveMsg` ，可自定义每个UP个性化的直播推送语；
> - ver 3.2.8-alpha.1 修复：直播推送没有推送语；
> - ver 3.2.8-alpha.2 优化：直播推送语中，会换行所有换行符而不是第一个，其余参数仍只会替换第一个

> [!CAUTION]
> - ver 3.2.9-alpha.0 新增：弹幕词云； 不建议更新，目前仅做测试用！
> - ver 3.2.9-alpha.1 修复：弹幕词云显示问题，弹幕过多导致插件爆炸； 不建议更新，目前仅做测试用！
> - ver 3.2.9-alpha.2 修复：`AxiosError: Request failed with status code 404 xxx at async BiliAPI.checkIfTokenNeedRefresh`、潜在cookie相关bug、弹幕词云bug `Error: 生成图片失败！错误: TimeoutError: Navigation timeout of 30000 ms exceeded`
> - ver 3.2.9-alpha.3 修复：词云生成空白
> - ver 3.2.9-alpha.4 修复：弹幕词云bug `Error: 生成图片失败！错误: TimeoutError: Navigation timeout of 30000 ms exceeded`

> [!NOTE]
> - ver 3.2.9-rc.0 优化：弹幕词云生成效果、选项 `pushTime` 设置为0时可关闭该功能； 新增：选项 `wordcloud` 可选择在直播结束后是否生成弹幕词云
> - ver 3.2.9-rc.1 优化：弹幕词云生成效果；
> - ver 3.2.9-rc.2 优化：弹幕词云生成效果；
> - ver 3.2.9-rc.3 优化：弹幕词云生成效果； 新增：直播总结语，开启弹幕词云后自动发送、选项 `liveSummary` 可自定义直播总结语； 修复：一场直播完成后，如果插件中途没有被关闭过，会影响同一位up主下一次直播词云数据；
> - ver 3.2.9-rc.4 优化：弹幕词云生成效果； 新增：直播总结 `-mdn` 变量，代表主播粉丝牌子名
> - ver 3.2.10-alpha.0 新增：指令 `bili cap` 在遇到风控时，可以手动验证解除风控； 优化：错误消息提示；
> - ver 3.2.10-alpha.1 优化：使用指令 `bili cap` 后将对应cookie保存到数据库中、 `bili cap` 提示信息；

> [!CAUTION]
> - ver 3.2.11-alpha.2 测试版本
> - ver 3.2.11-alpha.3 测试版本
> - ver 3.2.11-alpha.4 测试版本
> - ver 3.2.11-alpha.5 测试版本
> - ver 3.2.11-alpha.6 测试版本
> - ver 3.2.11-alpha.7 测试版本
> - ver 3.2.11-alpha.8 测试版本
> - ver 3.2.11-alpha.9 测试版本
> - ver 3.2.11-alpha.10 测试版本
> - ver 3.2.11-alpha.11 测试版本
> - ver 3.2.11-alpha.12 测试版本

> [!NOTE]
> - ver 3.3.0-rc.0 优化：将当前版本的订阅配置移到了新插件：`bilibili-notify-advanced-subscription` ，简化当前版本订阅配置； 新增：配置项 `advancedSub` ，开启后可通过下载插件 `bilibili-notify-advanced-subscription` 配置更自定义化的订阅配置、新增动态@全体成员功能；
> - ver 3.3.1-alpha.0 新增：弹幕词云自定义停用词、UP主弹幕词云开关； 优化：`liveSummary` 排版方式更加直观；
> - ver 3.3.1-alpha.1 优化：拆分 `wordcloud` 和 `liveSummary`，优化指令 `bili cap` 风控验证；
> - ver 3.3.1-rc.0 优化：代码结构，部分设置； 修复：启用高级订阅时，多次重载高级订阅插件会产生多个重复订阅；
> - ver 3.3.1-rc.1 优化：动态错误处理；
> - ver 3.3.1-rc.2 新增：订阅UID项可填写roomid，在目前版本可以极大降低风控概率；
> - ver 3.3.1-rc.3 修复：当订阅用户没有直播且勾选订阅直播间报错；
> - ver 3.3.1 优化：如果不订阅UP主直播且未填写房间号不再请求用户接口；

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