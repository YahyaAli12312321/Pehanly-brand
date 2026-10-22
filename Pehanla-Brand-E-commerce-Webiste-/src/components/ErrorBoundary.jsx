import React from 'react';

export default class ErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    if (import.meta.env.DEV) console.error(error); // never log request bodies / PII
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="max-w-xl mx-auto px-6 py-24 text-center">
        <h1 className="font-headline text-2xl font-bold text-primary mb-3">Something went wrong</h1>
        <p className="text-muted mb-6">This page could not be displayed. Please refresh, or return to the homepage.</p>
        <a href="/" className="inline-block px-6 py-3 rounded-xl bg-primary text-white font-headline text-sm font-semibold">
          Back to home
        </a>
      </div>
    );
  }
}
