# QwenPaw轻量助手 — 设计演进文档

> **【2026-10-18 注记】需求图谱已作废**（用户判定为项目早期临时文档，不再更新）。本文档各决议「传播面」字段中的「需求图谱.md」指向不再有效，设计演进文档仍为唯一事实源。

> 本文档是本项目的唯一事实源——设计理由和决议全部通过此处备查。
> 结构：摘要层（决议表）＋ 详情层（论证史）＋ 开放事项表。

---

## 摘要层（决议表）

| 编号 | 摘要 | 类型标签 | 状态 | 出处 | 传播面 |
|---|---|---|---|---|---|
| D1 | 项目定位：QwenPaw 的轻量桌面入口，Console 的补充而非独立产品 | 范围 | 现行 | 2026-10-12 用户："这个项目只是一个窗口，是console的补充，最终是在console来汇集的" | 需求图谱.md §1 |
| D2 | 不自建 agent 能力，全部复用 QwenPaw 后端（工具/技能/记忆/模型） | 机制 | 现行 | 2026-10-12 用户："相对应的需要的功能，skill，工具，插件，记忆系统，模型其实都是取材于qwenpaw" | 需求图谱.md §1 |
| D3 | 不是 QwenPaw 插件/Skill，是独立桌面客户端，与 Console 平级 | 范围 | 现行 | 2026-10-12 用户确认非插件；"App 和 Console 平级，都是 QwenPaw 的前端入口" | 需求图谱.md §1 |
| D4 | 交付形态：dmg/exe 桌面软件，纯前端壳不打包后端，< 10MB | 范围 | 现行 | 2026-10-12 用户："那这个项目其实是一个dmg或者exe的一个软件是吗？" → 确认 | 需求图谱.md §6 |
| D5 | 不做代码签名，首次启动手动信任（同 Atd / QwenPaw Desktop） | 运维 | 现行 | 2026-10-12 用户确认签名非必需，接受手动信任方案 | 需求图谱.md §6 |
| D6 | Session 机制：持久化单 session + 「新建」按钮清空上下文 + Console 管所有管理【2026-10-16 修订：本地持久化 current_agent_id + current_session_id（可空）；session 默认跟随该 agent 最近活跃，新建 Session 生成新 id 持久化（等同 Console 新对话），见 D15】 | 机制 | 现行 | 2026-10-12 用户："新建session只是为了清理app这个对话内的上下文……留着一个新建session的入口" | 需求图谱.md §5 |
| D7 | Session_id 格式：时间戳，与 Console 生成规则一致 | 机制 | 现行 | 2026-10-12 用户："那和console用一样的规则呢？" → 确认 | 需求图谱.md §5 |
| D8 | 信息精简：thinking 折叠/隐藏，工具调用显示摘要，不全量透传 | 机制 | 现行 | 2026-10-12 用户："界面简洁，信息集中（不像qwenpaw反应出来的内容很多）" | 需求图谱.md F6 |
| D9 | 所有场景统一走对话交互，不做场景专用 UI（文档修改/视频音频等） | 范围 | 现行 | 2026-10-12 用户确认"第一版的所有场景，统一走对话这一个交互模式" | 需求图谱.md §4 |
| D10 | 目标用户为 QwenPaw 社区用户，发布渠道为 GitHub + QwenPaw 社区；QwenPaw 依赖处理简化为连接配置+离线提示，不做安装引导 | 范围 | 现行 | 2026-10-12 用户："有个前提，我想要发布到的是qwenpaw的社区（可以发布到github上然后链接到qwenpaw社区）" | 需求图谱.md §6 §7 |
| D11 | 界面轻量化设计：视觉简约、元素最小化、前端风格轻量，不做侧边栏/导航/设置面板等重 UI 元素 | 范围 | 现行 | 2026-10-12 用户："这次定位是轻量化的入口，那界面设计要轻量化，简约化，包括前端风格也是" | 需求图谱.md §6 |
| D12 | 合并功能清单：基于 Atd + Pinland 源码深度分析，整合两项目可借鉴功能为统一清单（10 域 35 项），MVP 收敛为 9 项 P0 | 范围 | 现行 | 2026-10-12 agent 源码分析后用户确认"把这两个软件功能合并一下" | 需求图谱.md §4 |
| D13 | 开发策略：纯路径 B——新起独立项目，只依赖 QwenPaw REST API 文档，不依赖 @agentscope-ai/chat 包，不 fork Console 代码 | 机制 | 现行 | 2026-10-12 用户确认 API 自实现 + UI 重编 | 需求图谱.md §8 |
| D14 | Slash 命令策略：复用 QwenPaw Console 原生 `/` 命令体系（透传后端处理），不自建 App 专属命令；App 仅识别 `/` 前缀 + 透传 + 渲染返回结果 | 机制 | 现行 | 2026-10-16 用户："是不是参考qwenpaw的colson的【/快捷指令】的设计？单独新做4个指令没有意义啊？" → 确认方案 A | 需求图谱.md §4（待传导） |
| D15 | Agent 切换策略：App 内可选 agent（顶部下拉），切 agent = 接该 agent「置顶优先+最近活跃」session；channel 固定 console（与 Console 共享、与其他平台隔离）；本地持久化 current_agent_id + current_session_id（可空），新建 Session 生成新 id 持久化（等同 Console 新对话）【2026-10-16 修订：新建 Session 语义按用户纠正修正】 | 机制 | 现行 | 2026-10-16 用户："我觉得用B吧……你切换agent只是调用这个agent，自然继承其session和上下文" → 确认形态 B + channel console；"「新建 Session」应该是和后端qwenpaw一样的，相对新建一个qwenpaw里面的session" | 需求图谱.md §4 §5（待传导） |
| D16 | 界面设计：四类信息分区（用户消息右对齐气泡 / agent 动作左对齐工具行 / agent 回复左对齐纯文本）；工具行 = 完成对勾 + 运行 shimmer + 文件 chip + 尾部数据，文字灰化，参数默认收起点击展开；答案内代码用引用式与工具卡片分离；界面稿 v1-v7 存于项目目录 | 机制 | 现行 | 2026-10-16 用户逐版确认界面稿 v3-v7；工具行形态依据 Atd transcript 源码实证（MessageBubble / tool-block / Disclosure completed / "chrome around the answer"） | 需求图谱.md §4（待传导） |
| D17 | 窗口背景机制：参考 Atd 模式——macOS 26+ 走 Liquid Glass（NSGlassEffectView Regular/radius20，自带 light rim）+ 旧系统 vibrancy 回退（非 CSS blur），窗口层透、内容层实（never glass，fill 0.80 对齐 Atd token）；平台范围待定（#24）【2026-10-18 校准：冒烟实证 NSVisualEffectView 在 macOS 26 无 rim，升级 Liquid Glass 双路径】 | 机制 | 现行 | 2026-10-16 用户要求"和atd一样"；2026-10-17 用户确认 hudWindow 方向；2026-10-18 用户确认玻璃质感升级；依据 Atd GlassSurface.swift/NativeMaterialView.swift 实证 | 需求图谱.md §6（待传导） |
| D18 | 前端渲染策略：Markdown 自定义最小化渲染器——零依赖，只支持界面所需格式（代码块/行内代码/列表/链接/粗体），不引 react-markdown/remark 生态 | 机制 | 现行 | 2026-10-17 用户："本身就是小界面，所以未必会用到很多格式和图画，最简单的信息交互就好了。定义为轻型的" | 需求图谱.md §8（待传导） |
| D19 | 历史消息加载：打开 App / 切换 agent 时拉当前 session 最近 N 条（默认 20）历史消息，按 D8 过滤后渲染；更早历史归 Console，拉取失败降级为空窗口 | 机制 | 现行 | 2026-10-17 用户认可加载方案（不加载则每次打开是空白窗，"轻量入口"变"失忆入口"） | 需求图谱.md §4（待传导） |
| D20 | 测试基建：vitest 集成测试为流式链路回归网（4/4）；wdio e2e 已落地（4 spec：glass 洗白回归/slash 双 Enter/smoke 新建/tools 展开，连跑两次 4/4 + 用户 session 零增长隔离）；Computer Use 在 TUI 版 QwenPaw 不可用，GUI 实测以人工冒烟进行【2026-10-18 校准：wdio 接入完成，含 vite 生命周期管理+spec 级 localStorage 隔离+端口错开 4446】 | 机制 | 现行 | 2026-10-18 MVP 验收后接入 wdio 并三轮修复闭环（hook 时序→spec 级、vite 生命周期、调试残留清理） | 验收报告-最终任务验收-20261018.md |
| D21 | W4 呼出入口形态：桌面浮球替代 Tray Icon——44px 圆形 Liquid Glass + ✦ 图标，四状态【2026-10-19 修订：浮球材质从 Liquid Glass 改实色质感 + 大小 44→50px，见 D26】（常态/生成中呼吸/新消息角标/拖动中）；单击呼出/双击新建/右键菜单/拖动记忆+角落吸附；呼出动画=主窗口全尺寸出现+内容层 CSS scale(0.3→1)+opacity morph（transform-origin 朝浮球，cubic-bezier(0.16,1,0.3,1)，280ms）；置顶开关（一直在前面/恢复正常前后）；右键菜单合并单层【2026-10-19 修订：呼出动画规格被 D24 升级为 Dock 式三段接力（浮球收缩预备 + 主窗口内容层 scale 展开 + 收回时浮球 spring 弹回），本条其余形态/交互不变】 | 机制 | 现行 | 2026-10-18 用户："我觉得可以给浮球一个设置选项【一直在前面】或者【恢复正常前后】关系。形态上，就是一个圆的，中间可以加个小图标"；Atd DesktopPins 形态实证 | 界面稿存项目目录（浮球设计稿+动画演示稿） |
| D22 | 浮球文件投放点：文件除拖到主窗口外，可拖到浮球——upload + 自动呼出主窗口 + chip 出现，与 F3 互补（主窗口可见拖主窗口/隐藏时拖浮球）；拖入态视觉=浮球放大 scale(1.15)+绿边光晕+图标变 📥；透明命中区扩至 ~60px；transparent 窗口拖拽接收性待实测 | 机制 | 现行 | 2026-10-18 用户："用户将文档除了拉拽到主窗口会喂agent，也可以拉拽到浮球那边一样的效果，同时自动呼出主窗口" | 界面稿存项目目录 |
| D23 | 浮球通知态体系：浮球升级为桌面通知中心——7 状态（常态 / 生成中绿呼吸 / 审批待审黄边❚❚ / 任务完成蓝边✓ / 错误红边! / 拖动中 / 拖入态）；三维度分工 = 颜色（4 色语义封闭系统：绿=进行中 / 黄=待行动 / 蓝=新内容 / 红=需处理【2026-10-20 修订：颜色语义对调——生成中/进行中=蓝、完成/成功=绿，与主流语义对齐，见 D27】）+ 大小（仅手势态放大，通知态固定 44px 不放大【2026-10-19 修订：44px→50px，见 D26】）+ 覆盖层（半透明标记 opacity .45，中间小爪图永不变）；生命周期 = 审批待审跟 pending 不自动消失（300s 后端超时兜底）、完成 / 错误为纯通知 hover 即清除或自动降级；优先级覆盖链 = 拖入态 > 拖动中 > 审批待审 > 错误 > 任务完成 > 生成中 > 常态；粒子 = 状态进入一次性迸发 ~600ms（8 颗，生成中不加）；app 边界实证 = 需输入状态砍掉（QwenPaw schemas.py MessageType enum 无 question 类型，agent 问问题 = 普通文本 token，app 无判断能力），审批信号 = GET /api/console/push-messages 的 pending_approvals，错误 = SSE 流内 {"error"} + RunStatus.Failed（sse.ts 可补），完成 = SSE response/completed | 机制 | 现行 | 2026-10-18 用户："浮球可以增加更多的简单交互……可以设计一套基于浮球的通知规则……通过浮球周围颜色，浮球大小，浮球图片上覆盖一层透明浅色的标记等方案进行交互"；"完成和错误还是要区分的，毕竟还是不一样的"；"我觉得设计交互的时候，还是需要充分考虑现在app的边界"；2026-10-19 用户："我看了下感觉和macos不是很搭配" | 界面稿：QwenPaw-轻量助手-浮球通知态+审批卡片设计稿-20261018-232400.html |
| D24 | Dock 式呼出动画（修订 D21 动画规格）：浮球 = Dock 替身叙事，呼出 / 收回改三段接力——① 浮球收缩 120ms（cubic-bezier(.4,0,1,1) 吸入预备）② 主窗口 scale .35→1 + opacity 280ms（cubic-bezier(.16,1,.3,1)，transform-origin bottom right 朝浮球）+ 浮球同步淡出让位 150ms；收回反向 = ③ 主窗口收缩 280ms ④ 浮球 spring 弹回 200ms（cubic-bezier(.34,1.56,.64,1) overshoot）；全程不动窗口尺寸——避开 Tauri set_size RAF 三硬伤（每帧 set_size 重排性能坑 / WebView 内容拉伸模糊 / 44px 浮球 ↔ 380px 窗口巨大尺寸差掉帧）；完整 genie 为 macOS 私有 API（mesh transform，第三方 App 不可调用，公开近似路径仅 CAMeshTransform + AppKit window transform，属原生 Swift 路径 Tauri 走不了） | 机制 | 现行 | 2026-10-19 用户："我在想用macos27的缩放进入dock的动画，用在app的主界面和浮球之间的动画，你看有可能吗？"；"画一版给我看看"；"我看了下，这个动画演示OK的" | 界面稿：QwenPaw-轻量助手-浮球Dock式呼出动画演示-20261019-225500.html；D21（原动画规格被本条修订） |
| D25 | 审批卡片三层设计（A1）：基于 QwenPaw PendingApproval 17 字段实证减枝——默认层 = tool_display_name + severity + findings_summary + reasoning（空则隐藏）+ 批准 / 拒绝按钮；展开层 = tool_params + exact/similar scope（is_generalized 为 true 时）；完整详情跳 Console；app 零摘要原则 = findings_summary（后端 driver_gate 结构化理由，必有）与 reasoning（后端 get_f1_reasoning 取的 agent 一句话理由，可能空）均为后端成品，app 直接展示不截断不概括；审批感知 = 轮询 GET /api/console/push-messages 检查 pending_approvals + diff 已知 id（新 pending 才触发浮球态）+ resolved 自动 prune（借鉴 Console osNotifyStore 实证机制）；审批 UX = 双入口先点先生效（App 与 Console 同显审批，一边决策另一边 prune 自动收起）、300s 后端超时兜底、关闭语义待定（桌宠插件实证 claude-code agent_id 下关闭审批气泡 = deny，MiniCPM 既定语义） | 机制+数据 | 现行 | 2026-10-18 用户："1）对审批卡片内容需要精炼，仅仅是核心内容，如果详细要看让用户去console或者desktop版本去看。2）用折叠展开是方式来做，显示核心内容，需要看的话展开"；"你需要根据qwenpaw的审批页的设计字段进行减枝到你的审批卡片上"；"你默认显示这部分一句话理由这个信息从哪里来，谁做摘要？"；"审批感知这个问题，你有没有参考桌宠插件这个项目当时的方案？" | 界面稿：同 D23；App 审批轮询 + 卡片（待实现） |
| D26 | 浮球材质选定：实色质感（参考豆包悬浮球，修订 D21 材质+大小 / D23 大小）：浮球从 Liquid Glass 玻璃改为实色质感——白→浅灰渐变（#fff→#f0f0f3）实色 + 多层柔和阴影（0 4px 14px + 0 1px 3px + inset 白高光），像 macOS 原生按钮/HUD 控件语言；状态色表达从"彩色边框+光晕"改为"2px 彩色 ring（box-shadow 0 0 0 2px color）+ 深色覆盖层符号（opacity .7）"——白底上深色符号对比强可读性好【2026-10-20 修订：状态色表达由本条 2px ring+覆盖层符号改为细边框流光+苹果风角标，见 D27；材质实色不变】；浮球大小从 44px 调到 50px（参考豆包）；中间小爪图保留（用户自设计，建议单色线性风 SF Symbols 爪印）；主窗口背景机制不变（D17 仍 Liquid Glass，本条仅修订浮球） | 机制 | 现行 | 2026-10-19 用户截豆包 app 悬浮球图后对比两版本选定："看了下还是实色质感的好看，就定这个吧"；"大小的话，豆包那个大小就挺好的"；"总结内容，放小爪图，我设计一下" | 界面稿：QwenPaw-轻量助手-浮球材质对比设计稿-20261019-233923.html；D21（材质+大小修订）；D23（大小修订） |
| D27 | 浮球柔和光晕版定稿（修订 D23 颜色语义 / D26 状态色表达）：形态骨架沿用 2026-10-20 最终版——细边框流光（1.6px 沿边缘滑动，头亮尾淡 + 5px 头亮点 + 尾部 3 颗粒子拖尾）+ 生成中整球呼吸（1.6s scale 1→1.08）+ 苹果风角标（17px，2/3 压浮球，2px 白边）；质感层三改 = ① 色值柔化（降饱和 + 提明度，粉彩方向：蓝 #93c5fd / 绿 #86efac / 黄 #fcd34d / 红 #fca5a5）② 光晕分层（角标双层 box-shadow 近 6px 实 + 远 14px 虚叠加真实辉光；流光 drop-shadow 从 4px/75% 改 6px/45%，从"一道硬光"变"一圈氛围"；背景 #0a0a0c→#0b0e14 蓝黑，冷色光晕有底色呼应）③ 语义修正（生成中=蓝=进行中、完成=绿=成功，与主流语义对齐；红/黄警示色柔色值 + 强光晕补存在感，柔而不失辨识）；骨架/几何/交互/速度不变，仅调色值与光晕 | 机制 | 现行 | 2026-10-20 用户："生成中和进行中应该是一样，都是蓝色的"；"我的确是希望调整质感"；"这个浮球柔和光晕版本非常好，就定这个吧" | 界面稿：QwenPaw-轻量助手-浮球柔和光晕版-20261020-220000.html；D23（颜色语义修订）；D26（状态色表达由 ring+覆盖层改流光+角标） |
| D28 | 浮球弧形菜单（修订 D21 右键菜单）：右键浮球触发连续弧带菜单，替代原 contextmenu 传统列表——形态 = 单条粗 stroke 圆头端弧带（stroke-width 48 + linecap round，非扇形切片拼合），4 图标为弧上位置标记；内容 6→4 项（置顶 / 新建 / 隐藏 / 退出，砍掉「呼出」与「位置重置」——呼出靠单击主路径、位置重置靠角落吸附已覆盖）【2026-10-20 修订：内容 4→5 项（新增快捷键设置，见 D32）→ 回到 4 项（快捷键设置移到主窗口角落面板，见 D36）】；交互 = hover 段高亮（弧段只做深浅变化不整块变绿）+ 图标变亮绿微放大 1.12 + 开口侧气泡预选；开口方向随浮球贴边位置自适应（右半屏朝右 / 左半屏朝左，避免超屏）；单击呼出 / 双击新建 / 拖动吸附 / 拖文件投放等其余交互不变 | 机制 | 现行 | 2026-10-20 用户确认弧形菜单 v6 版本："那就按照这个版本"；v6 稿自标注「与 D21：内容 6→4 + 交互形式=连续弧形带菜单，确认后落修订注」 | 界面稿：QwenPaw-轻量助手-浮球弧形菜单v6-20261020-004500.html + 浮球交互总演示-20261020-223000.html；D21（右键菜单形式+内容修订） |
| D29 | V1 选中文本操作栏暂不做（修订 D12 V1 优先级）：经两轮实证后判定当前阶段不投入——① Agentero（Atd=poco-ai/Agentero 仓库）实证：其划词是 App 内阅读表面（PDF/网页论文/文本编辑器）的选中文本操作，非系统级；App 内划词对对话窗口场景无意义（选中 agent 回复文本，用输入框直接指令即可，划词只省一步复制黏贴却增 UI 层）② 系统级划词才有意义（任意 App 选文本弹浮层），但需 macOS Accessibility 权限，无捷径——豆包（Doubao）实证：Doubao Browser Framework 二进制含 chromium `chrome.automation` API（getDesktop + textSelectionChanged + boundsForRange）+ macOS AXUIElement（`_AXUIElementGetWindow`），entitlements 有 automation.apple-events，需用户系统设置授权 Accessibility ③ Tauri 路径可行（Rust 侧调 AXUIElement + accessibility-sys crate），但是原生层中型功能，成本在权限引导 + 跨 App 兼容性打磨，与 D11 轻量化定位有张力；未来如重新评估，Tauri 实现路径已明确（不内嵌 Chromium，直接 Rust FFI 到 ApplicationServices） | 机制 | 现行（暂不做） | 2026-10-20 用户："我觉得有点太重了，这个功能暂时不做了" | D12（V1 优先级修订 P2→暂不做）；D11（轻量化定位张力）；Agentero 仓库 docs/frontend/web-view.md + 豆包 App 二进制实证 |
| D30 | 文件交互一条线（F1 + F2 + F3 + S2 定稿）：三条入口（@选择 / 拖主窗口 / 拖浮球 D22）+ 粘贴，统一底层 `POST /api/console/upload` → url → content part（file_url/image_url）；F1 = @ 搜索补全列表（非原生 open dialog），范围 = Desktop + Documents + Downloads，Rust 侧 glob + fuzzy match + ignore 规则（跳过 node_modules/.git/.cache）+ 200ms debounce + 限制结果 20 条 + 搜索深度 3-4 层，按需搜索不建索引（资源消耗毫秒级）；F2 = chip 展示在输入框上方，统一用文件名不用缩略图（D11 轻量化）；F3/S2 = 拖拽（Tauri dragDropEnabled:false + window dragover/drop + preventDefault 阻止导航 + subscribeTauriFileDrop 取路径，实证 Agentero use-external-file-drop.ts）+ 粘贴（⌘V），拖入覆盖层提示"投放给 agent"；三条入口终点一致，仅取文件路径方式不同 | 机制 | 现行 | 2026-10-20 用户："F1 搜索范围……这个设计OK，不过消耗资源大吗？"（答：不大，按需搜索）；"F2 轻量化直接用文件名"；"F3/S2 可以的，三条路口只是3个手段但是终点是一样的" | D12（F1/F2/F3/S2 定稿）；D22（浮球拖拽已落盘，本条补主窗口拖拽+粘贴）；D16（chip 形态）；Agentero 仓库 use-external-file-drop.ts（拖拽实证）；界面稿 F1-F2-F3-20261018-205233.html |
| D31 | 截图功能 S1 定稿：入口 = 主窗口 📷 按钮（紧邻 📎 附件）+ 快捷键 ⌘⇧X（避系统 ⌘⇧4/5）；实现 = `screencapture -i -c`（系统原生选区 UI）→ 剪贴板 → chip（文件名）+ 输入框聚焦等用户补话（不自动发送）；截图中按钮变黄呼吸（screencapture 运行期间）；Agent 自主截图 = QwenPaw 后端 `desktop_screenshot` 工具（agent 自己调自己分析，App 不做），两种模式共存（App 截图=快入口 / Agent 自主截图=省事模式）；Agentero（Atd）hooks 目录无截图相关文件（非其核心功能），无额外可借鉴 | 机制 | 现行 | 2026-10-20 用户："快捷键+主窗口按钮"；"OK，根据你的设计"；"可以参考一下atd的设计"（查证：Atd 无截图功能）；"这个设计OK。不过建议你再确认一下atd的设计"（查证确认一致）；"agent自主截图，是在qwenpaw实现的还是在app里面实现的？"（答：QwenPaw 后端） | D12（S1 定稿）；D30（chip 复用文件名）；界面稿 S1-截图-A1-审批卡片-20261018-220101.html |
| D32 | 快捷键重设 W5 定稿（修订 D12 W5 / D28 弧形菜单）：W5 从「不做」改「做」——弧形菜单新增第 5 项「快捷键设置」（键盘图标：rect 外框+4 按键点+空格条，SVG 线条风格统一），点击呼出轻量面板（非 D11 禁止的重设置面板，是弧形菜单入口的弹出列表）；面板 = 三行快捷键列表（呼出/隐藏 ⌘⇧Space · 截图 ⌘⇧X · 新建 ⌘N）+ 点击快捷键区域进入录制态（蓝色脉冲）+ 用户键盘按一下自动录入（组合键自动收集 ⌘⌃⇧⌥ + 主键）+ 冲突检测（同键红标提示）+ 恢复默认按钮 + ESC 取消录制 + 点击外部关闭；面板定位从浮球位置弹出【2026-10-20 修订：快捷键设置入口从弧形菜单移到主窗口角落面板，弧形菜单回到 4 项，见 D36】 | 机制 | 现行 | 2026-10-20 用户："在弧形菜单里面增加一个选项我觉得也OK的，到时候列好对应快捷键的功能有哪几个……用户点一下那个快捷键的地方就重设，然后要保留一个按钮可以回复默认快捷键"；"重设的方法就用户在键盘上按一下就自动录进去吗"；"这个UI我觉得没有啥问题……后面那句【点击重设】就不要了……长度有点不统一，影响美观"（已改：去掉提示文字+统一 min-width 88px） | D12（W5 优先级修订 P2→做）；D28（弧形菜单 4→5 项）；D36（快捷键设置移到角落面板）；界面稿 快捷键重设面板-20261020.html + 浮球交互总演示-20261020-223000.html（已整合） |
| D33 | 窗口行为定档（关闭 #12/#13/#20）：① #12 默认位置 = 右下角（跟浮球同区域，D24 呼出动画方向感最强）+ **浮球位置自适应**——浮球被拖动后，呼出时根据浮球当前位置动态计算主窗口出现位置（右半屏→主窗左上方 / 左半屏→主窗右上方），transform-origin 朝浮球方向动态计算（修订 D24 原固定 `bottom right`），边界检测不超屏则回弹 ② #13 失焦自动收起 = **默认关闭**——D17 `followsWindowActiveState` 失焦变暗已有"非活跃"视觉提示，不激进隐藏；用户通过浮球单击 / ⌘⇧Space 主动收起（D24 缩回），主动权给用户 ③ #20 主窗口置顶 = **默认不置顶**——弧形菜单「置顶开关」管的是主窗口（开=always-on-top 全屏App下可见 / 关=正常层级），浮球始终置顶（桌面常驻元素本质，不需用户控制） ④ #20 可调整大小 = **是**（默认 400×520，用户可拖拽边缘调整；最小尺寸 320×320——宽 320 保证顶栏+输入区可用 / 高 320 保证顶栏 38+输入区 46+消息区最小 ~236）⑤ #20 背景透明度已由 D17 定为原生 vibrancy + hudWindow | 机制 | 现行 | 2026-10-20 用户：#12"右下角OK……悬浮球位置会被移动，呼出的主界面需要能够根据屏幕自适应位置"；#13"赞同你的设计"；#20 置顶"默认可以不选择置顶，有选项可以让用户自己来选择"；#20 大小"为了应对各种场景对于主窗口大小是要可以调整的（默认可以400×520），所以最小高度也需要设计一下" | #12 #13 #20（关闭）；D24（origin 精确化——固定改动态朝浮球）；D21（置顶开关语义明确化——管主窗口）；D17（失焦变暗已有） |
| D34 | 连接体系定档（关闭 #15/#19）：① 自动搜索——启动时先试默认 `localhost:8088`，连不上扫描常见端口（3000/8000/5000），找到直接用 ② 找不到→首次 onboarding 引导输入地址（一次性，之后不再弹）③ 状态灯——顶栏 agent 名前面加状态灯（绿=SSE 正常在线 / 灰=断开离线），灰点 hover 显示"无法连接 QwenPaw"+重试按钮，不弹系统弹窗（D9 统一对话流，D11 轻量）④ 自动重连——启动时自动连上次地址，SSE 断开后定时重试 ⑤ 多实例——跟随 QwenPaw 固有设计（单实例 localhost，暂不支持）⑥ 端口配置——默认 8088 可改，与自动搜索关联（搜到就不用手动配）⑦ 之后修改连接——主窗口角落面板「连接设置」（见 D36） | 机制 | 现行 | 2026-10-20 用户："连接配置可以自动搜索吗？毕竟app是使用qwenpaw的前提"；"离线提示，可以在agent名前面加个灯，绿色说明链接正常，如果是灰色了这是链接不正常"；"自动重连这个设计OK"；"多实例是应该根据qwenpaw固有设计来决定吧"；"这个问题和1）我觉得是有关联的" | #15 #19（关闭）；D36（角落面板连接设置入口）；D9（状态灯不弹窗）；D15（Agent ID 已定） |
| D35 | 日志系统定档（关闭 #18）：① 记录内容——技术事件（启动/关闭/连接成功失败/SSE 流开始结束错误/崩溃堆栈/关键操作呼出截图发送），不记录对话内容/token/密码（隐私优先）② 三级——ERROR（崩溃/连接失败）/ WARN（重连/超时）/ INFO（启动/连接成功/关键操作），DEBUG 默认关闭 ③ 存储——本地文件 `~/Library/Logs/QwenPaw轻量助手/`，按日期轮转（每天一个文件），保留最近 7 天 ④ 实现——Tauri 侧（Rust）记原生事件（崩溃/窗口/连接）+ 前端侧记 UI 事件（SSE 消费/用户操作），统一写同一日志文件 ⑤ 导出——主窗口角落面板「导出日志」→ 打包最近 7 天 → 保存到桌面（见 D36） | 机制 | 现行 | 2026-10-20 用户："崩溃不白屏 OK的"；"日志导出。赞成要设计一个日志系统，应该如何来设计呢？" | #18（关闭）；D36（角落面板导出日志入口）；D11（轻量——三级+按日轮转+保留 7 天） |
| D36 | 信息架构定档（低频功能收纳，修订 D28/D32/#17）：弧形菜单与主窗口角落面板分工——① 弧形菜单（右键浮球）= 高频浮球/窗口管理，4 项精简（置顶/新建/隐藏/退出）② 主窗口角落面板（顶栏「⋯」入口）= 低频 App 设置/工具收纳（连接设置/导出日志/快捷键设置/检查更新/关于）③ 快捷键设置从弧形菜单移到角落面板（D32 修订，弧形菜单回到 4 项）④ 自动更新 #17 纳入设计——交互=角落面板「检查更新」+ 有新版本时「⋯」入口显示小红点角标（不弹窗不打扰 D11）+ 用户主动更新（Tauri updater 实现归工程）⑤ onboarding=首次连接引导（自动搜索失败时弹，一次性，见 D34） | 机制 | 现行 | 2026-10-20 用户："是不是有必要都加载弧形面板上。比如日志这样的用的频度低的，是不是在主界面上设计一个角落作为不常用的功能的面板，会更加好点？"；"赞同你的方案"；"关于更新的功能是不是也可以放到【主窗口角落面板】内？" | D28（弧形菜单 4 项——快捷键设置移出）；D32（快捷键设置移到角落面板）；#17（自动更新纳入设计）；D34（onboarding+连接设置）；D35（导出日志）；D11（轻量化——低频收纳不堆弧形菜单） |

