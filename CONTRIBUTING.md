# BubbleWrapGame 协作工作流

> 仓库：https://github.com/NGUxin/bubblewrap
> 引擎：Cocos Creator **3.8.8**（双方必须同版本）
> 语言：TypeScript

## 1. 首次加入（伙伴侧）

```bash
# 1. 克隆（已配好 SSH 密钥的前提）
git clone git@github.com:NGUxin/bubblewrap.git

# 2. 打开工程
cd bubblewrap
# 用 Cocos Creator 3.8.8 打开该目录（不是 build 目录）

# 3. 设置自己的 Git 身份（提交记录正确署名）
git config user.name "你的名字"
git config user.email "你的GitHub邮箱"
```

## 2. 日常协作流程（简化 GitHub Flow）

每天/每次动手前：

```bash
git pull --rebase origin main   # 先同步，避免冲突
```

小步提交、及时推送：

```bash
git add 改动的文件
git commit -m "feat: 描述本次改动"
git push origin main
```

提交信息前缀约定：

| 前缀 | 含义 |
| --- | --- |
| `feat:` | 新功能/新关卡 |
| `fix:` | 修 Bug |
| `refactor:` | 重构（行为不变） |
| `style:` | 表现/美术/音效 |
| `docs:` | 文档 |

冲突处理（两个人改到同一个文件时）：

```bash
git pull --rebase origin main
# 冲突文件会标记出来 → 打开解决 → 保留需要的内容
git add 已解决的文件
git rebase --continue
git push origin main
```

> 规则：**不要 `git push -f`**，不要用 `git reset --hard`。改坏了就还原单个文件，不要动历史。

## 3. 文件归属与冲突规避（Cocos 重点）

### 3.1 铁律

- `.meta` 文件**必须提交、禁止删除、禁止加入忽略列表**。它是 Cocos 资源的 UUID 身份证，丢了资源全部失联。
- `library/`、`temp/`、`build/`、`profiles/`、`local/` 都不进仓库（`.gitignore` 已配好），不要强行 `git add -f`。

### 3.2 单点编辑区（同一时刻只能一个人改）

| 文件 | 负责人 |
| --- | --- |
| `assets/scenes/Main.scene` | 逻辑方（默认 A） |
| `assets/prefabs/BubblePrefab.prefab` | 逻辑方（默认 A） |
| `assets/textures/` | 表现方（B） |
| `assets/audio/` | 表现方（B） |

改动前在群里说一声要动哪个文件。场景/预制体是 JSON，两人同时改必然冲突。

### 3.3 模块目录（按架构文档分工）

| 角色 | 目录 | 内容 |
| --- | --- | --- |
| A（逻辑/架构） | `assets/scripts/core/` `data/` `gameplay/` `platform/` `ads/` | 状态机、关卡、输入、连击、连锁、存档、平台适配 |
| B（表现/资源） | `assets/scripts/fx/` `ui/` `assets/textures/` `assets/audio/` | 音效、粒子、UI、美术 |

接口约定以 `docs/architecture.md` 第 4 节为准（EventBus 事件表 + 模块接口）。

## 4. 提交前自检

1. 本地构建能过：

```bash
CocosCreator --project /path/to/bubblewrap --build "platform=web-mobile;debug=true"
```

2. 没有把 `library/`、`build/` 之类的加进来（`git status` 应只见源码/资源/配置）。
3. 场景或预制体如果被改过，确认是自己该改的。

## 5. 抖音包与真机验证

- `build/` 不进仓库：抖音构建产物由构建负责人（默认 A）用 Cocos 生成。
- 构建时「字节跳动小游戏」的 AppID 填：`tt7fe50958e19eda6b02`。
- 真机验证存档：通关一关 → 杀掉 App → 重开 → 应出现「继续游戏」。
- 存档键 `bubblewrap_save_v1`（后续升 v2 时保留兼容迁移）。

## 6. 沟通约定

- 提交信息同一语言（建议中文），保持一致。
- 动手前同步一句「我改 XX 模块」，避免同文件并行。
- 每天开始工作先 `git pull --rebase origin main`，结束前 `git push`。
- 有疑问先在群里对齐，不要闷头改。
