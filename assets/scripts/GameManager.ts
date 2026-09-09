import {
    _decorator, Component, Node, instantiate, Vec3, Vec2, AudioSource, AudioClip,
    randomRange, randomRangeInt, UITransform, input, Input, EventTouch, tween, Layers,
    Label, Color, Sprite, SpriteFrame, Graphics, Button, BlockInputEvents, resources,
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
const LEVELS: LevelConfig[] = [
    {
        num: '教学1', theme: '认色', keywords: '红黄蓝 · 静态棋盘 · 颜色队列',
        narrative: '在整齐的泡泡纸中，寻找指定颜色。',
        outro: '棋盘开始变化——新的泡泡会不断补上。',
        gridCols: 3, gridRows: 4, shape: 'rect', colors: PALETTE3,
        dynamic: false, gravity: false, rainbow: false, changing: false,
        timeLimit: 0, timeBonus: 0, targetCount: 12,
    },
    {
        num: '教学2', theme: '流动', keywords: '动态刷新 · 红黄蓝 · 持续寻找',
        narrative: '每捏破一个，就会有新的泡泡补上。',
        outro: '泡泡在流动了——现在，时间开始计时。',
        gridCols: 4, gridRows: 5, shape: 'rect', colors: PALETTE3,
        dynamic: true, gravity: false, rainbow: false, changing: false,
        timeLimit: 0, timeBonus: 0, targetCount: 20,
    },
    {
        num: '1-1', theme: '限时', keywords: '倒计时 · 原位动态刷新',
        narrative: '在有限时间里，尽可能完成颜色队列。（第一章）',
        outro: '颜色变多了——注意分辨五色泡泡。',
        gridCols: 5, gridRows: 6, shape: 'rect', colors: PALETTE3,
        dynamic: true, gravity: false, rainbow: false, changing: false,
        timeLimit: 45, timeBonus: 0.8, targetCount: 30,
    },
    {
        num: '1-2', theme: '五彩', keywords: '倒计时 · 原位刷新 · 五色',
        narrative: '颜色增至五种，难度升级。',
        outro: '彩虹泡泡加入了战场。',
        gridCols: 6, gridRows: 7, shape: 'rect', colors: PALETTE5,
        dynamic: true, gravity: false, rainbow: false, changing: false,
        timeLimit: 50, timeBonus: 0.8, targetCount: 42,
    },
    {
        num: '1-3', theme: '彩虹', keywords: '倒计时 · 原位刷新 · 五色 · 彩虹泡泡',
        narrative: '彩虹泡泡能匹配任意颜色，助你完成限时挑战。',
        outro: '第一章通关！准备进入动态世界。',
        gridCols: 6, gridRows: 7, shape: 'rect', colors: PALETTE5,
        dynamic: true, gravity: false, rainbow: true, changing: false,
        timeLimit: 55, timeBonus: 0.8, targetCount: 42,
    },
    {
        num: '2-1', theme: '重力', keywords: '重力补位 · 泡泡下落',
        narrative: '捏破后上方泡泡下落补位，棋盘持续变化。（第二章）',
        outro: '时间也开始追赶了。',
        gridCols: 5, gridRows: 6, shape: 'rect', colors: PALETTE3,
        dynamic: false, gravity: true, rainbow: false, changing: false,
        timeLimit: 0, timeBonus: 0, targetCount: 30,
    },
    {
        num: '2-2', theme: '时空', keywords: '重力补位 · 倒计时',
        narrative: '空间在变化，时间在追赶。（空间 + 时间）',
        outro: '泡泡颜色开始变多了。',
        gridCols: 6, gridRows: 7, shape: 'rect', colors: PALETTE3,
        dynamic: false, gravity: true, rainbow: false, changing: false,
        timeLimit: 50, timeBonus: 0.8, targetCount: 42,
    },
    {
        num: '2-3', theme: '五彩', keywords: '重力补位 · 倒计时 · 五色',
        narrative: '重力加五色，难度升级。',
        outro: '彩虹泡泡将降临动态棋盘。',
        gridCols: 6, gridRows: 7, shape: 'rect', colors: PALETTE5,
        dynamic: false, gravity: true, rainbow: false, changing: false,
        timeLimit: 55, timeBonus: 0.7, targetCount: 42,
    },
    {
        num: '2-4', theme: '爆发', keywords: '重力补位 · 倒计时 · 五色 · 彩虹',
        narrative: '动态棋盘上的最终试炼。',
        outro: '第二章通关！全章完结，圆满落幕。',
        gridCols: 7, gridRows: 7, shape: 'rect', colors: PALETTE5,
        dynamic: false, gravity: true, rainbow: true, changing: false,
        timeLimit: 60, timeBonus: 0.7, targetCount: 49,
    },
];

// 关卡分组：0/1 教学章；2~4 第一章（静态·原位刷新）；5~8 第二章（动态·重力）
const TUTORIAL_LEVELS = [0, 1];
const STATIC_LEVELS = [2, 3, 4];
const DYNAMIC_LEVELS = [5, 6, 7, 8];

// ---------------- 存档 ----------------

interface SaveData {
    version: number;
    tutorialsDone: boolean;   // 两节教学章是否完成
    ch1: number[];            // 第一章（静态）已通关的全局关卡序号
    ch2: number[];            // 第二章（动态）已通关的全局关卡序号
    bestCombo: number;
    lastChapter: 0 | 1 | 2;   // 0=无 1=第一章 2=第二章（用于“继续游戏”）
}

const SAVE_KEY = 'bubblewrap_save_v1';

function defaultSave(): SaveData {
    return { version: 2, tutorialsDone: false, ch1: [], ch2: [], bestCombo: 0, lastChapter: 0 };
}

function chapterGroupOf(index: number): 'tutorial' | 'ch1' | 'ch2' {
    if (index <= 1) return 'tutorial';
    if (index <= 4) return 'ch1';
    return 'ch2';
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
            if (d.version === 2) {
                return {
                    version: 2,
                    tutorialsDone: !!d.tutorialsDone,
                    ch1: Array.isArray(d.ch1) ? d.ch1 : [],
                    ch2: Array.isArray(d.ch2) ? d.ch2 : [],
                    bestCombo: Number(d.bestCombo) || 0,
                    lastChapter: d.lastChapter === 1 || d.lastChapter === 2 ? d.lastChapter : 0,
                };
            }
            // v1 旧档迁移：曾通关即视为教程完成，已通关关卡按分组归位
            const old = Array.isArray(d.completed) ? d.completed : [];
            return {
                version: 2,
                tutorialsDone: old.length > 0,
                ch1: old.filter((x: number) => x >= 2 && x <= 4),
                ch2: old.filter((x: number) => x >= 5 && x <= 8),
                bestCombo: Number(d.bestCombo) || 0,
                lastChapter: 0,
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
    private timerLeft = 0;
    private playing = false;
    private chgAcc = 0;
    private errLog: string[] = [];

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
    private btnC: Node = null!;
    private labelC: Label = null!;
    private lvGrid: Node = null!;
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
        this.buildHud();
        this.loadAllAudio();
        this.showTitle();
        // 全局错误记录（配合 console / tt.onError 定位重启问题）
        const g = globalThis as any;
        try {
            const rec = (msg: string) => {
                if (this.errLog.length < 20) this.errLog.push(msg);
                console.error('[BubbleWrap]', msg);
            };
            (g as any).__bubblewrapErrors = this.errLog;
            if (typeof g.addEventListener === 'function') {
                g.addEventListener('error', (e: any) => rec(`window: ${e && e.message}`));
            }
        } catch { /* ignore */ }
        // 全局错误兜底：单次异常不导致整个游戏重启（抖音运行时偶发）
        if (g.tt && g.tt.onError) {
            try { g.tt.onError((e: any) => console.error('[BubbleWrap] tt error:', e && e.errMsg)); } catch { /* ignore */ }
        }
    }

    update(dt: number) {
        try {
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
            // 原位刷新兜底：若某格已击破超 0.45s 仍未补位（调度丢失/异常），直接复位
            if (this.playing) {
                const cfg = LEVELS[this.currentLevel];
                if (cfg && cfg.dynamic && !cfg.gravity) {
                    const now = Date.now();
                    for (const b of this.bubbleList) {
                        if (!b.isValid) continue;
                        const c = b.getComponent(Bubble);
                        const t = (b as any).__popT as number | undefined;
                        if (c && c.isPopped && t && now - t > 450) {
                            c.resetBubble();
                            c.setColor(cfg.colors[randomRangeInt(0, cfg.colors.length)]);
                            this.ensureTargetColorAvailable();
                            (b as any).__popT = 0;
                        }
                    }
                }
            }
        } catch (e) {
            console.error('[BubbleWrap] update err', e);
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
        resources.load('bubbles/bubble_rainbow/spriteFrame', SpriteFrame, (err, sf) => {
            if (!err && sf) BUBBLE_FRAMES['rainbow'] = sf;
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
        this.showOverlay('选择章节', '第一章：静态棋盘·原位刷新\n第二章：动态棋盘·重力补位', [{
            label: '第一章（静态）',
            action: () => {
                this.hideOverlay();
                const save = loadSave();
                save.lastChapter = 1;
                writeSave(save);
                const next = this.firstIncompleteIn(save, STATIC_LEVELS);
                this.gotoLevel(next === null ? STATIC_LEVELS[0] : next);
            },
        }, {
            label: '第二章（动态）',
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
        this.labelC.string = '返回主界面';
        this.actionC = () => this.showTitle();
    }

    private showTitle() {
        const save = loadSave();
        this.drawProgress();
        this.playing = false;
        const buttons: { label: string; action: () => void }[] = [{
            label: '开始游戏',
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
            label: '从头开始',
            action: () => {
                writeSave(defaultSave());
                this.drawProgress();
                this.hideOverlay();
                this.gotoLevel(0);
            },
        }];
        this.showOverlay('泡泡纸', '教学章 · 第一章（静态）· 第二章（动态）', buttons);
        // 开发版：完整“选择关卡”；发布版：仅通关教学后开放“选择章节”
        if (IS_DEV) {
            this.btnC.active = true;
            this.labelC.string = '选择关卡';
            this.actionC = () => this.showLevelSelect();
        } else if (save.tutorialsDone) {
            this.btnC.active = true;
            this.labelC.string = '选择章节';
            this.actionC = () => this.showChapterSelect();
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
            console.error('[BubbleWrap] gotoLevel err', index, e);
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
        this.timerLeft = cfg.timeLimit;
        this.playing = false;
        this.mistakes = 0;
        this.rainbowNode = null;
        this.rainbowStreak = 0;
        this.changingSpawned = 0;
        this.snakeBusy = false;
        this.snakeDirty.length = 0;
        this.snakeCells = cfg.snake ? this.makeSnakeCells(cfg) : [];
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
        if (cfg.changing && this.countChanging() < 1) this.ensureOneChanging();
        // 彩虹关：开局场上即有一个彩虹泡泡（同一时间仅一个）
        if (cfg.rainbow) this.spawnRainbow();
        this.updateRainbowHint();
        // 防卡关：开局当前目标色一定在场上
        this.ensureTargetColorAvailable();
        this.renderTargetBar();

        // 变色关：定时把变色泡泡挪到随机新位置（先清旧调度避免重复）
        this.unschedule(this.relocateChangingBubbles);
        if (cfg.changing) this.schedule(this.relocateChangingBubbles, CHANGING_MOVE_INTERVAL);

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
            errors: () => this.errLog.slice(),
            bubbles: () => this.bubbleList.filter((b) => b.isValid).map((b) => {
                const c = b.getComponent(Bubble);
                return { x: b.position.x, y: b.position.y, color: c ? c.color : '', rainbow: c ? c.rainbow : false, changing: c ? c.changing : false, popped: c ? c.isPopped : true };
            }),
        };

        // 开场主题卡：衔接上一关
        this.showOverlay(`${cfg.num} · ${cfg.theme}`, `${cfg.keywords}\n${cfg.narrative}`, []);
        this.scheduleOnce(() => {
            this.playing = true;
            this.hideOverlay();
        }, 1.6);
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

    private respawnBubble(node: Node) {
        if (!node.isValid) return;
        const cfg = LEVELS[this.currentLevel];
        const comp = node.getComponent(Bubble)!;
        this.scheduleOnce(() => {
            try {
                if (!node.isValid) return;
                comp.resetBubble();
                // 每次刷新的硬保证：若棋盘其余泡泡中没有当前目标色，
                // 这个新泡泡直接补成目标色；否则随机颜色
                const target = this.queue[this.queueIdx];
                const hasOtherTarget = !!target && this.bubbleList.some((b) => {
                    if (b === node || !b.isValid) return false;
                    const c = b.getComponent(Bubble);
                    return !!c && !c.isPopped && !c.changing && !c.rainbow && c.color === target;
                });
                if (target && !hasOtherTarget) {
                    comp.setColor(target);
                } else {
                    // 始终补普通颜色；彩虹泡泡按「12 连正确」规则另行刷新，同一时间最多一个
                    comp.setColor(cfg.colors[randomRangeInt(0, cfg.colors.length)]);
                }
                // 双保险：刷新后再整体校验一次目标色存在性
                this.ensureTargetColorAvailable();
            } catch (e) {
                console.error('[BubbleWrap] respawn err', e);
            }
        }, 0.16);
        // 双保险：若 0.7s 后该格仍处于击破态（异常/调度丢失），强制补位
        this.scheduleOnce(() => {
            try {
                if (!node.isValid) return;
                const b = node.getComponent(Bubble);
                if (b && b.isPopped) {
                    b.resetBubble();
                    b.setColor(cfg.colors[randomRangeInt(0, cfg.colors.length)]);
                    this.ensureTargetColorAvailable();
                }
            } catch (e) {
                console.error('[BubbleWrap] respawn guard err', e);
            }
        }, 0.7);
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
                catch (e) { console.error('[BubbleWrap] snake batch err', e); this.snakeBusy = false; }
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
                console.error('[BubbleWrap] snake tail err', e);
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
        // 单个当前目标圆点（不再显示整条滑动队列）
        this.targetStrip.removeAllChildren();
        this.targetSlots.length = 0;
        const slot = new Node('Target');
        slot.layer = Layers.Enum.UI_2D;
        slot.addComponent(UITransform).setContentSize(86, 86);
        slot.setPosition(0, 0, 0);
        slot.addComponent(Graphics);
        this.targetStrip.addChild(slot);
        this.targetSlots.push(slot);
        this.highlightCurrent();
    }

    private highlightCurrent() {
        if (this.targetSlots.length === 0) return;
        const node = this.targetSlots[0];
        const g = node.getComponent(Graphics)!;
        const key = this.queue[this.queueIdx];
        g.clear();
        if (key) {
            const tint = COLORS[key].tint.clone();
            tint.a = 255;
            g.fillColor = tint;
            g.circle(0, 0, 32);
            g.fill();
        }
        // 白色高亮环，突出“当前目标”
        g.lineWidth = 5;
        g.strokeColor = new Color(255, 255, 255, 255);
        g.circle(0, 0, 36);
        g.stroke();
    }

    private advanceQueue() {
        try {
            this.queueIdx++;
            const cfg = LEVELS[this.currentLevel];
            this.remainLabel.string = `剩余 ${Math.max(cfg.targetCount - this.queueIdx, 0)}`;
            this.highlightCurrent();
            // 目标推进后，新目标色可能已被吃光——立即补上
            this.ensureTargetColorAvailable();
        } catch (e) {
            console.error('[BubbleWrap] advance err', e);
        }
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
                this.scheduleOnce(() => {
                    try {
                        if (cfg.snake) this.snakeRefill(node);
                        else this.gravityRefill(node);
                    } catch (e) {
                        console.error('[BubbleWrap] refill err', e);
                    }
                }, 0.15);
            } else if (cfg.dynamic) {
                (node as any).__popT = Date.now();
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
        try {
            if (!this.playing) return;
            this.mistakes++;
            this.missLabel.string = `失误 ${this.mistakes}/${MISTAKE_LIMIT}`;
            this.missLabel.color = this.mistakes >= 3 ? COLOR_WARN : COLOR_GRAY;
            this.rainbowStreak = 0;
            this.updateRainbowHint();
            if (this.mistakes >= MISTAKE_LIMIT) this.failLevel();
        } catch (e) {
            console.error('[BubbleWrap] wrong err', e);
        }
    }

    private failLevel() {
        try {
            if (!this.playing) return;
            this.playing = false;
            this.showOverlay('挑战失败', `累计捏错 ${MISTAKE_LIMIT} 次，再试一次！`, [{
                label: '重新挑战',
                action: () => {
                    this.hideOverlay();
                    this.gotoLevel(this.currentLevel);
                },
            }]);
            this.showHomeOnOverlay();
        } catch (e) {
            console.error('[BubbleWrap] fail err', e);
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
        this.updateRainbowHint();
        // 彩虹转换可能吃掉最后一个目标色泡泡——补回
        this.ensureTargetColorAvailable();
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

    /** 在结算/失败/超时弹层上启用第三颗按钮：返回主菜单（回到开始界面） */
    private showHomeOnOverlay() {
        this.btnC.active = true;
        this.labelC.string = '返回主菜单';
        this.actionC = () => {
            this.hideOverlay();
            this.showTitle();
        };
    }

    private completeLevel() {
        if (!this.playing) return;
        this.playing = false;
        const cfg = LEVELS[this.currentLevel];

        const save = loadSave();
        save.bestCombo = Math.max(save.bestCombo, this.combo);
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

        // 章节内顺序推进
        if (group === 'tutorial') {
            if (this.currentLevel === 0) {
                this.showOverlay('通关！', cfg.outro, [{
                    label: '下一节',
                    action: () => { this.hideOverlay(); this.gotoLevel(1); },
                }]);
                this.showHomeOnOverlay();
            } else {
                this.showOverlay('教学完成！', '欢迎进入泡泡世界。', [{
                    label: '选择章节',
                    action: () => { this.hideOverlay(); this.showChapterSelect(); },
                }]);
                this.showHomeOnOverlay();
            }
            return;
        }
        const list = group === 'ch1' ? STATIC_LEVELS : DYNAMIC_LEVELS;
        const pos = list.indexOf(this.currentLevel);
        if (pos >= 0 && pos < list.length - 1) {
            this.showOverlay('通关！', cfg.outro, [{
                label: '下一关',
                action: () => { this.hideOverlay(); this.gotoLevel(list[pos + 1]); },
            }]);
            this.showHomeOnOverlay();
            return;
        }
        // 该章最后一关
        const chapterName = group === 'ch1' ? '第一章' : '第二章';
        if (group === 'ch1') {
            this.showOverlay(`${chapterName} 通关！`, cfg.outro, [{
                label: '进入第二章',
                action: () => {
                    this.hideOverlay();
                    const s = loadSave();
                    s.lastChapter = 2;
                    writeSave(s);
                    const next = this.firstIncompleteIn(s, DYNAMIC_LEVELS);
                    this.gotoLevel(next === null ? DYNAMIC_LEVELS[0] : next);
                },
            }, {
                label: '再玩一次',
                action: () => { this.hideOverlay(); this.gotoLevel(this.currentLevel); },
            }]);
            this.showHomeOnOverlay();
        } else {
            this.showOverlay(`${chapterName} 通关！`, cfg.outro, [{
                label: '再玩一次',
                action: () => { this.hideOverlay(); this.gotoLevel(this.currentLevel); },
            }]);
            this.showHomeOnOverlay();
        }
    }

    private timeUp() {
        try {
            if (!this.playing) return;
            this.playing = false;
            this.showOverlay('时间到', '再试一次，找到自己的节拍。', [{
                label: '重新开始',
                action: () => {
                    this.hideOverlay();
                    this.gotoLevel(this.currentLevel);
                },
            }]);
            this.showHomeOnOverlay();
        } catch (e) {
            console.error('[BubbleWrap] timeup err', e);
        }
    }

    // ---------------- HUD / 遮罩 ----------------

    private buildHud() {
        const dark = new Color(80, 110, 135, 255);
        const gray = new Color(145, 165, 185, 255);

        // 左上：关卡名；右上：计时；中央：当前目标
        this.titleLabel = this.makeLabel('', 27, dark, new Vec3(-220, 590, 0));
        this.titleLabel.node.getComponent(UITransform)!.setContentSize(360, 40);
        this.titleLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
        this.subtitleLabel = this.makeLabel('', 20, gray, new Vec3(-220, 562, 0));
        this.subtitleLabel.node.getComponent(UITransform)!.setContentSize(360, 30);
        this.subtitleLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
        this.subtitleLabel.fontSize = 18;
        this.remainLabel = this.makeLabel('', 22, dark, new Vec3(0, 468, 0));
        this.remainLabel.node.getComponent(UITransform)!.setContentSize(260, 34);
        this.comboLabel = this.makeLabel('', 44, new Color(255, 110, 150, 255), new Vec3(0, 410, 0));
        this.timerLabel = this.makeLabel('', 26, dark, new Vec3(225, 605, 0));
        this.timerLabel.node.getComponent(UITransform)!.setContentSize(240, 40);
        this.timerLabel.horizontalAlign = Label.HorizontalAlign.RIGHT;

        // 失误计数（右上，计时下方；≥3 次变红警示）
        this.missLabel = this.makeLabel('', 20, COLOR_GRAY, new Vec3(225, 570, 0));
        this.missLabel.node.getComponent(UITransform)!.setContentSize(240, 30);
        this.missLabel.horizontalAlign = Label.HorizontalAlign.RIGHT;
        // 彩虹泡泡提示（棋盘上方）
        this.rainbowLabel = this.makeLabel('', 22, COLOR_PURPLE, new Vec3(0, 428, 0));

        // “目标”提示字 + 单个大目标圆点
        this.targetHint = this.makeLabel('目标', 18, gray, new Vec3(0, 628, 0));
        this.targetBar = new Node('TargetBar');
        this.targetBar.layer = Layers.Enum.UI_2D;
        this.targetBar.addComponent(UITransform).setContentSize(100, 100);
        this.targetBar.setPosition(0, 560, 0);
        this.node.addChild(this.targetBar);
        this.targetStrip = this.targetBar;
        this.hudNodes = [
            this.titleLabel.node, this.subtitleLabel.node, this.remainLabel.node,
            this.comboLabel.node, this.timerLabel.node, this.missLabel.node,
            this.rainbowLabel.node, this.targetHint.node, this.targetBar,
        ];

        // 左上角关卡内按钮：重新开始 + 返回主菜单（仅游戏进行中显示）
        this.restartBtn = this.buildCornerButton('重新开始', new Vec3(-280, 625, 0));
        this.restartBtn.on(Button.EventType.CLICK, () => {
            if (!this.restartBtn.active) return;
            this.gotoLevel(this.currentLevel);
        }, this);
        this.homeBtn = this.buildCornerButton('返回主菜单', new Vec3(-140, 625, 0));
        this.homeBtn.on(Button.EventType.CLICK, () => {
            if (!this.homeBtn.active) return;
            this.showTitle();
        }, this);
        // 初始隐藏（标题屏时由 showOverlay 统一管理）
        this.restartBtn.active = false;
        this.homeBtn.active = false;

        this.buildOverlay();
    }

    private setHudVisible(on: boolean) {
        for (const n of this.hudNodes) {
            if (n && n.isValid) n.active = on;
        }
    }

    /** 左上角小按钮：圆角半透明背景 + 居中文字 */
    private buildCornerButton(text: string, pos: Vec3): Node {
        const node = new Node('CornerBtn');
        node.layer = Layers.Enum.UI_2D;
        const w = 118, h = 34;
        node.addComponent(UITransform).setContentSize(w, h);
        node.setPosition(pos);
        this.node.addChild(node);
        node.addComponent(Graphics);
        this.paintRoundBtn(node, w, h, 10,
            new Color(255, 255, 255, 235), new Color(212, 226, 240, 255), 1.5);
        node.addComponent(Button);
        this.hookPress(node, w, h, 10,
            new Color(228, 240, 252, 255), new Color(212, 226, 240, 255));
        const lbl = new Node('Label');
        lbl.layer = Layers.Enum.UI_2D;
        lbl.addComponent(UITransform).setContentSize(w, h);
        lbl.setPosition(0, 0, 0);
        node.addChild(lbl);
        const label = lbl.addComponent(Label);
        label.string = text;
        label.fontSize = 16;
        label.lineHeight = 16;
        label.color = new Color(96, 124, 152, 255);
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        return node;
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
        g.fillColor = new Color(255, 255, 255, 236);
        g.rect(-360, -640, 720, 1280);
        g.fill();

        this.overlayTitle = this.makeLabelOn(this.overlay, '', 52, new Color(80, 110, 135, 255), new Vec3(0, 260, 0));
        this.overlayDesc = this.makeLabelOn(this.overlay, '', 25, new Color(145, 165, 185, 255), new Vec3(0, 185, 0));
        this.overlayDesc.node.getComponent(UITransform)!.setContentSize(620, 120);
        this.overlayDesc.lineHeight = 38;

        const resetBtn = this.node.getChildByName('ResetBtn');
        const btnSF = resetBtn ? resetBtn.getComponent(Sprite)!.spriteFrame : null;
        this.btnA = this.buildOverlayButton(btnSF, new Vec3(0, -20, 0));
        this.labelA = this.btnA.getChildByName('Label')!.getComponent(Label)!;
        this.btnB = this.buildOverlayButton(btnSF, new Vec3(0, -110, 0));
        this.labelB = this.btnB.getChildByName('Label')!.getComponent(Label)!;
        this.btnC = this.buildOverlayButton(btnSF, new Vec3(0, -200, 0));
        this.labelC = this.btnC.getChildByName('Label')!.getComponent(Label)!;

        // 选关面板（测试阶段专用）：9 个章节快捷入口
        this.lvGrid = new Node('LevelGrid');
        this.lvGrid.layer = Layers.Enum.UI_2D;
        this.lvGrid.addComponent(UITransform).setContentSize(520, 420);
        this.lvGrid.setPosition(0, -100, 0);
        this.overlay.addChild(this.lvGrid);
        this.lvGrid.active = false;

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
        this.paintRoundBtn(node, w, h, r,
            new Color(255, 255, 255, 245), new Color(214, 228, 242, 255), 2);
        node.addComponent(Button);
        this.hookPress(node, w, h, r, new Color(228, 240, 252, 255), new Color(214, 228, 242, 255));
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
        return node;
    }

    private showOverlay(title: string, desc: string, buttons: { label: string; action: () => void }[]) {
        this.setHudVisible(false);
        this.overlayTitle.string = title;
        this.overlayDesc.string = desc;
        // 遮罩显示时隐藏关卡内按钮
        this.restartBtn.active = false;
        this.homeBtn.active = false;
        this.btnA.active = buttons.length > 0;
        this.btnB.active = buttons.length > 1;
        this.labelA.string = buttons[0] ? buttons[0].label : '';
        this.labelB.string = buttons[1] ? buttons[1].label : '';
        this.actionA = buttons[0] ? buttons[0].action : null;
        this.actionB = buttons[1] ? buttons[1].action : null;
        this.btnC.active = false;
        this.lvGrid.active = false;
        this.overlay.active = true;
    }

    private hideOverlay() {
        this.overlay.active = false;
        if (this.playing) this.setHudVisible(true);
        // 遮罩隐藏时恢复关卡内按钮（仅在游戏进行中）
        if (this.playing) {
            this.restartBtn.active = true;
            this.homeBtn.active = true;
        }
        this.actionA = null;
        this.actionB = null;
        this.actionC = null;
        this.btnC.active = false;
        this.lvGrid.active = false;
    }

    /** 测试阶段专用：选关面板 */
    private showLevelSelect() {
        if (!IS_DEV) {
            this.showChapterSelect();
            return;
        }
        this.overlayTitle.string = '选择关卡';
        this.overlayDesc.string = '开发工具：可直接进入任意一节';
        this.restartBtn.active = false;
        this.homeBtn.active = false;
        this.btnA.active = false;
        this.btnB.active = false;
        this.btnC.active = false;
        this.lvGrid.removeAllChildren();
        let y = 250;
        const heading = (text: string) => {
            const h = this.makeLabelOn(this.lvGrid, text, 19, new Color(120, 140, 160, 255), new Vec3(-150, y, 0));
            h.node.getComponent(UITransform)!.setContentSize(340, 24);
            h.horizontalAlign = Label.HorizontalAlign.LEFT;
            y -= 25;
        };
        const row = (i: number) => {
            const cfg = LEVELS[i];
            const node = new Node(`Lv${i}`);
            node.layer = Layers.Enum.UI_2D;
            node.addComponent(UITransform).setContentSize(330, 50);
            node.setPosition(0, y, 0);
            node.addComponent(Button);
            const label = this.makeLabelOn(node, `${cfg.num} · ${cfg.theme}`, 21,
                new Color(86, 116, 146, 255), new Vec3(-140, 0, 0));
            label.node.getComponent(UITransform)!.setContentSize(300, 36);
            label.horizontalAlign = Label.HorizontalAlign.LEFT;
            node.on(Button.EventType.CLICK, () => {
                this.hideOverlay();
                this.gotoLevel(i);
            }, this);
            this.lvGrid.addChild(node);
            y -= 57;
        };
        heading('必经教学');
        TUTORIAL_LEVELS.forEach(row);
        heading('第一章 · 静态');
        STATIC_LEVELS.forEach(row);
        heading('第二章 · 动态');
        DYNAMIC_LEVELS.forEach(row);
        const back = new Node('Back');
        back.layer = Layers.Enum.UI_2D;
        back.addComponent(UITransform).setContentSize(200, 44);
        back.setPosition(0, y - 4, 0);
        back.addComponent(Button);
        const backLabel = this.makeLabelOn(back, '返回主界面', 20, new Color(110, 130, 150, 255), new Vec3(0, 0, 0));
        backLabel.node.getComponent(UITransform)!.setContentSize(240, 36);
        back.on(Button.EventType.CLICK, () => { this.hideOverlay(); this.showTitle(); }, this);
        this.lvGrid.addChild(back);
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
