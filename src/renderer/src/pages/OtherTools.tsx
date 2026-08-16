import { useState } from 'react'
import { Image as ImageIcon, Square, ScanSearch } from 'lucide-react'
import ImageEditor from '@/components/tools/ImageEditor'
import WhiteBgGenerator from '@/components/tools/WhiteBgGenerator'

interface ToolCard {
  icon: typeof ImageIcon
  title: string
  desc: string
  detail: string
  /** 点击卡片进入的功能组件(可选) */
  component?: React.ComponentType<{ onBack: () => void }>
}

const toolCards: ToolCard[] = [
  {
    icon: ImageIcon,
    title: '图片编辑',
    desc: '对商品图进行编辑处理',
    detail: '简单图片编辑工具',
    component: ImageEditor
  },
  {
    icon: Square,
    title: '白底图生成',
    desc: '一键生成纯白背景商品图',
    detail: '去除原图背景，生成符合电商平台规范的白底商品主图，适合搜索展示。',
    component: WhiteBgGenerator
  },
  {
    icon: ScanSearch,
    title: '反推提示词',
    desc: '从图片反推画面描述',
    detail: 'AI 识别图片内容，自动生成可直接用于生图模型的详细提示词。'
  }
]

/** 其他功能页:工具卡片(uiverse 风格信封卡片,主题色) */
export default function OtherTools() {
  const [activeTool, setActiveTool] = useState<string | null>(null)

  // 卡片视图
  if (activeTool === 'image-editor') {
    return <ImageEditor onBack={() => setActiveTool(null)} />
  }
  if (activeTool === 'white-bg') {
    return <WhiteBgGenerator onBack={() => setActiveTool(null)} />
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: '32px' }}>
        <h1 style={{
          fontSize: '28px',
          fontWeight: 700,
          color: 'var(--fg)',
          margin: '0 0 8px 0',
          fontFamily: 'var(--font-display)'
        }}>
          其他功能
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--fg-muted)', margin: 0 }}>
          更多实用工具
        </p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '24px',
        maxWidth: '1100px',
        margin: '0 auto'
      }}>
        {toolCards.map((card) => {
          const Icon = card.icon
          const clickable = !!card.component
          return (
            <div
              key={card.title}
              className="tool-card-group"
              style={{ height: '280px', cursor: clickable ? 'pointer' : 'default' }}
              onClick={() => {
                if (card.title === '图片编辑') setActiveTool('image-editor')
                if (card.title === '白底图生成') setActiveTool('white-bg')
              }}
            >
              {/* 虚线外框 */}
              <span style={{
                position: 'absolute',
                inset: 0,
                border: '2px dashed var(--brand)',
                opacity: 0.45,
                borderRadius: 'var(--radius-lg)'
              }} />
              {/* 卡片主体 */}
              <div
                className="tool-card"
                style={{
                  position: 'relative',
                  display: 'flex',
                  height: '100%',
                  width: '100%',
                  alignItems: 'flex-end',
                  border: '2px solid var(--brand)',
                  background: 'var(--bg-surface)',
                  borderRadius: 'var(--radius-lg)',
                  overflow: 'hidden'
                }}
              >
                {/* 正面内容(默认可见,hover 时淡出) */}
                <div className="tool-front" style={{
                  padding: '20px',
                  width: '100%',
                  color: 'var(--fg)'
                }}>
                  <Icon size={44} style={{ color: 'var(--brand)' }} />
                  <h2 style={{
                    margin: '14px 0 0 0',
                    fontSize: '20px',
                    fontWeight: 500,
                    color: 'var(--fg)'
                  }}>
                    {card.title}
                  </h2>
                  <p style={{
                    margin: '8px 0 0 0',
                    fontSize: '13px',
                    color: 'var(--fg-muted)'
                  }}>
                    {card.desc}
                  </p>
                </div>

                {/* 背面内容(hover 时显现) */}
                <div className="tool-back" style={{
                  padding: '20px',
                  width: '100%',
                  color: 'var(--fg)'
                }}>
                  <h3 style={{
                    margin: '0',
                    fontSize: '20px',
                    fontWeight: 500,
                    color: 'var(--fg)'
                  }}>
                    {card.title}
                  </h3>
                  <p style={{
                    margin: '12px 0 0 0',
                    fontSize: '13px',
                    lineHeight: 1.7,
                    color: 'var(--fg-secondary)'
                  }}>
                    {card.detail}
                  </p>
                  <p style={{
                    margin: '24px 0 0 0',
                    fontWeight: 700,
                    fontSize: '13px',
                    color: 'var(--brand)'
                  }}>
                    {clickable ? '立即使用 →' : '敬请期待 →'}
                  </p>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
