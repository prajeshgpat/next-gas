import { safeRangeMi } from "@next-gas/core";

export function App() {
  return (
    <main>
      <h1>NextGas</h1>
      <p>Find the cheapest gas you can safely reach on your route.</p>
      <p className="muted">
        Coming soon. Example: with 60 mi of range left, NextGas plans with {safeRangeMi(60)} mi and keeps the rest
        as a reserve.
      </p>
    </main>
  );
}
