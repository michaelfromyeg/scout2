import { chromium } from "playwright-core";

import Anthropic from '@anthropic-ai/sdk';


export async function browse(source: "browserbase" | "anthropic" | "exa", wish: any) {
  switch (source) {
    case "browserbase":
      await useBrowserbase(wish);
      break;
    case "anthropic":
      await useAnthropic(wish);
      break;
    case "exa":
      await useExa(wish);
      break;
    default:
      console.error("Invalid source:", source);
  }
}

/**
 * Check Facebook Marketplace and Craigslist for the user's item.
 * 
 * NOTE: since I only have ~10 free sessions (total!), I need to wait and see if I can get
 * hobby tier access before continuing. This is just a stub for now.
 * 
 * @param wish 
 */
async function useBrowserbase(wish: any) {
  try {
    console.log("Beginning a search for", wish)

    const browser = await chromium.connectOverCDP(
      `wss://connect.browserbase.com?apiKey=${process.env.BROWSERBASE_API_KEY}`
    );

    const defaultContext = browser.contexts()[0];
    const page = defaultContext.pages()[0];

    await page.goto("https://browserbase.com/");
    await page.close();
    await browser.close();
  } catch (error) {
    console.error((error as any).message);
  }
}

async function useAnthropic(wish: any) {
  console.log("Using Anthropic to find", wish);

  const anthropic = new Anthropic();

  const message = await anthropic.beta.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 1024,
    tools: [
      {
        type: "computer_20241022",
        name: "computer",
        display_width_px: 1024,
        display_height_px: 768,
        display_number: 1
      },
      {
        type: "text_editor_20241022",
        name: "str_replace_editor"
      },
      {
        type: "bash_20241022",
        name: "bash"
      }
    ],
    messages: [{ role: "user", content: "Save a picture of a cat to my desktop." }],
    betas: ["computer-use-2024-10-22"],
  });

  console.log(message);
}

async function useExa(wish: any) {
  console.log("Using Exa to find", wish);
}
