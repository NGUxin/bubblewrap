import {
    _decorator, Component, Node, instantiate, Vec3, Vec2, AudioSource, AudioClip,
    randomRange, randomRangeInt, UITransform, input, Input, EventTouch, tween, Layers,
    Label, Color, Sprite, SpriteFrame, Graphics, Button, BlockInputEvents, resources, UIOpacity,
    ScrollView, Mask, Tween,
} from 'cc';
import { Bubble } from './Bubble';
import { COLORS, RAINBOW_AUDIO, BUBBLE_FRAMES } from './ColorDefs';
import { IS_DEV } from './DevConfig';
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
    snake?: boolean;         // 蛇形补位：新泡泡从第一列起沿 S 型推到爆破点
    rainbow: boolean;        // 出现彩虹泡泡（可匹配任意目标色）
    changing: boolean;       // 出现变色泡泡（颜色循环流动，当前色=目标色才可击破）
    chain?: boolean;         // 连锁泡泡：上下左右同色一起消除（不计入目标队列推进）
    locked?: boolean;        // 锁定泡泡：需先炸掉相邻任意泡泡解锁
    timeLimit: number;       // 0 = 不限时
    timeBonus: number;       // 每次正确击破加时（秒）
    targetCount: number;     // 颜色队列长度（完成即通关，≤ 棋盘泡泡总数）
}

// 难度常量
const MISTAKE_LIMIT = 5;         // 每关累计捏错上限，达到即挑战失败
const RAINBOW_STREAK_NEED = 12;  // 彩虹泡泡用掉后，需连续正确点击的泡泡数
const CHANGING_MOVE_INTERVAL = 5; // 变色泡泡每隔几秒随机换一次位置
const COLOR_GRAY = new Color(145, 165, 185, 255);
const COLOR_WARN = new Color(232, 84, 84, 255);
const COLOR_PURPLE = new Color(190, 120, 255, 255);

// 教学章(2) → 第一章·静态(原位刷新:限时→5色→彩虹) / 第二章·动态(重力:重力→限时→5色→彩虹)
const PALETTE3 = ['red', 'yellow', 'blue'];
const PALETTE5 = ['red', 'yellow', 'blue', 'green', 'violet'];
const PALETTE7 = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'violet'];
const LEVELS: LevelConfig[] = [
    {
        num: 'T1', theme: 'Colors', keywords: 'Red Yellow Blue · Static board · Color queue',
        narrative: 'Find the required colors in the neat bubble sheet.',
        outro: 'The board is alive now — new bubbles keep coming.',
        gridCols: 3, gridRows: 4, shape: 'rect', colors: PALETTE3,
        dynamic: false, gravity: false, rainbow: false, changing: false,
        timeLimit: 0, timeBonus: 0, targetCount: 12,
    },
    {
        num: 'T2', theme: 'Flow', keywords: 'Live refill · Red Yellow Blue · Keep popping',
        narrative: 'Every bubble you pop is replaced by a new one.',
        outro: 'The bubbles are flowing — and now the clock starts.',
        gridCols: 4, gridRows: 5, shape: 'rect', colors: PALETTE3,
        dynamic: true, gravity: false, rainbow: false, changing: false,
        timeLimit: 0, timeBonus: 0, targetCount: 20,
    },
    {
        num: '1-1', theme: 'Timed', keywords: 'Countdown · Live refill',
        narrative: 'Finish the color queue before time runs out. (Chapter 1)',
        outro: 'More colors — learn to tell the five apart.',
        gridCols: 7, gridRows: 8, shape: 'rect', colors: PALETTE3,
        dynamic: true, gravity: false, rainbow: false, changing: false,
        timeLimit: 45, timeBonus: 0.8, targetCount: 30,
    },
    {
        num: '1-2', theme: 'Multicolor', keywords: 'Countdown · Live refill · Five colors',
        narrative: 'Five colors now — stay sharp.',
        outro: 'Rainbow bubbles join the field.',
        gridCols: 7, gridRows: 8, shape: 'rect', colors: PALETTE5,
        dynamic: true, gravity: false, rainbow: false, changing: false,
        timeLimit: 50, timeBonus: 0.8, targetCount: 42,
    },
    {
        num: '1-3', theme: 'Rainbow', keywords: 'Countdown · Live refill · Five colors · Rainbow',
        narrative: 'Rainbow bubbles match any color to help you beat the clock.',
        outro: 'Chapter 1 complete! Get ready for the dynamic world.',
        gridCols: 7, gridRows: 8, shape: 'rect', colors: PALETTE5,
        dynamic: true, gravity: false, rainbow: true, changing: false,
        timeLimit: 55, timeBonus: 0.8, targetCount: 42,
    },
    {
        num: '1-4', theme: 'Seven Colors', keywords: 'Countdown · Live refill · Seven colors · Big board',
        narrative: 'Seven colors fill the big board — test your eyes and speed.',
        outro: 'A new mechanic is about to appear.',
        gridCols: 7, gridRows: 8, shape: 'rect', colors: PALETTE7,
        dynamic: true, gravity: false, rainbow: false, changing: false,
        timeLimit: 60, timeBonus: 0.6, targetCount: 56,
    },
    {
        num: '1-5', theme: 'Chain', keywords: 'Countdown · Seven colors · Big board · Chain',
        narrative: 'Pop one and all adjacent same-color bubbles burst together.',
        outro: 'Beyond chains, frozen bubbles await.',
        gridCols: 7, gridRows: 8, shape: 'rect', colors: PALETTE7,
        dynamic: true, gravity: false, rainbow: false, changing: false, chain: true,
        timeLimit: 60, timeBonus: 0.6, targetCount: 56,
    },
    {
        num: '1-6', theme: 'Frozen', keywords: 'Countdown · Seven colors · Chain · Frozen',
        narrative: 'Frozen bubbles thaw when any neighbor pops first.',
        outro: 'Chapter 1 complete! Get ready for the dynamic world.',
        gridCols: 7, gridRows: 8, shape: 'rect', colors: PALETTE7,
        dynamic: true, gravity: false, rainbow: false, changing: false, chain: true, locked: true,
        timeLimit: 65, timeBonus: 0.6, targetCount: 56,
    },
    {
        num: '2-1', theme: 'Gravity', keywords: 'Gravity refill · Bubbles fall',
        narrative: 'Bubbles fall to fill gaps — the board keeps shifting. (Chapter 2)',
        outro: 'Now time is chasing you too.',
        gridCols: 7, gridRows: 8, shape: 'rect', colors: PALETTE3,
        dynamic: false, gravity: true, rainbow: false, changing: false,
        timeLimit: 0, timeBonus: 0, targetCount: 30,
    },
    {
        num: '2-2', theme: 'Time & Space', keywords: 'Gravity refill · Countdown',
        narrative: 'Space shifts while time chases you. (Space + Time)',
        outro: 'The palette is growing.',
        gridCols: 7, gridRows: 8, shape: 'rect', colors: PALETTE3,
        dynamic: false, gravity: true, rainbow: false, changing: false,
        timeLimit: 50, timeBonus: 0.8, targetCount: 42,
    },
    {
        num: '2-3', theme: 'Multicolor', keywords: 'Gravity refill · Countdown · Five colors',
        narrative: 'Gravity plus five colors — harder now.',
        outro: 'Rainbow bubbles arrive on the dynamic board.',
        gridCols: 7, gridRows: 8, shape: 'rect', colors: PALETTE5,
        dynamic: false, gravity: true, rainbow: false, changing: false,
        timeLimit: 55, timeBonus: 0.7, targetCount: 42,
    },
    {
        num: '2-4', theme: 'Burst', keywords: 'Gravity refill · Countdown · Five colors · Rainbow',
        narrative: 'The final trial on a living board.',
        outro: 'Chapter 2 complete! The whole journey ends here.',
        gridCols: 7, gridRows: 8, shape: 'rect', colors: PALETTE5,
        dynamic: false, gravity: true, rainbow: true, changing: false,
        timeLimit: 60, timeBonus: 0.7, targetCount: 49,
    },
    {
        num: '2-5', theme: 'Seven Colors', keywords: 'Gravity refill · Countdown · Seven colors · Big board',
        narrative: 'Seven colors on a big gravity board.',
        outro: 'Chains join the dynamic board.',
        gridCols: 7, gridRows: 8, shape: 'rect', colors: PALETTE7,
        dynamic: false, gravity: true, rainbow: false, changing: false,
        timeLimit: 60, timeBonus: 0.6, targetCount: 56,
    },
    {
        num: '2-6', theme: 'Chain', keywords: 'Gravity · Countdown · Seven colors · Big board · Chain',
        narrative: 'Falling and chaining together — mind the rhythm.',
        outro: 'The last challenge: frozen bubbles join the dynamic board.',
        gridCols: 7, gridRows: 8, shape: 'rect', colors: PALETTE7,
        dynamic: false, gravity: true, rainbow: false, changing: false, chain: true,
        timeLimit: 60, timeBonus: 0.6, targetCount: 56,
    },
    {
        num: '2-7', theme: 'Frozen', keywords: 'Gravity · Seven colors · Chain · Frozen',
        narrative: 'Gravity, chains and frozen bubbles — the final trial.',
        outro: 'Chapter 2 complete! All levels finished.',
        gridCols: 7, gridRows: 8, shape: 'rect', colors: PALETTE7,
        dynamic: false, gravity: true, rainbow: false, changing: false, chain: true, locked: true,
        timeLimit: 65, timeBonus: 0.6, targetCount: 56,
    },
];

// 关卡分组：0/1 教学章；2~7 第一章（静态·原位刷新）；8~14 第二章（动态·重力）
const TUTORIAL_LEVELS = [0, 1];
const STATIC_LEVELS = [2, 3, 4, 5, 6, 7];
const DYNAMIC_LEVELS = [8, 9, 10, 11, 12, 13, 14];

// ---------------- 存档 ----------------

interface SaveData {
    version: number;
    tutorialsDone: boolean;   // 两节教学章是否完成
    ch1: number[];            // 第一章（静态）已通关的全局关卡序号
    ch2: number[];            // 第二章（动态）已通关的全局关卡序号
    bestCombo: number;
    lastChapter: 0 | 1 | 2;   // 0=无 1=第一章 2=第二章（用于“继续游戏”）
    intro: string[];          // 已经做过“首次出现”重点提示的特殊机制（全流程只提示一次）
    stars: Record<string, number>;   // 每关最好星级（0-3），key = 关卡序号
    bestScores: Record<string, number>; // 每关最高分
}

const SAVE_KEY = 'bubblewrap_save_v1';

function defaultSave(): SaveData {
    return { version: 3, tutorialsDone: false, ch1: [], ch2: [], bestCombo: 0, lastChapter: 0, intro: [], stars: {}, bestScores: {} };
}

function chapterGroupOf(index: number): 'tutorial' | 'ch1' | 'ch2' {
    if (index <= 1) return 'tutorial';
    return STATIC_LEVELS.includes(index) ? 'ch1' : 'ch2';
}

