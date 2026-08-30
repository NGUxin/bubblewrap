# 泡泡纸小游戏 · 架构设计

> 版本：v0.2（2026-08-29）
> 引擎：Cocos Creator 3.8.8 · TypeScript
> 目标平台：抖音小游戏（tt），同时保持 Web 可调试

---

## 1. 设计目标

- 支撑当前五关章节「点 → 线 → 面 → 节奏 → 爆发」的稳定运行。
- 预留后续扩展：更多章节、激励广告、排行榜、分享、皮肤、震动反馈。
- 支持 2 人并行开发：**玩法逻辑**与**表现层**解耦，各改各的文件。
- 渐进式重构：不推翻重写，每一步都保持「可玩、可构建、可上线」。

## 2. 现状盘点

### 2.1 现有代码

| 文件 | 行数 | 职责 |
| --- | --- | --- |
| `assets/scripts/GameManager.ts` | 616 | 关卡配置、存档、输入、生成、击破、Combo、连锁、震动、粒子、HUD、遮罩 UI（上帝类） |
| `assets/scripts/Bubble.ts` | 56 | 泡泡本体：状态、放大淡出动画、震动 |

### 2.2 核心问题

1. **上帝类**：GameManager 同时是配置表、状态机、输入层、渲染层、UI 层。任何改动都集中在一个文件，两人并行必冲突。
2. **命中检测是 O(n) 遍历**：当前 10~80 个泡泡没问题；关卡密度上升或滑动高频触发时会成为隐患。
3. **频繁 instantiate/destroy**：迷你泡泡每击生成一次再销毁，粒子多了 GC 压力大，长时间玩会掉帧。
4. **平台 API 散落**：`tt.getStorageSync` 直接写在存档函数里；后续接震动、广告、分享时还会继续散落，且 Web 端调试困难。
5. **存档无版本号**：未来字段变化（新增皮肤、设置项）没有迁移机制。
6. **关卡配置内嵌在主文件**：新增关卡必须改主逻辑文件，且与玩法代码耦合。

### 2.3 结论

把 GameManager 拆成「薄控制器 + 各司其职的模块」，由 **事件总线** 连接。配置与逻辑分离，表现与玩法分离，平台能力统一收口。

---

## 3. 分层架构

```
┌──────────────────────────────────────────────────┐
│ 表现层  UI / View                                 │
│   TitleScreen · HUD · LevelCard · ResultScreen    │
│   VFX(粒子/迷你泡泡) · Audio                       │
├──────────────────────────────────────────────────┤
│ 玩法层  Gameplay                                  │
│   LevelSystem · Bubble · InputSystem              │
│   ComboSystem · ChainSystem · WinJudge            │
├──────────────────────────────────────────────────┤
│ 数据层  Data / State                              │
│   LevelConfig · LevelDefs · SaveSystem · Settings │
├──────────────────────────────────────────────────┤
│ 基础服务  Service                                 │
│   EventBus · ObjectPool · AudioManager            │
│   PlatformAdapter · AdsService(预留)              │
└──────────────────────────────────────────────────┘
```

依赖规则：

- 上层依赖下层，下层**不反向依赖**上层。
- 模块之间不直接互相引用，只通过 **EventBus** 收发事件（同模块内可直调）。
- 玩法层不知道 UI 长什么样；UI 只订阅事件、调用服务接口。

---

## 4. 模块设计

### 4.1 GameFlow（游戏流程状态机）

职责：控制游戏顶层流转，串联各模块。

```
BOOT → TITLE → INTRO → PLAYING → CLEARED → NEXT / REPLAY
                      ↘ TIME_UP → RETRY
```

关键接口：

```ts
class GameFlow {
  state: FlowState;
  start(): void;            // 读存档 → TITLE
  continueGame(): void;     // 跳到第一个未通关关卡
  restartFromZero(): void;  // 清档重来
  loadLevel(id: string): void;
  onLevelCleared(): void;   // 内部：写存档 → CLEARED
}
```

落地文件：`core/GameFlow.ts`。当前 `GameManager` 中的标题/遮罩流转逻辑迁入。

### 4.2 LevelSystem + LevelConfig（配置驱动关卡）

**原则：新增关卡 = 新增一条配置，不改玩法代码。**

