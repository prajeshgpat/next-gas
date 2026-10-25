import { safeRangeMi } from "@nextgas/core";

const EXAMPLE_RANGE_MI = 120;

export default function Home(): React.JSX.Element {
  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="text-3xl font-bold">NextGas</h1>
      <p className="mt-2">Fill now, or a cheaper station you can safely reach?</p>
      <p className="mt-4 text-sm text-gray-600">
        With {EXAMPLE_RANGE_MI} mi left, plan within {safeRangeMi(EXAMPLE_RANGE_MI)} mi.
      </p>
    </main>
  );
}
