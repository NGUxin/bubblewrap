import {
    _decorator, Component, Node, instantiate, Vec3, Vec2, AudioSource, AudioClip,
    randomRange, randomRangeInt, UITransform, input, Input, EventTouch, tween, Layers,
    Label, Color, Sprite, SpriteFrame, Graphics, Button, BlockInputEvents, resources,
} from 'cc';
import { Bubble } from './Bubble';
import { COLORS, RAINBOW_AUDIO, BUBBLE_FRAMES } from './ColorDefs';
const { ccclass, property } = _decorator;

interface LevelConfig {
    num: string;
    theme: string;
    keywords: string;
    narrative: string;
    outro: string;
    gridCols: number;
    gridRows: number;
    shape: 'rect' | 'arch' | 'concave' | 'circle' | 'heart';
    colors: string[];        // 关卡可出现的颜色（红橙黄绿青蓝紫）
    dynamic: boolean;        // 击破后原位刷新新的随机颜色
    gravity: boolean;        // 重力补位：击破后上方泡泡下落填满空位
    rainbow: boolean;        // 出现彩虹泡泡（可匹配任意目标色）
    changing: boolean;       // 出现变色泡泡（颜色循环流动，当前色=目标色才可击破）
    timeLimit: number;       // 0 = 不限时
    timeBonus: number;       // 每次正确击破加时（秒）
    targetCount: number;     // 颜色队列长度（完成即通关，≤ 棋盘泡泡总数）
}

// 难度常量
const MISTAKE_LIMIT = 5;         // 每关累计捏错上限，达到即挑战失败
const RAINBOW_STREAK_NEED = 12;  // 彩虹泡泡用掉后，需连续正确点击的泡泡数
const COLOR_GRAY = new Color(145, 165, 185, 255);
const COLOR_WARN = new Color(232, 84, 84, 255);
const COLOR_PURPLE = new Color(190, 120, 255, 255);

// 认色 → 流动 → 限时 → 彩虹 → 空间 → 时空 → 圆舞 → 变色 → 大综合
const LEVELS: LevelConfig[] = [
    {
        num: '1-1', theme: '认色', keywords: '红黄蓝 · 静态棋盘 · 颜色队列',
        narrative: '在整齐的泡泡纸中，寻找指定颜色。',
        outro: '棋盘开始变化——新的泡泡会不断补上。',
        gridCols: 3, gridRows: 4, shape: 'rect', colors: ['red', 'yellow', 'blue'],
        dynamic: false, gravity: false, rainbow: false, changing: false,
        timeLimit: 0, timeBonus: 0, targetCount: 12,
    },
    {
        num: '1-2', theme: '流动', keywords: '动态刷新 · 红黄蓝 · 持续寻找',
        narrative: '每捏破一个，就会有新的泡泡补上。',
        outro: '泡泡在流动了——现在，时间开始计时。',
        gridCols: 4, gridRows: 5, shape: 'rect', colors: ['red', 'yellow', 'blue'],
        dynamic: true, gravity: false, rainbow: false, changing: false,
        timeLimit: 0, timeBonus: 0, targetCount: 20,
    },
    {
        num: '1-3', theme: '限时', keywords: '倒计时 · 动态刷新 · 红黄蓝',
        narrative: '在有限时间里，尽可能完成颜色队列。',
        outro: '彩虹泡泡出现了——它能匹配任意颜色。',
        gridCols: 5, gridRows: 6, shape: 'rect', colors: ['red', 'yellow', 'blue'],
        dynamic: true, gravity: false, rainbow: false, changing: false,
        timeLimit: 45, timeBonus: 0.8, targetCount: 30,
    },
    {
        num: '1-4', theme: '彩虹', keywords: '彩虹泡泡 · 动态刷新 · 三色',
        narrative: '彩虹泡泡能匹配队列中的任意颜色。',
        outro: '空间开始流动——泡泡不再原地不动的等待。',
        gridCols: 6, gridRows: 7, shape: 'rect', colors: ['red', 'yellow', 'blue'],
        dynamic: true, gravity: false, rainbow: true, changing: false,
        timeLimit: 0, timeBonus: 0, targetCount: 42,
    },
    {
        num: '1-5', theme: '空间', keywords: '拱形棋盘 · 重力补位',
        narrative: '泡泡不再待在原处——捏破后，上方泡泡会下落补位。',
        outro: '空间在流动，时间也开始追赶你了。',
        gridCols: 7, gridRows: 7, shape: 'arch', colors: ['red', 'yellow', 'blue'],
        dynamic: false, gravity: true, rainbow: false, changing: false,
        timeLimit: 0, timeBonus: 0, targetCount: 37,
    },
    {
        num: '1-6', theme: '时空', keywords: '凹形棋盘 · 重力补位 · 倒计时',
        narrative: '空间结构变了，倒计时也开始了。',
        outro: '棋盘转了起来——下一个形状是什么？',
        gridCols: 7, gridRows: 7, shape: 'concave', colors: ['red', 'yellow', 'blue'],
        dynamic: false, gravity: true, rainbow: false, changing: false,
        timeLimit: 50, timeBonus: 0.8, targetCount: 43,
    },
    {
        num: '1-7', theme: '圆舞', keywords: '圆形棋盘 · 重力补位 · 倒计时',
        narrative: '圆形棋盘里，泡泡旋转着下落。',
        outro: '心形棋盘准备好了——新的特殊泡泡即将登场。',
        gridCols: 7, gridRows: 7, shape: 'circle', colors: ['red', 'yellow', 'blue'],
        dynamic: false, gravity: true, rainbow: false, changing: false,
        timeLimit: 55, timeBonus: 0.8, targetCount: 37,
    },
    {
        num: '1-8', theme: '变色', keywords: '心形棋盘 · 彩虹 · 变色泡泡 · 倒计时',
        narrative: '变色泡泡在红橙黄绿青蓝紫之间流动，等它变成目标色再点。',
        outro: '最终试炼——所有机制，一起爆发。',
        gridCols: 7, gridRows: 7, shape: 'heart', colors: ['red', 'yellow', 'blue'],
        dynamic: false, gravity: true, rainbow: true, changing: true,
        timeLimit: 60, timeBonus: 0.7, targetCount: 27,
    },
    {
        num: '1-9', theme: '大综合', keywords: '重力补位 · 彩虹 · 变色 · 倒计时 · 更多泡泡',
        narrative: '结合先前所有关卡的特点，完成最终挑战。',
        outro: '全部通关！九段泡泡之旅，圆满落幕。',
        gridCols: 8, gridRows: 8, shape: 'rect', colors: ['red', 'yellow', 'blue'],
        dynamic: false, gravity: true, rainbow: true, changing: true,
        timeLimit: 75, timeBonus: 0.6, targetCount: 64,
    },
];

