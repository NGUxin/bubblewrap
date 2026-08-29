import { _decorator, Component, Sprite, SpriteFrame, Color, tween, Vec3 } from 'cc';
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

    get isPopped(): boolean {
        return this._isPop;
    }

    onLoad() {
        this.sprite = this.getComponent(Sprite)!;
        this.originScale = this.node.scale.x;
    }

    /** 击破：像肥皂泡一样放大并淡出消失（配合粒子爆裂） */
    pop() {
        if (this._isPop) return;
        this._isPop = true;
        tween(this.node).stop();
        tween(this.node)
            .to(0.22, { scale: new Vec3(this.originScale * 1.35, this.originScale * 1.35, 1) }, { easing: 'quadOut' })
            .start();
        tween(this.sprite)
            .to(0.22, { color: new Color(255, 255, 255, 0) }, { easing: 'quadOut' })
            .start();
        // 通知父节点：泡泡破裂（带节点引用，供连锁/震动使用）
        this.node.emit('bubblePop', this.node.position, this.node);
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
        this.sprite.color = Color.WHITE;
    }
}
