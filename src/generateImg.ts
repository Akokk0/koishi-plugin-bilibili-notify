/* eslint-disable @typescript-eslint/no-explicit-any */
import { Context, Schema, Service } from "koishi";
import { } from 'koishi-plugin-puppeteer'
import { resolve } from "path";
import { pathToFileURL } from "url";

declare module 'koishi' {
    interface Context {
        gi: GenerateImg
    }
}

// 动态类型
const DYNAMIC_TYPE_NONE = 'DYNAMIC_TYPE_NONE'
const DYNAMIC_TYPE_FORWARD = 'DYNAMIC_TYPE_FORWARD'
const DYNAMIC_TYPE_AV = 'DYNAMIC_TYPE_AV'
const DYNAMIC_TYPE_PGC = 'DYNAMIC_TYPE_PGC'
const DYNAMIC_TYPE_COURSES = 'DYNAMIC_TYPE_COURSES'
const DYNAMIC_TYPE_WORD = 'DYNAMIC_TYPE_WORD'
const DYNAMIC_TYPE_DRAW = 'DYNAMIC_TYPE_DRAW'
const DYNAMIC_TYPE_ARTICLE = 'DYNAMIC_TYPE_ARTICLE'
const DYNAMIC_TYPE_MUSIC = 'DYNAMIC_TYPE_MUSIC'
const DYNAMIC_TYPE_COMMON_SQUARE = 'DYNAMIC_TYPE_COMMON_SQUARE'
const DYNAMIC_TYPE_COMMON_VERTICAL = 'DYNAMIC_TYPE_COMMON_VERTICAL'
const DYNAMIC_TYPE_LIVE = 'DYNAMIC_TYPE_LIVE'
const DYNAMIC_TYPE_MEDIALIST = 'DYNAMIC_TYPE_MEDIALIST'
const DYNAMIC_TYPE_COURSES_SEASON = 'DYNAMIC_TYPE_COURSES_SEASON'
const DYNAMIC_TYPE_COURSES_BATCH = 'DYNAMIC_TYPE_COURSES_BATCH'
const DYNAMIC_TYPE_AD = 'DYNAMIC_TYPE_AD'
const DYNAMIC_TYPE_APPLET = 'DYNAMIC_TYPE_APPLET'
const DYNAMIC_TYPE_SUBSCRIPTION = 'DYNAMIC_TYPE_SUBSCRIPTION'
const DYNAMIC_TYPE_LIVE_RCMD = 'DYNAMIC_TYPE_LIVE_RCMD'
const DYNAMIC_TYPE_BANNER = 'DYNAMIC_TYPE_BANNER'
const DYNAMIC_TYPE_UGC_SEASON = 'DYNAMIC_TYPE_UGC_SEASON'
const DYNAMIC_TYPE_SUBSCRIPTION_NEW = 'DYNAMIC_TYPE_SUBSCRIPTION_NEW'
// 内容卡片类型
/* const ADDITIONAL_TYPE_NONE = 'ADDITIONAL_TYPE_NONE'
const ADDITIONAL_TYPE_PGC = 'ADDITIONAL_TYPE_PGC'
const ADDITIONAL_TYPE_GOODS = 'ADDITIONAL_TYPE_GOODS'
const ADDITIONAL_TYPE_VOTE = 'ADDITIONAL_TYPE_VOTE'
const ADDITIONAL_TYPE_COMMON = 'ADDITIONAL_TYPE_COMMON'
const ADDITIONAL_TYPE_MATCH = 'ADDITIONAL_TYPE_MATCH'
const ADDITIONAL_TYPE_UP_RCMD = 'ADDITIONAL_TYPE_UP_RCMD'
const ADDITIONAL_TYPE_UGC = 'ADDITIONAL_TYPE_UGC' */
const ADDITIONAL_TYPE_RESERVE = 'ADDITIONAL_TYPE_RESERVE'

class GenerateImg extends Service {
    static inject = ['puppeteer', 'ba']
    giConfig: GenerateImg.Config

    constructor(ctx: Context, config: GenerateImg.Config) {
        super(ctx, 'gi')
        this.giConfig = config
    }

    async generateLiveImg(data: any, username: string, userface: string, liveStatus: number /*0未开播 1刚开播 2已开播 3停止直播*/) {
        const [titleStatus, liveTime, cover] = await this.getLiveStatus(data.live_time, liveStatus)
        // 加载字体
        const fontURL = pathToFileURL(resolve(__dirname, 'font/HYZhengYuan-75W.ttf'))
        // 卡片内容
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>直播通知</title>
                <style>
                    @font-face {
                        font-family: "Custom Font";
                        src: url(${fontURL});
                    }

                    * {
                        margin: 0;
                        padding: 0;
                        box-sizing: border-box;
                        font-family: "${this.giConfig.font}", "Custom Font", "Microsoft YaHei", "Source Han Sans", "Noto Sans CJK", sans-serif;
                    }
        
                    html {
                        width: 800px;
                        height: auto;
                    }
        
                    .background {
                        width: 100%;
                        height: auto;
                        padding: 15px;
                        background: linear-gradient(to right bottom, ${this.giConfig.cardColorStart}, ${this.giConfig.cardColorEnd});
                        overflow: hidden;
                    }
        
                    .base-plate {
                        width: 100%;
                        height: auto;
                        box-shadow: 0 4px 8px 0 rgba(0, 0, 0, 0.2);
                        padding: 15px;
                        border-radius: 10px;
                        background-color: #FFF5EE;
                    }
        
                    .card {
                        width: 100%;
                        height: auto;
                        border-radius: 5px;
                        padding: 15px;
                        overflow: hidden;
                        background-color: #fff;
                    }

                    .card img {
                        border-radius: 5px 5px 0 0;
                        max-width: 100%;
                        /* 设置最大宽度为容器宽度的100% */
                        max-height: 80%;
                        /* 设置最大高度为容器高度的90% */
                    }

                    .card-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-top: 5px;
                        margin-bottom: 10px;
                    }

                    .card-title {
                        line-height: 50px;
                    }

                    .card-body {
                        padding: 2px 16px;
                        margin-bottom: 10px;
                    }

                    .live-broadcast-info {
                        display: flex;
                        align-items: center;
                        margin-bottom: 10px;
                    }

                    .anchor-avatar {
                        width: 50px;
                        /* 主播头像大小 */
                        height: auto;
                        box-shadow: 0 4px 8px 0 rgba(0, 0, 0, 0.2);
                    }

                    .broadcast-message {
                        display: inline-block;
                        margin-left: 10px;
                        font-size: 20px;
                        color: #333;
                    }

                    .card-text {
                        color: grey;
                        font-size: 20px;
                    }

