<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * Growth suite: a local ledger of platform charges, discount coupons, and the
 * lifecycle-marketing campaign engine.
 */
class CreateGrowthAndPaymentTables extends Migration
{
    public function up()
    {
        // ------------------------------------------------------------ payments
        $this->forge->addField([
            'id' => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'auto_increment' => true],
            'organization_id' => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'null' => true],
            'plan_id' => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'null' => true],
            'stripe_invoice_id' => ['type' => 'VARCHAR', 'constraint' => 191, 'null' => true],
            'stripe_subscription_id' => ['type' => 'VARCHAR', 'constraint' => 191, 'null' => true],
            'stripe_customer_id' => ['type' => 'VARCHAR', 'constraint' => 191, 'null' => true],
            'stripe_payment_intent_id' => ['type' => 'VARCHAR', 'constraint' => 191, 'null' => true],
            'invoice_number' => ['type' => 'VARCHAR', 'constraint' => 100, 'null' => true],
            'status' => [
                'type' => 'ENUM',
                'constraint' => ['paid', 'open', 'failed', 'refunded', 'partially_refunded', 'void', 'uncollectible'],
                'default' => 'paid',
            ],
            'billing_reason' => ['type' => 'VARCHAR', 'constraint' => 60, 'null' => true],
            'billing_cycle' => ['type' => 'VARCHAR', 'constraint' => 20, 'null' => true],
            'amount' => ['type' => 'DECIMAL', 'constraint' => '12,2', 'default' => 0],
            'amount_refunded' => ['type' => 'DECIMAL', 'constraint' => '12,2', 'default' => 0],
            'discount_amount' => ['type' => 'DECIMAL', 'constraint' => '12,2', 'default' => 0],
            'tax_amount' => ['type' => 'DECIMAL', 'constraint' => '12,2', 'default' => 0],
            'currency' => ['type' => 'VARCHAR', 'constraint' => 10, 'default' => 'usd'],
            'seats' => ['type' => 'INT', 'constraint' => 11, 'null' => true],
            'coupon_code' => ['type' => 'VARCHAR', 'constraint' => 60, 'null' => true],
            'attempt_count' => ['type' => 'INT', 'constraint' => 11, 'default' => 0],
            'failure_code' => ['type' => 'VARCHAR', 'constraint' => 100, 'null' => true],
            'failure_message' => ['type' => 'VARCHAR', 'constraint' => 500, 'null' => true],
            'card_brand' => ['type' => 'VARCHAR', 'constraint' => 40, 'null' => true],
            'card_last4' => ['type' => 'VARCHAR', 'constraint' => 10, 'null' => true],
            'hosted_invoice_url' => ['type' => 'VARCHAR', 'constraint' => 500, 'null' => true],
            'invoice_pdf_url' => ['type' => 'VARCHAR', 'constraint' => 500, 'null' => true],
            'period_start' => ['type' => 'DATETIME', 'null' => true],
            'period_end' => ['type' => 'DATETIME', 'null' => true],
            'paid_at' => ['type' => 'DATETIME', 'null' => true],
            'failed_at' => ['type' => 'DATETIME', 'null' => true],
            'refunded_at' => ['type' => 'DATETIME', 'null' => true],
            'source' => ['type' => 'ENUM', 'constraint' => ['stripe_webhook', 'stripe_backfill', 'manual'], 'default' => 'stripe_webhook'],
            'notes' => ['type' => 'VARCHAR', 'constraint' => 500, 'null' => true],
            'created_at' => ['type' => 'DATETIME', 'null' => true],
            'updated_at' => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addUniqueKey('stripe_invoice_id');
        $this->forge->addKey(['organization_id', 'paid_at']);
        $this->forge->addKey(['status', 'created_at']);
        $this->forge->createTable('platform_payments', true);