---

## 详情层（论证史）

### D1 — 项目定位

**背景**：用户看到 Atd 项目后想做一个类似工具，但底层用 QwenPaw。初始想法是"简单呼出的窗口，底层 agent 是 qwenpaw，不用 qwenpaw 这么繁琐的设置界面"。

**逻辑链**：
- QwenPaw Console 是全功能平台（配置/多 agent/频道/文件管理），打开就是"一个 agent 平台，很重"
- QwenPaw Desktop 已存在，但本质是 Console 的桌面壳——重量没变，只是位置变了
- 用户痛点不是"在浏览器 vs 桌面窗口"，而是"用起来重"
- 竞品分析确认：豆包/QwenWork/WorkBuddy 都是"重平台+轻入口"，大厂不会做纯入口产品
- Pinland 验证了"给重的 agent 平台做轻量 notch 伴侣"是真实产品模式

**结论**：本项目是 QwenPaw 的轻量桌面入口——Console 管配置和管理，App 管日常即时交互。不是独立产品，不是 QwenPaw Desktop 的替代。

**关联**：需求图谱.md §1 项目定位；竞品坐标 §9

---

### D2 — 不自建 agent 能力

**背景**：用户明确"取材于 qwenpaw"——skill、工具、插件、记忆系统、模型全部来自 QwenPaw。

