# 通用三分钟介绍视频：多 Agent 严格工作流

本工作流支持 `nba_player`、`footballer`、`athlete`、`singer` 与 `dog_breed`。旧版 `jr-smith` 60 秒流程保持兼容；新长片使用独立 episode 和 `profile-3m-v1`。

## 角色

1. **Producer / Orchestrator**：维护状态机与文件哈希，只提升已验收产物。
2. **Research Agent**：只生成 `research.md` 与 `claims.csv`，不写成片文案。
3. **Script Agent**：只使用已验证 claim，生成 `script.csv` 与读音表。
4. **Fact-check Agent**：逐句审校，不参与创作；未批准时禁止配音。
5. **Visual Agent**：生成 `storyboard.json`、`assets.csv`、`prompts.csv` 和原创位图。
6. **Audio Agent**：按章节生成或导入旁白，处理响度、停顿与读音。
7. **Timing Agent**：ASR 只推断时间，`script.csv` 始终是字幕真源。
8. **Video Agent**：用 HyperFrames 编译片头、正文、字幕与转场。
9. **QA Agent**：独立检查事实、版权、字幕、黑帧、音画同步和技术规格。

## 状态机

```text
INIT
→ RESEARCH_APPROVED
→ SCRIPT_APPROVED
→ STORYBOARD_APPROVED
→ MEDIA_READY
→ AUDIO_ALIGNED
→ CANDIDATE_RENDERED
→ QA_PASSED
→ ACTIVE_FINAL
```

任一阶段失败只能退回产生错误的 Agent。每个 Gate 最多自动修复两次，第三次转为 `needs_human_review`。不得通过关闭事实、字幕、对比度或版权检查来“通过”。

## 真源

- `claims.csv`：事实真源。
- `script.csv`：旁白和字幕真源。
- `assets.csv`：素材版权真源。
- `body-timings.json`：时间真源，必须记录脚本版本和音频哈希。
- `final-qa.json`：只有 QA 通过后才允许激活最终成片。

## 文案规格

- 正文 600–1000 个汉字，36–72 个朗读单元；最终以目标时长 Gate 为准。
- 每行是一个完整朗读单元，事实句必须填写 `fact_ids`。
- 推荐 6–9 章；开头建立具体矛盾，结尾留下余味，不做 CTA。
- 名人争议、伤病原因、法律问题和私人生活至少需要两条独立可靠来源，否则删除。

## 片头规格

沿用 book-video 的节奏语法：玻璃碎片拼合、同类别候选快速滚动、短黑场、目标定格、无跳变进入正文。候选名称和目标信息全部来自 episode 配置，不写死 NBA。

## 音频策略

1. 正式精品：用户真人录音，按章节录制，48kHz WAV 优先。
2. 中文批量：科大讯飞，按章节 12–25 秒分块；专名先跑读音样本。
3. 多语言或强表现力：ElevenLabs，但必须选原生中文音色并通过普通话试听门。
4. 本地 Windows TTS 只用于开发占位，不作为正式成片。

最终人声目标约 `-16 LUFS`；成片约 `-14 LUFS`，True Peak 不高于 `-1 dBTP`。BGM 在旁白下需降低约 18–24 dB。不得克隆未经授权的名人声音。

## 版权策略

参考视频只用于提炼节奏、章节和构图逻辑。禁止复用赛事转播、MV、电影片段、平台水印、社交媒体下载、联盟/球队 Logo 和来源不明的照片。优先使用原创 AI 位图、自有素材、明确授权素材和原创数据动效。
