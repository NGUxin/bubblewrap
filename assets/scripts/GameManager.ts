import {
    _decorator, Component, Node, instantiate, Vec3, Vec2, AudioSource,
    randomRange, UITransform, input, Input, EventTouch, tween, Layers,
    Label, Color, Sprite, Graphics, Button, BlockInputEvents,
} from 'cc';
import { Bubble } from './Bubble';
const { ccclass, property } = _decorator;

interface LevelConfig {
    num: string;
    theme: string;
    keywords: string;
    narrative: string;      // 开场衔接文案
    outro: string;          // 通关衔接文案
    count: number;
    sizeMin: number;
    sizeMax: number;
    placement: 'random' | 'path' | 'grid' | 'mixed';
    neighborShake: boolean;
    comboMode: boolean;
    chain: boolean;
    burstScale: number;
    timeLimit: number;
}

// 点 → 线 → 面 → 节奏 → 爆发（一条完整旅程）
const LEVELS: LevelConfig[] = [
    {
        num: '1-1', theme: '空', keywords: '留白 · 大泡泡 · 单次爆裂',
        narrative: '所有爆裂，都始于第一声。',
        outro: '第一声只是开始——现在，把它们连成一条线。',
        count: 10, sizeMin: 1.6, sizeMax: 2.2, placement: 'random',
        neighborShake: false, comboMode: false, chain: false, burstScale: 1.6, timeLimit: 0,
    },
    {
        num: '1-2', theme: '线', keywords: '路径 · 滑动 · 连续爆裂',
        narrative: '当点连成线，滑动即是节奏。',
        outro: '点连成了线。当线铺满，就是面。',
        count: 26, sizeMin: 0.9, sizeMax: 1.1, placement: 'path',
        neighborShake: false, comboMode: false, chain: false, burstScale: 1.0, timeLimit: 0,
    },
    {
        num: '1-3', theme: '面', keywords: '密集 · 挤压 · 相邻震动',
        narrative: '线铺成面，挤压回响。',
        outro: '面在脚下铺开——找到节奏，迎接爆发。',
        count: 80, sizeMin: 0.72, sizeMax: 0.9, placement: 'grid',
        neighborShake: true, comboMode: false, chain: false, burstScale: 0.9, timeLimit: 0,
    },
    {
        num: '1-4', theme: '节奏', keywords: 'Combo · 声音 · 速度',
        narrative: '在密集中，找到自己的节拍。',
        outro: '节拍已就绪，最后的连锁即将到来。',
        count: 30, sizeMin: 1.0, sizeMax: 1.25, placement: 'random',
        neighborShake: false, comboMode: true, chain: false, burstScale: 1.0, timeLimit: 30,
    },
    {
        num: '1-5', theme: '爆发', keywords: '综合 · 连锁 · 高潮',
        narrative: '积累的一切，只为这一刻的连锁爆发。',
        outro: '全部通关！五段爆裂之旅，圆满落幕。',
        count: 60, sizeMin: 0.85, sizeMax: 1.2, placement: 'mixed',
        neighborShake: true, comboMode: true, chain: true, burstScale: 1.25, timeLimit: 45,
    },
];

// ---------------- 存档 ----------------

interface SaveData {
    unlocked: number;       // 已解锁的最高关卡（下一关可玩）
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
    private chainMap = new Map<Node, boolean>();

    private currentLevel = 0;
    private maxUnlocked = 0;
    private remaining = 0;
    private combo = 0;
    private lastPopTime = 0;
    private timerLeft = 0;
    private playing = false;

    // HUD
    private titleLabel: Label = null!;
    private subtitleLabel: Label = null!;
    private remainLabel: Label = null!;
    private comboLabel: Label = null!;
    private timerLabel: Label = null!;
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
        // 保险：首次 preload 若因路径未就绪失败，强制重载，保证声音可播
        this.scheduleOnce(() => {
            const clip = this.popAudio.clip;
            if (clip && !(this.popAudio as any)._isLoaded) {
                this.popAudio.clip = null;
                this.popAudio.clip = clip;
                this.popAudio.play();
            }
        }, 0.5);
        this.showTitle();
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
        if (hasProgress) {
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
        }
        this.showOverlay('泡泡纸', '点 · 线 · 面 · 节奏 · 爆发', buttons);
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

