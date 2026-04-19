import { useEffect, Component, type ReactNode } from 'react'
import { useAppStore } from './stores/appStore'
import HomeScreen from './components/HomeScreen'
import ScanProgressScreen from './components/ScanProgressScreen'
import ResultsScreen from './components/ResultsScreen'
import DeleteConfirmScreen from './components/DeleteConfirmScreen'
import DeleteCompleteScreen from './components/DeleteCompleteScreen'

declare global {
  interface Window {
    electronAPI: {
      selectFolder: () => Promise<string | null>
      getBackendPort: () => Promise<number>
      openFileLocation: (filePath: string) => Promise<void>
      openLogsFolder: () => Promise<void>
    }
  }
}

// ── Error boundary: catches render crashes in child screens ──────────────────
interface EBState { hasError: boolean; message: string }
class ScreenErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  state: EBState = { hasError: false, message: '' }
  static getDerivedStateFromError(err: Error): EBState {
    return { hasError: true, message: err.message }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 flex items-center justify-center flex-col gap-4 p-8 text-center">
          <p className="text-red-400 font-semibold">画面の表示中にエラーが発生しました</p>
          <p className="text-xs text-text-muted font-mono break-all max-w-lg">{this.state.message}</p>
          <button
            className="px-4 py-2 bg-primary text-white rounded-lg text-sm"
            onClick={() => {
              this.setState({ hasError: false, message: '' })
              useAppStore.getState().reset()
            }}
          >
            ホームに戻る
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

// ── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const { screen, setBackendPort } = useAppStore()

  useEffect(() => {
    window.electronAPI?.getBackendPort().then((port) => {
      setBackendPort(port)
    })
  }, [setBackendPort])

  return (
    <div className="h-screen bg-bg-dark flex flex-col overflow-hidden">
      <ScreenErrorBoundary>
        {screen === 'home'           && <HomeScreen />}
        {screen === 'scanning'       && <ScanProgressScreen />}
        {screen === 'results'        && <ResultsScreen />}
        {screen === 'delete-confirm' && <DeleteConfirmScreen />}
        {screen === 'delete-complete'&& <DeleteCompleteScreen />}
      </ScreenErrorBoundary>
    </div>
  )
}
