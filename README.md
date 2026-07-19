# Player Video

一个面向竖屏人物/主题介绍视频的可复用工作流。它把资料核验、三分钟中文文案、原创视觉素材、旁白、字幕时间轴、HyperFrames 动画和 FFmpeg 混音串成一条可审计的生产线。

当前已经包含两个 NBA 球员示例：JR·史密斯和马修·德拉维多瓦；同一套结构也可扩展到足球明星、其他体育明星、流行歌手和狗狗品种。

## 能做什么

- 720 × 960、30 fps 的竖屏视频，目标时长 160–210 秒
- 类似 `book-video` 的碎片拼合、候选对象闪切和主角定格片头
- `claims.csv`、`script.csv`、`assets.csv` 三套事实/字幕/版权真源
- Edge TTS 开发占位，或 ElevenLabs 正式配音；也可直接导入人工录音
- 按章节生成场景、字幕动画、BGM 混音并自动检查成片规格
- NBA 球员、足球明星、体育明星、歌手、狗狗品种五类主题适配器

## 快速开始（Windows）

前置条件：Node.js 22+、Python 3.10+、FFmpeg/ffprobe、Chrome，以及可联网运行 `npx`。完整安装方法见 [中文使用手册](docs/USAGE.zh-CN.md)。

```powershell
git clone https://github.com/604745886/player-video.git
cd player-video

py -m venv .venv-edge
.venv-edge\Scripts\python.exe -m pip install -r requirements-edge.txt
node scripts/init.mjs
```

先用已提供的文本示例检查工作流。示例的生成图片和音频不会随仓库发布，需要按手册补齐：

```powershell
npm.cmd run profile:validate -- matthew-dellavedova-3m v1
npm.cmd run profile:voice:edge -- matthew-dellavedova-3m v1 --sample-lines 8
npm.cmd run profile:voice:edge -- matthew-dellavedova-3m v1
npm.cmd run profile:audio:prepare -- matthew-dellavedova-3m
```

将你有权使用的 MP3 放到 `assets/bgm/your-licensed-bgm.mp3`，补齐 `assets.csv` 声明的图片后再渲染：

```powershell
npm.cmd run profile:preview -- matthew-dellavedova-3m v1
npm.cmd run profile:render -- matthew-dellavedova-3m v1 your-licensed-bgm.mp3 high
```

成片输出到 `episodes/<episode>/renders/`，生成媒体默认不进入 Git。

## ElevenLabs（可选）

密钥只能放在环境变量中，不能写进脚本、JSON、截图或 Git 提交：

```powershell
$env:ELEVENLABS_API_KEY = "你的密钥"
npm.cmd run profile:voice:elevenlabs -- matthew-dellavedova-3m v1 --sample-lines 8
npm.cmd run profile:voice:elevenlabs -- matthew-dellavedova-3m v1
npm.cmd run profile:audio:prepare -- matthew-dellavedova-3m
```

声音 ID、模型和语速由该期的 `brief.json` 控制。对于标准普通话，先用少量台词试听；不合格就更换原生中文音色。不要克隆未经授权的真人或名人声音。

## 仓库结构

```text
config/                 视频规格与主题适配器
episodes/               每期可追踪的研究、文案、分镜与素材清单
scripts/                验证、配音、预览、渲染和公开前审计
assets/sfx/             可再分发的通用音效及来源记录
assets/bgm/             本地授权音乐（MP3 默认不提交）
docs/                   使用手册与多 Agent 契约
```

## 发布前检查

```powershell
npm.cmd run check
npm.cmd run audit:public
git diff --check
```

`audit:public` 会检查已跟踪文件中的疑似密钥、私钥、生成媒体和超大文件。它是最后一道门，不替代人工确认。

## 文档

- [完整中文使用手册](docs/USAGE.zh-CN.md)
- [多 Agent 工作流与质量门](docs/multi-agent-profile-workflow.md)
- [安全与密钥处理](SECURITY.md)
- [每期目录说明](episodes/README.md)

## 版权与许可

代码使用 Apache-2.0。仓库不会分发商业歌曲、比赛转播片段、社交媒体下载内容、联盟/球队 Logo 或来源不明的照片。随仓库发布的演示音效来源记录见 `assets/ASSET_PROVENANCE.csv`；你加入的图片、音乐、字体、模型和第三方服务仍受各自条款约束。
