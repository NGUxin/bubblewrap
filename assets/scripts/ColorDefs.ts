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
        key: 'red', name: '红', hex: '#DDBDBD',
        tint: new Color(221, 195, 195, 255), pitch: 1, audio: 'pop_red',
    },
    orange: {
        key: 'orange', name: '橙', hex: '#DDCDBB',
        tint: new Color(221, 205, 187, 255), pitch: 1, audio: 'pop_orange',
    },
    yellow: {
        key: 'yellow', name: '黄', hex: '#DDD4BB',
        tint: new Color(221, 212, 187, 255), pitch: 1, audio: 'pop_yellow',
    },
    green: {
        key: 'green', name: '绿', hex: '#C4D7CA',
        tint: new Color(196, 215, 202, 255), pitch: 1, audio: 'pop_green',
    },
    cyan: {
        key: 'cyan', name: '青', hex: '#C0D5D8',
        tint: new Color(192, 213, 216, 255), pitch: 1, audio: 'pop_cyan',
    },
    blue: {
        key: 'blue', name: '蓝', hex: '#C0CADA',
        tint: new Color(192, 202, 218, 255), pitch: 1, audio: 'pop_blue',
    },
    violet: {
        key: 'violet', name: '紫', hex: '#CDC7DA',
        tint: new Color(205, 199, 218, 255), pitch: 1, audio: 'pop_violet',
    },
};

export const RAINBOW_AUDIO = 'pop_rainbow';

/** 按颜色烘焙的泡泡纹理（GameManager 启动时加载，Bubble 渲染时使用） */
export const BUBBLE_FRAMES: Record<string, SpriteFrame | null> = {};

/** 彩虹泡泡循环流动使用的颜色序列 */
export const RAINBOW_SEQ: Color[] = [
    new Color(221, 195, 195, 255),
    new Color(221, 205, 187, 255),
    new Color(221, 212, 187, 255),
    new Color(196, 215, 202, 255),
    new Color(192, 213, 216, 255),
    new Color(192, 202, 218, 255),
    new Color(205, 199, 218, 255),
];
