# VidVeil

**为开放网络打造的 Shadow DOM 视频控制层。**

[简体中文](README.md) | [English](README.en.md)

VidVeil 是一款 Manifest V3 浏览器扩展，为符合条件的 HTML5 视频播放器提供统一、轻量的控制界面。它保留原有的 `<video>` 元素和媒体流，将界面隔离在 Shadow DOM 中，并支持无需刷新页面即可恢复网站原生播放器。

### 解决的问题与作用

不同网站的视频播放器，按钮长得不一样、操作方式也不一样。VidVeil 就像给这些视频加上一套熟悉的“统一遥控器”，让你用相似的方式播放、快进、调音量或全屏。它不会替换或下载视频；

## 功能特性

- **统一控制**：播放、进度拖动、缓冲进度、音量、倍速、全屏和画中画。
- **Shadow DOM 样式隔离**：VidVeil 的界面与样式不受网页 CSS 干扰。
- **原生播放器 UI 屏蔽**：VidVeil 启用时尽力隐藏检测到的原生控制层；恢复原版播放器时还原其状态。
- **按站点配置规则**：可强制启用或屏蔽指定域名；默认内置 YouTube、Bilibili、Netflix、爱奇艺、优酷、抖音、TikTok、Twitch 和 Disney+ 等站点的豁免规则。
- **即时切换**：可从控制层或扩展弹窗启用 VidVeil 或恢复原版播放器，无需刷新页面。跨域 iframe 会按照其顶层站点规则处理。
- **视频手势**：单击播放/暂停、双击全屏、横向拖动跳转、长按临时 3 倍速，以及桌面端滚轮调节音量。
- **帧预览**：尝试从可跳转且允许跨域读取的媒体源生成 JPEG 预览；支持时也会读取 WebVTT 缩略图轨道。受限流媒体会显示时间戳和说明作为回退。
- **注重隐私**：设置保存在浏览器本地。缩略图从网站提供的媒体源提取；VidVeil 不提供媒体代理，也不会将提取帧上传到 VidVeil 服务器。

## 环境要求

- Node.js 20 或更高版本，以及 npm。
- 支持 Manifest V3 的 Chromium 内核浏览器，例如当前版本的 Chrome 或 Microsoft Edge。
- 安装 npm 依赖需要网络。视频播放和帧预览还取决于媒体主机是否可用及浏览器的 CORS 限制。

目前未提供 Safari 和 iOS 浏览器扩展包。Android 浏览器是否可用，取决于其是否支持桌面风格扩展和 Manifest V3。

## 从源码构建

```bash
npm install
npx wxt prepare
npm run compile
npm run build
```

Chrome 兼容的未打包扩展输出到 `.output/chrome-mv3`。

创建分发压缩包：

```bash
npm run zip
```

启动支持扩展自动重载的本地开发构建：

```bash
npm run dev
```

## 加载未打包扩展

1. 执行上面的构建命令。
2. 在 Chrome 打开 `chrome://extensions`，或在 Edge 打开 `edge://extensions`。
3. 开启**开发者模式**。
4. 点击**加载已解压的扩展程序**，选择项目的 `.output/chrome-mv3` 目录。
5. 打开或刷新视频网页，并使用 VidVeil 弹窗查看当前域名或调整站点规则。

安装或重新加载扩展之前已经打开的网页，可能需要刷新一次才能运行内容脚本。

## 本地测试页

仓库包含 `test-playground.html`，提供标准视频、小尺寸视频、装饰性背景视频和动态插入视频等测试场景。

在项目根目录启动本地 HTTP 服务：

```bash
python -m http.server 4173 --bind 127.0.0.1
```

然后访问 `http://localhost:4173/test-playground.html`，并在 VidVeil 弹窗中启用 `localhost`。测试视频由 Video.js 托管，因此测试页需要联网。`localhost` 和 `127.0.0.1` 会被视为不同的域名规则。

## 站点规则优先级

规则引擎按以下顺序评估主机名：

1. **用户白名单**：强制启用该域名，即使它命中内置豁免规则。
2. **用户屏蔽列表**：由网站播放器继续控制。
3. **内置豁免**：启用内置忽略设置时生效。
4. **默认规则**：允许 VidVeil 评估是否接管符合条件的视频。

`*.example.com` 这样的通配规则同时匹配 `example.com` 及其子域名。尺寸过小、时长过短、直播（`duration === Infinity`）或疑似静音循环装饰视频的候选项会被跳过。

## 操作方式

| 操作 | 效果 |
| --- | --- |
| 单击视频 | 播放或暂停 |
| 双击视频 | 切换全屏 |
| 在视频上水平拖动 | 跳转；约每 5 像素跳转 1 秒 |
| 在视频上按住 | 临时使用 3 倍速 |
| 在视频上滚动鼠标滚轮 | 调节音量 |
| `Space` | 播放或暂停 |
| `ArrowRight` / `ArrowLeft` | 按住右键临时 3 倍速；点击右键快进 5 秒；左键后退 5 秒 |
| `ArrowUp` / `ArrowDown` | 调节音量 |
| `F` | 切换全屏 |

点击**恢复原版播放器**即可将控制权交还给网页。当 VidVeil 在该站点处于启用状态时，也可以通过紧凑的**启用 VidVeil**启动按钮重新启用，无需刷新页面。

## 权限说明

扩展申请以下 Manifest V3 权限：

- `storage`：在浏览器本地保存站点规则。
- `activeTab` 和 `scripting`：支持与当前标签页及扩展工具交互。
- `<all_urls>` 主机访问权限：检查网页中的符合条件的视频元素，包括嵌入式播放器 iframe，并将控制层显示在原视频上方。

通用视频控制器需要较广泛的主机访问权限。站点规则和内置豁免决定 VidVeil 实际在哪些位置扫描并挂载控制层。

## 已知限制

- VidVeil 保留原媒体和播放引擎，但网站仍可能执行自己的键盘快捷键、弹层、DRM 或播放器逻辑。对不同播放器的原生 UI 屏蔽属于尽力而为。
- Canvas 帧提取需要可跳转的媒体源，且媒体主机的 CORS 策略允许读取。`blob:`/MSE 或 DRM 流可能无法提供可复用源，此时 VidVeil 会显示时间戳或不支持说明。预览按 2 秒时间段对齐，不保证精确到目标帧。
- 网站可能随时更改 iframe 布局、播放器 DOM 或媒体源，因此不同网站和浏览器的兼容性会有差异。
- 触控手势、原生全屏行为和画中画支持因移动浏览器而异。目前未提供专用移动端扩展包，也未完成全面的真实设备认证。

## 项目结构

```text
src/
├── components/       # Shadow DOM Vue 播放器界面
├── core/             # 播放器生命周期、原生 UI 屏蔽和页面启动器
├── entrypoints/      # WXT 后台脚本、内容脚本和弹窗
├── presets/          # 内置豁免域名
├── types/            # 共享 TypeScript 类型
└── utils/            # 存储、规则引擎和帧提取
```

## 配置迁移

从早期 UniPlayer 版本升级时，VidVeil 会读取已有的 `uniplayer:config` 设置，并将其复制到 `vidveil:config`。现有白名单和屏蔽列表偏好会被保留。

## 参与贡献

欢迎提交 Issue 和 Pull Request。提交更改前请运行：

```bash
npm run compile
npm run build
```

如果更改涉及播放器、帧预览或 iframe，请使用 `test-playground.html` 验证相关场景，并在适用时通过真实浏览器测试目标网站。

## 许可证

本项目采用 [MIT 许可证](LICENSE)。
