# DrayDesk

Container clocks in dollars for drayage owner-operators and small dray fleets.

For every container you haul, DrayDesk keeps the Last Free Day, the demurrage tiers, the terminal appointment and the empty-return (per diem) deadline in one place, then works out what each one costs if it slips and ranks the board by **dollars per hour until the next charge lands**. The top of the screen always says which box to move next.

- **Live web app:** https://assiamahs.github.io/draydesk/
- **Plans / sales page:** https://assiamahs.github.io/draydesk/pricing.html

## What's in the repo

| Path | What it is |
| --- | --- |
| `web/` | The product today. Static HTML/CSS/JS, no build step, works offline (PWA), data in `localStorage`. Two panes (board + detail) at 700px and wider, the width of the iPhone Duo inner display. One pane with a bottom sheet below that. |
| `web/pricing.html` | Sales page. The "Start" buttons read `PAY_URL` and `CONTACT` from `web/config.js`. |
| `ios/` | SwiftUI app (XcodeGen, iOS 26.0+, `com.assiamah.draydesk`). `NavigationSplitView`: folded it's a stack with the Next Move card on top; unfolded it's the board plus a detail pane. Selection survives fold/unfold through `@SceneStorage`, data lives in SwiftData on the device. |
| `.github/workflows/pages.yml` | Deploys `web/` to GitHub Pages. |
| `.github/workflows/ios.yml` | Builds the iOS app unsigned for the simulator on the `xcode-27` runner (iOS 27.x SDK, needed for the Duo inner display). |

## The business case

**Buyer.** Owner-operators and 1-25 truck drayage carriers at U.S. ports and rail ramps (NY/NJ, Savannah, Charleston, Houston, LA/Long Beach, Seattle/Tacoma, Chicago ramps). They run a TMS for billing, or a spreadsheet, or nothing. None of those tell them that one box is about to cost $400 a day while another has three days of slack.

**The pain, in dollars.** Terminals charge demurrage when a loaded box sits past Last Free Day; steamship lines charge per diem (detention) until the empty comes back. Typical rates are $75-$300+ per container per day, stepping up after a few days. Since the September 2025 D.C. Circuit decision, ocean carriers can bill motor carriers directly again under carrier haulage, so more of these invoices land on the trucker.

**Price.** $15 per truck per month (Owner-Op Pro). Fleet pilot: $99 for the first month for up to 10 trucks, with a refund if it doesn't save more than $99. The free web board stays free. One avoided demurrage day pays for a year for one truck.

**Competitors.** PortPro, DrayMate, Trinium, CargoWise Landside: full drayage TMS, quote-based, sold to fleets with dispatch offices. TMSEZ lists $15/truck/month with per diem alerts ($75/month minimum). DrayDesk is not a TMS. It's the one screen the driver or the one-person dispatcher looks at before the first move of the day, and it works on a phone.

**Evidence**

- A custom "container clock" board built for a Savannah dray fleet: about 200 containers in motion, $55-60k/month in demurrage and per diem, cut to about $12k/month once every clock was visible in dollars. Dispatchers had been spending 2-3 hours each morning checking terminal sites by hand. https://x.com/erikerikerik443/status/2061887515045269712
- Owner-operators asking how drayage works and what app would help: https://www.reddit.com/r/Truckers/comments/1upo03v/how_do_owner_operators_get_drayageintermodal_loads/ and https://www.reddit.com/r/Truckers/comments/1e0ctlv/if_you_could_have_any_app_for_trucking_drayage/
- Court vacates the FMC rule that barred billing truckers for D&D: https://www.freightwaves.com/news/demurrage-dilemma-court-overturns-fmcs-trucking-rule and https://www.huschblackwell.com/newsandinsights/appeals-court-decision-reshapes-detention-and-demurrage-billing-landscape-for-truckers
- Per-truck pricing in the category ($15/truck/mo, TMSEZ) and drayage software that is quote-only: https://sourceforge.net/software/drayage
- Typical D&D rates per container per day: https://vizionapi.com/blog/know-your-charge-per-diem-demurrage-and-detention

## First dollar plan (24 hours)

1. Make a Stripe Payment Link: **$15/month recurring, quantity adjustable (trucks)**. Make a second one for the **$99 fleet pilot**. Paste the first into `PAY_URL` in `web/config.js`. If you don't have Stripe ready yet, set `CONTACT` to your email or cell. The Start button then opens a filled-in request, and you invoice by hand.
2. Post the free board and the outreach message below in places where drayage people talk: r/Truckers, r/OwnerOperators, r/FreightBrokers, r/logistics; Facebook groups (search "drayage", "port truckers", "intermodal drivers", plus the port name: Newark, Savannah, Houston, Long Beach; join the active ones and read the rules before posting); LinkedIn search for "drayage owner operator" and "dray dispatcher".
3. Direct outreach: 20 small dray carriers from the FMCSA search near Port Newark/Elizabeth, Savannah (Garden City), Houston (Barbours Cut / Bayport). Call or text the number on the listing. Ask for dispatch.
4. Offer each first reply the pilot: "Send me a screenshot or CSV of your open boxes. I'll load them into DrayDesk tonight and text you the Next Move each morning this week. $99 if it saves you more than $99."

**Outreach message (paste as is)**

> Quick one for dray guys: how many of you got hit with demurrage or per diem this month on a box you could've moved in time? I built a free board that puts every container's Last Free Day and empty-return date on one screen *in dollars* and tells you which box to pull first. Works on your phone, no login, nothing uploaded: https://assiamahs.github.io/draydesk/
> If you run a few trucks and want me to load your open containers for you this week, it's $99 for the month and free if it doesn't save you more than that. Reply or DM.

**Honest month-1 range:** $0-$300. A realistic good outcome is 1-3 pilots at $99 plus a few $15 owner-ops, out of about 200 people reached. Drayage buyers buy from someone they've talked to, so the phone calls in step 3 matter more than the posts.

## Setting PAY_URL

Edit `web/config.js`:

```js
window.DRAYDESK_CONFIG = {
  PAY_URL: "https://buy.stripe.com/your-link", // checkout link; "" = show the request-access form
  CONTACT: "you@example.com",                 // email or phone; used by the request-access form
  PRICE_PER_TRUCK: 15,
};
```

Commit and push. The Pages workflow redeploys in about a minute. The service worker fetches `config.js` network-first, so installed copies pick up the new link right away.

## Running locally

```sh
python3 -m http.server 8000 --directory web    # web app
cd ios && xcodegen generate && open DrayDesk.xcodeproj   # iOS app (Xcode 27.x for the Duo inner display)
```

## Notes

- Rates and free days vary by line, terminal and contract. DrayDesk calculates from what you enter. It doesn't pull terminal data yet.
- Container numbers are checked against the ISO 6346 check digit as you type, which catches the most common typo before it costs you a day.
