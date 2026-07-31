/**
 * Seed Stripe products and prices for businesswebdev.com.
 *
 * Run once:
 *   pnpm --filter @workspace/scripts exec tsx src/seed-products.ts
 *
 * Idempotent: skips creation if products with matching metadata already exist.
 * Outputs price IDs at the end — copy them into your env vars:
 *   LAUNCH_PACKAGE_PRICE_ID
 *   MANAGEMENT_PLAN_PRICE_ID
 */

import { getUncachableStripeClient } from "./stripeClient.js";

const LAUNCH_PACKAGE_METADATA_KEY = "businesswebdev_product_id";
const LAUNCH_PACKAGE_METADATA_VALUE = "launch-package";
const MANAGEMENT_PLAN_METADATA_VALUE = "management-plan";

async function findOrCreateProduct(
  stripe: Awaited<ReturnType<typeof getUncachableStripeClient>>,
  {
    name,
    description,
    metadataValue,
  }: { name: string; description: string; metadataValue: string },
) {
  // Check if product already exists (by metadata)
  const existing = await stripe.products.search({
    query: `metadata['${LAUNCH_PACKAGE_METADATA_KEY}']:'${metadataValue}'`,
  });

  if (existing.data.length > 0) {
    const product = existing.data[0];
    console.log(`✓ Product "${name}" already exists: ${product.id}`);
    return product;
  }

  const product = await stripe.products.create({
    name,
    description,
    metadata: { [LAUNCH_PACKAGE_METADATA_KEY]: metadataValue },
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
    recurring,
    metadataValue,
  }: {
    productId: string;
    unitAmount: number;
    currency: string;
    recurring?: { interval: "month" | "year" | "week" | "day" };
    metadataValue: string;
  },
) {
  // Check if active price already exists for this product
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

  const priceData: Parameters<typeof stripe.prices.create>[0] = {
    product: productId,
    unit_amount: unitAmount,
    currency,
    metadata: { [LAUNCH_PACKAGE_METADATA_KEY]: metadataValue },
  };

  if (recurring) {
    priceData.recurring = recurring;
  }

  const price = await stripe.prices.create(priceData);
  console.log(`✓ Created price for "${metadataValue}": ${price.id}`);
  return price;
}

const stripe = await getUncachableStripeClient();

console.log("Seeding Stripe products for businesswebdev.com…\n");

// 1. 30-Day Launch Package — one-time $2,500
const launchProduct = await findOrCreateProduct(stripe, {
  name: "30-Day Launch Package",
  description:
    "Fixed-scope, 30-day project to build or overhaul a business website.",
  metadataValue: LAUNCH_PACKAGE_METADATA_VALUE,
});

const launchPrice = await findOrCreatePrice(stripe, {
  productId: launchProduct.id,
  unitAmount: 250000, // $2,500 in cents
  currency: "usd",
  metadataValue: LAUNCH_PACKAGE_METADATA_VALUE,
});

// 2. Website Management Plan — $450/month recurring
const managementProduct = await findOrCreateProduct(stripe, {
  name: "Website Management Plan",
  description:
    "Ongoing website management, improvements, and SEO — $450/month.",
  metadataValue: MANAGEMENT_PLAN_METADATA_VALUE,
});

const managementPrice = await findOrCreatePrice(stripe, {
  productId: managementProduct.id,
  unitAmount: 45000, // $450 in cents
  currency: "usd",
  recurring: { interval: "month" },
  metadataValue: MANAGEMENT_PLAN_METADATA_VALUE,
});

console.log("\n✅ Seeding complete!\n");
console.log("Set these environment variables in your Replit project:");
console.log(`  LAUNCH_PACKAGE_PRICE_ID=${launchPrice.id}`);
console.log(`  MANAGEMENT_PLAN_PRICE_ID=${managementPrice.id}`);