**逻辑链**：
- Atd 自建 agent-service（TypeScript 后端），要维护 agent loop、工具调度、模型适配
- QwenPaw 已提供 REST API（`/api/console/chat`），全部能力可通过 API 消费
- 不自建 = 开发量差一个数量级，能力上限跟随 QwenPaw 生态自动增长

**结论**：App 只做前端壳，通过 `localhost:8088` 连接已有 QwenPaw 实例。不打包 Python 后端。

**关联**：需求图谱.md §8 技术架构；技术选型待确认（开放事项 #10）

---

### D3 — 独立客户端，非插件

**背景**：用户问"这个项目是属于 qwenpaw 的插件吗？"

**逻辑链**：
- QwenPaw 插件/Skill 扩展 agent 能力（加工具、加知识）——作用方向是 agent 内部
- 本项目扩展 agent 入口（加交互界面）——作用方向是 agent 外部
- 与 Console 平级：都是 QwenPaw 的前端入口

**结论**：独立桌面客户端项目，依赖 QwenPaw 作为后端，不在 QwenPaw 插件体系内。

**关联**：需求图谱.md §1 与周边的关系

---

### D4 — 交付形态

**背景**：用户确认最终是 dmg/exe 桌面软件。

**逻辑链**：
- 需要全局快捷键、窗口管理、截图捕获等原生能力 → 必须是桌面应用
- QwenPaw Desktop 打包了 Python 后端（sidecar）→ 体积大
- 本项目只做前端壳 → 体积小（< 10MB）、启动快（不启动 Python）
- 运行前提：本地已有 QwenPaw 实例在跑

**结论**：.dmg（macOS）/ .exe（Windows），纯前端壳，不自带后端。

**关联**：需求图谱.md §6 非功能需求

---

### D5 — 不做代码签名

**背景**：用户问发布 dmg/exe 是否必须花钱注册。

**逻辑链**：
- Apple Developer Program $99/年，Windows 签名证书 $200-800/年
- 不签名 ≠ 不合法，开源软件都这么发
- Atd README 和 QwenPaw Desktop 文档均明确未签名
- 首次启动手动信任，一次操作永久有效

**结论**：现阶段一分钱不花，直接打包发布。后续上 App Store 再花钱。

**关联**：需求图谱.md §6 非功能需求

---

### D6 — Session 机制

**背景**：讨论 App 与 Console 的 session 关系时，用户逐步澄清需求。

**逻辑链**：
- 初版想法：每次打开 App 新建 session → 用户纠正："我并不要求进行重新的打开一次就新建一个session"
- 用户要的是：首次打开无 session → 点「新建」→ 生成 session → 持久化 → 再打开恢复同一个
- 进一步澄清："新建session只是为了清理app这个对话内的上下文"——不是管理工具，是"清空重来"按钮
- "本身是轻量化的窗口应对轻量化任务，所以多问题混在一个上下文我觉得问题不大"
- 最终定位："这个项目只是一个窗口，是console的补充，最终是在console来汇集的"

**结论**：
- App 本地持久化一个 `current_session_id`
- 首次启动无 id → 生成一个存下来；再启动 → 读本地恢复
- 「新建 Session」按钮 + ⌘N → 生成新 id 覆盖本地 → 上下文清零
- 不做 session 列表、切换、管理——全部归 Console
- 【2026-10-16 修订（D15）】本地持久化 `current_agent_id` + `current_session_id`（可空）两字段：session 默认由后端状态驱动（切 agent / 打开 App 接该 agent「置顶优先+最近活跃」session；current_session_id 为空即跟随态）；「新建 Session」生成新时间戳 id 写入本地**持久化**——等同 Console「新对话」，跨重启保持（用户纠正："应该是和后端qwenpaw一样的，相对新建一个qwenpaw里面的session"）；切 agent 时 current_session_id 置空回到跟随态

**关联**：需求图谱.md §5 Session 机制

---

### D7 — Session_id 格式

**背景**：讨论是否需要 `desktop-` 前缀区分来源。

**逻辑链**：
- 前缀唯一作用是在 Console 列表里一眼看出来源，纯可读性非技术必需
- QwenPaw 不区分 session_id 谁传的，后端一视同仁
- 用户倾向统一格式："那和console用一样的规则呢？"
- 现阶段自己用，不需要按来源筛选 session

**结论**：用时间戳格式，与 Console 生成规则一致。Console session 列表里看起来统一。

**关联**：需求图谱.md §5 Session 机制

---

### D8 — 信息精简

**背景**：用户明确"界面简洁，信息集中（不像qwenpaw反应出来的内容很多）"。

**逻辑链**：
- QwenPaw Console 反馈信息量大（thinking/工具详情/完整历史），因为面向"坐下来认真用"
- 用户场景是"扫一眼就要结果"
- Pinland 验证了此方向——"Saved previews contain only recent user messages and Codex final answers; reasoning, commands, arbitrary tool output, and diffs are not included"

**结论**：
- thinking 过程：默认折叠/不展示
- 工具调用：显示摘要（🔍 搜索中 → ✅ 完成），不展示完整参数/返回值
- 【2026-10-16 修订（D16）】"不展示"精确化为"默认收起"：工具参数/diff/输出详情收进点击展开的卡片（header 工具名 / body 完整参数 / footer 结果摘要），默认一行，想看可点——详见 D16
- SSE 事件需要过滤+摘要后再渲染，不是全量透传

**关联**：需求图谱.md F6 信息精简展示

---

### D9 — 统一对话交互

**背景**：用户提到文档修改、看视频/音频等场景。

**逻辑链**：
- 这些场景比搜资料重：涉及文件操作、多模态处理
- QwenPaw agent 本来就有 `read_file`/`write_file`/`view_video` 等工具
- 做场景专用 UI（文件选择器/diff 预览/播放器）= 增加复杂度且超出"轻量"定位

**结论**：第一版所有场景统一走"对话"一个交互模式。文件拖拽/@引用即入口，agent 通过工具自然处理。不做场景专用 UI。

**关联**：需求图谱.md §4 功能需求

---

### D10 — 目标用户与发布渠道

**背景**：用户明确发布目标不是大众市场，而是 QwenPaw 社区——"我想要发布到的是qwenpaw的社区（可以发布到github上然后链接到qwenpaw社区）"。

**逻辑链**：
- 目标用户已是 QwenPaw 使用者，不需要教育"QwenPaw 是什么"
- 用户已有 QwenPaw 实例在跑，不需要引导安装——只需检测连接和配置端口/Agent ID
- 社区用户技术素养足够接受未签名 App（同 QwenPaw Desktop 自己也未签名）
- 文档可大量引用 QwenPaw 官方文档，只写自己特有的部分
- 开源与社区定位天然契合（QwenPaw / Atd / Pinland 插件均开源）

**结论**：
- 目标用户 = QwenPaw 社区用户，不是泛 AI 用户
- 发布渠道 = GitHub Releases + 链接到 QwenPaw 社区（Discussions / 社区群）
- QwenPaw 依赖处理：默认连 `localhost:8088` + `default` agent，设置项可改端口和 Agent ID；离线时一句话提示"QwenPaw 未运行"，不做安装引导
- D5（不签名）在社区场景下维持不变

**关联**：需求图谱.md §6 非功能需求 / §7 明确不做的事；发布相关待办 #15-#18

---

### D11 — 界面轻量化设计

**背景**：用户明确"这次定位是轻量化的入口，那界面设计要轻量化，简约化，包括前端风格也是"。

**逻辑链**：
- D8 已定信息层精简（展示什么内容）；本条是设计层精简（怎么展示、视觉风格）——两个正交维度
- 轻量化定位不仅是功能少，界面本身就要"轻"：元素少、视觉干净、无多余装饰
- 前端风格轻量 = 不引重型 UI 组件库、CSS 方案克制、动画少而精
- 参考 Atd 的 "quiet" 气质——安静、不抢眼、随叫随到

**结论**：
- 界面元素最小化：不做侧边栏、不做导航栏、不做多 Tab、不做设置面板（设置最多一个弹窗）
- 视觉简约：大量留白、克制的配色、无装饰性元素
- 前端风格轻量：避免重型组件库；样式方案从简；动画仅在关键反馈处使用
- 窗口小：与"轻量入口"定位一致

**关联**：D8（信息精简，正交维度）；D4（交付形态——体积小/窗口小）；技术栈选型 #10 受本条约束（前端框架/样式方案须轻量）

---

### D12 — 合并功能清单（Atd + Pinland 源码分析）

**背景**：用户要求深入分析 Atd 和 Pinland 两个参考项目的源码，提取可借鉴功能，合并为统一功能清单。

**分析过程**：
- Pinland 源码分析：`plugins/pinland-for-codex/` 下 `mcp/` 目录 20+ 文件，涵盖审批转发、命令去重、守护进程租约、信息过滤策略等
- Atd 源码分析：`apps/desktop/src/features/` 11 个 feature 模块 + `components/` 20+ 通用组件，涵盖 Slash 命令、Chip 编辑器、Quick Panel、权限分级、上下文压缩等

**两个来源的互补关系**：
- Pinland 贡献"不做什么"的纪律：信息过滤策略（只存用户消息+最终答案）、显式发送（无队列/无重放/无重试）、审批转发（缺席不阻塞）
- Atd 贡献"怎么做轻"的交互细节：Slash 命令、Chip 附件可视化、草稿持久化、窗口状态记忆、上下文压缩

**合并功能清单（10 域 35 项）**：

#### 1. 呼出与窗口管理

| # | 功能 | 来源 | 优先级 |
|---|------|------|--------|
| W1 | 快捷键呼出/隐藏 | 两者 | P0 |
| W2 | 窗口状态持久化（位置/大小） | Atd | P1 |
| W3 | 失焦自动收起 | Atd | P1 |
| W4 | Tray Icon | Atd | P1 |
| W5 | 快捷键录制器（用户自定义） | Atd | P2【2026-10-20 修订：改做，见 D32】 |

#### 2. 对话交互

| # | 功能 | 来源 | 优先级 |
|---|------|------|--------|
| C1 | 流式对话（SSE → Markdown） | 两者 | P0 |
| C2 | ~~Slash 命令（/translate /summarize /explain /search）~~ → Slash 命令透传（识别 `/` 前缀 → 透传后端 → 渲染返回结果；按钮入口 /new /stop 可选 P1）〔D14〕 | Atd → Console | P0 |
| C3 | 草稿持久化（切走不丢） | Atd | P1 |
| C4 | 停止任务 | 两者 | P0 |
| C5 | 显式发送，无队列/无重放/无重试 | Pinland | P0 |
| C6 | 命令去重（防重复发送） | Pinland | P1 |
| C7 | 新建 Session（清空上下文） | 两者 | P0 |

#### 3. 信息展示

| # | 功能 | 来源 | 优先级 |
|---|------|------|--------|
| I1 | 信息过滤（只展示用户消息+最终答案） | Pinland | P0 |
| I2 | 工具调用摘要（🔍 搜索中 → ✅ 完成；形态见 D16：对勾/shimmer/chip/尾部数据/点击展开） | 两者 | P0 |
| I3 | 上下文压缩（长对话自动摘要） | Atd | P1 |
| I4 | 有限预览恢复（跨重启只恢复 N 条） | Pinland | P1 |
| I5 | 图片灯箱（点击放大） | Atd | P2 |

#### 4. 文件与附件

| # | 功能 | 来源 | 优先级 |
|---|------|------|--------|
| F1 | @文件引用 + 搜索 | Atd | P1【2026-10-20 修订：定稿，见 D30】 |
| F2 | Chip 附件可视化 | Atd | P1【2026-10-20 修订：定稿，见 D30】 |
| F3 | 文件拖拽 + 覆盖层 | Atd | P1【2026-10-20 修订：定稿，见 D30】 |
| F4 | 文件分组 | Atd | P2 |

#### 5. 截图与图片

| # | 功能 | 来源 | 优先级 |
|---|------|------|--------|
| S1 | 截图快捷键 | Atd | P1【2026-10-20 修订：定稿，见 D31】 |
| S2 | 图片粘贴/拖拽 | 两者 | P1【2026-10-20 修订：定稿，见 D30】 |
| S3 | 截图标注 | Atd | P2 |

#### 6. 审批与权限

| # | 功能 | 来源 | 优先级 |
|---|------|------|--------|
| A1 | HITL 审批弹窗 | 两者 | P1 |
| A2 | 审批转发（App 缺席不阻塞 agent） | Pinland | P1 |
| A3 | 权限分级（Manual/Auto/Always） | Atd | P2 |

#### 7. 连接与安全

| # | 功能 | 来源 | 优先级 |
|---|------|------|--------|
| N1 | QwenPaw 离线检测 | 两者 | P0 |
| N2 | 自动重连 | 两者 | P1 |
| N3 | Per-install 认证 token | Pinland | P1 |
| N4 | 后台守护进程保活 | Pinland | P1 |

#### 8. 通知与反馈

| # | 功能 | 来源 | 优先级 |
|---|------|------|--------|
| T1 | 任务完成通知 | 两者 | P1 |
| T2 | Toast 通知 | Atd | P2 |

#### 9. 选中文本与语音

| # | 功能 | 来源 | 优先级 |
|---|------|------|--------|
| V1 | 选中文本操作栏 | Atd | P2【2026-10-20 修订：暂不做，见 D29】 |
| V2 | 语音输入 | Atd | P2 |

