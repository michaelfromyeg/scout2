export interface Wish {
  id: number
  inserted_at: string
  name: string
  budget: number | null
  urgency: string
  preferred_brands: string | null
  user_id: string
}

export interface Recommendation {
  product_name: string;
  product_link: string;
  source: 'exa' | 'anthropic' | 'browserbase';
  product_description?: string;
  product_price?: number;
}
