import { supabase } from '.';
import { Recommendation, Wish } from './types';

/**
 * Writes a recommendation to the recommendations table.
 * 
 * @param wish - The Wish object containing the wish_id and user_id.
 * @param recommendation - The details of the recommendation.
 * @returns A Promise resolving to the inserted recommendation or an error.
 */
export async function writeRecommendation(
  wish: Wish,
  recommendation: Recommendation
): Promise<void> {
  try {
    console.log("writeRecommendation", {
      user_id: wish.user_id,
      wish_id: wish.id,
      product_name: recommendation.product_name,
      product_link: recommendation.product_link,
      source: recommendation.source,
      product_description: recommendation.product_description || null,
      product_price: recommendation.product_price || null,
    })
    const { data, error } = await supabase
      .from('recommendations')
      .insert({
        user_id: wish.user_id,
        wish_id: wish.id,
        product_name: recommendation.product_name,
        product_link: recommendation.product_link,
        source: recommendation.source,
        product_description: recommendation.product_description || null,
        product_price: recommendation.product_price || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Error inserting recommendation:', error.message);
      throw new Error(error.message);
    }

    console.log('Inserted recommendation:', data);
  } catch (err) {
    console.error('Unexpected error writing recommendation:', err);
    throw err;
  }
}
