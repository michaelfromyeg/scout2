import Head from 'next/head'
import { useSession, useSupabaseClient } from '@supabase/auth-helpers-react'
import { Auth, ThemeSupa } from '@supabase/auth-ui-react'
import WishList from '@/components/WishList'

export default function Home() {
  const session = useSession()
  const supabase = useSupabaseClient()

  return (
    <>
      <Head>
        <title>Scout2</title>
        <meta name="description" content="Shop, while you drop." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link
          rel="icon"
          href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🛒</text></svg>"
        ></link>
      </Head>
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 flex items-center justify-center p-10">
        {!session ? (
          <div className="w-full max-w-md bg-white rounded-lg shadow-lg p-8">
            <h1 className="text-3xl font-bold text-gray-800 text-center mb-6">
              Welcome to Scout2
            </h1>
            <p className="text-gray-600 text-center mb-4">
              Your AI-powered shopping assistant
            </p>
            <Auth
              supabaseClient={supabase}
              appearance={{
                theme: ThemeSupa,
              }}
              theme="dark"
            />
          </div>
        ) : (
          <div className="w-full max-w-4xl p-6 bg-white rounded-lg shadow-lg">
            <WishList session={session} />
            <div className="text-center mt-8">
              <button
                className="bg-red-500 text-white py-2 px-6 rounded-lg hover:bg-red-600 transition"
                onClick={async () => {
                  const { error } = await supabase.auth.signOut()
                  if (error) console.log('Error logging out:', error.message)
                }}
              >
                Logout
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
