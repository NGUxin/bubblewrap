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
        key: 'red', name: '红', hex: '#F28B8B',
        tint: new Color(242, 139, 139, 255), pitch: 1, audio: 'pop_red',
    },
    orange: {
        key: 'orange', name: '橙', hex: '#F5B26B',
        tint: new Color(245, 178, 107, 255), pitch: 1, audio: 'pop_orange',
    },
    yellow: {
        key: 'yellow', name: '黄', hex: '#F5D06B',
        tint: new Color(245, 208, 107, 255), pitch: 1, audio: 'pop_yellow',
    },
    green: {
        key: 'green', name: '绿', hex: '#8FD9A8',
        tint: new Color(143, 217, 168, 255), pitch: 1, audio: 'pop_green',
    },
    cyan: {
        key: 'cyan', name: '青', hex: '#7FD4E0',
        tint: new Color(127, 212, 224, 255), pitch: 1, audio: 'pop_cyan',
    },
    blue: {
        key: 'blue', name: '蓝', hex: '#7FA8E8',
        tint: new Color(127, 168, 232, 255), pitch: 1, audio: 'pop_blue',
    },
    violet: {
        key: 'violet', name: '紫', hex: '#B39AE8',
        tint: new Color(179, 154, 232, 255), pitch: 1, audio: 'pop_violet',
    },
};

export const RAINBOW_AUDIO = 'pop_rainbow';

/** 按颜色烘焙的泡泡纹理（GameManager 启动时加载，Bubble 渲染时使用） */
export const BUBBLE_FRAMES: Record<string, SpriteFrame | null> = {};

/** 彩虹泡泡循环流动使用的颜色序列 */
export const RAINBOW_SEQ: Color[] = [
    new Color(242, 139, 139, 255),
    new Color(245, 178, 107, 255),
    new Color(245, 208, 107, 255),
    new Color(143, 217, 168, 255),
    new Color(127, 212, 224, 255),
    new Color(127, 168, 232, 255),
    new Color(179, 154, 232, 255),
];
