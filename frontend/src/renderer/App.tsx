import { useEffect } from 'react'
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

export default function App() {
  const { screen, setBackendPort } = useAppStore()

  useEffect(() => {
    window.electronAPI?.getBackendPort().then((port) => {
      setBackendPort(port)
    })
  }, [setBackendPort])

  return (
    <div className="h-screen bg-bg-dark flex flex-col overflow-hidden">
      {screen === 'home' && <HomeScreen />}
      {screen === 'scanning' && <ScanProgressScreen />}
      {screen === 'results' && <ResultsScreen />}
      {screen === 'delete-confirm' && <DeleteConfirmScreen />}
      {screen === 'delete-complete' && <DeleteCompleteScreen />}
    </div>
  )
}
