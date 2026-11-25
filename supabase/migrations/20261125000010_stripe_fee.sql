-- Commissione trattenuta da Stripe su un incasso (centesimi, EUR). Null = non nota o pagamento non Stripe.
alter table payments add column stripe_fee_cents integer check (stripe_fee_cents is null or stripe_fee_cents >= 0);
