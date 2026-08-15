/** 主图/详情图统一尺寸选项(与单图流程一致) */
export const MAIN_DETAIL_SIZE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '1:1', label: '1:1 正方形' },
  { value: '2:3', label: '2:3 竖版' },
  { value: '3:2', label: '3:2 横版' },
  { value: '3:4', label: '3:4 竖版' },
  { value: '4:3', label: '4:3 横版' },
  { value: '4:5', label: '4:5 竖版' },
  { value: '5:4', label: '5:4 横版' },
  { value: '9:16', label: '9:16 手机竖屏' },
  { value: '16:9', label: '16:9 宽屏' },
  { value: '21:9', label: '21:9 超宽屏' },
  { value: '4:1', label: '4:1 超宽横版' },
  { value: '1:4', label: '1:4 超长竖版' },
  { value: '8:1', label: '8:1 全景横版' },
  { value: '1:8', label: '1:8 全景竖版' }
]

/** 目标平台选项(与单图流程一致) */
export const PLATFORM_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'taobao', label: '淘宝' },
  { value: 'tmall', label: '天猫' },
  { value: 'jd', label: '京东' },
  { value: 'pinduoduo', label: '拼多多' },
  { value: 'douyin', label: '抖音' },
  { value: 'xiaohongshu', label: '小红书' },
  { value: 'kuaishou', label: '快手' }
]
