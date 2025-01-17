import { GlassContent } from '@glass-lang/glasslib'
import { useEffect, useState } from 'react'
import { render } from 'react-dom'
import { ComposerView } from './ComposerView'
import { HistoryView } from './HistoryView'
import { TopperView } from './TopperView'
import { TranscriptView } from './TranscriptView'
import { lastElement } from './util'

export interface GlassSession {
  id: string
  numMessages: number
  lastMessage: string
}

interface RigState {
  filename: string
  tab: string
}

const vscode = acquireVsCodeApi<RigState>()

const container = document.getElementById('root')

render(<RigView />, container)

function RigView() {
  const tabs: string[] = ['Transcript', 'History']

  const [theme, setTheme] = useState('')
  const [requestId, setRequestId] = useState('')
  const [filename, setFilename] = useState('')
  const [currentSource, setCurrentSource] = useState('')
  const [source, setSource] = useState('')
  const [blocks, setBlocks] = useState<GlassContent[]>([])
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [sessionId, setSession] = useState('')
  const [sessions, setSessions] = useState<GlassSession[]>([])
  const [tab, setTab] = useState(tabs[0])

  const setValue = (key: string, value: string) => {
    console.log('SETTING VALUE', key, value)
    setInputs({ ...inputs, [key]: value })
  }

  const updateInputsWithVariables = (variables: string[], clearAllValues?: boolean) => {
    const newInputs: Record<string, string> = {}
    variables.forEach(v => {
      if (clearAllValues) {
        newInputs[v] = ''
      } else {
        newInputs[v] = inputs[v] || ''
      }
    })
    setInputs(() => newInputs)
  }

  // register a callback for when the extension sends a message
  useEffect(() => {
    const cb = async (event: any) => {
      const message = event.data // The JSON data our extension sent
      switch (message.action) {
        case 'onDidChangeTextDocument':
          setCurrentSource(() => message.data.currentSource)
          break
        case 'setSessions':
          setSessions(() => message.data.sessions)
          break
        case 'setGlass':
          if (message.data.currentSource) {
            setCurrentSource(() => message.data.currentSource)
          }
          if (message.data.source) {
            setSource(() => message.data.source)
          }
          if (message.data.filename) {
            setFilename(() => message.data.filename)
          }
          if (message.data.sessionId) {
            setSession(() => message.data.sessionId)
          }
          if (message.data.theme) {
            setTheme(() => message.data.theme)
          }
          setBlocks(() => message.data.blocks)
          updateInputsWithVariables(message.data.variables)
          if (message.data.variables.length > 0 && !message.data.testing) {
            setTimeout(() => {
              document.getElementById('composer-input-0')?.focus()
            }, 100)
          } else {
            vscode.postMessage({
              action: 'runSession',
              data: {
                inputs: {},
                sessionId: message.data.sessionId,
              },
            })
          }
          break
        case 'onStream':
          if (message.data.sessionId !== sessionId) {
            break
          }
          setBlocks(() => message.data.blocks)
          if (message.data.requestId) {
            setRequestId(() => message.data.requestId)
          }
          break
        case 'onResponse':
          if (message.data.sessionId !== sessionId) {
            break
          }
          setBlocks(() => message.data.blocks)
          break
        default:
          break
      }
    }
    window.addEventListener('message', cb)
    return () => {
      window.removeEventListener('message', cb)
    }
  }, [sessionId, sessions])

  useEffect(() => {
    vscode.postMessage({
      action: 'getCurrentSession',
    })

    window.addEventListener('keydown', event => {
      if (event.metaKey && event.key === 'r') {
        event.preventDefault()
        reload()
      }
    })
  }, [])

  const reload = () => {
    vscode.postMessage({
      action: 'resetSession',
    })
  }

  const run = (inputsToRun: Record<string, string>) => {
    if (!Object.values(inputsToRun).some(v => v.trim().length > 0)) {
      return
    }
    vscode.postMessage({
      action: 'runSession',
      data: {
        inputs: inputsToRun,
        sessionId,
      },
    })
    updateInputsWithVariables(Object.keys(inputsToRun), true)
  }

  const openCurrentSessionFile = () => {
    openSession(sessionId)
  }

  const shareCurrentSessionGist = () => {
    shareSession(sessionId)
  }

  const openSession = (sessionIdToOpen: string) => {
    vscode.postMessage({
      action: 'openSessionFile',
      data: {
        sessionId: sessionIdToOpen,
      },
    })
  }

  const shareSession = (sessionIdToShare: string) => {
    vscode.postMessage({
      action: 'shareSessionGist',
      data: {
        sessionId: sessionIdToShare,
      },
    })
  }

  const openOutput = () => {
    vscode.postMessage({
      action: 'openOutput',
    })
  }

  const stop = () => {
    vscode.postMessage({
      action: 'stopSession',
      data: {
        sessionId,
        requestId,
      },
    })
  }

  useEffect(() => {
    if (tab === 'History') {
      vscode.postMessage({
        action: 'getSessions',
      })
    }
  }, [tab])

  const assistantBlocks = blocks.filter(b => b.tag === 'Assistant')
  const streaming = lastElement(assistantBlocks)?.child?.content.includes('█') === true
  const dirty = source !== currentSource

  return (
    <div
      style={{
        flexDirection: 'column',
        display: 'flex',
        height: '100%',
        width: '100%',
        overflow: 'hidden',
      }}
    >
      <TopperView
        openCurrentSessionFile={openCurrentSessionFile}
        shareCurrentSessionGist={shareCurrentSessionGist}
        dirty={dirty}
        reloadable={assistantBlocks.length > 0 || dirty}
        tab={tab}
        setTab={setTab}
        tabs={tabs}
        filename={filename}
        reload={reload}
        openOutput={openOutput}
      />
      {tab === 'Transcript' && <TranscriptView sessionId={sessionId} blocks={blocks} />}
      {/* {tab === 'State' && <StateView />} */}
      {tab === 'History' && <HistoryView openSession={openSession} sessions={sessions} />}
      {tab === 'Transcript' && (
        <ComposerView
          theme={theme}
          reload={reload}
          run={run}
          stop={stop}
          streaming={streaming}
          inputs={inputs}
          setValue={setValue}
        />
      )}
    </div>
  )
}
