import { useEffect, useState } from 'react';

type HelloResponse = {
  message: string;
};

function App() {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadMessage() {
      try {
        const response = await fetch('/api/hello', {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`The API returned HTTP ${response.status}`);
        }

        const data = (await response.json()) as HelloResponse;
        setMessage(data.message);
      } catch (requestError) {
        if (requestError instanceof Error && requestError.name !== 'AbortError') {
          setError(requestError.message);
        }
      }
    }

    void loadMessage();

    return () => controller.abort();
  }, []);

  return (
    <main className="page-shell">
      <section className="welcome-card" aria-labelledby="page-title">
        <p className="eyebrow">HelloHacks · Team 13</p>
        <h1 id="page-title">Your full-stack starter is ready.</h1>
        <p className="intro">
          This React page is talking to a Node.js server through an Express API.
        </p>

        <div className="api-panel" aria-live="polite">
          <span className="api-label">Message from the backend</span>
          {message ? (
            <p className="api-message">{message}</p>
          ) : error ? (
            <p className="api-error">Could not reach the API: {error}</p>
          ) : (
            <p className="api-pending">Connecting to the API…</p>
          )}
        </div>
      </section>
    </main>
  );
}

export default App;
