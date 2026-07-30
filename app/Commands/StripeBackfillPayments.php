<?php

namespace App\Commands;

use App\Services\PaymentLedgerService;
use CodeIgniter\CLI\BaseCommand;
use CodeIgniter\CLI\CLI;
use Stripe\StripeClient;

/**
 * Pull historic Stripe invoices into the local `platform_payments` ledger.
 *
 * Webhooks only capture charges from the moment they were wired up, so run this
 * once after deploying the ledger (and any time webhooks were down).
 */
class StripeBackfillPayments extends BaseCommand
{
    protected $group = 'Billing';
    protected $name = 'stripe:backfill-payments';
    protected $description = 'Import historic Stripe invoices into the platform payment ledger';
    protected $usage = 'stripe:backfill-payments [months] [--dry-run]';

    public function run(array $params)
    {
        $months = isset($params[0]) && is_numeric($params[0]) ? max(1, (int) $params[0]) : 24;
        $dryRun = in_array('--dry-run', $params, true) || (bool) CLI::getOption('dry-run');

        $secret = trim((string) (env('STRIPE_SECRET_KEY') ?? getenv('STRIPE_SECRET_KEY') ?? ''));
        if ($secret === '') {
            CLI::error('STRIPE_SECRET_KEY is not configured.');

            return;
        }

        $stripe = new StripeClient($secret);
        $ledger = new PaymentLedgerService();
        $createdAfter = strtotime("-{$months} months");

        CLI::write(sprintf(
            'Backfilling Stripe invoices created after %s%s',
            date('Y-m-d', $createdAfter),
            $dryRun ? ' (dry run)' : ''
        ), 'yellow');

        $imported = 0;
        $failed = 0;
        $skipped = 0;
        $startingAfter = null;

        do {
            $query = [
                'limit' => 100,
                'created' => ['gte' => $createdAfter],
                'expand' => ['data.discounts'],
            ];

            if ($startingAfter !== null) {
                $query['starting_after'] = $startingAfter;
            }

            try {
                $page = $stripe->invoices->all($query);
            } catch (\Throwable $e) {
                CLI::error('Stripe request failed: ' . $e->getMessage());

                return;
            }

            foreach ($page->data as $invoice) {
                $startingAfter = $invoice->id;

                if ($dryRun) {
                    CLI::write(sprintf(
                        '  would import %s  %s  %s %s',
                        $invoice->id,
                        str_pad((string) ($invoice->status ?? '?'), 14),
                        strtoupper((string) ($invoice->currency ?? 'usd')),
                        number_format(((float) ($invoice->amount_paid ?? $invoice->total ?? 0)) / 100, 2)
                    ));
                    $imported++;
                    continue;
                }

                try {
                    $status = (string) ($invoice->status ?? '');
                    $result = $status === 'paid'
                        ? $ledger->recordStripeInvoice($invoice, null, 'stripe_backfill')
                        : ($status === 'open' && (int) ($invoice->attempt_count ?? 0) > 0
                            ? $ledger->markInvoiceFailed($invoice)
                            : $ledger->recordStripeInvoice($invoice, null, 'stripe_backfill'));

                    if ($result === null) {
                        $skipped++;
                    } else {
                        $imported++;
                    }
                } catch (\Throwable $e) {
                    $failed++;
                    CLI::write('  failed ' . $invoice->id . ': ' . $e->getMessage(), 'red');
                }
            }
        } while (($page->has_more ?? false) === true);

        CLI::write(sprintf('Done. %d imported, %d skipped, %d failed.', $imported, $skipped, $failed), 'green');
    }
}