#### 10. Onboarding

| # | 功能 | 来源 | 优先级 |
|---|------|------|--------|
| O1 | 首次连接引导 | 两者 | P1 |
| O2 | 功能提示（首次用图片时提示） | Atd | P2 |

**MVP 收敛（9 项 P0）**：W1 / C1 / C2 / C4 / C5 / C7 / I1 / I2 / N1

**关键设计决策借鉴**：
- Pinland 信息过滤策略直接强化 D8：从"折叠/摘要"升级为"分类丢弃"——reasoning/tool calls/diffs 不存不传不渲染
- Pinland 发送纪律简化 MVP：砍掉消息队列、断线重放、后台重试三层复杂度
- ~~Atd Slash 命令替代选中文本栏（F11→V1 降为 P2）：实现更轻，效果类似，与 D11 一致~~ → 【D14 校准】Slash 命令不自建，直接复用 QwenPaw Console 原生 `/` 命令体系（/compact /new /clear /stop /model /checkpoint /approval /goal /mission /proactive 等），App 仅做 `/` 前缀识别 + 透传 + 渲染；选中文本栏（V1）仍降为 P2【2026-10-20 修订：改暂不做，见 D29】
- Atd 上下文压缩补充 D8：D8 管单条消息精简，compaction 管整个对话历史精简

**关联**：D8（信息精简，被 Pinland 策略强化）；D11（界面轻量化）；D4（交付形态）；D14（Slash 命令策略）；MVP 范围确认 #14；需求图谱.md §4 功能需求

---

### D13 — 开发策略：纯路径 B

**背景**：讨论代码复用策略时，依次评估了三条路径：A（fork Console 删减）、B（新起项目参考 Console）、C（抽共享包引用）。过程中发现 QwenPaw 官方已发布 `@agentscope-ai/chat` npm 包（v1.1.72，Apache-2.0），但确认其本质是 UI 组件包（antd 生态，依赖 antd/xstate/mermaid 等），与 D11（界面轻量化）直接冲突。

**逻辑链**：
- `@agentscope-ai/chat` 是 UI 组件包，非纯 API 客户端——直接引用会拖入 antd 全家桶，违反 D11
- 包内的 4 个 hooks（useChatRequest/useChatController/useChatMessageHandler/useChatSessionHandler）虽含 SSE 消费逻辑，但本质是标准 HTTP fetch + SSE 流解析——不依赖任何特殊 SDK
- QwenPaw 的 API 文档（`api-tutorial.zh.md`）已提供完整请求/响应格式 + Python/JavaScript/cURL 示例
- Console 源码（`console.py`）已揭示 SSE 流内部结构（status: created → in_progress → completed）
- 三来源开发策略：Console 已有能力 → 裁剪参考模式；Atd/Pinland 增量 → 借鉴引入；定位独有 → 原创设计

**结论**：
- 新起独立 Tauri/Electron 项目，不 fork Console，不引用 `@agentscope-ai/chat` 包
- SSE 客户端自己写（fetch + ReadableStream，参考 API 文档 + Console 源码模式）
- 消息解析自己写（JSON.parse + 按 status 分发）
- Session 管理自己写（localStorage 存一个 id）
- UI 全部自己写（不用 antd，轻量风格，D11 约束）
- 零包依赖 QwenPaw 生态，只依赖 REST API 接口
- `@agentscope-ai/chat` 源码可选参考（非必需），特别关注其 SSE 消费模式

**三来源整合**：
- **Console 为基底**：SSE 消费模式 / API 调用方式 / Session 管理逻辑 → 参考源码模式重写
- **Atd 为增量**：快捷键 / 窗口 / Tray / 截图 / Chip → 借鉴交互模式（Slash 已转 Console 复用，见 D14）
- **Pinland 为增量**：信息过滤策略 / 发送纪律 / 审批转发 / 有限预览 → 借鉴设计决策
- **原创**：连接配置 / 轻量 UI 风格 / 窗口行为

**关联**：D4（交付形态——纯前端壳）；D11（界面轻量化——不引 antd）；D12（功能清单）；技术栈选型 #10；需求图谱.md §8 技术架构

---

### D14 — Slash 命令策略：复用 Console 原生命令体系

**背景**：D12 功能清单 C2 原标注"Slash 命令（/translate /summarize /explain /search）"，来源标 Atd——但 Atd 源码中的 Slash 命令列表实际未读到，这 4 个命令是推断建议。用户质疑"是不是参考 qwenpaw 的 colson 的【/快捷指令】的设计？单独新做 4 个指令没有意义啊？"

**逻辑链**：
- QwenPaw Console 已有完整 `/` 命令体系（8 类 20+ 命令）：对话管理（/compact /new /clear）、状态检查点（/checkpoint 系列）、对话调试（/history /message /dump_history 等）、模型管理（/model 系列）、系统控制（/stop /restart /daemon）、工具审批（/approval /approve /deny）、循环工程（/goal /mission）、主动模式（/proactive）
- 这些命令全部由 QwenPaw 后端原生处理——App 作为前端壳，只需识别 `/` 前缀文本、整条透传给后端 SSE、渲染返回结果
- 自建 App 专属命令（/translate 等）意味着：App 要自己解析命令、生成结果或转 prompt——增加实现复杂度（违反 D11）、用户多记一套（违反 D9 统一对话交互模式）、与 D13 零包依赖纯路径 B 不一致
- 翻译/总结/搜索等场景用自然语言驱动 agent（"翻译这段""总结这篇"）即可——这正是 D9 统一对话交互的题中之义
- 按钮式入口（"停止"按钮触发 /stop、"新建会话"按钮触发 /new）可作为 P1 增量，不属 P0 必须

**结论**：
- App 复用 QwenPaw Console 原生 `/` 命令体系，不自建 App 专属命令
- App 端实现：识别 `/` 开头输入 → 整条透传后端 → 按统一对话渲染管线展示返回结果
- D12 功能清单 C2 从"实现 4 个 Atd 风格命令"校准为"Slash 命令透传"
- 原 C2 推断的 /translate /summarize /explain /search 四命令废弃
- 后期如需"个性化预设 prompt 模板"（用户自定义快捷指令），属 P1+ 增量，不与 Console `/` 命令冲突

**关联**：D9（统一对话交互模式）；D11（界面轻量化）；D12 C2 行校准；D13 三来源整合（Atd 借鉴清单去除 Slash、原创去除 Slash 命令集）；需求图谱.md §4（待传导）

---

### D15 — Agent 切换策略：App 内可选 agent，session 后端驱动

**背景**：用户提问"App 会和 qwenpaw 哪个 agent 连在一起？"——此前 D10 仅粗写"默认连 localhost:8088 + default agent，设置项可改端口和 Agent ID"，未细化。讨论中用户明确选择形态 B："我觉得用B吧，我的思路上所有的session其实还是存在qwenpaw这里的，你切换agent只是调用这个agent，自然继承其session和上下文，甚至包括这个agent的skill，mcp等。"

**逻辑链**：
- QwenPaw API 每个请求必须带 `X-Agent-Id` 头指定 agent（api-tutorial.zh.md 实证），默认值 `default`
- `GET /api/agents` 可列出全部已配置 agent（id/name/description/enabled/pinned）——App 拉一次即可展示选择，无需自建 agent 管理
- 用户可能配了多个 agent（各自有人格/记忆/skills/mcp/workspace）——硬编码 default 会挡住自定义 agent 用户
- session 存储路径 = `<agent_workspace>/sessions/{session_id}.json`（fork.py `_get_sessions_dir` + chats/session.py 实证）→ session 天然 agent 级隔离，同一 session_id 在不同 agent 下是不同文件
- `GET /api/agents/{agentId}/chats` 可列出该 agent 全部 chat（ChatSpec 含 session_id/updated_at/last_finished_at/pinned/archived_at/source）→ App 无需本地维护 session 账本，单一事实源在后端
- channel 参数决定 session 归属：`channel: "console"` → App 与 Console 共享 session、与 QQ/微信等其他平台天然隔离。用户确认"其他的平台比如qq，微信这些不能用，只能用console，在电脑上锁定console其实应该是可以的"

**结论**：
- App 内可切换 agent：顶部紧凑下拉（同 Console 左上角心智模型），数据来自 `GET /api/agents`，选中存本地
- 切 agent / 打开 App = 接该 agent「置顶优先 + 最近活跃」的 session：过滤非归档 + source=chat，按 pinned → updated_at 排序取第一；列表为空（全新 agent）则生成新时间戳 session_id
- channel 固定 `"console"`：与 Console 共享 session（Console 里聊的 App 打开即接上），与其他平台隔离
- 【2026-10-16 修订】本地持久化 `current_agent_id` + `current_session_id`（可空）两字段：`current_session_id` 为空 = 跟随态（打开 App / 切 agent 时接该 agent「置顶优先+最近活跃」session）；「新建 Session」生成新时间戳 id 写入本地**持久化**——等同 Console「新对话」，跨重启保持。用户纠正初版"仅本次运行有效"方案："应该是和后端qwenpaw一样的，相对新建一个qwenpaw里面的session"
- D6 延伸：原"持久化一个 `current_session_id`"校准为"持久化 current_agent_id + current_session_id（可空）；session 默认跟随 agent 最近活跃，新建即持久化新对话"

**关联**：D1（Console 补充/汇集——共享 session 是"汇集"的技术体现）；D2（复用 QwenPaw 全部 agent 能力——含 agent 整体切换）；D6（session 机制，本条延伸，见 D6 修订注）；D7（session_id 时间戳格式不变）；D13（零包依赖——全部通过 REST API 实现）；D14（同类决策：复用后端能力而非 App 自建）；需求图谱.md §4 §5（待传导）

---

### D16 — 界面设计：四类信息分区与工具行形态

**背景**：界面设计经 v1-v7 七版迭代（每版 HTML 稿存于项目目录 `QwenPaw-轻量助手-界面设计稿-*.html`）。v1-v2 为"全无气泡灰度分层"，用户反馈"过于严肃、可读性不够、用户消息和 agent 内容难区分"；v3 引入 Atd 实证的 MessageBubble 气泡方案；v4-v5 按用户反馈加对勾、灰化、参数折叠；v6 分离引用式代码块；v7 加透明窗口（背景机制见 D17）。

**逻辑链**（Atd transcript 目录源码实证）：
- 用户消息是气泡（MessageBubble 源码注释："the frame owns the shape, fill and height cap"）——右对齐 + 淡底圆角，长消息高度上限内滚；方向即角色
- agent 消息无容器纯文本（AssistantBlock）——左对齐，Markdown 渲染，流式末尾闪烁光标
- 工具行是 agent 的工作步骤：类型图标 + 动词 + 文件 chip（read/write/edit/grep/find/ls 类工具）+ 尾部数据摘要（diff 用 `+12 −3`、range 用 `L120–180`、count 用数字），完成显示对勾，运行中整行 shimmer
- 对勾样式来源：Atd tool-block 行本身无状态图标（源码注释 "the row reads the same settled or failed"），对勾取自 ActivityGroup 的 Disclosure completed——用户看过 Atd 实物后确认"完成了就打个对号，看起来很漂亮"
- 工具行文字灰化到约三成透明度——Atd 源码注释原话 "the work is chrome around the answer, and only the answer reads at full strength"（工作是答案的陪衬，只有答案全强度）
- 参数默认收起：每个工具永远一行，完整参数/diff/输出收进点击展开的卡片（header 工具名+复制 / body 参数 / footer 结果摘要，高度上限内滚）——Atd tool-card.css 同款三段结构
- 答案内多行代码用引用式（左侧淡竖线 + 等宽，无底色无圆角）——与工具卡片（有边框有 header 的容器）形态分离，避免两种"块"视觉混淆
- Pinland 侧实证：无 UI（纯 Codex 插件，UI 在不开源的 Pinland 主应用），其信息纪律（只存用户消息+最终答案，工具调用不展示）比 D8 更激进——App 取中间态（摘要行 + 可展开）

**结论**：
- 四类信息四种视觉：用户消息（右对齐气泡）/ agent 动作（左对齐工具行）/ agent 回复（左对齐纯文本）/ 系统提示（居中淡色小字）
- 工具行形态：对勾（完成，淡绿）/ 工具图标 + shimmer（运行中）/ 文件 chip / 尾部数据；整行三成灰；点击展开参数卡片
- 答案内多行代码 = 引用式（竖线）；行内代码 = 淡底 chip
- D8 精确化：工具参数从"不展示"改为"默认收起、可展开"
- 界面稿交付物：v1-v7 共 7 份 HTML，存于项目目录

**关联**：D8（信息精简——参数收起精确化）；D11（界面轻量化——所有形态遵守）；D9（统一对话流）；D17（窗口透明背景）；D12 I2（工具摘要功能项）；需求图谱.md §4（待传导）

---

### D17 — 窗口背景机制：原生 vibrancy

**背景**：用户要求"app对话框的背景做个有点透明的，和atd一样"，并追问透明度是否与 Atd 一致。深挖 Atd 源码（`apps/macos/Sources/AIShell/Windows/`）实证：Atd 不用 CSS 透明度，用 macOS 原生材质。

**逻辑链**（NativeMaterialView.swift / ActiveGlassPanel.swift 实证）：
- Atd 各表面材质表：主窗口 = `.underWindowBackground`（behindWindow，followsWindowActiveState）；mini panel / command island = `.hudWindow`；菜单 = `.menu`；权限引导 = `.popover`
- macOS 26 用 `NSGlassEffectView`（Liquid Glass），macOS 15 回退 `NSVisualEffectView`——双版本兼容
- 主窗口 `state = followsWindowActiveState`：失焦自动变暗，系统行为白得
- 透明度/模糊度由系统材质决定，作者无数字可抄——"和 Atd 一致"= 抄机制（原生材质 + behindWindow），不是抄数值
- 内容层保持实色：Atd tool-card.css 注释 "an opaque content surface, never glass"——透的是壳不是字
- Tauri（window-vibrancy 插件 / private API）与 Electron（`vibrancy` 选项）均支持；Electron API 更直白成熟
- App 主面板 ≈ Atd mini panel 场景（小悬浮对话窗），`.hudWindow` 更暗更实，文字可读性优先

**结论**：
- 窗口背景参考 Atd 模式：原生 vibrancy/系统材质 + behindWindow 混合，不用 CSS backdrop-filter
- 内容层全部实色（never glass）；WebView 页面 body 背景透明、内容面实色是前端硬约束
- 失焦变暗等系统行为由材质 state 提供，不自行实现
- 【2026-10-17 校准】材质选型定为 `.hudWindow`（更暗更实、文字可读性优先，对齐 Atd mini panel；用户确认"还行"）；v8 界面稿按此方向出（rgba .88 + blur 18px 为 CSS 近似，实现以原生材质为准）
- 平台范围（vibrancy 绑定 macOS，Windows 需 fallback）→ #24（仍开放）
- 【2026-10-18 校准（冒烟实证）】NSVisualEffectView 在 macOS 26 无 light rim——用户系统 macOS 27 实测"没有玻璃感"，根因是 API 代差非参数。升级双路径：macOS 26+ `apply_liquid_glass(NSGlassEffectViewStyle::Regular, radius 20)`（window-vibrancy 0.8.1 内置，内部版本检测 <2685 返 Err）+ 旧系统回退 `apply_vibrancy(HudWindow, FollowsWindowActiveState)`；CSS 侧 app-shell 圆角 20px（与 glass radius 对齐让 rim 顺圆角露出）+ fill 0.80（对齐 Atd GlassSurface token 80%）+ html/body transparent 不动

