# Player Video 中文使用手册

这份手册从空环境开始，走完“选题 → 研究 → 文案 → 视觉 → 配音 → 对齐 → 渲染 → QA”的三分钟成片流程。默认以 Windows PowerShell 为例。

## 1. 环境准备

需要安装：

- Node.js 22 或更高版本
- Python 3.10 或更高版本
- FFmpeg，并确保 `ffmpeg`、`ffprobe` 能在终端直接执行
- Google Chrome
- Git

初始化：

```powershell
git clone https://github.com/604745886/player-video.git
cd player-video
py -m venv .venv-edge
.venv-edge\Scripts\python.exe -m pip install -r requirements-edge.txt
node scripts/init.mjs
```

如果 PowerShell 禁止执行 `npm.ps1`，直接使用 `npm.cmd`；无需修改系统执行策略。

## 2. 每期目录契约

每个主题使用独立目录 `episodes/<episode>/`。公开仓库只跟踪文本和配置，不跟踪生成媒体。

| 文件 | 负责角色 | 用途 |
| --- | --- | --- |
| `brief.json` | Producer | 主题类型、对象、时长、音色、片头和渲染设置 |
| `research.md` | Research | 研究摘要及来源链接 |
| `claims.csv` | Research / Fact-check | 可被文案引用的事实真源 |
| `script.csv` | Script | 旁白与字幕真源；每行一个完整朗读单元 |
| `pronunciation.csv` | Audio | 人名、队名、外语词的读音约定 |
| `storyboard.json` | Visual | 章节、画面、版式和镜头运动 |
| `assets.csv` | Visual / QA | 本地素材路径、来源和授权状态 |
| `prompts.csv` | Visual | 原创氛围图生成提示词 |
| `intro-items.json` | Video | 片头候选列表和目标对象 |
| `final-qa.json` | QA | 成片检查结果；本地生成文件可按需保留 |

可以复制 `episodes/matthew-dellavedova-3m/` 的文本文件作为新一期骨架，但必须替换所有人物资料、事实 ID、片头候选和素材路径。

## 3. 多 Agent 严格流程

推荐角色和交接顺序：

1. Producer：创建 episode、确定 `subjectType` 和质量门。
2. Research Agent：查找一手或权威来源，写 `research.md` 与 `claims.csv`。
3. Script Agent：只引用 `status=verified` 的 claim，写 600–1000 个汉字、36–72 个朗读单元。
4. Fact-check Agent：逐句核对，不参与润色；未通过时禁止配音。
5. Visual Agent：写 `storyboard.json`、`assets.csv`、`prompts.csv`，只使用原创或明确授权素材。
6. Audio Agent：先试听专名和 6–8 行正文，再生成全文。
7. Timing Agent：生成 `body-timings.json`；字幕文字仍以 `script.csv` 为准。
8. Video Agent：创建 HyperFrames 预览并渲染静音画面，再用 FFmpeg 混音。
9. QA Agent：检查事实、版权、字幕、黑帧、同步、响度和编码规格。

更严格的输入/输出契约和失败回退规则见 [多 Agent 工作流](multi-agent-profile-workflow.md)。

## 4. 资料和文案

先选择 `config/subject-types/` 中的类型：

- `nba-player.json`
- `footballer.json`
- `athlete.json`
- `singer.json`
- `dog-breed.json`

重要事实必须写入 `claims.csv`。`script.csv` 的 `fact_ids` 使用分号连接；没有 claim 的情绪性过渡句可留空。争议、伤病原因、法律问题、私人生活和医疗建议需要更高证据门槛。

完成文本和素材清单后运行：

```powershell
npm.cmd run profile:validate -- <episode> v1
```

验证器会检查文案长度、行号、未核验 claim、分镜章节、素材授权状态和本地素材是否存在。

## 5. 视觉素材

根据 `prompts.csv` 生成原创氛围图，然后保存到 `episodes/<episode>/images/`，并让 `assets.csv.local_path` 指向实际文件。

`assets.csv.rights_status` 必须为 `cleared` 才能继续。不要使用：

- NBA、足球或其他赛事转播截图
- MV、电影片段和演唱会盗录
- 联盟、球队、俱乐部或品牌 Logo
- 从社交平台直接下载的图片/视频
- 不知道作者与许可的照片

参考视频只能用于学习节奏和结构，不能成为成片素材。

## 6. 配音方案

### 方案 A：Edge TTS（开发占位）

