/**
 * Seed Stripe products and prices for businessweboptimizer.com.
 *
 * Run once:
 *   pnpm --filter @workspace/scripts exec tsx src/seed-products.ts
 *
 * Idempotent: skips creation if products with matching metadata already exist.
 * Outputs price IDs at the end — copy them into your env vars:
 *   OPTIMIZER_PRICE_ID
 *   OPTIMIZER_PRO_PRICE_ID
 */

import { getUncachableStripeClient } from "./stripeClient.js";

const METADATA_KEY = "businessweboptimizer_product_id";

async function findOrCreateProduct(
  stripe: Awaited<ReturnType<typeof getUncachableStripeClient>>,
  {
    name,
    description,
    metadataValue,
  }: { name: string; description: string; metadataValue: string },
) {
  const existing = await stripe.products.search({
    query: `metadata['${METADATA_KEY}']:'${metadataValue}'`,
  });

  if (existing.data.length > 0) {
    const product = existing.data[0];
    console.log(`✓ Product "${name}" already exists: ${product.id}`);
    return product;
  }

  const product = await stripe.products.create({
    name,
    description,
    metadata: { [METADATA_KEY]: metadataValue },
  });

  console.log(`✓ Created product "${name}": ${product.id}`);
  return product;
}

async function findOrCreatePrice(
  stripe: Awaited<ReturnType<typeof getUncachableStripeClient>>,
  {
    productId,
    unitAmount,
    currency,
    metadataValue,
  }: {
    productId: string;
    unitAmount: number;
    currency: string;
    metadataValue: string;
  },
) {
  const existing = await stripe.prices.list({
    product: productId,
    active: true,
    limit: 10,
  });

  if (existing.data.length > 0) {
    const price = existing.data[0];
    console.log(`✓ Price for "${metadataValue}" already exists: ${price.id}`);
    return price;
  }

  const price = await stripe.prices.create({
    product: productId,
    unit_amount: unitAmount,
    currency,
    recurring: { interval: "month" },
    metadata: { [METADATA_KEY]: metadataValue },
  });

  console.log(`✓ Created price for "${metadataValue}": ${price.id}`);
  return price;
}

const stripe = await getUncachableStripeClient();

console.log("Seeding Stripe products for businessweboptimizer.com…\n");

// 1. Optimizer — $29/month recurring
const optimizerProduct = await findOrCreateProduct(stripe, {
  name: "Optimizer",
  description:
    "Full site scan, deeper checks, exportable PDF report, monthly re-scan.",
  metadataValue: "optimizer",
});

const optimizerPrice = await findOrCreatePrice(stripe, {
  productId: optimizerProduct.id,
  unitAmount: 2900, // $29 in cents
  currency: "usd",
  metadataValue: "optimizer",
});

// 2. Optimizer Pro — $79/month recurring
const optimizerProProduct = await findOrCreateProduct(stripe, {
  name: "Optimizer Pro",
  description:
    "Everything in Optimizer, plus scheduled scans, competitor comparison, white-label reports, and API access.",
  metadataValue: "optimizer-pro",
});

const optimizerProPrice = await findOrCreatePrice(stripe, {
  productId: optimizerProProduct.id,
  unitAmount: 7900, // $79 in cents
  currency: "usd",
  metadataValue: "optimizer-pro",
});

console.log("\n✅ Seeding complete!\n");
console.log("Set these environment variables in your Replit project:");
console.log(`  OPTIMIZER_PRICE_ID=${optimizerPrice.id}`);
console.log(`  OPTIMIZER_PRO_PRICE_ID=${optimizerProPrice.id}`);
