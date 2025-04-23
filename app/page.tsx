import LiquidityForm from "./liquidity-form"

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50 py-10">
      <div className="container mx-auto px-4">
        <h1 className="text-3xl font-bold text-center mb-8">Client Liquidity Optimization</h1>
        <LiquidityForm />
      </div>
    </main>
  )
}