```ts
interface LevelConfig {
  id: string;                 // '1-1'
  chapter: number;            // 章节，未来可做章节解锁地图
  theme: string;              // '空'
  keywords: string;
  narrative: string;          // 开场衔接文案
  outro: string;              // 通关衔接文案

  spawn: SpawnConfig;         // 生成规则
  mechanics: MechanicsConfig; // 机制开关与参数
  timeLimit: number;          // 0 = 不限时
  burstScale: number;         // 击破表现强度
}

interface SpawnConfig {
  placement: 'random' | 'path' | 'grid' | 'wave' | 'mixed';
  count: number;
  sizeMin: number;
  sizeMax: number;
  params?: Record<string, number>; // 波浪幅度/网格间距等，未来扩展
}

interface MechanicsConfig {
  combo?: { windowSec: number; pitchStep: number; maxPitch: number };
  chain?: { probability: number; radiusFactor: number; delayMin: number; delayMax: number };
  neighborShake?: boolean;
}
```

- `data/LevelDefs.ts` 导出五关配置（由当前 `LEVELS` 常量迁移而来，字段规范化）。
- `gameplay/LevelLoader.ts` 根据配置完成：生成位置计算 → 泡泡创建 → 计时注册 → 胜负判定注册。
- 新增玩法机制（如长按、限步）时，先在 `MechanicsConfig` 增加开关，再在 LevelLoader 里实现，最后某关卡配置里打开。

### 4.3 Bubble（泡泡实体）

职责：单个泡泡的状态与表现，**不持有全局逻辑**。

```
状态：IDLE → POPPING → DEAD
      IDLE ⇄ SHAKE（瞬时脉冲）
```

```ts
class Bubble {
  get isPopped(): boolean;
  pop(): void;   // 放大淡出，发 EventBus 'bubble:popped'
  shake(): void;
  reset(): void;
}
```

- 保持现有 `Bubble.ts` 的动画实现（放大 1.35 倍 + 0.22s 淡出）。
- 击破后的事件从 `node.emit('bubblePop')` 改为 `EventBus.emit('bubble:popped', { node, pos, scale })`，统一出口。

### 4.4 InputSystem（输入层）

职责：统一监听触摸，把「点按」和「滑动」归一为命中事件。

```ts
class InputSystem {
  init(container: Node): void;
  onTouchStart / onTouchMove / onTouchEnd;
  hitTest(uiPos: Vec2): Bubble[]; // 经空间网格
}
```

- **滑动连续击破**：TOUCH_MOVE 每帧最多做一次命中判定（节流 16ms），保证手感顺滑又不至于 O(n) 爆炸。
- **空间网格 SpatialGrid**：泡泡创建时登记格子，命中时只查相邻 9 格。泡泡 ≤100 时可先用线性扫描，预留网格实现，>200 自动切换。
- 输入层只产出命中结果，不直接改泡泡状态；击破动作由 LevelSystem/事件驱动（保留现有"谁命中谁 pop"即可）。

### 4.5 ComboSystem（连击）

```ts
class ComboSystem {
  onBubblePopped(): void;          // 窗口内递增，超窗重置
  get combo(): number;
  get pitch(): number;             // 供 AudioManager 使用
  reset(): void;
}
```

- 参数（0.8s 窗口、每击 +0.05 pitch、上限 1.8）迁入对应 LevelConfig.combo。
- 只负责数值，UI 与音调由订阅者响应 `combo:changed`。

### 4.6 ChainSystem（连锁）

```ts
class ChainSystem {
  onBubblePopped(from: Bubble): void;
  // 邻域 BFS：概率扩散 + 随机延迟触发
}
```

- 当前实现（25% 标记 + 邻域 35% 概率 + 0.1~0.22s 延迟）作为默认策略迁入。
- 未来可扩展：连锁传播可视化连线、连锁计分倍率、特定泡泡触发全屏连锁。

### 4.7 ObjectPool（对象池）

```ts
class BubblePool {
  acquire(): Node;   // 激活复用或新建
  release(node: Node): void;
}
class MiniBubblePool {
  acquire(): Node;   // 击破小泡泡
  release(node: Node): void;
}
```

- 迷你泡泡由「instantiate + destroy」改为池化复用，动画结束即回收。
- 泡泡本体在关卡切换时也走池化（当前 destroy/重建可保留，量小；先池化迷你泡泡收益最大）。

### 4.8 AudioManager

```ts
class AudioManager {
  playPop(combo: number): void; // pitch 随 combo 变化
  playWin(): void;
  playFail(): void;
  setSfxEnabled(on: boolean): void;
}
```