        this.remaining = cfg.count;
        this.combo = 0;
        this.lastPopTime = 0;
        this.popAudio.pitch = 1;
        this.timerLeft = cfg.timeLimit;
        this.playing = false; // 开场卡展示期间不可操作
        this.chainMap.clear();
        this.hideOverlay();

        this.titleLabel.string = `${cfg.num} ${cfg.theme}`;
        this.subtitleLabel.string = cfg.keywords;
        this.remainLabel.string = `剩余 ${this.remaining}`;
        this.comboLabel.string = '';
        this.timerLabel.string = cfg.timeLimit > 0 ? `时间 ${cfg.timeLimit}` : '';
        this.drawProgress();

        const positions = this.generatePositions(cfg);
        for (const pos of positions) {
            const bubble = instantiate(this.bubblePrefab);
            bubble.setPosition(pos);
            const s = randomRange(cfg.sizeMin, cfg.sizeMax);
            bubble.setScale(s, s, 1);
            this.bubbleContainer.addChild(bubble);
            this.bubbleList.push(bubble);
            bubble.on('bubblePop', this.onBubblePop, this);
            if (cfg.chain && Math.random() < 0.25) {
                this.chainMap.set(bubble, true);
            }
        }

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
        this.bubbleList.forEach(b => {
            if (b.isValid) b.destroy();
        });
        this.bubbleList.length = 0;
    }

    private generatePositions(cfg: LevelConfig): Vec3[] {
        const pts: Vec3[] = [];
        if (cfg.placement === 'path') {
            for (let i = 0; i < cfg.count; i++) {
                const t = cfg.count === 1 ? 0 : i / (cfg.count - 1);
                pts.push(new Vec3(
                    -300 + 600 * t + randomRange(-8, 8),
                    260 * Math.sin(t * Math.PI * 3) + randomRange(-6, 6),
                    0,
                ));
            }
        } else if (cfg.placement === 'grid') {
            const spacing = 86;
            let placed = 0;
            let row = 0;
            while (placed < cfg.count) {
                const y = -470 + row * spacing * 0.87;
                if (y > 460) break;
                const off = row % 2 ? spacing / 2 : 0;
                for (let x = -320 + off; x <= 320; x += spacing) {
                    pts.push(new Vec3(x + randomRange(-6, 6), y + randomRange(-6, 6), 0));
                    placed++;
                    if (placed >= cfg.count) break;
                }
                row++;
            }
        } else if (cfg.placement === 'mixed') {
            const half = Math.floor(cfg.count / 2);
            for (let i = 0; i < half; i++) {
                const t = half === 1 ? 0 : i / (half - 1);
                pts.push(new Vec3(-300 + 600 * t + randomRange(-6, 6), 200 * Math.sin(t * Math.PI * 4) + randomRange(-5, 5), 0));
            }
            for (let i = half; i < cfg.count; i++) {
                pts.push(new Vec3(randomRange(-320, 320), randomRange(-500, 440), 0));
            }
        } else {
            const margin = cfg.sizeMax * 36;
            for (let i = 0; i < cfg.count; i++) {
                pts.push(new Vec3(
                    randomRange(-340 + margin, 340 - margin),
                    randomRange(-520 + margin, 460 - margin),
                    0,
                ));
            }
        }
        return pts;
    }

    // ---------------- 交互 ----------------

    onTouch(event: EventTouch) {
        if (!this.playing) return;
        const uiPos: Vec2 = event.getUILocation();
        const local = this.bubbleContainer
            .getComponent(UITransform)!
            .convertToNodeSpaceAR(new Vec3(uiPos.x, uiPos.y, 0));
        for (const bubble of this.bubbleList) {
            const comp = bubble.getComponent(Bubble);
            if (!comp || comp.isPopped) continue;
            const scale = bubble.scale.x;
            const pos = bubble.position;
            const dx = local.x - pos.x;
            const dy = local.y - pos.y;
            const r = this.bubbleRadius * scale;
            if (dx * dx + dy * dy <= r * r) {
                comp.pop();
            }
        }
    }

    onBubblePop(pos: Vec3, node: Node) {
        const cfg = LEVELS[this.currentLevel];
        if (cfg.comboMode) {
            const now = Date.now() / 1000;
            if (now - this.lastPopTime < 0.8) {
                this.combo++;
            } else {
                this.combo = 1;
            }
            this.lastPopTime = now;
            this.popAudio.pitch = Math.min(1 + (this.combo - 1) * 0.05, 1.8);
            this.comboLabel.string = this.combo >= 2 ? `COMBO x${this.combo}` : '';
        }
        this.popAudio.play();

        const scale = node.scale.x;
        this.spawnMiniBubbles(pos, scale, cfg.burstScale);

        if (cfg.neighborShake) {
            this.shakeNeighbors(node, 120 * scale + 40);
        }
        if (cfg.chain && this.chainMap.get(node)) {
            this.chainFrom(node, 90 * scale + 30);
        }

        this.remaining--;
        this.remainLabel.string = `剩余 ${Math.max(this.remaining, 0)}`;
        if (this.remaining <= 0) {
            this.completeLevel();
        }
    }

    private shakeNeighbors(from: Node, radius: number) {
        const fromPos = from.position;
        for (const other of this.bubbleList) {
            if (other === from || !other.isValid) continue;
            const comp = other.getComponent(Bubble);
            if (!comp || comp.isPopped) continue;
            const dx = other.position.x - fromPos.x;
            const dy = other.position.y - fromPos.y;
            const rr = radius + 30 * other.scale.x;
            if (dx * dx + dy * dy <= rr * rr) {
                comp.shake();
            }
        }
    }

    private chainFrom(from: Node, radius: number) {
        const fromPos = from.position;
        for (const other of this.bubbleList) {
            if (other === from || !other.isValid) continue;
            const comp = other.getComponent(Bubble);
            if (!comp || comp.isPopped) continue;
            const dx = other.position.x - fromPos.x;
            const dy = other.position.y - fromPos.y;
            const rr = radius + 30 * other.scale.x;
            if (dx * dx + dy * dy <= rr * rr && Math.random() < 0.35) {
                this.scheduleOnce(() => {
                    if (comp && comp.isValid && !comp.isPopped) {
                        comp.pop();
                    }
                }, randomRange(0.1, 0.22));
            }
        }
    }

    private spawnMiniBubbles(pos: Vec3, scale: number, burstScale: number) {
        const count = Math.round(4 * burstScale) + (Math.random() < 0.5 ? 1 : 0);
        for (let i = 0; i < count; i++) {
            const mini = instantiate(this.bubblePrefab);
            mini.setPosition(pos);
            const s = randomRange(0.18, 0.55) * Math.min(scale, 1.4);
            mini.setScale(s, s, 1);
            this.bubbleContainer.addChild(mini);
            const ang = Math.random() * Math.PI * 2;
            const dist = (1 - s * 0.6) * randomRange(32, 74) * burstScale;
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

    // ---------------- 通关 / 时间到 / 存档 ----------------

    private completeLevel() {
        if (!this.playing) return;
        this.playing = false;
        const cfg = LEVELS[this.currentLevel];

        // 存档
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

        this.titleLabel = this.makeLabel('', 44, dark, new Vec3(0, 560, 0));
        this.subtitleLabel = this.makeLabel('', 26, gray, new Vec3(0, 508, 0));
        this.remainLabel = this.makeLabel('', 30, dark, new Vec3(230, 560, 0));
        this.remainLabel.node.getComponent(UITransform)!.setContentSize(240, 50);
        this.remainLabel.horizontalAlign = Label.HorizontalAlign.RIGHT;
        this.comboLabel = this.makeLabel('', 64, new Color(255, 110, 150, 255), new Vec3(0, 320, 0));
        this.timerLabel = this.makeLabel('', 32, dark, new Vec3(-230, 560, 0));
        this.timerLabel.node.getComponent(UITransform)!.setContentSize(240, 50);
        this.timerLabel.horizontalAlign = Label.HorizontalAlign.LEFT;

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
        for (let i = 0; i < LEVELS.length; i++) {
            const x = -96 + i * 48;
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