```powershell
npm.cmd run profile:voice:edge -- <episode> v1 --voice zh-CN-YunxiNeural --sample-lines 8
npm.cmd run profile:voice:edge -- <episode> v1 --voice zh-CN-YunxiNeural
npm.cmd run profile:audio:prepare -- <episode>
```

脚本会生成正文音频、片头音频和逐句时间轴。Edge TTS 适合低成本预览，不建议直接作为精品成片声音。

### 方案 B：ElevenLabs（可选）

```powershell
$env:ELEVENLABS_API_KEY = "你的密钥"
npm.cmd run profile:voice:elevenlabs -- <episode> v1 --sample-lines 8
npm.cmd run profile:voice:elevenlabs -- <episode> v1
npm.cmd run profile:audio:prepare -- <episode>
```

在 `brief.json.audio` 中设置 `voiceId`、`voiceName`、`model` 和 `speed`。先测试中文专名和普通话自然度，再支付全篇字符成本。

### 方案 C：人工录音或其他 TTS

最终渲染需要这三个文件：

```text
episodes/<episode>/audio/intro-voiceover-story.mp3
episodes/<episode>/audio/body-voiceover-story.mp3
episodes/<episode>/audio/body-timings.json
```

人工录音建议 48 kHz WAV 母版，再转成 MP3 供渲染；正文目标约 -16 LUFS。时间轴中的每项必须包含 `order`、`chapter`、`start`、`end`、`text`，并与 `script.csv` 一一对应。

Edge TTS 和 ElevenLabs 首先生成未处理的 `intro-voiceover.mp3`、`body-voiceover.mp3`；`profile:audio:prepare` 使用 FFmpeg 生成渲染所需的 `*-story.mp3`。人工录音也可以使用同一命令处理，或自行提供已经完成响度处理的 story 文件。

## 7. 预览和渲染

把有授权的音乐放入 `assets/bgm/`。音乐文件被 `.gitignore` 排除，不会意外上传。

```powershell
npm.cmd run profile:preview -- <episode> v1
npm.cmd run profile:render -- <episode> v1 your-licensed-bgm.mp3 high
```

也可以给出音乐的绝对路径：

```powershell
npm.cmd run profile:render -- <episode> v1 "E:\素材\已授权音乐.mp3" high
```

质量参数可选 `draft`、`standard`、`high`。渲染过程会执行 HyperFrames 的 lint、validate、关键帧 inspect 和最终 render，再用 FFmpeg 混合片头、人声、BGM 与音效。

## 8. 成片验收

目标规格：

- 720 × 960，30 fps
- 160–210 秒
- H.264/AAC（具体编码由渲染和 FFmpeg 环境决定）
- 有音轨，成片约 -14 LUFS，True Peak 不高于 -1 dBTP
- 字幕覆盖所有朗读单元，无截断、遮挡、黑帧和明显不同步
- 所有事实可回溯到 `claims.csv`，所有素材可回溯到 `assets.csv`

运行项目级检查：

```powershell
npm.cmd run check
npm.cmd run audit:public
git diff --check
```

## 9. 环境变量与密钥

`.env.example` 只列变量名，不含真实值。当前脚本直接读取进程环境变量；如果你复制为 `.env`，还需要由你自己的启动器加载它。

不要：

- 把 Key 写进 `brief.json`、脚本、README 或命令历史截图
- 把 `.env`、云服务凭证 JSON、私钥或会话 Cookie 提交到 Git
- 在 Issue、PR、日志和录屏中展示完整 Key

一旦泄露，立即在服务商控制台撤销并重新生成；仅从 Git 删除文件不等于删除历史。

## 10. 常见问题

### `npm.ps1` 被禁止

在 PowerShell 中改用 `npm.cmd`。

### `ffmpeg` 或 `ffprobe` 找不到

安装 FFmpeg，并把其 `bin` 目录加入 PATH；关闭并重开终端后验证 `ffmpeg -version`。

### 普通话像外国人

不要只调语速。先换原生中文音色，用专名表逐个试听；仍不自然时优先使用讯飞等中文 TTS 或人工录音。当前仓库没有内置讯飞长文本适配器，避免误以为填写环境变量后会自动调用。

### 校验提示素材不存在

这是预期行为：示例生成图片不随仓库发布。按 `prompts.csv` 生成或准备你有授权的图片，并更新 `assets.csv.local_path`。

### 想上传示例成片

先确认所有图片、音乐、字体、人声和肖像使用权。大文件建议放 GitHub Release 或对象存储；不要直接提交到源码历史。
