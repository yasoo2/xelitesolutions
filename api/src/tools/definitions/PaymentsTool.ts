import { ToolDefinition } from '../types';

/**
 * PaymentsTool - Handles Stripe payment integrations
 */

const paymentsCreateCheckoutSession: ToolDefinition = {
    name: 'payments_create_checkout_session',
    description: 'Creates a Stripe checkout session for payment processing. Requires Stripe API key to be configured.',
    inputSchema: {
        type: 'object',
        properties: {
            amount: {
                type: 'number',
                description: 'Payment amount in cents (e.g., 1000 = $10.00)'
            },
            currency: {
                type: 'string',
                description: 'Currency code (e.g., "usd", "sar", "eur")',
                default: 'usd'
            },
            productName: {
                type: 'string',
                description: 'Name of the product or service being purchased'
            },
            successUrl: {
                type: 'string',
                description: 'URL to redirect after successful payment'
            },
            cancelUrl: {
                type: 'string',
                description: 'URL to redirect if payment is cancelled'
            },
            sessionId: {
                type: 'string',
                description: 'Session ID for tracking'
            }
        },
        required: ['amount', 'productName']
    },
    execute: async (input: any) => {
        const { amount, currency = 'usd', productName, successUrl, cancelUrl, sessionId } = input;

        // Check for Stripe API key
        const stripeKey = process.env.STRIPE_SECRET_KEY;
        if (!stripeKey) {
            return {
                ok: false,
                error: 'stripe_not_configured',
                output: 'Stripe API key is not configured. Please set STRIPE_SECRET_KEY in environment variables.'
            };
        }

        try {
            // Dynamically import Stripe to avoid errors if not installed
            let stripe: any;
            try {
                const StripeModule = await import('stripe');
                stripe = new StripeModule.default(stripeKey);
            } catch (e) {
                return {
                    ok: false,
                    error: 'stripe_not_installed',
                    output: 'Stripe package is not installed. Run: npm install stripe'
                };
            }

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
                output: {
                    checkoutUrl: session.url,
                    sessionId: session.id,
                    amount: amount,
                    currency: currency,
                    productName: productName
                }
            };
        } catch (e: any) {
            return {
                ok: false,
                error: 'stripe_error',
                output: `Stripe error: ${e.message}`
            };
        }
    }
};

export const PaymentsTools: ToolDefinition[] = [
    paymentsCreateCheckoutSession
];
