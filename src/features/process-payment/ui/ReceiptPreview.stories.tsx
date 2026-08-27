import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReceiptData } from '@shared/lib/edge-function-contracts';
import { ReceiptPreview } from './ReceiptPreview';

const baseItems: ReceiptData['items'] = [
  { name: 'Cerveza', quantity: 2, unitPrice: 45, lineTotal: 90 },
  { name: 'Nachos', quantity: 1, unitPrice: 120, lineTotal: 120 },
];

const base: ReceiptData = {
  receiptNumber: 'A1B2C3D4',
  tabId: '123e4567-e89b-12d3-a456-426614174000',
  customerName: 'María G.',
  cashierName: 'Luis P.',
  barName: 'Bola 8 Cantina',
  barAddress: 'Av. Insurgentes 123, CDMX',
  items: baseItems,
  subtotal: 210,
  tipAmount: 31.5,
  total: 241.5,
  paymentMethod: 'cash',
  processedAt: new Date('2026-04-17T14:30:00'),
  squareReceiptUrl: null,
  tenderedAmount: 250,
  changeAmount: 8.5,
};

const meta = {
  title: 'Features/ProcessPayment/ReceiptPreview',
  component: ReceiptPreview,
  tags: ['autodocs'],
  args: {
    onDone: () => {},
  },
} satisfies Meta<typeof ReceiptPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Cash: Story = {
  args: {
    receipt: base,
  },
};

export const Card: Story = {
  args: {
    receipt: {
      ...base,
      paymentMethod: 'card',
      tenderedAmount: undefined,
      changeAmount: undefined,
      tipAmount: 42,
      total: 252,
      terminalReference: 'AUTH987654',
    },
  },
};

export const Rappi: Story = {
  args: {
    receipt: {
      ...base,
      paymentMethod: 'rappi',
      tipAmount: 0,
      total: 210,
      tenderedAmount: undefined,
      changeAmount: undefined,
    },
  },
};