                    .card-link {
                        display: flex;
                        justify-content: space-between;
                        text-decoration: none;
                        font-size: 20px;
                        margin-top: 10px;
                        margin-bottom: 10px;
                    }
                </style>
            </head>
            <body>
                <div class="background">
                    <div ${this.giConfig.removeBorder ? '' : 'class="base-plate"'}>
                        <div class="card">
                            <img src="${cover ? data.user_cover : data.keyframe}"
                            alt="封面">
                            <div class="card-body">
                                <div class="card-header">
                                    <h1 class="card-title">${data.title}</h1>
                                    <div class="live-broadcast-info">
                                        <!-- 主播头像 -->
                                        <img style="border-radius: 10px; margin-left: 10px" class="anchor-avatar"
                                            src="${userface}" alt="主播头像">
                                        <span class="broadcast-message">${username}${titleStatus}</span>
                                    </div>
                                </div>
                                ${this.giConfig.hideDesc ? '' : `<p class="card-text">${data.description ? data.description : '这个主播很懒，什么都简介都没写'}</p>`}
                                <p class="card-link">
                                    <span>人气：${data.online > 10000 ? `${(data.online / 10000).toFixed(1)}万` : data.online}</span>
                                    <span>分区名称：${data.area_name}</span>
                                </p>
                                <p class="card-link">
                                    <span>${liveTime}</span>
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </body>
            </html>
        `
        // 多次尝试生成图片
        const attempts = 3
        for (let i = 0; i < attempts; i++) {
            try {
                // 判断渲染方式
                if (this.giConfig.renderType) { // 为1则为真，进入page模式
                    const htmlPath = 'file://' + __dirname.replaceAll('\\', '/') + '/page/0.html';
                    const page = await this.ctx.puppeteer.page()
                    await page.goto(htmlPath)
                    await page.setContent(html, { waitUntil: 'networkidle0' })
                    const elementHandle = await page.$('html')
                    const boundingBox = await elementHandle.boundingBox()
                    const buffer = await page.screenshot({
                        type: 'png',
                        clip: {
                            x: boundingBox.x,
                            y: boundingBox.y,
                            width: boundingBox.width,
                            height: boundingBox.height
                        }
                    })
                    await elementHandle.dispose();
                    await page.close()
                    return { buffer }
                }
                // 使用render模式渲染
                const pic = await this.ctx.puppeteer.render(html)
                return { pic }
            } catch (e) {
                if (i === attempts - 1) { // 已尝试三次
                    throw new Error('生成图片失败！错误: ' + e.toString())
                }
            }
        }
    }

    async generateDynamicImg(data: any) {
        // module_author
        const module_author = data.modules.module_author
        const avatarUrl = module_author.face
        const upName = module_author.name
        let pubTime = this.unixTimestampToString(module_author.pub_ts)
        // dynamicCard
        let dynamicCardUrl: string
        let dynamicCardId: number
        let dynamicCardColor: string
        if (module_author.decorate) {
            dynamicCardUrl = module_author.decorate.card_url
            dynamicCardId = module_author.decorate.fan.num_str
            dynamicCardColor = module_author.decorate.fan.color
        }
        // module_stat
        const module_stat = data.modules.module_stat
        const comment = module_stat.comment.count
        const forward = module_stat.forward.count
        const like = module_stat.like.count
        // TOPIC
        const topic = data.modules.module_dynamic.topic ? data.modules.module_dynamic.topic.name : ''

        const getDynamicMajor = async (dynamicMajorData: any, forward: boolean): Promise<[string, string, string?]> => {
            // 定义返回值
            let main: string = ''
            let link: string = ''
            // 定义forward类型返回值
            let forwardInfo: string

            // 最基本的图文处理
            const basicDynamic = () => {
                const module_dynamic = dynamicMajorData.modules.module_dynamic
                if (module_dynamic.desc) {
                    const richText = module_dynamic.desc.rich_text_nodes.reduce((accumulator, currentValue) => {
                        if (currentValue.emoji) {
                            return accumulator + `<img style="width:28px; height:28px;" src="${currentValue.emoji.icon_url}"/>`
                        } else {
                            return accumulator + currentValue.text
                        }
                    }, '');
                    // 关键字和正则屏蔽
                    if (this.giConfig.filter.enable) { // 开启动态屏蔽功能
                        if (this.giConfig.filter.regex) { // 正则屏蔽
                            const reg = new RegExp(this.giConfig.filter.regex)
                            if (reg.test(richText)) throw new Error('出现关键词，屏蔽该动态')
                        }
                        if (this.giConfig.filter.keywords.length !== 0 &&
                            this.giConfig.filter.keywords
                                .some(keyword => richText.includes(keyword))) {
                            throw new Error('出现关键词，屏蔽该动态')
                        }
                    }
                    // 查找\n
                    const text = richText.replace(/\n/g, '<br>');
                    // 拼接字符串
                    if (text) {
                        main += `
                            <div class="card-details">
                                ${text}
                            </div>
                        `
                    }
                }

                // 图片
                let major: string = ''
                const arrowImg = pathToFileURL(resolve(__dirname, 'img/arrow.png'))

                if (module_dynamic.major && module_dynamic.major.draw) {
                    if (module_dynamic.major.draw.items.length === 1) {
                        const height = module_dynamic.major.draw.items[0].height
                        console.log(height);
                        if (height > 3000) {
                            major += `
                                <div class="single-photo-container">
                                    <img class="single-photo-item" src="${module_dynamic.major.draw.items[0].src}"/>
                                    <div class="single-photo-mask">
                                        <span class="single-photo-mask-text">点击链接浏览全部</span>
                                    </div>
                                    <img class="single-photo-mask-arrow" src="${arrowImg}"/>
                                </div>
                            `
                        } else {
                            major += `
                                <div class="single-photo-container">
                                    <img class="single-photo-item" src="${module_dynamic.major.draw.items[0].src}"/>
                                </div>
                            `
                        }
                    } else if (module_dynamic.major.draw.items.length === 4) {
                        major += module_dynamic.major.draw.items.reduce((acc, cV) => {
                            return acc + `<img class="four-photo-item" src="${cV.src}"/>`
                        }, '')
                    } else {
                        major += module_dynamic.major.draw.items.reduce((acc, cV) => {
                            return acc + `<img class="photo-item" src="${cV.src}"/>`
                        }, '')
                    }

                    main += `
                        <div class="card-major">
                            ${major}
                        </div>
                        `
                }
            }

            // 判断动态类型
            switch (dynamicMajorData.type) {
                case DYNAMIC_TYPE_WORD:
                case DYNAMIC_TYPE_DRAW:
                case DYNAMIC_TYPE_FORWARD: {
                    // DYNAMIC_TYPE_DRAW 带图动态 DYNAMIC_TYPE_WORD 文字动态 DYNAMIC_TYPE_FORWARD 转发动态
                    basicDynamic()
                    // 转发动态
                    if (dynamicMajorData.type === DYNAMIC_TYPE_FORWARD) {
                        //转发动态屏蔽
                        if (this.giConfig.filter.enable && this.giConfig.filter.forward) {
                            throw new Error('已屏蔽转发动态')
                        }
                        // User info
                        const forward_module_author = dynamicMajorData.orig.modules.module_author
                        const forwardUserAvatarUrl = forward_module_author.face
                        const forwardUserName = forward_module_author.name
                        // 获取转发的动态
                        // eslint-disable-next-line @typescript-eslint/no-unused-vars
                        const [forwardMain, _, forwardInfo] = await getDynamicMajor(dynamicMajorData.orig, true)
                        // 拼接main
                        main += `
                        <div class="card-forward">
                            <div class="forward-userinfo">
                                <img class="forward-avatar" src="${forwardUserAvatarUrl}" alt="avatar">
                                <span class="forward-username">${forwardUserName} ${forwardInfo ? forwardInfo : ''}</span>
                            </div>
                            <div class="forward-main">
                                ${forwardMain}
                            </div>
                        </div>
                        `
                    }
                    // 判断是否有附加信息
                    if (dynamicMajorData.modules.module_dynamic.additional) {
                        const additional = dynamicMajorData.modules.module_dynamic.additional
                        // 有附加信息，判断类型
                        switch (additional.type) {
                            case ADDITIONAL_TYPE_RESERVE: { // 预约信息
                                const reserve = additional.reserve
                                // 定义按钮
                                let button: string
                                // 判断按钮类型
                                if (reserve.button.uncheck.text === '已结束') {
                                    button = `
                                        <button class="reserve-button-end">
                                            <span>${reserve.button.uncheck.text}</span>
                                        </button>
                                    `
                                } else {
                                    button = `
                                        <button class="reserve-button-ing">
                                            <svg class="bili-dyn-card-reserve__action__icon" style="width: 16px; height: 16px;"
                                                xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
                                                viewBox="0 0 16 16" width="16" height="16">
                                                <path
                                                    d="M3.0000133333333334 6.999199999999999C3.0000133333333334 4.23776 5.2385866666666665 1.9991866666666667 8 1.9991866666666667C10.761433333333333 1.9991866666666667 13 4.23776 13 6.999199999999999L13 9.860933333333332C13 9.923533333333333 13.024899999999999 9.983633333333334 13.069199999999999 10.027933333333333L13.588366666666666 10.5471C14.389533333333333 11.348299999999998 13.914133333333334 12.734533333333333 12.754199999999999 12.8183C11.535999999999998 12.906233333333333 9.818933333333334 12.999199999999998 8 12.999199999999998C6.181073333333334 12.999199999999998 4.464026666666666 12.906233333333333 3.2458266666666664 12.8183C2.0859066666666664 12.734533333333333 1.61046 11.348299999999998 2.4116466666666665 10.547133333333333L2.93084 10.027933333333333C2.975133333333333 9.983633333333334 3.0000133333333334 9.923533333333333 3.0000133333333334 9.860933333333332L3.0000133333333334 6.999199999999999zM8 2.9991866666666667C5.790873333333334 2.9991866666666667 4.000013333333333 4.790046666666666 4.000013333333333 6.999199999999999L4.000013333333333 9.860933333333332C4.000013333333333 10.1888 3.8697733333333333 10.5032 3.6379466666666667 10.735033333333334L3.1187466666666666 11.254233333333334C2.911966666666667 11.461 3.0317600000000002 11.800199999999998 3.317833333333333 11.820899999999998C4.5211266666666665 11.907766666666667 6.212726666666666 11.999199999999998 8 11.999199999999998C9.787266666666666 11.999199999999998 11.4789 11.907733333333333 12.682199999999998 11.820899999999998C12.968233333333332 11.800199999999998 13.088033333333332 11.461 12.881266666666665 11.254233333333334L12.362066666666665 10.735033333333334C12.130233333333333 10.5032 12 10.1888 12 9.860933333333332L12 6.999199999999999C12 4.790046666666666 10.209166666666667 2.9991866666666667 8 2.9991866666666667z"
                                                    fill="currentColor"></path>
                                                <path
                                                    d="M8.720066666666666 2.0260466666666668C8.720066666666666 2.42372 8.397666666666666 2.746093333333333 8 2.746093333333333C7.602333333333332 2.746093333333333 7.279933333333333 2.42372 7.279933333333333 2.0260466666666668C7.279933333333333 1.6283666666666667 7.602333333333332 1.3059866666666666 8 1.3059866666666666C8.397666666666666 1.3059866666666666 8.720066666666666 1.6283666666666667 8.720066666666666 2.0260466666666668z"
                                                    fill="currentColor"></path>
                                                <path
                                                    d="M6.791266666666666 12.499199999999998C6.791266666666666 13.173966666666667 7.335266666666667 13.715866666666665 8 13.715866666666665C8.664766666666665 13.715866666666665 9.208733333333333 13.173966666666667 9.208733333333333 12.499199999999998L10.208733333333333 12.499199999999998C10.208733333333333 13.720566666666667 9.2227 14.715866666666665 8 14.715866666666665C6.777346666666666 14.715866666666665 5.791273333333333 13.720566666666667 5.791273333333333 12.499199999999998L6.791266666666666 12.499199999999998z"
                                                    fill="currentColor"></path>
                                            </svg>
                                            <span>${reserve.button.uncheck.text}</span>
                                        </button>
                                    `
                                }

                                main += `
                                <div class="card-reserve">
                                    <div class="reserve-main">
                                        <div class="reserve-title">
                                            ${reserve.title}
                                        </div>
                                        <div class="reserve-desc">
                                            <div class="reserve-info">
                                                <span class="reserve-time">${reserve.desc1.text}</span>
                                                <span class="reserve-num">${reserve.desc2.text}</span>
                                            </div>
                                            ${reserve.desc3 ?
                                        `<div class="reserve-prize">
                                                        <svg class="bili-dyn-card-reserve__lottery__icon"
                                                            style="width: 16px; height: 16px;" xmlns="http://www.w3.org/2000/svg"
                                                            xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 16 16" width="16"
                                                            height="16">
                                                            <path
                                                                d="M2.99998 7.785666666666666C3.2761266666666664 7.785666666666666 3.49998 8.0095 3.49998 8.285666666666666L3.49998 12.285666666666666C3.49998 12.719566666666667 3.8517599999999996 13.071333333333332 4.285693333333333 13.071333333333332L11.714266666666667 13.071333333333332C12.1482 13.071333333333332 12.5 12.719566666666667 12.5 12.285666666666666L12.5 8.285666666666666C12.5 8.0095 12.723833333333333 7.785666666666666 13 7.785666666666666C13.276133333333334 7.785666666666666 13.5 8.0095 13.5 8.285666666666666L13.5 12.285666666666666C13.5 13.271866666666668 12.7005 14.071333333333332 11.714266666666667 14.071333333333332L4.285693333333333 14.071333333333332C3.2994733333333333 14.071333333333332 2.49998 13.271866666666668 2.49998 12.285666666666666L2.49998 8.285666666666666C2.49998 8.0095 2.7238399999999996 7.785666666666666 2.99998 7.785666666666666z"
                                                                fill="currentColor"></path>
                                                            <path
                                                                d="M1.9285533333333333 5.857139999999999C1.9285533333333333 5.107613333333333 2.5361666666666665 4.5 3.285693333333333 4.5L12.714266666666667 4.5C13.463799999999999 4.5 14.071399999999999 5.107613333333333 14.071399999999999 5.857139999999999L14.071399999999999 7.134066666666667C14.071399999999999 7.793799999999999 13.590066666666667 8.373766666666667 12.905000000000001 8.4432C12.058933333333332 8.528966666666665 10.470166666666666 8.642866666666666 8 8.642866666666666C5.529819999999999 8.642866666666666 3.9410399999999997 8.528966666666665 3.09498 8.4432C2.4099066666666666 8.373766666666667 1.9285533333333333 7.793799999999999 1.9285533333333333 7.134066666666667L1.9285533333333333 5.857139999999999zM3.285693333333333 5.5C3.088453333333333 5.5 2.9285533333333333 5.6599 2.9285533333333333 5.857139999999999L2.9285533333333333 7.134066666666667C2.9285533333333333 7.3082 3.0432666666666663 7.432833333333333 3.1958066666666665 7.4483C4.00544 7.530366666666667 5.560420000000001 7.6428666666666665 8 7.6428666666666665C10.439566666666666 7.6428666666666665 11.994533333333333 7.530366666666667 12.804133333333333 7.4483C12.9567 7.432833333333333 13.071399999999999 7.3082 13.071399999999999 7.134066666666667L13.071399999999999 5.857139999999999C13.071399999999999 5.6599 12.911499999999998 5.5 12.714266666666667 5.5L3.285693333333333 5.5z"
                                                                fill="currentColor"></path>
                                                            <path
                                                                d="M4.357126666666666 3.5714733333333335C4.357126666666666 2.506353333333333 5.220573333333333 1.6429066666666667 6.285693333333333 1.6429066666666667C7.350833333333332 1.6429066666666667 8.214266666666667 2.506353333333333 8.214266666666667 3.5714733333333335L8.214266666666667 5.500046666666666L6.285693333333333 5.500046666666666C5.220573333333333 5.500046666666666 4.357126666666666 4.636593333333333 4.357126666666666 3.5714733333333335zM6.285693333333333 2.6429066666666667C5.77286 2.6429066666666667 5.357126666666667 3.0586399999999996 5.357126666666667 3.5714733333333335C5.357126666666667 4.084313333333333 5.77286 4.500046666666666 6.285693333333333 4.500046666666666L7.214266666666667 4.500046666666666L7.214266666666667 3.5714733333333335C7.214266666666667 3.0586399999999996 6.798533333333333 2.6429066666666667 6.285693333333333 2.6429066666666667z"
                                                                fill="currentColor"></path>
                                                            <path
                                                                d="M7.785666666666666 3.5714733333333335C7.785666666666666 2.506353333333333 8.649133333333332 1.6429066666666667 9.714266666666667 1.6429066666666667C10.779399999999999 1.6429066666666667 11.642866666666666 2.506353333333333 11.642866666666666 3.5714733333333335C11.642866666666666 4.636593333333333 10.779399999999999 5.500046666666666 9.714266666666667 5.500046666666666L7.785666666666666 5.500046666666666L7.785666666666666 3.5714733333333335zM9.714266666666667 2.6429066666666667C9.201433333333332 2.6429066666666667 8.785666666666666 3.0586399999999996 8.785666666666666 3.5714733333333335L8.785666666666666 4.500046666666666L9.714266666666667 4.500046666666666C10.2271 4.500046666666666 10.642866666666666 4.084313333333333 10.642866666666666 3.5714733333333335C10.642866666666666 3.0586399999999996 10.2271 2.6429066666666667 9.714266666666667 2.6429066666666667z"
                                                                fill="currentColor"></path>
                                                            <path
                                                                d="M8 3.7856466666666666C8.276133333333332 3.7856466666666666 8.5 4.009499999999999 8.5 4.285646666666667L8.5 13.142800000000001C8.5 13.418933333333332 8.276133333333332 13.642800000000001 8 13.642800000000001C7.723833333333333 13.642800000000001 7.5 13.418933333333332 7.5 13.142800000000001L7.5 4.285646666666667C7.5 4.009499999999999 7.723833333333333 3.7856466666666666 8 3.7856466666666666z"
                                                                fill="currentColor"></path>
                                                        </svg>
                                                        <span>${reserve.desc3.text}</span>
                                                        <svg style="width: 12px; height: 12px;" xmlns="http://www.w3.org/2000/svg"
                                                            xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 12 12" width="12"
                                                            height="12">
                                                            <path
                                                                d="M4.359835 1.609835C4.21339 1.756285 4.21339 1.99372 4.359835 2.140165L8.0429 5.823225C8.140525 5.920875 8.140525 6.079125 8.0429 6.176775L4.359835 9.859825C4.21339 10.006275 4.21339 10.243725 4.359835 10.390175C4.506285 10.5366 4.743725 10.5366 4.89017 10.390175L8.573225 6.7071C8.96375 6.316575 8.96375 5.683425 8.573225 5.2929L4.89017 1.609835C4.743725 1.46339 4.506285 1.46339 4.359835 1.609835z"
                                                                fill="currentColor"></path>
                                                        </svg>
                                                    </div>` : ''
                                    }
                                        </div>
                                    </div>
                                    <div class="reserve-button">
                                        ${button}
                                    </div>
                                </div>
                                `
                            }
                        }
                    }

                    link += `请将$替换为. www$bilibili$com/opus/${dynamicMajorData.id_str}`
                    break
                }
                case DYNAMIC_TYPE_AV: { // 投稿新视频
                    // 处理文字
                    basicDynamic()
                    const archive = dynamicMajorData.modules.module_dynamic.major.archive
                    if (archive.badge.text === '投稿视频') {
                        if (forward) {
                            forwardInfo = '投稿了视频'
                        } else {
                            pubTime = `${pubTime} · 投稿了视频`
                        }
                    }

                    main += `
                    <div class="card-video">
                        <div class="video-cover">
                            <img src="${archive.cover}"
                                alt="">
                            <div class="cover-mask"></div>
                            <span>${archive.duration_text}</span>
                        </div>
                        <div class="video-info">
                            <div class="video-info-header">
                                <div class="video-title">
                                    ${archive.title}
                                </div>
                                <div class="video-introduction">
                                    ${archive.desc}
                                </div>
                            </div>
                            <div class="video-stat">
                                <div class="video-stat-item">
                                    <svg style="width: 16px; height: 16px;" xmlns="http://www.w3.org/2000/svg"
                                        xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 16 16" width="16"
                                        height="16">
                                        <path
                                            d="M8 3.3320333333333334C6.321186666666667 3.3320333333333334 4.855333333333333 3.4174399999999996 3.820593333333333 3.5013466666666666C3.1014733333333333 3.5596599999999996 2.5440733333333334 4.109013333333333 2.48 4.821693333333333C2.4040466666666664 5.666533333333334 2.333333333333333 6.780666666666666 2.333333333333333 7.998666666666666C2.333333333333333 9.216733333333334 2.4040466666666664 10.330866666666665 2.48 11.175699999999999C2.5440733333333334 11.888366666666666 3.1014733333333333 12.437733333333334 3.820593333333333 12.496066666666666C4.855333333333333 12.579933333333333 6.321186666666667 12.665333333333333 8 12.665333333333333C9.678999999999998 12.665333333333333 11.144933333333334 12.579933333333333 12.179733333333333 12.496033333333333C12.898733333333332 12.4377 13.456 11.888533333333331 13.520066666666667 11.176033333333333C13.595999999999998 10.331533333333333 13.666666666666666 9.217633333333332 13.666666666666666 7.998666666666666C13.666666666666666 6.779766666666667 13.595999999999998 5.665846666666667 13.520066666666667 4.821366666666666C13.456 4.108866666666666 12.898733333333332 3.55968 12.179733333333333 3.5013666666666663C11.144933333333334 3.417453333333333 9.678999999999998 3.3320333333333334 8 3.3320333333333334zM3.7397666666666667 2.50462C4.794879999999999 2.41906 6.288386666666666 2.3320333333333334 8 2.3320333333333334C9.7118 2.3320333333333334 11.2054 2.4190733333333334 12.260533333333331 2.5046399999999998C13.458733333333331 2.6018133333333333 14.407866666666665 3.5285199999999994 14.516066666666667 4.73182C14.593933333333332 5.597933333333334 14.666666666666666 6.7427 14.666666666666666 7.998666666666666C14.666666666666666 9.2547 14.593933333333332 10.399466666666665 14.516066666666667 11.2656C14.407866666666665 12.468866666666665 13.458733333333331 13.395566666666667 12.260533333333331 13.492766666666665C11.2054 13.578333333333333 9.7118 13.665333333333333 8 13.665333333333333C6.288386666666666 13.665333333333333 4.794879999999999 13.578333333333333 3.7397666666666667 13.492799999999999C2.541373333333333 13.395599999999998 1.5922066666666668 12.468633333333333 1.4840200000000001 11.265266666666665C1.4061199999999998 10.3988 1.3333333333333333 9.253866666666667 1.3333333333333333 7.998666666666666C1.3333333333333333 6.743533333333333 1.4061199999999998 5.598579999999999 1.4840200000000001 4.732153333333333C1.5922066666666668 3.5287466666666667 2.541373333333333 2.601793333333333 3.7397666666666667 2.50462z"
                                            fill="currentColor"></path>
                                        <path
                                            d="M9.8092 7.3125C10.338433333333333 7.618066666666666 10.338433333333333 8.382 9.809166666666666 8.687533333333333L7.690799999999999 9.910599999999999C7.161566666666666 10.216133333333332 6.5 9.8342 6.500006666666666 9.223066666666666L6.500006666666666 6.776999999999999C6.500006666666666 6.165873333333334 7.161566666666666 5.783913333333333 7.690799999999999 6.089479999999999L9.8092 7.3125z"
                                            fill="currentColor"></path>
                                    </svg>
                                    <span>${archive.stat.play}</span>
                                </div>
                                <div class="video-stat-item">
                                    <svg style="width: 16px; height: 16px;" xmlns="http://www.w3.org/2000/svg"
                                        xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 16 16" width="16"
                                        height="16">
                                        <path
                                            d="M8 3.3320333333333334C6.321186666666667 3.3320333333333334 4.855333333333333 3.4174399999999996 3.820593333333333 3.5013466666666666C3.1014733333333333 3.5596599999999996 2.5440733333333334 4.109013333333333 2.48 4.821693333333333C2.4040466666666664 5.666533333333334 2.333333333333333 6.780666666666666 2.333333333333333 7.998666666666666C2.333333333333333 9.216733333333334 2.4040466666666664 10.330866666666665 2.48 11.175699999999999C2.5440733333333334 11.888366666666666 3.1014733333333333 12.437733333333334 3.820593333333333 12.496066666666666C4.855333333333333 12.579933333333333 6.321186666666667 12.665333333333333 8 12.665333333333333C9.678999999999998 12.665333333333333 11.144933333333334 12.579933333333333 12.179733333333333 12.496033333333333C12.898733333333332 12.4377 13.456 11.888533333333331 13.520066666666667 11.176033333333333C13.595999999999998 10.331533333333333 13.666666666666666 9.217633333333332 13.666666666666666 7.998666666666666C13.666666666666666 6.779766666666667 13.595999999999998 5.665846666666667 13.520066666666667 4.821366666666666C13.456 4.108866666666666 12.898733333333332 3.55968 12.179733333333333 3.5013666666666663C11.144933333333334 3.417453333333333 9.678999999999998 3.3320333333333334 8 3.3320333333333334zM3.7397666666666667 2.50462C4.794879999999999 2.41906 6.288386666666666 2.3320333333333334 8 2.3320333333333334C9.7118 2.3320333333333334 11.2054 2.4190733333333334 12.260533333333331 2.5046399999999998C13.458733333333331 2.6018133333333333 14.407866666666665 3.5285199999999994 14.516066666666667 4.73182C14.593933333333332 5.597933333333334 14.666666666666666 6.7427 14.666666666666666 7.998666666666666C14.666666666666666 9.2547 14.593933333333332 10.399466666666665 14.516066666666667 11.2656C14.407866666666665 12.468866666666665 13.458733333333331 13.395566666666667 12.260533333333331 13.492766666666665C11.2054 13.578333333333333 9.7118 13.665333333333333 8 13.665333333333333C6.288386666666666 13.665333333333333 4.794879999999999 13.578333333333333 3.7397666666666667 13.492799999999999C2.541373333333333 13.395599999999998 1.5922066666666668 12.468633333333333 1.4840200000000001 11.265266666666665C1.4061199999999998 10.3988 1.3333333333333333 9.253866666666667 1.3333333333333333 7.998666666666666C1.3333333333333333 6.743533333333333 1.4061199999999998 5.598579999999999 1.4840200000000001 4.732153333333333C1.5922066666666668 3.5287466666666667 2.541373333333333 2.601793333333333 3.7397666666666667 2.50462z"
                                            fill="currentColor"></path>
                                        <path
                                            d="M10.583333333333332 7.166666666666666L6.583333333333333 7.166666666666666C6.307193333333332 7.166666666666666 6.083333333333333 6.942799999999999 6.083333333333333 6.666666666666666C6.083333333333333 6.390526666666666 6.307193333333332 6.166666666666666 6.583333333333333 6.166666666666666L10.583333333333332 6.166666666666666C10.859466666666666 6.166666666666666 11.083333333333332 6.390526666666666 11.083333333333332 6.666666666666666C11.083333333333332 6.942799999999999 10.859466666666666 7.166666666666666 10.583333333333332 7.166666666666666z"
                                            fill="currentColor"></path>
                                        <path
                                            d="M11.583333333333332 9.833333333333332L7.583333333333333 9.833333333333332C7.3072 9.833333333333332 7.083333333333333 9.609466666666666 7.083333333333333 9.333333333333332C7.083333333333333 9.0572 7.3072 8.833333333333332 7.583333333333333 8.833333333333332L11.583333333333332 8.833333333333332C11.859466666666666 8.833333333333332 12.083333333333332 9.0572 12.083333333333332 9.333333333333332C12.083333333333332 9.609466666666666 11.859466666666666 9.833333333333332 11.583333333333332 9.833333333333332z"
                                            fill="currentColor"></path>
                                        <path
                                            d="M5.25 6.666666666666666C5.25 6.942799999999999 5.02614 7.166666666666666 4.75 7.166666666666666L4.416666666666666 7.166666666666666C4.140526666666666 7.166666666666666 3.9166666666666665 6.942799999999999 3.9166666666666665 6.666666666666666C3.9166666666666665 6.390526666666666 4.140526666666666 6.166666666666666 4.416666666666666 6.166666666666666L4.75 6.166666666666666C5.02614 6.166666666666666 5.25 6.390526666666666 5.25 6.666666666666666z"
                                            fill="currentColor"></path>
                                        <path
                                            d="M6.25 9.333333333333332C6.25 9.609466666666666 6.02614 9.833333333333332 5.75 9.833333333333332L5.416666666666666 9.833333333333332C5.140526666666666 9.833333333333332 4.916666666666666 9.609466666666666 4.916666666666666 9.333333333333332C4.916666666666666 9.0572 5.140526666666666 8.833333333333332 5.416666666666666 8.833333333333332L5.75 8.833333333333332C6.02614 8.833333333333332 6.25 9.0572 6.25 9.333333333333332z"
                                            fill="currentColor"></path>
                                    </svg>
                                    <span>${archive.stat.danmaku}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    `

                    link = `请将$替换为. www$bilibili$com/video/${archive.bvid}`
                    break
                }
                case DYNAMIC_TYPE_LIVE: return [`${upName}发起了直播预约，我暂时无法渲染，请自行查看`, link]
                case DYNAMIC_TYPE_MEDIALIST: return [`${upName}分享了收藏夹，我暂时无法渲染，请自行查看`, link]
                case DYNAMIC_TYPE_PGC: return [`${upName}发布了剧集（番剧、电影、纪录片），我暂时无法渲染，请自行查看`, link]
                case DYNAMIC_TYPE_ARTICLE: return [`${upName}投稿了新专栏，我暂时无法渲染，请自行查看`, link]
                case DYNAMIC_TYPE_MUSIC: return [`${upName}发行了新歌，我暂时无法渲染，请自行查看`, link]
                case DYNAMIC_TYPE_COMMON_SQUARE: return [`${upName}发布了装扮｜剧集｜点评｜普通分享，我暂时无法渲染，请自行查看`, link]
                case DYNAMIC_TYPE_COURSES_SEASON: return [`${upName}发布了新课程，我暂时无法渲染，请自行查看`, link]
                case DYNAMIC_TYPE_UGC_SEASON: return [`${upName}更新了合集，我暂时无法渲染，请自行查看`, link]
                case DYNAMIC_TYPE_NONE: return [`${upName}发布了一条无效动态`, link]
                // 直播开播，不做处理
                case DYNAMIC_TYPE_LIVE_RCMD: throw new Error('直播开播动态，不做处理')
                case DYNAMIC_TYPE_SUBSCRIPTION_NEW:
                case DYNAMIC_TYPE_BANNER:
                case DYNAMIC_TYPE_SUBSCRIPTION:
                case DYNAMIC_TYPE_APPLET:
                case DYNAMIC_TYPE_AD:
                case DYNAMIC_TYPE_COURSES_BATCH:
                case DYNAMIC_TYPE_COURSES:
                case DYNAMIC_TYPE_COMMON_VERTICAL:
                default: return [`${upName}发布了一条我无法识别的动态，请自行查看`, '']
            }
            return [main, link, forwardInfo]
        }

        // 获取动态主要内容
        const [main, link] = await getDynamicMajor(data, false)
        // 加载字体
        const fontURL = pathToFileURL(resolve(__dirname, 'font/HYZhengYuan-75W.ttf'))
        // 判断是否开启大字体模式
        let style: string
        if (this.giConfig.enableLargeFont) {
            style = `
            @font-face {
                font-family: "Custom Font";
                src: url(${fontURL});
            }
    
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
                font-family: "${this.giConfig.font}", "Custom Font", "Microsoft YaHei", "Source Han Sans", "Noto Sans CJK", sans-serif;
            }

            html {
                width: 800px;
                height: auto;
            }

            .background {
                width: 100%;
                height: auto;
                padding: 15px;
                background: linear-gradient(to right bottom, ${this.giConfig.cardColorStart}, ${this.giConfig.cardColorEnd});
                overflow: hidden;
            }

            .base-plate {
                width: 100%;
                height: auto;
                box-shadow: 0 4px 8px 0 rgba(0, 0, 0, 0.2);
                padding: 15px;
                border-radius: 10px;
                background-color: #FFF5EE;
            }

            .card {
                width: 100%;
                height: auto;
                border-radius: 5px;
                padding: 15px;
                overflow: hidden;
                background-color: #fff;
            }
    
            .card-body {
                display: flex;
                padding: 15px;
            }
    
            .card .anchor-avatar {
                max-width: 70px;
                /* 设置最大宽度为容器宽度的100% */
                max-height: 70px;
                /* 设置最大高度为容器高度的90% */
                margin-right: 20px;
                border-radius: 10px;
            }
    
            .card .card-body .card-content {
                width: 100%;
            }
    
            .card .card-body .card-content .card-header {
                width: 100%;
                display: flex;
                justify-content: space-between;
            }
    
            .card .up-info {
                display: flex;
                flex-direction: column;
                justify-content: space-between;
                height: 70px;
            }
    
            .card .up-info .up-name {
                font-size: 27px;
            }
    
            .card .pub-time {
                font-size: 20px;
                color: grey;
            }
    
            .card .card-header img {
                height: 50px;
            }

            .card .dress-up {
                position: relative;
                /* background-image: url('${dynamicCardUrl}');
                background-size: cover; */
                font-size: 17px;
            }

            .card .dress-up img {
                max-width: 100%;
                max-height: 100%;
            }

            .card .dress-up span {
                position: absolute;
                color: ${dynamicCardColor};
                right: 67px;
                top: 24px;
            }

            .card .card-topic {
                display: flex;
                align-items: center;
                margin-top: 10px;
                font-size: 20px;
                color: #008AC5;
                gap: 3px;
            }
    
            .card .card-details {
                margin-top: 5px;
                margin-bottom: 15px;
                font-size: 22px;
                width: 90%;
            }
    
            .card .card-major {
                display: flex;
                flex-wrap: wrap;
                gap: 5px;
            }
    
            .card .card-major .photo-item {
                border-radius: 10px;
                overflow: hidden;
                width: 170px;
                height: 170px;
                object-fit: cover;
            }

            .card .card-major .single-photo-mask {
                position: absolute;
                text-align: center;
                width: 100%;
                height: 100%;
                top: 0;
                left: 0;
                background: linear-gradient(to top, rgba(0, 0, 0, 0.9) 0%, transparent 30%);
            }

            .card .card-major .single-photo-mask-text {
                position: absolute;
                color: #fff;
                font-size: 24px;
                right: 0;
                bottom: 66px;
                left: 0;
                text-align: center;
            }

            .card .card-major .single-photo-mask-arrow {
                position: absolute;
                width: 70px;
                height: 70px;
                bottom: 7px;
                left: 50%;
                transform: translateX(-50%);
            }

            .card .card-major .single-photo-container {
                position: relative;
                max-width: 500px;
                max-height: 1000px;
                border-radius: 10px;
                overflow: hidden;
            }

            .card .card-major .single-photo-item {
                max-width: 500px;
                border-radius: 10px;
                overflow: hidden;
            }

            .card .card-major .four-photo-item {
                width: 170px;
                height: 170px;
                object-fit: cover;
                border-radius: 10px;
                overflow: hidden;
                flex-basis: 20%; /* or any value less than 50% */
            }
    
            .card .card-stat {
                display: flex;
                justify-content: space-between;
                width: 90%;
                margin-top: 15px;
                color: gray;
                font-size: 14px;
            }
    
            .card .card-stat .stat-item {
                display: flex;
                align-items: center;
                gap: 3px;
            }

            .card .card-video {
                display: flex;
                overflow: hidden;
                border-radius: 5px 0 0 5px;
                margin-top: 10px;
                height: 147px;
            }
    
            .card .video-cover {
                position: relative;
                flex: 2;
                overflow: hidden;
            }
    
            .card .video-cover img {
                width: 236px;
            }

            .card .cover-mask {
                position: absolute;
                width: 100%;
                height: 100%;
                top: 0;
                left: 0;
                background: linear-gradient(to top, rgba(0, 0, 0, 0.5) 0%, transparent 30%);
            }
    
            .card .video-cover span {
                position: absolute;
                color: #fff;
                font-size: 14px;
                right: 10px;
                bottom: 8px;
            }
    
            .card .video-info {
                display: flex;
                justify-content: space-between;
                flex-direction: column;
                flex: 3;
                border: #e5e7e9 1px solid;
                border-left: none;
                border-radius: 0 5px 5px 0;
                padding: 12px 16px 10px;
                background-color: #fff;
            }
    
            .card .video-info-header .video-title {
                font-size: 16px;
            }
    
            .card .video-info-header .video-introduction {
                margin-top: 5px;
                font-size: 12px;
                color: #AAA;
                display: -webkit-box;
                /* 必须设置为 -webkit-box 或 -webkit-inline-box */
                -webkit-box-orient: vertical;
                /* 必须设置为 vertical */
                -webkit-line-clamp: 2;
                /* 显示的文本行数 */
                overflow: hidden;
                /* 必须设置为 hidden */
            }
    
            .card .video-stat {
                font-size: 12px;
                color: #AAA;
                display: flex;
                gap: 35px
            }
    
            .card .video-stat .video-stat-item {
                display: flex;
                align-items: center;
                gap: 3px;
            }

            .card .card-forward {
                border-radius: 5px;
                padding: 12px 10px 14px 10px;
                background-color: #F6F7F8;
            }
    
            .card-forward .forward-userinfo {
                display: flex;
                align-items: center;
                gap: 5px;
                height: 35px;
            }
    
            .forward-userinfo img {
                width: 25px;
                height: 25px;
                border-radius: 50%;
            }
    
            .forward-userinfo span {
                color: #61666D;
                font-size: 20px;
            }

            .card .card-reserve {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 10px 20px 10px 20px;
                margin-top: 10px;
                border-radius: 10px;
                background-color: #F6F7F8;
            }
    
            .card-reserve .reserve-title {
                font-size: 14px;
                color: #18191C;
            }
    
            .card-reserve .reserve-desc {
                margin-top: 7px;
                font-size: 12px;
                color: #9499A0;
            }
    
            .reserve-info .reserve-time {
                margin-right: 7px;
            }
    
            .card-reserve .reserve-prize {
                display: flex;
                align-items: center;
                margin-top: 3px;
                gap: 3px;
                color: #00AEEC;
            }
    
            .card .card-reserve .reserve-button button {
                border: none;
                height: 30px;
                width: 72px;
                font-size: 13px;
                border-radius: 7px;
            }
    
            .card .card-reserve .reserve-button .reserve-button-end {
                display: flex;
                align-items: center;
                justify-content: center;
                color: #9499A0;
                background-color: #E3E5E7;
            }
    
            .card .card-reserve .reserve-button .reserve-button-ing {
                display: flex;
                align-items: center;
                justify-content: center;
                color: #FFF;
                background-color: #00A0D8;
            }
            `
        } else {
            style = `
            @font-face {
                font-family: "Custom Font";
                src: url(${fontURL});
            }
    
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
                font-family: "${this.giConfig.font}", "Custom Font", "Microsoft YaHei", "Source Han Sans", "Noto Sans CJK", sans-serif;
            }
    
            html {
                width: 800px;
                height: auto;
            }
    
            .background {
                width: 100%;
                height: auto;
                padding: 15px;
                background: linear-gradient(to right bottom, ${this.giConfig.cardColorStart}, ${this.giConfig.cardColorEnd});
                overflow: hidden;
            }

            .base-plate {
                width: 100%;
                height: auto;
                box-shadow: 0 4px 8px 0 rgba(0, 0, 0, 0.2);
                padding: 15px;
                border-radius: 10px;
                background-color: #FFF5EE;
            }
    
            .card {
                width: 100%;
                height: auto;
                border-radius: 5px;
                padding: 15px;
                overflow: hidden;
                background-color: #fff;
            }
    
            .card-body {
                display: flex;
                padding: 15px;
            }
    
            .card .anchor-avatar {
                border-radius: 5px 5px 0 0;
                max-width: 50px;
                /* 设置最大宽度为容器宽度的100% */
                max-height: 50px;
                /* 设置最大高度为容器高度的90% */
                margin-right: 20px;
                border-radius: 10px;
            }
    
            .card .card-body .card-content {
                width: 100%;
            }
    
            .card .card-body .card-content .card-header {
                width: 100%;
                display: flex;
                justify-content: space-between;
            }
    
            .card .up-info {
                display: flex;
                flex-direction: column;
                justify-content: space-between;
                height: 50px;
            }
    
            .card .up-info .up-name {
                font-size: 20px;
            }
    
            .card .pub-time {
                font-size: 12px;
                color: grey;
            }
    
            .card .card-header img {
                height: 50px;
            }

            .card .dress-up {
                position: relative;
                max-width: 110px;
                max-height: 34px;
                /* background-image: url('${dynamicCardUrl}');
                background-size: cover; */
                font-size: 12px;
                line-height: 33px;
            }

            .card .dress-up img {
                max-width: 100%;
                max-height: 100%;
            }

            .card .dress-up span {
                position: absolute;
                color: ${dynamicCardColor};
                right: 37px;
                top: 5px;
            }

            .card .card-topic {
                display: flex;
                align-items: center;
                margin-top: 10px;
                color: #008AC5;
                gap: 3px;
            }
    
            .card .card-details {
                margin-bottom: 15px;
                width: 90%;
            }
    
            .card .card-major {
                display: flex;
                flex-wrap: wrap;
                gap: 5px;
            }
    
            .card .card-major .photo-item {
                border-radius: 10px;
                overflow: hidden;
                width: 170px;
                height: 170px;
                object-fit: cover;
            }

            .card .card-major .single-photo-mask {
                position: absolute;
                text-align: center;
                width: 100%;
                height: 100%;
                top: 0;
                left: 0;
                background: linear-gradient(to top, rgba(0, 0, 0, 0.9) 0%, transparent 30%);
            }

            .card .card-major .single-photo-mask-text {
                position: absolute;
                color: #fff;
                font-size: 24px;
                right: 0;
                bottom: 66px;
                left: 0;
                text-align: center;
            }

            .card .card-major .single-photo-mask-arrow {
                position: absolute;
                width: 70px;
                height: 70px;
                bottom: 7px;
                left: 50%;
                transform: translateX(-50%);
            }

            .card .card-major .single-photo-container {
                position: relative;
                max-width: 500px;
                max-height: 1000px;
                border-radius: 10px;
                overflow: hidden;
            }

            .card .card-major .single-photo-item {
                max-width: 500px;
                border-radius: 10px;
                overflow: hidden;
            }

            .card .card-major .four-photo-item {
                width: 170px;
                height: 170px;
                object-fit: cover;
                border-radius: 10px;
                overflow: hidden;
                flex-basis: 20%; /* or any value less than 50% */
            }
    
            .card .card-stat {
                display: flex;
                justify-content: space-between;
                width: 90%;
                margin-top: 15px;
                color: gray;
                font-size: 14px;
            }
    
            .card .card-stat .stat-item {
                display: flex;
                align-items: center;
                gap: 3px;
            }

            .card .card-video {
                display: flex;
                overflow: hidden;
                border-radius: 5px 0 0 5px;
                margin-top: 10px;
                height: 132px;
            }
    
            .card .video-cover {
                position: relative;
                flex: 2;
                overflow: hidden;
            }
    
            .card .video-cover img {
                width: 236px;
            }

            .card .cover-mask {
                position: absolute;
                width: 100%;
                height: 100%;
                top: 0;
                left: 0;
                background: linear-gradient(to top, rgba(0, 0, 0, 0.5) 0%, transparent 30%);
            }
    
            .card .video-cover span {
                position: absolute;
                color: #fff;
                font-size: 14px;
                right: 10px;
                bottom: 8px;
            }
    
            .card .video-info {
                display: flex;
                justify-content: space-between;
                flex-direction: column;
                flex: 3;
                border: #e5e7e9 1px solid;
                border-left: none;
                border-radius: 0 5px 5px 0;
                padding: 12px 16px 10px;
                background-color: #fff;
            }
    
            .card .video-info-header .video-title {
                font-size: 16px;
            }
    
            .card .video-info-header .video-introduction {
                margin-top: 5px;
                font-size: 12px;
                color: #AAA;
                display: -webkit-box;
                /* 必须设置为 -webkit-box 或 -webkit-inline-box */
                -webkit-box-orient: vertical;
                /* 必须设置为 vertical */
                -webkit-line-clamp: 2;
                /* 显示的文本行数 */
                overflow: hidden;
                /* 必须设置为 hidden */
            }
    
            .card .video-stat {
                font-size: 12px;
                color: #AAA;
                display: flex;
                gap: 35px
            }
    
            .card .video-stat .video-stat-item {
                display: flex;
                align-items: center;
                gap: 3px;
            }

            .card .card-forward {
                border-radius: 5px;
                padding: 12px 10px 14px 10px;
                background-color: #F6F7F8;
            }
    
            .card-forward .forward-userinfo {
                display: flex;
                align-items: center;
                gap: 5px;
                height: 30px;
            }
    
            .forward-userinfo img {
                width: 20px;
                height: 20px;
                border-radius: 50%;
            }
    
            .forward-userinfo span {
                color: #61666D;
                font-size: 15px;
            }

            .card .card-reserve {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 10px 20px 10px 20px;
                margin-top: 10px;
                border-radius: 10px;
                background-color: #F6F7F8;
            }
    
            .card-reserve .reserve-title {
                font-size: 14px;
                color: #18191C;
            }
    
            .card-reserve .reserve-desc {
                margin-top: 7px;
                font-size: 12px;
                color: #9499A0;
            }
    
            .reserve-info .reserve-time {
                margin-right: 7px;
            }
    
            .card-reserve .reserve-prize {
                display: flex;
                align-items: center;
                margin-top: 3px;
                gap: 3px;
                color: #00AEEC;
            }
    
            .card .card-reserve .reserve-button button {
                border: none;
                height: 30px;
                width: 72px;
                font-size: 13px;
                border-radius: 7px;
            }
    
            .card .card-reserve .reserve-button .reserve-button-end {
                display: flex;
                align-items: center;
                justify-content: center;
                color: #9499A0;
                background-color: #E3E5E7;
            }
    
            .card .card-reserve .reserve-button .reserve-button-ing {
                display: flex;
                align-items: center;
                justify-content: center;
                color: #FFF;
                background-color: #00A0D8;
            }
            `
        }
        // 定义卡片内容
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>动态通知</title>
                <style>
                    ${style}
                </style>
            </head>
            <body>
                <div class="background">
                    <div ${this.giConfig.removeBorder ? '' : 'class="base-plate"'}>
                        <div class="card">
                            <div class="card-body">
                                <!-- 主播头像 -->
                                <img class="anchor-avatar"
                                    src="${avatarUrl}"
                                    alt="主播头像">
                                <div class="card-content">
                                    <div class="card-header">
                                        <div class="up-info">
                                            <div class="up-name" style="${module_author.vip.type !== 0 ? 'color: #FB7299' : ''}">${upName}</div>
                                            <div class="pub-time">${pubTime}</div>
                                        </div>
                                        ${module_author.decorate ? `
                                        <div class="dress-up">
                                            <img src="${dynamicCardUrl}" />
                                            <span>${dynamicCardId}</span>
                                        </div>
                                        ` : ''}
                                    </div>
                                    <div class="card-topic">
                                        ${topic ? `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"
                                        class="bili-dyn-topic__icon">
                                        <path fill-rule="evenodd" clip-rule="evenodd"
                                            d="M11.4302 2.57458C11.4416 2.51023 11.4439 2.43974 11.4218 2.3528C11.3281 1.98196 10.9517 1.72037 10.5284 1.7527C10.432 1.76018 10.3599 1.78383 10.297 1.81376C10.2347 1.84398 10.1832 1.88155 10.1401 1.92465C10.1195 1.94485 10.1017 1.96692 10.0839 1.98897L10.0808 1.99289L10.0237 2.06277L9.91103 2.2033C9.76177 2.39141 9.61593 2.58191 9.47513 2.77556C9.33433 2.96936 9.19744 3.16585 9.06672 3.36638C9.00275 3.46491 8.93968 3.56401 8.87883 3.66461L8.56966 3.6613C8.00282 3.6574 7.43605 3.65952 6.86935 3.67034C6.80747 3.56778 6.74325 3.46677 6.67818 3.3664C6.54732 3.16585 6.41045 2.96934 6.26968 2.77568C6.12891 2.58186 5.98309 2.39134 5.83387 2.20322L5.72122 2.06268L5.66416 1.99279L5.6622 1.99036C5.64401 1.96783 5.62586 1.94535 5.60483 1.92454C5.56192 1.88144 5.51022 1.84388 5.44797 1.81364C5.38522 1.78386 5.31305 1.76006 5.21665 1.75273C4.80555 1.72085 4.4203 1.97094 4.32341 2.35273C4.30147 2.43968 4.30358 2.51018 4.31512 2.57453C4.32715 2.63859 4.34975 2.69546 4.38112 2.74649C4.39567 2.77075 4.41283 2.79315 4.42999 2.81557C4.43104 2.81694 4.43209 2.81831 4.43314 2.81968L4.48759 2.89122L4.59781 3.03355C4.74589 3.22242 4.89739 3.40905 5.05377 3.59254C5.09243 3.63788 5.13136 3.68306 5.17057 3.72785C4.99083 3.73681 4.81112 3.7467 4.63143 3.75756C4.41278 3.771 4.19397 3.78537 3.97547 3.80206L3.64757 3.82786L3.48362 3.84177L3.39157 3.85181C3.36984 3.8543 3.34834 3.8577 3.32679 3.86111C3.31761 3.86257 3.30843 3.86402 3.29921 3.86541C3.05406 3.90681 2.81526 3.98901 2.59645 4.10752C2.37765 4.22603 2.17867 4.38039 2.00992 4.56302C1.84117 4.74565 1.70247 4.95593 1.60144 5.18337C1.50025 5.4105 1.43687 5.65447 1.41362 5.90153C1.33103 6.77513 1.27663 7.6515 1.25742 8.5302C1.23758 9.40951 1.25835 10.2891 1.3098 11.1655C1.32266 11.3846 1.33738 11.6035 1.35396 11.8223L1.38046 12.1505L1.39472 12.3144L1.39658 12.335L1.39906 12.3583L1.40417 12.4048C1.40671 12.4305 1.41072 12.4558 1.41473 12.4811C1.41561 12.4866 1.41648 12.4922 1.41734 12.4977C1.45717 12.7449 1.53806 12.9859 1.65567 13.2074C1.77314 13.4289 1.92779 13.6304 2.11049 13.8022C2.29319 13.974 2.50441 14.1159 2.73329 14.2197C2.96201 14.3235 3.2084 14.3901 3.45836 14.4135C3.47066 14.415 3.48114 14.4159 3.49135 14.4167C3.49477 14.417 3.49817 14.4173 3.50159 14.4176L3.5425 14.4212L3.62448 14.4283L3.78843 14.4417L4.11633 14.4674C4.33514 14.4831 4.55379 14.4983 4.7726 14.5111C6.52291 14.6145 8.27492 14.6346 10.0263 14.5706C10.4642 14.5547 10.9019 14.5332 11.3396 14.5062C11.5584 14.4923 11.7772 14.4776 11.9959 14.4604L12.3239 14.434L12.4881 14.4196L12.5813 14.4093C12.6035 14.4065 12.6255 14.403 12.6474 14.3995C12.6565 14.3981 12.6655 14.3966 12.6746 14.3952C12.9226 14.3527 13.1635 14.2691 13.3844 14.1486C13.6052 14.0284 13.8059 13.8716 13.9759 13.6868C14.1463 13.5022 14.2861 13.2892 14.3874 13.0593C14.4381 12.9444 14.4793 12.8253 14.5108 12.7037C14.519 12.6734 14.5257 12.6428 14.5322 12.612L14.5421 12.566L14.55 12.5196C14.5556 12.4887 14.5607 12.4578 14.5641 12.4266C14.5681 12.3959 14.5723 12.363 14.5746 12.3373C14.6642 11.4637 14.7237 10.5864 14.7435 9.70617C14.764 8.825 14.7347 7.94337 14.6719 7.06715C14.6561 6.8479 14.6385 6.62896 14.6183 6.41033L14.5867 6.08246L14.5697 5.91853L14.5655 5.87758C14.5641 5.86445 14.5618 5.8473 14.5599 5.83231C14.5588 5.8242 14.5578 5.81609 14.5567 5.80797C14.5538 5.78514 14.5509 5.76229 14.5466 5.7396C14.5064 5.49301 14.4252 5.25275 14.3067 5.03242C14.1886 4.81208 14.0343 4.61153 13.8519 4.44095C13.6695 4.27038 13.4589 4.12993 13.2311 4.02733C13.0033 3.92458 12.7583 3.85907 12.5099 3.83636C12.4974 3.83492 12.4865 3.83394 12.4759 3.833C12.4729 3.83273 12.4698 3.83246 12.4668 3.83219L12.4258 3.82879L12.3438 3.82199L12.1798 3.80886L11.8516 3.78413C11.633 3.76915 11.4143 3.75478 11.1955 3.74288C10.993 3.73147 10.7904 3.72134 10.5878 3.71243L10.6914 3.59236C10.8479 3.40903 10.9992 3.22242 11.1473 3.03341L11.2576 2.89124L11.312 2.81971C11.3136 2.81773 11.3151 2.81575 11.3166 2.81377C11.3333 2.79197 11.3501 2.77013 11.3641 2.74653C11.3954 2.6955 11.418 2.63863 11.4302 2.57458ZM9.33039 5.49268C9.38381 5.16945 9.67705 4.95281 9.98536 5.00882L9.98871 5.00944C10.2991 5.06783 10.5063 5.37802 10.4524 5.70377L10.2398 6.99039L11.3846 6.9904C11.7245 6.9904 12 7.27925 12 7.63557C12 7.99188 11.7245 8.28073 11.3846 8.28073L10.0266 8.28059L9.7707 9.82911L11.0154 9.82913C11.3553 9.82913 11.6308 10.118 11.6308 10.4743C11.6308 10.8306 11.3553 11.1195 11.0154 11.1195L9.55737 11.1195L9.32807 12.5073C9.27465 12.8306 8.98141 13.0472 8.6731 12.9912L8.66975 12.9906C8.35937 12.9322 8.1522 12.622 8.20604 12.2962L8.40041 11.1195H6.89891L6.66961 12.5073C6.61619 12.8306 6.32295 13.0472 6.01464 12.9912L6.01129 12.9906C5.7009 12.9322 5.49374 12.622 5.54758 12.2962L5.74196 11.1195L4.61538 11.1195C4.27552 11.1195 4 10.8306 4 10.4743C4 10.118 4.27552 9.82913 4.61538 9.82913L5.95514 9.82911L6.21103 8.28059L4.98462 8.28073C4.64475 8.28073 4.36923 7.99188 4.36923 7.63557C4.36923 7.27925 4.64475 6.9904 4.98462 6.9904L6.42421 6.99039L6.67193 5.49268C6.72535 5.16945 7.01859 4.95281 7.3269 5.00882L7.33025 5.00944C7.64063 5.06783 7.8478 5.37802 7.79396 5.70377L7.58132 6.99039H9.08281L9.33039 5.49268ZM8.61374 9.82911L8.86963 8.28059H7.36813L7.11225 9.82911H8.61374Z"
                                            fill="currentColor"></path>
                                        </svg>
                                        ${topic}` : ''}
                                    </div>
                                    ${main}
                                    <div class="card-stat">
                                        <div class="stat-item">
                                            <svg style="width: 18px; height: 18px;" xmlns="http://www.w3.org/2000/svg"
                                                xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 18 18" width="18"
                                                height="18">
                                                <path
                                                    d="M9.789075 2.2956175C8.97235 1.6308450000000003 7.74999 2.212005 7.74999 3.26506L7.74999 5.3915500000000005C6.642015000000001 5.5780325 5.3073725 6.040405 4.141735000000001 7.11143C2.809155 8.335825 1.751515 10.3041 1.45716 13.404099999999998C1.409905 13.9018 1.7595399999999999 14.22505 2.105415 14.317499999999999C2.442215 14.40755 2.8807175 14.314625 3.127745 13.92915C3.9664525 12.620249999999999 4.89282 11.894575 5.765827499999999 11.50585C6.4628049999999995 11.19545 7.14528 11.093125 7.74999 11.0959L7.74999 13.235025C7.74999 14.2881 8.97235 14.869250000000001 9.789075 14.2045L15.556199999999999 9.510425000000001C16.355075 8.860149999999999 16.355075 7.640124999999999 15.556199999999999 6.989840000000001L9.789075 2.2956175zM9.165099999999999 3.0768275000000003L14.895025 7.739050000000001C15.227975 7.980475 15.235775 8.468875 14.943874999999998 8.7142L9.17615 13.416800000000002C8.979474999999999 13.562024999999998 8.75 13.4269 8.75 13.227375000000002L8.75 10.638175C8.75 10.326975000000001 8.542125 10.134725 8.2544 10.1118C7.186765 10.02955 6.1563175 10.2037 5.150895 10.69295C4.14982 11.186925 3.2102250000000003 12.096525 2.573625 13.00995C2.54981 13.046975 2.52013 13.046025 2.5211725 12.986C2.8971525 10.0573 3.9373475 8.652125 4.807025 7.85305C5.87747 6.8694775 7.213197500000001 6.444867500000001 8.2272 6.33056C8.606525 6.287802500000001 8.74805 6.0849325 8.74805 5.7032275L8.74805 3.2615475C8.74805 3.0764875000000007 8.993175 2.9321925 9.165099999999999 3.0768275000000003z"
                                                    fill="currentColor"></path>
                                            </svg>
                                            <span>${forward}</span>
                                        </div>
                                        <div class="stat-item">
                                            <svg style="width: 18px; height: 18px;" xmlns="http://www.w3.org/2000/svg"
                                                xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 18 18" width="18"
                                                height="18">
                                                <path
                                                    d="M1.5625 7.875C1.5625 4.595807499999999 4.220807499999999 1.9375 7.5 1.9375L10.5 1.9375C13.779175 1.9375 16.4375 4.595807499999999 16.4375 7.875C16.4375 11.0504 13.944675 13.6435 10.809275 13.80405C10.097025 14.722974999999998 8.920875 15.880675 7.267095 16.331325C6.9735075 16.4113 6.704762499999999 16.286224999999998 6.55411 16.092325C6.40789 15.904149999999998 6.3561 15.634350000000001 6.4652449999999995 15.383025C6.72879 14.776249999999997 6.776465 14.221025000000001 6.7340175 13.761800000000001C3.8167675 13.387125 1.5625 10.894475 1.5625 7.875zM7.5 2.9375C4.773095 2.9375 2.5625 5.148095 2.5625 7.875C2.5625 10.502575 4.61524 12.651075000000002 7.2041924999999996 12.8038C7.4305875 12.817174999999999 7.619625000000001 12.981200000000001 7.664724999999999 13.203475C7.772575 13.734575000000001 7.8012 14.405425000000001 7.5884275 15.148399999999999C8.748325 14.6682 9.606 13.759825 10.151275 13.016475C10.24445 12.889475 10.392050000000001 12.8138 10.54955 12.812275C13.253575 12.785725 15.4375 10.58535 15.4375 7.875C15.4375 5.148095 13.226899999999999 2.9375 10.5 2.9375L7.5 2.9375z"
                                                    fill="currentColor"></path>
                                            </svg>
                                            <span>${comment}</span>
                                        </div>
                                        <div class="stat-item">
                                            <svg style="width: 18px; height: 18px;" xmlns="http://www.w3.org/2000/svg"
                                                xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 18 18" width="18"
                                                height="18">
                                                <path
                                                    d="M10.4511 2.2220125C10.218425 2.194885 10.002175 2.2953725 9.884175 2.433395C9.4264 2.9688525 9.321875 3.7501399999999996 8.978575 4.3581725C8.533574999999999 5.146395 8.1198 5.6213375 7.609775000000001 6.068507499999999C7.1751375 6.449565 6.738407499999999 6.697442499999999 6.3125 6.8050575L6.3125 14.854575C6.9198900000000005 14.868174999999999 7.572900000000001 14.876875 8.25 14.876875C9.936425 14.876875 11.367025 14.823325 12.33115 14.773699999999998C13.03235 14.737575 13.646025000000002 14.390075 13.966750000000001 13.81945C14.401900000000001 13.04535 14.9387 11.909650000000001 15.264174999999998 10.571200000000001C15.56665 9.327275 15.704699999999999 8.304325 15.766675 7.582224999999999C15.7988 7.208262500000001 15.50165 6.875019999999999 15.059999999999999 6.875019999999999L11.323274999999999 6.875019999999999C11.156575 6.875019999999999 11.000800000000002 6.791952499999999 10.907975 6.653499999999999C10.783725 6.468192500000001 10.82855 6.2670175 10.9037 6.07485C11.059 5.675084999999999 11.29355 4.9974475 11.382425000000001 4.4018275C11.470875000000001 3.80917 11.450999999999999 3.32219 11.212050000000001 2.86913C10.9571 2.3857825 10.66065 2.2464475 10.4511 2.2220125zM12.034300000000002 5.87502L15.059999999999999 5.87502C16.02035 5.87502 16.850875 6.64489 16.763 7.667825C16.697100000000002 8.435525 16.55155 9.5092 16.235825000000002 10.807500000000001C15.882625 12.259950000000002 15.3035 13.482225 14.838450000000002 14.309474999999999C14.32695 15.2194 13.377475 15.721150000000002 12.38255 15.772375C11.405125 15.822725 9.956949999999999 15.876875000000002 8.25 15.876875000000002C6.5961925 15.876875000000002 5.0846825 15.826025000000001 4.0136674999999995 15.77715C2.8370825 15.723474999999999 1.8519999999999999 14.850000000000001 1.725645 13.654824999999999C1.6404649999999998 12.849274999999999 1.5625 11.80725 1.5625 10.689375C1.5625 9.665175000000001 1.6279400000000002 8.736175 1.7045524999999997 7.998975C1.8351224999999998 6.7427075 2.9137075 5.87502 4.130655 5.87502L5.8125 5.87502C6.072015 5.87502 6.457235 5.7490675 6.9505175 5.316582499999999C7.377705000000001 4.942045 7.7193000000000005 4.5546075 8.107775 3.8665374999999997C8.492075 3.18585 8.605825 2.389785 9.124075 1.783595C9.452975 1.3988800000000001 9.99475 1.162025 10.5669 1.228745C11.16225 1.29816 11.717425 1.683875 12.09655 2.4025825000000003C12.478275 3.1262375000000002 12.474075 3.8618225 12.371500000000001 4.54938C12.302149999999997 5.0139949999999995 12.155425000000001 5.510059999999999 12.034300000000002 5.87502zM5.3125 14.82705L5.3125 6.875019999999999L4.130655 6.875019999999999C3.3792199999999997 6.875019999999999 2.77211 7.400795 2.6991975000000004 8.10235C2.6253525 8.812875 2.5625 9.70665 2.5625 10.689375C2.5625 11.762875 2.6374975 12.768475 2.7200975 13.549700000000001C2.7919925 14.229675 3.3521950000000005 14.74595 4.05924 14.778224999999999C4.4278775 14.795 4.849985 14.812050000000001 5.3125 14.82705z"
                                                    fill="currentColor"></path>
                                            </svg>
                                            <span>${like}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </body>
            </html>
        `
        // 多次尝试生成图片
        const attempts = 3
        for (let i = 0; i < attempts; i++) {
            try {
                // 判断渲染方式
                if (this.giConfig.renderType) { // 为1则为真，进入page模式
                    const htmlPath = 'file://' + __dirname.replaceAll('\\', '/') + '/page/0.html';
                    const page = await this.ctx.puppeteer.page()
                    await page.goto(htmlPath)
                    await page.setContent(html, { waitUntil: 'networkidle0' })
                    const elementHandle = await page.$('html')
                    const boundingBox = await elementHandle.boundingBox()
                    const buffer = await page.screenshot({
                        type: 'png',
                        clip: {
                            x: boundingBox.x,
                            y: boundingBox.y,
                            width: boundingBox.width,
                            height: boundingBox.height
                        }
                    })
                    await elementHandle.dispose();
                    await page.close()
                    return { buffer, link }
                }
                // 使用render模式渲染
                const pic = await this.ctx.puppeteer.render(html)
                return { pic, link }
            } catch (e) {
                if (i === attempts - 1) { // 已尝试三次
                    throw new Error('生成图片失败！错误: ' + e.toString())
                }
            }
        }
    }

    async getLiveStatus(time: string, liveStatus: number): Promise<[string, string, boolean]> {
        let titleStatus: string;
        let liveTime: string;
        let cover: boolean;
        switch (liveStatus) {
            case 0: {
                titleStatus = '未直播';
                liveTime = '未开播';
                cover = true;
                break;
            }
            case 1: {
                titleStatus = '开播啦';
                liveTime = `开播时间：${time}`;
                cover = true;
                break;
            }
            case 2: {
                titleStatus = '正在直播';
                liveTime = `直播时长：${await this.getTimeDifference(time)}`;
                cover = false;
                break;
            }
            case 3: {
                titleStatus = '下播啦';
                liveTime = `直播时长：${await this.getTimeDifference(time)}`;
                cover = true;
                break;
            }
        }
        return [titleStatus, liveTime, cover]
    }

    async getTimeDifference(dateString: string) {
        // 将日期字符串转换为Date对象
        const date = new Date(dateString)
        // 获取Unix时间戳（以毫秒为单位）
        const unixTime = date.getTime() / 1000
        // 获取当前Unix时间戳
        const now = this.ctx.ba.getTimeOfUTC8()
        // 计算时间差（以秒为单位）
        const differenceInSeconds = Math.floor(now - unixTime);
        // 获取yyyy:MM:dd HH:mm:ss
        const days = Math.floor(differenceInSeconds / (24 * 60 * 60));
        const hours = Math.floor((differenceInSeconds % (24 * 60 * 60)) / (60 * 60));
        const minutes = Math.floor((differenceInSeconds % (60 * 60)) / 60);
        const seconds = differenceInSeconds % 60;
        // 返回格式化的字符串
        return days ?
            `${days} 天 ${hours}小时${minutes.toString().padStart(2, '0')}分钟${seconds.toString().padStart(2, '0')}秒` :
            `${hours}小时${minutes.toString().padStart(2, '0')}分钟${seconds.toString().padStart(2, '0')}秒`
    }

    unixTimestampToString(timestamp: number) {
        const date = new Date(timestamp * 1000);
        const year = date.getFullYear();
        const month = ("0" + (date.getMonth() + 1)).slice(-2);
        const day = ("0" + date.getDate()).slice(-2);
        const hours = ("0" + (date.getHours())).slice(-2);
        const minutes = ("0" + date.getMinutes()).slice(-2);
        const seconds = ("0" + date.getSeconds()).slice(-2);
        return `${year}年${month}月${day}日 ${hours}:${minutes}:${seconds}`;
    }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace GenerateImg {
    export interface Config {
        renderType: number,
        filter: {
            enable: boolean,
            notify: boolean,
            regex: string,
            keywords: Array<string>,
            forward: boolean
        }
        removeBorder: boolean,
        cardColorStart: string,
        cardColorEnd: string,
        enableLargeFont: boolean,
        font: string,
        hideDesc: boolean
    }

    export const Config: Schema<Config> = Schema.object({
        renderType: Schema.number(),
        filter: Schema.object({
            enable: Schema.boolean(),
            notify: Schema.boolean(),
            regex: Schema.string(),
            keywords: Schema.array(String),
            forward: Schema.boolean()
        }),
        removeBorder: Schema.boolean(),
        cardColorStart: Schema.string(),
        cardColorEnd: Schema.string(),
        enableLargeFont: Schema.boolean(),
        font: Schema.string(),
        hideDesc: Schema.boolean()
    })
}

export default GenerateImg

