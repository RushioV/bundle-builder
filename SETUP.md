# Setup Instructions

## Local Setup

### Prerequisites
- Shopify CLI installed (`npm install -g @shopify/cli`)
- Access to your Shopify store
- Git installed

### Installation

1. **Initialize Git Repository**
   ```bash
   cd "d:\Git\Shopify\Build Your Own Bundle"
   git init
   ```

2. **Add Files to Git**
   ```bash
   git add .
   git commit -m "Initial commit: Bundle Builder implementation"
   ```

3. **Create GitHub Repository**
   - Go to https://github.com/new
   - Repository name: `shopify-bundle-builder`
   - Description: "Interactive multi-step bundle creation for Shopify"
   - Make it **PRIVATE**
   - Do NOT initialize with README (we have one)

4. **Connect Local to Remote**
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/shopify-bundle-builder.git
   git branch -M main
   git push -u origin main
   ```

5. **Add Collaborators**
   - Go to Settings → Collaborators
   - Add: `dibyank@nyxalabs.com`
   - Add: `soumyank@nyxalabs.com`

## Theme Installation

1. **Connect Development Theme**
   ```bash
   shopify theme push
   ```
   This uploads all theme files to your development theme on Shopify.

2. **Access Theme Editor**
   - Go to Shopify Admin → Sales channels → Online Store → Themes
   - Click "Customize" on your development theme
   - Scroll to "Add section"
   - Search for "Bundle Builder"
   - Click to add the section

3. **Configure Section**
   - **Shirt Collection:** Select your apparel/shirts collection
   - **Accessory Collection:** Select your accessories collection
   - **Extras Collection:** Select your extras/add-ons collection
   - **Products Per Step:** 6 (or custom range 4-12)
   - **Enable Extras:** Toggle on/off for 3-step or 4-step flow
   - **Custom Text:** Update headings and descriptions
   - **Discounts:** Adjust percentage tiers and thresholds
   - **Colors:** Choose accent and background colors

4. **Save & Publish**
   - Click "Save"
   - When ready, publish to live store

## Testing Checklist

### Desktop (1440px+)
- [ ] All 4 steps render correctly
- [ ] Sidebar pricing visible and sticky
- [ ] 3-column product grid displays
- [ ] Hover effects work smoothly
- [ ] Navigation buttons enable/disable properly
- [ ] Add to cart completes successfully

### Tablet (768px - 1439px)
- [ ] Products grid shows 2 columns
- [ ] Pricing converts to bottom drawer
- [ ] Drawer expands/collapses smoothly
- [ ] All steps accessible

### Mobile (375px - 767px)
- [ ] Products grid single column
- [ ] Bottom sticky bar shows item count + price
- [ ] Tap to expand pricing sheet
- [ ] 44px touch targets working
- [ ] Safe area insets respected (notch, home indicator)
- [ ] Step transitions smooth
- [ ] Add to cart button full-width

### Functionality
- [ ] Select shirt → enable next
- [ ] Select accessory → enable next
- [ ] Extras optional (can skip)
- [ ] Back button preserves selections
- [ ] Pricing updates in real-time
- [ ] Discount messages show correctly
- [ ] Add bundle to cart → /cart page appears
- [ ] Cart shows all items with properties

### Accessibility
- [ ] Tab through products with keyboard
- [ ] Space/Enter to select
- [ ] Focus indicators visible
- [ ] Screen reader announces items
- [ ] Error messages read aloud
- [ ] All buttons reachable via keyboard

### Edge Cases
- [ ] Make product out of stock → shows disabled state
- [ ] Disconnect network → error message appears
- [ ] Click add to cart twice → prevents duplicate
- [ ] Close browser tab → back button doesn't restore (no persist yet)

### Performance
- [ ] First page load < 2 seconds
- [ ] Step 1 loads quickly
- [ ] Each subsequent step loads in < 500ms
- [ ] Pricing updates instantly
- [ ] Lighthouse score > 85

## Troubleshooting

### Products Not Loading
- Check collection handles are correct in theme editor
- Verify collections exist in Shopify Admin
- Check browser console for fetch errors

### Pricing Not Updating
- Verify JavaScript bundle-builder.js is loaded (`Ctrl+Shift+J`)
- Check discount tier settings in theme editor
- Ensure variant prices are set on products

### Styles Looking Wrong
- Clear browser cache (`Ctrl+Shift+R`)
- Ensure bundle-builder.css is loading
- Check for CSS conflicts from other sections

### Cart Add Not Working
- Verify variant IDs are correct
- Check that selected products have live variants
- Look for CORS errors in console
- Test in different browser

## Performance Optimization

1. **Image Optimization**
   ```bash
   # Use Shopify's image API
   {{ collection.products.first.featured_image | image_url: width: 200 }}
   ```

2. **Lazy Load Images** (Already implemented)
   ```html
   <img loading="lazy" ... />
   ```

3. **Minimize Bundle Size** (Already done)
   - Single JS file vs multiple
   - Single CSS file vs multiple

4. **Lighthouse Audit**
   ```bash
   # Run in Chrome DevTools
   Ctrl+Shift+J → Lighthouse → Generate report
   ```

## Monitoring & Analytics

### Google Analytics Integration (Optional)

Add to bundle-builder.js:
```javascript
gtag('event', 'bundle_step_complete', {
  step: this.state.currentStep,
  item_count: this.state.selections.length
});

gtag('event', 'bundle_added_to_cart', {
  items: this.state.selections.length,
  discount_percent: pricing.discountPercent,
  total: pricing.total
});
```

### Shopify Analytics

All bundle items will appear in Shopify analytics with:
- `_bundle_id` in line item properties
- `_bundle_discount` applied
- Each product tracked individually

## Version History

- **v1.0** (2024-03-28): Initial implementation
  - 4-step flow with dynamic pricing
  - Full responsive design
  - Accessibility compliance
  - AJAX loading and cart integration

## Support

For issues or questions:
1. Check browser console for JavaScript errors
2. Review README.md for architectural details
3. Verify section configuration in theme editor
4. Test with sample products first

---

**Assignment Deadline:** 48 hours from receipt
**Submission:** GitHub repo link + Screen recording (5 min)
