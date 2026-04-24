# Bundle Builder

Custom Shopify "Build Your Own Bundle" experience built with Liquid, scoped CSS, and vanilla JavaScript.

## File Structure

- `sections/bundle-builder.liquid`
  Section markup, schema settings, data attributes, mobile summary shell, and confirmation state container.
- `assets/bundle-builder.js`
  BundleBuilder class for state management, AJAX collection loading, pricing, stock validation, cart integration, and success confirmation flow.
- `assets/bundle-builder.css`
  Section-scoped desktop/tablet/mobile styles, motion, sticky pricing UI, and confirmation styling.
- `templates/page.bundle-builder.liquid`
  Dedicated page template that renders the section on its own page.

## Architecture Overview

The section is powered by one `BundleBuilder` instance per rendered section.

Core state tracks:
- current step
- loaded collection data per step
- selected shirt
- selected accessory
- selected extras
- last chosen variant per product card
- add-to-cart submission state
- post-success confirmation payload

State is kept in JavaScript and persisted to `sessionStorage` so back navigation inside the builder does not lose progress. After a successful bundle add, persisted state is cleared so old selections do not leak into the next bundle flow.

## Data Flow

1. Step 1 loads shirt products.
2. Step 2 loads accessories only when the customer reaches that step.
3. Step 3 loads extras only when needed.
4. Variant choice is stored independently from selection, so changing `Size` does not auto-select the product.
5. Pricing recalculates instantly on every selection, deselection, or variant change.
6. The same pricing payload powers:
   - desktop sticky summary
   - mobile sticky summary / drawer
   - review step
   - success confirmation state

## Bundle Rules Implemented

- Step 1 allows exactly one shirt selection at a time.
- Step 2 allows exactly one accessory selection at a time.
- Step 3 extras allow multi-select.
- Step 4 reviews all selected items before submission.
- Going back preserves prior selections and variant choices.
- Forward navigation is blocked until required steps are satisfied.

## Pricing Engine

Discount tiers are driven from the section schema:

- Tier 1: threshold + percent
- Tier 2: threshold + percent
- Tier 3: threshold + percent

Displayed pricing includes:
- selected item lines
- subtotal
- current discount percent
- savings amount
- final total
- "add X more items" messaging when another tier is available

## Cart Integration

When the customer submits the bundle, all selected items are posted in one `/cart/add.js` request.

Each item includes:
- `_bundle_id`
- `_bundle_discount`
- `_bundle_position`

Current `_bundle_position` values:
- `shirt`
- `accessory`
- `extra`

The bundle ID is timestamp-based and unique per submission.

## Discount Strategy: Shopify Plus vs Non-Plus

The storefront code calculates and displays the discount tier, but checkout pricing must still be enforced on Shopify's side.

### Shopify Plus / Shopify Functions

Recommended production strategy:
- detect lines grouped by the same `_bundle_id`
- inspect `_bundle_discount`
- apply a matching percentage discount in Shopify Functions

Why this is preferred:
- server-side and trustworthy
- survives cart edits better than client-only display logic
- keeps actual checkout totals aligned with bundle messaging

### Non-Plus Fallback

Recommended fallback:
- generate or map bundle discount codes by tier
- apply the matching automatic discount / discount code when the bundle is added
- keep `_bundle_id` and `_bundle_discount` on lines for operational tracing

If a store cannot support automatic discount application directly, the current metadata still makes bundle grouping and admin review possible.

## Edge Cases Handled

- Out-of-stock before add:
  Selected variants are checked through `/variants/[id].js` before `/cart/add.js`.
- Network failure mid-request:
  Add-to-cart uses `AbortController` and reports timeout failures cleanly.
- Duplicate add attempt:
  The builder tracks the last bundle signature and blocks the exact same bundle from being added again immediately.
- Returning after success:
  Builder state is cleared after a completed add so stale selections are not shown to the next bundle attempt.

## Confirmation Flow

After successful add-to-cart, the builder now shows a full confirmation state in-section instead of redirecting immediately.

It includes:
- bundle summary
- applied discount
- final total
- `Continue Shopping`
- `Go to Cart`
- `Go to Checkout`

This satisfies the assignment requirement that allows either redirecting to cart or showing a full confirmation state.

## Theme Editor Settings

The section schema supports:
- shirt collection picker
- accessory collection picker
- extras collection picker
- products per step
- extras step toggle
- sticky mobile pricing toggle
- step heading / description copy
- tier thresholds
- tier discount percentages
- accent color
- background color

## Performance Optimizations

- products are lazy-loaded per step instead of preloading all collections
- images use native lazy loading
- CSS is fully scoped to `[data-bundle-section]`
- event delegation is used on product grids
- pricing is computed locally without extra pricing API requests

## Accessibility

- keyboard-accessible product actions
- focus shift back to the active step heading on step navigation
- `aria-live` messaging for important state updates and errors
- visible focus styling
- reduced-motion support

## Technical Decisions

- Vanilla JS instead of a framework:
  keeps the section theme-compatible and simple to deploy in Shopify.
- AJAX collection loading:
  lowers initial page weight and matches the assignment requirement.
- In-section confirmation screen:
  provides stronger UX than an instant redirect while still keeping cart and checkout paths obvious.
- Variant choice separated from selection:
  prevents accidental product selection when only changing size.

## What I'd Improve Next

- Add a real count-up number animation for pricing changes
- Add a stronger cart error animation state on the submit button
- Add automated tests for pricing tiers and cart payload generation
- Add a concrete Shopify Functions example snippet for production discount enforcement
