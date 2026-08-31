import { Color, SpriteFrame } from 'cc';

export interface BubbleColor {
    key: string;
    name: string;
    hex: string;
    tint: Color;
    pitch: number;   // 颜色专属爆破音音高（相对基准）
    audio: string;   // resources 中的音频 key
}

export const COLORS: Record<string, BubbleColor> = {
    red: {
        key: 'red', name: '红', hex: '#E4A8A8',
        tint: new Color(228, 168, 168, 255), pitch: 0.62, audio: 'pop_red',
    },
    orange: {
        key: 'orange', name: '橙', hex: '#E6BE97',
        tint: new Color(230, 190, 151, 255), pitch: 0.78, audio: 'pop_orange',
    },
    yellow: {
        key: 'yellow', name: '黄', hex: '#E6D38D',
        tint: new Color(230, 211, 141, 255), pitch: 0.95, audio: 'pop_yellow',
    },
    green: {
        key: 'green', name: '绿', hex: '#9BD6B1',
        tint: new Color(155, 214, 177, 255), pitch: 1.15, audio: 'pop_green',
    },
    cyan: {
        key: 'cyan', name: '青', hex: '#8DD3DD',
        tint: new Color(141, 211, 221, 255), pitch: 1.4, audio: 'pop_cyan',
    },
    blue: {
        key: 'blue', name: '蓝', hex: '#8DACE1',
        tint: new Color(141, 172, 225, 255), pitch: 1.7, audio: 'pop_blue',
    },
    violet: {
        key: 'violet', name: '紫', hex: '#BEA8E1',
        tint: new Color(190, 168, 225, 255), pitch: 2.0, audio: 'pop_violet',
    },
};

export const RAINBOW_AUDIO = 'pop_rainbow';

/** 按颜色烘焙的泡泡纹理（GameManager 启动时加载，Bubble 渲染时使用） */
export const BUBBLE_FRAMES: Record<string, SpriteFrame | null> = {};

/** 彩虹泡泡循环流动使用的颜色序列 */
export const RAINBOW_SEQ: Color[] = [
    new Color(228, 168, 168, 255),
    new Color(230, 190, 151, 255),
    new Color(230, 211, 141, 255),
    new Color(155, 214, 177, 255),
    new Color(141, 211, 221, 255),
    new Color(141, 172, 225, 255),
    new Color(190, 168, 225, 255),
];
