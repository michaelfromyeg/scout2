export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json }
  | Json[]

export interface Database {
  public: {
    Tables: {
      wishes: {
        Row: {
          id: number
          inserted_at: string
          name: string
          budget: number | null
          urgency: string
          preferred_brands: string | null
          user_id: string
        }
        Insert: {
          id?: number
          inserted_at?: string
          name: string
          budget?: number | null
          urgency: string
          preferred_brands?: string | null
          user_id: string
        }
        Update: {
          id?: number
          inserted_at?: string
          name?: string
          budget?: number | null
          urgency?: string
          preferred_brands?: string | null
          user_id?: string
        }
      }
      recommendations: {
        Row: {
          id: number
          user_id: string
          wish_id: number
          product_name: string
          product_link: string
          source: string
          product_description: string | null
          product_price: number | null
          created_at: string
        }
        Insert: {
          id?: number
          user_id: string
          wish_id: number
          product_name: string
          product_link: string
          source: string
          product_description?: string | null
          product_price?: number | null
          created_at?: string
        }
        Update: {
          id?: number
          user_id?: string
          wish_id?: number
          product_name?: string
          product_link?: string
          source?: string
          product_description?: string | null
          product_price?: number | null
          created_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