- 现有 `popAudio.play()` + pitch 逻辑迁入，并保留「预加载重试」兼容逻辑（Web/Douyin 音频加载差异）。
- 未来加 BGM 时走同一入口，不散落在玩法代码里。

### 4.9 SaveSystem（存档，版本化）

- 存储访问抽到 `core/Storage.ts`（封装 `tt.getStorageSync` / `localStorage`）。
- 存档结构升级为 **v2**，兼容当前 v1：

```ts
interface SaveDataV2 {
  version: 2;
  unlocked: number;
  completed: number[];
  bestCombo: number;
  lastLevelId: string;           // 继续游戏直接回到上次位置
  settings: { sfx: boolean; music: boolean };
}
```

- `migrate(raw): SaveDataV2`：无 `version` 视为 v1，补默认字段。
- 写入防抖（连续通关不狂写），读档失败返回默认档。
- 保存时机：关卡通关时 + 退出/切后台时（`tt.onHide`）。

### 4.10 PlatformAdapter（平台适配层）

```ts
interface PlatformAdapter {
  storageGet(key: string): string | null;
  storageSet(key: string, val: string): void;
  hapticShort(): void;                 // tt.vibrateShort / 空实现
  share(message: ShareMessage): void;  // tt.shareAppMessage
  isDouyin(): boolean;
}
```

- `DouyinAdapter`：真机使用，调 tt API。
- `WebAdapter`：浏览器模拟（存储走 localStorage，震动/分享为空实现），保证开发调试一致。
- 当前散落在 GameManager 的 `storageGet/storageSet` 迁入 Storage/Adapter。

### 4.11 AdsService（本期只留接口，不实现）

```ts
class AdsService {
  init(adUnitId: string): void;
  showRewarded(onDone: (watched: boolean) => void): void;
}
```

- 落地时用 `tt.createRewardedVideoAd`，监听 `onClose` 的 `isEnded` 判断是否看完。
- 广告位 ID 从开放平台「流量主」创建后注入，不硬编码在玩法代码。
- 预留奖励点位：解锁更多泡泡版图、皮肤、失败续命、双倍得分。

### 4.12 UI（表现层）

- `ui/TitleScreen.ts`：标题、继续游戏/从头开始。
- `ui/HudView.ts`：关卡名、剩余数、Combo、计时、进度圆点。
- `ui/LevelCard.ts`：开场主题卡。
- `ui/ResultScreen.ts`：通关/时间到弹层。
- 现有 `buildHud/buildOverlay` 拆到各 Screen，UI 只订阅事件，不写玩法逻辑。

### 4.13 EventBus（事件总线）

统一事件表（先定接口，两人并行开发时按事件表对接）：

| 事件 | 载荷 | 生产者 → 消费者 |
| --- | --- | --- |
| `bubble:popped` | `{node, pos, scale}` | Input/Chain → Combo/Audio/VFX/WinJudge |
| `combo:changed` | `{combo, pitch}` | ComboSystem → HUD/Audio |
| `level:cleared` | `{id, stats}` | WinJudge → SaveSystem/ResultScreen |
| `level:timeup` | `{id}` | Timer → ResultScreen |
| `save:changed` | `{save}` | SaveSystem → TitleScreen/HUD |
| `ads:reward` | `{watched, rewardId}` | AdsService → 奖励发放逻辑 |

---

## 5. 一局游戏的数据流

```
GameFlow.start()
  → SaveSystem.load() → TitleScreen（继续/从头）
  → loadLevel(config)
      → LevelLoader.spawn()（SpatialGrid 登记）
      → Timer / HUD 初始化
      → LevelCard 展示 → PLAYING
  → InputSystem.hitTest()
      → Bubble.pop()
          → EventBus 'bubble:popped'
              → ComboSystem（更新 combo/pitch）
              → AudioManager.playPop(combo)
              → VFX（迷你泡泡池飞出）
              → ChainSystem（连锁扩散）
              → WinJudge（剩余数 -1）
  → 剩余 0 → 'level:cleared'
      → SaveSystem.write()（v2 + 防抖）
      → ResultScreen（下一关/重玩）
```

---

## 6. 目标目录结构（重构后）

