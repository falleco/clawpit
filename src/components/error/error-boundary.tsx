import { relaunch } from '@tauri-apps/plugin-process';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = {
    hasError: false,
    message: '',
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || 'Unknown application error',
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Unhandled UI error:', error, errorInfo);
  }

  private handleTryAgain = () => {
    this.setState({
      hasError: false,
      message: '',
    });
  };

  private handleRestart = async () => {
    try {
      await relaunch();
    } catch (error) {
      console.error('Failed to relaunch app:', error);
      window.location.reload();
    }
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
        <Card className="w-full max-w-xl border-destructive/40">
          <CardHeader>
            <CardTitle>Something went wrong</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Clawpit hit an unexpected error. You can try to recover without
              losing data.
            </p>
            <pre className="rounded-md bg-muted p-3 text-xs overflow-auto whitespace-pre-wrap">
              {this.state.message}
            </pre>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={this.handleTryAgain}>
                Try again
              </Button>
              <Button onClick={this.handleRestart}>Restart app</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
}

export default ErrorBoundary;
