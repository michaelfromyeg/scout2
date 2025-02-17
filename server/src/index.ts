import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

import { browse, buy } from './ai';
import { Recommendation, Wish } from './types';
// import { WISH_0 } from './mocks';

dotenv.config();

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Please set the SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.');
  process.exit(1);
}

if (!process.env.BROWSERBASE_API_KEY) {
  console.error('Please set the BROWSERBASE_API_KEY environment variable.');
  process.exit(1);
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Please set the ANTHROPIC_API_KEY environment variable.');
  process.exit(1);
}

if (!process.env.EXA_API_KEY) {
  console.error('Please set the EXA_API_KEY environment variable.');
  process.exit(1);
}

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseKey, {
  realtime: {
    params: {
      eventsPerSecond: 10,
    }
  },
});

const triggerAIProcessing = async (wish: Wish) => {
  console.log('Processing new wish:', wish);

  await Promise.all([
    // browse("anthropic", wish),
    browse("browserbase", wish),
    browse("exa", wish),
  ])
};

const triggerAIProcessingPostApproval = async (recommendation: Recommendation) => {
  console.log("Would process new recommendation:", recommendation);

  await Promise.all([
    buy(recommendation)
  ])
}

// if __name__ == "__main__" ...
(async () => {
  console.log('Starting real-time listener for wishes table...');

  // NOTE: this is for testing; feel free to comment out the real-time stuff and just browse with mocks
  // browse("anthropic", WISH_0);
  // browse("browserbase", WISH_0)
  // browse("exa", wish)

  // buy({
  //   product_name: "40\" Samsung 1080p LCD TV",
  //   product_link: "https://sfbay.craigslist.org/eby/ele/d/canyon-40-samsung-1080p-lcd-tv/7803231871.html",
  //   source: "browserbase",
  // })

  // TODO(michaelfromyeg): once the AI thing is polished, integrate real-time
  const channel = supabase
    .channel('realtime:wishes')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'wishes' },
      (payload) => {
        console.log('New wish inserted:', payload.new);
        triggerAIProcessing(payload.new as Wish);
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('Subscribed to real-time updates for wishes table.');
      } else { // '"TIMED_OUT" | "CLOSED" | "CHANNEL_ERROR"' and '"ERROR"'
        console.error(`Error ${status} while subscribing to real-time updates.`);
      }
    });


  const channel2 = supabase
    .channel('realtime:recommendations')
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'recommendations', filter: 'approved=eq.true' },
      (payload) => {
        console.log('Recommendation approved:', payload.new);

        // Trigger AI processing again based on the approved recommendation
        const approvedRecommendation = payload.new as Recommendation;
        triggerAIProcessingPostApproval(approvedRecommendation);
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('Subscribed to real-time updates for approved recommendations.');
      } else {
        console.error(`Error ${status} while subscribing to real-time updates.`);
      }
    });

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('Unsubscribing from real-time updates...');
    await channel.unsubscribe();
    await channel2.unsubscribe();
    process.exit(0);
  });
})();
