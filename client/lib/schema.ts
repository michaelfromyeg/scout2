export interface Database {
  public: {
    Tables: {
      recommendations: {
        Row: {
          id: number;
          user_id: string;
          wish_id: number;
          product_name: string;
          product_link: string;
          source: string;
          product_description: string | null;
          product_price: number | null;
          approved: boolean;
          created_at: string;
        };
        Insert: {
          id?: number;
          user_id: string;
          wish_id: number;
          product_name: string;
          product_link: string;
          source: string;
          product_description?: string | null;
          product_price?: number | null;
          approved?: boolean;
          created_at?: string;
        };
        Update: {
          id?: number;
          user_id?: string;
          wish_id?: number;
          product_name?: string;
          product_link?: string;
          source?: string;
          product_description?: string | null;
          product_price?: number | null;
          approved?: boolean; // New column
          created_at?: string;
        };
      };
    };
  };
}
