import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { C } from '../tokens'

type Props = {
  children: ReactNode
  /** Optional label shown in the fallback, e.g. the page name. */
  label?: string
}

type State = {
  error: Error | null
}

/**
 * Catches render-time errors so a single broken page never white-screens the
 * whole app. Class component — React has no functional equivalent yet.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surfaced here so it reaches the console (and any future error tracker)
    console.error('ErrorBoundary caught:', error, info.componentStack)
  }

  handleRetry = () => {
    this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="flex items-center justify-center min-h-[60vh] px-6">
        <div
          className="max-w-md w-full text-center rounded-2xl p-8"
          style={{ border: `1px solid ${C.BORDER}`, backgroundColor: '#fff' }}
        >
          <div
            className="w-12 h-12 rounded-2xl mx-auto mb-4 flex items-center justify-center"
            style={{ backgroundColor: '#FEF2F2' }}
          >
            <AlertTriangle className="w-6 h-6" style={{ color: C.RED }} />
          </div>
          <h2 className="text-lg font-bold mb-1" style={{ color: C.TEXT }}>
            {this.props.label ? `${this.props.label} hit a snag` : 'Something went wrong'}
          </h2>
          <p className="text-sm mb-6" style={{ color: C.TEXT_MUTED }}>
            An unexpected error occurred while rendering this view. Your data is safe —
            try again, or reload the page if the problem persists.
          </p>
          <button
            type="button"
            onClick={this.handleRetry}
            className="btn-primary px-5 py-2 inline-flex items-center gap-2 text-sm"
          >
            <RotateCcw className="w-4 h-4" /> Try again
          </button>
        </div>
      </div>
    )
  }
}
