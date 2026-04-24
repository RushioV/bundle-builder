class BundleBuilder {
  constructor(section) {
    this.section = section;
    this.id = section.dataset.sectionId;
    this.storageKey = `bundle-builder:${this.id}`;
    this.completedKey = `${this.storageKey}:completed`;
    this.currency = window.Shopify?.currency?.active || 'USD';
    this.money = new Intl.NumberFormat(document.documentElement.lang || 'en-US', {
      style: 'currency',
      currency: this.currency,
    });

    this.config = this.getConfig();
    this.totalSteps = this.config.enableExtras ? 4 : 3;
    this.stepRoles = { 1: 'shirt', 2: 'accessory', 3: this.config.enableExtras ? 'extra' : 'review', 4: 'review' };
    this.state = {
      currentStep: 1,
      direction: 'forward',
      collections: { shirt: [], accessory: [], extra: [] },
      loaded: { shirt: false, accessory: false, extra: false },
      selections: { shirts: [], accessories: [], extras: [] },
      variantChoices: { shirt: {}, accessory: {}, extra: {} },
      mobileOpen: false,
      submitting: false,
      lastAddedSignature: null,
      confirmation: null,
    };

    this.cacheDom();
    this.restoreState();
    this.bindEvents();
    this.render();
    this.loadProductsForCurrentStep();
  }

  getConfig() {
    const num = (name, fallback) => {
      const value = Number.parseInt(this.section.dataset[name], 10);
      return Number.isFinite(value) ? value : fallback;
    };

    return {
      enableExtras: this.section.dataset.enableExtras === 'true',
      enableMobileSticky: this.section.dataset.enableMobileSticky === 'true',
      productsPerStep: num('productsPerStep', 6),
      collections: {
        shirt: this.section.dataset.shirtCollection || '',
        accessory: this.section.dataset.accessoryCollection || '',
        extra: this.section.dataset.extraCollection || '',
      },
      headings: {
        1: [this.section.dataset.step1Heading || 'Choose your shirt', this.section.dataset.step1Description || ''],
        2: [this.section.dataset.step2Heading || 'Choose your accessory', this.section.dataset.step2Description || ''],
        3: this.section.dataset.enableExtras === 'true'
          ? [this.section.dataset.step3Heading || 'Add extras', this.section.dataset.step3Description || '']
          : [this.section.dataset.step4Heading || 'Review your bundle', this.section.dataset.step4Description || ''],
        4: [this.section.dataset.step4Heading || 'Review your bundle', this.section.dataset.step4Description || ''],
      },
      tiers: [
        { items: num('tier1Threshold', 2), percent: num('tier1Percent', 10) },
        { items: num('tier2Threshold', 3), percent: num('tier2Percent', 15) },
        { items: num('tier3Threshold', 5), percent: num('tier3Percent', 20) },
      ].sort((a, b) => a.items - b.items),
    };
  }

  cacheDom() {
    this.dom = {
      error: this.section.querySelector('[data-error-message]'),
      loading: this.section.querySelector('[data-loading]'),
      live: this.section.querySelector('[data-live-region]'),
      heading: this.section.querySelector('[data-step-heading]'),
      description: this.section.querySelector('[data-step-description]'),
      currentStep: this.section.querySelector('[data-current-step-label]'),
      progressFill: this.section.querySelector('[data-progress-fill]'),
      progressSteps: Array.from(this.section.querySelectorAll('[data-progress-step]')),
      panels: Array.from(this.section.querySelectorAll('[data-step-panel]')),
      grids: {
        shirt: this.section.querySelector('[data-products-grid="shirt"]'),
        accessory: this.section.querySelector('[data-products-grid="accessory"]'),
        extra: this.section.querySelector('[data-products-grid="extra"]'),
      },
      review: this.section.querySelector('[data-review-panel]'),
      sidebar: this.section.querySelector('[data-pricing-sidebar]'),
      prev: this.section.querySelector('[data-prev-step]'),
      next: this.section.querySelector('[data-next-step]'),
      add: this.section.querySelector('[data-add-to-cart]'),
      mobileBar: this.section.querySelector('[data-mobile-summary]'),
      mobileToggle: this.section.querySelector('[data-mobile-toggle]'),
      mobileCopy: this.section.querySelector('[data-mobile-trigger-copy]'),
      mobileTotal: this.section.querySelector('[data-mobile-trigger-total]'),
      mobileOverlay: this.section.querySelector('[data-mobile-overlay]'),
      mobileDrawer: this.section.querySelector('[data-mobile-drawer]'),
      mobilePanel: this.section.querySelector('[data-mobile-pricing-panel]'),
      mobileClose: this.section.querySelector('[data-mobile-close]'),
      layout: this.section.querySelector('.bundle-builder__layout'),
      confirmation: this.section.querySelector('[data-confirmation]'),
      confirmationSummary: this.section.querySelector('[data-confirmation-summary]'),
      confirmationReset: this.section.querySelector('[data-confirmation-reset]'),
      confirmationClose: this.section.querySelector('[data-confirmation-close]'),
    };
  }

  bindEvents() {
    this.dom.prev?.addEventListener('click', () => this.goToStep(this.state.currentStep - 1));
    this.dom.next?.addEventListener('click', () => this.goToStep(this.state.currentStep + 1));
    this.dom.add?.addEventListener('click', () => this.addBundleToCart());

    this.dom.progressSteps.forEach((button) => {
      button.addEventListener('click', () => {
        const target = Number.parseInt(button.dataset.progressStep, 10);
        if (target <= this.highestUnlockedStep()) this.goToStep(target);
      });
    });

    ['shirt', 'accessory', 'extra'].forEach((role) => {
      const grid = this.dom.grids[role];
      if (!grid) return;
      grid.addEventListener('click', (event) => this.onGridClick(event, role));
      grid.addEventListener('change', (event) => this.onVariantChange(event, role));
      grid.addEventListener('keydown', (event) => {
        if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[data-select-product]')) {
          event.preventDefault();
          this.onGridClick(event, role);
        }
      });
    });

    this.dom.mobileToggle?.addEventListener('click', () => this.toggleMobileSummary(true));
    this.dom.mobileClose?.addEventListener('click', () => this.toggleMobileSummary(false));
    this.dom.mobileOverlay?.addEventListener('click', () => this.toggleMobileSummary(false));
    this.dom.confirmationReset?.addEventListener('click', () => this.finishConfirmation());
    this.dom.confirmationClose?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.finishConfirmation();
    });
    this.dom.confirmation?.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target : null;

      if (target?.closest('[data-confirmation-close]')) {
        this.finishConfirmation();
        return;
      }

      if (event.target === this.dom.confirmation) {
        this.finishConfirmation();
        return;
      }

      if (event.target.closest('a')) {
        sessionStorage.setItem(this.completedKey, 'true');
        this.clearPersistedState();
      }
    });

    this.boundScroll = this.handleScroll.bind(this);
    this.boundVisibility = this.handleVisibility.bind(this);
    window.addEventListener('scroll', this.boundScroll, { passive: true });
    document.addEventListener('visibilitychange', this.boundVisibility);
    this.boundPageShow = this.handlePageShow.bind(this);
    window.addEventListener('pageshow', this.boundPageShow);
  }

  restoreState() {
    try {
      if (sessionStorage.getItem(this.completedKey) === 'true') {
        sessionStorage.removeItem(this.completedKey);
        this.clearPersistedState();
        return;
      }
      const raw = sessionStorage.getItem(this.storageKey);
      if (!raw) return;
      const saved = JSON.parse(raw);
      this.state.currentStep = Math.min(Math.max(saved.currentStep || 1, 1), this.totalSteps);
      this.state.selections = {
        shirts: Array.isArray(saved.selections?.shirts) ? saved.selections.shirts : [],
        accessories: Array.isArray(saved.selections?.accessories) ? saved.selections.accessories : [],
        extras: Array.isArray(saved.selections?.extras) ? saved.selections.extras : [],
      };
      this.state.variantChoices = {
        shirt: saved.variantChoices?.shirt || {},
        accessory: saved.variantChoices?.accessory || {},
        extra: saved.variantChoices?.extra || {},
      };
      this.state.lastAddedSignature = saved.lastAddedSignature || null;
    } catch (error) {
      console.warn('Bundle builder restore failed', error);
    }
  }

  persistState() {
    if (sessionStorage.getItem(this.completedKey) === 'true') return;
    sessionStorage.setItem(
      this.storageKey,
        JSON.stringify({
          currentStep: this.state.currentStep,
          selections: this.state.selections,
          variantChoices: this.state.variantChoices,
          lastAddedSignature: this.state.lastAddedSignature,
        })
      );
  }

  currentRole() {
    return this.stepRoles[this.state.currentStep];
  }

  highestUnlockedStep() {
    if (!this.state.selections.shirts.length) return 1;
    if (!this.state.selections.accessories.length) return 2;
    return this.totalSteps;
  }

  async goToStep(step) {
    if (step < 1 || step > this.totalSteps) return;
    if (step > this.state.currentStep && !this.validateStep(this.state.currentStep)) return;
    this.state.direction = step > this.state.currentStep ? 'forward' : 'backward';
    this.state.currentStep = step;
    this.render();
    await this.loadProductsForCurrentStep();
    this.dom.heading?.focus({ preventScroll: true });
    this.ensureStepHeaderVisible();
  }

  validateStep(step) {
    if (step === 1 && !this.state.selections.shirts.length) {
      this.showError('Select one shirt before continuing.');
      return false;
    }
    if (step === 2 && !this.state.selections.accessories.length) {
      this.showError('Select one accessory before continuing.');
      return false;
    }
    return true;
  }

  async loadProductsForCurrentStep() {
    const role = this.currentRole();
    if (!this.dom.grids[role] || this.state.loaded[role]) return;
    const handle = this.config.collections[role];
    if (!handle) {
      this.state.loaded[role] = true;
      this.renderEmpty(role, 'Choose a collection in the theme editor to populate this step.');
      return;
    }

    this.setLoading(true);
    try {
      const response = await fetch(`/collections/${handle}/products.json?limit=${this.config.productsPerStep}`);
      if (!response.ok) throw new Error('Unable to load products right now.');
      const data = await response.json();
      this.state.collections[role] = (data.products || []).map((product) => this.normalizeProduct(product)).filter(Boolean);
      this.state.loaded[role] = true;
      this.renderGrid(role);
    } catch (error) {
      this.renderEmpty(role, 'Products could not be loaded. Please try again.');
      this.showError(error.message || 'Unable to load products.');
    } finally {
      this.setLoading(false);
    }
  }

  normalizeProduct(product) {
    if (!product?.variants?.length) return null;
    const variants = product.variants.map((variant) => ({
      id: variant.id,
      title: variant.title === 'Default Title' ? '' : variant.title,
      available: Boolean(variant.available),
      priceCents: this.toCents(variant.price),
    }));
    const firstAvailable = variants.find((variant) => variant.available) || variants[0];
    const image = product.image?.src || product.featured_image?.src || product.images?.[0]?.src || product.images?.[0] || '';
    const optionName = Array.isArray(product.options) && product.options[0]?.name
      ? product.options[0].name
      : 'Variant';
    return {
      id: product.id,
      title: product.title,
      handle: product.handle,
      image,
      optionName,
      variants,
      firstVariantId: firstAvailable.id,
    };
  }

  render() {
    this.renderConfirmationState();
    const [title, description] = this.config.headings[this.state.currentStep];
    if (this.dom.currentStep) this.dom.currentStep.textContent = `Step ${this.state.currentStep} of ${this.totalSteps}`;
    if (this.dom.heading) this.dom.heading.textContent = title;
    if (this.dom.description) this.dom.description.textContent = description;

    this.dom.panels.forEach((panel) => {
      const active = Number.parseInt(panel.dataset.stepPanel, 10) === this.state.currentStep;
      panel.hidden = !active;
      panel.classList.toggle('is-active', active);
      panel.dataset.direction = this.state.direction;
    });

    ['shirt', 'accessory', 'extra'].forEach((role) => {
      if (this.state.loaded[role] && this.dom.grids[role]) this.renderGrid(role);
    });

    this.renderPricing();
    this.renderReview();
    this.updateActions();
    this.updateProgress();
    this.persistState();
  }

  renderConfirmationState() {
    const hasConfirmation = Boolean(this.state.confirmation);

    if (this.dom.confirmation) {
      this.dom.confirmation.hidden = !hasConfirmation;
      this.dom.confirmation.classList.toggle('is-open', hasConfirmation);
      this.dom.confirmation.style.display = hasConfirmation ? 'flex' : 'none';
    }

    if (hasConfirmation && this.dom.confirmationSummary) {
      this.dom.confirmationSummary.innerHTML = this.state.confirmation.loading
        ? this.renderConfirmationLoading(this.state.confirmation)
        : this.renderConfirmationSummary(this.state.confirmation);
    } else if (this.dom.confirmationSummary) {
      this.dom.confirmationSummary.innerHTML = '';
    }

    document.body.style.overflow = hasConfirmation ? 'hidden' : '';
  }

  renderGrid(role) {
    const grid = this.dom.grids[role];
    if (!grid) return;
    const products = this.state.collections[role];
    if (!products.length) {
      this.renderEmpty(role, 'No products are available in this collection.');
      return;
    }

      grid.innerHTML = products.map((product) => {
        const selected = this.findSelectedEntry(role, product.id);
        const variantId = this.state.variantChoices[role][product.id] || selected?.variantId || product.firstVariantId;
        const variant = product.variants.find((entry) => entry.id === variantId) || product.variants[0];
      const soldOut = !product.variants.some((entry) => entry.available);
      const isSelected = role === 'extra'
        ? this.state.selections.extras.some((entry) => entry.variantId === variant.id)
        : selected?.variantId === variant.id;

      return `
        <article class="bundle-builder__card ${isSelected ? 'is-selected' : ''} ${soldOut ? 'is-disabled' : ''}" data-product-card data-product-id="${product.id}">
          <div class="bundle-builder__card-media">
            ${product.image ? `<img src="${product.image}" alt="${this.escape(product.title)}" loading="lazy" width="480" height="480">` : '<div class="bundle-builder__card-placeholder"></div>'}
            <span class="bundle-builder__card-badge">${this.labelForRole(role)}</span>
            ${soldOut ? '<span class="bundle-builder__card-stock">Sold out</span>' : ''}
            ${isSelected ? `
              <span class="bundle-builder__card-check" aria-label="Selected">
                <span class="bundle-builder__card-check-icon" aria-hidden="true">✓</span>
                <span class="bundle-builder__card-check-text">Selected</span>
              </span>
            ` : ''}
          </div>
          <div class="bundle-builder__card-body">
            <div class="bundle-builder__card-copy">
              <h3>${this.escape(product.title)}</h3>
              <p>${this.formatMoney(variant.priceCents)}</p>
            </div>
            ${this.hasMeaningfulVariants(product) ? `
              <label class="bundle-builder__field">
                <span>${this.escape(product.optionName || 'Variant')}</span>
                <select class="bundle-builder__variant-select" data-variant-select ${soldOut ? 'disabled' : ''}>
                  ${product.variants.map((entry) => `
                    <option value="${entry.id}" ${entry.id === variant.id ? 'selected' : ''} ${entry.available ? '' : 'disabled'}>
                      ${this.escape(entry.title || 'Default')} ${entry.available ? '' : '(Sold out)'}
                    </option>
                  `).join('')}
                </select>
              </label>
            ` : ''}
            <button type="button" class="bundle-builder__select-button" data-select-product ${soldOut ? 'disabled' : ''} aria-pressed="${isSelected}">
              ${this.renderSelectButtonLabel(role, isSelected)}
            </button>
          </div>
        </article>
      `;
    }).join('');
  }

  renderEmpty(role, message) {
    this.dom.grids[role].innerHTML = `<div class="bundle-builder__empty">${this.escape(message)}</div>`;
  }

  renderPricing() {
    const pricing = this.getPricing();
    const markup = this.pricingMarkup(pricing);
    if (this.dom.sidebar) this.dom.sidebar.innerHTML = markup;
    if (this.dom.mobilePanel) this.dom.mobilePanel.innerHTML = markup;
    if (this.dom.mobileCopy) this.dom.mobileCopy.textContent = `${pricing.itemCount} ${pricing.itemCount === 1 ? 'item' : 'items'} selected`;
    if (this.dom.mobileTotal) this.dom.mobileTotal.textContent = this.formatMoney(pricing.totalCents);
  }

  pricingMarkup(pricing) {
    const items = pricing.items.length
      ? pricing.items.map((item) => `
          <li class="bundle-builder__summary-item">
            <span>
              <strong>${this.escape(item.title)}</strong>
              ${item.variantTitle ? `<small>${this.escape(item.variantTitle)}</small>` : ''}
            </span>
            <span>${this.formatMoney(item.priceCents)}</span>
          </li>
        `).join('')
      : '<li class="bundle-builder__summary-empty">Your selections will appear here.</li>';

    const unlock = pricing.nextTier
      ? `<div class="bundle-builder__unlock">Add ${pricing.itemsToNextTier} more ${pricing.itemsToNextTier === 1 ? 'item' : 'items'} to unlock ${pricing.nextTier.percent}% off.</div>`
      : `<div class="bundle-builder__unlock is-success">${pricing.discountPercent}% discount tier is active.</div>`;

    return `
      <div class="bundle-builder__summary">
        <div class="bundle-builder__summary-header">
          <p>Bundle summary</p>
          <strong>${pricing.itemCount} items</strong>
        </div>
        <ol class="bundle-builder__summary-list">${items}</ol>
        <div class="bundle-builder__summary-metrics">
          <div><span>Subtotal</span><strong>${this.formatMoney(pricing.subtotalCents)}</strong></div>
          <div><span>Discount</span><strong>${pricing.discountPercent}%</strong></div>
          <div><span>Savings</span><strong>${this.formatMoney(pricing.discountCents)}</strong></div>
          <div class="is-total"><span>Total</span><strong>${this.formatMoney(pricing.totalCents)}</strong></div>
        </div>
        ${unlock}
      </div>
    `;
  }

  renderReview() {
    if (!this.dom.review) return;
    const pricing = this.getPricing();
    this.dom.review.innerHTML = `
      <div class="bundle-builder__review-shell">
        <div class="bundle-builder__review-items">
          ${pricing.items.length ? pricing.items.map((item) => `
            <article class="bundle-builder__review-item">
              <div class="bundle-builder__review-item-image">
                ${item.image ? `<img src="${item.image}" alt="${this.escape(item.title)}" loading="lazy" width="160" height="160">` : ''}
              </div>
              <div class="bundle-builder__review-item-copy">
                <p class="bundle-builder__review-item-label">${this.escape(item.positionLabel)}</p>
                <h3>${this.escape(item.title)}</h3>
                ${item.variantTitle ? `<p>${this.escape(item.variantTitle)}</p>` : ''}
                <strong>${this.formatMoney(item.priceCents)}</strong>
              </div>
            </article>
          `).join('') : '<div class="bundle-builder__empty">Choose products to populate the review step.</div>'}
        </div>
        <div class="bundle-builder__review-meta">
          <div><span>Subtotal</span><strong>${this.formatMoney(pricing.subtotalCents)}</strong></div>
          <div><span>Discount</span><strong>${pricing.discountPercent}%</strong></div>
          <div><span>Savings</span><strong>${this.formatMoney(pricing.discountCents)}</strong></div>
          <div class="is-total"><span>Final total</span><strong>${this.formatMoney(pricing.totalCents)}</strong></div>
        </div>
      </div>
    `;
  }

  renderConfirmationSummary(payload) {
    return `
      <div class="bundle-builder__review-shell">
        <div class="bundle-builder__review-items">
          ${payload.items.map((item) => `
            <article class="bundle-builder__review-item">
              <div class="bundle-builder__review-item-image">
                ${item.image ? `<img src="${item.image}" alt="${this.escape(item.title)}" loading="lazy" width="160" height="160">` : ''}
              </div>
              <div class="bundle-builder__review-item-copy">
                <p class="bundle-builder__review-item-label">${this.escape(item.positionLabel)}</p>
                <h3>${this.escape(item.title)}</h3>
                ${item.variantTitle ? `<p>${this.escape(item.variantTitle)}</p>` : ''}
                <strong>${this.formatMoney(item.priceCents)}</strong>
              </div>
            </article>
          `).join('')}
        </div>
        <div class="bundle-builder__review-meta">
          <div><span>Subtotal</span><strong>${this.formatMoney(payload.subtotalCents)}</strong></div>
          <div><span>Bundle discount</span><strong>${payload.discountPercent}%</strong></div>
          <div><span>Savings</span><strong>${this.formatMoney(payload.discountCents)}</strong></div>
          <div class="is-total"><span>Final total</span><strong>${this.formatMoney(payload.totalCents)}</strong></div>
        </div>
      </div>
    `;
  }

  renderConfirmationLoading(payload) {
    return `
      <div class="bundle-builder__review-shell">
        <div class="bundle-builder__review-items">
          ${payload.items.map((item) => `
            <article class="bundle-builder__review-item">
              <div class="bundle-builder__review-item-image">
                ${item.image ? `<img src="${item.image}" alt="${this.escape(item.title)}" loading="lazy" width="160" height="160">` : ''}
              </div>
              <div class="bundle-builder__review-item-copy">
                <p class="bundle-builder__review-item-label">${this.escape(item.positionLabel)}</p>
                <h3>${this.escape(item.title)}</h3>
                ${item.variantTitle ? `<p>${this.escape(item.variantTitle)}</p>` : ''}
                <strong>${this.formatMoney(item.priceCents)}</strong>
              </div>
            </article>
          `).join('')}
        </div>
        <div class="bundle-builder__review-meta">
          <div><span>Subtotal</span><strong>${this.formatMoney(payload.subtotalCents)}</strong></div>
          <div><span>Bundle discount</span><strong>${payload.discountPercent}%</strong></div>
          <div><span>Savings</span><strong>${this.formatMoney(payload.discountCents)}</strong></div>
          <div class="is-total"><span>Final total</span><strong>${this.formatMoney(payload.totalCents)}</strong></div>
        </div>
        <div class="bundle-builder__confirmation-loading">
          <div class="bundle-builder__spinner" aria-hidden="true"></div>
          <p>Adding your bundle to cart...</p>
        </div>
      </div>
    `;
  }

  updateActions() {
    const lastStep = this.state.currentStep === this.totalSteps;
    if (this.dom.prev) this.dom.prev.disabled = this.state.currentStep === 1 || this.state.submitting;
    if (this.dom.next) {
      this.dom.next.hidden = lastStep;
      this.dom.next.disabled = this.state.submitting || !this.isStepSatisfied(this.state.currentStep);
    }
    if (this.dom.add) {
      this.dom.add.hidden = !lastStep;
      this.dom.add.disabled = this.state.submitting || !this.canSubmit();
      this.dom.add.classList.toggle('is-loading', this.state.submitting);
    }
  }

  updateProgress() {
    if (this.dom.progressFill) {
      const percent = ((this.state.currentStep - 1) / Math.max(this.totalSteps - 1, 1)) * 100;
      this.dom.progressFill.style.width = `${percent}%`;
    }
    this.dom.progressSteps.forEach((button) => {
      const step = Number.parseInt(button.dataset.progressStep, 10);
      button.classList.toggle('is-active', step === this.state.currentStep);
      button.classList.toggle('is-complete', step < this.state.currentStep);
      button.disabled = step > this.highestUnlockedStep();
      button.setAttribute('aria-current', step === this.state.currentStep ? 'step' : 'false');
    });
  }

  isStepSatisfied(step) {
    if (step === 1) return this.state.selections.shirts.length > 0;
    if (step === 2) return this.state.selections.accessories.length > 0;
    return true;
  }

  onGridClick(event, role) {
    const button = event.target.closest('[data-select-product]');
    if (!button) return;
    const card = button.closest('[data-product-card]');
    if (!card) return;
    const product = this.state.collections[role].find((entry) => entry.id === Number.parseInt(card.dataset.productId, 10));
    const select = card.querySelector('[data-variant-select]');
    const variantId = select ? Number.parseInt(select.value, 10) : product.firstVariantId;
    const variant = product.variants.find((entry) => entry.id === variantId) || product.variants[0];
    this.state.variantChoices[role][product.id] = variant.id;
    const existing = this.findSelectedEntry(role, product.id, variantId);

    if (existing?.variantId === variant.id) {
      this.removeSelection(role, variant.id);
      this.state.lastAddedSignature = null;
      this.hideError();
      this.announce(`${product.title} removed.`);
      this.render();
      return;
    }

    if (!variant.available) {
      this.showError('That variant is currently unavailable.');
      return;
    }
    this.commitSelection(role, product, variant);
  }

  onVariantChange(event, role) {
    const select = event.target.closest('[data-variant-select]');
    if (!select) return;
    const card = select.closest('[data-product-card]');
    const product = this.state.collections[role].find((entry) => entry.id === Number.parseInt(card.dataset.productId, 10));
    const variant = product.variants.find((entry) => entry.id === Number.parseInt(select.value, 10));
    this.state.variantChoices[role][product.id] = variant.id;
    const selected = this.findSelectedEntry(role, product.id);
    if (selected) this.commitSelection(role, product, variant);
    else {
      this.persistState();
      this.renderGrid(role);
    }
  }

  commitSelection(role, product, variant) {
    const entry = {
      productId: product.id,
      variantId: variant.id,
      title: product.title,
      variantTitle: variant.title,
      priceCents: variant.priceCents,
      image: product.image,
      handle: product.handle,
      positionLabel: this.labelForRole(role),
      bundlePosition: role === 'extra' ? 'extra' : role,
    };

    const key = this.selectionKey(role);
    const exists = this.state.selections[key].some((item) => item.variantId === variant.id);

    if (role === 'extra') {
      this.state.selections[key] = exists
        ? this.state.selections[key].filter((item) => item.variantId !== variant.id)
        : [...this.state.selections[key], entry];
    } else {
      this.state.selections[key] = exists ? [] : [entry];
    }

    this.state.variantChoices[role][product.id] = variant.id;
    this.announce(exists ? `${product.title} removed.` : `${product.title} selected.`);

    this.state.lastAddedSignature = null;
    this.hideError();
    this.render();
  }

  removeSelection(role, variantId) {
    const key = this.selectionKey(role);
    this.state.selections[key] = this.state.selections[key].filter((item) => item.variantId !== variantId);
  }

  findSelectedEntry(role, productId, variantId = null) {
    const key = this.selectionKey(role);
    return this.state.selections[key].find((entry) => {
      const sameProduct = entry.productId === productId;
      const sameVariant = variantId === null ? true : entry.variantId === variantId;
      return sameProduct && sameVariant;
    }) || null;
  }

  selectionKey(role) {
    if (role === 'shirt') return 'shirts';
    if (role === 'accessory') return 'accessories';
    return 'extras';
  }

  getPricing() {
    const items = [
      ...this.state.selections.shirts,
      ...this.state.selections.accessories,
      ...this.state.selections.extras,
    ];
    const subtotalCents = items.reduce((sum, item) => sum + item.priceCents, 0);
    let active = null;
    let next = null;

    this.config.tiers.forEach((tier) => {
      if (items.length >= tier.items) active = tier;
      else if (!next) next = tier;
    });

    const discountPercent = active?.percent || 0;
    const discountCents = Math.round((subtotalCents * discountPercent) / 100);
    return {
      items,
      itemCount: items.length,
      subtotalCents,
      discountPercent,
      discountCents,
      totalCents: subtotalCents - discountCents,
      nextTier: next,
      itemsToNextTier: next ? Math.max(next.items - items.length, 0) : 0,
    };
  }

  canSubmit() {
    return this.state.selections.shirts.length > 0 && this.state.selections.accessories.length > 0;
  }

  async addBundleToCart() {
    if (!this.canSubmit() || this.state.submitting) return;
    const signature = this.bundleSignature();
    if (signature && signature === this.state.lastAddedSignature) {
      this.showError('This same bundle was already added. Change the selection to add another one.');
      return;
    }

    this.state.submitting = true;
    this.hideError();

    try {
      const pricing = this.getPricing();
      this.state.confirmation = { loading: true, ...pricing };
      this.render();

      const stock = await this.validateStock();
      if (!stock.ok) throw new Error(stock.message);

      const bundleId = `bundle_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const items = pricing.items.map((item) => ({
        id: item.variantId,
        quantity: 1,
        properties: {
          _bundle_id: bundleId,
          _bundle_discount: `${pricing.discountPercent}%`,
          _bundle_position: item.bundlePosition,
        },
      }));

      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 12000);
      const response = await fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ items }),
        signal: controller.signal,
      });
      window.clearTimeout(timeout);

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.description || 'Unable to add bundle to cart.');
      }

      this.state.lastAddedSignature = signature;
      sessionStorage.setItem(this.completedKey, 'true');
      this.state.confirmation = {
        loading: false,
        bundleId,
        ...pricing,
      };
      this.announce('Bundle added to cart.');
    } catch (error) {
      this.state.confirmation = null;
      this.showError(error.name === 'AbortError' ? 'Network timeout while adding to cart. Please retry.' : error.message);
    } finally {
      this.state.submitting = false;
      this.render();
    }
  }

  async validateStock() {
    const items = this.getPricing().items;
    for (const item of items) {
      try {
        const response = await fetch(`/variants/${item.variantId}.js`);
        if (!response.ok) return { ok: false, message: `Could not verify stock for ${item.title}.` };
        const variant = await response.json();
        if (!variant.available) return { ok: false, message: `${item.title} is now out of stock.` };
      } catch (error) {
        return { ok: false, message: 'Stock verification failed because of a network issue.' };
      }
    }
    return { ok: true };
  }

  async handleVisibility() {
    if (document.hidden || !this.canSubmit()) return;
    const stock = await this.validateStock();
    if (!stock.ok) this.showError(stock.message);
  }

  handleScroll() {
    if (!this.dom.mobileBar) return;
    const current = window.scrollY;
    const previous = this.lastY || 0;
    this.lastY = current;
    this.dom.mobileBar.classList.toggle('is-hidden', current > previous && current - previous > 18 && !this.state.mobileOpen);
  }

  toggleMobileSummary(open) {
    if (!this.dom.mobileDrawer || !this.dom.mobileOverlay) return;
    this.state.mobileOpen = open;
    this.dom.mobileDrawer.hidden = !open;
    this.dom.mobileOverlay.hidden = !open;
    this.dom.mobileDrawer.classList.toggle('is-open', open);
    this.dom.mobileOverlay.classList.toggle('is-open', open);
    this.dom.mobileToggle?.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.body.style.overflow = open ? 'hidden' : '';
  }

  ensureStepHeaderVisible() {
    if (!this.dom.heading) return;

    const rect = this.dom.heading.getBoundingClientRect();
    const topOffset = 24;
    const bottomLimit = window.innerHeight - 120;
    const isAboveViewport = rect.top < topOffset;
    const isBelowViewport = rect.bottom > bottomLimit;

    if (isAboveViewport || isBelowViewport) {
      this.dom.heading.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }
  }

  setLoading(show) {
    if (this.dom.loading) this.dom.loading.hidden = !show;
  }

  showError(message) {
    if (!this.dom.error) return;
    this.dom.error.hidden = false;
    this.dom.error.innerHTML = `<div class="bundle-builder__alert" role="alert"><p>${this.escape(message)}</p><button type="button" data-close-alert>Close</button></div>`;
    this.dom.error.querySelector('[data-close-alert]')?.addEventListener('click', () => this.hideError(), { once: true });
    this.announce(message);
  }

  hideError() {
    if (!this.dom.error) return;
    this.dom.error.hidden = true;
    this.dom.error.innerHTML = '';
  }

  announce(message) {
    if (this.dom.live) this.dom.live.textContent = message;
  }

  labelForRole(role) {
    if (role === 'shirt') return 'Shirt';
    if (role === 'accessory') return 'Accessory';
    return 'Extra';
  }

  hasMeaningfulVariants(product) {
    return product.variants.length > 1 || product.variants.some((variant) => variant.title);
  }

  renderSelectButtonLabel(role, isSelected) {
    const icon = isSelected ? '✓' : '+';
    const text = role === 'extra'
      ? (isSelected ? 'Remove extra' : 'Add extra')
      : (isSelected ? 'Unselect' : 'Select');

    return `
      <span class="bundle-builder__select-button-icon" aria-hidden="true">${icon}</span>
      <span class="bundle-builder__select-button-text">${text}</span>
    `;
  }

  clearPersistedState() {
    sessionStorage.removeItem(this.storageKey);
  }

  resetBuilderState() {
    this.state.currentStep = 1;
    this.state.direction = 'forward';
    this.state.selections = { shirts: [], accessories: [], extras: [] };
    this.state.variantChoices = { shirt: {}, accessory: {}, extra: {} };
    this.state.lastAddedSignature = null;
    this.state.mobileOpen = false;
    this.state.confirmation = null;
    this.hideError();
    this.toggleMobileSummary(false);
    this.render();
  }

  finishConfirmation() {
    if (this.dom.confirmation) {
      this.dom.confirmation.hidden = true;
      this.dom.confirmation.classList.remove('is-open');
      this.dom.confirmation.style.display = 'none';
    }
    sessionStorage.setItem(this.completedKey, 'true');
    this.clearPersistedState();
    this.resetBuilderState();
  }

  handlePageShow() {
    if (sessionStorage.getItem(this.completedKey) === 'true' || this.state.confirmation) {
      sessionStorage.removeItem(this.completedKey);
      this.clearPersistedState();
      this.resetBuilderState();
    }
  }

  bundleSignature() {
    return this.getPricing().items.map((item) => `${item.productId}:${item.variantId}`).sort().join('|');
  }

  formatMoney(cents) {
    return this.money.format((cents || 0) / 100);
  }

  toCents(value) {
    if (typeof value === 'number') return value > 999 ? Math.round(value) : Math.round(value * 100);
    const parsed = Number.parseFloat(String(value || '0'));
    return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
  }

  escape(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  destroy() {
    window.removeEventListener('scroll', this.boundScroll);
    document.removeEventListener('visibilitychange', this.boundVisibility);
    window.removeEventListener('pageshow', this.boundPageShow);
    document.body.style.overflow = '';
  }
}

const bundleInstances = new Map();

function initBundleBuilders(scope = document) {
  scope.querySelectorAll('[data-bundle-section]').forEach((section) => {
    const id = section.dataset.sectionId;
    if (!id) return;
    if (bundleInstances.has(id)) {
      bundleInstances.get(id).destroy();
      bundleInstances.delete(id);
    }
    bundleInstances.set(id, new BundleBuilder(section));
  });
}

document.addEventListener('DOMContentLoaded', () => initBundleBuilders());

if (window.Shopify?.designMode) {
  document.addEventListener('shopify:section:load', (event) => initBundleBuilders(event.target));
  document.addEventListener('shopify:section:unload', (event) => {
    const section = event.target.querySelector('[data-bundle-section]');
    const id = section?.dataset.sectionId;
    if (id && bundleInstances.has(id)) {
      bundleInstances.get(id).destroy();
      bundleInstances.delete(id);
    }
  });
}