function completedListOf(save: SaveData, index: number): number[] {
    const g = chapterGroupOf(index);
    if (g === 'ch1') return save.ch1;
    if (g === 'ch2') return save.ch2;
    return save.tutorialsDone ? [0, 1] : [];
}

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
            // v2：教程 + 双章节
            if (d.version === 2 || d.version === 3) {
                // v2 的第二章序号为 5~8，插入新关卡后已整体后移 3 位
                const remap = (arr: number[]) => d.version === 2
                    ? arr.map((x) => (x >= 5 && x <= 8 ? x + 3 : x))
                    : arr;
                return {
                    version: 3,
                    tutorialsDone: !!d.tutorialsDone,
                    ch1: Array.isArray(d.ch1) ? d.ch1 : [],
                    ch2: Array.isArray(d.ch2) ? remap(d.ch2) : [],
                    bestCombo: Number(d.bestCombo) || 0,
                    lastChapter: d.lastChapter === 1 || d.lastChapter === 2 ? d.lastChapter : 0,
                    intro: Array.isArray(d.intro) ? d.intro.filter((x: any) => typeof x === 'string') : [],
                    stars: (d.stars && typeof d.stars === 'object') ? d.stars : {},
                    bestScores: (d.bestScores && typeof d.bestScores === 'object') ? d.bestScores : {},
                };
            }
            // v1 旧档迁移：曾通关即视为教程完成，已通关关卡按分组归位
            const old = Array.isArray(d.completed) ? d.completed : [];
            return {
                version: 3,
                tutorialsDone: old.length > 0,
                ch1: old.filter((x: number) => x >= 2 && x <= 4),
                ch2: old.filter((x: number) => x >= 5 && x <= 8).map((x: number) => x + 3),
                bestCombo: Number(d.bestCombo) || 0,
                lastChapter: 0,
                intro: [],
                stars: {},
                bestScores: {},
            };
        }
    } catch { /* ignore */ }
    return defaultSave();
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
    private combo = 0;
    private lastPopTime = 0;
    // 连击：0.9 秒内继续点对就算连上；最多升 7 个半音
    private static readonly COMBO_WINDOW = 0.9;
    private comboTimer = 0;
    private maxComboThisLevel = 0;
    private shakeAmp = 0;
    private lastPitch = 1;
    // 连击音阶：combo_1..combo_8（预生成的五声音阶上行）
    private comboChimes: AudioClip[] = [];
    private score = 0;              // 本关分数
    // 音频（BGM 独立音源 + 开关设置）
    private bgmAudio: AudioSource = null!;
    private musicBtn: Node = null!;
    private sfxBtn: Node = null!;
    private musicOn = true;
    private sfxOn = true;
    private static readonly MUSIC_VOLUME = 0.45;
    private static readonly SETTINGS_KEY = 'bubblewrap_settings_v1';
    private timerLeft = 0;
    private playing = false;
    private chgAcc = 0;
    private errLog: string[] = [];
    private errLabel: Label = null!;
    private chainPopCount = 0;
    // 重力补位逐帧队列（不依赖定时器，避免抖音端调度丢失；同时保证串行安全）
    private gravityQueue: { node: Node; avoid: string; at: number }[] = [];
    // 连锁消除逐帧队列（同上：保证连锁泡泡一定会爆、一定会补位）
    private chainQueue: { node: Node; at: number }[] = [];
    // 开场主题卡逐帧计时（不依赖 scheduleOnce）
    private introTimer = 0;
    // 变色泡泡换位逐帧计时
    private chgMoveAcc = 0;
    // 补位后的短暂“不可点”保护：防止同一次滑动把刚补上的新泡泡立刻又点掉
    private static readonly REBORN_GUARD_MS = 200;

    // 失败机制：本关累计捏错次数
    private mistakes = 0;
    // 彩虹泡泡：同一时间最多一个；用掉后连续正确点击累计
    private rainbowNode: Node | null = null;
    private rainbowStreak = 0;
    // 蛇形补位（批量：多个爆破点一次补位，S 型推进）
    private snakeCells: { r: number; c: number }[] = [];
    private snakeBusy = false;
    private snakeDirty: Node[] = [];
    // 变色泡泡计数（限制同屏数量）
    private changingSpawned = 0;

    // 颜色队列
    private queue: string[] = [];
    private queueIdx = 0;
    private targetBar: Node = null!;
    private targetStrip: Node = null!;
    private targetSlots: Node[] = [];
    private targetHint: Label = null!;
    private targetSprite: Sprite | null = null;
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
    private scoreLabel: Label = null!;
    private missDots: Graphics = null!;
    private descLabel: Label = null!;
    private progressG: Graphics = null!;

    // 特殊泡泡提示（首次出现时说明作用）+ 彩虹出现前的轻提示
    private tipCard: Node = null!;
    private tipLabel: Label = null!;
    private tipQueue: string[] = [];
    private tipTimer = 0;
    // 特殊泡泡重点提示：整屏变暗 + 聚光灯圈住那颗泡泡，点一下才继续
    private spotNode: Node = null!;
    private spotHoleG: Graphics = null!;
    private spotRing: Node = null!;
    private spotTitle: Label = null!;
    private spotSub: Label = null!;
    private spotCard: Node = null!;
    private spotQueue: { kind: string; text: string; sub: string }[] = [];
    private spotActive = false;
    private spotPulse = 0;
    private spotTime = 0;
    private spotAt = new Vec3(0, 0, 0);
    // CrazyGames：上一次上报给 SDK 的“是否处于游戏状态”
    private cgPlaying = false;

    // 遮罩
    private overlay: Node = null!;
    private overlayCard: Node = null!;
    private overlayTitle: Label = null!;
    private overlayDesc: Label = null!;
    private starRow: Node = null!;
    private starRowG: Graphics = null!;
    private overlayBg: Graphics = null!;
    private btnA: Node = null!;
    private btnB: Node = null!;
    private labelA: Label = null!;
    private labelB: Label = null!;
    private btnC: Node = null!;
    private labelC: Label = null!;
    private lvGrid: Node = null!;
    private scrollView: ScrollView = null!;
    private backBtn: Node = null!;
    private hudNodes: Node[] = [];
    // 左上角关卡内按钮（重新开始 / 返回主菜单）
    private restartBtn: Node = null!;
    private homeBtn: Node = null!;
    private actionA: (() => void) | null = null;
    private actionB: (() => void) | null = null;
    private actionC: (() => void) | null = null;

    onEnable() {
        input.on(Input.EventType.TOUCH_START, this.onTouch, this);
        input.on(Input.EventType.TOUCH_MOVE, this.onTouch, this);
    }

    onDisable() {
        input.off(Input.EventType.TOUCH_START, this.onTouch, this);
        input.off(Input.EventType.TOUCH_MOVE, this.onTouch, this);
    }

    start() {
        this.loadAudioSettings();   // 先读设置，保证首次播放就是用户设定的音量
        this.buildBackdrop();
        this.buildHud();
        this.loadAllAudio();
        // 平台侧统一静音入口（CrazyGames 的 muteAudio 设置会调用它）
        (globalThis as any).__popBubblesMute = (on: boolean) => this.setAllAudioMuted(!!on);
        // CrazyGames 要求“直接进入游戏”（land directly in gameplay）：
        // 网页版（存在 CG 适配层）启动后直接进入下一个可玩关卡，不再停留标题页；
        // 抖音小游戏包没有 CG，仍走原来的标题页流程。
        const cgHost = !!(globalThis as any).CG;
        if (cgHost) {
            try {
                const sv = loadSave();
                let next = 0;
                if (sv.tutorialsDone) {
                    const list = sv.lastChapter === 2 ? DYNAMIC_LEVELS : STATIC_LEVELS;
                    const n = this.firstIncompleteIn(sv, list);
                    next = n === null ? list[0] : n;
                }
                this.gotoLevel(next);
            } catch (e) {
                this.cap('autostart err', e);
                this.showTitle();
            }
        } else {
            this.showTitle();
        }
        // 全局错误记录（配合 console / tt.onError 定位重启问题）
        const g = globalThis as any;
        try {
            const rec = (msg: string) => this.cap('window', msg);
            (g as any).__bubblewrapErrors = this.errLog;
            if (typeof g.addEventListener === 'function') {
                g.addEventListener('error', (e: any) => rec(`window: ${e && e.message}`));
                // 未处理的 Promise 拒绝（音频 play() 等异步失败）在部分小游戏运行时会被当作致命错误
                g.addEventListener('unhandledrejection', (e: any) => {
                    rec(`rejection: ${(e && (e.reason && (e.reason.message || e.reason))) || 'unknown'}`);
                    if (e && typeof e.preventDefault === 'function') e.preventDefault();
                });
            }
            // 兜住全局同步异常，避免运行时直接重启
            g.onerror = (msg: any, src: any, line: any, col: any, err: any) => {
                rec(`onerror: ${(err && err.message) || msg}`);
                return true;
            };
        } catch { /* ignore */ }
        // 全局错误兜底：单次异常不导致整个游戏重启（抖音运行时偶发）
        if (g.tt && g.tt.onError) {
            try { g.tt.onError((e: any) => this.cap('tt', e && e.errMsg)); } catch { /* ignore */ }
        }
        // CrazyGames：场景就绪，结束 loading 阶段
        this.cgEvent('loadingStop');
        // 通知 HTML 加载层：收起进度条
        try {
            const g2 = globalThis as any;
            g2.__popBubblesReady = true;
            if (typeof g2.__popBubblesOnReady === 'function') g2.__popBubblesOnReady();
        } catch { /* 忽略 */ }
    }

    /**
     * 超尺寸白色底板：始终垫在所有内容之下。
     * 竖屏画面在桌面横向窗口里会被两侧留白（SHOW_ALL），
     * 不铺这层的话留白会是画布清屏色（黑），铺上后与游戏白底完全连成一片。
     */
    private buildBackdrop() {
        try {
            const n = new Node('Backdrop');
            n.layer = Layers.Enum.UI_2D;
            n.addComponent(UITransform).setContentSize(4000, 4000);
            const g = n.addComponent(Graphics);
            g.fillColor = new Color(255, 255, 255, 255);
            g.rect(-2000, -2000, 4000, 4000);
            g.fill();
            this.node.addChild(n);
            n.setSiblingIndex(0);
        } catch (e) {
            this.cap('backdrop err', e);
        }
    }

    /** CrazyGames SDK 事件上报：未接入 / 环境不支持时是空操作，永不影响游戏 */
    private cgEvent(name: 'loadingStart' | 'loadingStop' | 'gameplayStart' | 'gameplayStop' | 'happyTime') {
        try {
            const cg = (globalThis as any).CG;
            if (cg && typeof cg[name] === 'function') cg[name]();
        } catch { /* ignore */ }
    }

    update(dt: number) {
        try {
            // CrazyGames：进入/离开可玩状态时上报（官方用于统计 time-to-gameplay）
            if (this.cgPlaying !== this.playing) {
                this.cgPlaying = this.playing;
                this.cgEvent(this.playing ? 'gameplayStart' : 'gameplayStop');
            }
            if (this.playing && this.timerLeft > 0) {
                this.timerLeft -= dt;
                if (this.timerLeft <= 0) {
                    this.timerLeft = 0;
                    this.timeUp();
                }
                this.timerLabel.string = `Time ${Math.ceil(this.timerLeft)}`;
            }
            // 进度数字逐帧校准（异常也不会与真实队列脱节）
            if (this.playing) {
                const c0 = LEVELS[this.currentLevel];
                if (c0) this.remainLabel.string = `Left ${Math.max(c0.targetCount - this.queueIdx, 0)}`;
            }
            // 重力补位：逐帧串行执行（不依赖定时器）
            if (this.gravityQueue.length > 0) {
                const now = Date.now();
                const rest: { node: Node; avoid: string; at: number }[] = [];
                for (const item of this.gravityQueue) {
                    if (now < item.at) { rest.push(item); continue; }
                    try {
                        this.gravityRefill(item.node, item.avoid);
                    } catch (e) {
                        this.cap('gravity queue err', e);
                    }
                }
                this.gravityQueue = rest;
            }
            // 连锁消除：逐帧串行执行（抖音端 scheduleOnce 曾丢调度，导致连锁泡泡不爆也不补位）
            if (this.chainQueue.length > 0) {
                const now = Date.now();
                const rest: { node: Node; at: number }[] = [];
                for (const item of this.chainQueue) {
                    if (now < item.at) { rest.push(item); continue; }
                    try {
                        const c = item.node && item.node.isValid ? item.node.getComponent(Bubble) : null;
                        if (c && !c.isPopped) {
                            (item.node as any).__chain = true;
                            c.pop();
                        }
                    } catch (e) {
                        this.cap('chain queue err', e);
                    }
                }
                this.chainQueue = rest;
            }
            // 开场主题卡：逐帧计时放行（不依赖 scheduleOnce，避免卡在“未开始”）
            if (this.introTimer > 0) {
                this.introTimer -= dt;
                if (this.introTimer <= 0) {
                    this.introTimer = 0;
                    this.playing = true;
                    this.hideOverlay();
                }
            }
            // 变色泡泡换位：逐帧计时（替代 schedule）
            if (this.playing) {
                const cfgM = LEVELS[this.currentLevel];
                if (cfgM && cfgM.changing) {
                    this.chgMoveAcc += dt;
                    if (this.chgMoveAcc >= CHANGING_MOVE_INTERVAL) {
                        this.chgMoveAcc = 0;
                        this.relocateChangingBubbles();
                    }
                }
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
            // 特殊泡泡说明条：逐帧驱动排队播放
            if (this.tipTimer > 0) {
                this.tipTimer -= dt;
                if (this.tipTimer <= 0) this.hideTip();
            } else if (this.playing && this.tipQueue.length > 0) {
                try { this.showTip(this.tipQueue.shift()!); } catch (e) { this.cap('tip err', e); }
            }
            // 连击维护：超过窗口没点对就断连（清空连击字）
            if (this.playing) {
                this.comboTimer += dt;
                if (this.combo > 0 && this.comboTimer > GameManager.COMBO_WINDOW) {
                    this.combo = 0;
                    this.updateComboLabel();
                }
            }
            // 屏幕震动：逐帧衰减并抖动「泡泡容器」（结束后严格归位到 0,0）。
            // 注意：不要抖 Canvas —— 它的基准位置是屏幕中心，改动它会破坏 UI 坐标换算（点击会全部失效）。
            if (this.shakeAmp > 0.05) {
                this.shakeAmp *= 0.85;
                const a = this.shakeAmp;
                this.bubbleContainer.setPosition((Math.random() - 0.5) * a, (Math.random() - 0.5) * a, 0);
            } else if (this.shakeAmp !== 0) {
                this.shakeAmp = 0;
                this.bubbleContainer.setPosition(0, 0, 0);
            }
            // 特殊泡泡重点提示：开场卡结束后逐个上（点一下继续）
            if (!this.spotActive && this.playing && this.spotQueue.length > 0 && this.tipTimer <= 0) {
                try {
                    const item = this.spotQueue.shift()!;
                    this.showSpotlight(item.kind, item.text, item.sub);
                    this.markIntroSeen(item.kind);
                } catch (e) {
                    this.cap('spot err', e);
                }
            }
            // 高亮光圈呼吸（逐帧驱动，不用 tween）
            if (this.spotActive && this.spotRing && this.spotRing.isValid) {
                this.spotPulse += dt * 3.4;
                const s = 1 + 0.11 * (0.5 + 0.5 * Math.sin(this.spotPulse));
                this.spotRing.setScale(s, s, 1);
                // 看门狗：万一触摸事件没进来，也不能把关卡卡在暂停状态
                this.spotTime += dt;
                if (this.spotTime > 12) this.dismissSpotlight();
            }
            // 原位刷新兜底：某格击破超 0.45s 仍未补位（或被中断的动画留在透明态），直接整格复位
            if (this.playing) {
                const cfg = LEVELS[this.currentLevel];
                if (cfg && cfg.dynamic && !cfg.gravity) {
                    const now = Date.now();
                    for (const b of this.bubbleList) {
                        if (!b.isValid) continue;
                        const c = b.getComponent(Bubble);
                        const t = (b as any).__popT as number | undefined;
                        if (!c || !t || now - t <= 450) continue;
                        const sp = b.getComponent(Sprite);
                        const faded = !!sp && sp.color.a < 200;
                        if (!c.isPopped && !faded) continue;
                        const prev = c!.color;
                        try {
                            this.refillDynamicNow(b, prev);
                        } catch (e) {
                            this.cap('watchdog refill err', e);
                        }
                    }
                }
            }
        } catch (e) {
            this.cap('update err', e);
        }
    }

    // ---------------- 音频 ----------------

    private loadAllAudio() {
        const keys = [
            'pop_red', 'pop_orange', 'pop_yellow', 'pop_green',
            'pop_cyan', 'pop_blue', 'pop_violet', RAINBOW_AUDIO, 'wrong',
        ];
        // 背景音乐：独立音源，循环播放
        try {
            const bgmNode = new Node('BgmAudio');
            bgmNode.layer = Layers.Enum.UI_2D;
            this.node.addChild(bgmNode);
            this.bgmAudio = bgmNode.addComponent(AudioSource);
            this.bgmAudio.loop = true;
            this.bgmAudio.volume = this.musicOn ? GameManager.MUSIC_VOLUME : 0;
            resources.load('audio/bgm', AudioClip, (err, clip) => {
                if (!err && clip && this.bgmAudio) {
                    this.bgmAudio.clip = clip;
                    this.startBgm();
                }
            });
        } catch (e) {
            this.cap('bgm init err', e);
        }
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
        // 连击音阶：Cocos 3.8 的 AudioSource 没有 pitch/playbackRate，无法运行时变速，
        // 因此预生成 8 个音高档位（combo_1..combo_8），连击时按档位叠放。
        const loadCombo = (i: number, attempt: number) => {
            resources.load(`audio/combo_${i}`, AudioClip, (err, clip) => {
                if (!err && clip) {
                    this.comboChimes[i - 1] = clip;
                } else if (attempt < 4) {
                    this.scheduleOnce(() => loadCombo(i, attempt + 1), 0.5);
                }
            });
        };
        for (let i = 1; i <= 8; i++) loadCombo(i, 0);
        // 1 秒后检查：仍未加载的音频再补一次，避免首局静音
        this.scheduleOnce(() => {
            keys.forEach((k) => {
                if (!this.clips[k]) loadClip(k, 0);
            });
        });
        // 彩色泡泡纹理（保留立体高光的烘焙纹理）
        Object.keys(COLORS).forEach((k) => {
            resources.load(`bubbles/bubble_${k}/spriteFrame`, SpriteFrame, (err, sf) => {
                if (!err && sf) {
                    BUBBLE_FRAMES[k] = sf;
                    if (this.targetSprite) this.highlightCurrent();
                }
            });
        });
        resources.load('bubbles/bubble_rainbow/spriteFrame', SpriteFrame, (err, sf) => {
            if (!err && sf) BUBBLE_FRAMES['rainbow'] = sf;
        });
    }

    private playClip(key: string, pitch: number) {
        try {
            // 统一走场景绑定主音源（抖音/Web 均验证可用）
            // key 可能是颜色名(red)或音频名(pop_red/wrong/pop_rainbow)，统一换算
            const clipKey = key === 'wrong' || key === RAINBOW_AUDIO ? key : `pop_${key}`;
            const clip = this.clips[clipKey];
            // 注意：3.8 的 AudioSource 没有 pitch/playbackRate，音高只能靠预制音频文件，
            // 这里只记录一个值供调试查看，不影响播放。
            this.lastPitch = Math.max(0.5, Math.min(pitch, 2.6));
            if (!clip) return;
            // 关键修复：必须用 playOneShot，不能用 play()。
            // play() 内部会先 stop() 掉当前播放（引擎 audio-source.ts:366），
            // 快速连点时会把上一个泡泡的声音直接掐断 —— 听感就是"发闷、丢音、不够脆"。
            // playOneShot 每次创建独立播放器，可以真正叠着响。
            this.popAudio.playOneShot(clip, 1);
        } catch { /* 无音频设备时静默 */ }
    }

    /** 连击音阶：第 2 连起叠一个上行小钟音（五声音阶），越高越清亮 */
    private playComboChime() {
        try {
            if (this.combo < 2 || this.comboChimes.length === 0) return;
            const idx = Math.min(this.combo - 2, this.comboChimes.length - 1);
            const clip = this.comboChimes[idx];
            if (!clip) return;
            // 音量随连击略增但封顶，避免高连击时刺耳
            const vol = 0.55 + Math.min(this.combo - 2, 6) * 0.06;
            this.popAudio.playOneShot(clip, vol);
        } catch { /* 忽略 */ }
    }

    // ---------------- 连击 / 手感 ----------------

    /** 每次「正确击破」时结算连击：窗口内连上，否则从 1 重新开始 */
    private registerHit() {
        try {
            this.combo = this.comboTimer <= GameManager.COMBO_WINDOW ? this.combo + 1 : 1;
            this.comboTimer = 0;
            if (this.combo > this.maxComboThisLevel) this.maxComboThisLevel = this.combo;
            // 连击越高，屏幕抖得越明显（封顶，避免眩晕）
            if (this.combo >= 2) this.shakeScreen(Math.min(2 + this.combo * 0.9, 13));
            // 每 5 连给一次轻震动
            if (this.combo >= 5 && this.combo % 5 === 0) this.haptic(this.combo >= 15 ? 'medium' : 'light');
        } catch (e) {
            this.cap('combo err', e);
        }
    }

    /** 连击升调系数：每连一次升一个半音，最多升 7 个半音 */
    private comboPitchFactor(): number {
        const steps = Math.min(Math.max(this.combo - 1, 0), 7);
        return Math.pow(2, steps / 12);
    }

    private updateComboLabel() {
        try {
            if (!this.comboLabel || !this.comboLabel.isValid) return;
            if (this.combo >= 2) {
                this.comboLabel.string = `COMBO x${this.combo}`;
                const n = this.comboLabel.node;
                Tween.stopAllByTarget(n);
                n.setScale(1.45, 1.45, 1);
                tween(n).to(0.14, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
            } else {
                this.comboLabel.string = '';
                this.comboLabel.node.setScale(1, 1, 1);
            }
        } catch (e) {
            this.cap('combo ui err', e);
        }
    }

    /** 屏幕震动：设置一个会衰减的幅度，由 update 逐帧抖动 Canvas */
    private shakeScreen(amp: number) {
        this.shakeAmp = Math.max(this.shakeAmp, amp);
    }

    /** 加分：连击越高单次得分越高；点错扣分但不低于 0 */
    private addScore(n: number) {
        try {
            this.score = Math.max(0, this.score + n);
            if (this.scoreLabel && this.scoreLabel.isValid) {
                this.scoreLabel.string = `SCORE ${this.score}`;
                const sn = this.scoreLabel.node;
                Tween.stopAllByTarget(sn);
                sn.setScale(1.18, 1.18, 1);
                tween(sn).to(0.12, { scale: new Vec3(1, 1, 1) }, { easing: 'quadOut' }).start();
            }
            const key = String(this.currentLevel);
            const save = loadSave();
            if (!save.bestScores) save.bestScores = {};
            if (this.score > (save.bestScores[key] || 0)) {
                save.bestScores[key] = this.score;   // 实时记录最高分，中途退出也不丢
                writeSave(save);
            }
        } catch (e) {
            this.cap('score err', e);
        }
    }

    // ---------------- 音频设置（BGM / 音效开关，记忆到本地） ----------------

    private loadAudioSettings() {
        try {
            // 用工程里已有的跨平台存储封装：浏览器走 localStorage，抖音走 tt.getStorageSync
            const raw = storageGet(GameManager.SETTINGS_KEY);
            if (!raw) return;
            const d = JSON.parse(raw);
            this.musicOn = d.music !== 0;
            this.sfxOn = d.sfx !== 0;
        } catch { /* 读取失败用默认值 */ }
    }

    private saveAudioSettings() {
        try {
            storageSet(GameManager.SETTINGS_KEY, JSON.stringify({ music: this.musicOn ? 1 : 0, sfx: this.sfxOn ? 1 : 0 }));
        } catch { /* 忽略 */ }
    }

    /** 应用音量到两个音源，并同步按钮文案 */
    private applyAudioSettings() {
        try {
            if (this.bgmAudio) this.bgmAudio.volume = this.musicOn ? GameManager.MUSIC_VOLUME : 0;
            if (this.popAudio) this.popAudio.volume = this.sfxOn ? 1 : 0;
            const ml = this.musicBtn && this.musicBtn.getChildByName('Label');
            const sl = this.sfxBtn && this.sfxBtn.getChildByName('Label');
            if (ml) ml.getComponent(Label)!.string = this.musicOn ? 'Music On' : 'Music Off';
            if (sl) sl.getComponent(Label)!.string = this.sfxOn ? 'Sound On' : 'Sound Off';
            if (this.musicOn) this.startBgm(); else this.stopBgm();
        } catch (e) {
            this.cap('audio settings err', e);
        }
    }

    private toggleMusic() {
        this.musicOn = !this.musicOn;
        this.saveAudioSettings();
        this.applyAudioSettings();
    }

    private toggleSfx() {
        this.sfxOn = !this.sfxOn;
        this.saveAudioSettings();
        this.applyAudioSettings();
    }

    /** 外部（如 CrazyGames 的静音设置）统一静音/恢复 */
    private setAllAudioMuted(muted: boolean) {
        if (muted) {
            this.musicOn = false;
            this.sfxOn = false;
        } else {
            this.musicOn = true;
            this.sfxOn = true;
        }
        this.applyAudioSettings();
    }

    private startBgm() {
        try {
            if (!this.bgmAudio || !this.bgmAudio.clip || !this.musicOn) return;
            if (this.bgmAudio.playing) return;
            const ret: any = this.bgmAudio.play();
            if (ret && typeof ret.catch === 'function') ret.catch(() => { /* 自动播放被拦截，等首次点击再试 */ });
        } catch { /* 忽略 */ }
    }

    private stopBgm() {
        try {
            if (this.bgmAudio && this.bgmAudio.playing) this.bgmAudio.stop();
        } catch { /* 忽略 */ }
    }

    /** 星级：按本关失误数评定（0-1 失误 3 星，2-3 失误 2 星，否则 1 星） */
    private starsForLevel(): number {
        if (this.mistakes <= 1) return 3;
        if (this.mistakes <= 3) return 2;
        return 1;
    }

    /** 画三颗星（filled = 亮起数量），用矢量路径，避免依赖系统字体的星形字符 */
    private drawStars(g: Graphics, filled: number) {
        g.clear();
        const R = 26, r = 11, gap = 74;
        for (let i = 0; i < 3; i++) {
            const cx = (i - 1) * gap;
            const on = i < filled;
            g.fillColor = on ? new Color(255, 196, 46, 255) : new Color(226, 234, 242, 255);
            g.strokeColor = on ? new Color(240, 168, 26, 255) : new Color(210, 222, 234, 255);
            g.lineWidth = 2;
            for (let k = 0; k < 10; k++) {
                const rad = k % 2 === 0 ? R : r;
                const a = -Math.PI / 2 + (k * Math.PI) / 5;
                const px = cx + Math.cos(a) * rad;
                const py = Math.sin(a) * rad;
                if (k === 0) g.moveTo(px, py); else g.lineTo(px, py);
            }
            g.close();
            g.fill();
            g.stroke();
        }
    }

    /** 震动反馈：抖音用 tt.vibrateShort，浏览器用 navigator.vibrate；都没有则静默 */
    private haptic(type: 'light' | 'medium' | 'heavy' = 'light') {
        try {
            const g = globalThis as any;
            if (g.tt && typeof g.tt.vibrateShort === 'function') {
                g.tt.vibrateShort({ type });
                return;
            }
            const nav = (globalThis as any).navigator;
            if (nav && typeof nav.vibrate === 'function') {
                nav.vibrate(type === 'heavy' ? 30 : type === 'medium' ? 20 : 12);
            }
        } catch { /* 忽略 */ }
    }

    // ---------------- 标题 / 存档 ----------------

    private hasAnyProgress(save: SaveData): boolean {
        return save.tutorialsDone || save.ch1.length > 0 || save.ch2.length > 0;
    }

    private isLevelDone(save: SaveData, index: number): boolean {
        if (index <= 1) return save.tutorialsDone;
        return completedListOf(save, index).includes(index);
    }

    private firstIncompleteIn(save: SaveData, list: number[]): number | null {
        for (const i of list) {
            if (!this.isLevelDone(save, i)) return i;
        }
        return null;
    }

    /** 教学完成后选择章节（第一章静态 / 第二章动态） */
    private showChapterSelect() {
        this.showOverlay('Select Chapter', 'Chapter 1: Static board · Live refill\nChapter 2: Dynamic board · Gravity refill', [{
            label: 'Chapter 1',
            action: () => {
                this.hideOverlay();
                const save = loadSave();
                save.lastChapter = 1;
                writeSave(save);
                const next = this.firstIncompleteIn(save, STATIC_LEVELS);
                this.gotoLevel(next === null ? STATIC_LEVELS[0] : next);
            },
        }, {
            label: 'Chapter 2',
            action: () => {
                this.hideOverlay();
                const save = loadSave();
                save.lastChapter = 2;
                writeSave(save);
                const next = this.firstIncompleteIn(save, DYNAMIC_LEVELS);
                this.gotoLevel(next === null ? DYNAMIC_LEVELS[0] : next);
            },
        }]);
        this.btnC.active = true;
        this.labelC.string = 'Home';
        this.actionC = () => this.showTitle();
        this.applyOverlayStyle(this.btnC, this.labelC, 'ghost');
    }

    private showTitle() {
        const save = loadSave();
        this.drawProgress();
        this.playing = false;
        const buttons: { label: string; action: () => void }[] = [{
            label: 'Start',
            action: () => {
                this.hideOverlay();
                const s = loadSave();
                if (!s.tutorialsDone) {
                    this.gotoLevel(0);
                } else if (s.lastChapter === 1 || s.lastChapter === 2) {
                    const list = s.lastChapter === 1 ? STATIC_LEVELS : DYNAMIC_LEVELS;
                    const next = this.firstIncompleteIn(s, list);
                    this.gotoLevel(next === null ? list[0] : next);
                } else {
                    this.showChapterSelect();
                }
            },
        }, {
            label: 'Start Over',
            action: () => {
                writeSave(defaultSave());
                this.drawProgress();
                this.hideOverlay();
                this.gotoLevel(0);
            },
        }];
        // 标题需与 CrazyGames 上架名称一致（官方要求：Game name 必须与游戏内出现的标题相同）
        // 标题页：统一用正式名 Pop Bubbles，并展示星星收集进度（给玩家一个长期目标）
        const starSum = Object.keys(save.stars || {}).reduce((sum, k) => sum + (save.stars[k] || 0), 0);
        const starMax = LEVELS.length * 3;
        const scoreBest = Object.keys(save.bestScores || {}).reduce((sum, k) => sum + (save.bestScores[k] || 0), 0);
        this.showOverlay('Pop Bubbles', `Stars ${starSum} / ${starMax}  ·  Best combo ${save.bestCombo}  ·  Total score ${scoreBest}`, buttons);
        // 开发版：完整“选择关卡”；发布版：仅通关教学后开放“选择章节”
        if (IS_DEV) {
            this.btnC.active = true;
            this.labelC.string = 'Select Level';
            this.actionC = () => this.showLevelSelect();
            this.applyOverlayStyle(this.btnC, this.labelC, 'ghost');
        } else if (save.tutorialsDone) {
            this.btnC.active = true;
            this.labelC.string = 'Select Chapter';
            this.actionC = () => this.showChapterSelect();
            this.applyOverlayStyle(this.btnC, this.labelC, 'ghost');
        } else {
            this.btnC.active = false;
        }
    }

    /** 玩家正式流程可达性：教学顺序推进；章节内必须打通上一关（章节首关随选择进入） */
    private canAccessInPlayerFlow(index: number, save: SaveData): boolean {
        if (index <= 1) return !save.tutorialsDone;
        if (!save.tutorialsDone) return false;
        const isCh1 = index <= 4;
        const list = isCh1 ? STATIC_LEVELS : DYNAMIC_LEVELS;
        const arr = isCh1 ? save.ch1 : save.ch2;
        const pos = list.indexOf(index);
        if (pos <= 0) return true;
        return arr.includes(list[pos - 1]);
    }

    /** 关卡加载统一入口：任何加载期异常都被兜住，不导致运行时重启 */
    private gotoLevel(index: number) {
        try {
            this.loadLevel(index);
        } catch (e) {
            this.cap('gotoLevel err ' + index, e);
            try {
                this.showTitle();
            } catch { /* ignore */ }
        }
    }

    // ---------------- 关卡加载 ----------------

    loadLevel(index: number) {
        const gSave = loadSave();
        // 发布模式只允许玩家流程可达的关卡；开发模式放行任意跳关
        if (!IS_DEV && !this.canAccessInPlayerFlow(index, gSave)) {
            console.warn('[BubbleWrap] 非开发模式不可直达该关卡', index);
            return;
        }
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
        this.comboTimer = 0;
        this.maxComboThisLevel = 0;
        this.shakeAmp = 0;
        this.score = 0;
        if (this.scoreLabel) this.scoreLabel.string = 'SCORE 0';
        if (this.bubbleContainer) this.bubbleContainer.setPosition(0, 0, 0);
        this.timerLeft = cfg.timeLimit;
        this.playing = false;
        this.mistakes = 0;
        this.rainbowNode = null;
        this.rainbowStreak = 0;
        this.changingSpawned = 0;
        this.chainPopCount = 0;
        this.gravityQueue.length = 0;
        this.chainQueue.length = 0;
        this.chgMoveAcc = 0;
        this.snakeBusy = false;
        this.snakeDirty.length = 0;
        this.snakeCells = cfg.snake ? this.makeSnakeCells(cfg) : [];
        this.buildQueue(cfg);

        this.titleLabel.string = cfg.num;
        this.subtitleLabel.string = cfg.keywords;
        this.descLabel.string = cfg.narrative;
        this.remainLabel.string = `Left ${cfg.targetCount}`;
        this.comboLabel.string = '';
        this.timerLabel.string = cfg.timeLimit > 0 ? `Time ${cfg.timeLimit}` : '';
        this.missLabel.string = 'Misses';
        this.missLabel.color = COLOR_GRAY;
        this.drawMissDots(0);
        this.drawProgress();

        this.spawnGrid(cfg);
        if (cfg.changing && this.countChanging() < 1) this.ensureOneChanging();
        // 彩虹关：开局场上即有一个彩虹泡泡（同一时间仅一个）
        if (cfg.rainbow) this.spawnRainbow();
        // 防卡关：开局当前目标色一定在场上
        this.ensureTargetColorAvailable();
        this.renderTargetBar();

        // 变色关：变色泡泡换位由 update 逐帧计时驱动（原 schedule 在抖音端偶发丢失）
        this.unschedule(this.relocateChangingBubbles);

        // 调试钩子（仅开发/调试构建暴露；正式发布不挂载）
        if (IS_DEV) (globalThis as any).__bubblewrap = {
            gm: this,
            level: this.currentLevel,
            target: () => this.queue[this.queueIdx],
            remaining: () => cfg.targetCount - this.queueIdx,
            audio: () => Object.fromEntries(
                Object.entries(this.clips).map(([k, v]) => [k, !!v]),
            ),
            lastClip: () => (this.popAudio.clip ? this.popAudio.clip.name : ''),
            comboChimes: () => this.comboChimes.filter((c) => !!c).length,
            errors: () => this.errLog.slice(),
            chainPops: () => this.chainPopCount,
            combo: () => this.combo,
            maxCombo: () => this.maxComboThisLevel,
            lastPitch: () => this.lastPitch,
            shake: () => this.shakeAmp,
            // 锁样式实时切换（0 深色圆底锁 / 1 纯透明罩 / 2 透明罩+小锁 / 3 虚线环+中央锁）
            setLockStyle: (n: number) => {
                Bubble.lockStyle = n;
                for (const b of this.bubbleList) {
                    if (!b.isValid) continue;
                    const c = b.getComponent(Bubble);
                    if (c && c.locked) c.setLocked(true);
                }
                return Bubble.lockStyle;
            },
            bubbles: () => this.bubbleList.filter((b) => b.isValid).map((b) => {
                const c = b.getComponent(Bubble);
                return {
                    x: b.position.x, y: b.position.y,
                    color: c ? c.color : '',
                    rainbow: c ? c.rainbow : false,
                    changing: c ? c.changing : false,
                    locked: c ? c.locked : false,
                    popped: c ? c.isPopped : true,
                };
            }),
        };

        // 开场主题卡：衔接上一关
        this.showOverlay(cfg.num, `${cfg.keywords}\n${cfg.narrative}`, []);
        this.introTimer = 1.6;
        // 特殊泡泡首次出现：说明条排在开场卡之后（showOverlay 会清空队列，必须放在其后）
        this.queueSpecialTips(cfg);
    }

    /** 重置 = 重新开始当前关卡（场景里按钮绑定此方法） */
    resetAllBubble() {
        this.gotoLevel(this.currentLevel);
    }

    private clearBubbles() {
        this.bubbleList.forEach((b) => {
            if (b.isValid) b.destroy();
        });
        this.bubbleList.length = 0;
    }

    /** 按形状生成网格：泡泡大小与格距固定，只按关卡形状摆放（rect/拱形/凹形/圆形/心形） */
    private spawnGrid(cfg: LevelConfig) {
        const CELL = 92;     // 固定格距（所有关卡一致）
        const SCALE = 1.0;   // 固定泡泡尺寸（所有关卡一致）
        // 静态教学关（1-1）：棋盘颜色取队列颜色洗牌，保证队列一定能被捏完
        // 重力/变色关：随机配色，特殊泡泡才有机会出现
        const forced = (!cfg.dynamic && !cfg.gravity && !cfg.changing) ? this.shuffled(this.queue.slice()) : null;
        const balanced = forced ? null : this.makeBalancedColors(cfg, cfg.gridCols * cfg.gridRows);
        let i = 0;
        for (let r = 0; r < cfg.gridRows; r++) {
            for (let c = 0; c < cfg.gridCols; c++) {
                if (!this.shapeOK(cfg, r, c)) continue;
                const pos = this.gridPos(cfg, r, c);
                const x = pos.x;
                const y = pos.y;
                const bubble = this.createBubble(new Vec3(x, y, 0), cfg, SCALE, forced ? forced[i] : (balanced ? balanced[i] : undefined));
                this.bubbleContainer.addChild(bubble);
                this.bubbleList.push(bubble);
                (bubble as any).__cell = { r, c };
                i++;
            }
        }
        if (cfg.snake && this.snakeCells.length > 0) {
            for (let s = 0; s < this.snakeCells.length; s++) {
                const cell = this.snakeCells[s];
                const nd = this.bubbleList.find((b) => {
                    const cc = (b as any).__cell as { r: number; c: number } | null;
                    return !!cc && cc.r === cell.r && cc.c === cell.c;
                });
                if (nd) (nd as any).__pi = s;
            }
        }
        this.ensurePalette(cfg);
        // 锁定泡泡：随机挑选少量泡泡上锁（需先炸掉相邻任意泡泡解锁）
        if (cfg.locked) {
            const pool = this.shuffled(this.bubbleList.slice());
            const lockCount = Math.max(3, Math.round(pool.length * 0.08));
            for (let k = 0; k < lockCount && k < pool.length; k++) {
                const c = pool[k].getComponent(Bubble);
                if (c) c.setLocked(true);
            }
        }
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
        const CELL = 92;
        const x0 = -(cfg.gridCols - 1) * CELL / 2;
        const centerY = -58;
        const yTop = centerY + (cfg.gridRows - 1) * CELL / 2;
        return new Vec3(x0 + c * CELL, yTop - r * CELL, 0);
    }

    private createBubble(pos: Vec3, cfg: LevelConfig, scale: number, forcedColor?: string): Node {
        const bubble = instantiate(this.bubblePrefab);
        bubble.setPosition(pos);
        bubble.setScale(scale, scale, 1);
        const comp = bubble.getComponent(Bubble)!;
        // 创建时只出普通颜色；彩虹泡泡统一由 spawnRainbow 单点刷新
        if (!forcedColor && cfg.changing && this.countChanging() < this.changingCap() && Math.random() < 0.08) {
            comp.setChanging();
            this.changingSpawned++;
        } else {
            comp.setColor(forcedColor ?? cfg.colors[randomRangeInt(0, cfg.colors.length)]);
        }
        bubble.on('bubblePop', this.onBubblePop, this);
        return bubble;
    }

    private countChanging(): number {
        let n = 0;
        for (const b of this.bubbleList) {
            if (!b.isValid) continue;
            const c = b.getComponent(Bubble);
            if (c && c.changing && !c.isPopped) n++;
        }
        return n;
    }

    private changingCap(): number {
        return this.currentLevel >= 8 ? 4 : 3;
    }

    private ensureOneChanging() {
        const target = this.bubbleList.find((b) => {
            if (!b.isValid) return false;
            const c = b.getComponent(Bubble);
            return !!c && !c.isPopped && !c.changing && !c.rainbow;
        });
        if (target) {
            target.getComponent(Bubble)!.setChanging();
            this.changingSpawned++;
        }
    }

    private respawnBubble(node: Node, avoidColor?: string, delay = 0.16) {
        if (!node.isValid) return;
        // 兼容保留：同步补位已由 refillDynamicNow 完成
        this.refillDynamicNow(node, avoidColor);
    }

    /** 同步原位补位：立刻把该格复位成新泡泡（不依赖定时器） */
    private refillDynamicNow(node: Node, avoidColor?: string) {
        try {
            if (!node || !node.isValid) return;
            const cfg = LEVELS[this.currentLevel];
            const comp = node.getComponent(Bubble);
            if (!comp) return;
            const target = this.queue[this.queueIdx];
            const hasOtherTarget = !!target && this.bubbleList.some((b) => {
                if (b === node || !b.isValid) return false;
                const c = b.getComponent(Bubble);
                return !!c && !c.isPopped && !c.changing && !c.rainbow && c.color === target;
            });
            comp.resetBubble();
            comp.setColor(target && !hasOtherTarget ? target : this.pickSpawnColor(cfg, avoidColor));
            (node as any).__popT = 0;
            (node as any).__rebornAt = Date.now();
            this.ensureTargetColorAvailable();
        } catch (e) {
            this.cap('refill now err', e);
        }
    }

    /** 爆破残影：复制一个同色泡泡在原位播放放大淡出，本体随后立即补位 */
    private spawnPopGhost(node: Node, colorKey: string) {
        try {
            if (!node || !node.isValid) return;
            const pos = node.position.clone();
            const s = node.scale.x;
            const ghost = instantiate(this.bubblePrefab);
            ghost.setPosition(pos);
            ghost.setScale(s, s, 1);
            const c = ghost.getComponent(Bubble);
            if (c) {
                if (colorKey === 'rainbow') c.setRainbow();
                else c.setColor(colorKey);
            }
            this.bubbleContainer.addChild(ghost);
            const sp = ghost.getComponent(Sprite);
            if (sp) tween(sp).to(0.18, { color: new Color(255, 255, 255, 0) }, { easing: 'quadOut' }).start();
            tween(ghost)
                .to(0.18, { scale: new Vec3(s * 1.35, s * 1.35, 1) }, { easing: 'quadOut' })
                .call(() => { if (ghost.isValid) ghost.destroy(); })
                .start();
        } catch (e) {
            this.cap('ghost err', e);
        }
    }

    /** 重力补位：销毁被击破泡泡，同列上方泡泡下落，顶部补入新泡泡 */
    private gravityRefill(node: Node, avoidColor?: string) {
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
            // 同一列可能在同帧被补位多次：先掐掉上一次下落动画，避免两条 tween 抢同一节点导致停在半路
            Tween.stopAllByTarget(nd);
            tween(nd).to(0.14, { position: target }, { easing: 'quadIn' }).start();
        });
        const topRows = allowed.slice(0, allowed.length - take);
        let lastPick = avoidColor;
        topRows.forEach((rd) => {
            const target = this.gridPos(cfg, rd, col);
            const pos = new Vec3(target.x, target.y + 320, 0);
            const nb = this.createBubble(pos, cfg, 0.95);
            // 重力补位负责“带入”目标色 & 保持配色均衡（不再随机改色）
            const bc = nb.getComponent(Bubble);
            if (bc) {
                const picked = this.pickSpawnColor(cfg, lastPick);
                bc.setColor(picked);
                lastPick = picked;
            }
            this.bubbleContainer.addChild(nb);
            this.bubbleList.push(nb);
            (nb as any).__cell = { r: rd, c: col };
            tween(nb).to(0.16 + Math.random() * 0.1, { position: target }, { easing: 'quadIn' }).start();
        });
    }

    /** S 型路径：第 1 列自上而下 → 底部接第 2 列自下而上 → 顶部接第 3 列自上而下… */
    private makeSnakeCells(cfg: LevelConfig): { r: number; c: number }[] {
        const list: { r: number; c: number }[] = [];
        for (let c = 0; c < cfg.gridCols; c++) {
            for (let k = 0; k < cfg.gridRows; k++) {
                const r = (c % 2 === 0) ? k : (cfg.gridRows - 1 - k);
                if (this.shapeOK(cfg, r, c)) list.push({ r, c });
            }
        }
        return list;
    }

    /**
     * 蛇形补位：把爆破点登记为"脏位"，攒一批后统一补位——
     * 沿 S 型路径，整串泡泡前移 k 格，起点同时补入 k 个新泡泡。
     */
    private snakeRefill(node: Node) {
        node.destroy();
        const idx = this.bubbleList.indexOf(node);
        if (idx >= 0) this.bubbleList.splice(idx, 1);
        this.snakeDirty.push(node);
        if (!this.snakeBusy) {
            this.snakeBusy = true;
            this.scheduleOnce(() => {
                try { this.runSnakeBatch(); }
                catch (e) { this.cap('snake batch err', e); this.snakeBusy = false; }
            }, 0.04);
        }
    }

    private runSnakeBatch() {
        const cfg = LEVELS[this.currentLevel];
        const cells = this.snakeCells;
        const k = this.snakeDirty.length;
        this.snakeDirty.length = 0;
        if (k === 0 || cells.length === 0) {
            this.snakeBusy = false;
            return;
        }
        // 存活泡泡按当前路径序号排序，整体向后顺延 k 格（顺序不变）
        const live = this.bubbleList.filter((b) => {
            if (!b.isValid) return false;
            const c = b.getComponent(Bubble);
            return !!c && !c.isPopped && (b as any).__pi !== undefined;
        }).sort((a, b) => ((a as any).__pi as number) - ((b as any).__pi as number));
        const stepDelay = 0.006;
        let lastDelay = 0;
        live.forEach((nd, idx) => {
            const newPi = k + idx;
            (nd as any).__pi = newPi;
            const cell = cells[newPi];
            const targetPos = this.gridPos(cfg, cell.r, cell.c);
            const delay = idx * stepDelay;
            lastDelay = Math.max(lastDelay, delay);
            this.scheduleOnce(() => {
                if (nd.isValid) {
                    tween(nd).to(0.08, { position: targetPos }, { easing: 'quadIn' }).start();
                }
            }, delay);
        });
        // 起点一次补入 k 个新泡泡（沿 S 起点淡入）
        const startPos = this.gridPos(cfg, cells[0].r, cells[0].c);
        for (let j = 0; j < k; j++) {
            const cell = cells[j];
            const target = this.gridPos(cfg, cell.r, cell.c);
            const nb = this.createBubble(new Vec3(startPos.x, startPos.y, 0), cfg, 0.95);
            this.bubbleContainer.addChild(nb);
            this.bubbleList.push(nb);
            (nb as any).__pi = j;
            nb.setScale(0.05, 0.05, 1);
            const delay = j * 0.015;
            lastDelay = Math.max(lastDelay, delay);
            this.scheduleOnce(() => {
                if (!nb.isValid) return;
                tween(nb).parallel(
                    tween().to(0.1, { position: target }, { easing: 'quadOut' }),
                    tween().to(0.1, { scale: new Vec3(0.95, 0.95, 1) }, { easing: 'quadOut' }),
                ).start();
            }, delay);
        }
        // 防卡关：目标色缺失时，让最后一个补位泡泡变成目标色
        const tk = this.queue[this.queueIdx];
        if (tk && !this.hasLiveColor(tk)) {
            const nb = this.bubbleList[this.bubbleList.length - 1];
            this.scheduleOnce(() => {
                if (nb && nb.isValid) {
                    const c = nb.getComponent(Bubble);
                    if (c) c.setColor(tk);
                }
            }, lastDelay + 0.1);
        }
        this.scheduleOnce(() => {
            try {
                if (this.snakeDirty.length > 0) this.runSnakeBatch();
                else this.snakeBusy = false;
            } catch (e) {
                this.cap('snake tail err', e);
                this.snakeBusy = false;
            }
        }, lastDelay + 0.15);
    }

    private hasLiveColor(key: string): boolean {
        return this.bubbleList.some((b) => {
            if (!b.isValid) return false;
            const c = b.getComponent(Bubble);
            return !!c && !c.isPopped && !c.changing && !c.rainbow && c.color === key;
        });
    }

    /** 防卡关核心：保证当前目标色在棋盘上一定存在（只认静态普通泡泡，变色/彩虹不算） */
    private ensureTargetColorAvailable() {
        const cfg = LEVELS[this.currentLevel];
        // 重力关：不通过“随机改色”保证目标色，而是由重力补位把目标色带进来
        if (cfg.gravity) return;
        const target = this.queue[this.queueIdx];
        if (!target) return;
        if (this.hasLiveColor(target)) return;
        // 找一个普通活泡泡转换为目标色
        const dup = this.bubbleList.find((b) => {
            if (!b.isValid) return false;
            const c = b.getComponent(Bubble);
            return !!c && !c.isPopped && !c.changing && !c.rainbow
                && c.color !== target && cfg.colors.includes(c.color);
        });
        if (dup) dup.getComponent(Bubble)!.setColor(target);
    }

    /**
     * 选色：优先当前目标色（缺失时），否则在“排除刚爆掉的颜色”中选场上数量最少的颜色，
     * 既保持配色均衡，又避免连锁后连续补出同色泡泡。
     */
    private pickSpawnColor(cfg: LevelConfig, avoid?: string): string {
        const counts: Record<string, number> = {};
        for (const key of cfg.colors) counts[key] = 0;
        for (const b of this.bubbleList) {
            if (!b.isValid) continue;
            const c = b.getComponent(Bubble);
            if (c && !c.isPopped && !c.changing && !c.rainbow && counts[c.color] !== undefined) {
                counts[c.color]++;
            }
        }
        const target = this.queue[this.queueIdx];
        if (target && counts[target] === 0) return target;
        const pool = avoid ? cfg.colors.filter((k) => k !== avoid) : cfg.colors;
        const usable = pool.length > 0 ? pool : cfg.colors;
        let best: string[] = [];
        let min = Number.MAX_SAFE_INTEGER;
        for (const key of usable) {
            if (counts[key] < min) { min = counts[key]; best = [key]; }
            else if (counts[key] === min) best.push(key);
        }
        return best[randomRangeInt(0, best.length)] || cfg.colors[0];
    }

    /** 生成均衡的颜色序列（各颜色数量差不超过 1），再打乱顺序 */
    private makeBalancedColors(cfg: LevelConfig, count: number): string[] {
        const out: string[] = [];
        const n = cfg.colors.length;
        for (let i = 0; i < count; i++) out.push(cfg.colors[i % n]);
        return this.shuffled(out);
    }

    /** 变色泡泡迁移：每隔 CHANGING_MOVE_INTERVAL 秒，把场上变色泡泡挪到随机新泡泡上 */
    private relocateChangingBubbles() {
        if (!this.playing) return;
        const cfg = LEVELS[this.currentLevel];
        if (!cfg.changing) return;
        const changingNodes = this.bubbleList.filter((b) => {
            if (!b.isValid) return false;
            const c = b.getComponent(Bubble);
            return !!c && !c.isPopped && c.changing;
        });
        if (changingNodes.length === 0) return;
        // 候选：未破裂的普通泡泡（非变色/非彩虹），洗牌后依次取用保证目标互不重复
        const candidates = this.shuffled(this.bubbleList.filter((b) => {
            if (!b.isValid) return false;
            const c = b.getComponent(Bubble);
            return !!c && !c.isPopped && !c.changing && !c.rainbow;
        }));
        let ci = 0;
        for (const old of changingNodes) {
            if (ci >= candidates.length) break;
            const next = candidates[ci++];
            // 旧位还原为普通颜色，新位开始变色循环（迁移不改变变色泡泡数量）
            old.getComponent(Bubble)!.setColor(cfg.colors[randomRangeInt(0, cfg.colors.length)]);
            next.getComponent(Bubble)!.setChanging();
        }
        // 迁移可能吃掉最后一个目标色泡泡——补回
        this.ensureTargetColorAvailable();
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
        // 单个当前目标：直接使用与棋盘泡泡相同的贴图，保证颜色/质感完全一致
        this.targetStrip.removeAllChildren();
        this.targetSlots.length = 0;
        const slot = new Node('Target');
        slot.layer = Layers.Enum.UI_2D;
        slot.addComponent(UITransform).setContentSize(52, 52);
        slot.setPosition(0, 0, 0);
        // 白色高亮环（在泡泡贴图下层）
        const ring = new Node('Ring');
        ring.layer = Layers.Enum.UI_2D;
        ring.addComponent(UITransform).setContentSize(64, 64);
        const g = ring.addComponent(Graphics);
        g.lineWidth = 3.5;
        g.strokeColor = new Color(255, 255, 255, 255);
        g.circle(0, 0, 24);
        g.stroke();
        slot.addChild(ring);
        const sp = new Node('Bubble');
        sp.layer = Layers.Enum.UI_2D;
        sp.addComponent(UITransform).setContentSize(52, 52);
        const spr = sp.addComponent(Sprite);
        spr.sizeMode = Sprite.SizeMode.CUSTOM;
        spr.trim = false;
        this.targetSprite = spr;
        slot.addChild(sp);
        this.targetStrip.addChild(slot);
        this.targetSlots.push(slot);
        this.highlightCurrent();
    }

    private highlightCurrent() {
        if (this.targetSlots.length === 0 || !this.targetSprite) return;
        const key = this.queue[this.queueIdx];
        if (!key) return;
        const frame = BUBBLE_FRAMES[key];
        if (frame) {
            this.targetSprite.spriteFrame = frame;
            this.targetSprite.color = Color.WHITE;
        } else if (COLORS[key]) {
            // 贴图尚未加载完时用纯色兜底
            this.targetSprite.spriteFrame = null;
            this.targetSprite.color = COLORS[key].tint;
        }
    }

    private advanceQueue() {
        try {
            this.queueIdx++;
            const cfg = LEVELS[this.currentLevel];
            this.remainLabel.string = `Left ${Math.max(cfg.targetCount - this.queueIdx, 0)}`;
        } catch (e) {
            this.cap('advance err', e);
        }
        // 以下表现层/兜底逻辑单独保护，异常不影响进度数字
        try { this.highlightCurrent(); } catch (e) { this.cap('advance ui err', e); }
        try { this.ensureTargetColorAvailable(); } catch (e) { this.cap('advance ensure err', e); }
    }

    // ---------------- 交互 ----------------

    onTouch(event: EventTouch) {
        try {
            // 浏览器要求首次交互后才能播放音频：这里补一次 BGM 播放
            this.startBgm();
            if (!this.playing) return;
            const cfg = LEVELS[this.currentLevel];
            const target = this.queue[this.queueIdx];
            const uiPos: Vec2 = event.getUILocation();
            const local = this.bubbleContainer
                .getComponent(UITransform)!
                .convertToNodeSpaceAR(new Vec3(uiPos.x, uiPos.y, 0));
            let wrongTap = false;
            // 用快照遍历：击破时会同步补入新泡泡，避免本次触摸把新泡泡一并点掉
            for (const bubble of this.bubbleList.slice()) {
                const comp = bubble.getComponent(Bubble);
                if (!comp || comp.isPopped) continue;
                // 刚补位上来的新泡泡在 200ms 内不再响应（避免同一次滑动把它立刻又点掉）
                const rebornAt = (bubble as any).__rebornAt as number | undefined;
                if (rebornAt && Date.now() - rebornAt < GameManager.REBORN_GUARD_MS) continue;
                const scale = bubble.scale.x;
                const pos = bubble.position;
                const dx = local.x - pos.x;
                const dy = local.y - pos.y;
                const r = this.bubbleRadius * scale;
                if (dx * dx + dy * dy <= r * r) {
                    if (comp.locked) {
                        // 锁定泡泡：先炸掉相邻任意泡泡才能解锁
                        comp.shake();
                        continue;
                    }
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
            this.cap('touch err', e);
        }
    }

    onBubblePop(pos: Vec3, node: Node, colorKey: string, isRainbow: boolean) {
        try {
            const cfg = LEVELS[this.currentLevel];
            const target = this.queue[this.queueIdx];
            const matched = isRainbow || colorKey === target;
            const fromChain = !!(node as any).__chain;
            (node as any).__chain = false;
            // 看门狗计时起点：若 450ms 后该格仍是击破态/透明态，update 会强制整格复位
            (node as any).__popT = Date.now();

            if (fromChain) {
                // 连锁带出的消除：只做表现，不计入目标队列推进、不判错
                this.chainPopCount++;
                // 一次点击引爆一片：音高随第几颗顺次爬升，配合震动做「连环爆」的感觉
                this.playClip(colorKey, 1.15 + Math.min(this.chainPopCount, 10) * 0.03);
                this.shakeScreen(3 + Math.min(this.chainPopCount, 9));
                if (this.chainPopCount % 4 === 0) this.haptic('light');
                this.addScore(5);   // 连锁带出的每颗都是纯收益
            } else if (matched) {
                // 连击：先结算本次连击，再按连击数升调（每连一次升半音，最多 7 个半音）
                this.registerHit();
                const pitch = (isRainbow ? 1.5 : COLORS[colorKey].pitch) * this.comboPitchFactor();
                this.playClip(isRainbow ? RAINBOW_AUDIO : colorKey, pitch);
                this.updateComboLabel();
                this.playComboChime();
                // 分数：基础 10 分 + 连击加成（连得越久单次越值钱）
                this.addScore(10 + Math.min(this.combo, 10) * 2);

                if (cfg.timeBonus > 0 && this.timerLeft > 0) {
                    this.timerLeft = Math.min(this.timerLeft + cfg.timeBonus, cfg.timeLimit);
                    this.timerLabel.string = `Time ${Math.ceil(this.timerLeft)}`;
                }

                this.advanceQueue();

                // 彩虹泡泡规则：用掉后场上即无彩虹，需连续正确点击 12 个
                // （连锁带出的不算点击；捏错会在 registerWrong 中清零）
                if (isRainbow) {
                    this.rainbowNode = null;
                    this.rainbowStreak = 0;
                } else if (cfg.rainbow && !this.isRainbowActive()) {
                    this.rainbowStreak++;
                    // 不显示“蓄力进度”，彩虹即将出现时仅轻提示 1 秒，不打断游戏
                    if (this.rainbowStreak >= RAINBOW_STREAK_NEED) this.queueRainbowIntro();
                }
                // 连锁泡泡：上下左右同色一起消除（不影响队列推进）
                if (cfg.chain && !isRainbow) this.chainSameColorAdjacent(node, colorKey);
            } else {
                this.playClip('wrong', 0.55);
                this.registerWrong();
                this.addScore(-5);
                if (cfg.timeLimit > 0) {
                    this.timerLeft = Math.max(0, this.timerLeft - 1);
                    this.timerLabel.string = `Time ${Math.ceil(this.timerLeft)}`;
                }
            }

            // 任意泡泡爆破都会解锁相邻的锁定泡泡
            this.unlockNeighbors(node);

            // 刷新（关键：先补位，粒子异常不能阻塞补位）
            if (cfg.gravity) {
                // 重力补位：登记到逐帧队列，由 update 串行执行
                try {
                    this.spawnPopGhost(node, isRainbow ? 'rainbow' : colorKey);
                    this.gravityQueue.push({ node, avoid: colorKey, at: Date.now() + 60 });
                } catch (e) {
                    this.cap('refill err', e);
                }
            } else if (cfg.dynamic) {
                if (isRainbow) {
                    // 彩虹：立刻在该位置生成一个“新的随机普通泡泡”补位
                    this.replaceRainbowWithNormal(node, cfg);
                } else {
                    // 同步补位：先放一个残影播放爆破动画，本体立刻复位成新泡泡
                    this.spawnPopGhost(node, colorKey);
                    this.refillDynamicNow(node, colorKey);
                }
            }

            // 击破表现：彩色迷你泡泡（装饰，独立兜底）
            try {
                const scale = node.scale.x;
                this.spawnMiniBubbles(pos, scale, isRainbow ? 'white' : colorKey);
            } catch (e) {
                this.cap('vfx err', e);
            }

            if (this.queueIdx >= cfg.targetCount) {
                this.completeLevel();
            }
        } catch (e) {
            this.cap('pop err', e);
        }
    }

    /**
     * 彩虹泡泡爆破后：立刻在同一个格子生成一个全新的随机普通泡泡；
     * 旧彩虹节点保留淡出动画，短暂后销毁（不占用格位）。
     */
    private replaceRainbowWithNormal(node: Node, cfg: LevelConfig) {
        try {
            if (!node.isValid) return;
            if (this.rainbowNode === node) this.rainbowNode = null;
            const pos = node.position.clone();
            const scale = node.scale.x;
            const cell = (node as any).__cell;
            // 旧彩虹节点的爆破表现交给残影（立即销毁本体，不依赖定时器）
            this.spawnPopGhost(node, 'rainbow');
            node.destroy();
            const dead = this.bubbleList.indexOf(node);
            if (dead >= 0) this.bubbleList.splice(dead, 1);
            const nb = this.createBubble(pos, cfg, scale);
            const comp = nb.getComponent(Bubble);
            if (comp) comp.setColor(this.pickSpawnColor(cfg, 'rainbow'));
            this.bubbleContainer.addChild(nb);
            this.bubbleList.push(nb);
            (nb as any).__cell = cell ? { r: cell.r, c: cell.c } : undefined;
            (nb as any).__rebornAt = Date.now();
            // 小弹出动画，明确“新泡泡顶上来”
            nb.setScale(scale * 0.4, scale * 0.4, 1);
            tween(nb).to(0.12, { scale: new Vec3(scale, scale, 1) }, { easing: 'backOut' }).start();
            // 防卡关：若当前目标色不在场上，校正一个泡泡为目标色
            this.ensureTargetColorAvailable();
        } catch (e) {
            this.cap('rainbow replace err', e);
        }
    }

    /** 判定两个泡泡是否上下左右相邻（基于格距 92） */
    private isNeighborNode(a: Node, b: Node): boolean {
        const CELL = 92;
        const dx = Math.abs(a.position.x - b.position.x);
        const dy = Math.abs(a.position.y - b.position.y);
        return (dx <= CELL * 0.5 && dy <= CELL * 1.2) || (dy <= CELL * 0.5 && dx <= CELL * 1.2);
    }

    /** 连锁泡泡：以点击的泡泡为起点，四方向扩散同色泡泡一起消除（最多 12 个） */
    private chainSameColorAdjacent(from: Node, colorKey: string) {
        try {
            const found: Node[] = [];
            const visited = new Set<Node>([from]);
            const queue: Node[] = [from];
            while (queue.length > 0 && found.length < 12) {
                const cur = queue.shift()!;
                for (const other of this.bubbleList) {
                    if (!other.isValid || visited.has(other)) continue;
                    const c = other.getComponent(Bubble);
                    if (!c || c.isPopped || c.changing || c.rainbow || c.locked) continue;
                    if (c.color !== colorKey) continue;
                    if (!this.isNeighborNode(cur, other)) continue;
                    visited.add(other);
                    found.push(other);
                    queue.push(other);
                }
            }
            found.forEach((n, i) => {
                // 交给 update 的逐帧队列执行：链式爆破解锁/补位不会被丢调度
                this.chainQueue.push({ node: n, at: Date.now() + 50 * (i + 1) });
            });
        } catch (e) {
            this.cap('chain err', e);
        }
    }

    /** 解锁：任意泡泡爆破后，其相邻的锁定泡泡解锁 */
    private unlockNeighbors(node: Node) {
        try {
            for (const other of this.bubbleList) {
                if (other === node || !other.isValid) continue;
                const c = other.getComponent(Bubble);
                if (!c || c.isPopped || !c.locked) continue;
                if (!this.isNeighborNode(node, other)) continue;
                c.setLocked(false);
                const s = other.scale.x;
                tween(other)
                    .to(0.08, { scale: new Vec3(s * 1.15, s * 1.15, 1) }, { easing: 'quadOut' })
                    .to(0.1, { scale: new Vec3(s, s, 1) }, { easing: 'quadIn' })
                    .start();
            }
        } catch (e) {
            this.cap('unlock err', e);
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
        try {
            if (!this.playing) return;
            this.mistakes++;
            this.missLabel.color = this.mistakes >= 3 ? COLOR_WARN : COLOR_GRAY;
            this.drawMissDots(this.mistakes);
            this.rainbowStreak = 0;
            if (this.mistakes >= MISTAKE_LIMIT) this.failLevel();
        } catch (e) {
            this.cap('wrong err', e);
        }
    }

    private failLevel() {
        try {
            if (!this.playing) return;
            this.playing = false;
            this.showOverlay('Challenge Failed', `You missed ${MISTAKE_LIMIT} times. Try again!`, [{
                label: 'Retry',
                action: () => {
                    this.hideOverlay();
                    this.gotoLevel(this.currentLevel);
                },
            }]);
            this.showHomeOnOverlay();
        } catch (e) {
            this.cap('fail err', e);
        }
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
        // 登场提示统一由 queueRainbowIntro 负责（开局登场不打断节奏）
        // 彩虹转换可能吃掉最后一个目标色泡泡——补回
        this.ensureTargetColorAvailable();
    }

    /**
     * 彩虹泡泡登场提示：不打断游戏、不弹确认框，
     * 只显示 1 秒轻提示，同时让它立即登场。
     */
    private queueRainbowIntro() {
        this.spawnRainbow();
        this.showTip('A Rainbow Bubble appeared — it counts as any color!', 1);
    }

    // ---------------- 特殊泡泡提示 ----------------

    /** 特殊泡泡首次出现时的说明条（一次提示一条，自动排队播放） */
    private queueSpecialTips(cfg: LevelConfig) {
        const seen = loadSave().intro || [];
        const list: { kind: string; text: string; sub: string }[] = [];
        // 全流程只做一次：第二/第三章再遇到就不再打断节奏
        if (cfg.rainbow && seen.indexOf('rainbow') < 0) list.push({ kind: 'rainbow', text: 'Rainbow Bubble', sub: 'Counts as any target color' });
        if (cfg.chain && seen.indexOf('chain') < 0) list.push({ kind: 'chain', text: 'Chain Bubble', sub: 'Pop it and adjacent same-color bubbles burst too' });
        if (cfg.locked && seen.indexOf('locked') < 0) list.push({ kind: 'locked', text: 'Frozen Bubble', sub: "Can't pop it — burst any neighbor to thaw it" });
        if (cfg.changing && seen.indexOf('changing') < 0) list.push({ kind: 'changing', text: 'Shifting Bubble', sub: 'Its color keeps changing — pop it when it matches the target' });
        this.spotQueue = list;
        this.tipTimer = 0;
    }

    /** 记录某种特殊机制已经做过首次重点提示 */
    private markIntroSeen(kind: string) {
        try {
            const save = loadSave();
            const list = Array.isArray(save.intro) ? save.intro : [];
            if (list.indexOf(kind) >= 0) return;
            list.push(kind);
            save.intro = list;
            writeSave(save);
        } catch (e) {
            this.cap('intro save err', e);
        }
    }

    private showTip(text: string, dur = 3.6) {
        if (!this.tipCard || !this.tipCard.isValid) return;
        this.tipLabel.string = text;
        this.tipCard.active = true;
        const op = this.tipCard.getComponent(UIOpacity)!;
        Tween.stopAllByTarget(op);
        op.opacity = 0;
        tween(op).to(0.18, { opacity: 255 }).start();
        this.tipTimer = dur;
    }

    private hideTip() {
        if (!this.tipCard || !this.tipCard.isValid) return;
        const op = this.tipCard.getComponent(UIOpacity)!;
        Tween.stopAllByTarget(op);
        tween(op)
            .to(0.2, { opacity: 0 })
            .call(() => {
                // 期间若又来了新提示，不要把它关掉
                if (this.tipCard.isValid && this.tipTimer <= 0) this.tipCard.active = false;
            })
            .start();
    }

    // ---------------- 通关 / 时间到 / 存档 ----------------

    /** 在结算/失败/超时弹层上启用第三颗按钮：返回主菜单（回到开始界面） */
    private showHomeOnOverlay() {
        this.btnC.active = true;
        this.labelC.string = 'Home';
        this.actionC = () => {
            this.hideOverlay();
            this.showTitle();
        };
        this.applyOverlayStyle(this.btnC, this.labelC, 'ghost');
    }

    private completeLevel() {
        if (!this.playing) return;
        this.playing = false;
        // CrazyGames：通关上报 happy time（可选事件，用于平台算法）
        this.cgEvent('happyTime');
        const cfg = LEVELS[this.currentLevel];

        const save = loadSave();
        save.bestCombo = Math.max(save.bestCombo, this.maxComboThisLevel);
        // 星级与最高分（按失误数评星：0-1 失误 3 星，2-3 失误 2 星，其余 1 星）
        const earnedStars = this.starsForLevel();
        if (!save.stars) save.stars = {};
        if (!save.bestScores) save.bestScores = {};
        const lvKey = String(this.currentLevel);
        save.stars[lvKey] = Math.max(save.stars[lvKey] || 0, earnedStars);
        save.bestScores[lvKey] = Math.max(save.bestScores[lvKey] || 0, this.score);
        const group = chapterGroupOf(this.currentLevel);
        if (group === 'tutorial') {
            if (this.currentLevel === 1) save.tutorialsDone = true;
        } else if (group === 'ch1') {
            if (!save.ch1.includes(this.currentLevel)) save.ch1.push(this.currentLevel);
            save.lastChapter = 1;
        } else {
            if (!save.ch2.includes(this.currentLevel)) save.ch2.push(this.currentLevel);
            save.lastChapter = 2;
        }
        writeSave(save);
        this.drawProgress();

        const showResult = () => {
        // 章节内顺序推进
        if (group === 'tutorial') {
            if (this.currentLevel === 0) {
                this.showOverlay('Level Complete!', `${cfg.outro}\nScore ${this.score} · Best combo ${this.maxComboThisLevel}`, [{
                    label: 'Next',
                    action: () => { this.hideOverlay(); this.gotoLevel(1); },
                }], false, earnedStars);
                this.showHomeOnOverlay();
            } else {
                this.showOverlay('Tutorial Complete!', `Welcome to the bubble world.\nScore ${this.score} · Best combo ${this.maxComboThisLevel}`, [{
                    label: 'Select Chapter',
                    action: () => { this.hideOverlay(); this.showChapterSelect(); },
                }], false, earnedStars);
                this.showHomeOnOverlay();
            }
            return;
        }
        const list = group === 'ch1' ? STATIC_LEVELS : DYNAMIC_LEVELS;
        const pos = list.indexOf(this.currentLevel);
        if (pos >= 0 && pos < list.length - 1) {
            this.showOverlay('Level Complete!', `${cfg.outro}\nScore ${this.score} · Best combo ${this.maxComboThisLevel}`, [{
                label: 'Next Level',
                action: () => { this.hideOverlay(); this.gotoLevel(list[pos + 1]); },
            }], false, earnedStars);
            this.showHomeOnOverlay();
            return;
        }
        // 该章最后一关
        const chapterName = group === 'ch1' ? 'Chapter 1' : 'Chapter 2';
        if (group === 'ch1') {
            this.showOverlay(`${chapterName} Complete!`, `${cfg.outro}\nScore ${this.score} · Best combo ${this.maxComboThisLevel}`, [{
                label: 'Enter Chapter 2',
                action: () => {
                    this.hideOverlay();
                    const s = loadSave();
                    s.lastChapter = 2;
                    writeSave(s);
                    const next = this.firstIncompleteIn(s, DYNAMIC_LEVELS);
                    this.gotoLevel(next === null ? DYNAMIC_LEVELS[0] : next);
                },
            }, {
                label: 'Play Again',
                action: () => { this.hideOverlay(); this.gotoLevel(this.currentLevel); },
            }], false, earnedStars);
            this.showHomeOnOverlay();
        } else {
            this.showOverlay(`${chapterName} Complete!`, `${cfg.outro}\nScore ${this.score} · Best combo ${this.maxComboThisLevel}`, [{
                label: 'Play Again',
                action: () => { this.hideOverlay(); this.gotoLevel(this.currentLevel); },
            }], false, earnedStars);
            this.showHomeOnOverlay();
        }
        };
        // 演出顺序：成功庆祝提示 → 剩余泡泡集体爆破 → 结算面板
        this.showSuccessToast(() => this.burstAllRemaining(showResult));
    }

    /** 目标全部完成时的庆祝动效：大字 + 柔光 + 三色光环 + 彩色泡泡迸发 */
    private showSuccessToast(onDone: () => void) {
        try {
            const node = new Node('SuccessToast');
            node.layer = Layers.Enum.UI_2D;
            node.addComponent(UITransform).setContentSize(420, 240);
            node.setPosition(0, 60, 0);
            this.node.addChild(node);
            const op = node.addComponent(UIOpacity);
            op.opacity = 0;

            // 柔光底（保证白色背景上文字清晰、又不显得方）
            const glow = new Node('Glow');
            glow.layer = Layers.Enum.UI_2D;
            glow.addComponent(UITransform).setContentSize(320, 320);
            const gg = glow.addComponent(Graphics);
            for (let i = 6; i >= 1; i--) {
                gg.fillColor = new Color(255, 255, 255, 26 * (7 - i));
                gg.circle(0, 0, 34 * i);
                gg.fill();
            }
            node.addChild(glow);

            // 主体大字
            const title = this.makeLabelOn(node, 'All Done!', 56, new Color(59, 123, 245, 255), new Vec3(0, 10, 0));
            title.node.getComponent(UITransform)!.setContentSize(420, 70);
            const sub = this.makeLabelOn(node, 'All remaining bubbles are bursting', 20, new Color(150, 172, 194, 255), new Vec3(0, -40, 0));
            sub.node.getComponent(UITransform)!.setContentSize(420, 28);

            // 三色扩散光环（错峰）
            const ringColors = [new Color(59, 123, 245, 120), new Color(255, 77, 109, 110), new Color(255, 201, 60, 120)];
            ringColors.forEach((rc, idx) => {
                const ring = new Node('Ring');
                ring.layer = Layers.Enum.UI_2D;
                ring.addComponent(UITransform).setContentSize(240, 240);
                const rg = ring.addComponent(Graphics);
                rg.lineWidth = 5;
                rg.strokeColor = rc;
                rg.circle(0, 0, 44);
                rg.stroke();
                node.addChild(ring);
                const rop = ring.addComponent(UIOpacity);
                ring.setScale(0.5, 0.5, 1);
                tween(ring)
                    .delay(idx * 0.1)
                    .parallel(
                        tween().to(0.6, { scale: new Vec3(2.3, 2.3, 1) }, { easing: 'quadOut' }),
                        tween(rop).to(0.6, { opacity: 0 }),
                    )
                    .call(() => { if (ring.isValid) ring.destroy(); })
                    .start();
            });

            // 彩色小泡泡迸发
            const keys = ['red', 'yellow', 'green', 'blue', 'violet'];
            for (let k = 0; k < 14; k++) {
                const mini = new Node('Fx');
                mini.layer = Layers.Enum.UI_2D;
                mini.addComponent(UITransform).setContentSize(34, 34);
                const spr = mini.addComponent(Sprite);
                spr.sizeMode = Sprite.SizeMode.CUSTOM;
                const key = keys[k % keys.length];
                const frame = BUBBLE_FRAMES[key];
                if (frame) { spr.spriteFrame = frame; spr.color = Color.WHITE; }
                else if (COLORS[key]) spr.color = COLORS[key].tint;
                mini.setScale(0.2, 0.2, 1);
                node.addChild(mini);
                const ang = (Math.PI * 2 * k) / 14 + randomRange(-0.15, 0.15);
                const dist = randomRange(100, 170);
                const target = new Vec3(Math.cos(ang) * dist, Math.sin(ang) * dist, 0);
                const dur = randomRange(0.5, 0.7);
                const uop = mini.addComponent(UIOpacity);
                tween(mini)
                    .delay(k * 0.02)
                    .parallel(
                        tween().to(dur, { position: target }, { easing: 'quadOut' }),
                        tween().to(dur, { scale: new Vec3(0.05, 0.05, 1) }, { easing: 'quadIn' }),
                    )
                    .call(() => { if (mini.isValid) mini.destroy(); })
                    .start();
                tween(uop).delay(k * 0.02 + dur * 0.45).to(dur * 0.55, { opacity: 0 }).start();
            }

            // 整体弹入 → 停留 → 淡出
            node.setScale(0.7, 0.7, 1);
            tween(node).to(0.32, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
            tween(op).to(0.18, { opacity: 255 }).start();
            this.playClip(RAINBOW_AUDIO, 1.35);
            this.scheduleOnce(() => {
                try {
                    tween(op).to(0.28, { opacity: 0 }).start();
                    tween(node).to(0.28, { position: new Vec3(0, 96, 0) }, { easing: 'quadIn' }).start();
                    this.scheduleOnce(() => {
                        if (node.isValid) node.destroy();
                        onDone();
                    }, 0.3);
                } catch (e) {
                    this.cap('toast out err', e);
                    onDone();
                }
            }, 1.0);
        } catch (e) {
            this.cap('toast err', e);
            onDone();
        }
    }

    /** 通关演出：剩余泡泡逐个爆开（错峰），结束后回调 */
    private burstAllRemaining(done: () => void) {
        // 收尾大爆破：给一次强震动，作为整关的情绪高点
        this.shakeScreen(18);
        this.haptic('heavy');
        const alive = this.bubbleList.filter((n) => {
            if (!n.isValid) return false;
            const c = n.getComponent(Bubble);
            return !!c && !c.isPopped;
        });
        if (alive.length === 0) {
            done();
            return;
        }
        this.playClip(RAINBOW_AUDIO, 1.2);
        alive.forEach((n, i) => {
            this.scheduleOnce(() => {
                try {
                    if (!n.isValid) return;
                    const comp = n.getComponent(Bubble);
                    if (!comp || comp.isPopped) return;
                    const pos = n.position.clone();
                    const scale = n.scale.x;
                    this.spawnMiniBubbles(pos, scale, comp.rainbow ? 'white' : comp.color);
                    if (i % 5 === 0) {
                        this.playClip(comp.rainbow ? RAINBOW_AUDIO : comp.color, 1.0 + (i % 3) * 0.12);
                    }
                    const sp = n.getComponent(Sprite);
                    if (sp) tween(sp).to(0.2, { color: new Color(255, 255, 255, 0) }).start();
                    tween(n)
                        .to(0.2, { scale: new Vec3(scale * 1.25, scale * 1.25, 1) }, { easing: 'quadOut' })
                        .call(() => { if (n.isValid) n.destroy(); })
                        .start();
                } catch (e) {
                    this.cap('burst err', e);
                }
            }, i * 0.03);
        });
        const total = Math.min(1.3, alive.length * 0.03 + 0.4);
        this.scheduleOnce(() => {
            // 收尾：把仍在补位/残留的泡泡一并清掉，保证棋盘清空
            for (const n of this.bubbleList.slice()) {
                if (n.isValid) n.destroy();
            }
            this.bubbleList = this.bubbleList.filter((n) => n.isValid);
            done();
        }, total);
    }

    private timeUp() {
        try {
            if (!this.playing) return;
            this.playing = false;
            this.showOverlay("Time's Up", 'Try again — find your own rhythm.', [{
                label: 'Retry',
                action: () => {
                    this.hideOverlay();
                    this.gotoLevel(this.currentLevel);
                },
            }]);
            this.showHomeOnOverlay();
        } catch (e) {
            this.cap('timeup err', e);
        }
    }

    // ---------------- HUD / 遮罩 ----------------

    private buildHud() {
        // 排版分三块：
        //  顶部中央 = 关卡名 / 目标泡泡 / 剩余   |  右上 = 计时 + 失误  |  左上 = 两个竖排按钮
        //  页面最底部 = 关卡描述（关键词 + 叙事）
        const ink = new Color(58, 86, 112, 255);       // 主文字
        const gray = new Color(138, 160, 182, 255);     // 次级文字
        const faint = new Color(168, 186, 204, 255);    // 描述文字

        // 顶部两块卡片底：关卡名（中上）与右侧信息栏，避免文字直接浮在白底上
        const cardTitle = this.makeHudCard(0, 616, 316, 56, 18);
        const cardStats = this.makeHudCard(248, 556, 200, 176, 22);

        // ---- 顶部中央：关卡名（最大字号，加粗）----
        this.titleLabel = this.makeLabel('', 34, ink, new Vec3(0, 616, 0));
        this.titleLabel.node.getComponent(UITransform)!.setContentSize(420, 46);
        this.titleLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        this.titleLabel.isBold = true;

        // ---- “目标”提示 + 单个目标圆点 + 剩余 ----
        this.targetHint = this.makeLabel('Target', 26, gray, new Vec3(0, 566, 0));
        this.targetBar = new Node('TargetBar');
        this.targetBar.layer = Layers.Enum.UI_2D;
        this.targetBar.addComponent(UITransform).setContentSize(120, 120);
        this.targetBar.setPosition(0, 516, 0);
        this.node.addChild(this.targetBar);
        this.targetStrip = this.targetBar;
        this.remainLabel = this.makeLabel('', 28, gray, new Vec3(0, 456, 0));
        this.remainLabel.node.getComponent(UITransform)!.setContentSize(300, 40);
        this.comboLabel = this.makeLabel('', 46, new Color(255, 110, 150, 255), new Vec3(0, 396, 0));
        this.comboLabel.isBold = true;

        // ---- 右上：计时（大字加粗）+ 失误统计 ----
        this.timerLabel = this.makeLabel('', 38, ink, new Vec3(196, 616, 0));
        this.timerLabel.node.getComponent(UITransform)!.setContentSize(320, 52);
        this.timerLabel.horizontalAlign = Label.HorizontalAlign.RIGHT;
        this.timerLabel.isBold = true;
        this.missLabel = this.makeLabel('Misses', 26, COLOR_GRAY, new Vec3(300, 566, 0));
        this.missLabel.node.getComponent(UITransform)!.setContentSize(180, 36);
        this.missLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        // 分数（右侧，失误点阵下方）
        this.scoreLabel = this.makeLabel('', 24, new Color(120, 150, 178, 255), new Vec3(196, 498, 0));
        this.scoreLabel.node.getComponent(UITransform)!.setContentSize(320, 32);
        this.scoreLabel.horizontalAlign = Label.HorizontalAlign.RIGHT;
        this.scoreLabel.isBold = true;
        const dots = new Node('MissDots');
        dots.layer = Layers.Enum.UI_2D;
        dots.addComponent(UITransform).setContentSize(120, 24);
        dots.setPosition(300, 530, 0);
        this.node.addChild(dots);
        this.missDots = dots.addComponent(Graphics);
        this.drawMissDots(0);

        // ---- 页面最底部：关卡描述 ----
        this.subtitleLabel = this.makeLabel('', 24, gray, new Vec3(0, -524, 0));
        this.subtitleLabel.node.getComponent(UITransform)!.setContentSize(660, 34);
        this.descLabel = this.makeLabel('', 20, faint, new Vec3(0, -564, 0));
        this.descLabel.node.getComponent(UITransform)!.setContentSize(660, 32);
        // 异常提示（屏幕最底部，出现异常时显示，便于真机排查）
        this.errLabel = this.makeLabel('', 15, COLOR_WARN, new Vec3(0, -616, 0));
        this.errLabel.node.getComponent(UITransform)!.setContentSize(680, 24);

        this.hudNodes = [
            cardTitle, cardStats,
            this.titleLabel.node, this.subtitleLabel.node, this.descLabel.node,
            this.remainLabel.node, this.comboLabel.node, this.timerLabel.node,
            this.missLabel.node, this.missDots.node, this.scoreLabel.node,
            this.targetHint.node, this.targetBar,
        ];

        // 左上角关卡内按钮：重新开始 + 返回主界面（竖排、放大）
        this.restartBtn = this.buildCornerButton('Restart', new Vec3(-258, 578, 0));
        this.drawBtnIcon(this.restartBtn, 'restart', new Color(59, 123, 245, 255));
        this.restartBtn.on(Button.EventType.CLICK, () => {
            if (!this.restartBtn.active) return;
            this.gotoLevel(this.currentLevel);
        }, this);
        this.homeBtn = this.buildCornerButton('Home', new Vec3(-258, 506, 0), 'violet');
        this.drawBtnIcon(this.homeBtn, 'home', new Color(124, 92, 255, 255));
        this.homeBtn.on(Button.EventType.CLICK, () => {
            if (!this.homeBtn.active) return;
            this.showTitle();
        }, this);
        // 音乐 / 音效开关（左上按钮列下方，字号小一号以容纳文案）
        this.musicBtn = this.buildCornerButton('Music On', new Vec3(-258, 434, 0), 'blue', 18);
        this.drawBtnIcon(this.musicBtn, 'music', new Color(59, 123, 245, 255));
        this.musicBtn.on(Button.EventType.CLICK, () => { this.toggleMusic(); }, this);
        this.sfxBtn = this.buildCornerButton('Sound On', new Vec3(-258, 362, 0), 'violet', 18);
        this.drawBtnIcon(this.sfxBtn, 'sound', new Color(124, 92, 255, 255));
        this.sfxBtn.on(Button.EventType.CLICK, () => { this.toggleSfx(); }, this);
        this.applyAudioSettings();
        // 初始隐藏（标题屏时由 showOverlay 统一管理）
        this.restartBtn.active = false;
        this.homeBtn.active = false;
        this.musicBtn.active = false;
        this.sfxBtn.active = false;

        this.buildTipCard();
        this.buildOverlay();
        this.buildSpotlight();
    }

    /**
     * 特殊泡泡重点提示：整屏压暗 + 在目标泡泡处挖一个亮洞 + 呼吸光圈 + 说明文字。
     * 提示期间不接受棋盘操作，点一下任意位置继续（点遮罩不会误爆泡泡）。
     */
    private buildSpotlight() {
        const n = new Node('Spotlight');
        n.layer = Layers.Enum.UI_2D;
        this.spotNode = n;
        n.addComponent(UITransform).setContentSize(720, 1280);
        n.setPosition(0, 0, 20);
        this.node.addChild(n);
        n.addComponent(BlockInputEvents);
        n.on(Node.EventType.TOUCH_END, (e: EventTouch) => this.onSpotTap(e), this);

        // 变暗层：用扇形拼出一个带圆洞的“环形暗幕”（不用遮罩，避免不同平台差异）
        const dim = new Node('Dim');
        dim.layer = Layers.Enum.UI_2D;
        dim.addComponent(UITransform).setContentSize(720, 1280);
        this.spotHoleG = dim.addComponent(Graphics);
        n.addChild(dim);

        // 呼吸光圈（在遮罩之上，保证可见）
        const ring = new Node('Ring');
        ring.layer = Layers.Enum.UI_2D;
        ring.addComponent(UITransform).setContentSize(160, 160);
        const rg = ring.addComponent(Graphics);
        rg.lineWidth = 4;
        rg.strokeColor = new Color(255, 255, 255, 235);
        rg.circle(0, 0, 46);
        rg.stroke();
        rg.lineWidth = 2;
        rg.strokeColor = new Color(255, 255, 255, 130);
        rg.circle(0, 0, 54);
        rg.stroke();
        n.addChild(ring);
        this.spotRing = ring;

        // 说明卡
        const card = new Node('SpotCard');
        card.layer = Layers.Enum.UI_2D;
        card.addComponent(UITransform).setContentSize(640, 150);
        n.addChild(card);
        const cg = card.addComponent(Graphics);
        cg.fillColor = new Color(255, 255, 255, 246);
        cg.roundRect(-320, -75, 640, 150, 26);
        cg.fill();
        cg.lineWidth = 2;
        cg.strokeColor = new Color(206, 226, 249, 255);
        cg.roundRect(-320, -75, 640, 150, 26);
        cg.stroke();
        this.spotTitle = this.makeLabelOn(card, '', 26, new Color(46, 74, 102, 255), new Vec3(0, 26, 0));
        this.spotTitle.isBold = true;
        this.spotTitle.node.getComponent(UITransform)!.setContentSize(600, 40);
        this.spotSub = this.makeLabelOn(card, '', 19, new Color(140, 162, 184, 255), new Vec3(0, -26, 0));
        this.spotSub.node.getComponent(UITransform)!.setContentSize(600, 68);
        this.spotSub.lineHeight = 24;
        this.spotSub.node.setPosition(0, -26, 0);
        this.spotCard = card;

        n.active = false;
    }

    /** 找到某种特殊泡泡在场上的位置（用于聚光） */
    private findSpecialTarget(kind: string): Vec3 | null {
        const pick = (fn: (c: Bubble) => boolean) => {
            for (const b of this.bubbleList) {
                if (!b.isValid) continue;
                const c = b.getComponent(Bubble);
                if (c && !c.isPopped && fn(c)) return b.position.clone();
            }
            return null;
        };
        if (kind === 'rainbow') {
            const n = this.rainbowNode;
            return n && n.isValid ? n.position.clone() : null;
        }
        if (kind === 'locked') return pick((c) => c.locked);
        if (kind === 'changing') return pick((c) => c.changing);
        if (kind === 'chain') {
            for (const b of this.bubbleList) {
                if (!b.isValid) continue;
                const c = b.getComponent(Bubble);
                if (!c || c.isPopped || c.locked || c.changing || c.rainbow) continue;
                const near = this.bubbleList.some((o) => {
                    if (o === b || !o.isValid) return false;
                    const d = o.getComponent(Bubble);
                    return !!d && !d.isPopped && !d.locked && d.color === c.color && this.isNeighborNode(b, o);
                });
                if (near) return b.position.clone();
            }
        }
        return null;
    }

    private showSpotlight(kind: string, text: string, sub: string) {
        const pos = this.findSpecialTarget(kind);
        const at = pos || new Vec3(0, 0, 0);
        this.spotAt = at.clone();
        this.drawSpotDim(at.x, at.y, 62);
        this.spotRing.setPosition(at.x, at.y, 0);
        this.spotTitle.string = text;
        this.spotSub.string = `${sub}\nTap anywhere to continue`;
        // 说明卡放在高亮泡泡的另一侧，避免压住它
        this.spotCard.setPosition(0, at.y > 0 ? -470 : 430, 0);
        this.spotNode.active = true;
        this.spotActive = true;
        this.playing = false;
        this.spotPulse = 0;
        this.spotTime = 0;
        this.spotRing.setScale(1, 1, 1);
    }

    /** 点高亮泡泡：既关掉提示，也直接把那颗泡泡点掉（不用点两次） */
    private onSpotTap(e?: EventTouch) {
        try {
            let inside = false;
            if (e && this.spotAt) {
                const uiPos: Vec2 = e.getUILocation();
                const local = this.bubbleContainer
                    .getComponent(UITransform)!
                    .convertToNodeSpaceAR(new Vec3(uiPos.x, uiPos.y, 0));
                inside = Math.hypot(local.x - this.spotAt.x, local.y - this.spotAt.y) <= 56;
            }
            this.dismissSpotlight();
            if (inside) this.onTouch(e!);
        } catch (err) {
            this.cap('spot tap err', err);
        }
    }

    private dismissSpotlight() {
        try {
            if (!this.spotActive) return;
            this.spotActive = false;
            if (this.spotNode && this.spotNode.isValid) this.spotNode.active = false;
            this.playing = true;
            this.spotTime = 0;
        } catch (e) {
            this.cap('spot dismiss err', e);
        }
    }

    /** 画一层“带圆洞的暗幕”：48 个扇形拼成环形，保证洞是真的透明 */
    private drawSpotDim(cx: number, cy: number, holeR: number) {
        const g = this.spotHoleG;
        if (!g) return;
        g.clear();
        g.fillColor = new Color(26, 42, 60, 158);
        const N = 48;
        const OUT = 900;
        for (let i = 0; i < N; i++) {
            const a0 = (i / N) * Math.PI * 2;
            const a1 = ((i + 1) / N) * Math.PI * 2;
            g.moveTo(cx + Math.cos(a0) * holeR, cy + Math.sin(a0) * holeR);
            g.lineTo(cx + Math.cos(a1) * holeR, cy + Math.sin(a1) * holeR);
            g.lineTo(cx + Math.cos(a1) * OUT, cy + Math.sin(a1) * OUT);
            g.lineTo(cx + Math.cos(a0) * OUT, cy + Math.sin(a0) * OUT);
            g.close();
        }
        g.fill();
    }

    /** 特殊泡泡说明条：棋盘上方（泡泡区与顶部提示区之间的空带）一张会淡入淡出的白色小卡片 */
    private buildTipCard() {
        const card = new Node('TipCard');
        card.layer = Layers.Enum.UI_2D;
        card.addComponent(UITransform).setContentSize(620, 60);
        card.setPosition(0, 330, 0);
        this.node.addChild(card);
        const g = card.addComponent(Graphics);
        g.fillColor = new Color(255, 255, 255, 238);
        g.roundRect(-310, -30, 620, 60, 18);
        g.fill();
        g.lineWidth = 2;
        g.strokeColor = new Color(200, 224, 250, 255);
        g.roundRect(-310, -30, 620, 60, 18);
        g.stroke();
        card.addComponent(UIOpacity);
        const lbl = this.makeLabelOn(card, '', 20, new Color(52, 78, 104, 255), new Vec3(0, 0, 0));
        lbl.node.getComponent(UITransform)!.setContentSize(580, 44);
        lbl.lineHeight = 24;
        this.tipLabel = lbl;
        this.tipCard = card;
        card.active = false;
    }

    private setHudVisible(on: boolean) {
        for (const n of this.hudNodes) {
            if (n && n.isValid) n.active = on;
        }
    }

    /** 统一异常上报：写日志 + 屏幕底部提示（便于真机定位“自动重启”的原因） */
    private cap(tag: string, e: any) {
        const detail = (e && (e.message || e.errMsg)) ? (e.message || e.errMsg) : (typeof e === 'string' ? e : '');
        const msg = `${tag}${detail ? ': ' + String(detail).slice(0, 120) : ''}`;
        if (this.errLog.length < 20) this.errLog.push(msg);
        console.error('[BubbleWrap]', msg);
        if (this.errLabel && this.errLabel.isValid) {
            this.errLabel.string = '⚠ ' + msg.slice(0, 80);
        }
    }

    /** 失误点阵：已失误为红点，未失误为浅灰点 */
    private drawMissDots(used: number) {
        if (!this.missDots) return;
        const g = this.missDots;
        g.clear();
        for (let i = 0; i < MISTAKE_LIMIT; i++) {
            g.fillColor = i < used ? COLOR_WARN : new Color(204, 216, 231, 255);
            // 点阵居中在“失误”文字正下方
            g.circle((i - 2) * 19, 0, 7);
            g.fill();
        }
    }

    /** 左上角小按钮：圆角半透明背景 + 居中文字 */
    private buildCornerButton(text: string, pos: Vec3, tint: 'blue' | 'violet' = 'blue', fontSize = 24): Node {
        const node = new Node('CornerBtn');
        node.layer = Layers.Enum.UI_2D;
        const w = 176, h = 56;
        node.addComponent(UITransform).setContentSize(w, h);
        node.setPosition(pos);
        this.node.addChild(node);
        node.addComponent(Graphics);
        const fill = tint === 'blue' ? new Color(233, 243, 255, 245) : new Color(242, 239, 255, 245);
        const stroke = tint === 'blue' ? new Color(203, 226, 255, 255) : new Color(216, 208, 255, 255);
        const textColor = tint === 'blue' ? new Color(59, 123, 245, 255) : new Color(124, 92, 255, 255);
        this.paintCorner(node, w, h, fill, stroke);
        node.addComponent(Button);
        this.hookCornerPress(node, w, h, fill, stroke);
        const lbl = new Node('Label');
        lbl.layer = Layers.Enum.UI_2D;
        lbl.addComponent(UITransform).setContentSize(w, h);
        lbl.setPosition(12, 0, 0);   // 给左侧图标留位置，文字略右移
        node.addChild(lbl);
        const label = lbl.addComponent(Label);
        label.string = text;
        label.fontSize = fontSize;
        label.lineHeight = fontSize;
        label.isBold = true;
        label.color = textColor;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        return node;
    }

    /**
     * HUD 卡片底：浅色圆角底 + 细描边，让顶部信息不再像"悬浮的文字"。
     * 卡片会插在 HUD 节点之前，保证在文字下方。
     */
    private makeHudCard(x: number, y: number, w: number, h: number, r = 18): Node {
        const node = new Node('HudCard');
        node.layer = Layers.Enum.UI_2D;
        node.addComponent(UITransform).setContentSize(w, h);
        node.setPosition(x, y, 0);
        const g = node.addComponent(Graphics);
        g.fillColor = new Color(244, 248, 252, 235);
        g.roundRect(-w / 2, -h / 2, w, h, r);
        g.fill();
        g.lineWidth = 1.5;
        g.strokeColor = new Color(226, 236, 245, 255);
        g.roundRect(-w / 2, -h / 2, w, h, r);
        g.stroke();
        this.node.addChild(node);
        return node;
    }

    /** 按钮上的矢量小图标（不依赖字体）：restart/home/music/sound */
    private drawBtnIcon(node: Node, kind: 'restart' | 'home' | 'music' | 'sound', color: Color) {
        const icon = new Node('Icon');
        icon.layer = Layers.Enum.UI_2D;
        icon.addComponent(UITransform).setContentSize(28, 28);
        icon.setPosition(-68, 0, 0);
        const g = icon.addComponent(Graphics);
        g.lineWidth = 2.6;
        g.strokeColor = color;
        g.fillColor = color;
        if (kind === 'restart') {
            // 逆时针圆弧 + 箭头
            g.moveTo(Math.cos(-Math.PI * 0.35) * 8, Math.sin(-Math.PI * 0.35) * 8);
            g.arc(0, 0, 8, -Math.PI * 0.35, Math.PI * 1.15, false);
            g.stroke();
            g.moveTo(4.5, 6.5);
            g.lineTo(9, 9.6);
            g.lineTo(9.6, 4.4);
            g.close();
            g.fill();
        } else if (kind === 'home') {
            g.moveTo(-9, 0);
            g.lineTo(0, 8.5);
            g.lineTo(9, 0);
            g.stroke();
            g.moveTo(-6.5, -1);
            g.lineTo(-6.5, -8);
            g.lineTo(6.5, -8);
            g.lineTo(6.5, -1);
            g.stroke();
        } else if (kind === 'music') {
            // 两个音符
            g.moveTo(-2, -6);
            g.lineTo(-2, 7);
            g.lineTo(8, 9);
            g.lineTo(8, -3);
            g.stroke();
            g.circle(-4.6, -6.8, 2.8);
            g.fill();
            g.circle(5.4, -3.8, 2.8);
            g.fill();
        } else {
            // 喇叭 + 声波
            g.moveTo(-8, -3);
            g.lineTo(-3, -3);
            g.lineTo(2, -8);
            g.lineTo(2, 8);
            g.lineTo(-3, 3);
            g.lineTo(-8, 3);
            g.close();
            g.fill();
            g.lineWidth = 2.2;
            g.moveTo(5, -4);
            g.arc(5, 0, 4.6, -Math.PI * 0.42, Math.PI * 0.42, false);
            g.stroke();
        }
        node.addChild(icon);
    }

    private paintCorner(node: Node, w: number, h: number, fill: Color, stroke: Color) {
        const g = node.getComponent(Graphics)!;
        g.clear();
        // 底部投影
        g.fillColor = new Color(90, 120, 150, 26);
        g.roundRect(-w / 2, -h / 2 - 2, w, h, 12);
        g.fill();
        g.fillColor = fill;
        g.roundRect(-w / 2, -h / 2, w, h, 12);
        g.fill();
        g.lineWidth = 1.5;
        g.strokeColor = stroke;
        g.roundRect(-w / 2, -h / 2, w, h, 12);
        g.stroke();
    }

    /** 提示/结算页的卡片底：on=false 时只清空（用于选关列表页） */
    private drawOverlayCard(on: boolean, compact = false) {
        const cg = this.overlayCard.getComponent(Graphics)!;
        cg.clear();
        if (!on) return;
        const W = compact ? 360 : 540;
        const H = compact ? 190 : 560;
        const R = compact ? 22 : 36;
        cg.fillColor = new Color(88, 118, 150, 30);
        cg.roundRect(-W / 2, -H / 2 - 3, W, H, R);
        cg.fill();
        cg.fillColor = new Color(255, 255, 255, 255);
        cg.roundRect(-W / 2, -H / 2, W, H, R);
        cg.fill();
        cg.lineWidth = 1.5;
        cg.strokeColor = new Color(227, 238, 249, 255);
        cg.roundRect(-W / 2, -H / 2, W, H, R);
        cg.stroke();
        // 小窗不放顶端蓝色装饰线（更轻、不抢视线）
        if (compact) return;
        cg.fillColor = new Color(59, 123, 245, 255);
        cg.roundRect(-30, H / 2 - 62, 60, 6, 3);
        cg.fill();
    }

    private hookCornerPress(node: Node, w: number, h: number, fill: Color, stroke: Color) {
        const pressed = new Color(
            Math.max(0, fill.r - 18), Math.max(0, fill.g - 16), Math.max(0, fill.b - 12), 255,
        );
        node.on(Node.EventType.TOUCH_START, () => this.paintCorner(node, w, h, pressed, stroke), this);
        node.on(Node.EventType.TOUCH_END, () => this.paintCorner(node, w, h, fill, stroke), this);
        node.on(Node.EventType.TOUCH_CANCEL, () => this.paintCorner(node, w, h, fill, stroke), this);
    }

    private paintRoundBtn(node: Node, w: number, h: number, r: number, fill: Color, stroke: Color, lw: number) {
        const g = node.getComponent(Graphics)!;
        g.clear();
        g.fillColor = fill;
        g.roundRect(-w / 2, -h / 2, w, h, r);
        g.fill();
        if (lw > 0) {
            g.lineWidth = lw;
            g.strokeColor = stroke;
            g.roundRect(-w / 2, -h / 2, w, h, r);
            g.stroke();
        }
    }

    private hookPress(node: Node, w: number, h: number, r: number, pressed: Color, stroke: Color) {
        const normal = new Color(255, 255, 255, 235);
        node.on(Node.EventType.TOUCH_START, () => this.paintRoundBtn(node, w, h, r, pressed, stroke, 1.5), this);
        node.on(Node.EventType.TOUCH_END, () => this.paintRoundBtn(node, w, h, r, normal, stroke, 1.5), this);
        node.on(Node.EventType.TOUCH_CANCEL, () => this.paintRoundBtn(node, w, h, r, normal, stroke, 1.5), this);
    }

    private buildOverlay() {
        this.overlay = new Node('Overlay');
        this.overlay.layer = Layers.Enum.UI_2D;
        this.overlay.addComponent(UITransform).setContentSize(720, 1280);
        this.overlay.setPosition(0, 0, 10);
        this.node.addChild(this.overlay);
        this.overlay.addComponent(BlockInputEvents);
        const g = this.overlay.addComponent(Graphics);
        this.overlayBg = g;
        g.fillColor = new Color(255, 255, 255, 236);
        g.rect(-360, -640, 720, 1280);
        g.fill();

        // 卡片式面板：底投影 + 白卡 + 细描边 + 顶部强调条
        this.overlayCard = new Node('OverlayCard');
        this.overlayCard.layer = Layers.Enum.UI_2D;
        this.overlayCard.addComponent(UITransform).setContentSize(540, 560);
        this.overlayCard.setPosition(0, 20, 0);
        this.overlayCard.addComponent(Graphics);
        this.drawOverlayCard(true);
        this.overlay.addChild(this.overlayCard);

        this.overlayTitle = this.makeLabelOn(this.overlayCard, '', 48, new Color(72, 102, 132, 255), new Vec3(0, 180, 0));
        this.overlayTitle.node.getComponent(UITransform)!.setContentSize(480, 64);
        this.overlayTitle.overflow = Label.Overflow.SHRINK;
        // 星级行（通关时显示，矢量绘制，不依赖字体里的星形字符）
        this.starRow = new Node('StarRow');
        this.starRow.layer = Layers.Enum.UI_2D;
        this.starRow.addComponent(UITransform).setContentSize(240, 60);
        this.starRow.setPosition(0, 238, 0);
        this.starRowG = this.starRow.addComponent(Graphics);
        this.overlayCard.addChild(this.starRow);
        this.starRow.active = false;
        this.overlayDesc = this.makeLabelOn(this.overlayCard, '', 24, new Color(148, 168, 188, 255), new Vec3(0, 90, 0));
        this.overlayDesc.node.getComponent(UITransform)!.setContentSize(480, 140);
        this.overlayDesc.lineHeight = 34;
        this.overlayDesc.overflow = Label.Overflow.SHRINK;

        const resetBtn = this.node.getChildByName('ResetBtn');
        const btnSF = resetBtn ? resetBtn.getComponent(Sprite)!.spriteFrame : null;
        this.btnA = this.buildOverlayButton(btnSF, new Vec3(0, 10, 0));
        this.labelA = this.btnA.getChildByName('Label')!.getComponent(Label)!;
        this.btnB = this.buildOverlayButton(btnSF, new Vec3(0, -80, 0));
        this.labelB = this.btnB.getChildByName('Label')!.getComponent(Label)!;
        this.btnC = this.buildOverlayButton(btnSF, new Vec3(0, -170, 0));
        this.labelC = this.btnC.getChildByName('Label')!.getComponent(Label)!;

        // 选关面板（测试阶段专用）：9 个章节快捷入口
        this.lvGrid = new Node('LevelGrid');
        this.lvGrid.layer = Layers.Enum.UI_2D;
        this.lvGrid.addComponent(UITransform).setContentSize(720, 1100);
        this.lvGrid.setPosition(0, -40, 0);
        this.lvGrid.addComponent(Mask);
        this.scrollView = this.lvGrid.addComponent(ScrollView);
        this.scrollView.horizontal = false;
        this.scrollView.vertical = true;
        this.scrollView.elastic = true;
        this.scrollView.inertia = true;
        this.overlay.addChild(this.lvGrid);
        this.lvGrid.active = false;

        // 选关页底部的“返回主界面”（固定，不随列表滚动）
        this.backBtn = new Node('Back');
        this.backBtn.layer = Layers.Enum.UI_2D;
        this.backBtn.addComponent(UITransform).setContentSize(200, 44);
        this.backBtn.setPosition(0, -608, 0);
        this.backBtn.addComponent(Button);
        const bl = this.makeLabelOn(this.backBtn, 'Home', 20, new Color(110, 130, 150, 255), new Vec3(0, 0, 0));
        bl.node.getComponent(UITransform)!.setContentSize(240, 36);
        this.backBtn.on(Button.EventType.CLICK, () => { this.hideOverlay(); this.showTitle(); }, this);
        this.overlay.addChild(this.backBtn);
        this.backBtn.active = false;

        this.overlay.active = false;
    }

    private buildOverlayButton(spriteFrame: Sprite['spriteFrame'], pos: Vec3): Node {
        const node = new Node('OverlayBtn');
        node.layer = Layers.Enum.UI_2D;
        const w = 250, h = 82, r = 26;
        node.addComponent(UITransform).setContentSize(w, h);
        node.setPosition(pos);
        this.overlay.addChild(node);
        node.addComponent(Graphics);
        node.addComponent(Button);
        node.on(Button.EventType.CLICK, () => {
            const act = node === this.btnA ? this.actionA
                : node === this.btnB ? this.actionB
                : node === this.btnC ? this.actionC
                : null;
            this.hideOverlay();
            act && act();
        }, this);
        const label = this.makeLabelOn(node, '', 32, new Color(86, 116, 146, 255), new Vec3(0, 0, 0));
        label.node.name = 'Label';
        this.applyOverlayStyle(node, label, 'secondary');
        node.on(Node.EventType.TOUCH_START, () => this.paintOverlayPressed(node, true), this);
        node.on(Node.EventType.TOUCH_END, () => this.paintOverlayPressed(node, false), this);
        node.on(Node.EventType.TOUCH_CANCEL, () => this.paintOverlayPressed(node, false), this);
        return node;
    }

    private applyOverlayStyle(node: Node, label: Label, style: 'primary' | 'secondary' | 'ghost') {
        const w = 250, h = 82, r = 26;
        (node as any).__btnStyle = style;
        const g = node.getComponent(Graphics)!;
        g.clear();
        if (style === 'primary') {
            g.fillColor = new Color(90, 120, 150, 30);
            g.roundRect(-w / 2, -h / 2 - 3, w, h, r);
            g.fill();
            g.fillColor = new Color(59, 123, 245, 255);
            g.roundRect(-w / 2, -h / 2, w, h, r);
            g.fill();
            label.color = new Color(255, 255, 255, 255);
        } else if (style === 'secondary') {
            g.fillColor = new Color(255, 255, 255, 250);
            g.roundRect(-w / 2, -h / 2, w, h, r);
            g.fill();
            g.lineWidth = 2;
            g.strokeColor = new Color(203, 224, 248, 255);
            g.roundRect(-w / 2, -h / 2, w, h, r);
            g.stroke();
            label.color = new Color(59, 123, 245, 255);
        } else {
            label.color = new Color(140, 158, 178, 255);
        }
    }

    private paintOverlayPressed(node: Node, pressed: boolean) {
        const style = (node as any).__btnStyle as 'primary' | 'secondary' | 'ghost' | undefined;
        if (!style || style === 'ghost') return;
        const label = node.getChildByName('Label')!.getComponent(Label)!;
        const w = 250, h = 82, r = 26;
        const g = node.getComponent(Graphics)!;
        g.clear();
        if (style === 'primary') {
            g.fillColor = new Color(59, 123, 245, 255);
            g.roundRect(-w / 2, -h / 2, w, h, r);
            g.fill();
            g.fillColor = new Color(255, 255, 255, pressed ? 46 : 0);
            g.roundRect(-w / 2, -h / 2, w, h, r);
            g.fill();
            label.color = new Color(255, 255, 255, 255);
        } else {
            g.fillColor = pressed ? new Color(232, 242, 254, 255) : new Color(255, 255, 255, 250);
            g.roundRect(-w / 2, -h / 2, w, h, r);
            g.fill();
            g.lineWidth = 2;
            g.strokeColor = new Color(203, 224, 248, 255);
            g.roundRect(-w / 2, -h / 2, w, h, r);
            g.stroke();
            label.color = new Color(59, 123, 245, 255);
        }
    }

    private showOverlay(title: string, desc: string, buttons: { label: string; action: () => void }[], compact = false, stars?: number) {
        this.drawOverlayCard(true, compact);
        // 星级行：只在通关结算时显示（小窗模式下永远不显示）
        if (this.starRow && this.starRow.isValid) {
            if (!compact && typeof stars === 'number') {
                this.drawStars(this.starRowG, stars);
                this.starRow.active = true;
            } else {
                this.starRow.active = false;
            }
        }
        // 小窗模式用半透明深色背景，弱化“换页”观感
        if (this.overlayBg) {
            this.overlayBg.clear();
            this.overlayBg.fillColor = compact ? new Color(24, 38, 56, 96) : new Color(255, 255, 255, 236);
            this.overlayBg.rect(-360, -640, 720, 1280);
            this.overlayBg.fill();
        }
        this.setHudVisible(false);
        // 说明条不进 hudNodes（避免被 setHudVisible 强制点亮），这里单独收起
        if (this.tipCard && this.tipCard.isValid) this.tipCard.active = false;
        this.tipQueue.length = 0;
        this.tipTimer = 0;
        // 重点提示同样收起（避免盖在弹层之上）
        this.spotQueue.length = 0;
        if (this.spotActive) {
            this.spotActive = false;
            if (this.spotNode && this.spotNode.isValid) this.spotNode.active = false;
            Tween.stopAllByTarget(this.spotRing);
        }
        this.overlayTitle.string = title;
        this.overlayDesc.string = desc;
        // 普通弹层 / 小窗模式：标题、说明、按钮各自归位
        const card = this.overlayCard.getComponent(UITransform)!;
        if (compact) {
            card.setContentSize(360, 190);
            this.overlayCard.setPosition(0, 20, 0);
            this.overlayTitle.node.setPosition(0, 56, 0);
            this.overlayTitle.fontSize = 24;
            this.overlayDesc.node.setPosition(0, 8, 0);
            this.overlayDesc.fontSize = 16;
            this.overlayDesc.lineHeight = 22;
            this.overlayDesc.node.getComponent(UITransform)!.setContentSize(320, 60);
            this.btnA.setPosition(0, -56, 0);
            this.btnA.setScale(0.62, 0.62, 1);
            this.btnB.setPosition(0, -170, 0);
        } else {
            card.setContentSize(540, 560);
            this.overlayCard.setPosition(0, 20, 0);
            this.overlayTitle.node.setPosition(0, 180, 0);
            this.overlayTitle.fontSize = 48;
            this.overlayTitle.node.getComponent(UITransform)!.setContentSize(480, 64);
            this.overlayTitle.overflow = Label.Overflow.SHRINK;
            this.overlayDesc.node.setPosition(0, 90, 0);
            this.overlayDesc.fontSize = 24;
            this.overlayDesc.lineHeight = 34;
            this.overlayDesc.node.getComponent(UITransform)!.setContentSize(480, 140);
            this.overlayDesc.overflow = Label.Overflow.SHRINK;
            this.overlayDesc.horizontalAlign = Label.HorizontalAlign.CENTER;
            this.overlayDesc.verticalAlign = Label.VerticalAlign.CENTER;
            this.btnA.setPosition(0, 10, 0);
            this.btnA.setScale(1, 1, 1);
            this.btnB.setPosition(0, -80, 0);
        }
        // 遮罩显示时隐藏关卡内按钮
        this.restartBtn.active = false;
        this.homeBtn.active = false;
        if (this.musicBtn) this.musicBtn.active = false;
        if (this.sfxBtn) this.sfxBtn.active = false;
        this.btnA.active = buttons.length > 0;
        this.btnB.active = buttons.length > 1;
        this.labelA.string = buttons[0] ? buttons[0].label : '';
        this.labelB.string = buttons[1] ? buttons[1].label : '';
        this.actionA = buttons[0] ? buttons[0].action : null;
        this.actionB = buttons[1] ? buttons[1].action : null;
        this.applyOverlayStyle(this.btnA, this.labelA, 'primary');
        this.applyOverlayStyle(this.btnB, this.labelB, 'secondary');
        this.applyOverlayStyle(this.btnC, this.labelC, 'ghost');
        this.btnC.active = false;
        this.lvGrid.active = false;
        if (this.backBtn) this.backBtn.active = false;
        this.overlay.active = true;
    }

    private hideOverlay() {
        this.overlay.active = false;
        if (this.playing) this.setHudVisible(true);
        // 遮罩隐藏时恢复关卡内按钮（仅在游戏进行中）
        if (this.playing) {
            this.restartBtn.active = true;
            this.homeBtn.active = true;
            if (this.musicBtn) this.musicBtn.active = true;
            if (this.sfxBtn) this.sfxBtn.active = true;
        }
        this.actionA = null;
        this.actionB = null;
        this.actionC = null;
        this.btnC.active = false;
        this.lvGrid.active = false;
        if (this.backBtn) this.backBtn.active = false;
    }

    /** 测试阶段专用：选关面板 */
    private showLevelSelect() {
        if (!IS_DEV) {
            this.showChapterSelect();
            return;
        }
        this.overlayTitle.string = 'Select Level';
        this.overlayDesc.string = 'Dev tools: jump to any level';
        // 标题固定在屏幕最上方，列表在其下方开始
        this.overlayTitle.node.setPosition(0, 600, 0);
        this.overlayDesc.node.setPosition(0, 552, 0);
        this.overlayTitle.fontSize = 44;
        this.overlayDesc.fontSize = 22;
        this.drawOverlayCard(false);
        this.restartBtn.active = false;
        this.homeBtn.active = false;
        this.btnA.active = false;
        this.btnB.active = false;
        this.btnC.active = false;
        this.lvGrid.removeAllChildren();
        // 内容节点（锚点顶部）：章节增多时自动变高，即可滑动
        const ROW_H = 52;
        const ROW_STEP = 58;
        const HEAD_H = 60;
        const contentH = 60 + (HEAD_H + TUTORIAL_LEVELS.length * ROW_STEP)
            + (HEAD_H + STATIC_LEVELS.length * ROW_STEP)
            + (HEAD_H + DYNAMIC_LEVELS.length * ROW_STEP) + 60;
        const content = new Node('content');
        content.layer = Layers.Enum.UI_2D;
        const cut = content.addComponent(UITransform);
        cut.setContentSize(720, Math.max(contentH, 980));
        cut.setAnchorPoint(0.5, 1);
        content.setPosition(0, 550, 0);
        this.lvGrid.addChild(content);
        this.scrollView.content = content;
        this.scrollView.scrollToTop(0);

        let y = -20;
        const heading = (text: string) => {
            y -= 10;
            const h = this.makeLabelOn(content, text, 25, new Color(104, 128, 152, 255), new Vec3(10, y - 16, 0));
            h.node.getComponent(UITransform)!.setContentSize(560, 30);
            h.overflow = Label.Overflow.CLAMP;
            h.horizontalAlign = Label.HorizontalAlign.LEFT;
            const line = new Node('Divider');
            line.layer = Layers.Enum.UI_2D;
            line.addComponent(UITransform).setContentSize(420, 2);
            line.setPosition(0, y - 28, 0);
            const lg = line.addComponent(Graphics);
            lg.lineWidth = 1.5;
            lg.strokeColor = new Color(230, 238, 246, 255);
            lg.moveTo(-210, 0);
            lg.lineTo(210, 0);
            lg.stroke();
            content.addChild(line);
            y -= HEAD_H;
        };
        const row = (i: number) => {
            const cfg = LEVELS[i];
            const node = new Node(`Lv${i}`);
            node.layer = Layers.Enum.UI_2D;
            node.addComponent(UITransform).setContentSize(640, ROW_H);
            node.setPosition(0, y, 0);
            node.addComponent(Button);
            // 卡片底：每关一行圆角卡片（按下有反馈），不再是纯文字行
            const rg = node.addComponent(Graphics);
            rg.fillColor = new Color(250, 252, 255, 255);
            rg.roundRect(-320, -ROW_H / 2, 640, ROW_H - 8, 16);
            rg.fill();
            rg.lineWidth = 1.5;
            rg.strokeColor = new Color(228, 238, 248, 255);
            rg.roundRect(-320, -ROW_H / 2, 640, ROW_H - 8, 16);
            rg.stroke();
            node.on(Node.EventType.TOUCH_START, () => {
                rg.clear();
                rg.fillColor = new Color(238, 245, 254, 255);
                rg.roundRect(-320, -ROW_H / 2, 640, ROW_H - 8, 16);
                rg.fill();
                rg.strokeColor = new Color(206, 226, 246, 255);
                rg.roundRect(-320, -ROW_H / 2, 640, ROW_H - 8, 16);
                rg.stroke();
            }, this);
            node.on(Node.EventType.TOUCH_END, () => {
                rg.clear();
                rg.fillColor = new Color(250, 252, 255, 255);
                rg.roundRect(-320, -ROW_H / 2, 640, ROW_H - 8, 16);
                rg.fill();
                rg.strokeColor = new Color(228, 238, 248, 255);
                rg.roundRect(-320, -ROW_H / 2, 640, ROW_H - 8, 16);
                rg.stroke();
            }, this);
            const label = this.makeLabelOn(node, `${cfg.num}`, 22,
                new Color(86, 116, 146, 255), new Vec3(10, 0, 0));
            label.node.getComponent(UITransform)!.setContentSize(560, 40);
            label.overflow = Label.Overflow.CLAMP;
            label.horizontalAlign = Label.HorizontalAlign.LEFT;
            // 每关的星级（用矢量星，避免字体缺字形）
            const starsGot = (loadSave().stars || {})[String(i)] || 0;
            const starNode = new Node(`Stars${i}`);
            starNode.layer = Layers.Enum.UI_2D;
            starNode.addComponent(UITransform).setContentSize(140, 28);
            starNode.setPosition(-96, 0, 0);
            const sg = starNode.addComponent(Graphics);
            const R = 11, r2 = 4.6, gap = 30;
            for (let k = 0; k < 3; k++) {
                const cx = (k - 1) * gap;
                const on = k < starsGot;
                sg.fillColor = on ? new Color(255, 196, 46, 255) : new Color(232, 238, 245, 255);
                sg.strokeColor = on ? new Color(240, 168, 26, 255) : new Color(216, 226, 236, 255);
                sg.lineWidth = 1.4;
                for (let t = 0; t < 10; t++) {
                    const rad = t % 2 === 0 ? R : r2;
                    const a = -Math.PI / 2 + (t * Math.PI) / 5;
                    const px2 = cx + Math.cos(a) * rad;
                    const py2 = Math.sin(a) * rad;
                    if (t === 0) sg.moveTo(px2, py2); else sg.lineTo(px2, py2);
                }
                sg.close();
                sg.fill();
                sg.stroke();
            }
            node.addChild(starNode);
            const arrow = this.makeLabelOn(node, '›', 24, new Color(186, 202, 218, 255), new Vec3(300, 0, 0));
            arrow.node.getComponent(UITransform)!.setContentSize(40, 30);
            node.on(Button.EventType.CLICK, () => {
                this.hideOverlay();
                this.gotoLevel(i);
            }, this);
            content.addChild(node);
            y -= ROW_STEP;
        };
        heading('Tutorial');
        TUTORIAL_LEVELS.forEach(row);
        heading('Chapter 1 · Static');
        STATIC_LEVELS.forEach(row);
        heading('Chapter 2 · Dynamic');
        DYNAMIC_LEVELS.forEach(row);
        // 底部返回（固定在屏幕下方，不参与滑动）
        this.backBtn.active = true;
        this.lvGrid.active = true;
        this.overlay.active = true;
    }

    private drawProgress() {
        if (!this.progressG) return;
        this.progressG.clear();
        const save = loadSave();
        const spacing = 42;
        const x0 = -((LEVELS.length - 1) * spacing) / 2;
        for (let i = 0; i < LEVELS.length; i++) {
            const x = x0 + i * spacing;
            this.progressG.fillColor = this.isLevelDone(save, i)
                ? new Color(150, 200, 255, 255)   // 已完成
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
