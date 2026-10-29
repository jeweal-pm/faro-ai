import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DiscoveryPage from './discovery-page';

const { askFaro } = vi.hoisted(() => ({ askFaro: vi.fn() }));
vi.mock('./actions', () => ({ askFaro: (...args: unknown[]) => askFaro(...args) }));

describe('AI discovery page', () => {
  beforeEach(() => askFaro.mockReset());
  afterEach(() => cleanup());

  it('shows the reference search composition and keeps image search disabled', () => {
    render(<DiscoveryPage />);
    expect(screen.getByRole('heading', { name: 'Ask faro anything' })).toBeTruthy();
    expect(screen.getByPlaceholderText('Search (Product name, Color, Type,...)')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Image search is not available yet' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: /Discovery/ })).toBeTruthy();
  });

  it('requires consent before submitting and does not call the server action', () => {
    render(<DiscoveryPage />);
    fireEvent.change(screen.getByPlaceholderText('Search (Product name, Color, Type,...)'), { target: { value: 'gold ring' } });
    fireEvent.submit(screen.getByPlaceholderText('Search (Product name, Color, Type,...)').closest('form')!);
    expect(screen.getByRole('alert').textContent).toMatch(/accept the AI chat notice/i);
    expect(askFaro).not.toHaveBeenCalled();
  });

  it('opens Discovery filters and submits an explicitly consented query', async () => {
    askFaro.mockResolvedValue({ ok: true, data: { answer: 'A verified answer.', products: [], sources: [] } });
    render(<DiscoveryPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Discovery' }));
    expect(screen.getByRole('group', { name: 'Optional discovery filters' })).toBeTruthy();
    fireEvent.click(screen.getByLabelText('I agree to let FaroAI process my question to provide a response.'));
    fireEvent.change(screen.getByPlaceholderText('Search (Product name, Color, Type,...)'), { target: { value: 'gold ring' } });
    fireEvent.submit(screen.getByPlaceholderText('Search (Product name, Color, Type,...)').closest('form')!);
    expect(await screen.findByText('A verified answer.')).toBeTruthy();
    expect(askFaro).toHaveBeenCalledWith({ message: 'gold ring', consented: true, knowledgeImprovementConsented: false, trainingLocalConsented: false, trainingSharedConsented: false, state: {} });
  });

  it('renders product cards and identifies live MCP product data', async () => {
    askFaro.mockResolvedValue({ ok: true, data: {
      answer: 'I found a gold necklace.',
      products: [{ id: 'necklace-1', name: 'Gold necklace', sku: 'N-1', productType: 'Necklace', price: 125, currency: 'USD', availability: 'Available', summary: '18k gold', image: 'https://cdn.example.com/necklace.jpg', url: 'https://shop.example.com/necklace' }],
      sources: [{ label: 'GIS MCP', kind: 'mcp' }],
    } });
    render(<DiscoveryPage />);
    fireEvent.click(screen.getByLabelText('I agree to let FaroAI process my question to provide a response.'));
    fireEvent.change(screen.getByPlaceholderText('Search (Product name, Color, Type,...)'), { target: { value: 'necklace' } });
    fireEvent.submit(screen.getByPlaceholderText('Search (Product name, Color, Type,...)').closest('form')!);

    expect(await screen.findByText('Gold necklace')).toBeTruthy();
    expect(screen.getByText('USD 125')).toBeTruthy();
    expect(screen.getByText('Available')).toBeTruthy();
    expect(screen.getByText('Product details provided by GIS MCP.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'View details' }).getAttribute('rel')).toBe('noopener noreferrer');
  });
});