```
assets/scripts/
├── main.ts                 # 入口，挂载 GameFlow（替代原 GameManager 挂载点）
├── core/
│   ├── EventBus.ts
│   ├── GameFlow.ts
│   └── Storage.ts
├── data/
│   ├── LevelConfig.ts      # 类型定义
│   └── LevelDefs.ts        # 五关配置数据
├── gameplay/
│   ├── Bubble.ts
│   ├── InputSystem.ts
│   ├── ComboSystem.ts
│   ├── ChainSystem.ts
│   ├── LevelLoader.ts
│   ├── WinJudge.ts
│   └── SpatialGrid.ts
├── fx/
│   ├── AudioManager.ts
│   ├── BubblePool.ts
│   └── MiniBubblePool.ts
├── ui/
│   ├── TitleScreen.ts
│   ├── HudView.ts
│   ├── LevelCard.ts
│   └── ResultScreen.ts
├── platform/
│   ├── Platform.ts         # 接口 + 工厂（运行时选择适配器）
│   ├── DouyinAdapter.ts
│   └── WebAdapter.ts
└── ads/
    └── AdsService.ts
```

> 重构过渡期：`GameManager.ts` 保留为薄壳，只负责挂载和转发，业务逐步搬入新模块，每个模块搬完立刻跑一遍本地构建验证。

---

## 7. 存档协议

| 版本 | 说明 | 兼容 |
| --- | --- | --- |
| v1（现状） | `{unlocked, completed[], bestCombo}`，key=`bubblewrap_save_v1` | — |
| v2（目标） | 增加 `version`、`lastLevelId`、`settings` | 自动迁移，读完即升级写入 |

迁移规则：

```ts
function migrate(raw: unknown): SaveDataV2 {
  const v1 = raw as SaveDataV1;
  return {
    version: 2,
    unlocked: v1.unlocked ?? 0,
    completed: v1.completed ?? [],
    bestCombo: v1.bestCombo ?? 0,
    lastLevelId: LEVELS[Math.min(v1.unlocked ?? 0, LEVELS.length - 1)].id,
    settings: { sfx: true, music: true },
  };
}
```

---

## 8. 平台接入计划（后续里程碑）

### M1 · 架构重构（本期目标）

- EventBus + Storage 抽离
- GameManager 拆薄：LevelLoader / InputSystem / ComboSystem / ChainSystem 搬出
- 迷你泡泡对象池
- 存档升级 v2（含迁移）
- 关卡配置规范化（LevelDefs）

### M2 · 内容与手感

- 新章节/关卡：纯配置新增 + 必要时新 placement 类型
- 滑动命中优化（SpatialGrid 切换）
- 击破表现迭代（泡泡质感、音效分层）

### M3 · 变现与传播

- AdsService：激励广告（解锁版图/皮肤/续命）
- 分享（`tt.shareAppMessage`）、震动反馈
- 排行榜：开放数据域 `tt.getOpenDataContext`（需要单独子包，成本较高，先出设计方案再实施）

### M4 · 打磨与上线

- 音画资源替换、包体控制（首包 <20MB）
- 性能走查（长局 GC、粒子量）
- 软著/基础信息审核 → 提审上线

---

## 9. 两人分工建议

| 角色 | 负责目录 | 说明 |
| --- | --- | --- |
| 你（逻辑/架构） | `core/` `data/` `gameplay/` `platform/` `ads/` | 状态机、关卡、输入、连击、连锁、存档、平台接入 |
| 朋友（表现/资源） | `fx/` `ui/` `assets/textures` `assets/audio` | 音效、粒子、UI 界面、美术资源、HUD 布局 |

并行规则：

1. **先定接口，再并行**：EventBus 事件表 + 各模块公开接口（本文件第 4 节）是第一份共同协议。
2. **场景/预制体单点写**：`Main.scene`、`BubblePrefab.prefab` 默认只由一人（逻辑方）编辑；UI 方的改动尽量用代码生成节点或新文件，避免场景合并冲突。
3. 每个模块完成即提交（后续接 Git 仓库后按模块粒度提交，天然减少冲突面）。

---

## 10. 待确认的设计决策

下次迭代时拍板：

1. 是否需要**章节解锁地图**（「第 1 章：点线面」做一张进度总览页）？
2. 激励广告的**奖励点位**：解锁新泡泡版图 / 皮肤 / 失败续命 / 双倍得分，选哪几个？
3. 是否要做**排行榜**（开放数据域成本较高，是否进 MVP）？
4. UI 方向：继续代码生成节点，还是引入美术图集 + 场景化布局？
