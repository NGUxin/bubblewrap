import { Color } from 'cc';

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
        key: 'red', name: '红', hex: '#FF5B5B',
        tint: new Color(255, 91, 91, 255), pitch: 0.85, audio: 'pop_red',
    },
    orange: {
        key: 'orange', name: '橙', hex: '#FF9F43',
        tint: new Color(255, 159, 67, 255), pitch: 0.93, audio: 'pop_orange',
    },
    yellow: {
        key: 'yellow', name: '黄', hex: '#FFD23F',
        tint: new Color(255, 210, 63, 255), pitch: 1.0, audio: 'pop_yellow',
    },
    green: {
        key: 'green', name: '绿', hex: '#3ECF6A',
        tint: new Color(62, 207, 106, 255), pitch: 1.08, audio: 'pop_green',
    },
    cyan: {
        key: 'cyan', name: '青', hex: '#33C9E8',
        tint: new Color(51, 201, 232, 255), pitch: 1.16, audio: 'pop_cyan',
    },
    blue: {
        key: 'blue', name: '蓝', hex: '#4D7CFE',
        tint: new Color(77, 124, 254, 255), pitch: 1.25, audio: 'pop_blue',
    },
    violet: {
        key: 'violet', name: '紫', hex: '#A86BFF',
        tint: new Color(168, 107, 255, 255), pitch: 1.35, audio: 'pop_violet',
    },
};

export const RAINBOW_AUDIO = 'pop_rainbow';

/** 彩虹泡泡循环流动使用的颜色序列 */
export const RAINBOW_SEQ: Color[] = [
    new Color(255, 91, 91, 255),
    new Color(255, 159, 67, 255),
    new Color(255, 210, 63, 255),
    new Color(62, 207, 106, 255),
    new Color(51, 201, 232, 255),
    new Color(77, 124, 254, 255),
    new Color(168, 107, 255, 255),
];