**关联**：D4（交付形态——平台范围待确认，#24）；D11（界面轻量化）；D16（界面设计——透明窗口层）；技术栈选型 #10（vibrancy 支持成为选型输入）；需求图谱.md §6（待传导）

---

### D18 — 前端渲染策略：Markdown 自定义最小化

**背景**：agent 答案为 Markdown 格式，WebView 需要渲染器。原开放事项 #21 列了三种路径：现成轻量库（react-markdown）/ 重型生态（remark+rehype，可扩展公式图表）/ 自定义最小化。

**逻辑链**：
- D16 界面只用少数格式：答案正文、代码块（引用式：竖线+等宽）、行内代码（chip）、列表、链接、粗体——公式、mermaid、表格美化都用不到
- Atd 的渲染栈是重型生态（streamdown + shiki + mermaid-lazy + katex + remark-math），App 若跟随违反 D11（不引重型库）与 D13（零包依赖纪律）
- 引用式代码块的样式（竖线、等宽、无底色）需要精确控制——自写渲染器直接产出目标 DOM，用库反而要覆写默认样式
- 自定义渲染器约几百行代码：解析少数块级/行内标记 → 映射到 D16 定义的样式
- 用户拍板："本身就是小界面，所以未必会用到很多格式和图画，最简单的信息交互就好了。定义为轻型的"

**结论**：
- 自写最小化 Markdown 渲染器，零依赖
- 支持范围：粗体 / 行内代码 chip / 列表 / 链接 / 代码块（引用式）；标题可选
- 不支持：公式、mermaid、表格美化、HTML 块——agent 真输出这些按纯文本降级展示
- 后续如需富格式（P1）：评估升级轻量库，不动自写渲染器的接口

**关联**：D11（界面轻量化——不引重型库）；D13（零包依赖纪律）；D16（界面设计——引用式代码块/chip 由自写渲染器精确产出）；需求图谱.md §8（待传导）

---

### D19 — 历史消息加载

**背景**：App 打开/切 agent 时界面是空白还是有上下文？不加载则"轻量入口"变成"失忆入口"——用户每次呼出看到空窗口，违背 D1"日常即时交互"定位。

**逻辑链**：
- session 在后端（D15），历史消息可通过 `GET /api/agents/{agentId}/chats/{chat_id}` 拉取（chats/api.py 实证）
- 加载后按 D8 过滤：只展示用户消息 + agent 最终答案 + 工具摘要行——thinking/工具详情不进历史
- 条数上限 N（默认 20）——轻量窗口不需要无限回溯，更早的归 Console（D6 纪律）
- 与 D15 联动：切 agent → 接该 agent 最近活跃 session → 同步拉该 session 最近 N 条
- 用户认可加载方案

**结论**：
- 打开 App / 切换 agent 时，拉当前 session 最近 N 条（默认 20）历史消息
- 按 D8 过滤后渲染：用户消息（气泡）/ agent 答案 / 工具摘要行——运行态由历史数据推断（已完成显对勾）
- 超过 N 条的更早历史不加载，入口在 Console
- 拉取失败（session 不存在/网络错误）降级为空窗口，不阻塞对话

**关联**：D6（session 归 Console 管理——只加载有限窗口）；D8（信息过滤同样作用于历史）；D15（切 agent 接最近活跃 session，加载随之切换）；D16（历史消息渲染形态与实时一致）；需求图谱.md §4（待传导）

---

### D20 — 测试基建：vitest 回归网 + wdio e2e

**背景**：MVP 14 任务交付后，Computer Use（桌面 GUI 控制）经确认在 TUI 版 QwenPaw 不可用——agent 无法操作窗口，GUI 实测全靠用户人工冒烟。冒烟共 4 轮修复（洗白/失焦/滚底/工具行 fallback/Liquid Glass/onTurnComplete 等 10+ 项），需要回归网防复发。

**逻辑链**：
- vitest 集成测试（mock plugin-http 假 SSE 流）把流式链路从静态审核升级为运行证据：token 顺序、工具两态、reasoning 过滤、error 中断、cancel 收场
- 测试暴露 onTurnComplete 三路径（message completed / response / 流结束）重复触发——现消费者均幂等所以无害，但语义是雷，裁定 turnFinished 守卫收紧为一次
- wdio（@wdio/tauri-service embedded 模式）驱动 App 自己 spawn 的构建产物实例，A 层 computed-style 断言专抓"DOM 全绿但界面崩"类缺陷（洗白 bug 正是此类）；分层：A 层确定性断言 / B 层截图+规划方视觉判断 / C 层像素 diff 不做（透明窗口有坑）
- 环境事实：Computer Use 需 desktop 版 QwenPaw，TUI 版用不了——此约束入档

**结论**：
- vitest 4/4 成为流式链路回归网（每次改动自动跑）
- wdio 基建接入后，冒烟修复固化为 A 层用例（app-shell 非透明+对比度、slash 双 Enter 发送、工具行展开、滚底行为等）
- GUI 实测方式：人工冒烟 + 截图回传规划方判断（Computer Use 不可用的环境事实）
- 【2026-10-18 落地】wdio 接入完成并三轮修复闭环：① hook 时序错误（root before 早于 tauri API patch）→ 下沉 spec 级 + isolation.ts；② vite dev server 生命周期缺失（dev 二进制固定连 devUrl 1420）→ onPrepare/onComplete 管理；③ WebDriver 端口 4445 与用户 dev 实例撞车 → 错开 4446。终态：连跑两次 4/4，测试隔离（localStorage 备份改写+独立 wdio-e2e session）保证用户真实数据零增长

**关联**：D16（界面形态是视觉断言基准）；D17（玻璃参数是对比度/透明度断言对象）；D8（reasoning 过滤有测试断言）；验收报告-最终任务验收-20261018.md

---

### D21 — W4 呼出入口：桌面浮球（替代 Tray Icon）

**背景**：D12 功能清单 W4 原定为 Tray Icon（菜单栏图标）。用户提出桌面浮球作为鼠标兜底呼出入口，判断"比在菜单栏点击呼出更加适合"——菜单栏要瞄准屏幕顶部，浮球在桌面任意位置鼠标一扫就到，且中文用户对浮球形态熟悉。用户并追加两个决策：置顶做成"一直在前面/恢复正常前后"开关、形态确认"一个圆的中间加小图标"。

**逻辑链**：
- Tauri v2 多窗口/透明/置顶/无装饰/可拖动均标准能力；圆形用窗口方形 transparent + CSS `border-radius:50%` 实现，透明边角点击穿透；`skip_taskbar:true` 不进 Dock/任务栏
- Atd 实证：`DesktopPins` 模块（11 文件 ~80KB）形态可参考——桌面浮动+拖动（DesktopPinDrag）+角落吸附（DesktopPinCorner）+位置记忆（DesktopPinStore）+多屏（DesktopPinScreens）。但其功能是 macOS Widget 桌面图钉（WidgetFamily/时间线快照展示），**不做呼出动画**——呼出动画是我们的原创，无竞品直接对标
- 跨窗口动画局限：浮球与主窗口是两个独立 OS 窗口，做"一个元素 transform"式展开需 RAF 循环改 `set_size`（重排风险重）——绕开方案：主窗口直接以目标尺寸出现，**内容层**做 `transform: scale(0.3)→1` + `opacity: 0→1` 淡入
- `transform-origin: bottom right`（朝浮球方向）——展开有"从浮球长出来"的方向感
- 缓动 `cubic-bezier(0.16,1,0.3,1)`（Mac 标准 ease-out-expo，Liquid Glass 系统动画语言）+ 时长 280ms；浮球淡出 150ms（先于主窗口结束，让位）
- 置顶开关：`always_on_top` 开=全屏 App 下可见但遮挡其他窗口；关=正常层级不遮挡但全屏下可能被遮——选择权给用户
- 右键菜单与设置面板合并：原设计两个浮层内容重叠（置顶开关/隐藏）+ 隐藏按钮在设置面板矛盾（隐藏浮球后设置面板再也打不开）——合并为一级右键菜单，不设二级设置面板
- 隐藏浮球后恢复：快捷键 ⌘⇧Space 呼出主窗口 + 主窗口内"显示浮球"入口

**结论**：
- W4 形态从 Tray Icon **改为桌面浮球**：44px 圆形 Liquid Glass（rgba(22,22,26,.82) + blur16 + rim inset 白 8%，与 D17 主窗口同材质）+ 中间 ✦ 图标【2026-10-19 修订：浮球材质从 Liquid Glass 改实色质感（白→浅灰渐变 + 多层柔和阴影）+ 大小 44→50px + 状态色表达改 2px 彩色 ring + 深色覆盖层符号 opacity .7，见 D26；本条其余形态/交互不变】
- 四状态：常态 / 生成中呼吸（绿边 + scale/opacity 循环）/ 新消息角标（右上红点，agent 回复完成且主窗口不可见时）/ 拖动中（放大半透 + 轻摇）
- 交互：单击呼出主窗口 / 双击新建 Session / 右键菜单（呼出/新建/置顶开关/位置重置/隐藏/退出，合并单层【2026-10-20 修订：右键菜单形式由传统 contextmenu 列表改连续弧形带、内容 6→4 项，见 D28】）/ 拖动记忆位置 + 拖到屏幕角落自动贴边（借鉴 Atd DesktopPinCorner）
- 呼出动画规格：主窗口全尺寸出现 + 内容层 CSS scale(0.3→1) + opacity(0→1) 280ms cubic-bezier(0.16,1,0.3,1)，transform-origin 朝浮球方向；浮球 150ms 淡出让位；收回反向（主窗口 scale 1→0.3 淡出 + 120ms 后浮球淡入）【2026-10-19 修订：本条动画规格被 D24 升级——新增浮球收缩预备段与收回时浮球 spring 弹回段，升级为 Dock 式三段接力；本条其余结论不变】
- 置顶开关："一直在前面"/"恢复正常前后"两态，用户自选
- 边界：浮球贴屏幕边缘时主窗口出现位置做边界检测+回弹；多屏默认主屏、拖到哪个屏跟哪个屏
- 交付物：`QwenPaw-轻量助手-浮球界面设计稿-20261018-211338.html`（四状态+右键菜单）与 `QwenPaw-轻量助手-浮球呼出动画演示-20261018-213016.html`（可交互动画演示）均存于项目目录

**关联**：D11（界面轻量化——浮球是唯一常驻桌面元素，克制使用）；D16（界面形态——浮球与主窗口视觉一致）；D17（Liquid Glass 材质同源）；D12 W4（原 Tray Icon 决议的形态变更）；D6（快捷键 ⌘⇧Space 是隐藏恢复路径）

---

### D22 — 浮球文件投放点（拖拽到浮球喂 agent）

**背景**：用户提出增强交互——文件除了拖拽到主窗口喂 agent（F3），也可以拖拽到浮球，效果一样且自动呼出主窗口。浮球从"呼出按钮"升级为"文件投放点"。

**逻辑链**：
- Tauri v2 窗口级 `onDragDropEvent`——每个窗口独立监听拖拽，浮球窗口可接收文件投放
- 跨窗口通信走 `emit`/`listen`（Tauri 全局事件）：浮球拿到文件路径 → emit → 主窗口 listen 接收 → upload → chip + 准备发送
- 与 F3 互补成两条路径：主窗口可见时拖主窗口、主窗口隐藏时拖浮球——桌面有文件拖浮球一步到位，比"先呼出再拖"少两步
- 命中区：44px 浮球太小不好拖中——透明命中区扩大到 ~60px（透明圆比可视圆大，拖入更容易）
- 两个拖拽语义不冲突：用户拖动浮球自身移动位置（Tauri window drag / drag-region）vs 用户拖文件到浮球（dragDrop 事件）——Tauri 区分两类，不会"想移动浮球被当成接收文件"
- 上传链路同 D22 底层：`POST /api/console/upload` → url → content part（file_url/image_url），与 F3/S2/Console 完全一致

**结论**：
- 浮球成为文件投放点：拖文件到浮球 → upload 各文件 → 主窗口 show + D21 呼出动画 → chip 出现在输入框上方 + 文件引用拼 content part 准备发送
- 拖入态视觉（拖文件悬停浮球上）：浮球 `scale(1.15)` 放大 + 绿边光晕 + 图标变 `📥` + 小字"投放给 agent"；释放后浮球回弹、主窗口展开、chip 出现
- 透明命中区 ~60px（命中区大于视觉球体）
- 多文件支持：拖入 N 个文件 → N 条路径 → upload 每个 → N 个 chip
- **待实测**：transparent 窗口的透明区域是否接收 dragDrop 事件（点击穿透与拖拽穿透可能不同步）——若透明区域拖拽穿透，命中区方案改为不透明命中层或按实测调整
- 主窗口隐藏时拖浮球 = 呼出 + 投放一气呵成；主窗口已可见时用户直接拖主窗口（F3），浮球路径作为隐藏态补充

**关联**：D21（浮球基础形态——本条是其交互维度新增）；F3（主窗口拖拽——两条互补路径）；upload + file_url/image_url 链路（与 Console/F3/S2 同款，实证于验收报告 §六）；D16（界面形态——chip 与拖入态视觉）
---

### D23 — 浮球通知态体系（浮球 = 桌面通知中心）

**背景**：P1 阶段用户提出浮球从"呼出按钮"升级为"桌面通知中心"——除呼出/文件投放（D21/D22）外，用一套视觉规则表达 agent 状态与待办（审批/完成/错误），并在中间放一张自设计图片（暂定小爪图）。本条与 D24/D25 同属本次"浮球 + 审批"P1 设计扩展，共享背景见本条；D24/D25 写增量。