        // ------------------------------------------------------------- coupons
        $this->forge->addField([
            'id' => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'auto_increment' => true],
            'code' => ['type' => 'VARCHAR', 'constraint' => 60],
            'name' => ['type' => 'VARCHAR', 'constraint' => 150],
            'description' => ['type' => 'VARCHAR', 'constraint' => 500, 'null' => true],
            'discount_type' => ['type' => 'ENUM', 'constraint' => ['percent', 'amount'], 'default' => 'percent'],
            'percent_off' => ['type' => 'DECIMAL', 'constraint' => '5,2', 'null' => true],
            'amount_off' => ['type' => 'DECIMAL', 'constraint' => '12,2', 'null' => true],
            'currency' => ['type' => 'VARCHAR', 'constraint' => 10, 'default' => 'usd'],
            'duration' => ['type' => 'ENUM', 'constraint' => ['once', 'repeating', 'forever'], 'default' => 'once'],
            'duration_in_months' => ['type' => 'INT', 'constraint' => 11, 'null' => true],
            'max_redemptions' => ['type' => 'INT', 'constraint' => 11, 'null' => true],
            'redemption_count' => ['type' => 'INT', 'constraint' => 11, 'default' => 0],
            'plan_ids' => ['type' => 'TEXT', 'null' => true],
            'purpose' => [
                'type' => 'ENUM',
                'constraint' => ['acquisition', 'winback', 'retention', 'upgrade', 'other'],
                'default' => 'other',
            ],
            'expires_at' => ['type' => 'DATETIME', 'null' => true],
            'is_active' => ['type' => 'TINYINT', 'constraint' => 1, 'default' => 1],
            'stripe_coupon_id' => ['type' => 'VARCHAR', 'constraint' => 191, 'null' => true],
            'stripe_promotion_code_id' => ['type' => 'VARCHAR', 'constraint' => 191, 'null' => true],
            'sync_error' => ['type' => 'VARCHAR', 'constraint' => 500, 'null' => true],
            'created_by' => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'null' => true],
            'created_at' => ['type' => 'DATETIME', 'null' => true],
            'updated_at' => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addUniqueKey('code');
        $this->forge->addKey(['is_active', 'expires_at']);
        $this->forge->createTable('platform_coupons', true);

