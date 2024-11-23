import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

import { browse } from './ai';
import { WISH_0 } from './mocks';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Initialize Supabase client
const supabase = createClient(supabaseUrl, supabaseKey, {
  realtime: {
    params: {
      eventsPerSecond: 10, // Limit the number of events processed per second
    },
  },
});

// Placeholder for AI agent trigger
const triggerAIProcessing = async (wish: any) => {
  console.log('Processing new wish:', wish);
  // TODO(michaelfromyeg): Integrate AI agent logic here
};

(async () => {
  console.log('Starting real-time listener for wishes table...');

  browse("anthropic", WISH_0);

  // TODO(michaelfromyeg): once the AI thing is polished, integrate real-time
  /*
  const channel = supabase
    .channel('realtime:wishes')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'wishes' },
      (payload) => {
        console.log('New wish inserted:', payload.new);
        // Trigger the AI processing logic
        triggerAIProcessing(payload.new);
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('Subscribed to real-time updates for wishes table.');
      } else { // '"TIMED_OUT" | "CLOSED" | "CHANNEL_ERROR"' and '"ERROR"'
        console.error(`Error ${status} while subscribing to real-time updates.`);
      }
    });

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('Unsubscribing from real-time updates...');
    await channel.unsubscribe();
    process.exit(0);
  });
  */

})();
