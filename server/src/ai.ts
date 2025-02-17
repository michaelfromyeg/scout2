import Anthropic from '@anthropic-ai/sdk';
import Exa from "exa-js";
import { IS_PRODUCTION } from "./constants";
import { writeRecommendation } from "./supabase";
import { Recommendation, Wish } from "./types";
// import { EXA_RECOMMENDATION_0 } from "./mocks";

import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod";

export async function browse(source: "browserbase" | "anthropic" | "exa", wish: Wish) {
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

export async function buy(recommendation: Recommendation) {
  console.log("Reaching out about recommendation", recommendation)

  async function getEmail(stagehand: Stagehand) {
    await stagehand.act({ action: "click on the 'reply' button (it has class='reply-button js-only') AND WAIT" })
    const seen = await stagehand.observe();
    console.log(seen);
    await stagehand.act({ action: "click on the 'email' button (it's the first button with class='reply-option-header' AND WAIT" })
    const seen2 = await stagehand.observe();
    console.log(seen2);

    const contact = await stagehand.extract({
      instruction: "extract the mailto link (it's in the div with class='reply-email-address')",
      schema: z.object({
        email: z.string(),
      }),
    });

    console.log("Kick-off contacting", contact)
  }

  try {
    console.log("IS_PRODUCTION", IS_PRODUCTION)

    // only run in actual browserbase in prod
    const stagehand = new Stagehand({
      env: IS_PRODUCTION ? "BROWSERBASE" : "LOCAL",
      apiKey: process.env.BROWSERBASE_API_KEY,

      enableCaching: false,
      verbose: 2,
      debugDom: true,

      browserBaseSessionCreateParams: {
        projectId: process.env.BROWSERBASE_PROJECT_ID ?? "",
        browserSettings: {
          fingerprint: {
            devices: ["desktop"],
            locales: ["en-US"],
            operatingSystems: ["macos"],
          },
          context: {
            id: "71bf7583-6922-4e61-ab8e-8885d584b13a",
            persist: true,
          }
        },
        proxies: [
          {
            "type": "browserbase",
            "geolocation": {
              "city": "San Francisco",
              "state": "CA",
              "country": "US"
            }
          }
        ]
      }
    });
    await stagehand.init({
      modelName: "claude-3-5-sonnet-latest",
    });

    await stagehand.page.goto(recommendation.product_link, { timeout: 60_000 });

    stagehand.page.on("console", (msg: any) => {
      if (msg.text() == "browserbase-solving-started") {
        console.log("Captcha Solving In Progress");
      } else if (msg.text() == "browserbase-solving-finished") {
        console.log("Captcha Solving Completed");
        getEmail(stagehand)
      }
    });

    getEmail(stagehand)
  } catch (error) {
    console.error((error as any).message);
  }
}

export async function buy2(recommendation: Recommendation) {
  console.log("Kick-off email sent for", recommendation)
}

// TODO(michaelfromyeg): include urgency
// TODO(michaelfromyeg): add URL formatting options
function query(wish: Wish) {
  return `${wish.name} under ${wish.budget}${wish.preferred_brands ? `, from ${wish.preferred_brands}` : ""}`
}

// Assert I'm signed into craigslist
// async function authenticate(page: any, context: any) {
//   const session = await storage.getSession();
//   if (session) {
//     await context.addCookies([session]);

//     // try to access a protected page
//     await page.goto("https://www.browserbase.com/overview");

//     if (page.url === "https://www.browserbase.com/overview") {
//       // no redirect -> we are authenticated, let's skip the authentication flow
//       return;
//     }
//   }

//   await page.goto("https://www.browserbase.com/sign-in");

//   // ... sign-in ...
//   throw new Error("should've been signed in already")

//   // retrieve User Session Cookie
//   const cookies = await context.cookies();
//   const sessionCookie = cookies.find((c) => c.name === "session_id");
//   await storage.storeSession(sessionCookie);
// }

/**
 * Check Facebook Marketplace and Craigslist for the user's item.
 * 
 * @param wish 
 */
async function useBrowserbase(wish: Wish) {
  try {
    console.log("Beginning a search for", wish)

    // only run in actual browserbase in prod
    const stagehand = new Stagehand({
      env: IS_PRODUCTION ? "BROWSERBASE" : "LOCAL",
      apiKey: process.env.BROWSERBASE_API_KEY,

      enableCaching: IS_PRODUCTION ? true : false,
      verbose: IS_PRODUCTION ? 1 : 2,
      debugDom: IS_PRODUCTION ? false : true,

      ...(IS_PRODUCTION ? {
        browserBaseSessionCreateParams: {
          projectId: process.env.BROWSERBASE_PROJECT_ID ?? "",
          browserSettings: {
            fingerprint: {
              devices: ["desktop"],
              locales: ["en-US"],
              operatingSystems: ["macos"],
            },
            context: {
              id: "71bf7583-6922-4e61-ab8e-8885d584b13a",
              persist: true,
            },
          },
          proxies: [
            {
              "type": "browserbase",
              "geolocation": {
                "city": "San Francisco",
                "state": "CA",
                "country": "US"
              }
            }
          ]
        }
      } : {}),
    });
    await stagehand.init({
      modelName: "claude-3-5-sonnet-latest",
    });

    // TODO(michaelfromyeg): less naive string query handling
    const urlQuery = `${wish.name}${wish.preferred_brands ? `+from+${wish.preferred_brands.replace(" ", "+")}` : ""}`
    await stagehand.page.goto(`https://sfbay.craigslist.org/search/sss?query=${urlQuery}&max_price=${wish.budget}`);
    await stagehand.act({
      action: `click on a product that fulfills ${query(wish)}`, useVision: true
    })

    const product = await stagehand.extract({
      instruction: "extract the product information",
      schema: z.object({
        product_name: z.string(),
        product_link: z.string(),
        product_description: z.string().optional(),
        product_price: z.number().optional(),
      }),
    });

    console.log("Found", product)
    await writeRecommendation(wish, {
      ...product,
      source: "browserbase"
    })
  } catch (error) {
    console.error((error as any).message);
  }
}

const anthropic = new Anthropic();
async function useAnthropic(wish: Wish) {
  console.log("Using Anthropic to find", wish);

  // TODO(michaelfromyeg): somehow write a message to the Claude computer use service

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

interface ExaResponse {
  requestId: string;
  autopromptString?: string;
  results: {
    score?: number;
    title: string | null;
    id: string;
    url: string;
    publishedDate: string;
    author: string;
    text: string;
    image: string;
    highlights: string[];
    highlightScores: number[];
  }[]
}

const exa = new Exa(process.env.EXA_API_KEY);
async function useExa(wish: Wish) {
  console.log("Using Exa to find", wish);

  const search = query(wish)

  // TODO(michaelfromyeg): get real type of `searchAndContents`
  // TODO(michaelfromyeg): make the results not complete ass
  const result = await exa.searchAndContents(
    search,
    {
      type: "neural",
      useAutoprompt: false,
      text: {
        includeHtmlTags: true
      },
      highlights: true,
      // TODO(michaelfromyeg): add ebay support; seems to favor ebay too much at the moment
      includeDomains: ["https://sfbay.craigslist.org"] // "https://www.ebay.com"
    }
  ) as ExaResponse
  const topResult = result.results[0]

  // const topResult = EXA_RECOMMENDATION_0
  // console.log("exa", {
  //   product_name: topResult.title ?? "",
  //   product_link: topResult.url,
  //   source: "exa"
  // })
  await writeRecommendation(wish, {
    product_name: topResult.title ?? "",
    product_link: topResult.url,
    source: "exa"
  })

  // Example response from Exa here!
  // {
  //   "requestId": "d9f26f41118f5f6cff91326fc201d058",
  //   "autopromptString": "Here is a great space heater:",
  //   "resolvedSearchType": "neural",
  //   "results": [
  //     {
  //       "score": 0.17034432291984558,
  //       "title": "Home Space Heaters for Sale - Shop New & Used Portable Heaters - eBay",
  //       "id": "https://www.ebay.com/b/Home-Space-Heaters/20613/bn_7477840",
  //       "url": "https://www.ebay.com/b/Home-Space-Heaters/20613/bn_7477840",
  //       "publishedDate": "2024-06-22T17:35:58.000Z",
  //       "author": "",
  //       "text": "<div><div><h2>Home Space Heaters</h2>\n<p>Space heaters are a fantastic way to warm individual rooms. They are energy efficient and can supplement or replace other heating options. There are several kinds to choose from.</p>\n<p><strong>What kinds of space heaters are available?</strong></p><p>The size of your room and general heating needs will determine which type of heater will work best for you. Safety is another key component when choosing the right option.</p>\n<ul>\n<li><strong>Convection</strong> – These heaters warm the room's air as they pass over the heating elements. They are quiet, and the warmth produced is long-lasting. They are great for large rooms and use natural airflow to disperse heat. These can include ceramic or metal elements and oil- or liquid-filled chambers.</li>\n<li><strong>Fan-Forced Heaters</strong> – These are like convection heaters but with the addition of a fan. This moves the warmed air more effectively.</li>\n<li><strong>Radiant/Infrared</strong> – Infrared heaters produce heat quickly. The heat is absorbed directly by the people in the room, even if the area around them is cold. They are useful in drafty rooms or to spot-heat. They usually rely on oil or propane to generate heat; this makes them useful during power outages. They're also quiet.</li>\n<li><strong>Combination</strong> – These electric heaters contain positive elements from other styles of heaters. TAs a result, they heat evenly and quickly.</li>\n</ul>\n<p><strong>Which space heaters are good for children or pets?</strong></p><p>Many space heaters have a safety trigger and will switch off if they fall over. Look for options with a plastic protective grate with small openings, as well. This can prevent children or pets from touching the heating element. Thermostat-controlled heaters will switch off once the desired temperature is reached. Try to keep the heater away from high-traffic areas and on a level surface.</p>\n<p><strong>Where can heaters be placed in the home?</strong></p><p>Space heaters are suitable for all rooms in the home and even outside. There are a variety of models, each with their own benefits:</p>\n<ul>\n<li><strong>Wall-mounted</strong> - These electric heaters are thin and light. Their design makes them especially suited to households with children or pets. They also fit seamlessly into many rooms' décor.</li>\n<li><strong>Tabletop</strong> - These options are mid-sized and can be moved from room to room. Many space heaters fall under this category.</li>\n<li><strong>Freestanding</strong> - These heaters are sturdy and stable. They can be moved to other rooms and are usually designed to look like a piece of furniture.</li>\n<li><strong>Personal heaters</strong> - Personal options are small and portable. They are good for one person and are suited to those on the move or outside.</li>\n</ul></div></div>",
  //       "image": "https://ir.ebaystatic.com/cr/v/c1/ebay-logo-1-1200x630-margin.png",
  //       "highlights": [
  //         " Freestanding - These heaters are sturdy and stable. They can be moved to other rooms and are usually designed to look like a piece of furniture.  Personal heaters - Personal options are small and portable. They are good for one person and are suited to those on the move or outside."
  //       ],
  //       "highlightScores": [
  //         0.6571817994117737
  //       ]
  //     },
  //     {
  //       "score": 0.1683437079191208,
  //       "title": "Propane 100000 BTU or Greater BTU Heating Rating Home Space Heaters for sale | eBay",
  //       "id": "https://www.ebay.com/b/Propane-100000-BTU-or-Greater-BTU-Heating-Rating-Home-Space-Heaters/20613/bn_120875276",
  //       "url": "https://www.ebay.com/b/Propane-100000-BTU-or-Greater-BTU-Heating-Rating-Home-Space-Heaters/20613/bn_120875276",
  //       "publishedDate": "2023-02-06T07:39:53.244Z",
  //       "author": null,
  //       "text": "<div><div><section><div><p></p><h2>Best Selling</h2><p></p></div><div><ul><li><a href=\"https://www.ebay.com/p/26044040952?iid=353685709621\"><div><p></p></div></a><div><a href=\"https://www.ebay.com/p/26044040952?iid=353685709621\"><p>Mr. Heater Buddy Flex 11000 BTU Portable Heater - F600100</p></a><div><a href=\"https://www.ebay.com/p/26044040952?iid=353685709621#UserReviews\"> Total Ratings 3</a></div><div><p>$93.50 New</p></div></div></li><li><a href=\"https://www.ebay.com/p/1758296659?iid=394182901559\"><div><p></p></div></a><div><a href=\"https://www.ebay.com/p/1758296659?iid=394182901559\"><p>Mr. Heater MH170QFAVT Portable Heater</p></a><div><a href=\"https://www.ebay.com/p/1758296659?iid=394182901559#UserReviews\"> Total Ratings 2</a></div><div><p>$239.12 New</p></div><p>$165.79 Used</p></div></li><li><a href=\"https://www.ebay.com/p/751952380?iid=284959069770\"><div><p></p></div></a><div><a href=\"https://www.ebay.com/p/751952380?iid=284959069770\"><p>Tradesman 400 Gas Forced Air Portable Heater - White</p></a><div><p>$649.99 New</p></div></div></li><li><a href=\"https://www.ebay.com/p/14017009327?iid=352847739680\"><div><p></p></div></a><div><a href=\"https://www.ebay.com/p/14017009327?iid=352847739680\"><p>Mr. Heater F270500 200,000 BTU Convection Heater - Silver</p></a><div><a href=\"https://www.ebay.com/p/14017009327?iid=352847739680#UserReviews\"> Total Ratings 36</a></div><div><p>$110.00 New</p></div><p>$80.59 Used</p></div></li><li><a href=\"https://www.ebay.com/p/9012365531?iid=295169717782\"><div><p></p></div></a><div><a href=\"https://www.ebay.com/p/9012365531?iid=295169717782\"><p>Sunnydaze Decor 125000 BTU Forced Air Propane Space Heater - Black/Red</p></a><div><a href=\"https://www.ebay.com/p/9012365531?iid=295169717782#UserReviews\"> Total Ratings 4</a></div><div><p>$179.49 New</p></div></div></li><li><a href=\"https://www.ebay.com/p/66751085?iid=394337671771\"><div><p></p></div></a><div><a href=\"https://www.ebay.com/p/66751085?iid=394337671771\"><p>Mr. Heater Space Heaters F270800 125,000 BTU Portable Propane Radiant</p></a><div><a href=\"https://www.ebay.com/p/66751085?iid=394337671771#UserReviews\"> Total Ratings 4</a></div><div><p>$277.99 New</p></div></div></li><li><a href=\"https://www.ebay.com/p/25034484416?iid=284203668084\"><div><p></p></div></a><div><a href=\"https://www.ebay.com/p/25034484416?iid=284203668084\"><p>DEWALT DXH125FAVHC 125000 BTU Forced Air Propane Portable Heater</p></a><div><a href=\"https://www.ebay.com/p/25034484416?iid=284203668084#UserReviews\"> Total Ratings 5</a></div><div><p>$171.64 New</p></div><p>$119.99 Used</p></div></li></ul></div></section><section><div><div><div><ul><li><h2>All Listings</h2></li><li><a href=\"https://www.ebay.com/b/Propane-100000-BTU-or-Greater-BTU-Heating-Rating-Home-Space-Heaters/20613/bn_120875276?LH_Auction=1&amp;rt=nc\"><h2>Auction</h2></a></li><li><a href=\"https://www.ebay.com/b/Propane-100000-BTU-or-Greater-BTU-Heating-Rating-Home-Space-Heaters/20613/bn_120875276?LH_BIN=1&amp;rt=nc\"><h2>Buy It Now</h2></a></li></ul></div><div><div><p><ul><li><a href=\"https://www.ebay.com/b/Propane-100000-BTU-or-Greater-BTU-Heating-Rating-Home-Space-Heaters/20613/bn_120875276?rt=nc&amp;_sop=12\">Best Match</a></li><li><a href=\"https://www.ebay.com/b/Propane-100000-BTU-or-Greater-BTU-Heating-Rating-Home-Space-Heaters/20613/bn_120875276?rt=nc&amp;_sop=1\">Time: ending soonest</a></li><li><a href=\"https://www.ebay.com/b/Propane-100000-BTU-or-Greater-BTU-Heating-Rating-Home-Space-Heaters/20613/bn_120875276?rt=nc&amp;_sop=10\">Time: newly listed</a></li><li><a href=\"https://www.ebay.com/b/Propane-100000-BTU-or-Greater-BTU-Heating-Rating-Home-Space-Heaters/20613/bn_120875276?rt=nc&amp;_sop=15\">Price + Shipping: lowest first</a></li><li><a href=\"https://www.ebay.com/b/Propane-100000-BTU-or-Greater-BTU-Heating-Rating-Home-Space-Heaters/20613/bn_120875276?rt=nc&amp;_sop=16\">Price + Shipping: highest first</a></li><li><a href=\"https://www.ebay.com/b/Propane-100000-BTU-or-Greater-BTU-Heating-Rating-Home-Space-Heaters/20613/bn_120875276?rt=nc&amp;_sop=7\">Distance: nearest first</a></li></ul></p></div><div><p><ul><li><a href=\"https://www.ebay.com/b/Propane-100000-BTU-or-Greater-BTU-Heating-Rating-Home-Space-Heaters/20613/bn_120875276?rt=nc&amp;_dmd=1\">List View</a></li></ul></p></div> </div></div><div><p></p><h2>90 Results</h2><p></p></div></div><section><ul><li><div><ul><li><a href=\"https://www.ebay.com/b/100000-BTU-or-Greater-BTU-Heating-Rating-Home-Space-Heaters/20613/bn_120876116\">Power Source: Propane filter applied</a></li><li><a href=\"https://www.ebay.com/b/Propane-Home-Space-Heaters/20613/bn_55122239\">BTU Heating Rating: 100000 BTU or Greater filter applied</a></li></ul><p><a href=\"https://www.ebay.com/b/Propane-100000-BTU-or-Greater-BTU-Heating-Rating-Home-Space-Heaters/20613?rt=nc\">Clear All</a></p></div></li><li><div><ul><li><a href=\"https://www.ebay.com/b/100000-BTU-or-Greater-BTU-Heating-Rating-Home-Space-Heaters/20613/bn_120876116\"> Propane filter applied</a></li></ul></div></li><li><div><ul><li><a href=\"https://www.ebay.com/b/Propane-Home-Space-Heaters/20613/bn_55122239\"> 100000 BTU or Greater filter applied</a></li></ul></div></li><li></li><li><div><ul><li><a href=\"https://www.ebay.com/b/Dyna-Glo-Propane-100000-BTU-or-Greater-BTU-Heating-Rating-Home-Space-Heaters/20613/bn_120875012\"> Dyna-Glo</a></li></ul></div></li><li></li><li></li><li></li><li><div><ul><li><a href=\"https://www.ebay.com/b/Propane-100000-BTU-or-Greater-BTU-Heating-Rating-Home-Space-Heaters/20613/bn_120875276\"> All Listings filter applied</a></li></ul></div></li><li></li></ul><ul><li></li></ul></section><ul><li><div><div><a href=\"https://www.ebay.com/p/26044040952?iid=353685709621\"><h3>Mr. Heater 11,000 BTU Buddy FLEX Liquid Propane Portable Radiant Space Heater</h3></a><div><a href=\"https://www.ebay.com/p/26044040952?iid=353685709621&amp;rt=nc#UserReviews\"> 3 product ratings - Mr. Heater 11,000 BTU Buddy FLEX Liquid Propane Portable Radiant Space Heater</a></div><div><p>$93.50</p><p>Was: $199.99</p><p>Free shipping</p><p>116 sold</p></div></div></div><a href=\"https://www.ebay.com/myb/WatchListAdd?item=353685709621&amp;pt=null&amp;srt=01000800000050fe3d66ef3f62d86672d245c908be881cfb711fda00aa68edc44729f4b05384c486c0520d35f967c45b904335f5bb8cbab3b0060f938d04384a3853a04d580cc16b833af697d18206c1d08835967cf2b4&amp;ru=https%3A%2F%2Fwww.ebay.com%2Fb%2FPropane-100000-BTU-or-Greater-BTU-Heating-Rating-Home-Space-Heaters%2F20613%2Fbn_120875276\"></a></li><li><div><div><a href=\"https://www.ebay.com/p/14017009327?iid=352847739680\"><h3>Mr. Heater MH200CVX 200,000 BTU Portable Outdoor LP Propane Gas Convection Heat</h3></a><div><a href=\"https://www.ebay.com/p/14017009327?iid=352847739680&amp;rt=nc#UserReviews\"> 36 product ratings - Mr. Heater MH200CVX 200,000 BTU Portable Outdoor LP Propane Gas Convection Heat</a></div><div><p>$110.00</p><p>Was: $199.99</p><p>Free shipping</p></div></div></div><a href=\"https://www.ebay.com/myb/WatchListAdd?item=352847739680&amp;pt=null&amp;srt=010008000000504120632ead7a5445085aebcad6e8d62aab476b94d07a14b7710890846a22cf7399ea2ec2505b9d000ec29029369d4044e1e8e5faa4ceaedf3f726d5a75b67a1925a1391691657b47ba80cfcdcdd80917&amp;ru=https%3A%2F%2Fwww.ebay.com%2Fb%2FPropane-100000-BTU-or-Greater-BTU-Heating-Rating-Home-Space-Heaters%2F20613%2Fbn_120875276\"></a></li><li><div><div><a href=\"https://www.ebay.com/p/23045318434?iid=295337261157\"><h3>85,000 BTU Steel Forced Air Propane Heater with Auto Shut Off by Sunnydaze</h3></a><div><a href=\"https://www.ebay.com/p/23045318434?iid=295337261157&amp;rt=nc#UserReviews\"> 1 product ratings - 85,000 BTU Steel Forced Air Propane Heater with Auto Shut Off by Sunnydaze</a></div><div><p>$138.49</p><p>Was: $218.99</p></div></div></div><a href=\"https://www.ebay.com/myb/WatchListAdd?item=295337261157&amp;pt=null&amp;srt=010008000000507586e021e94b2cb10321147b070af9c2023a355f1271b09036791aedf9f063ab590078c8d3c26bbf0b14ecc3860d125e734e9c85d688207dc5759b8475ad9c4acc297b04c2008a6c5126e52f8c1d3515&amp;ru=https%3A%2F%2Fwww.ebay.com%2Fb%2FPropane-100000-BTU-or-Greater-BTU-Heating-Rating-Home-Space-Heaters%2F20613%2Fbn_120875276\"></a></li><li><div><div><a href=\"https://www.ebay.com/p/9012365531?iid=295169717782\"><h3>125,000 BTU Steel Forced Air Propane Heater with Auto Shut Off by Sunnydaze</h3></a><div><a href=\"https://www.ebay.com/p/9012365531?iid=295169717782&amp;rt=nc#UserReviews\"> 4 product ratings - 125,000 BTU Steel Forced Air Propane Heater with Auto Shut Off by Sunnydaze</a></div><div><p>$179.49</p><p>Was: $236.99</p></div></div></div><a href=\"https://www.ebay.com/myb/WatchListAdd?item=295169717782&amp;pt=null&amp;srt=010008000000505d4e0349945e1d3b9c31cb4360198dcbf508eb333620ad97ffb782e06d78890f39e366c555013527c8727b787d8bd004402fd56d67c4d1aa0e324084bdd8547f7940dcd34a336b74020ca12dbf00dcbd&amp;ru=https%3A%2F%2Fwww.ebay.com%2Fb%2FPropane-100000-BTU-or-Greater-BTU-Heating-Rating-Home-Space-Heaters%2F20613%2Fbn_120875276\"></a></li><li><div><div><a href=\"https://www.ebay.com/itm/125745144451?hash=item1d46fea283:g:iC8AAOSwdeRiV1bs\"><h3>Mi-T-M 150,000 BTU Propane Forced Air Portable Heater MH-0150-LMT0</h3></a><div><p>$60.00</p><p>1 bidEnding Monday at 5:44AM PST6h 4mLocal Pickup</p></div></div></div><a href=\"https://www.ebay.com/myb/WatchListAdd?item=125745144451&amp;pt=null&amp;srt=01000800000050a81e5bc577d6312f4a75738796841cf6e1644652170fc13e50884e48975f451cf24c22776cdbb4e6725abc08fa02026870ae05eb5358524a1fc4f3ae377b629e8c4e5db681c72bc91cc2c8a10b8e791c&amp;ru=https%3A%2F%2Fwww.ebay.com%2Fb%2FPropane-100000-BTU-or-Greater-BTU-Heating-Rating-Home-Space-Heaters%2F20613%2Fbn_120875276\"></a></li><li><div><div><a href=\"https://www.ebay.com/p/1758296659?iid=394182901559\"><h3>Mr Heater 125,000 - 170,000 BTU Air Propane Heater F271400 New</h3></a><div><a href=\"https://www.ebay.com/p/1758296659?iid=394182901559&amp;rt=nc#UserReviews\"> 2 product ratings - Mr Heater 125,000 - 170,000 BTU Air Propane Heater F271400 New</a></div><div><p>$239.12</p><p>Was: $379.99</p></div></div></div><a hr",
  //       "highlights": [
  //         "Best Selling               Mr. Heater Buddy Flex 11000 BTU Portable Heater - F600100    Total Ratings 3   $93.50 New             Mr. Heater MH170QFAVT Portable Heater    Total Ratings 2   $239.12 New  $165.79 Used            Tradesman 400 Gas Forced Air Portable Heater - White   $649.99 New             Mr. Heater F270500 200,000 BTU Convection Heater - Silver    Total Ratings 36   $110.00 New  $80.59 Used            Sunnydaze Decor 125000 BTU Forced Air Propane Space Heater - Black/Red    Total Ratings 4   $179.49 New             Mr. Heater Space Heaters F270800 125,000 BTU Portable Propane Radiant    Total Ratings 4   $277.99 New             DEWALT DXH125FAVHC 125000 BTU Forced Air Propane Portable Heater    Total Ratings 5   $171.64 New  $119.99 Used            All Listings    Auction     Buy It Now          Best Match   Time: ending soonest   Time: newly listed   Price + Shipping: lowest first   Price + Shipping: highest first   Distance: nearest first         List View          90 Results           Power Source: Propane filter applied   BTU Heating Rating: 100000 BTU or Greater filter applied    Clear All         Propane filter applied          100000 BTU or Greater filter applied            Dyna-Glo                All Listings filter applied                  Mr. Heater 11,000 BTU Buddy FLEX Liquid Propane Portable Radiant Space Heater    3 product ratings - Mr. Heater 11,000 BTU Buddy FLEX Liquid Propane Portable Radiant Space Heater   $93.50 Was: $199.99 Free shipping 116 sold           Mr. Heater MH200CVX 200,000 BTU Portable Outdoor LP Propane Gas Convection Heat    36 product ratings - Mr. Heater MH200CVX 200,000 BTU Portable Outdoor LP Propane Gas Convection Heat   $110.00 Was: $199.99 Free shipping           85,000 BTU Steel Forced Air Propane Heater with Auto Shut Off by Sunnydaze    1 product ratings - 85,000 BTU Steel Forced Air Propane Heater with Auto Shut Off by Sunnydaze   $138.49 Was: $218.99           125,000 BTU Steel Forced Air Propane Heater with Auto Shut Off by Sunnydaze    4 product ratings - 125,000 BTU Steel Forced Air Propane Heater with Auto Shut Off by Sunnydaze   $179.49 Was: $236.99           Mi-T-M 150,000 BTU Propane Forced Air Portable Heater MH-0150-LMT0   $60.00 1 bidEnding Monday at 5:44AM PST6h 4mLocal Pickup           Mr Heater 125,000 - 170,000 BTU Air Propane Heater F271400 New    2 product ratings - Mr Heater 125,000 - 170,000 BTU Air Propane Heater F271400 New   $239.12 Was: $379.99"
  //       ],
  //       "highlightScores": [
  //         0.060312047600746155
  //       ]
  //     },
  //     {
  //       "score": 0.16816872358322144,
  //       "title": "Pelonis Ho-0201 Portable Radiator Heater With 3 Heat Settings for sale online | eBay",
  //       "id": "https://www.ebay.com/p/2124108120?iid=263339504322",
  //       "url": "https://www.ebay.com/p/2124108120?iid=263339504322",
  //       "publishedDate": "2024-01-01T00:00:00.000Z",
  //       "author": "",
  //       "text": "<div><div><div><h2>About this product</h2><section><div><h3>Product Identifiers</h3><ul><li><p>Brand</p><p>Pelonis</p></li><li><p>MPN</p><p>HO0201</p></li><li><p>GTIN</p><p>0750545103949</p></li><li><p>UPC</p><p>0750545103949</p></li><li><p>eBay Product ID (ePID)</p><p>2124108120</p></li></ul></div><div><h3>Product Key Features</h3><ul><li><p>Power Source</p><p>Electric</p></li><li><p>Year Manufactured</p><p>1940</p></li><li><p>Heating Element Material</p><p>Brass</p></li><li><p>Control Style</p><p>Analog/Mechanical</p></li><li><p>EC Range</p><p>A+++ - D</p></li><li><p>Color</p><p>Gray</p></li><li><p>Heating System</p><p>Panel</p></li><li><p>Voltage</p><p>120 V</p></li><li><p>Features</p><p>Auto Shut-off</p></li><li><p>Cable Length</p><p>Heater</p></li><li><p>Material</p><p>Brass</p></li><li><p>Type</p><p>Portable Heater</p></li><li><p>Mounting Location</p><p>Floor</p></li></ul></div><div><h3>Dimensions</h3><ul><li><p>Item Height</p><p>6.420</p></li><li><p>Item Weight</p><p>1830 Hundredths Pounds</p></li></ul></div></section></div><div><div><h2>Best Selling in Space Heaters</h2></div><div><p>Current slide {CURRENT_SLIDE} of {TOTAL_SLIDES}- Best Selling in Space Heaters</p></div></div></div></div>",
  //       "image": "https://i.ebayimg.com/images/g/7WgAAOSwQ7haxTU1/s-l1600.jpg",
  //       "highlights": [
  //         "About this product   Product Identifiers   Brand Pelonis   MPN HO0201   GTIN 0750545103949   UPC 0750545103949   eBay Product ID (ePID) 2124108120     Product Key Features   Power Source Electric   Year Manufactured 1940   Heating Element Material Brass   Control Style Analog/Mechanical   EC Range A+++ - D   Color Gray   Heating System Panel   Voltage 120 V   Features Auto Shut-off   Cable Length Heater   Material Brass   Type Portable Heater   Mounting Location Floor     Dimensions   Item Height 6.420   Item Weight 1830 Hundredths Pounds        Best Selling in Space Heaters   Current slide {CURRENT_SLIDE} of {TOTAL_SLIDES}- Best Selling in Space Heaters"
  //       ],
  //       "highlightScores": [
  //         0.03549918532371521
  //       ]
  //     },
  //     {
  //       "score": 0.16693173348903656,
  //       "title": "Lifesmart LS-1002HH Heater for sale online | eBay",
  //       "id": "https://www.ebay.com/p/219559977?iid=390647866471",
  //       "url": "https://www.ebay.com/p/219559977?iid=390647866471",
  //       "publishedDate": "2017-01-26T00:00:00.000Z",
  //       "author": "gh2339",
  //       "text": "<div><div><li><div><p><span>4 out of 5 stars</span></p><p>by <span>Jan 26, 2017</span></p></div><div><h4>Warm and Toasty</h4><p>So far so good\nIt seems quiet enough and sturdy\nI wish it had a larger fan</p><p><span>Verified purchase: </span><span>Yes</span><span> | </span><span>Condition: </span><span>New</span></p></div></li><li><div><h4>good quality heater</h4><p>these days it is unusual to find a product that lives up to its name &amp; this heater does just that. the quality of workmanship is great &amp; at a price that is extremely reasonable. this heater produces genuine heat wherever you need it. have owned a few of these in the past &amp; have never been disappointed &amp; would not hesitate to buy again</p><p><span>Verified purchase: </span><span>Yes</span><span> | </span><span>Condition: </span><span>New</span></p></div></li><li><div><h4>great little heater</h4><p>Heats quickly. Easy to move. It is light weight and can easily be carried. It heats my one area, so I don't have to use the furnace as much. I'm hoping it is cost effective, but the thermostat keeps it regulated well.</p><p><span>Verified purchase: </span><span>Yes</span><span> | </span><span>Condition: </span><span>New</span></p></div></li><li><div><h4>Great small heater</h4><p>This heater may be small in size, but gives off a lot of heat.</p><p><span>Verified purchase: </span><span>Yes</span><span> | </span><span>Condition: </span><span>New</span></p></div></li><li><div><h4>Works great.</h4><p><span>Verified purchase: </span><span>Yes</span><span> | </span><span>Condition: </span><span>New</span></p></div></li></div></div>",
  //       "image": "https://i.ebayimg.com/images/g/FbIAAOSwh-1W3Y0A/s-l600.jpg",
  //       "highlights": [
  //         "this heater produces genuine heat wherever you need it. have owned a few of these in the past &amp; have never been disappointed &amp; would not hesitate to buy again  Verified purchase:  Yes  |  Condition:  New      great little heater Heats quickly. Easy to move. It is light weight and can easily be carried. It heats my one area, so I don't have to use the furnace as much."
  //       ],
  //       "highlightScores": [
  //         0.5634886622428894
  //       ]
  //     },
  //     {
  //       "score": 0.1666017770767212,
  //       "title": "Comfort Zone CZ442 1500W Ceramic Electric Portable Heater - Black for sale online | eBay",
  //       "id": "https://www.ebay.com/p/10034764649",
  //       "url": "https://www.ebay.com/p/10034764649",
  //       "publishedDate": "2022-01-18T00:00:00.000Z",
  //       "author": "susieq_rn",
  //       "text": "<div><div> <main><div><h2>Picture 1 of 5</h2></div><section><div><p><span>Estimated delivery Mon, Jun 24 - Fri, Jun 28</span></p></div><ul><li></li><li></li><li></li></ul></section></main></div><div><div><h2>About this product</h2><section><div><h3>Product Identifiers</h3><ul><li><p>Brand</p><p>comfort zone</p></li><li><p>MPN</p><p>CZ442</p></li><li><p>Ean</p><p>0075877004420, 078238604105</p></li><li><p>GTIN</p><p>0075877004420, 078238604105</p></li><li><p>UPC</p><p>0075877004420, 078238604105</p></li><li><p>Model</p><p>Comfort Zone CZ442</p></li><li><p>eBay Product ID (ePID)</p><p>10034764649</p></li></ul></div><div><h3>Product Key Features</h3><ul><li><p>Power Source</p><p>Electric</p></li><li><p>Control Style</p><p>Switch</p></li><li><p>Color</p><p>Black</p></li><li><p>Number of Heat Settings</p><p>2</p></li><li><p>Features</p><p>Handle</p></li><li><p>Material</p><p>Ceramic</p></li><li><p>Type</p><p>Fan Heater</p></li><li><p>Mounting Location</p><p>Desk/Tabletop</p></li><li><p>Power</p><p>1500W</p></li></ul></div><div><h3>Dimensions</h3><ul><li><p>Item Width</p><p>15.25in</p></li></ul></div><div><h3>Additional Product Features</h3><ul><li><p>Brand Color</p><p>Black</p></li><li><p>Custom Bundle</p><p>No</p></li><li><p>Wattage</p><p>1500w</p></li><li><p>Suitable Locations</p><p>Bedroom</p></li><li><p>Power (w)</p><p>1500W</p></li><li><p>Coverage</p><p>800sq ft</p></li></ul></div></section></div><div><h2><span>All listings for this product</span></h2></div><div><div><div><p><span>4.7</span></p><p><span>4.7 out of 5 stars based on 152 product ratings</span></p><p><span>152 product ratings</span></p></div><div><ul><li><div><p><i><u></u></i><i>128 users rated this 5 out of 5 stars</i></p></div></li><li><div><p><i><u></u></i><i>17 users rated this 4 out of 5 stars</i></p></div></li><li><div><p><i><u></u></i><i>2 users rated this 3 out of 5 stars</i></p></div></li><li><div><p><i><u></u></i><i>0 users rated this 2 out of 5 stars</i></p></div></li><li><div><p><i><u></u></i><i>5 users rated this 1 out of 5 stars</i></p></div></li></ul></div></div><div><div><h3>Most relevant reviews</h3></div><ul><li><div><p><span>5 out of 5 stars</span></p><p>by <span>Jan 18, 2022</span></p></div><div><h4>“The little engine that could”</h4><p>This little guy has been a work horse. I am online tonight buying a second one for the bathroom. It has two settings, low and high, which is convenient. Any movement forward or backward shuts it off, a super safety feature for my pets.</p><p><span>Verified purchase: </span><span>Yes</span><span> | </span><span>Condition: </span><span>New</span></p></div></li><li><div><h4>Worth it.</h4><p>Has a safety feature and was perfect for my kids. Works better than expected and shipping was so quick. They were very kind. I'm satisfied.</p><p><span>Verified purchase: </span><span>Yes</span><span> | </span><span>Condition: </span><span>New</span></p></div></li><li><div><h4>Great little heater!!!</h4><p>Pro: Small, light and cheap. No Con. I’m heating a 12’ x 6' x 6’ trailer and it is just perfect. You can set this at a temp and it holds it close to that.</p><p><span>Verified purchase: </span><span>Yes</span><span> | </span><span>Condition: </span><span>Pre-owned</span></p></div></li><li><div><h4>SURPRISING QUALITY &amp; VALUE ! ! ! </h4><p>This little heater is one of the best I've ever owned... The ceramic element generates Lots of heat for such a tiny unit, and the well placed little fan Throws the Heat About 6 Feet Out before it dissipates. I had the SAME Company's NON-Ceramic heater and IT DOESN'T EVEN COMPARE. This little heater is so Awesome, I can't even give it proper Kudos and Accolades here... If you want a cheap space heater THAT KICKS LA BOOTY,.... I HIGHLY recommend this product.........\nOH - P.S. - run it on MEDIUM SETTING.... the High setting is So Hot that it cuts off every 10 seconds.... the Medium setting with the Thermostat all the way up will blow and blow and blow Heat. . . . . . . . . . Enjoy ! ! !</p><p><span>Verified purchase: </span><span>Yes</span><span> | </span><span>Condition: </span><span>Pre-owned</span></p></div></li><li><div><p><span>5 out of 5 stars</span></p><p>by <a href=\"https://www.ebay.com/usr/dwod-0\">dwod-0</a><span>Dec 13, 2022</span></p></div><div><h4>GOOD DEAL</h4><p>Good solid little heater. Safety features and fan only plus two heat settings. Thanks!</p><p><span>Verified purchase: </span><span>Yes</span><span> | </span><span>Condition: </span><span>New</span></p></div></li></ul></div></div><div><div><h2>Best Selling in Space Heaters</h2></div><div><p>Current slide {CURRENT_SLIDE} of {TOTAL_SLIDES}- Best Selling in Space Heaters</p></div></div></div></div>",
  //       "image": "https://i.ebayimg.com/images/g/Vh4AAOSwp5lePBH3/s-l600.jpg",
  //       "highlights": [
  //         "I’m heating a 12’ x 6' x 6’ trailer and it is just perfect. You can set this at a temp and it holds it close to that. Verified purchase:  Yes  |  Condition:  Pre-owned      SURPRISING QUALITY &amp; VALUE ! This little heater is one of the best I've ever owned... The ceramic element generates Lots of heat for such a tiny unit, and the well placed little fan Throws the Heat About 6 Feet Out before it dissipates."
  //       ],
  //       "highlightScores": [
  //         0.41951465606689453
  //       ]
  //     },
  //     {
  //       "score": 0.1658732295036316,
  //       "title": "Lifesmart ZCHT1097US 1500W Infrared Quartz Mica Space Heater - Brown for sale online | eBay",
  //       "id": "https://www.ebay.com/p/1481253032?iid=231038287354",
  //       "url": "https://www.ebay.com/p/1481253032?iid=231038287354",
  //       "publishedDate": "2021-02-08T00:00:00.000Z",
  //       "author": "pug-ski",
  //       "text": "<div><div> <main><div><h2>Picture 1 of 11</h2></div><section><div><p><span><span>Free 2 day shipping</span></span></p><p><span><span>Get it by </span><span>Thu, Jun 20</span></span></p></div><div><p><span>30 days returns</span><span>. </span><span>Seller pays for return shipping</span><span>. </span></p></div><div><p><span>Keep you and your room warm and cozy throughout the seasons. Designed to heat rooms up to 1500 square feet in size, you can be sure that everyone in the room will remain comfortable. Tip-over switch feature ensures ultimate safety.</span></p></div><ul><li></li><li></li><li></li></ul></section></main></div><div><div><h2>About this product</h2><section><div><h3>Product Identifiers</h3><ul><li><p>Brand</p><p>Life Smart Labs</p></li><li><p>MPN</p><p>ZCHT1097US</p></li><li><p>UPC</p><p>0817223016752</p></li><li><p>Model</p><p>ZCHT1097US</p></li><li><p>eBay Product ID (ePID)</p><p>1481253032</p></li></ul></div><div><h3>Product Key Features</h3><ul><li><p>Power Source</p><p>Electric</p></li><li><p>Year Manufactured</p><p>2017</p></li><li><p>Control Style</p><p>Touch</p></li><li><p>Color</p><p>Brown</p></li><li><p>Number of Heat Settings</p><p>3</p></li><li><p>Voltage</p><p>110 V</p></li><li><p>Features</p><p>Portable, Remote Control, Indoor, Quartz, Vent Free</p></li><li><p>Material</p><p>Wood</p></li><li><p>Type</p><p>Heater</p></li><li><p>Mounting Location</p><p>Portable</p></li><li><p>Smart Home Protocol</p><p>Infrared</p></li><li><p>Power</p><p>1500 W</p></li></ul></div><div><h3>Dimensions</h3><ul><li><p>Item Length</p><p>13 in</p></li><li><p>Item Width</p><p>10.8 in</p></li><li><p>Weight</p><p>20.6lbs.</p></li><li><p>Depth</p><p>12.7 in</p></li><li><p>Height</p><p>16.2in.</p></li></ul></div><div><h3>Additional Product Features</h3><ul><li><p>Energy Star</p><p>Yes</p></li><li><p>Manufacturer Color</p><p>Brown</p></li><li><p>Style</p><p>Traditional</p></li><li><p>Shoe Width</p><p>14.0 in</p></li></ul></div></section></div><div><h2><span>All listings for this product</span></h2></div><div><div><div><p><span>4.7</span></p><p><span>4.7 out of 5 stars based on 75 product ratings</span></p><p><span>75 product ratings</span></p></div><div><ul><li><div><p><i><u></u></i><i>61 users rated this 5 out of 5 stars</i></p></div></li><li><div><p><i><u></u></i><i>8 users rated this 4 out of 5 stars</i></p></div></li><li><div><p><i><u></u></i><i>3 users rated this 3 out of 5 stars</i></p></div></li><li><div><p><i><u></u></i><i>3 users rated this 2 out of 5 stars</i></p></div></li><li><div><p><i><u></u></i><i>0 users rated this 1 out of 5 stars</i></p></div></li></ul></div></div><div><div><h3>Most relevant reviews</h3></div><ul><li><div><p><span>5 out of 5 stars</span></p><p>by <span>Feb 08, 2021</span></p><p>Top favorable review</p></div><div><h4>LIghtweight with great features.</h4><p>I've looked, but can't find anything wrong with it. Heats like an absolute champ!! Very pleased with the purchase! (Oh, I'm not a robot!)</p><p><span>Verified purchase: </span><span>Yes</span><span> | </span><span>Condition: </span><span>Pre-owned</span></p></div></li><li><div><h4>Does not heat even a 480 sq. ft room</h4><p>The advertisement says will heat 1800 sq. ft. Not even close. we have it in our kitchen which is 480 square feet. We set the temperature at 80 degrees and the thermometer on an inside wall shows 66 degrees. Radiant heat is supposed to heat \"things\" not the air. Chairs and counter top are very cool, not heated at all. My wife uses it (aimed at her) to keep warm. I sit at counter about four feet away and cannot feel any heat.</p><p><span>Verified purchase: </span><span>Yes</span><span> | </span><span>Condition: </span><span>New</span></p></div></li><li><div><h4>Worked great for a while.. 4 mos. later Heater Element went out!</h4><p>This heater worked awesome for about 4 months. I cleaned the filter regularly. All of a sudden it would come on and not put any heat out. Because the heat blows. The blower part came on but the heater wouldn't turn red or come on. I have 2 of these. It definitely lowered the cost and worked awesome until it went out. My one is still working but I've only had it 2 months. The first went out after 4 months. I sent it back to be told its the heating element and literally the price for the element is about the cost of the heater its self. I would not recommend it. Their worth it for the time they work. But to expensive for it to go out after a time frame that short.</p><p><span>Verified purchase: </span><span>No</span></p></div></li><li><div><h4>Great little heater</h4><p>Seems to hold temp consistent hopefully will not break the bank on power, using as freeze protection in RV</p><p><span>Verified purchase: </span><span>Yes</span><span> | </span><span>Condition: </span><span>New</span></p></div></li><li><div><h4>Good for small space use</h4><p>The heater is small enough to provide heat when I needed it, but has to directly be pointed at me.\nThe good part is that it is remote controlled so you don't have to get up all the time to adjust the temperature as needed.\nAlso, it looks good and blends with current modern decors.\nThe only thing was that it takes a while to heat me up when I am in a big room and it gets very warm when I am in a small room that it has to be turned off.\nAgain, thankfully, it is remotely controlled.</p><p><span>Verified purchase: </span><span>Yes</span><span> | </span><span>Condition: </span><span>New</span></p></div></li></ul></div></div><div><div><h2>Best Selling in Space Heaters</h2></div><div><p>Current slide {CURRENT_SLIDE} of {TOTAL_SLIDES}- Best Selling in Space Heaters</p></div></div></div></div>",
  //       "image": "https://i.ebayimg.com/images/g/cbUAAOSwq39fZE5y/s-l600.jpg",
  //       "highlights": [
  //         "This heater worked awesome for about 4 months. I cleaned the filter regularly. All of a sudden it would come on and not put any heat out. Because the heat blows. The blower part came on but the heater wouldn't turn red or come on."
  //       ],
  //       "highlightScores": [
  //         0.5008170008659363
  //       ]
  //     },
  //     {
  //       "score": 0.16474765539169312,
  //       "title": "Costway EP22612 700W Electric Oil Filled Radiator Heater for sale online | eBay",
  //       "id": "https://www.ebay.com/p/11004875445?iid=263339477475",
  //       "url": "https://www.ebay.com/p/11004875445?iid=263339477475",
  //       "publishedDate": "2018-11-27T00:00:00.000Z",
  //       "author": "bob5560g",
  //       "text": "<div><div><li><div><p><span>4 out of 5 stars</span></p><p>by <span>Nov 27, 2018</span></p><p>Top favorable review</p></div><div><h4>Well built, designed for a SMALL room.</h4><p>I bought this for my small RV due to limited storage space. It's built well but buyers need to keep in mind that 700 watts is only about one half of the heat of a typical household space heater.which is normally 1,500 watts.It would be good for a bathroom or help take the chill out of a very small room, but it's definitely not designed for a normal sized room in a house.</p><p><span>Verified purchase: </span><span>Yes</span><span> | </span><span>Condition: </span><span>New</span></p></div></li><li><div><p><span>3 out of 5 stars</span></p><p>by <a href=\"https://www.ebay.com/usr/jglazunova\">jglazunova</a><span>Jan 03, 2019</span></p><p>Top critical review</p></div><div><h4>Not worth the money</h4><p>This heater does not heating much the room ~10 square meters, but I was not expecting much from it. Also I was surprised heater is noisy. I can constantly hear some clicking sound during heater work. I have another heater of same type and it does not produce sounds like that.</p><p><span>Verified purchase: </span><span>Yes</span><span> | </span><span>Condition: </span><span>New</span></p></div></li><li><div><h4>Great features!</h4><p>Hello! Well, I purchased one last two years ago. I have no complaint whatsoever because it keeps my office warm enough for the square area. I even purchased another one this year 2020 for a second small office and my daughter likes it too. However, not all Costway heaters are good. The big ones didn't make well. They tend to crack in front if they get hit by something and cause it not to function anymore. Thus, the front of the bigger ones need to be made solid in order to avoid such malfunction.</p><p><span>Verified purchase: </span><span>Yes</span><span> | </span><span>Condition: </span><span>New</span></p></div></li><li><div><h4>Economic Heater</h4><p>Works well with economic settings from low to high. This space heater is lightweight and can be easily carried from room to room as needed! Great for locations were propane is not financially supported and thus electricity costs less than gas. I only hope that the on-switch is better constructed than that of former heaters: the on-switch broke and the otherwise intact heater would not work any more, no repair made it a throwaway item! What a waste of money and resources with landfill concerns! Recommendation of caution: Turn switch on and leave it on. Use the thermostat to regulate heat and unplug the heater to turn it off for times when it is not used.</p><p><span>Verified purchase: </span><span>Yes</span><span> | </span><span>Condition: </span><span>New</span></p></div></li><li><div><p><span>5 out of 5 stars</span></p><p>by <a href=\"https://www.ebay.com/usr/gerryjr\">gerryjr</a><span>Jan 20, 2020</span></p></div><div><h4>Awsome heater</h4><p>Works great in my grow tent i just clipped and capped the wires for the power light so it dont mess up my dark cycle also it maintains a steady heat very well and im sure it would heat a bathroom perfectly</p><p><span>Verified purchase: </span><span>Yes</span><span> | </span><span>Condition: </span><span>New</span></p></div></li></div></div>",
  //       "image": "https://i.ebayimg.com/images/g/7WgAAOSwQ7haxTU1/s-l1600.jpg",
  //       "highlights": [
  //         "This space heater is lightweight and can be easily carried from room to room as needed! Great for locations were propane is not financially supported and thus electricity costs less than gas. I only hope that the on-switch is better constructed than that of former heaters: the on-switch broke and the otherwise intact heater would not work any more, no repair made it a throwaway item! What a waste of money and resources with landfill concerns! Recommendation of caution: Turn switch on and leave it on."
  //       ],
  //       "highlightScores": [
  //         0.531181275844574
  //       ]
  //     },
  //     {
  //       "score": 0.16222426295280457,
  //       "title": "Rinnai EX22CTP Wall-Mount Convection Heater - Beige for sale online | eBay",
  //       "id": "https://www.ebay.com/p/10028423617?iid=155055386833",
  //       "url": "https://www.ebay.com/p/10028423617?iid=155055386833",
  //       "publishedDate": "2019-11-07T00:00:00.000Z",
  //       "author": "jsmi68950",
  //       "text": "<div><div><div><h2>About this product</h2><section><div><h3>Product Identifiers</h3><ul><li><p>Brand</p><p>Rinnai</p></li><li><p>MPN</p><p>EX22CTP</p></li><li><p>GTIN</p><p>0766156009884</p></li><li><p>UPC</p><p>0766156009884</p></li><li><p>Model</p><p>EX22CTP</p></li><li><p>eBay Product ID (ePID)</p><p>10028423617</p></li></ul></div><div><h3>Product Key Features</h3><ul><li><p>Power Source</p><p>Propane</p></li><li><p>Color</p><p>Beige</p></li><li><p>Item Depth</p><p>32.5</p></li><li><p>Heating System</p><p>Furnace</p></li><li><p>Number of Heat Settings</p><p>1</p></li><li><p>Voltage</p><p>120 volts</p></li><li><p>Features</p><p>Timer</p></li><li><p>Material</p><p>Steel</p></li><li><p>Type</p><p>Vent</p></li><li><p>Mounting Location</p><p>Wall</p></li><li><p>Smart Home Protocol</p><p>60 Hz</p></li></ul></div><div><h3>Dimensions</h3><ul><li><p>Item Width</p><p>29.9 in</p></li></ul></div></section></div><div><div><h2>Best Selling in Space Heaters</h2></div><div><p>Current slide {CURRENT_SLIDE} of {TOTAL_SLIDES}- Best Selling in Space Heaters</p></div></div><div><div><h2>Save on Space Heaters</h2></div><div><p>Current slide {CURRENT_SLIDE} of {TOTAL_SLIDES}- Save on Space Heaters</p></div></div><div><p></p><h2>You may also like</h2><p></p><div><p>Current slide {CURRENT_SLIDE} of {TOTAL_SLIDES}- You may also like</p></div></div><div><div><div><h2>Ratings and Reviews</h2></div><div><p><span>5.0</span></p><p><span>5.0 out of 5 stars based on 1 product rating</span></p><p><span>1 product rating</span></p></div><div><ul><li><div><p><i><u></u></i><i>1 users rated this 5 out of 5 stars</i></p></div></li><li><div><p><i><u></u></i><i>0 users rated this 4 out of 5 stars</i></p></div></li><li><div><p><i><u></u></i><i>0 users rated this 3 out of 5 stars</i></p></div></li><li><div><p><i><u></u></i><i>0 users rated this 2 out of 5 stars</i></p></div></li><li><div><p><i><u></u></i><i>0 users rated this 1 out of 5 stars</i></p></div></li></ul></div></div><div><p></p><h3>Most relevant reviews</h3><p></p><ul><li><div><h4>rinnai heater</h4><p>there are o cons the heat is even and nice love it</p><p><span>Verified purchase: </span><span>Yes</span><span> | </span><span>Condition: </span><span>New</span></p></div></li></ul></div></div></div></div>",
  //       "image": "https://i.ebayimg.com/images/g/xUUAAOSwVJ5hQHu0/s-l600.jpg",
  //       "highlights": [
  //         "About this product   Product Identifiers   Brand Rinnai   MPN EX22CTP   GTIN 0766156009884   UPC 0766156009884   Model EX22CTP   eBay Product ID (ePID) 10028423617     Product Key Features   Power Source Propane   Color Beige   Item Depth 32.5   Heating System Furnace   Number of Heat Settings 1   Voltage 120 volts   Features Timer   Material Steel   Type Vent   Mounting Location Wall   Smart Home Protocol 60 Hz     Dimensions   Item Width 29.9 in        Best Selling in Space Heaters   Current slide {CURRENT_SLIDE} of {TOTAL_SLIDES}- Best Selling in Space Heaters     Save on Space Heaters   Current slide {CURRENT_SLIDE} of {TOTAL_SLIDES}- Save on Space Heaters      You may also like    Current slide {CURRENT_SLIDE} of {TOTAL_SLIDES}- You may also like      Ratings and Reviews    5.0   5.0 out of 5 stars based on 1 product rating   1 product rating            1 users rated this 5 out of 5 stars           0 users rated this 4 out of 5 stars           0 users rated this 3 out of 5 stars           0 users rated this 2 out of 5 stars           0 users rated this 1 out of 5 stars          Most relevant reviews      rinnai heater there are o cons the heat is even and nice love it  Verified purchase:  Yes  |  Condition:  New"
  //       ],
  //       "highlightScores": [
  //         0.03708697482943535
  //       ]
  //     },
  //     {
  //       "score": 0.16148823499679565,
  //       "title": "Mr. Heater MH9BX Propane Radiant Heater - Red/Black for sale online | eBay",
  //       "id": "https://www.ebay.com/p/80403244",
  //       "url": "https://www.ebay.com/p/80403244",
  //       "publishedDate": "2017-01-22T00:00:00.000Z",
  //       "author": "rokittmaan",
  //       "text": "<div><div><div> <main><div><h2>Picture 1 of 9</h2></div><section><div><p><span>New in the box never used, never opened, never needed.</span></p></div><ul><li></li><li></li><li></li></ul></section></main></div><div><div><h2>About this product</h2><section><div><h3>Product Identifiers</h3><ul><li><p>Brand</p><p>Mr. Heater</p></li><li><p>MPN</p><p>F232000, MH9BX</p></li><li><p>UPC</p><p>0089301321618, 0709730223658, 0089301320000</p></li><li><p>Model</p><p>Mr. Heater MH9BX</p></li><li><p>eBay Product ID (ePID)</p><p>80403244</p></li></ul></div><div><h3>Product Key Features</h3><ul><li><p>Timer Control</p><p>6 hrs</p></li><li><p>Power Source</p><p>Propane</p></li><li><p>Tank Capacity</p><p>20 gal</p></li><li><p>Control Style</p><p>Rotary Knob</p></li><li><p>Color</p><p>Black</p></li><li><p>Item Depth</p><p>14.25in.</p></li><li><p>Heating System</p><p>Heat Pump</p></li><li><p>Number of Heat Settings</p><p>3</p></li><li><p>BTU Heating Rating</p><p>4000-9000 BTU</p></li><li><p>Area Covered</p><p>201-250 sq ft</p></li><li><p>California Prop 65 Warning</p><p>Yes</p></li><li><p>Type</p><p>Portable Heater</p></li><li><p>Mounting Location</p><p>Floor</p></li></ul></div><div><h3>Dimensions</h3><ul><li><p>Item Length</p><p>14.25 in</p></li><li><p>Item Width</p><p>9in.</p></li><li><p>Depth</p><p>14.25in.</p></li><li><p>Height</p><p>15in.</p></li></ul></div></section></div><div><h2><span>All listings for this product</span></h2></div><div><div><div><p><span>4.8</span></p><p><span>4.8 out of 5 stars based on 586 product ratings</span></p><p><span>586 product ratings</span></p></div><div><ul><li><div><p><i><u></u></i><i>511 users rated this 5 out of 5 stars</i></p></div></li><li><div><p><i><u></u></i><i>49 users rated this 4 out of 5 stars</i></p></div></li><li><div><p><i><u></u></i><i>14 users rated this 3 out of 5 stars</i></p></div></li><li><div><p><i><u></u></i><i>2 users rated this 2 out of 5 stars</i></p></div></li><li><div><p><i><u></u></i><i>10 users rated this 1 out of 5 stars</i></p></div></li></ul></div></div><div><div><h3>Most relevant reviews</h3></div><ul><li><div><p><span>5 out of 5 stars</span></p><p>by <span>Jan 22, 2017</span></p><p>Top favorable review</p></div><div><h4>Finally Warm In My Shop</h4><p>I bought this heater for my small garage workshop. My electric heater kept tripping the breaker while using other equipment. I was afraid of other gas heaters due to their carbon monoxide emissions. This was one of the few gas heaters rated for indoor use. It also has an oxygen depletion detector and tip over cut off feature which I thought was very important.\nThis heater silently keeps my shop warm in even the coldest temperatures and can also be attached to a 20 pound propane tank with an accessory hose ~ which I also purchased. I've run this heater for up to 6 hours uninterrupted with no noticeable fumes and since all the heat is focused out the front, it can be set close to a wall with no worries.\nI know I'm going to get a lot of use out of this heater. It was a very reasonable price<span> and filled my needs perfectly. Highly recomend the Mr. Heater Buddy for heating small spaces.</span>Read full review</p><p><span>Verified purchase: </span><span>Yes</span><span> | </span><span>Condition: </span><span>New</span></p></div></li><li><div><p><span>3 out of 5 stars</span></p><p>by <a href=\"https://www.ebay.com/usr/claypieces\">claypieces</a><span>Nov 04, 2018</span></p><p>Top critical review</p></div><div><h4>It's O.K. but nothing to rave about. Wish it put out more heat. </h4><p>I thought this would put out A LOT more heat than it does. What I like about it, is that the propane can is easily put into place, turning on is easy, it's all in one piece and don' t have to fuss with extra parts to get it to work, and if it tips over or gets bumped, it shuts off. But it doesn't not put off near as much heat as I thought it would ! I found I was sitting very close to it to stay warm. </p><p><span>Verified purchase: </span><span>Yes</span><span> | </span><span>Condition: </span><span>Pre-owned</span></p></div></li><li><div><h4>It’s the Fire!!</h4><p>Here in Monterey County the weather can be colder in the evenings. At my home we cut of the central heating back in ‘88 so we all dress up like eskimos to keep warm. Don’t get me wrong. We do use electric heaters in certain areas but after purchasing this Portable Propane heater, it was Heaven sent. I recommend this product with all my heart. It is compact. It is durable. It is easy to refuel. It is warm to hot. And now, as we speak, the 5 ft extension hose just arrived. When connected from my Gas Buddy to a 20 lb propane tank, I should get at least 24 hrs of constant heat. Thank you for your time.\n</p><p><span>Verified purchase: </span><span>Yes</span><span> | </span><span>Condition: </span><span>New</span></p></div></li><li><div><h4>Instant Heat, so easy!</h4><p>The last power outage we only had kerosene heaters. They are big, bulky, heavy, require pouring fuel and the fumes left us wheezing and coughing. Therefore, we found these Mr. Heater, bought two and what a difference. Small enough to be moved from room to room and so much safer. You will love Mr Heater.</p><p><span>Verified purchase: </span><span>Yes</span><span> | </span><span>Condition: </span><span>New</span></p></div></li><li><div><h4>Just about the best small space heater</h4><p>Small and practical for portable heat when equipped with a disposable bottle, it's even great for a more permanent heat source - just pair this heater up with a hose and a large refillable propane bottle. It even has a pilot light for easy on and off use. Two heat settings, 4000 and 9000 BTUs. The back of the heater stays cool to the touch, so it can be used backed against a wall. Six stars for this heater.</p><p><span>Verified purchase: </span><span>Yes</span><span> | </span><span>Condition: </span><span>New</span></p></div></li></ul></div></div><div><div><h2>Best Selling in Space Heaters</h2></div><div><p>Current slide {CURRENT_SLIDE} of {TOTAL_SLIDES}- Best Selling in Space Heaters</p></div></div></div></div></div>",
  //       "image": "https://i.ebayimg.com/images/g/eEUAAOSwZRJjWTm2/s-l600.jpg",
  //       "highlights": [
  //         "This was one of the few gas heaters rated for indoor use. It also has an oxygen depletion detector and tip over cut off feature which I thought was very important. This heater silently keeps my shop warm in even the coldest temperatures and can also be attached to a 20 pound propane tank with an accessory hose ~ which I also purchased. I've run this heater for up to 6 hours uninterrupted with no noticeable fumes and since all the heat is focused out the front, it can be set close to a wall with no worries. I know I'm going to get a lot of use out of this heater."
  //       ],
  //       "highlightScores": [
  //         0.5941135883331299
  //       ]
  //     },
  //     {
  //       "score": 0.1612439751625061,
  //       "title": "Craftsman Electric Ceramic Portable Heater for Garage Shop 90285 for sale online | eBay",
  //       "id": "https://www.ebay.com/p/25011369377?iid=352532649704",
  //       "url": "https://www.ebay.com/p/25011369377?iid=352532649704",
  //       "publishedDate": "2017-02-14T00:00:00.000Z",
  //       "author": "dwallr",
  //       "text": "<div><div><div><h2>About this product</h2><section><div><h3>Product Identifiers</h3><ul><li><p>Brand</p><p>Craftsman</p></li><li><p>MPN</p><p>90285</p></li><li><p>GTIN</p><p>0075877701251, 0745964356649</p></li><li><p>UPC</p><p>0075877701251, 0745964356649</p></li><li><p>eBay Product ID (ePID)</p><p>25011369377</p></li></ul></div><div><h3>Product Key Features</h3><ul><li><p>Power Source</p><p>Kerosene, Electric, Fan</p></li><li><p>Year Manufactured</p><p>2015</p></li><li><p>Heating Element Format</p><p>Coil</p></li><li><p>Control Style</p><p>Switch, Remote Control, Analog/Mechanical, Dial</p></li><li><p>Compressor Type</p><p>Remote</p></li><li><p>Color</p><p>Red</p></li><li><p>Cooling System</p><p>Direct</p></li><li><p>Heating System</p><p>Forced Air/Fan</p></li><li><p>Number of Heat Settings</p><p>3</p></li><li><p>Voltage</p><p>120 V</p></li><li><p>Features</p><p>Timer, Oscillation, Auto Shut-off</p></li><li><p>Material</p><p>Steel, Ceramic</p></li><li><p>Mounting Location</p><p>Floor, Cabinet, Desk/Tabletop</p></li><li><p>Smart Home Protocol</p><p>Infrared</p></li></ul></div><div><h3>Dimensions</h3><ul><li><p>Item Width</p><p>8</p></li><li><p>Item Weight</p><p>1.2 pounds</p></li></ul></div></section></div><div><div><h2>Best Selling in Space Heaters</h2></div><div><p>Current slide {CURRENT_SLIDE} of {TOTAL_SLIDES}- Best Selling in Space Heaters</p></div></div><div><div><div><p><span>4.4</span></p><p><span>4.4 out of 5 stars based on 11 product ratings</span></p><p><span>11 product ratings</span></p></div><div><ul><li><div><p><i><u></u></i><i>7 users rated this 5 out of 5 stars</i></p></div></li><li><div><p><i><u></u></i><i>3 users rated this 4 out of 5 stars</i></p></div></li><li><div><p><i><u></u></i><i>0 users rated this 3 out of 5 stars</i></p></div></li><li><div><p><i><u></u></i><i>0 users rated this 2 out of 5 stars</i></p></div></li><li><div><p><i><u></u></i><i>1 users rated this 1 out of 5 stars</i></p></div></li></ul></div></div><div><div><h3>Most relevant reviews</h3></div><ul><li><div><p><span>4 out of 5 stars</span></p><p>by <span>Feb 14, 2017</span></p></div><div><h4>Deal</h4><p>I bought two of these and they are a value.\nFor there size they heat my 300 square feet shop to comfort.</p><p><span>Verified purchase: </span><span>Yes</span><span> | </span><span>Condition: </span><span>New</span></p></div></li><li><div><h4>It's more than it looks on the picture but it does the job</h4><p><span>Verified purchase: </span><span>Yes</span><span> | </span><span>Condition: </span><span>New</span></p></div></li><li><div><h4>Best 1500 watt heater</h4><p>I have had several small heaters up until purchasing this one none compare</p><p><span>Verified purchase: </span><span>Yes</span><span> | </span><span>Condition: </span><span>New</span></p></div></li><li><div><h4>Very good</h4><p>The heater is very eficient</p><p><span>Verified purchase: </span><span>Yes</span><span> | </span><span>Condition: </span><span>New</span></p></div></li><li><div><h4>Not even a good hand warmer</h4><p>Doesn't make enough heat to warm your hands. I wouldn't recommend this for heating anything bigger than a a small dog house.</p><p><span>Verified purchase: </span><span>Yes</span><span> | </span><span>Condition: </span><span>New</span></p></div></li></ul></div></div></div></div>",
  //       "image": "https://i.ebayimg.com/images/g/7WgAAOSwQ7haxTU1/s-l1600.jpg",
  //       "highlights": [
  //         "I wouldn't recommend this for heating anything bigger than a a small dog house. Verified purchase:  Yes  |  Condition:  New"
  //       ],
  //       "highlightScores": [
  //         0.357542484998703
  //       ]
  //     }
  //   ]
  // }
}
