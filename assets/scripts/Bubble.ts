import { _decorator, Component, Node, Sprite, SpriteFrame, Color, tween, Vec3, UITransform, Graphics } from 'cc';
import { COLORS, BUBBLE_FRAMES } from './ColorDefs';
const { ccclass, property } = _decorator;

@ccclass('Bubble')
export class Bubble extends Component {
    @property({ type: SpriteFrame })
    normalSF: SpriteFrame = null!;
    @property({ type: SpriteFrame })
    popSF: SpriteFrame = null!;

    private _isPop = false;
    private sprite: Sprite = null!;
    private originScale = 1;
    private baseFrame: SpriteFrame | null = null;
    private colorKey = 'yellow';
    private isRainbow = false;
    private isChanging = false;
    private changeIdx = 0;
    private static CHANGE_KEYS = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'violet'];

    get isPopped(): boolean {
        return this._isPop;
    }

    get color(): string {
        return this.colorKey;
    }

    get rainbow(): boolean {
        return this.isRainbow;
    }

    get changing(): boolean {
        return this.isChanging;
    }

    onLoad() {
        this.sprite = this.getComponent(Sprite)!;
        this.baseFrame = this.sprite.spriteFrame;
        this.originScale = this.node.scale.x;
    }

    /** 设置泡泡颜色（普通泡泡） */
    setColor(key: string) {
        this.stopChanging();
        this.clearRainbowRing();
        this.colorKey = key;
        this.isRainbow = false;
        tween(this.sprite).stop();
        const sp = this.getComponent(Sprite)!;
        this.sprite = sp;
        const frame = BUBBLE_FRAMES[key];
        if (frame) {
            // 使用烘焙好的彩色立体泡泡纹理，保持高光与膜面质感
            sp.spriteFrame = frame;
            sp.color = Color.WHITE;
        } else {
            // 纹理尚未加载完时的兜底：整体染色
            sp.color = COLORS[key] ? COLORS[key].tint : Color.WHITE;
        }
    }

    /** 设置为彩虹泡泡：颜色循环流动，可匹配任意目标色 */
    setRainbow() {
        this.stopChanging();
        this.clearRainbowRing();
        this.colorKey = 'rainbow';
        this.isRainbow = true;
        this.isChanging = false;
        const sp = this.getComponent(Sprite)!;
        this.sprite = sp;
        tween(this.sprite).stop();
        // 彩虹固定为暖白膜面 + 淡紫标识环：不再循环变色，避免与变色泡泡混淆
        if (this.baseFrame) sp.spriteFrame = this.baseFrame;
        sp.color = new Color(255, 247, 238, 255);
        this.ensureRainbowRing();
    }

    /** 变色泡泡：红→橙→黄→绿→青→蓝→紫 循环，当前颜色 = 目标色时才可击破 */
    setChanging() {
        this.clearRainbowRing();
        this.isRainbow = false;
        this.isChanging = true;
        this.changeIdx = randomIndex();
        this.colorKey = Bubble.CHANGE_KEYS[this.changeIdx];
        this.applyColor(this.colorKey);
    }

    /** 由 GameManager.update 驱动：推进到下一个颜色 */
    cycleNext() {
        if (!this.isChanging || this._isPop) return;
        this.changeIdx = (this.changeIdx + 1) % Bubble.CHANGE_KEYS.length;
        this.colorKey = Bubble.CHANGE_KEYS[this.changeIdx];
        this.applyColor(this.colorKey);
    }

    private stopChanging() {
        this.isChanging = false;
    }

    private applyColor(key: string) {
        const sp = this.getComponent(Sprite)!;
        this.sprite = sp;
        const frame = BUBBLE_FRAMES[key];
        if (frame) {
            sp.spriteFrame = frame;
            sp.color = Color.WHITE;
        } else {
            sp.color = COLORS[key] ? COLORS[key].tint : Color.WHITE;
        }
    }

    /** 击破：像肥皂泡一样放大并淡出消失（配合粒子爆裂） */
    pop() {
        if (this._isPop) return;
        this._isPop = true;
        this.stopChanging();
        this.clearRainbowRing();
        tween(this.sprite).stop();
        tween(this.node).stop();
        tween(this.node)
            .to(0.14, { scale: new Vec3(this.originScale * 1.35, this.originScale * 1.35, 1) }, { easing: 'quadOut' })
            .start();
        tween(this.sprite)
            .to(0.14, { color: new Color(255, 255, 255, 0) }, { easing: 'quadOut' })
            .start();
        // 通知父节点：泡泡破裂（带节点引用、颜色信息，供连锁/音效/刷新使用）
        this.node.emit('bubblePop', this.node.position, this.node, this.colorKey, this.isRainbow);
    }

    /** 相邻震动：短促的放大回落脉冲 */
    shake() {
        if (this._isPop) return;
        tween(this.node).stop();
        tween(this.node)
            .to(0.06, { scale: new Vec3(this.originScale * 1.12, this.originScale * 1.12, 1) }, { easing: 'quadOut' })
            .to(0.08, { scale: new Vec3(this.originScale, this.originScale, 1) }, { easing: 'quadIn' })
            .start();
    }

    resetBubble() {
        this._isPop = false;
        this.stopChanging();
        this.clearRainbowRing();
        tween(this.node).stop();
        tween(this.sprite).stop();
        this.node.setScale(this.originScale, this.originScale, 1);
        // 关键：泡泡使用后就不是彩虹了——还原为普通颜色，
        // 之后是否变成彩虹由外部 setRainbow() 显式调用决定，不再"自带"彩虹身份
        this.isRainbow = false;
        if (this.colorKey === 'rainbow') this.colorKey = 'yellow';
        const frame = BUBBLE_FRAMES[this.colorKey];
        if (frame) {
            this.sprite.spriteFrame = frame;
            this.sprite.color = Color.WHITE;
        } else {
            this.sprite.color = COLORS[this.colorKey] ? COLORS[this.colorKey].tint : Color.WHITE;
        }
    }

    private ensureRainbowRing() {
        if (this.node.getChildByName('RainbowRing')) return;
        const ring = new Node('RainbowRing');
        ring.addComponent(UITransform).setContentSize(64, 64);
        const g = ring.addComponent(Graphics);
        g.lineWidth = 3.5;
        g.strokeColor = new Color(178, 150, 255, 255);
        g.circle(0, 0, 30);
        g.stroke();
        this.node.addChild(ring);
    }

    private clearRainbowRing() {
        const ring = this.node.getChildByName('RainbowRing');
        if (ring) ring.destroy();
    }
}

function randomIndex(): number {
    return Math.floor(Math.random() * 7);
}
