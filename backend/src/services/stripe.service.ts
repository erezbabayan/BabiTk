import Stripe from "stripe";
import { env } from "../config/env.js";
import { getSupabaseAdmin } from "../lib/supabase.js";

let stripeClient: Stripe | null = null;

export function isStripeConfigured(): boolean {
  return Boolean(env.stripeSecretKey && env.stripePriceId);
}

function getStripe(): Stripe {
  if (!env.stripeSecretKey) {
    throw new Error("Stripe is not configured");
  }
  if (!stripeClient) {
    stripeClient = new Stripe(env.stripeSecretKey);
  }
  return stripeClient;
}

interface UserBillingRow {
  id: string;
  email: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string | null;
  tier: "free" | "premium";
}

async function loadUserBilling(userId: string): Promise<UserBillingRow> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("users")
    .select("id, email, stripe_customer_id, stripe_subscription_id, subscription_status, tier")
    .eq("id", userId)
    .single();

  if (error || !data) {
    throw new Error(`User not found: ${error?.message ?? "unknown"}`);
  }

  return data as UserBillingRow;
}

export async function getOrCreateStripeCustomer(userId: string): Promise<string> {
  const user = await loadUserBilling(userId);
  if (user.stripe_customer_id) {
    return user.stripe_customer_id;
  }

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email: user.email,
    metadata: { user_id: userId },
  });

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("users")
    .update({ stripe_customer_id: customer.id })
    .eq("id", userId);

  if (error) {
    throw new Error(`Failed to save Stripe customer: ${error.message}`);
  }

  return customer.id;
}

export async function createCheckoutSession(
  userId: string,
  platform: "web" | "mobile" = "web",
): Promise<string> {
  const customerId = await getOrCreateStripeCustomer(userId);
  const stripe = getStripe();

  const successUrl =
    platform === "mobile"
      ? `${env.androidAppUrl}?billing=success`
      : `${env.webAppUrl}/?billing=success`;
  const cancelUrl =
    platform === "mobile"
      ? `${env.androidAppUrl}?billing=cancel`
      : `${env.webAppUrl}/?billing=cancel`;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: env.stripePriceId!, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: userId,
    metadata: { user_id: userId },
    subscription_data: {
      metadata: { user_id: userId },
    },
    allow_promotion_codes: true,
  });

  if (!session.url) {
    throw new Error("Stripe checkout session missing URL");
  }

  return session.url;
}

export async function createBillingPortalSession(userId: string): Promise<string> {
  const user = await loadUserBilling(userId);
  if (!user.stripe_customer_id) {
    throw new Error("No billing account found. Subscribe first.");
  }

  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripe_customer_id,
    return_url: env.webAppUrl,
  });

  return session.url;
}

function isPremiumStatus(status: string | null | undefined): boolean {
  return status === "active" || status === "trialing";
}

async function setUserSubscription(params: {
  userId: string;
  customerId?: string | null;
  subscriptionId?: string | null;
  status?: string | null;
}): Promise<void> {
  const supabase = getSupabaseAdmin();
  const tier = isPremiumStatus(params.status) ? "premium" : "free";

  const update: Record<string, unknown> = {
    tier,
    subscription_status: params.status ?? null,
    updated_at: new Date().toISOString(),
  };

  if (params.customerId !== undefined) {
    update.stripe_customer_id = params.customerId;
  }
  if (params.subscriptionId !== undefined) {
    update.stripe_subscription_id = params.subscriptionId;
  }

  const { error } = await supabase.from("users").update(update).eq("id", params.userId);

  if (error) {
    throw new Error(`Failed to update subscription: ${error.message}`);
  }
}

async function resolveUserIdFromCustomer(customerId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("users")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  return data?.id ?? null;
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const userId = session.metadata?.user_id ?? session.client_reference_id;
  if (!userId) return;

  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id ?? null;

  let status: string | null = "active";
  if (subscriptionId) {
    const stripe = getStripe();
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    status = sub.status;
  }

  await setUserSubscription({
    userId,
    customerId: typeof session.customer === "string" ? session.customer : session.customer?.id,
    subscriptionId,
    status,
  });
}

async function handleSubscriptionChange(subscription: Stripe.Subscription): Promise<void> {
  const userId =
    subscription.metadata.user_id ??
    (subscription.customer
      ? await resolveUserIdFromCustomer(
          typeof subscription.customer === "string"
            ? subscription.customer
            : subscription.customer.id,
        )
      : null);

  if (!userId) return;

  await setUserSubscription({
    userId,
    customerId:
      typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer?.id,
    subscriptionId: subscription.id,
    status: subscription.status,
  });
}

export async function handleStripeWebhook(
  rawBody: Buffer,
  signature: string | undefined,
): Promise<void> {
  if (!env.stripeWebhookSecret) {
    throw new Error("Stripe webhook secret not configured");
  }
  if (!signature) {
    throw new Error("Missing stripe-signature header");
  }

  const stripe = getStripe();
  const event = stripe.webhooks.constructEvent(rawBody, signature, env.stripeWebhookSecret);

  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
      break;
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await handleSubscriptionChange(event.data.object as Stripe.Subscription);
      break;
    default:
      break;
  }
}
