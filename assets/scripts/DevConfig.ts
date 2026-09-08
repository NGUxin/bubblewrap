import { DEBUG } from 'cc/env';

/**
 * 开发者模式开关：
 * - 预览 / debug 构建（CC_DEBUG=true）→ 开放“选择关卡”等开发工具；
 * - 正式发布构建（不勾 debug）→ 自动剔除开发入口，玩家只能走正式流程。
 */
export const IS_DEV = DEBUG;
