// App —— 三种视图切换：boot（启动加载）→ selfcheck（一键自检）→ flow（T0–T7 主流程）
import React from 'react'
import { useStore } from '@/stores/useStore'
import { BootScreen } from '@/views/BootScreen'
import { SelfCheckScreen } from '@/views/SelfCheckScreen'
import { AppShell } from '@/app/AppShell'

export const App: React.FC = () => {
  const view = useStore((s) => s.view)
  if (view === 'boot') return <BootScreen />
  if (view === 'selfcheck') return <SelfCheckScreen />
  return <AppShell />
}
