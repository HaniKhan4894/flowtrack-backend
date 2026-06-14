<?php

namespace App\Database\Seeds;

use CodeIgniter\Database\Seeder;

class PlanSeeder extends Seeder
{
    public function run()
    {
        // Disable foreign key checks for clean seeding
        $this->db->query('SET FOREIGN_KEY_CHECKS=0;');
        $this->db->table('plans')->truncate();
        $this->db->table('plan_features')->truncate();
        $this->db->query('SET FOREIGN_KEY_CHECKS=1;');

        $plans = [
            [
                'id'            => 1,
                'name'          => 'Free',
                'slug'          => 'free',
                'description'   => 'Perfect for trying out FlowTrack',
                'pricing_model' => 'fixed',
                'price_monthly' => 0.00,
                'price_yearly'  => 0.00,
                'base_price'    => 0.00,
                'price_per_user'=> 0.00,
                'min_users'     => 1,
                'trial_days'    => 0,
                'is_active'     => true,
                'is_popular'    => false,
                'sort_order'    => 1,
                'created_at'    => date('Y-m-d H:i:s'),
                'updated_at'    => date('Y-m-d H:i:s'),
            ],
            [
                'id'            => 2,
                'name'          => 'Starter',
                'slug'          => 'starter',
                'description'   => 'For small teams getting started',
                'pricing_model' => 'fixed',
                'price_monthly' => 9.99,
                'price_yearly'  => 99.00,
                'base_price'    => 0.00,
                'price_per_user'=> 0.00,
                'min_users'     => 1,
                'trial_days'    => 14,
                'is_active'     => true,
                'is_popular'    => false,
                'sort_order'    => 2,
                'created_at'    => date('Y-m-d H:i:s'),
                'updated_at'    => date('Y-m-d H:i:s'),
            ],
            [
                'id'            => 3,
                'name'          => 'Professional',
                'slug'          => 'professional',
                'description'   => 'For growing teams that need more',
                'pricing_model' => 'per_user',
                'price_monthly' => 29.99,
                'price_yearly'  => 299.00,
                'base_price'    => 10.00,
                'price_per_user'=> 5.00,
                'min_users'     => 3,
                'trial_days'    => 14,
                'is_active'     => true,
                'is_popular'    => true,
                'sort_order'    => 3,
                'created_at'    => date('Y-m-d H:i:s'),
                'updated_at'    => date('Y-m-d H:i:s'),
            ],
            [
                'id'            => 4,
                'name'          => 'Enterprise',
                'slug'          => 'enterprise',
                'description'   => 'For large organizations with advanced needs',
                'pricing_model' => 'per_user',
                'price_monthly' => 99.99,
                'price_yearly'  => 999.00,
                'base_price'    => 50.00,
                'price_per_user'=> 8.00,
                'min_users'     => 10,
                'trial_days'    => 30,
                'is_active'     => true,
                'is_popular'    => false,
                'sort_order'    => 4,
                'created_at'    => date('Y-m-d H:i:s'),
                'updated_at'    => date('Y-m-d H:i:s'),
            ],
        ];

        $this->db->table('plans')->insertBatch($plans);

        $features = [];

        // Free Plan (plan_id = 1)
        $features = array_merge($features, [
            ['plan_id' => 1, 'feature_key' => 'max_users', 'feature_value' => '1', 'display_name' => 'Single user only'],
            ['plan_id' => 1, 'feature_key' => 'max_projects', 'feature_value' => '2', 'display_name' => 'Up to 2 projects'],
            ['plan_id' => 1, 'feature_key' => 'max_tasks_per_project', 'feature_value' => '10', 'display_name' => '10 tasks per project'],
            ['plan_id' => 1, 'feature_key' => 'screenshots', 'feature_value' => 'false', 'display_name' => 'No screenshot monitoring'],
            ['plan_id' => 1, 'feature_key' => 'screenshot_interval', 'feature_value' => '0', 'display_name' => 'No screenshots'],
            ['plan_id' => 1, 'feature_key' => 'activity_tracking', 'feature_value' => 'false', 'display_name' => 'No activity tracking'],
            ['plan_id' => 1, 'feature_key' => 'reports', 'feature_value' => 'basic', 'display_name' => 'Basic reports only'],
            ['plan_id' => 1, 'feature_key' => 'report_export', 'feature_value' => 'false', 'display_name' => 'No report export'],
            ['plan_id' => 1, 'feature_key' => 'invoicing', 'feature_value' => 'false', 'display_name' => 'No invoicing'],
            ['plan_id' => 1, 'feature_key' => 'custom_roles', 'feature_value' => 'false', 'display_name' => 'Basic roles only'],
            ['plan_id' => 1, 'feature_key' => 'support', 'feature_value' => 'community', 'display_name' => 'Community support'],
            ['plan_id' => 1, 'feature_key' => 'data_retention', 'feature_value' => '30', 'display_name' => '30 days data retention'],
        ]);

        // Starter Plan (plan_id = 2)
        $features = array_merge($features, [
            ['plan_id' => 2, 'feature_key' => 'max_users', 'feature_value' => '5', 'display_name' => 'Up to 5 team members'],
            ['plan_id' => 2, 'feature_key' => 'max_projects', 'feature_value' => '10', 'display_name' => 'Up to 10 projects'],
            ['plan_id' => 2, 'feature_key' => 'max_tasks_per_project', 'feature_value' => 'unlimited', 'display_name' => 'Unlimited tasks'],
            ['plan_id' => 2, 'feature_key' => 'screenshots', 'feature_value' => 'true', 'display_name' => 'Screenshot monitoring'],
            ['plan_id' => 2, 'feature_key' => 'screenshot_interval', 'feature_value' => '5', 'display_name' => 'Every 5 minutes'],
            ['plan_id' => 2, 'feature_key' => 'screenshot_blur', 'feature_value' => 'true', 'display_name' => 'Blur sensitive content'],
            ['plan_id' => 2, 'feature_key' => 'activity_tracking', 'feature_value' => 'true', 'display_name' => 'Activity tracking'],
            ['plan_id' => 2, 'feature_key' => 'productivity_rules', 'feature_value' => 'true', 'display_name' => 'Productivity categorization'],
            ['plan_id' => 2, 'feature_key' => 'reports', 'feature_value' => 'advanced', 'display_name' => 'Advanced reports'],
            ['plan_id' => 2, 'feature_key' => 'report_export', 'feature_value' => 'csv', 'display_name' => 'Export to CSV'],
            ['plan_id' => 2, 'feature_key' => 'support', 'feature_value' => 'email', 'display_name' => 'Email support'],
            ['plan_id' => 2, 'feature_key' => 'data_retention', 'feature_value' => '90', 'display_name' => '90 days data retention'],
        ]);

        // Professional Plan (plan_id = 3)
        $features = array_merge($features, [
            ['plan_id' => 3, 'feature_key' => 'max_users', 'feature_value' => '25', 'display_name' => 'Up to 25 team members'],
            ['plan_id' => 3, 'feature_key' => 'max_projects', 'feature_value' => 'unlimited', 'display_name' => 'Unlimited projects'],
            ['plan_id' => 3, 'feature_key' => 'screenshots', 'feature_value' => 'true', 'display_name' => 'Full screenshot monitoring'],
            ['plan_id' => 3, 'feature_key' => 'screenshot_interval', 'feature_value' => '2', 'display_name' => 'Every 2 minutes'],
            ['plan_id' => 3, 'feature_key' => 'screenshot_blur', 'feature_value' => 'true', 'display_name' => 'Blur sensitive content'],
            ['plan_id' => 3, 'feature_key' => 'screenshot_ocr', 'feature_value' => 'true', 'display_name' => 'OCR text search'],
            ['plan_id' => 3, 'feature_key' => 'activity_tracking', 'feature_value' => 'true', 'display_name' => 'Advanced activity tracking'],
            ['plan_id' => 3, 'feature_key' => 'productivity_rules', 'feature_value' => 'true', 'display_name' => 'Custom productivity rules'],
            ['plan_id' => 3, 'feature_key' => 'reports', 'feature_value' => 'advanced', 'display_name' => 'Full analytics & reports'],
            ['plan_id' => 3, 'feature_key' => 'report_export', 'feature_value' => 'all', 'display_name' => 'Export CSV, PDF, Excel'],
            ['plan_id' => 3, 'feature_key' => 'team_leaderboard', 'feature_value' => 'true', 'display_name' => 'Team leaderboard'],
            ['plan_id' => 3, 'feature_key' => 'invoicing', 'feature_value' => 'true', 'display_name' => 'Invoicing & billing'],
            ['plan_id' => 3, 'feature_key' => 'custom_roles', 'feature_value' => 'true', 'display_name' => 'Custom roles & permissions'],
            ['plan_id' => 3, 'feature_key' => 'api_access', 'feature_value' => 'full', 'display_name' => 'Full API access'],
            ['plan_id' => 3, 'feature_key' => 'webhooks', 'feature_value' => 'true', 'display_name' => 'Webhook integrations'],
            ['plan_id' => 3, 'feature_key' => 'support', 'feature_value' => 'priority', 'display_name' => 'Priority support'],
            ['plan_id' => 3, 'feature_key' => 'data_retention', 'feature_value' => '365', 'display_name' => '1 year data retention'],
        ]);

        // Enterprise Plan (plan_id = 4)
        $features = array_merge($features, [
            ['plan_id' => 4, 'feature_key' => 'max_users', 'feature_value' => 'unlimited', 'display_name' => 'Unlimited team members'],
            ['plan_id' => 4, 'feature_key' => 'max_projects', 'feature_value' => 'unlimited', 'display_name' => 'Unlimited projects'],
            ['plan_id' => 4, 'feature_key' => 'screenshots', 'feature_value' => 'true', 'display_name' => 'Enterprise monitoring'],
            ['plan_id' => 4, 'feature_key' => 'screenshot_interval', 'feature_value' => '1', 'display_name' => 'Every 1 minute'],
            ['plan_id' => 4, 'feature_key' => 'screenshot_blur', 'feature_value' => 'true', 'display_name' => 'AI-powered blur'],
            ['plan_id' => 4, 'feature_key' => 'screenshot_ocr', 'feature_value' => 'true', 'display_name' => 'Advanced OCR search'],
            ['plan_id' => 4, 'feature_key' => 'activity_tracking', 'feature_value' => 'true', 'display_name' => 'AI activity insights'],
            ['plan_id' => 4, 'feature_key' => 'productivity_rules', 'feature_value' => 'true', 'display_name' => 'AI productivity analysis'],
            ['plan_id' => 4, 'feature_key' => 'reports', 'feature_value' => 'enterprise', 'display_name' => 'Enterprise analytics'],
            ['plan_id' => 4, 'feature_key' => 'white_label', 'feature_value' => 'true', 'display_name' => 'White-label branding'],
            ['plan_id' => 4, 'feature_key' => 'custom_domain', 'feature_value' => 'true', 'display_name' => 'Custom domain'],
            ['plan_id' => 4, 'feature_key' => 'sso', 'feature_value' => 'true', 'display_name' => 'Single Sign-On (SSO)'],
            ['plan_id' => 4, 'feature_key' => 'dedicated_server', 'feature_value' => 'true', 'display_name' => 'Dedicated server option'],
            ['plan_id' => 4, 'feature_key' => 'support', 'feature_value' => 'dedicated', 'display_name' => 'Dedicated account manager'],
            ['plan_id' => 4, 'feature_key' => 'sla', 'feature_value' => '99.9', 'display_name' => '99.9% uptime SLA'],
            ['plan_id' => 4, 'feature_key' => 'data_retention', 'feature_value' => 'unlimited', 'display_name' => 'Unlimited data retention'],
        ]);

        $this->db->table('plan_features')->insertBatch($features);
    }
}