**逻辑链**：
- 用户原始硬约束：中间图片永不变——"所以不改变这个图片，通过浮球周围颜色，浮球大小，浮球图片上覆盖一层透明浅色的标记等方案进行交互"。状态信息只能靠外圈与覆盖层承载，图片是浮球身份
- 三维度分工的推理：颜色 = 语义类别（封闭 4 色系统，用户只记颜色不记状态）；大小 = 仅手势态用（通知态放大 = 干扰位置稳定性 + 持续打扰，用户指出拖入态"不会持续一段期间"→ 拖入与拖动归为瞬时交互态，不进语义色系统）；覆盖层 = 具体动作含义（opacity .45 半透明叠图，不改原图）
- app 边界实证（用户关键质疑"需要充分考虑现在app的边界"驱动查证）：① 需输入状态砍掉——QwenPaw schemas.py MessageType enum 全集无 question/ask_user 类型，agent 问问题是普通 MESSAGE 文本 token，与陈述句无结构区别，app 无判断能力；② 审批信号 = 独立 REST（GET /api/console/push-messages 的 pending_approvals），不在对话 SSE 流；③ 错误 = SSE 流内 {"error"}（sse.ts 已实现）+ RunStatus.Failed（可补分支）；④ 完成 = SSE object=response / message status=completed（sse.ts 已实现）
- "在看就不提示"判断被用户否决：主窗口与浮球互斥（D21 呼出时浮球淡出让位），不存在同屏，Atd 式 panelFocused 判断不适用
- 完成/错误必须分色（用户："完成和错误还是要区分的"）：完成 = 蓝（新内容，中性偏正）/ 错误 = 红（需处理，警示）——交互性质不同（完成不需行动、错误相对紧急）
- 生命周期推导：审批待审 = 待用户必须行动（agent 被阻塞），跟 pending 生命周期，300s 后端 future 超时兜底，不自动消失；完成/错误 = 纯通知，挂久即噪声，hover 即清除或 N 秒自动降级（修正原"打开主窗口才清"——用户几小时不开就挂几小时不成立）
- 优先级覆盖链：交互态（用户正操作）> 待行动 > 需处理 > 新内容 > 进行中 > 常态。例：生成中来审批 → 审批覆盖；完成态拖浮球 → 拖动态覆盖
- 粒子效果：用户反馈"光晕有点太细，能不能做点粒子效果"——定为状态进入瞬间一次性迸发（~600ms，8 颗从球边缘飞出淡出），非持续循环（常驻浮球持续喷粒子 = 桌面噪声，违 D11）；技术约束 = 44px 透明窗口内粒子飞不出边界（被裁剪），实际是球缘微弱迸发；生成中持续态不加粒子只留呼吸
- macOS 化调整（用户："感觉和macos不是很搭配"）：① 彩色光晕透明度降 60%（.2-.25 → .07-.1，从大面积扩散彩光改为 macOS 式小 tint，彩色只留细边框+覆盖层小信号）② 覆盖层彩色 emoji（⏸ U+23F8 / 📥 U+1F4E5 在 macOS 渲染彩色 emoji）全换线性符号（❚❚ / ⇣，SF Symbols 语言）③ 界面稿新增 macOS 桌面场景预览（Sonoma 壁纸 + 菜单栏 + Dock）验证真实搭配。遗留提示：🐾 emoji 占位本身是彩色渲染也是不搭来源，正式小爪图建议单色/线性风格、颜色跟状态走

**结论**：
- 浮球 7 状态：常态 / 生成中（绿边+呼吸）/ 审批待审（黄边+❚❚）/ 任务完成（蓝边+✓）/ 错误（红边+!）/ 拖动中（瞬时）/ 拖入态（瞬时）
- 4 色语义封闭系统：绿=进行中 / 黄=待行动 / 蓝=新内容 / 红=需处理
- 中间小爪图（用户自设计）在所有状态永不替换；覆盖层为半透明叠加（opacity .45）
- 生命周期：审批待审跟 pending（300s 超时兜底）；完成/错误 hover 即清除或自动降级
- 优先级覆盖链：拖入态 > 拖动中 > 审批待审 > 错误 > 任务完成 > 生成中 > 常态
- 粒子 = 进入一次性迸发 ~600ms；光晕降强 + 线性符号 + 桌面场景预览的 macOS 化三件套
- 信号来源全部 app 边界内可行（push-messages / SSE error / SSE response）；需输入状态不做

**关联**：D21（浮球基础形态——本条是其状态维度扩展）；D22（拖入态视觉被本条精确化：绿边光晕+图标替换→中性增强+覆盖层保留小爪图）；D24（呼出动画）；D25（审批待审态的卡片落地）；D8（信息精简——通知态克制）；D11（界面轻量化——粒子一次性、光晕降强均为此）；D17（浮球与主窗口材质同源）

---

### D24 — Dock 式呼出动画（浮球 = Dock 替身，修订 D21 动画规格）

**背景**：见 D23。用户提出把 macOS 27 的"缩放进入 Dock"动画平移到 App 主界面与浮球之间（呼出/收回时窗口缩放着飞向/来自浮球）。

**逻辑链**：
- 可行性三档实证（web 查证）：完整 genie（瓶精灵扭曲）核心是 macOS 私有 API——有开发者复刻文章实证结论 "It's private API, all of it"，公开近似路径仅 CAMeshTransform + AppKit window transform（原生 Swift，Tauri WebView 壳走不了，Rust 侧无封装）→ 档 0 不可行
- 档 1（Tauri set_size RAF 窗口真缩放）三硬伤：每帧 set_size 触发窗口重排（macOS resize 是重操作，Tauri 多窗口 orchestration 性能坑有公开文章）；窗口缩放时 WebView 内容跟着拉伸会模糊抖动；44px 浮球 ↔ 380px 主窗口巨大尺寸差动画帧数多易掉帧
- 档 2（选定）内容层三段接力：全程只动 CSS transform/opacity，窗口尺寸不变——零性能风险，观感达 dock 动画约 80%
- 关键设计洞察：macOS scale-into-dock 的本质是"窗口 ↔ Dock 图标"缩放叙事（Dock 图标 = 窗口的驻留代表），与"主窗口 ↔ 浮球"完全同构——浮球就是 App 在桌面的驻留代表（=Dock 替身）。叙事平移后不需要窗口真缩放
- 时间线编排：① 浮球收缩 120ms 吸入预备（cubic-bezier(.4,0,1,1) 加速感）→ ② 主窗口 scale .35→1 + opacity 280ms（保留 D21 的 cubic-bezier(.16,1,.3,1) 与 origin 朝浮球）+ 浮球同步淡出让位 150ms；收回反向 ③ 主窗口收缩 280ms → ④ 浮球 spring 弹回 200ms（cubic-bezier(.34,1.56,.64,1) overshoot——唯一弹性段，补一点 genie 的液体感味道）
- 与 D21 关系：保留 D21 核心（origin 朝浮球 + 280ms + ease-out-expo），新增浮球收缩预备段 + 收回 spring 弹回段 → D21 动画规格被本条修订（摘要层/详情层已加修订注）

**结论**：
- 呼出四段：① 浮球收缩 120ms → ② 主窗口 scale .35→1 + opacity 280ms（origin bottom right 朝浮球）+ 浮球淡出 150ms（延迟 120ms 启动）
- 收回两段：③ 主窗口 scale 1→.35 + opacity 淡出 280ms → ④ 浮球 scale .82→1.06→1 spring 弹回 200ms
- 全程不动窗口尺寸（档 2，避开 set_size RAF 三硬伤）
- 浮球 = Dock 替身叙事；完整 genie 私有 API 不可复刻已实证
- 交付物：可交互动画演示稿（呼出/收回/循环/0.5x 慢放 + 时间轴同步）

**关联**：D21（原呼出动画规格被本条修订）；D6（⌘⇧Space 呼出入口不变）；D17（窗口材质不变）；D11（动画少而精——四段共 ~400ms，无多余段）

---

### D25 — 审批卡片三层设计 + 审批感知机制（A1）

**背景**：见 D23。A1 HITL 审批的两部分——主窗口里的审批卡片形态 + App 如何感知"有审批待审"。用户确认 QwenPaw 有审批协议（"qwenpaw有审批协议的，之前做的桌宠插件就是借用了这个模式"）。

**逻辑链**：
- Atd 实证（NotificationCategories.swift 注释）："No action approves: a notification shows too little of a guarded action to approve it, so approving stays in the panel"——通知里不审批（信息不足），审批在面板/对话流看完整动作。我们方案一致：浮球黄边❚❚ 只提示（D23），审批卡片在主窗口对话流做
- QwenPaw 审批协议实证（app/routers/approval.py + console.py）：独立 REST 不在对话 SSE 流——GET /api/console/push-messages 返回全量 pending_approvals（前端按 session_id 过滤）+ POST /api/approval/approve|deny（body: request_id + session_id + scope/reason）
- 字段减枝依据（用户令："根据qwenpaw的审批页的设计字段进行减枝"）：Console PendingApproval interface 17 字段 → app 三层。默认层 = tool_display_name + severity + findings_summary + reasoning（空则隐藏）+ 批准/拒绝按钮；展开层 = tool_params + exact/similar scope（is_generalized 时，对应 approve 的 scope=exact/similar）；完整详情跳 Console
- app 零摘要原则的由来（用户质疑"一句话理由这个信息从哪里来，谁做摘要？"驱动查证）：findings_summary = 后端 driver_gate.py 结构化生成（"Tool 'X' from 'Y' requires approval for Z"，必有）；reasoning = 后端 get_f1_reasoning() 取的 agent 请求工具前的一句话理由（Console interface 注释 "One-line rationale ... May be an empty string"，可能空）。两者都是后端成品——app 直接展示，不截断不概括；reasoning 空则整行隐藏，app 不补位不猜
- 审批感知借鉴 Console osNotifyStore 实证机制（用户问"有没有参考桌宠插件方案"后的查证）：Console Desktop OS PoC 已验证——轮询 diff 已知 id（首次 seed 不弹、只新项触发）+ resolved 自动 prune（不再 pending 的自动移出）+ badge count 反映总数。浮球❚❚ 态进出直接用这套
- 与桌宠插件方案的关系（诚实结论）：桌宠是进程内 patch ApprovalService.create_pending + 阻塞 POST 转发（插件在后端进程内 hook），App 是前端壳不能 patch 后端只能用 REST 轮询——架构本质不同不可照搬；但桌宠三个 UX 经验适用：双入口先点先生效（console/App 同显审批，一边点另一边 prune）、300s 后端超时（pending.future）、关闭语义（claude-code agent_id 下关闭审批气泡 = deny 的 MiniCPM 既定语义，App 关闭语义待定——建议"未决策、留待 Console"而非直接 deny）
- 轮询频率开放：push-messages 是 GET 拉取非推送，定时间隔（5-10s / 流结束后补拉）需平衡实时性与 D11 克制 → 开放事项 #25

**结论**：
- 审批卡片三层：默认（tool_display_name + severity + findings_summary + reasoning 空则隐藏 + 批准/拒绝）/ 展开（tool_params + exact/similar scope）/ 跳 Console
- app 零摘要：后端字段直接展示；reasoning 空则隐藏整行
- 审批感知：轮询 push-messages + diff 已知 id + resolved 自动 prune（osNotifyStore 机制）；浮球❚❚ 态 = 待审提示，卡片在主窗口对话流
- 审批 UX：双入口先点先生效；300s 超时兜底；关闭语义待定（倾向"未决策留待 Console"）；scope 支持 exact（仅此一次）/similar（同类模式）
- Console 审批字段比 Atd 丰富（severity/findings/reasoning/exact-similar scope），卡片信息量可超 Atd

**关联**：D23（浮球审批态 = 卡片提示入口）；D21（呼出动画）；A1；桌宠插件经验（memory/2026-09-20/pet-plugin-gap-analysis.md §7 双入口+关闭=deny）；Console osNotifyStore.ts（diff+prune 实证）；D8（信息精简——三层减枝）
---

### D26 — 浮球材质选定：实色质感（参考豆包，修订 D21/D23）

**背景**：见 D23。用户截豆包 app 悬浮球图（desktop_screenshot 实证）参考其形态，对比两版本（A Liquid Glass / B 实色）后选定 B 实色。

**逻辑链**：
- 豆包悬浮球形态实证（截图）：屏幕右侧边缘 / 圆形 / 浅色实色质感 + 柔和阴影 / 约 50-56px / 简洁无中间图占位
- 两版本对比实证：A 玻璃（vibrancy 透桌面 / backdrop-filter blur 有 GPU 开销 / 深色壁纸上融入不够突出）vs B 实色（最搭 macOS 原生控件语言 / 2px ring 状态色清晰 / 无 blur 更轻 / 白底上深色覆盖层符号对比强）
- 用户选 B 实色——理由：macOS 原生按钮/HUD 都是实色+柔影语言，搭配度最高（豆包/系统控件同款）
- 状态色表达调整：实色白底上"彩色边框+光晕"不够清晰，改用 2px 彩色 ring（box-shadow 0 0 0 2px color）+ 深色覆盖层符号（opacity 从原 .45 提到 .7——白底需要更强对比）
- 大小 44→50px：参考豆包，50px 在桌面更易点中且不显小
- 中间小爪图保留：用户自设计，建议单色线性风（SF Symbols 爪印），颜色可统一深灰或跟状态走
- 主窗口 D17 不变：D17 是主窗口的 vibrancy/Liquid Glass，本条仅修订浮球——主窗口仍玻璃、浮球实色，两者材质不同但各自搭 macOS（浮球像控件、主窗像系统材质）

**结论**：
- 浮球材质：实色（白→浅灰渐变 #fff→#f0f0f3 + 多层柔和阴影 0 4px 14px + 0 1px 3px + inset 白高光）
- 状态色：2px 彩色 ring（box-shadow 0 0 0 2px）+ 深色覆盖层符号（opacity .7）
- 大小：50px（原 44px）
- 中间小爪图保留，用户自设计（单色线性风建议）
- 主窗口 D17 不变

**关联**：D21（材质+大小修订）；D23（大小+状态色表达修订）；D17（主窗口背景不变，与浮球材质区分）；D11（实色+柔影符合轻量化原生控件语言）

---

### D27 — 浮球柔和光晕版定稿（修订 D23 颜色语义 / D26 状态色表达）

**背景**：见 D23 / D26。浮球形态经多轮演进（D21 Liquid Glass → D23 通知态体系 → D26 实色质感），2026-10-20 出最终版（细边框流光 + 呼吸 + 角标骨架，`QwenPaw-轻量助手-浮球设计最终版-20261020-013226.html`），用户评价"这个版本算是比较成功的，先保留着"。随后用户提出质感调整诉求："颜色分配 OK，调色柔和一点、带点光晕感"，并纠正颜色语义："生成中和进行中应该是一样，都是蓝色的"。

**逻辑链**：
- 语义层 vs 质感层分离：用户明确"颜色分配 OK"（语义映射不动）+ "希望调整质感"（色值/光晕层动）——本次只调质感层，不动状态机的语义映射结构
- 语义修正（生成中=蓝）：D23 原语义"绿=进行中 / 蓝=新内容"与主流颜色语义（蓝=进行中/信息、绿=成功/完成）相反；用户纠正后对调——生成中（agent 正在回复）= 蓝 = 进行中，任务完成 = 绿 = 成功。与第一轮界面讨论确认的主流惯例一致
- 色值柔化（降饱和 + 提明度，粉彩方向）：原版高饱和亮色（#4ade80/#fbbf24/#60a5fa/#f87171）在深色底上偏刺眼；往粉彩拉（#93c5fd/#86efac/#fcd34d/#fca5a5）更温润。深色底是光晕感最佳载体——glow 天然融合不显脏
- 警示色"柔色值 + 强光晕"：红/黄柔了色值，但用 glow 把"这里有情况"的信号补回来——比硬纯红更高级也不减辨识度（存在感由光晕承担，不由饱和度承担）
- 光晕分层（按元素大小给强度）：角标双层 box-shadow（近 6px 实 + 远 14px 虚，两层叠加出真实辉光）；流光 drop-shadow 从 4px/75% 改 6px/45%（更大更淡，从"一道硬光"变"一圈氛围"）；背景 #0a0a0c→#0b0e14 蓝黑（冷色光晕有底色呼应，不显灰）
- 骨架不变：细边框流光 / 呼吸 / 角标 / 几何 / 交互 / 速度全部沿用最终版，仅调色值与光晕——避免质感调整引发形态回归

