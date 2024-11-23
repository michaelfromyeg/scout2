import { Database } from '@/lib/schema'
import { Session, useSupabaseClient } from '@supabase/auth-helpers-react'
import { useEffect, useState } from 'react'

type Wish = Database['public']['Tables']['wishes']['Row']
type Recommendation = Database['public']['Tables']['recommendations']['Row']

export default function WishList({ session }: { session: Session }) {
  const supabase = useSupabaseClient<Database>()
  const [wishes, setWishes] = useState<Wish[]>([])
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [newWish, setNewWish] = useState({
    name: '',
    budget: '',
    urgency: '',
    preferredBrands: '',
  })
  const [errorText, setErrorText] = useState<string>('')

  const user = session.user

  useEffect(() => {
    const fetchWishes = async () => {
      const { data: wishes, error } = await supabase
        .from('wishes')
        .select('*')
        .order('id', { ascending: true })

      if (error) console.log('error', error)
      else setWishes(wishes)
    }

    const fetchRecommendations = async () => {
      const { data: recommendations, error } = await supabase
        .from('recommendations')
        .select('*')
        .order('created_at', { ascending: true })

      if (error) console.log('error', error)
      else setRecommendations(recommendations)
    }

    fetchWishes()
    fetchRecommendations()

    const wishSubscription = supabase
      .channel('realtime:wishes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'wishes' },
        (payload) => {
          setWishes((prev) => [...prev, payload.new as Wish])
        }
      )
      .subscribe()

    const recommendationSubscription = supabase
      .channel('realtime:recommendations')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'recommendations' },
        (payload) => {
          setRecommendations((prev) => [...prev, payload.new as Recommendation])
        }
      )
      .subscribe()

    return () => {
      wishSubscription.unsubscribe()
      recommendationSubscription.unsubscribe()
    }
  }, [supabase])

  const addWish = async () => {
    const { name, budget, urgency, preferredBrands } = newWish
    if (name.trim()) {
      const { data: wish, error } = await supabase
        .from('wishes')
        .insert({
          name: name.trim(),
          budget: parseFloat(budget) || null,
          urgency,
          preferred_brands: preferredBrands.trim() || null,
          user_id: user.id,
        })
        .select()
        .single()

      if (error) {
        setErrorText(error.message)
      } else {
        // NOTE: supabase is doing this for us from the realtime stuff!
        // setWishes([...wishes, wish])

        setNewWish({ name: '', budget: '', urgency: '', preferredBrands: '' })
      }
    }
  }

  const deleteWish = async (id: number) => {
    try {
      await supabase.from('wishes').delete().eq('id', id).throwOnError()
      setWishes(wishes.filter((x) => x.id !== id))
      setRecommendations(recommendations.filter((r) => r.wish_id !== id))
    } catch (error) {
      console.log('error', error)
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6 bg-gray-100 min-h-screen">
      <h1 className="text-3xl font-bold text-center mb-8 text-gray-800">Your Wishlist</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          addWish()
        }}
        className="bg-white shadow-md rounded-lg p-6 mb-8"
      >
        <h2 className="text-xl font-semibold text-gray-800 mb-4">Add a New Wish</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <input
            className="border border-gray-300 rounded-lg p-3"
            type="text"
            placeholder="Item name"
            value={newWish.name}
            onChange={(e) => setNewWish({ ...newWish, name: e.target.value })}
          />
          <input
            className="border border-gray-300 rounded-lg p-3"
            type="number"
            placeholder="Budget (max price)"
            value={newWish.budget}
            onChange={(e) => setNewWish({ ...newWish, budget: e.target.value })}
          />
          <select
            className="border border-gray-300 rounded-lg p-3"
            value={newWish.urgency}
            onChange={(e) => setNewWish({ ...newWish, urgency: e.target.value })}
          >
            <option value="">Select urgency</option>
            <option value="asap">ASAP</option>
            <option value="can_wait">Can wait</option>
          </select>
          <input
            className="border border-gray-300 rounded-lg p-3"
            type="text"
            placeholder="Preferred brands (optional)"
            value={newWish.preferredBrands}
            onChange={(e) => setNewWish({ ...newWish, preferredBrands: e.target.value })}
          />
        </div>
        <button
          type="submit"
          className="mt-4 bg-blue-500 text-white py-2 px-6 rounded-lg hover:bg-blue-600 transition"
        >
          Add Wish
        </button>
      </form>
      {!!errorText && <Alert text={errorText} />}
      <ul className="space-y-6">
        {wishes.map((wish) => (
          <Item
            key={wish.id}
            wish={wish}
            recommendations={recommendations.filter((r) => r.wish_id === wish.id)}
            onDelete={() => deleteWish(wish.id)}
          />
        ))}
      </ul>
    </div>
  )
}

const Item = ({
  wish,
  recommendations,
  onDelete,
}: {
  wish: Wish
  recommendations: Recommendation[]
  onDelete: () => void
}) => (
  <li className="bg-white shadow-md rounded-lg p-6">
    <div className="flex justify-between items-center">
      <div>
        <h3 className="text-xl font-semibold text-gray-800">{wish.name}</h3>
        <p className="text-gray-600">Budget: ${wish.budget || 'N/A'}</p>
        <p className="text-gray-600">Urgency: {wish.urgency}</p>
        {wish.preferred_brands && (
          <p className="text-gray-600">Preferred Brands: {wish.preferred_brands}</p>
        )}
      </div>
      <button
        onClick={onDelete}
        className="bg-red-500 text-white py-2 px-4 rounded-lg hover:bg-red-600 transition"
      >
        Delete
      </button>
    </div>
    <div className="mt-4">
      <h4 className="text-lg font-semibold text-gray-800">Recommendations</h4>
      <ul className="mt-2 space-y-2">
        {recommendations.length > 0 ? (
          recommendations.map((rec) => (
            <li key={rec.id} className="flex justify-between items-center">
              <a
                href={rec.product_link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:underline"
              >
                {rec.product_name}
              </a>
              <span className="text-gray-600">
                {rec.product_price ? `$${rec.product_price}` : 'Price N/A'} ({rec.source})
              </span>
            </li>
          ))
        ) : (
          <li className="text-gray-600">No recommendations yet.</li>
        )}
      </ul>
    </div>
  </li>
)

const Alert = ({ text }: { text: string }) => (
  <div className="rounded-md bg-red-100 p-4 my-3">
    <div className="text-sm text-red-700">{text}</div>
  </div>
)
