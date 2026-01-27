import { BaseTool } from '../base';
import { ToolPermission } from '../types';

/**
 * PaymentsTool - Handles Stripe payment integrations
 */
export class PaymentsTool extends BaseTool {
    name = 'payments_create_checkout_session';
    description = 'Creates a Stripe checkout session for payment processing. Requires Stripe API key to be configured.';
    version = '1.0.0';
    tags = ['payments', 'stripe', 'finance'];

    inputSchema = {
        type: 'object' as const,
        properties: {
            amount: {
                type: 'number' as const,
                description: 'Payment amount in cents (e.g., 1000 = $10.00)'
            },
            currency: {
                type: 'string' as const,
                description: 'Currency code (e.g., "usd", "sar", "eur")',
                default: 'usd'
            },
            productName: {
                type: 'string' as const,
                description: 'Name of the product or service being purchased'
            },
            successUrl: {
                type: 'string' as const,
                description: 'URL to redirect after successful payment'
            },
            cancelUrl: {
                type: 'string' as const,
                description: 'URL to redirect if payment is cancelled'
            },
            sessionId: {
                type: 'string' as const,
                description: 'Session ID for tracking'
            }
        },
        required: ['amount', 'productName']
    };

    outputSchema = {
        type: 'object' as const,
        properties: {
            checkoutUrl: { type: 'string' as const },
            sessionId: { type: 'string' as const }
        }
    };

    permissions: ToolPermission[] = ['internet'];
    sideEffects: ToolPermission[] = []; // Financial actions are side effects, but not in strict type yet
    rateLimitPerMinute = 10;
    auditFields = ['amount', 'currency', 'productName'];
    mockSupported = true;

    async execute(input: any) {
        const { amount, currency = 'usd', productName, successUrl, cancelUrl, sessionId } = input;

        // Check for Stripe API key
        const stripeKey = process.env.STRIPE_SECRET_KEY;
        if (!stripeKey) {
            return {
                ok: false,
                error: 'stripe_not_configured',
                output: 'Stripe API key is not configured. Please set STRIPE_SECRET_KEY in environment variables.',
                logs: ['Configuration check failed: Missing STRIPE_SECRET_KEY']
            };
        }

        try {
            // Dynamically import Stripe
            // @ts-ignore
            const StripeModule = await import('stripe');
            const stripe = new StripeModule.default(stripeKey);

            // Create checkout session
            const session = await stripe.checkout.sessions.create({
                payment_method_types: ['card'],
                line_items: [
                    {
                        price_data: {
                            currency: currency.toLowerCase(),
                            product_data: {
                                name: productName,
                            },
                            unit_amount: Math.round(amount),
                        },
                        quantity: 1,
                    },
                ],
                mode: 'payment',
                success_url: successUrl || `${process.env.FRONTEND_URL || 'http://localhost:5173'}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: cancelUrl || `${process.env.FRONTEND_URL || 'http://localhost:5173'}/payment/cancel`,
                metadata: {
                    sessionId: sessionId || 'unknown'
                }
            });

            return {
                ok: true,
                output: JSON.stringify({
                    checkoutUrl: session.url,
                    sessionId: session.id,
                    amount: amount,
                    currency: currency,
                    productName: productName
                }),
                logs: [`Created Checkout Session: ${session.id}`]
            };
        } catch (e: any) {
            return {
                ok: false,
                error: 'stripe_error',
                output: `Stripe error: ${e.message}`,
                logs: [`Stripe API Failed: ${e.message}`]
            };
        }
    }
}