**结论**：
- 形态骨架：细边框流光（1.6px 沿边缘滑动，头亮尾淡 + 5px 头亮点 + 尾部 3 颗粒子拖尾）+ 生成中整球呼吸（1.6s scale 1→1.08）+ 苹果风角标（17px，2/3 压浮球，2px 白边）
- 色值（柔和粉彩）：蓝 #93c5fd（生成中/进行中）/ 绿 #86efac（完成/成功）/ 黄 #fcd34d（审批）/ 红 #fca5a5（错误）
- 光晕分层：角标双层 box-shadow（近 6px 实 + 远 14px 虚）；流光 drop-shadow 6px/45%；背景 #0b0e14 蓝黑
- 语义（对调后）：生成中=蓝=进行中、完成=绿=成功、审批=黄、错误=红
- 骨架/几何/交互/速度不变，仅调色值与光晕

**关联**：D23（颜色语义修订——绿↔蓝对调）；D26（状态色表达由 2px ring + 覆盖层符号改为细边框流光 + 角标，材质实色不变）；D21（浮球形态基底）；D11（柔和光晕符合轻量化）；界面稿 `QwenPaw-轻量助手-浮球柔和光晕版-20261020-220000.html`（本稿含色值对照表 + 光晕分层说明）

---

### D28 — 浮球弧形菜单（修订 D21 右键菜单）

**背景**：见 D21。D21 原右键菜单为传统 contextmenu 列表（6 项：呼出/新建/置顶/位置重置/隐藏/退出）。用户在浮球形态多轮演进（D23 通知态 / D26 实色 / D27 柔和光晕）后，出弧形菜单 v6 稿并确认："那就按照这个版本"。v6 稿自标注「与 D21：内容 6→4 + 交互形式=连续弧形带菜单，确认后落修订注」。

**逻辑链**：
- 形式升级（列表→连续弧带）：传统 contextmenu 是矩形列表，与圆形浮球的形态语言不连贯；连续弧带（单条粗 stroke 圆头端）从浮球边缘"长出来"，形态同源更协调。v6 关键修正 = 用一条完整 path（stroke-width 48 + linecap round）画弧带，而非 4 个扇形切片拼合（扇形有直线边，静态看像"雷达扫描"而非连续带）
- 内容减枝（6→4）：砍「呼出」——单击浮球已是呼出主路径（D21/D24），菜单里再放一项冗余；砍「位置重置」——角落吸附（D21）已提供位置管理，重置非必需。保留置顶/新建/隐藏/退出 4 项浮球管理类操作
- 交互细节：hover 段只做深浅变化（稍亮深色，不整块变绿——整块变绿在连续弧带上会像选中态而非预选态）；图标变亮绿 + 微放大 1.12 吸引注意（用图标色变凸显，不用背景色块）；气泡在开口侧预选提示
- 开口方向自适应：浮球贴屏幕边缘时菜单不能超屏——右半屏浮球开口朝右（弧在左半），左半屏浮球开口朝左（弧在右半），同一套角度参数翻转即可
- 坐标系统一（v6 治错位根因）：浮球/SVG/图标全部放进同一 300×300 容器（圆心固定 150,150），彻底避免"环和选项错开"

**结论**：
- 右键浮球触发连续弧带菜单，替代原 contextmenu 传统列表
- 形态：单条粗 stroke 圆头端弧带（stroke-width 48 + linecap round），4 图标为弧上位置标记
- 内容 4 项：置顶 / 新建 / 隐藏 / 退出（砍掉呼出与位置重置）
- 交互：hover 段深浅变化 + 图标变亮绿微放大 + 开口侧气泡；开口方向随浮球贴边位置自适应
- 单击呼出 / 双击新建 / 拖动吸附 / 拖文件投放等其余交互不变

**关联**：D21（右键菜单形式+内容修订——单击呼出/双击新建/拖动吸附等其余交互不变）；D22（拖文件投放不变）；D11（弧形菜单形态同源、克制）；界面稿 `QwenPaw-轻量助手-浮球弧形菜单v6-20261020-004500.html` + `QwenPaw-轻量助手-浮球交互总演示-20261020-223000.html`（已整合弧形菜单，可交互）

---

### D29 — V1 选中文本操作栏暂不做（修订 D12 V1 优先级）

**背景**：V1 在 D12 功能清单第 9 域（选中文本与语音），来源 Atd，原定 P2。功能筛选阶段曾建议「不做」（理由：Slash 已替代 + Accessibility 太重），但未正式落盘决议。本轮用户重新提起 V1 并要求调研 Atd 的实现方式。

**逻辑链**（三轮实证）：

**第一轮——记忆笔记回顾 + Agentero 仓库定位**：
- 记忆笔记（2026-10-14）记录 Atd 有 `light-command.ts`（选中文本直接翻译/总结/解释）+ `use-selection-ask.ts`（选中文本提问），需 Accessibility
- GitHub code search 定位到 Atd = `poco-ai/Agentero` 仓库
- 读 `docs/frontend/web-view.md` 实证：Agentero 的划词是 **App 内阅读表面**（PDF / plaza 广场 / 网页论文 / 文本编辑器）的选中文本操作，用 SelectionMenu 浮层 + TranslateCard 流式 + AskPopover（⌘K）+ addSelectionToChat（⌘L）；ephemeral 模式不写对话历史
- 关键发现：Agentero 划词**不需要系统级 Accessibility**——在 App 自己的 WebView 里用 selectionchange 事件即可

**第二轮——场景判断修正**：
- 用户质疑：「WebView 自己渲染的 agent 回复文本——那这样有何意义？」
- 确认：App 内划词对对话窗口场景无意义——用户选中 agent 回复文本，用输入框直接指令即可（「翻译你刚才说的第二段」），划词只省一步复制黏贴却增 UI 浮层
- 划词真正有意义的场景 = 系统级（任意 App 选文本弹浮层），但这回到 Accessibility 问题

**第三轮——豆包 App 本地实证**：
- 豆包（Doubao）= Chromium-based App（内嵌 Doubao Browser Framework，Chromium 147）
- Doubao Browser Framework 二进制 strings 实证：
  - macOS `AXUIElement` API（`_AXUIElementGetWindow`）— 系统级 Accessibility 直接调用
  - Chromium `chrome.automation` API 完整定义（`automation.getDesktop()` + `textSelectionChanged` 事件 + `boundsForRange` 坐标 + `automationInternal.AXTextLocationParams`）— 访问系统级无障碍树监听任意 App 文本选择
- entitlements 有 `com.apple.security.automation.apple-events`（用于和 Excel/Word/Preview 交互）
- 无 Dock 图标辅助进程（`Helpers/豆包.app`，LSUIElement=true）= 划词浮层进程
- 结论：豆包的系统级划词**需要 macOS Accessibility 权限，无捷径**；Chromium automation API 底层也要系统 TCC 授权

**Tauri 路径分析**：
- 豆包能用 chrome.automation 是因为内嵌 Chromium；Tauri 用 WKWebView 无此 API
- Tauri 实现系统级划词 = Rust 侧直接调 macOS AXUIElement（`accessibility-sys` crate 或 FFI 到 ApplicationServices）+ 监听 `kAXSelectedTextAttribute` 变化 + `AXUIElementCopyAttributeValues` 取坐标 + Tauri 多窗口弹浮层
- 技术可行，但成本不在代码量，在：① 权限引导（首次用引导用户系统设置开 Accessibility）② 跨 App 兼容性打磨（不同 App 文本选择行为不一致）③ 原生层中型功能与 D11 轻量化定位有张力

**结论**：
- V1 选中文本操作栏：**暂不做**（当前阶段不投入）
- 判定依据 = App 内划词无意义 + 系统级划词需 Accessibility（豆包实证确认无捷径）+ Tauri 路径是原生层中型功能与轻量化定位有张力
- 不删除——未来如重新评估，Tauri 实现路径已明确（Rust FFI 到 ApplicationServices，不内嵌 Chromium）
- 修订 D12 清单 V1 状态：P2 → 暂不做

**关联**：D12（V1 优先级修订 P2→暂不做）；D11（轻量化定位张力）；Agentero 仓库 `poco-ai/Agentero` docs/frontend/web-view.md（App 内划词实证）；豆包 App `Doubao Browser Framework` 二进制 + entitlements（系统级 Accessibility 实证）

---

### D30 — 文件交互一条线定稿（F1 + F2 + F3 + S2）

**背景**：F1/F2/F3 在 D12 功能清单第 4 域（文件与附件），S2 在第 5 域（截图与图片），均来源 Atd，P1。界面稿已出（F1-F2-F3 操作稿 + S1-A1 稿），边界已讨论（F1 搜索补全、F3 走 upload 同 Console 路径），但未正式落盘。本轮统一拍板。

**逻辑链**：
- 四项是同一数据流的不同入口：F1=键盘 @ 选择 / F3=鼠标拖主窗口 / D22=拖浮球（已落盘）/ S2=⌘V 粘贴，底层共享 upload 链路 + chip 组件，应一起拍
- **F1 搜索范围**：用户指出"如果只在项目目录，你新建场合其实压根也没有设置专门的项目目录，主要还是在 workspace 里面打转"——Agentero 实证用 Vault（工作空间）概念，搜索在 Vault 范围内；我们 App 没有项目目录概念，范围定为 Desktop + Documents + Downloads 三个常见位置，不要求用户设工作目录（D11 轻量化）
- **F1 选择器形态**：搜索补全列表（打 @ 实时过滤、键盘选、不弹系统对话框），实证 Agentero 同款；不走原生 open dialog（D9 统一对话交互）
- **F1 实现路径**：方案 A 原生壳侧 Rust 搜本地文件（glob + fuzzy match），不走 QwenPaw 后端 agent 的 file_search（实时搜索补全需要前端即时响应，调后端延迟大）；资源消耗可接受——按需搜索（打 @ 才搜）不建索引，glob 几千文件毫秒级，ignore 跳 node_modules/.git + debounce 200ms + 限制结果 20 条 + 搜索深度 3-4 层
- **F2 chip 形态**：用户定"轻量化直接用文件名"（不要缩略图）；chip 展示在输入框上方，图标 + 文件名 + × 删除，统一所有来源
- **F3/S2 拖拽+粘贴**：实证 Agentero `use-external-file-drop.ts`（Tauri v2 `dragDropEnabled:false` + window `dragover`/`drop` 监听 + `preventDefault` 阻止 WebView 导航 + `subscribeTauriFileDrop` 取路径），和我们 Tauri 路径完全一致；拖入覆盖层提示"投放给 agent"；粘贴 ⌘V 图片 → chip
- **统一 upload 链路**：三条入口（@选择/拖主窗口/拖浮球）+ 粘贴，终点一致——`POST /api/console/upload` → url → content part（file_url/image_url），与 D22/Console/F3 同款（实证验收报告 §六）

**结论**：
- F1：@ 搜索补全列表，范围 Desktop+Documents+Downloads，Rust 侧 glob+fuzzy+ignore+debounce，按需搜索不建索引
- F2：chip 用文件名（不要缩略图），输入框上方展示
- F3/S2：Tauri 拖拽（dragDropEnabled:false + window dragover/drop + preventDefault + subscribeTauriFileDrop）+ ⌘V 粘贴，拖入覆盖层提示
- 三条入口 + 粘贴统一 `POST /api/console/upload` → url → content part

**关联**：D12（F1/F2/F3/S2 定稿）；D22（浮球拖拽已落盘，本条补主窗口拖拽+粘贴）；D16（chip 形态）；Agentero 仓库 `use-external-file-drop.ts`（拖拽实证）；界面稿 `QwenPaw-轻量助手-F1-F2-F3-界面操作稿-20261018-205233.html`

---

### D31 — 截图功能 S1 定稿

**背景**：S1 在 D12 功能清单第 5 域（截图与图片），来源 Atd，P1。界面稿已出（S1-A1 稿，含 📷 按钮两态 + 截图后 chip 流程），但未正式落盘。本轮拍板。

**逻辑链**：
- **入口**：用户定"快捷键+主窗口按钮"——不只快捷键（用户之前明确"主窗口加截图按钮，不止快捷键"），两个都要（按钮发现性好、快捷键效率高）
- **快捷键**：⌘⇧X（避系统 ⌘⇧4/5），X 取"截图"语义
- **实现**：`screencapture -i -c`（系统原生选区 UI，macOS 自带），不自己画选区框（系统选区 UI 最稳、用户最熟、零开发成本）→ 剪贴板 → chip
- **截图后行为**：chip 出现 + 输入框聚焦等用户补话（不自动发送，用户补一句"看下这个报错"再发）——截图是"喂素材"不是"发指令"，和 F3 拖文件行为一致
- **Atd 对比**：用户要求"参考一下 atd 的设计"——查 Agentero 仓库 hooks 目录无截图相关文件（记忆笔记里的 `use-screenshot-shortcut.ts` 在新版已不在），Agentero 是论文阅读器，截图非其核心功能，无额外可借鉴
- **截图后行为确认**：用户要求"再确认一下 atd 的设计"——Agentero workspace.md 实证文件/选区操作后行为 = chip + composer 聚焦等补话（`publishSelection` → chip → 输入框聚焦），和我们设计一致
- **Agent 自主截图**：用户问"是在 qwenpaw 实现的还是 app 里面实现的？"——在 QwenPaw 后端实现（`desktop_screenshot()` 是 agent 内置工具），App 不做截图能力本身；两种模式共存：App 截图=用户主动截的快入口 / Agent 自主截图=用户说"帮我看下屏幕"→agent 自己调 desktop_screenshot 工具→分析→回复的省事模式

**结论**：
- 入口：主窗口 📷 按钮 + ⌘⇧X
- 实现：`screencapture -i -c` → 剪贴板 → chip（文件名，复用 D30 F2 chip）+ 输入框聚焦
- 截图中按钮变黄呼吸
- Agent 自主截图 = QwenPaw 后端 `desktop_screenshot` 工具，App 不做

**关联**：D12（S1 定稿）；D30（chip 复用文件名）；界面稿 `QwenPaw-轻量助手-S1-截图按钮-A1-审批卡片-20261018-220101.html`

---

### D32 — 快捷键重设 W5 定稿（修订 D12 W5 / D28 弧形菜单）

**背景**：W5（快捷键录制器）在 D12 功能清单第 1 域，来源 Atd，原 P2，功能筛选阶段归「不做」（理由：默认快捷键够用）。本轮 S1 截图定快捷键 ⌘⇧X 时，用户衍生需求："所有相关快捷键，需要有个面板在用户不喜欢默认快捷键的时候，可以让用户来重设快捷键"——W5 重新评估。

**逻辑链**：
- **D11 张力判断**：D11 说"不做设置面板"，但快捷键重设不一定需要常驻重设置面板——用户提出"在弧形菜单里面增加一个选项"，从弧形菜单入口弹出轻量列表，不是常驻面板，不违 D11
- **交互设计**（用户逐点确认）：
  - 弧形菜单加第 5 项「快捷键设置」（D28 从 4 项改 5 项），键盘图标（rect 外框+4 按键点+空格条，SVG 线条风格统一）
  - 面板 = 三行快捷键列表（呼出/隐藏 ⌘⇧Space · 截图 ⌘⇧X · 新建 Session ⌘N），每行功能名+描述+当前快捷键
  - 点击快捷键区域 → 录制态（蓝色脉冲）→ 用户键盘按一下 → 自动录入（组合键自动收集 ⌘⌃⇧⌥ + 主键）
  - 冲突检测：同键设两个功能 → 该行红标 + "冲突"提示
  - 恢复默认按钮：底部一键恢复全部默认值
  - ESC 取消录制 + 点击面板外部关闭