// ---------------- 存档 ----------------

interface SaveData {
    unlocked: number;
    completed: number[];
    bestCombo: number;
}

const SAVE_KEY = 'bubblewrap_save_v1';

function storageGet(key: string): string | null {
    try {
        const g = globalThis as any;
        if (g.tt && g.tt.getStorageSync) return g.tt.getStorageSync(key) || null;
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

function storageSet(key: string, value: string) {
    try {
        const g = globalThis as any;
        if (g.tt && g.tt.setStorageSync) g.tt.setStorageSync(key, value);
        else localStorage.setItem(key, value);
    } catch {
        /* 存储不可用时静默 */
    }
}

function loadSave(): SaveData {
    try {
        const raw = storageGet(SAVE_KEY);
        if (raw) {
            const d = JSON.parse(raw);
            return {
                unlocked: Number(d.unlocked) || 0,
                completed: Array.isArray(d.completed) ? d.completed : [],
                bestCombo: Number(d.bestCombo) || 0,
            };
        }
    } catch { /* ignore */ }
    return { unlocked: 0, completed: [], bestCombo: 0 };
}

function writeSave(d: SaveData) {
    try {
        storageSet(SAVE_KEY, JSON.stringify(d));
    } catch { /* ignore */ }
}

// ---------------- 主逻辑 ----------------

@ccclass('GameManager')
export class GameManager extends Component {
    @property({ type: Node })
    bubbleContainer: Node = null!;
    @property({ type: Node })
    bubblePrefab: Node = null!;
    @property({ type: AudioSource })
    popAudio: AudioSource = null!;

    private bubbleRadius = 30;
    private bubbleList: Node[] = [];

    private currentLevel = 0;
    private maxUnlocked = 0;
    private combo = 0;
    private lastPopTime = 0;
    private timerLeft = 0;
    private playing = false;
    private chgAcc = 0;

    // 失败机制：本关累计捏错次数
    private mistakes = 0;
    // 彩虹泡泡：同一时间最多一个；用掉后连续正确点击累计
    private rainbowNode: Node | null = null;
    private rainbowStreak = 0;

    // 颜色队列
    private queue: string[] = [];
    private queueIdx = 0;
    private targetBar: Node = null!;
    private targetStrip: Node = null!;
    private targetSlots: Node[] = [];
    private slotStep = 40;

    // 音频
    private clips: Record<string, AudioClip | null> = {};

    // HUD
    private titleLabel: Label = null!;
    private subtitleLabel: Label = null!;
    private remainLabel: Label = null!;
    private comboLabel: Label = null!;
    private timerLabel: Label = null!;
    private missLabel: Label = null!;
    private rainbowLabel: Label = null!;
    private progressG: Graphics = null!;

    // 遮罩
    private overlay: Node = null!;
    private overlayTitle: Label = null!;
    private overlayDesc: Label = null!;
    private btnA: Node = null!;
    private btnB: Node = null!;
    private labelA: Label = null!;
    private labelB: Label = null!;
    private actionA: (() => void) | null = null;
    private actionB: (() => void) | null = null;

    onEnable() {
        input.on(Input.EventType.TOUCH_START, this.onTouch, this);
        input.on(Input.EventType.TOUCH_MOVE, this.onTouch, this);
    }

    onDisable() {
        input.off(Input.EventType.TOUCH_START, this.onTouch, this);
        input.off(Input.EventType.TOUCH_MOVE, this.onTouch, this);
    }

    start() {
        this.buildHud();
        this.loadAllAudio();
        this.showTitle();
        // 全局错误兜底：单次异常不导致整个游戏重启（抖音运行时偶发）
        const g = globalThis as any;
        if (g.tt && g.tt.onError) {
            try { g.tt.onError((e: any) => console.error('[BubbleWrap] tt error:', e && e.errMsg)); } catch { /* ignore */ }
        }
    }

    update(dt: number) {
        if (this.playing && this.timerLeft > 0) {
            this.timerLeft -= dt;
            if (this.timerLeft <= 0) {
                this.timerLeft = 0;
                this.timeUp();
            }
            this.timerLabel.string = `时间 ${Math.ceil(this.timerLeft)}`;
        }
        // 变色泡泡颜色循环（统一由本组件驱动，避免节点未激活导致调度丢失）
        if (this.playing) {
            this.chgAcc += dt;
            if (this.chgAcc >= 1.2) {
                this.chgAcc = 0;
                for (const b of this.bubbleList) {
                    if (!b.isValid) continue;
                    const c = b.getComponent(Bubble);
                    if (c && c.changing && !c.isPopped) c.cycleNext();
                }
            }
        }
    }

    // ---------------- 音频 ----------------

    private loadAllAudio() {
        const keys = [
            'pop_red', 'pop_orange', 'pop_yellow', 'pop_green',
            'pop_cyan', 'pop_blue', 'pop_violet', RAINBOW_AUDIO, 'wrong',
        ];
        const loadClip = (k: string, attempt: number) => {
            resources.load(`audio/${k}`, AudioClip, (err, clip) => {
                if (!err && clip) {
                    this.clips[k] = clip;
                } else if (attempt < 4) {
                    this.scheduleOnce(() => loadClip(k, attempt + 1), 0.5);
                }
            });
        };
        keys.forEach((k) => loadClip(k, 0));
        // 1 秒后检查：仍未加载的音频再补一次，避免首局静音
        this.scheduleOnce(() => {
            keys.forEach((k) => {
                if (!this.clips[k]) loadClip(k, 0);
            });
        });
        // 彩色泡泡纹理（保留立体高光的烘焙纹理）
        Object.keys(COLORS).forEach((k) => {
            resources.load(`bubbles/bubble_${k}/spriteFrame`, SpriteFrame, (err, sf) => {
                if (!err && sf) BUBBLE_FRAMES[k] = sf;
            });
        });
        // 保险：首次 preload 若失败，强制重载，保证声音可播
        this.scheduleOnce(() => {
            const clip = this.popAudio.clip;
            if (clip && !(this.popAudio as any)._isLoaded) {
                this.popAudio.clip = null;
                this.popAudio.clip = clip;
                this.popAudio.play();
            }
        }, 0.5);
    }

    private playClip(key: string, pitch: number) {
        try {
            // 统一走场景绑定主音源（抖音/Web 均验证可用）
            // key 可能是颜色名(red)或音频名(pop_red/wrong/pop_rainbow)，统一换算
            const clipKey = key === 'wrong' || key === RAINBOW_AUDIO ? key : `pop_${key}`;
            const clip = this.clips[clipKey];
            if (clip && this.popAudio.clip !== clip) {
                this.popAudio.clip = clip;   // 颜色音频就绪时换专属音色；未就绪则沿用旧 clip
            }
            this.popAudio.pitch = Math.max(0.5, Math.min(pitch, 2.0));
            this.popAudio.play();
        } catch { /* 无音频设备时静默 */ }
    }

    // ---------------- 标题 / 存档 ----------------

    private showTitle() {
        const save = loadSave();
        this.maxUnlocked = save.unlocked;
        this.drawProgress();
        const hasProgress = save.completed.length > 0 || save.unlocked > 0;
        this.playing = false;
        const buttons: { label: string; action: () => void }[] = [];
        buttons.push({
            label: hasProgress ? '继续游戏' : '开始游戏',
            action: () => {
                this.hideOverlay();
                if (hasProgress) {
                    const next = this.firstIncomplete(save);
                    this.loadLevel(next);
                } else {
                    this.loadLevel(0);
                }
            },
        });
        buttons.push({
            label: '从头开始',
            action: () => {
                writeSave({ unlocked: 0, completed: [], bestCombo: 0 });
                this.maxUnlocked = 0;
                this.drawProgress();
                this.hideOverlay();
                this.loadLevel(0);
            },
        });
        this.showOverlay('泡泡纸', '认色 · 流动 · 限时 · 彩虹 · 空间 · 时空 · 圆舞 · 变色 · 大综合', buttons);
    }

    private firstIncomplete(save: SaveData): number {
        for (let i = 0; i < LEVELS.length; i++) {
            if (!save.completed.includes(i)) return i;
        }
        return 0;
    }

    // ---------------- 关卡加载 ----------------

    loadLevel(index: number) {
        this.currentLevel = index;
        const cfg = LEVELS[index];
        this.clearBubbles();

        // 隐藏场景遗留的 ResetBtn：它躺在底部与泡泡重叠，误触会"重启"关卡
        // （重新开始统一由结算/超时弹层与标题屏提供）
        const sceneReset = this.node.getChildByName('ResetBtn');
        if (sceneReset) sceneReset.active = false;

        this.queueIdx = 0;
        this.combo = 0;
        this.lastPopTime = 0;
        this.timerLeft = cfg.timeLimit;
        this.playing = false;
        this.mistakes = 0;
        this.rainbowNode = null;
        this.rainbowStreak = 0;
        this.buildQueue(cfg);

        this.titleLabel.string = `${cfg.num} ${cfg.theme}`;
        this.subtitleLabel.string = cfg.keywords;
        this.remainLabel.string = `剩余 ${cfg.targetCount}`;
        this.comboLabel.string = '';
        this.timerLabel.string = cfg.timeLimit > 0 ? `时间 ${cfg.timeLimit}` : '';
        this.missLabel.string = `失误 0/${MISTAKE_LIMIT}`;
        this.missLabel.color = COLOR_GRAY;
        this.drawProgress();

        this.spawnGrid(cfg);
        // 彩虹关：开局场上即有一个彩虹泡泡（同一时间仅一个）
        if (cfg.rainbow) this.spawnRainbow();
        this.updateRainbowHint();
        this.renderTargetBar();

        // 调试钩子（供自动化验证 / 真机检查）
        (globalThis as any).__bubblewrap = {
            gm: this,
            level: this.currentLevel,
            target: () => this.queue[this.queueIdx],
            remaining: () => cfg.targetCount - this.queueIdx,
            audio: () => Object.fromEntries(
                Object.entries(this.clips).map(([k, v]) => [k, !!v]),
            ),
            lastClip: () => (this.popAudio.clip ? this.popAudio.clip.name : ''),
            bubbles: () => this.bubbleList.filter((b) => b.isValid).map((b) => {
                const c = b.getComponent(Bubble);
                return { x: b.position.x, y: b.position.y, color: c ? c.color : '', rainbow: c ? c.rainbow : false, changing: c ? c.changing : false, popped: c ? c.isPopped : true };
            }),
        };

        // 开场主题卡：衔接上一关
        this.showOverlay(`${cfg.num} · ${cfg.theme}`, `${cfg.keywords}\n${cfg.narrative}`, []);
        this.scheduleOnce(() => {
            this.hideOverlay();
            this.playing = true;
        }, 1.6);
    }

    /** 重置 = 重新开始当前关卡（场景里按钮绑定此方法） */
    resetAllBubble() {
        this.loadLevel(this.currentLevel);
    }

    private clearBubbles() {
        this.bubbleList.forEach((b) => {
            if (b.isValid) b.destroy();
        });
        this.bubbleList.length = 0;
    }

    /** 按形状生成网格：泡泡大小与格距固定，只按关卡形状摆放（rect/拱形/凹形/圆形/心形） */
    private spawnGrid(cfg: LevelConfig) {
        const CELL = 88;     // 固定格距（所有关卡一致）
        const SCALE = 0.95;  // 固定泡泡尺寸（所有关卡一致）
        // 静态教学关（1-1）：棋盘颜色取队列颜色洗牌，保证队列一定能被捏完
        // 重力/变色关：随机配色，特殊泡泡才有机会出现
        const forced = (!cfg.dynamic && !cfg.gravity && !cfg.changing) ? this.shuffled(this.queue.slice()) : null;
        let i = 0;
        for (let r = 0; r < cfg.gridRows; r++) {
            for (let c = 0; c < cfg.gridCols; c++) {
                if (!this.shapeOK(cfg, r, c)) continue;
                const pos = this.gridPos(cfg, r, c);
                const x = pos.x;
                const y = pos.y;
                const bubble = this.createBubble(new Vec3(x, y, 0), cfg, SCALE, forced ? forced[i] : undefined);
                this.bubbleContainer.addChild(bubble);
                this.bubbleList.push(bubble);
                (bubble as any).__cell = { r, c };
                i++;
            }
        }
        this.ensurePalette(cfg);
    }

    /** 保证棋盘上每个可用颜色至少出现一次（避免某种颜色被随机吃光导致卡关） */
    private ensurePalette(cfg: LevelConfig) {
        for (const key of cfg.colors) {
            const has = this.bubbleList.some((b) => {
                if (!b.isValid) return false;
                const c = b.getComponent(Bubble);
                return !!c && !c.isPopped && !c.changing && !c.rainbow && c.color === key;
            });
            if (has) continue;
            const dup = this.bubbleList.find((b) => {
                if (!b.isValid) return false;
                const c = b.getComponent(Bubble);
                if (!c || c.isPopped || c.changing || c.rainbow) return false;
                return c.color !== key && cfg.colors.includes(c.color);
            });
            if (dup) dup.getComponent(Bubble)!.setColor(key);
        }
    }

    /** 形状判定：是否允许在该行该列放泡泡 */
    private shapeOK(cfg: LevelConfig, r: number, c: number): boolean {
        const W = cfg.gridCols;
        const H = cfg.gridRows;
        const mid = (W - 1) / 2;
        if (cfg.shape === 'arch') {
            // 拱形（凸）：顶部窄、往下变宽后保持全宽
            const half = r <= 2 ? Math.max(0, r) : 3;
            return Math.abs(c - Math.floor(mid)) <= half;
        }
        if (cfg.shape === 'concave') {
            // 凹形：上下满排、中段向内收窄
            if (r <= 1 || r >= H - 2) return true;
            return Math.abs(c - Math.floor(mid)) <= 2;
        }
        if (cfg.shape === 'circle') {
            const cx = mid;
            const cy = (H - 1) / 2;
            return (c - cx) * (c - cx) + (r - cy) * (r - cy) <= 3.3 * 3.3;
        }
        if (cfg.shape === 'heart') {
            // 手工心形轮廓：顶部两瓣 + 收窄到底部尖点（7×7，共 27 格）
            if (r === 0) return c >= 1 && c <= 5 && (c === 1 || c === 2 || c === 4 || c === 5);
            if (r === 1 || r === 2) return true;
            if (r === 3) return c >= 1 && c <= 5;
            if (r === 4) return c >= 2 && c <= 4;
            if (r === 5) return c === 3;
            return false;
        }
        return true;
    }

    /** 网格坐标：y 从顶部向下递减（r=0 最上），整体垂直居中 */
    private gridPos(cfg: LevelConfig, r: number, c: number): Vec3 {
        const CELL = 88;
        const x0 = -(cfg.gridCols - 1) * CELL / 2;
        const centerY = -70;
        const yTop = centerY + (cfg.gridRows - 1) * CELL / 2;
        return new Vec3(x0 + c * CELL, yTop - r * CELL, 0);
    }

    private createBubble(pos: Vec3, cfg: LevelConfig, scale: number, forcedColor?: string): Node {
        const bubble = instantiate(this.bubblePrefab);
        bubble.setPosition(pos);
        bubble.setScale(scale, scale, 1);
        const comp = bubble.getComponent(Bubble)!;
        // 创建时只出普通颜色；彩虹泡泡统一由 spawnRainbow 单点刷新
        if (!forcedColor && cfg.changing && Math.random() < 0.18) {
            comp.setChanging();
        } else {
            comp.setColor(forcedColor ?? cfg.colors[randomRangeInt(0, cfg.colors.length)]);
        }
        bubble.on('bubblePop', this.onBubblePop, this);
        return bubble;
    }

    private respawnBubble(node: Node) {
        if (!node.isValid) return;
        const cfg = LEVELS[this.currentLevel];
        const comp = node.getComponent(Bubble)!;
        this.scheduleOnce(() => {
            try {
                if (!node.isValid) return;
                comp.resetBubble();
                // 始终补普通颜色；彩虹泡泡按「12 连正确」规则另行刷新，同一时间最多一个
                comp.setColor(cfg.colors[randomRangeInt(0, cfg.colors.length)]);
            } catch (e) {
                console.error('[BubbleWrap] respawn err', e);
            }
        }, 0.16);
    }

    /** 重力补位：销毁被击破泡泡，同列上方泡泡下落，顶部补入新泡泡 */
    private gravityRefill(node: Node) {
        if (!node || !node.isValid) return;
        const cfg = LEVELS[this.currentLevel];
        const cell = (node as any).__cell as { r: number; c: number } | null;
        const comp = node.getComponent(Bubble);
        if (comp && comp.rainbow && this.rainbowNode === node) this.rainbowNode = null;
        node.destroy();
        const idx = this.bubbleList.indexOf(node);
        if (idx >= 0) this.bubbleList.splice(idx, 1);
        if (!cell) return;

        const col = cell.c;
        const allowed: number[] = [];
        for (let r = 0; r < cfg.gridRows; r++) {
            if (this.shapeOK(cfg, r, col)) allowed.push(r);
        }
        // 该列存活的普通泡泡（排除其他正处于击破动画中的）
        const live = this.bubbleList.filter((b) => {
            if (!b.isValid) return false;
            const c2 = (b as any).__cell as { c: number } | null;
            if (!c2 || c2.c !== col) return false;
            const bc = b.getComponent(Bubble);
            return !!bc && !bc.isPopped;
        });
        live.sort((a, b) => ((a as any).__cell.r as number) - ((b as any).__cell.r as number));

        // 存活泡泡压到最底部，上方空出的格位补新泡泡
        const take = live.length;
        const bottomRows = allowed.slice(allowed.length - take);
        live.forEach((nd, k) => {
            const target = this.gridPos(cfg, bottomRows[k], col);
            (nd as any).__cell.r = bottomRows[k];
            tween(nd).to(0.14, { position: target }, { easing: 'quadIn' }).start();
        });
        const topRows = allowed.slice(0, allowed.length - take);
        const created: Node[] = [];
        topRows.forEach((rd) => {
            const target = this.gridPos(cfg, rd, col);
            const pos = new Vec3(target.x, target.y + 320, 0);
            const nb = this.createBubble(pos, cfg, 0.95);
            this.bubbleContainer.addChild(nb);
            this.bubbleList.push(nb);
            (nb as any).__cell = { r: rd, c: col };
            tween(nb).to(0.16 + Math.random() * 0.1, { position: target }, { easing: 'quadIn' }).start();
            created.push(nb);
        });
        // 防卡关：当前目标色在场上缺失时，把补位泡泡强制换成目标色
        const targetKey = this.queue[this.queueIdx];
        const hasTarget = this.bubbleList.some((b) => {
            if (!b.isValid) return false;
            const c = b.getComponent(Bubble);
            return !!c && !c.isPopped && !c.changing && !c.rainbow && c.color === targetKey;
        });
        if (!hasTarget && created.length > 0 && targetKey) {
            const nb = created[created.length - 1];
            if (nb.isValid) nb.getComponent(Bubble)!.setColor(targetKey);
        }
    }

    private shuffled<T>(arr: T[]): T[] {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = randomRangeInt(0, i + 1);
            const tmp = a[i];
            a[i] = a[j];
            a[j] = tmp;
        }
        return a;
    }

    // ---------------- 颜色队列 ----------------

    private buildQueue(cfg: LevelConfig) {
        this.queue = [];
        for (let i = 0; i < cfg.targetCount; i++) {
            this.queue.push(cfg.colors[randomRangeInt(0, cfg.colors.length)]);
        }
    }

    private renderTargetBar() {
        // 完整队列：每个目标一个槽位，长条向左滑动
        this.targetStrip.removeAllChildren();
        this.targetSlots.length = 0;
        const cfg = LEVELS[this.currentLevel];
        const step = this.slotStep;
        for (let i = 0; i < cfg.targetCount; i++) {
            const slot = new Node(`T${i}`);
            slot.layer = Layers.Enum.UI_2D;
            slot.addComponent(UITransform).setContentSize(34, 34);
            slot.setPosition(i * step, 0, 0);
            slot.addComponent(Graphics);
            this.targetStrip.addChild(slot);
            this.targetSlots.push(slot);
        }
        this.targetStrip.setPosition(0, 0, 0);
        this.highlightCurrent();
    }

    private highlightCurrent() {
        for (let i = 0; i < this.targetSlots.length; i++) {
            const node = this.targetSlots[i];
            const g = node.getComponent(Graphics)!;
            // 每个槽位固定对应队列中的一个目标；当前目标 = 第 queueIdx 个槽位
            const isCur = i === this.queueIdx;
            node.setScale(isCur ? 1.35 : 1, isCur ? 1.35 : 1, 1);
            const key = i < this.queue.length ? this.queue[i] : '';
            g.clear();
            if (key) {
                const tint = COLORS[key].tint.clone();
                tint.a = isCur ? 255 : 130;
                g.fillColor = tint;
                g.circle(0, 0, 15);
                g.fill();
            }
            // 高亮当前：白色圆环
            if (isCur) {
                g.lineWidth = 5;
                g.strokeColor = new Color(255, 255, 255, 255);
                g.circle(0, 0, 18);
                g.stroke();
            }
        }
        // 让当前目标保持在屏幕中央（整体左滑）
        const step = this.slotStep;
        tween(this.targetStrip).stop();
        tween(this.targetStrip).to(0.18, { position: new Vec3(-this.queueIdx * step, 0, 0) }, { easing: 'quadOut' }).start();
    }

    private advanceQueue() {
        this.queueIdx++;
        const cfg = LEVELS[this.currentLevel];
        this.remainLabel.string = `剩余 ${Math.max(cfg.targetCount - this.queueIdx, 0)}`;
        this.highlightCurrent();
    }

    // ---------------- 交互 ----------------

    onTouch(event: EventTouch) {
        try {
            if (!this.playing) return;
            const cfg = LEVELS[this.currentLevel];
            const target = this.queue[this.queueIdx];
            const uiPos: Vec2 = event.getUILocation();
            const local = this.bubbleContainer
                .getComponent(UITransform)!
                .convertToNodeSpaceAR(new Vec3(uiPos.x, uiPos.y, 0));
            let wrongTap = false;
            for (const bubble of this.bubbleList) {
                const comp = bubble.getComponent(Bubble);
                if (!comp || comp.isPopped) continue;
                const scale = bubble.scale.x;
                const pos = bubble.position;
                const dx = local.x - pos.x;
                const dy = local.y - pos.y;
                const r = this.bubbleRadius * scale;
                if (dx * dx + dy * dy <= r * r) {
                    const matched = comp.rainbow || comp.color === target;
                    if (matched) {
                        comp.pop();
                    } else if (cfg.dynamic || cfg.gravity) {
                        // 动态/重力关卡：点错也会破裂（判错由 onBubblePop 统一计数，补位由刷新机制负责）
                        comp.pop();
                    } else {
                        // 教学关卡：点错不破裂，柔和提示；同一次触摸只记一次失误
                        this.playClip('wrong', 0.55);
                        comp.shake();
                        wrongTap = true;
                    }
                }
            }
            if (wrongTap) this.registerWrong();
        } catch (e) {
            console.error('[BubbleWrap] touch err', e);
        }
    }

    onBubblePop(pos: Vec3, node: Node, colorKey: string, isRainbow: boolean) {
        try {
            const cfg = LEVELS[this.currentLevel];
            const target = this.queue[this.queueIdx];
            const matched = isRainbow || colorKey === target;

            if (matched) {
                const pitch = (isRainbow ? 1.5 : COLORS[colorKey].pitch);
                this.playClip(isRainbow ? RAINBOW_AUDIO : colorKey, pitch);

                if (cfg.timeBonus > 0 && this.timerLeft > 0) {
                    this.timerLeft = Math.min(this.timerLeft + cfg.timeBonus, cfg.timeLimit);
                    this.timerLabel.string = `时间 ${Math.ceil(this.timerLeft)}`;
                }

                this.advanceQueue();

                // 彩虹泡泡规则：用掉后场上即无彩虹，需连续正确点击 12 个
                // （连锁带出的不算点击；捏错会在 registerWrong 中清零）
                if (isRainbow) {
                    this.rainbowNode = null;
                    this.rainbowStreak = 0;
                } else if (cfg.rainbow && !this.isRainbowActive()) {
                    this.rainbowStreak++;
                    if (this.rainbowStreak >= RAINBOW_STREAK_NEED) this.spawnRainbow();
                }
                this.updateRainbowHint();
            } else {
                this.playClip('wrong', 0.55);
                this.registerWrong();
                if (cfg.timeLimit > 0) {
                    this.timerLeft = Math.max(0, this.timerLeft - 1);
                    this.timerLabel.string = `时间 ${Math.ceil(this.timerLeft)}`;
                }
            }

            // 刷新（关键：先补位，粒子异常不能阻塞补位）
            if (cfg.gravity) {
                this.scheduleOnce(() => this.gravityRefill(node), 0.15);
            } else if (cfg.dynamic) {
                this.respawnBubble(node);
            }

            // 击破表现：彩色迷你泡泡（装饰，独立兜底）
            try {
                const scale = node.scale.x;
                this.spawnMiniBubbles(pos, scale, isRainbow ? 'white' : colorKey);
            } catch (e) {
                console.error('[BubbleWrap] vfx err', e);
            }

            if (this.queueIdx >= cfg.targetCount) {
                this.completeLevel();
            }
        } catch (e) {
            console.error('[BubbleWrap] pop err', e);
        }
    }

    private spawnMiniBubbles(pos: Vec3, scale: number, colorKey: string) {
        const count = 4 + (Math.random() < 0.5 ? 1 : 0);
        for (let i = 0; i < count; i++) {
            const mini = instantiate(this.bubblePrefab);
            mini.setPosition(pos);
            const s = randomRange(0.18, 0.5) * Math.min(scale, 1.4);
            mini.setScale(s, s, 1);
            const comp = mini.getComponent(Bubble)!;
            comp.setColor(colorKey === 'white' ? 'yellow' : colorKey);
            this.bubbleContainer.addChild(mini);
            const ang = Math.random() * Math.PI * 2;
            const dist = (1 - s * 0.6) * randomRange(32, 74);
            const target = new Vec3(pos.x + Math.cos(ang) * dist, pos.y + Math.sin(ang) * dist, 0);
            const dur = randomRange(0.38, 0.55);
            tween(mini)
                .parallel(
                    tween().to(dur, { position: target }, { easing: 'quadOut' }),
                    tween().to(dur, { scale: new Vec3(0, 0, 1) }, { easing: 'quadIn' }),
                )
                .call(() => mini.destroy())
                .start();
        }
    }

    // ---------------- 失败判定 ----------------

    /** 捏错统一入口：累计失误、刷新 HUD，达到上限即失败（关卡加载时清零） */
    private registerWrong() {
        if (!this.playing) return;
        this.mistakes++;
        this.missLabel.string = `失误 ${this.mistakes}/${MISTAKE_LIMIT}`;
        this.missLabel.color = this.mistakes >= 3 ? COLOR_WARN : COLOR_GRAY;
        // 「连续」正确被打断，彩虹蓄力清零
        this.rainbowStreak = 0;
        this.updateRainbowHint();
        if (this.mistakes >= MISTAKE_LIMIT) {
            this.failLevel();
        }
    }

    private failLevel() {
        if (!this.playing) return;
        this.playing = false;
        this.showOverlay('挑战失败', `累计捏错 ${MISTAKE_LIMIT} 次，再试一次！`, [{
            label: '重新挑战',
            action: () => {
                this.hideOverlay();
                this.loadLevel(this.currentLevel);
            },
        }]);
    }

    // ---------------- 彩虹泡泡 ----------------

    private isRainbowActive(): boolean {
        const n = this.rainbowNode;
        if (!n || !n.isValid) return false;
        const c = n.getComponent(Bubble);
        return !!c && !c.isPopped && c.rainbow;
    }

    /**
     * 彩虹泡泡唯一刷新入口：场上已有彩虹时绝不刷新（同一时间最多一个）；
     * 只把随机一个普通活泡泡转换为彩虹，不新增泡泡，棋盘总数不变。
     */
    private spawnRainbow() {
        if (this.isRainbowActive()) return;
        const candidates = this.bubbleList.filter((b) => {
            if (!b.isValid) return false;
            const c = b.getComponent(Bubble);
            return !!c && !c.isPopped && !c.rainbow && !c.changing;
        });
        if (candidates.length === 0) return;
        const target = candidates[randomRangeInt(0, candidates.length)];
        target.getComponent(Bubble)!.setRainbow();
        this.rainbowNode = target;
        this.rainbowStreak = 0;
        this.updateRainbowHint();
    }

    private updateRainbowHint() {
        if (!this.rainbowLabel) return;
        const cfg = LEVELS[this.currentLevel];
        if (!cfg.rainbow) {
            this.rainbowLabel.string = '';
            return;
        }
        if (this.isRainbowActive()) {
            this.rainbowLabel.string = '彩虹泡泡出现了！点它可匹配任意颜色';
            this.rainbowLabel.color = COLOR_PURPLE;
        } else if (this.rainbowStreak > 0) {
            this.rainbowLabel.string = `彩虹蓄力中 ${this.rainbowStreak}/${RAINBOW_STREAK_NEED}`;
            this.rainbowLabel.color = COLOR_GRAY;
        } else {
            this.rainbowLabel.string = '';
        }
    }

    // ---------------- 通关 / 时间到 / 存档 ----------------

    private completeLevel() {
        if (!this.playing) return;
        this.playing = false;
        const cfg = LEVELS[this.currentLevel];

        const save = loadSave();
        if (!save.completed.includes(this.currentLevel)) save.completed.push(this.currentLevel);
        save.unlocked = Math.max(save.unlocked, Math.min(this.currentLevel + 1, LEVELS.length - 1));
        save.bestCombo = Math.max(save.bestCombo, this.combo);
        writeSave(save);
        this.maxUnlocked = save.unlocked;
        this.drawProgress();

        const isLast = this.currentLevel >= LEVELS.length - 1;
        this.showOverlay(isLast ? '全部通关！' : '通关！', cfg.outro, [{
            label: isLast ? '再玩一次' : '下一关',
            action: () => {
                this.hideOverlay();
                this.loadLevel(isLast ? 0 : this.currentLevel + 1);
            },
        }]);
    }

    private timeUp() {
        if (!this.playing) return;
        this.playing = false;
        this.showOverlay('时间到', '再试一次，找到自己的节拍。', [{
            label: '重新开始',
            action: () => {
                this.hideOverlay();
                this.loadLevel(this.currentLevel);
            },
        }]);
    }

    // ---------------- HUD / 遮罩 ----------------

    private buildHud() {
        const dark = new Color(80, 110, 135, 255);
        const gray = new Color(145, 165, 185, 255);

        this.titleLabel = this.makeLabel('', 40, dark, new Vec3(0, 596, 0));
        this.subtitleLabel = this.makeLabel('', 22, gray, new Vec3(0, 552, 0));
        this.remainLabel = this.makeLabel('', 28, dark, new Vec3(250, 596, 0));
        this.remainLabel.node.getComponent(UITransform)!.setContentSize(200, 40);
        this.remainLabel.horizontalAlign = Label.HorizontalAlign.RIGHT;
        this.comboLabel = this.makeLabel('', 44, new Color(255, 110, 150, 255), new Vec3(0, 410, 0));
        this.timerLabel = this.makeLabel('', 28, dark, new Vec3(-250, 596, 0));
        this.timerLabel.node.getComponent(UITransform)!.setContentSize(200, 40);
        this.timerLabel.horizontalAlign = Label.HorizontalAlign.LEFT;

        // 失误计数（右上，副标题下方；≥3 次变红警示）
        this.missLabel = this.makeLabel('', 24, COLOR_GRAY, new Vec3(270, 552, 0));
        this.missLabel.node.getComponent(UITransform)!.setContentSize(170, 36);
        this.missLabel.horizontalAlign = Label.HorizontalAlign.RIGHT;
        // 彩虹泡泡提示（棋盘上方）
        this.rainbowLabel = this.makeLabel('', 24, COLOR_PURPLE, new Vec3(0, 360, 0));

        // 顶部目标颜色队列
        this.targetBar = new Node('TargetBar');
        this.targetBar.layer = Layers.Enum.UI_2D;
        this.targetBar.addComponent(UITransform).setContentSize(720, 70);
        this.targetBar.setPosition(0, 500, 0);
        this.node.addChild(this.targetBar);
        this.targetStrip = new Node('TargetStrip');
        this.targetStrip.layer = Layers.Enum.UI_2D;
        this.targetStrip.addComponent(UITransform).setContentSize(2400, 70);
        this.targetStrip.setPosition(0, 0, 0);
        this.targetBar.addChild(this.targetStrip);

        // 关卡进度圆点
        const prog = new Node('Progress');
        prog.layer = Layers.Enum.UI_2D;
        prog.addComponent(UITransform).setContentSize(240, 40);
        prog.setPosition(0, 462, 0);
        this.node.addChild(prog);
        this.progressG = prog.addComponent(Graphics);

        this.buildOverlay();
    }

    private buildOverlay() {
        this.overlay = new Node('Overlay');
        this.overlay.layer = Layers.Enum.UI_2D;
        this.overlay.addComponent(UITransform).setContentSize(720, 1280);
        this.overlay.setPosition(0, 0, 10);
        this.node.addChild(this.overlay);
        this.overlay.addComponent(BlockInputEvents);
        const g = this.overlay.addComponent(Graphics);
        g.fillColor = new Color(255, 255, 255, 236);
        g.rect(-360, -640, 720, 1280);
        g.fill();

        this.overlayTitle = this.makeLabelOn(this.overlay, '', 58, new Color(80, 110, 135, 255), new Vec3(0, 150, 0));
        this.overlayDesc = this.makeLabelOn(this.overlay, '', 26, new Color(145, 165, 185, 255), new Vec3(0, 70, 0));
        this.overlayDesc.node.getComponent(UITransform)!.setContentSize(620, 120);
        this.overlayDesc.lineHeight = 38;

        const resetBtn = this.node.getChildByName('ResetBtn');
        const btnSF = resetBtn ? resetBtn.getComponent(Sprite)!.spriteFrame : null;
        this.btnA = this.buildOverlayButton(btnSF, new Vec3(0, -20, 0));
        this.labelA = this.btnA.getChildByName('Label')!.getComponent(Label)!;
        this.btnB = this.buildOverlayButton(btnSF, new Vec3(0, -110, 0));
        this.labelB = this.btnB.getChildByName('Label')!.getComponent(Label)!;

        this.overlay.active = false;
    }

    private buildOverlayButton(spriteFrame: Sprite['spriteFrame'], pos: Vec3): Node {
        const node = new Node('OverlayBtn');
        node.layer = Layers.Enum.UI_2D;
        node.addComponent(UITransform).setContentSize(240, 84);
        node.setPosition(pos);
        this.overlay.addChild(node);
        const sp = node.addComponent(Sprite);
        sp.spriteFrame = spriteFrame;
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        const btn = node.addComponent(Button);
        btn.transition = Button.Transition.COLOR;
        btn.normalColor = new Color(255, 255, 255, 255);
        btn.pressedColor = new Color(210, 230, 250, 255);
        node.on(Button.EventType.CLICK, () => {
            const act = node === this.btnA ? this.actionA : this.actionB;
            this.hideOverlay();
            act && act();
        }, this);
        const label = this.makeLabelOn(node, '', 34, new Color(80, 110, 135, 255), new Vec3(0, 0, 0));
        label.node.name = 'Label';
        return node;
    }

    private showOverlay(title: string, desc: string, buttons: { label: string; action: () => void }[]) {
        this.overlayTitle.string = title;
        this.overlayDesc.string = desc;
        this.btnA.active = buttons.length > 0;
        this.btnB.active = buttons.length > 1;
        this.labelA.string = buttons[0] ? buttons[0].label : '';
        this.labelB.string = buttons[1] ? buttons[1].label : '';
        this.actionA = buttons[0] ? buttons[0].action : null;
        this.actionB = buttons[1] ? buttons[1].action : null;
        this.overlay.active = true;
    }

    private hideOverlay() {
        this.overlay.active = false;
        this.actionA = null;
        this.actionB = null;
    }

    private drawProgress() {
        if (!this.progressG) return;
        this.progressG.clear();
        const spacing = LEVELS.length >= 7 ? 42 : LEVELS.length >= 5 ? 60 : 72;
        const x0 = -((LEVELS.length - 1) * spacing) / 2;
        for (let i = 0; i < LEVELS.length; i++) {
            const x = x0 + i * spacing;
            this.progressG.fillColor = i <= this.maxUnlocked
                ? new Color(255, 150, 180, 255)
                : new Color(214, 224, 234, 255);
            this.progressG.circle(x, 0, 11);
            this.progressG.fill();
        }
    }

    private makeLabel(text: string, size: number, color: Color, pos: Vec3): Label {
        return this.makeLabelOn(this.node, text, size, color, pos);
    }

    private makeLabelOn(parent: Node, text: string, size: number, color: Color, pos: Vec3): Label {
        const node = new Node('HudLabel');
        node.layer = Layers.Enum.UI_2D;
        node.addComponent(UITransform).setContentSize(560, size + 20);
        node.setPosition(pos);
        parent.addChild(node);
        const label = node.addComponent(Label);
        label.string = text;
        label.fontSize = size;
        label.lineHeight = size;
        label.color = color;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        return label;
    }
}
