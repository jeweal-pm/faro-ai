'use client';

import { useRef, useState, useTransition } from 'react';
import { ArrowRight, Camera, ChevronDown, Gem, LoaderCircle, Mic, Minus, Plus, X } from 'lucide-react';
import { askFaro, type DiscoveryResult } from './actions';
import ProductCreation from './ProductCreation';
import ProcurementAssistant from './ProcurementAssistant';

type FilterState = {
  product_type?: string;
  metal_color?: string;
  metal_karat?: string;
  stone_type?: string;
  stone_shape?: string;
  price_max?: number;
};

type SpeechResultEvent = Event & { results: ArrayLike<ArrayLike<{ transcript: string }>> };
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
};
type SpeechWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
};

const facets = [
  { name: 'Who is it for?', values: ['Myself', 'Wife', 'Husband', 'Fiancée', 'Fiancé', 'Girlfriend', 'Boyfriend', 'Mother', 'Father', 'Daughter', 'Son', 'Friend', 'Client', 'Bride', 'Groom'] },
  { name: 'Occasion', values: ['Birthday', 'Anniversary', 'Engagement', 'Wedding', 'Graduation', 'Everyday'] },
  { name: 'Jewelry Type', values: ['Ring', 'Necklace', 'Earrings', 'Pendant', 'Bracelet'] },
  { name: 'Metal', values: ['Yellow gold', 'White gold', 'Rose gold', 'Platinum'] },
  { name: 'Gemstone', values: ['Diamond', 'Sapphire', 'Pearl', 'Emerald', 'Ruby'] },
  { name: 'Style', values: ['Classic', 'Minimal', 'Statement', 'Vintage', 'Modern'] },
  { name: 'Budget', values: ['Under $500', '$500–$1,500', '$1,500–$5,000', '$5,000+'] },
  { name: 'Theme', values: ['Nature', 'Heart', 'Floral', 'Geometric'] },
  { name: 'Color', values: ['Yellow', 'White', 'Rose', 'Black'] },
  { name: 'Size', values: ['Small', 'Medium', 'Large'] },
  { name: 'Wear/Lifestyle', values: ['Everyday', 'Formal', 'Work', 'Travel'] },
  { name: 'Avoid', values: ['Diamonds', 'Nickel', 'Large designs', 'Specific gemstone'] },
] as const;

const filterFacetNames = new Set(['Jewelry Type', 'Metal', 'Gemstone', 'Budget', 'Color']);

function isInStock(availability?: string | null) {
  return ['available', 'in stock', 'instock', 'true', '1'].includes((availability ?? '').trim().toLowerCase());
}

function money(price: number | null | undefined, currency: string | null | undefined) {
  if (price === null || price === undefined || !currency) return null;
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(price);
  } catch {
    return `${currency} ${price}`;
  }
}

function productSizeChoices(productType?: string | null) {
  const type = (productType ?? '').toLowerCase();
  if (type.includes('ring')) return ['50', '52', '54', '56', '58', '60'];
  if (type.includes('necklace') || type.includes('chain')) return ['40 cm', '45 cm', '50 cm', '55 cm'];
  if (type.includes('bracelet')) return ['16 cm', '18 cm', '20 cm'];
  return ['One size'];
}