- **UI 打磨**（用户反馈后改两处）：① 去掉"点击重设"提示文字（用户说"用户应该可以理解的"）② 快捷键框统一 `min-width: 88px` + 居中对齐（用户说"长度有点不统一，影响美观"）→ ⌘N 和 ⌘⇧Space 框一样宽
- **面板定位**：从浮球位置弹出（与主窗口/弧形菜单同坐标系）

**结论**：
- W5 从「不做」改「做」
- 弧形菜单 D28 从 4 项改 5 项（新增「快捷键设置」）
- 面板形态：轻量弹出列表（非常驻面板），从弧形菜单入口触发
- 交互：点击录制 + 按键自动录入 + 冲突检测 + 恢复默认 + ESC 取消 + 外部关闭

**关联**：D12（W5 优先级修订 P2→做）；D28（弧形菜单 4→5 项）；D11（轻量化——非常驻面板，弧形菜单入口弹出）；界面稿 `QwenPaw-轻量助手-快捷键重设面板-20261020.html` + `QwenPaw-轻量助手-浮球交互总演示-20261020-223000.html`（已整合弧形菜单第 5 项 + 面板）

---

### D33 — 窗口行为定档（关闭 #12 / #13 / #20）

**背景**：#12（窗口默认位置）、#13（失焦自动收起）、#20（窗口行为细节：置顶/可调整大小/最小高度）三个开放议题互相关联，打包定档。D17 已覆盖背景透明度机制（原生 vibrancy + hudWindow），本条定剩余行为项。

**逻辑链**：
- **#12 位置 = 右下角 + 浮球自适应**：浮球默认在右下角（D21），主窗口从浮球附近呼出，D24 呼出动画 `transform-origin` 朝浮球方向感最强。但浮球会被拖动（D21 拖动+角落吸附），主窗口不能写死右下角——呼出时根据浮球当前位置动态计算：右半屏→主窗左上方 / 左半屏→主窗右上方，与 D28 弧形菜单开口自适应同思路。D24 原固定 `origin: bottom right` 精确化为动态朝浮球方向
- **#13 失焦收起 = 默认关闭**：对话场景不是"查一下就走"（不像 Spotlight），用户可能看 agent 回复时切去查资料，回来窗口没了体验差。D17 `followsWindowActiveState` 失焦变暗已有"非活跃"视觉提示（系统白得），不需要更激进隐藏。主动收起靠用户（浮球单击/⌘⇧Space，D24 缩回动画）
- **#20 置顶 = 默认不置顶**：弧形菜单「置顶开关」（D28 第 1 项）管的是主窗口——开=always-on-top（全屏App下可见）/ 关=正常层级。浮球始终置顶（桌面常驻元素本质，不需用户控制）。D21 原置顶开关语义明确化：管主窗口而非浮球
- **#20 可调整大小 = 是**：用户指出"为了应对各种场景对于主窗口大小是要可以调整的"——轻量窗口但不同场景需要不同大小（短回复小窗够、看长代码需要大一点）。默认 400×520（界面稿 v8 尺寸），用户可拖拽边缘调整。最小 320×320（宽 320 保证顶栏 agent 名+新建按钮+输入区📎📷输入框↑可用 / 高 320 保证顶栏 38+输入区 46+消息区最小 ~236）
- **#20 背景透明度**：已由 D17 定（原生 vibrancy + hudWindow），本条不重复

**结论**：
- #12：右下角 + 浮球位置自适应（右半屏→左上 / 左半屏→右上），origin 动态朝浮球，边界检测回弹
- #13：失焦收起默认关闭（失焦变暗已有 + 主动收起靠用户）
- #20：主窗口置顶默认不置顶（弧形菜单开关管主窗口，浮球始终置顶）；可调整大小（默认 400×520，最小 320×320）

**关联**：#12 #13 #20（关闭）；D24（origin 精确化——固定 `bottom right` 改动态朝浮球）；D21（置顶开关语义明确化——管主窗口，浮球始终置顶）；D17（失焦变暗 followsWindowActiveState + 背景透明度已定）；D11（轻量化——固定大小改可调是用户明确需求，不违 D11）；D28（弧形菜单置顶开关=主窗口置顶）

---

### D34 — 连接体系定档（关闭 #15 / #19）

**背景**：#15（连接配置：地址/端口设置项 + 离线检测）、#19（连接管理行为：离线提示内容、自动重连、多实例、端口方案）两个开放议题互相关联，合并为"连接体系"一条线定档。App 是连接 `localhost:8088` 的前端壳（D2），连接是使用前提。

**逻辑链**：
- **自动搜索**：用户问"连接配置可以自动搜索吗？毕竟app是使用qwenpaw的前提"——QwenPaw 跑在 `localhost:8088`，启动时先试默认端口，连不上扫描常见端口（3000/8000/5000），找到直接用。降低首次使用门槛（用户不需要知道端口）
- **onboarding**：自动搜索找不到 → 首次引导输入地址（一次性，之后不再弹）。配置成功后记住，之后修改走角落面板「连接设置」（D36）
- **状态灯**：用户设计"在agent名前面加个灯，绿色说明链接正常，如果是灰色了这是链接不正常"——顶栏 agent 名前面加状态灯（绿=SSE 正常 / 灰=断开离线），常驻可见，不弹系统弹窗（D9 统一对话流 + D11 轻量）。灰点 hover 显示"无法连接 QwenPaw"+重试按钮
- **自动重连**：用户确认"自动重连这个设计OK"——启动时自动连上次地址，SSE 断开后定时重试，用户不需要手动重连
- **多实例**：用户指出"多实例是应该根据qwenpaw固有设计来决定吧"——QwenPaw 后端是单实例（localhost 单端口），多实例不是其设计，App 暂不支持，跟随 QwenPaw
- **端口配置**：用户指出"这个问题和1）我觉得是有关联的"——如果自动搜索能找到 QwenPaw，就不需要手动配端口。默认 8088 可改，与自动搜索关联（搜到就不用手动配）

**结论**：
- 自动搜索：默认 localhost:8088 + 常见端口扫描，找到直接用
- onboarding：自动搜索失败时首次引导输入（一次性）
- 状态灯：顶栏 agent 名前绿/灰灯（绿=在线 / 灰=离线），hover 显示重试
- 自动重连：启动自动连 + SSE 断开定时重试
- 多实例：跟随 QwenPaw（单实例，暂不支持）
- 端口配置：默认 8088 可改，与自动搜索关联
- 之后修改：角落面板「连接设置」（D36）

**关联**：#15 #19（关闭）；D36（角落面板连接设置入口）；D9（状态灯不弹窗）；D15（Agent ID 已定）；D2（App 是前端壳，连接是前提）

---

### D35 — 日志系统定档（关闭 #18）

**背景**：#18（错误处理 + 日志导出）开放。用户确认"崩溃不白屏 OK"+"赞成要设计一个日志系统"，需要定日志系统的设计。

**逻辑链**：
- **记录内容**：只记技术事件（启动/关闭/连接成功失败/SSE 流开始结束错误/崩溃堆栈/关键操作呼出截图发送），不记录对话内容/token/密码——隐私优先（用户对话是隐私，日志只服务排查技术问题）
- **三级日志**：ERROR（崩溃/连接失败）/ WARN（重连/超时）/ INFO（启动/连接成功/关键操作），DEBUG 默认关闭——三级够用，轻量 App 不需要更细
- **存储**：本地文件 `~/Library/Logs/QwenPaw轻量助手/`，按日期轮转（每天一个文件），保留最近 7 天——不无限增长，7 天够排查问题
- **双层实现**：Tauri 侧（Rust）记原生事件（崩溃/窗口/连接）+ 前端侧记 UI 事件（SSE 消费/用户操作），统一写同一日志文件——原生和前端事件都要记，合并到一个文件方便排查
- **导出**：角落面板「导出日志」（D36）→ 打包最近 7 天 → 保存到桌面——用户提交 issue 时提供

**结论**：
- 记录：技术事件，不记对话内容/token/密码（隐私）
- 三级：ERROR/WARN/INFO，DEBUG 默认关
- 存储：`~/Library/Logs/QwenPaw轻量助手/`，按日轮转，保留 7 天
- 实现：Tauri Rust 记原生 + 前端记 UI，统一文件
- 导出：角落面板「导出日志」→ 打包 7 天 → 桌面

**关联**：#18（关闭）；D36（角落面板导出日志入口）；D11（轻量——三级+按日轮转+保留 7 天）

---

### D36 — 信息架构定档（低频功能收纳，修订 D28/D32/#17）

**背景**：D28 弧形菜单 4 项 + D32 快捷键设置第 5 项后，随着连接设置/日志导出/自动更新等低频功能加入，弧形菜单会膨胀。用户提出"日志这样的用的频度低的，是不是在主界面上设计一个角落作为不常用的功能的面板，会更加好点？"——低频功能不该堆弧形菜单。

**逻辑链**：
- **分工原则**：弧形菜单=高频浮球/窗口管理（右键浮球触发，用户频繁操作）；主窗口角落面板=低频 App 设置/工具（主窗口内触发，用户偶尔用）——按使用频率分工，高频放浮球右键（手边），低频放主窗口角落（不干扰对话）
- **弧形菜单精简为 4 项**：置顶/新建/隐藏/退出——纯浮球/窗口管理，快捷键设置移出（D32 修订）
- **主窗口角落面板**：顶栏最右「⋯」入口，点击弹出轻量面板，收纳低频功能——连接设置/导出日志/快捷键设置/检查更新/关于。「⋯」比「⚙」更中性（面板里不全是设置，还有导出日志等工具）
- **快捷键设置移到角落面板**：D32 原本放弧形菜单第 5 项，现在移到角落面板——弧形菜单回到 4 项，快捷键设置归到低频收纳
- **自动更新 #17 纳入设计**：用户问"关于更新的功能是不是也可以放到【主窗口角落面板】内？"——可以。交互=角落面板「检查更新」+ 有新版本时「⋯」入口显示小红点角标（不弹窗不打扰 D11）+ 用户主动更新。Tauri updater 实现归工程，交互设计归本条
- **onboarding**：首次连接引导（自动搜索失败时弹，一次性，见 D34）——不属于角落面板也不属于弧形菜单，是一次性引导流程

**结论**：
- 弧形菜单（右键浮球）= 4 项高频（置顶/新建/隐藏/退出）
- 主窗口角落面板（顶栏「⋯」）= 低频收纳（连接设置/导出日志/快捷键设置/检查更新/关于）
- 快捷键设置从弧形菜单移到角落面板（D32 修订）
- 自动更新 #17 纳入设计（角落面板「检查更新」+「⋯」角标提示 + 主动更新）
- onboarding = 首次连接引导（一次性）

**关联**：D28（弧形菜单 4 项——快捷键设置移出）；D32（快捷键设置移到角落面板）；#17（自动更新纳入设计）；D34（onboarding+连接设置）；D35（导出日志）；D11（轻量化——低频收纳不堆弧形菜单）

---

---

## 开放事项表

| 编号 | 类型 | 状态 | 摘要 | 关联 |
|---|---|---|---|---|
| #10 | 议题 | 关闭 | ~~Tauri vs Electron 选型~~ → T1 已按 Tauri v2 实施并全链路验证（vibrancy/Liquid Glass 双路径、插件体系、签名编译环境打通）；用户审 MVP 交付 plan 时未提出改选，视为确认；体积/依赖实测符合 D4/D11 | ← D4 D11 D17 |
| #11 | 议题 | 关闭 | ~~SSE 流实际字段实测~~ → 已由 T6 查源 QwenPaw schemas.py/base.py 完成：object=message（type: message/reasoning/plugin_call，status 三态）/ object=content（text delta/工具数据）/ object=response；thinking=type:reasoning 已按 D8 过滤；工具字段已支撑 T10 工具行实现 | ← D8 |
| #12 | 议题 | 关闭 | ~~窗口默认位置~~ → 右下角 + 浮球位置自适应（浮球拖动后动态计算主窗位置），见 D33 | ← D4 D24 D33 |
| #13 | 议题 | 关闭 | ~~失焦自动收起~~ → 默认关闭（D17 失焦变暗已有 + 主动收起靠用户），见 D33 | ← D4 D17 D33 |
| #14 | 待办 | 关闭 | ~~MVP 功能范围确认~~ → 18 项全交付并通过三层验收（T1-T14 + 冒烟 11 项 + 2DRinV 审核 + vitest 回归），见验收报告-最终任务验收-20261018.md | ← D12 D14 |
| #15 | 待办 | 关闭 | ~~连接配置~~ → 自动搜索（默认 8088+常见端口扫描）+ onboarding 首次引导 + 角落面板连接设置，见 D34 | ← D10 D15 D34 |
| #16 | 待办 | 开放 | 发布物料：README + LICENSE (MIT) + GitHub Release dmg 打包 | ← D10 |
| #17 | 待办 | 关闭 | ~~自动更新机制~~ → 纳入设计：角落面板「检查更新」+「⋯」角标提示 + 主动更新（Tauri updater 实现归工程），见 D36 | ← D10 D36 |
| #18 | 待办 | 关闭 | ~~错误处理 + 日志导出~~ → 崩溃不白屏 + 日志系统（三级+按日轮转+保留 7 天+角落面板导出），见 D35 | ← D10 D35 |

---

| #19 | 议题 | 关闭 | ~~连接管理行为~~ → 状态灯（绿/灰）+ 自动重连 + 多实例跟随 QwenPaw + 端口默认 8088，见 D34 | ← D10 D34 |
| #20 | 议题 | 关闭 | ~~窗口行为细节~~ → 置顶默认不置顶（弧形菜单开关管主窗口）/ 可调整大小（默认 400×520，最小 320×320）/ 背景透明度已由 D17 定，见 D33 | ← D11 D17 D33 |
| #21 | 议题 | 关闭 | ~~Markdown 渲染方案：react-markdown / remark+rehype / 自定义最小化~~ → 定为自定义最小化渲染器（零依赖，只支持界面所需格式），见 D18 | ← D11 D18 |
| #22 | 议题 | 关闭 | ~~是否加载历史消息待定~~ → 定为加载：最近 N 条（默认 20）+ D8 过滤，失败降级空窗口，见 D19 | ← D8 D15 D19 |
| #23 | 议题 | 关闭 | ~~hudWindow vs underWindowBackground 待选~~ → 定为 `.hudWindow`（用户 2026-10-17 确认），见 D17 校准 | ← D17 |
| #24 | 议题 | 关闭 | ~~平台范围确认~~ → 现阶段仅 macOS（README 时定最低版本 macOS 15，D17 vibrancy 需 15+/26+）；Windows 后续用 GitHub Actions CI 交叉构建（不需本地虚拟机），D4「dmg/exe」收紧为仅 dmg | ← D4 D17 |
| #25 | 议题 | 关闭 | ~~审批卡片轮询频率~~ → 定为对话流结束后补拉一次 + 5s 定时轮询（平衡实时性与 D11 克制），2026-10-20 用户确认 | ← D25 |
## 关联文档

| 文档 | 定位 | 角色 |
|---|---|---|
| 需求图谱.md | 功能需求和非功能需求的完整清单 | 消费方（本文档决议的功能面展开） |
