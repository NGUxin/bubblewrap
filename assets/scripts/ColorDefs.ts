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
        key: 'red', name: '红', hex: '#FF4D5E',
        tint: new Color(255, 77, 94, 255), pitch: 1, audio: 'pop_red',
    },
    orange: {
        key: 'orange', name: '橙', hex: '#FF9F45',
        tint: new Color(255, 159, 69, 255), pitch: 1, audio: 'pop_orange',
    },
    yellow: {
        key: 'yellow', name: '黄', hex: '#FFD23F',
        tint: new Color(255, 210, 63, 255), pitch: 1, audio: 'pop_yellow',
    },
    green: {
        key: 'green', name: '绿', hex: '#2ECC71',
        tint: new Color(46, 204, 113, 255), pitch: 1, audio: 'pop_green',
    },
    cyan: {
        key: 'cyan', name: '青', hex: '#2BD9E8',
        tint: new Color(43, 217, 232, 255), pitch: 1, audio: 'pop_cyan',
    },
    blue: {
        key: 'blue', name: '蓝', hex: '#3D7BFF',
        tint: new Color(61, 123, 255, 255), pitch: 1, audio: 'pop_blue',
    },
    violet: {
        key: 'violet', name: '紫', hex: '#9B5CFF',
        tint: new Color(155, 92, 255, 255), pitch: 1, audio: 'pop_violet',
    },
};

export const RAINBOW_AUDIO = 'pop_rainbow';

/** 按颜色烘焙的泡泡纹理（GameManager 启动时加载，Bubble 渲染时使用） */
export const BUBBLE_FRAMES: Record<string, SpriteFrame | null> = {};

/** 彩虹泡泡循环流动使用的颜色序列 */
export const RAINBOW_SEQ: Color[] = [
    new Color(255, 77, 94, 255),
    new Color(255, 159, 69, 255),
    new Color(255, 210, 63, 255),
    new Color(46, 204, 113, 255),
    new Color(43, 217, 232, 255),
    new Color(61, 123, 255, 255),
    new Color(155, 92, 255, 255),
];