        $this->forge->addField([
            'id' => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'auto_increment' => true],
            'coupon_id' => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true],
            'organization_id' => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'null' => true],
            'user_id' => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'null' => true],
            'campaign_id' => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'null' => true],
            'stripe_invoice_id' => ['type' => 'VARCHAR', 'constraint' => 191, 'null' => true],
            'amount_discounted' => ['type' => 'DECIMAL', 'constraint' => '12,2', 'default' => 0],
            'created_at' => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addKey('coupon_id');
        $this->forge->addKey('organization_id');
        $this->forge->createTable('platform_coupon_redemptions', true);

        // ----------------------------------------------------------- campaigns
        $this->forge->addField([
            'id' => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'auto_increment' => true],
            'name' => ['type' => 'VARCHAR', 'constraint' => 191],
            'goal' => [
                'type' => 'ENUM',
                'constraint' => ['acquisition', 'onboarding', 'engagement', 'retention', 'winback', 'expansion', 'dunning', 'announcement'],
                'default' => 'engagement',
            ],
            'segment_key' => ['type' => 'VARCHAR', 'constraint' => 60],
            'segment_config' => ['type' => 'TEXT', 'null' => true],
            'channel' => ['type' => 'ENUM', 'constraint' => ['email', 'in_app', 'both'], 'default' => 'email'],
            'subject' => ['type' => 'VARCHAR', 'constraint' => 255],
            'body' => ['type' => 'TEXT'],
            'cta_label' => ['type' => 'VARCHAR', 'constraint' => 100, 'null' => true],
            'cta_url' => ['type' => 'VARCHAR', 'constraint' => 500, 'null' => true],
            'coupon_id' => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'null' => true],
            'status' => [
                'type' => 'ENUM',
                'constraint' => ['draft', 'scheduled', 'sending', 'sent', 'active', 'paused', 'archived'],
                'default' => 'draft',
            ],
            /** one_off = single blast, recurring = automation that keeps catching new members of the segment */
            'mode' => ['type' => 'ENUM', 'constraint' => ['one_off', 'recurring'], 'default' => 'one_off'],
            'scheduled_at' => ['type' => 'DATETIME', 'null' => true],
            'interval_hours' => ['type' => 'INT', 'constraint' => 11, 'default' => 24],
            /** Don't email the same person for this campaign again within this window. */
            'cooldown_days' => ['type' => 'INT', 'constraint' => 11, 'default' => 30],
            'max_per_run' => ['type' => 'INT', 'constraint' => 11, 'default' => 200],
            'attribution_days' => ['type' => 'INT', 'constraint' => 11, 'default' => 30],
            'last_run_at' => ['type' => 'DATETIME', 'null' => true],
            'next_run_at' => ['type' => 'DATETIME', 'null' => true],
            'total_recipients' => ['type' => 'INT', 'constraint' => 11, 'default' => 0],
            'total_sent' => ['type' => 'INT', 'constraint' => 11, 'default' => 0],
            'total_failed' => ['type' => 'INT', 'constraint' => 11, 'default' => 0],
            'total_opened' => ['type' => 'INT', 'constraint' => 11, 'default' => 0],
            'total_clicked' => ['type' => 'INT', 'constraint' => 11, 'default' => 0],
            'total_converted' => ['type' => 'INT', 'constraint' => 11, 'default' => 0],
            'converted_revenue' => ['type' => 'DECIMAL', 'constraint' => '12,2', 'default' => 0],
            'is_playbook' => ['type' => 'TINYINT', 'constraint' => 1, 'default' => 0],
            'playbook_key' => ['type' => 'VARCHAR', 'constraint' => 60, 'null' => true],
            'created_by' => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'null' => true],
            'created_at' => ['type' => 'DATETIME', 'null' => true],
            'updated_at' => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addKey(['status', 'next_run_at']);
        $this->forge->addUniqueKey('playbook_key');
        $this->forge->createTable('marketing_campaigns', true);

        $this->forge->addField([
            'id' => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'auto_increment' => true],
            'campaign_id' => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true],
            'organization_id' => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'null' => true],
            'user_id' => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'null' => true],
            'email' => ['type' => 'VARCHAR', 'constraint' => 191, 'null' => true],
            'token' => ['type' => 'VARCHAR', 'constraint' => 64],
            'status' => ['type' => 'ENUM', 'constraint' => ['sent', 'failed', 'skipped'], 'default' => 'sent'],
            'channel' => ['type' => 'VARCHAR', 'constraint' => 20, 'default' => 'email'],
            'error' => ['type' => 'VARCHAR', 'constraint' => 500, 'null' => true],
            'sent_at' => ['type' => 'DATETIME', 'null' => true],
            'opened_at' => ['type' => 'DATETIME', 'null' => true],
            'open_count' => ['type' => 'INT', 'constraint' => 11, 'default' => 0],
            'clicked_at' => ['type' => 'DATETIME', 'null' => true],
            'click_count' => ['type' => 'INT', 'constraint' => 11, 'default' => 0],
            'converted_at' => ['type' => 'DATETIME', 'null' => true],
            'conversion_amount' => ['type' => 'DECIMAL', 'constraint' => '12,2', 'default' => 0],
            'created_at' => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addUniqueKey('token');
        $this->forge->addKey(['campaign_id', 'status']);
        $this->forge->addKey(['organization_id', 'sent_at']);
        $this->forge->addKey(['user_id', 'campaign_id']);
        $this->forge->createTable('marketing_campaign_sends', true);

        // `subscription_history.action` was missing the values the Stripe webhook
        // actually writes, so renewals were being rejected/miscounted in revenue
        // reporting. Widen the ENUM to the full vocabulary used by the code.
        $this->db->query("
            ALTER TABLE `subscription_history`
            MODIFY `action` ENUM(
                'subscribe','upgrade','downgrade','cancel','renew','renewal',
                'trial_start','trial_end','stripe_checkout','reactivate','comp'
            ) NOT NULL
        ");
    }

    public function down()
    {
        foreach ([
            'marketing_campaign_sends',
            'marketing_campaigns',
            'platform_coupon_redemptions',
            'platform_coupons',
            'platform_payments',
        ] as $table) {
            $this->forge->dropTable($table, true);
        }

        $this->db->query("
            ALTER TABLE `subscription_history`
            MODIFY `action` ENUM(
                'subscribe','upgrade','downgrade','cancel','renew','trial_start','trial_end'
            ) NOT NULL
        ");
    }
}
