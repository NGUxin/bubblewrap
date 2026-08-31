import { _decorator, Component, Sprite, SpriteFrame, Color, tween, Vec3 } from 'cc';
import { COLORS, RAINBOW_SEQ, BUBBLE_FRAMES } from './ColorDefs';
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
    private colorKey = 'yellow';
    private isRainbow = false;

    get isPopped(): boolean {
        return this._isPop;
    }

    get color(): string {
        return this.colorKey;
    }

    get rainbow(): boolean {
        return this.isRainbow;
    }

    onLoad() {
        this.sprite = this.getComponent(Sprite)!;
        this.originScale = this.node.scale.x;
    }

    /** 设置泡泡颜色（普通泡泡） */
    setColor(key: string) {
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
        this.colorKey = 'rainbow';
        this.isRainbow = true;
        const sp = this.getComponent(Sprite)!;
        this.sprite = sp;
        tween(this.sprite).stop();
        const seq: Color[] = RAINBOW_SEQ;
        let idx = Math.floor(Math.random() * seq.length);
        const cycle = () => {
            idx = (idx + 1) % seq.length;
            tween(sp).to(0.28, { color: seq[idx] }).call(cycle).start();
        };
        tween(sp).to(0.28, { color: seq[idx] }).call(cycle).start();
    }

    /** 击破：像肥皂泡一样放大并淡出消失（配合粒子爆裂） */
    pop() {
        if (this._isPop) return;
        this._isPop = true;
        tween(this.sprite).stop();
        tween(this.node).stop();
        tween(this.node)
            .to(0.22, { scale: new Vec3(this.originScale * 1.35, this.originScale * 1.35, 1) }, { easing: 'quadOut' })
            .start();
        tween(this.sprite)
            .to(0.22, { color: new Color(255, 255, 255, 0) }, { easing: 'quadOut' })
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
        tween(this.node).stop();
        tween(this.sprite).stop();
        this.node.setScale(this.originScale, this.originScale, 1);
        if (this.isRainbow) {
            this.setRainbow();
        } else {
            this.sprite.color = COLORS[this.colorKey] ? COLORS[this.colorKey].tint : Color.WHITE;
        }
    }
}