export default function DiscoveryPage({ trainingOptions = { local: false, shared: false } }: { trainingOptions?: { local: boolean; shared: boolean } }) {
  const [query, setQuery] = useState('');
  const [consented, setConsented] = useState(false);
  const [knowledgeImprovementConsented, setKnowledgeImprovementConsented] = useState(false);
  const [trainingLocalConsented, setTrainingLocalConsented] = useState(false);
  const [trainingSharedConsented, setTrainingSharedConsented] = useState(false);
  const [activeFacet, setActiveFacet] = useState<string>(facets[0].name);
  const [selectedFacets, setSelectedFacets] = useState<Record<string, string>>({});
  const [filters, setFilters] = useState<FilterState>({});
  const [answer, setAnswer] = useState<DiscoveryResult | null>(null);
  const [error, setError] = useState('');
  const [productPrompt, setProductPrompt] = useState<string | null>(null);
  const [procurementPrompt, setProcurementPrompt] = useState<string | null>(null);
  const [voiceMessage, setVoiceMessage] = useState('');
  const [listening, setListening] = useState(false);
  const [pending, startTransition] = useTransition();
  const [guideOpen, setGuideOpen] = useState(true);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [activeProduct, setActiveProduct] = useState<DiscoveryResult['products'][number] | null>(null);
  const [referenceImage, setReferenceImage] = useState<{ base64: string; mediaType: 'image/jpeg' | 'image/png' | 'image/webp'; name: string } | null>(null);
  const [drawerOptions, setDrawerOptions] = useState({ metal: 'White gold', gemstone: 'Diamond', size: '52' });
  const inputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  function selectReferenceImage(file?: File) {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 1_500_000) {
      setError('Choose a JPEG, PNG, or WebP image smaller than 1.5 MB.');
      if (imageInputRef.current) imageInputRef.current.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      const base64 = dataUrl.split(',', 2)[1] ?? '';
      if (!base64) { setError('The image could not be read. Try another file.'); return; }
      setReferenceImage({ base64, mediaType: file.type as 'image/jpeg' | 'image/png' | 'image/webp', name: file.name });
      setError('');
    };
    reader.onerror = () => setError('The image could not be read. Try another file.');
    reader.readAsDataURL(file);
  }

  function applyFacet(facet: string, value: string) {
    const nextSelected = { ...selectedFacets };
    if (nextSelected[facet] === value) delete nextSelected[facet];
    else nextSelected[facet] = value;
    setSelectedFacets(nextSelected);

    if (facet === 'Jewelry Type') setFilters((current) => ({ ...current, product_type: nextSelected[facet]?.toLowerCase() }));
    if (facet === 'Metal' || facet === 'Color') setFilters((current) => ({ ...current, metal_color: nextSelected[facet]?.toLowerCase() }));
    if (facet === 'Gemstone') setFilters((current) => ({ ...current, stone_type: nextSelected[facet]?.toLowerCase() }));
    if (facet === 'Budget') {
      const maxima: Record<string, number | undefined> = {
        'Under $500': 500,
        '$500–$1,500': 1500,
        '$1,500–$5,000': 5000,
        '$5,000+': undefined,
      };
      setFilters((current) => ({ ...current, price_max: nextSelected[facet] ? maxima[nextSelected[facet]] : undefined }));
    }
  }

  function startVoice() {
    const speech = window as SpeechWindow;
    const Recognition = speech.SpeechRecognition ?? speech.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceMessage('Voice search is not supported in this browser.');
      return;
    }
    setVoiceMessage('');
    const recognition = new Recognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.onresult = (event) => setQuery(event.results[0]?.[0]?.transcript ?? '');
    recognition.onerror = () => setVoiceMessage('Microphone access was not available.');
    recognition.onend = () => setListening(false);
    setListening(true);
    try { recognition.start(); } catch { setListening(false); setVoiceMessage('Voice search could not start.'); }
  }

  function search() {
    if (isProcurementPrompt(query)) {
      setError('');
      setAnswer(null);
      setProductPrompt(null);
      setProcurementPrompt(query.trim());
      return;
    }
    if (isProductCreationPrompt(query)) {
      setError('');
      setAnswer(null);
      setProcurementPrompt(null);
      setProductPrompt(query.trim());
      return;
    }
    setProcurementPrompt(null);
    setProductPrompt(null);
    if (!consented) {
      setError('Please accept the AI chat notice below to continue.');
      return;
    }
    if (!query.trim()) {
      inputRef.current?.focus();
      return;
    }
    const additionalPreferences = Object.entries(selectedFacets)
      .filter(([facet]) => !filterFacetNames.has(facet))
      .map(([facet, value]) => `${facet}: ${value}`);
    const message = [query.trim(), ...additionalPreferences].join('. ');
    setError('');
    setAnswer(null);
    startTransition(async () => {
      const result = await askFaro({ message, consented, knowledgeImprovementConsented, trainingLocalConsented, trainingSharedConsented, state: filters,
        image: referenceImage ? { base64: referenceImage.base64, mediaType: referenceImage.mediaType } : undefined });
      if (result.ok) setAnswer(result.data);
      else setError(result.message);
    });
  }

  function isProductCreationPrompt(value: string) {
    const prompt = value.trim();
    if (/(?:เพิ่ม|สร้าง)\s*(?:สินค้า|product)/i.test(prompt)) return true;
    const hasCreateVerb = /\b(?:add|create|generate|make)\b/i.test(prompt);
    const hasProductSubject = /\b(?:products?|jewelry|rings?|necklaces?|bracelets?|earrings?|pendants?)\b/i.test(prompt);
    const hasExplicitCreationContext = /\b(?:products?|catalog|product list)\b/i.test(prompt) || /\b\d{1,2}\b/.test(prompt);
    return hasCreateVerb && hasProductSubject && hasExplicitCreationContext;
  }

  function isProcurementPrompt(value: string) {
    const prompt = value.trim();
    const hasPurchaseOrder = /\bpo(?:s)?\b(?:\s*[-#]?\s*\d+)?|\bpurchase[-\s]+orders?\b|ใบสั่งซื้อ/i.test(prompt);
    const hasInventory = /\binventory\b|\bstock\b|\binbound\b|\breceipt\b|รับสินค้า|รับของเข้า|ใบรับสินค้า/i.test(prompt);
    const hasSupplier = /\bsuppliers?\b|\bvendors?\b|ผู้ขาย/i.test(prompt);
    const hasAction = /\b(?:create|add|register|activate|enable|make|new|check|search|find|show|list|display|view|get|receive|inspect)\b|สร้าง|เพิ่ม|ลงทะเบียน|เปิดใช้งาน|เปิด|ทำ|เช็ก|ตรวจ|ค้นหา|แสดงรายชื่อ|รับ/i.test(prompt);
    return hasAction && (hasPurchaseOrder || hasInventory || hasSupplier);
  }

  function openProduct(product: DiscoveryResult['products'][number]) {
    const sizeChoices = productSizeChoices(product.productType);
    setDrawerOptions({ metal: 'White gold', gemstone: 'Diamond', size: product.productType?.toLowerCase().includes('ring') ? '52' : sizeChoices[0] });
    setActiveProduct(product);
  }

  const activeFacetData = facets.find((facet) => facet.name === activeFacet) ?? facets[0];
  const products = answer?.products ?? [];
  const visibleProducts = inStockOnly ? products.filter((product) => isInStock(product.availability)) : products;

  return (
    <main className="discovery-shell shopping-shell">
      <header className="shopping-topbar">
        <a className="shopping-wordmark" href="/" aria-label="FaroAI home">faro<span>✦</span></a>
        <a className="shopping-platform-link" href="/admin">Platform</a>
        <button className="guide-collapse" type="button" aria-label={guideOpen ? 'Collapse shopping preferences' : 'Expand shopping preferences'} onClick={() => setGuideOpen((open) => !open)}>
          {guideOpen ? <Minus size={17} /> : <Plus size={16} />}
        </button>
      </header>

      <section className="shopping-search-area" aria-label="Jewelry search">
        <form className="shopping-search-form" onSubmit={(event) => { event.preventDefault(); search(); }}>
          <label className="sr-only" htmlFor="faro-query">Search for jewelry</label>
          <input
            ref={inputRef}
            id="faro-query"
            value={query}
            onChange={(event) => { setQuery(event.target.value); setProductPrompt(null); }}
            placeholder="I'm shopping for..."
            maxLength={500}
            autoComplete="off"
          />
          <button className="shopping-search-icon" type="button" aria-label="Clear search" onClick={() => setQuery('')}><X size={18} /></button>
          <input ref={imageInputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose jewelry reference image" onChange={(event) => selectReferenceImage(event.target.files?.[0])} />
          <button className={`shopping-search-icon ${referenceImage ? 'is-listening' : ''}`} type="button" aria-label={referenceImage ? `Remove ${referenceImage.name}` : 'Search using a jewelry image'} title={referenceImage ? `Remove ${referenceImage.name}` : 'Search using a jewelry image'} onClick={() => referenceImage ? setReferenceImage(null) : imageInputRef.current?.click()}>
            {referenceImage ? <X size={18} /> : <Camera size={19} />}
          </button>
          <button className={`shopping-search-icon ${listening ? 'is-listening' : ''}`} type="button" onClick={startVoice} aria-label="Start voice search" title="Start voice search"><Mic size={20} /></button>
          <button className="shopping-submit" type="submit" aria-label="Search" title="Search" disabled={pending || !query.trim()}>
            {pending ? <LoaderCircle size={19} className="spin" /> : <ArrowRight size={21} />}
          </button>
        </form>
        {referenceImage && <p className="shopping-inline-note" role="status">Image selected: {referenceImage.name}. The image is analyzed for this search and is not saved.</p>}

        {!productPrompt && !answer && !pending && guideOpen && <section className="shopping-guide" aria-label="Optional shopping preferences">
          <div className="facet-tabs" role="tablist" aria-label="Shopping preferences">
            {facets.map((facet) => <button key={facet.name} type="button" role="tab" aria-selected={activeFacet === facet.name} className={`facet-tab ${activeFacet === facet.name ? 'is-active' : ''}`} onClick={() => setActiveFacet(facet.name)}>{facet.name}</button>)}
          </div>
          <div className="facet-options" role="tabpanel" aria-label={activeFacetData.name}>
            <p>{activeFacetData.name}</p>
            <div className="facet-option-list">
              {activeFacetData.values.map((value) => <button key={value} type="button" aria-pressed={selectedFacets[activeFacetData.name] === value} className={`facet-option ${selectedFacets[activeFacetData.name] === value ? 'is-selected' : ''}`} onClick={() => applyFacet(activeFacetData.name, value)}>{value}</button>)}
            </div>
          </div>
        </section>}

        {!productPrompt && !answer && <>
        <div className="shopping-consent">
          <label><input type="checkbox" checked={consented} onChange={(event) => { setConsented(event.target.checked); if (event.target.checked) setError(''); }} /><span>I agree to let FaroAI process my question to provide a response.</span></label>
          <span>AI improvement is optional and off unless you opt in below.</span>
        </div>
        <div className="shopping-consent shopping-learning-consent">
          <label><input type="checkbox" checked={knowledgeImprovementConsented} onChange={(event) => setKnowledgeImprovementConsented(event.target.checked)} /><span>Allow this scrubbed question and AI answer to be reviewed as knowledge for this tenant's search.</span></label>
        </div>
        {(trainingOptions.local || trainingOptions.shared) && <div className="shopping-consent shopping-learning-consent">
          {trainingOptions.local && <label><input type="checkbox" checked={trainingLocalConsented} onChange={(event) => setTrainingLocalConsented(event.target.checked)} /><span>Allow this scrubbed question and AI answer to be reviewed for improving this organization's local model. It will not be shared with other tenants.</span></label>}
          {trainingOptions.shared && <label><input type="checkbox" checked={trainingSharedConsented} onChange={(event) => setTrainingSharedConsented(event.target.checked)} /><span>Allow this scrubbed question and AI answer to be reviewed for a FaroAI shared model that may help other customers.</span></label>}
        </div>}
        </>}
        {voiceMessage && <p className="shopping-inline-note" role="status">{voiceMessage}</p>}
        {error && <p className="shopping-error" role="alert">{error}</p>}
      </section>

      {procurementPrompt && <ProcurementAssistant key={procurementPrompt} initialPrompt={procurementPrompt} onCancel={() => setProcurementPrompt(null)} />}

      {productPrompt && <section className="catalog-results product-prompt-results" aria-live="polite" aria-label="Create GIS products">
        <ProductCreation key={productPrompt} promptText={productPrompt} onCancel={() => setProductPrompt(null)} />
      </section>}

      {pending && <p className="shopping-loading" role="status"><LoaderCircle size={16} className="spin" /> Finding the right pieces for you…</p>}
      {answer && <section className="catalog-results" aria-live="polite" aria-label="Search results">
        {answer.answer && <p className="catalog-answer">{answer.answer}</p>}
        {answer.products.length > 0 && <>
        <div className="catalog-results-head">
          <div><span>Showing ({visibleProducts.length})</span></div>
          <label className="stock-toggle"><input type="checkbox" checked={inStockOnly} onChange={(event) => setInStockOnly(event.target.checked)} /><span>In stock only</span></label>
        </div>
        {visibleProducts.length > 0 ? <div className="catalog-card-grid">
          {visibleProducts.map((product, index) => <article className="catalog-product-card" key={product.id ?? product.sku ?? index}>
            <div className="catalog-image-frame">
              {product.image ? <img className="catalog-product-image" src={product.image} alt={product.name ? `${product.name} product` : 'Jewelry product'} loading="lazy" referrerPolicy="no-referrer" /> : <div className="catalog-image-empty"><Gem size={31} strokeWidth={1.25} /></div>}
            </div>
            <h2 className="catalog-product-name">{product.name ?? 'Jewelry selection'}</h2>
            <p className="catalog-product-sku">{product.sku ?? 'Curated for you'}</p>
            <div className="catalog-product-meta">
              <div>{product.price !== null && product.price !== undefined && product.currency ? <p className="catalog-product-price">{money(product.price, product.currency)}</p> : <p className="catalog-product-price catalog-price-pending">&nbsp;</p>}
                {product.availability && <p className={`catalog-product-stock ${isInStock(product.availability) ? 'is-available' : ''}`}>{product.availability.replaceAll('_', ' ')}</p>}
              </div>
              <button className="catalog-add-button" type="button" aria-label={`Choose options for ${product.name ?? 'jewelry'}`} onClick={() => openProduct(product)}><Plus size={21} strokeWidth={1.4} /></button>
            </div>
            {product.summary && <p className="catalog-product-summary">{product.summary}</p>}
          </article>)}
        </div> : <div className="catalog-empty">No in-stock pieces in these results.</div>}
        </>}
        {answer.sources.some((source) => source.kind === 'mcp') && <p className="catalog-source-note">Product details provided by {answer.sources.filter((source) => source.kind === 'mcp').map((source) => source.label).filter(Boolean).join(', ') || 'a connected MCP source'}.</p>}
        {answer.sources.length > 0 && !answer.sources.some((source) => source.kind === 'mcp') && <p className="catalog-source-note">Retrieved {answer.sources.length} approved knowledge source{answer.sources.length === 1 ? '' : 's'}; relevance may vary.</p>}
      </section>}

      <footer className="shopping-footer">Thoughtful discoveries, guided by FaroAI</footer>

      {activeProduct && <div className="product-drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setActiveProduct(null); }}>
        <aside className="product-option-drawer" role="dialog" aria-modal="true" aria-label={`${activeProduct.name ?? 'Jewelry'} options`}>
          <button className="drawer-close" type="button" aria-label="Close product options" onClick={() => setActiveProduct(null)}><X size={18} /></button>
          <div className="drawer-product-image">
            {activeProduct.image ? <img src={activeProduct.image} alt={activeProduct.name ? `${activeProduct.name} product` : 'Jewelry product'} /> : <Gem size={29} strokeWidth={1.25} />}
          </div>
          <h2>{activeProduct.name ?? 'Jewelry selection'}</h2>
          <p className="drawer-sku">{activeProduct.sku ?? 'Curated for you'}</p>
          <label className="drawer-select"><span className="sr-only">Metal</span><select value={drawerOptions.metal} onChange={(event) => setDrawerOptions((current) => ({ ...current, metal: event.target.value }))}><option>White gold</option><option>Yellow gold</option><option>Rose gold</option><option>Platinum</option></select><ChevronDown size={15} /></label>
          <label className="drawer-select"><span className="sr-only">Gemstone</span><select value={drawerOptions.gemstone} onChange={(event) => setDrawerOptions((current) => ({ ...current, gemstone: event.target.value }))}><option>Diamond</option><option>Sapphire</option><option>Pearl</option><option>Emerald</option><option>Ruby</option></select><ChevronDown size={15} /></label>
          <label className="drawer-select"><span className="sr-only">Size</span><select value={drawerOptions.size} onChange={(event) => setDrawerOptions((current) => ({ ...current, size: event.target.value }))}>{productSizeChoices(activeProduct.productType).map((size) => <option key={size}>{size}</option>)}</select><ChevronDown size={15} /></label>
          <button className="drawer-add-button" type="button">Add to Order</button>
        </aside>
      </div>}
    </main>
  );
}
