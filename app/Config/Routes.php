<?php

use CodeIgniter\Router\RouteCollection;

/**
 * @var RouteCollection $routes
 */

// Default route
$routes->get('/', 'Home::index');

// CORS preflight for nested API paths (global CorsFilter also handles OPTIONS)
$routes->options('api/v1/(:any)', 'App\Controllers\API\V1\CorsController::preflight');

/*
 * --------------------------------------------------------------------
 * API Routes - Version 1
 * --------------------------------------------------------------------
 * All API routes use query parameters, not URI segments
 * Example: /api/v1/users?role=admin&page=1
 */

$routes->group('api/v1', ['namespace' => 'App\Controllers\API\V1'], function ($routes) {
    $routes->get('health', 'HealthController::index');

    // Public Authentication Routes (No Auth Required)
    $routes->post('auth/register', 'AuthController::register');
    $routes->post('auth/login', 'AuthController::login');
    $routes->post('auth/refresh', 'AuthController::refresh');
    $routes->post('auth/logout', 'AuthController::logout');
    $routes->post('auth/forgot-password', 'AuthController::forgotPassword');
    $routes->post('auth/reset-password', 'AuthController::resetPassword');
    $routes->post('auth/verify-email', 'AuthController::verifyEmail');
    $routes->post('auth/resend-verification', 'AuthController::resendVerification');

    // Inbound command-center webhooks (Phase 12) — verified by provider
    // signatures, so these are intentionally public (no JWT auth filter).
    $routes->post('slack/commands', 'SlackCommandController::commands');
    $routes->post('slack/interactions', 'SlackCommandController::interactions');
    $routes->post('teams/commands', 'TeamsController::commands');

    // Signed screenshot media — HMAC query auth so <img src> can use HTTP cache.
    // JWT Bearer still works on the authenticated routes below when present.
    $routes->get('screenshots/thumb/(:num)', 'ScreenshotController::thumbnail/$1');
    $routes->get('screenshots/view/(:num)', 'ScreenshotController::view/$1');

    // Real-time notifications via SSE (Phase 12). Auth is by ?token= query param
    // (EventSource can't send headers), verified inside the controller.
    $routes->get('notifications/stream', 'NotificationController::stream');

    // Social login (OAuth) — Google & GitHub
    $routes->get('auth/(:segment)/redirect', 'OAuthController::redirect/$1');
    $routes->get('auth/(:segment)/callback', 'OAuthController::callback/$1');

    // Public webhook (no auth)
    $routes->post('webhooks/stripe', 'StripeWebhookController::handle');

    // Email tracking pixels / click redirects (no auth — opened by mail clients)
    $routes->get('track/open/(:segment)', 'TrackingController::open/$1');
    $routes->get('track/click/(:segment)', 'TrackingController::click/$1');

    // Client portal (public, token-based)
    $routes->get('portal/invoice/(:segment)', 'ClientPortalController::show/$1');
    $routes->get('portal/invoice/(:segment)/screenshots/(:num)/thumbnail', 'ClientPortalController::screenshotThumbnail/$1/$2');
    $routes->get('portal/invoice/(:segment)/certificate', 'ClientPortalController::certificate/$1');
    $routes->post('portal/invoice/(:segment)/approve', 'ClientPortalController::approve/$1');
    $routes->post('portal/invoice/(:segment)/payment', 'ClientPortalController::recordPayment/$1');
    // Public, login-free verification of a Verified Work Certificate document.
    $routes->post('portal/certificate/verify', 'ClientPortalController::verifyCertificate');

    // Protected Authentication Routes (Auth Required)
    $routes->get('auth/me', 'AuthController::me', ['filter' => 'auth']);
    $routes->post('auth/change-password', 'AuthController::changePassword', ['filter' => 'auth']);
    $routes->post('auth/2fa/setup', 'AuthController::setupTwoFactor', ['filter' => 'auth']);
    $routes->post('auth/2fa/verify', 'AuthController::verifyTwoFactor', ['filter' => 'auth']);
    $routes->post('auth/2fa/disable', 'AuthController::disableTwoFactor', ['filter' => 'auth']);
    $routes->get('auth/sessions', 'AuthController::sessions', ['filter' => 'auth']);
    $routes->delete('auth/sessions/(:num)', 'AuthController::revokeSession/$1', ['filter' => 'auth']);

    // Location lookups (authenticated)
    $routes->get('locations/countries', 'LocationController::countries', ['filter' => 'auth']);
    $routes->get('locations/states', 'LocationController::states', ['filter' => 'auth']);
    $routes->get('locations/cities', 'LocationController::cities', ['filter' => 'auth']);
    $routes->get('locations/timezones', 'LocationController::timezones', ['filter' => 'auth']);

    // Platform announcements (read side for any signed-in member)
    $routes->get('announcements', 'AnnouncementController::index', ['filter' => 'auth']);
    $routes->post('announcements/(:num)/dismiss', 'AnnouncementController::dismiss/$1', ['filter' => 'auth']);

    // Super-admin (platform portal) routes
    $routes->group('admin', ['filter' => ['auth', 'superadmin']], function ($routes) {
        // Overview & metrics
        $routes->get('overview', 'AdminController::overview');
        $routes->get('metrics', 'AdminController::metrics');
        $routes->get('timeseries', 'AdminController::timeseries');
        $routes->get('activity/overview', 'AdminController::activityOverview');

        // Organizations
        $routes->get('orgs', 'AdminOrganizationController::index');
        $routes->get('orgs/(:num)', 'AdminOrganizationController::show/$1');
        $routes->put('orgs/(:num)', 'AdminOrganizationController::update/$1');
        $routes->delete('orgs/(:num)', 'AdminOrganizationController::delete/$1');
        $routes->post('orgs/(:num)/suspend', 'AdminOrganizationController::suspend/$1');
        $routes->post('orgs/(:num)/activate', 'AdminOrganizationController::activate/$1');
        $routes->put('orgs/(:num)/plan', 'AdminOrganizationController::changePlan/$1');
        $routes->post('orgs/(:num)/extend-trial', 'AdminOrganizationController::extendTrial/$1');

        // Users
        $routes->get('users', 'AdminUserController::index');
        $routes->get('users/(:num)', 'AdminUserController::show/$1');
        $routes->delete('users/(:num)', 'AdminUserController::delete/$1');
        $routes->post('users/(:num)/activate', 'AdminUserController::activate/$1');
        $routes->post('users/(:num)/deactivate', 'AdminUserController::deactivate/$1');
        $routes->put('users/(:num)/super-admin', 'AdminUserController::setSuperAdmin/$1');
        $routes->post('users/(:num)/verify-email', 'AdminUserController::verifyEmail/$1');
        $routes->post('users/(:num)/password-reset', 'AdminUserController::sendPasswordReset/$1');
        $routes->post('users/(:num)/revoke-sessions', 'AdminUserController::revokeSessions/$1');
        $routes->post('users/(:num)/impersonate', 'AdminUserController::impersonate/$1');
        $routes->get('impersonation', 'AdminUserController::impersonationHistory');
        $routes->post('impersonation/(:num)/stop', 'AdminUserController::stopImpersonation/$1');

        // Billing & subscriptions
        $routes->get('subscriptions', 'AdminBillingController::subscriptions');
        $routes->get('subscriptions/stats', 'AdminController::subscriptionStats');
        $routes->put('subscriptions/(:num)/status', 'AdminBillingController::updateStatus/$1');
        $routes->get('revenue/trend', 'AdminBillingController::revenueTrend');
        $routes->get('invoices', 'AdminBillingController::invoices');

        // Plans & feature flags
        $routes->get('plans', 'AdminPlanController::index');
        $routes->post('plans', 'AdminPlanController::create');
        $routes->put('plans/(:num)', 'AdminPlanController::update/$1');
        $routes->delete('plans/(:num)', 'AdminPlanController::delete/$1');
        $routes->put('plans/(:num)/features', 'AdminPlanController::upsertFeature/$1');
        $routes->delete('plans/(:num)/features/(:num)', 'AdminPlanController::deleteFeature/$1/$2');
        $routes->put('billing-settings', 'AdminPlanController::updateBillingSettings');

        // Payment ledger & revenue reporting
        $routes->get('payments', 'AdminPaymentController::index');
        $routes->get('payments/summary', 'AdminPaymentController::summary');
        $routes->get('payments/revenue', 'AdminPaymentController::revenue');
        $routes->get('payments/dunning', 'AdminPaymentController::dunning');
        $routes->get('payments/export', 'AdminPaymentController::export');
        $routes->get('payments/organization/(:num)', 'AdminPaymentController::forOrganization/$1');
        $routes->post('payments', 'AdminPaymentController::recordManual');
        $routes->post('payments/(:num)/retry', 'AdminPaymentController::retry/$1');
        $routes->post('payments/(:num)/refund', 'AdminPaymentController::refund/$1');

        // Coupons & offers
        $routes->get('coupons', 'AdminCouponController::index');
        $routes->post('coupons', 'AdminCouponController::create');
        $routes->get('coupons/(:num)', 'AdminCouponController::show/$1');
        $routes->put('coupons/(:num)', 'AdminCouponController::update/$1');
        $routes->delete('coupons/(:num)', 'AdminCouponController::delete/$1');
        $routes->post('coupons/(:num)/resync', 'AdminCouponController::resync/$1');

        // Growth analytics
        $routes->get('growth/overview', 'AdminGrowthController::overview');
        $routes->get('growth/cohorts', 'AdminGrowthController::cohorts');
        $routes->get('growth/churn', 'AdminGrowthController::churn');
        $routes->get('growth/health', 'AdminGrowthController::health');
        $routes->get('growth/segments', 'AdminGrowthController::segments');
        $routes->get('growth/segments/(:segment)', 'AdminGrowthController::segmentMembers/$1');

        // Lifecycle marketing campaigns
        $routes->get('campaigns', 'AdminCampaignController::index');
        $routes->post('campaigns', 'AdminCampaignController::create');
        $routes->get('campaigns/playbooks', 'AdminCampaignController::playbooks');
        $routes->post('campaigns/playbooks', 'AdminCampaignController::installPlaybook');
        $routes->post('campaigns/preview', 'AdminCampaignController::preview');
        $routes->get('campaigns/(:num)', 'AdminCampaignController::show/$1');
        $routes->put('campaigns/(:num)', 'AdminCampaignController::update/$1');
        $routes->delete('campaigns/(:num)', 'AdminCampaignController::delete/$1');
        $routes->post('campaigns/(:num)/duplicate', 'AdminCampaignController::duplicate/$1');
        $routes->post('campaigns/(:num)/send', 'AdminCampaignController::send/$1');
        $routes->post('campaigns/(:num)/test', 'AdminCampaignController::test/$1');
        $routes->put('campaigns/(:num)/status', 'AdminCampaignController::status/$1');

        // Usage analytics
        $routes->get('usage', 'AdminUsageController::index');

        // Audit & security
        $routes->get('audit-logs', 'AdminAuditController::index');
        $routes->get('audit-logs/options', 'AdminAuditController::options');
        $routes->get('security', 'AdminAuditController::security');

        // Announcements
        $routes->get('announcements', 'AdminAnnouncementController::index');
        $routes->post('announcements', 'AdminAnnouncementController::create');
        $routes->put('announcements/(:num)', 'AdminAnnouncementController::update/$1');
        $routes->delete('announcements/(:num)', 'AdminAnnouncementController::delete/$1');
        $routes->post('announcements/(:num)/resend', 'AdminAnnouncementController::resend/$1');

        // System health & settings
        $routes->get('system/health', 'AdminSystemController::health');
        $routes->get('system/logs', 'AdminSystemController::logs');
        $routes->get('system/settings', 'AdminSystemController::settings');
        $routes->put('system/settings', 'AdminSystemController::updateSettings');
        $routes->post('system/close-stale-timers', 'AdminSystemController::closeStaleTimers');

        // Legacy endpoints kept for older clients
        $routes->get('organizations', 'AdminController::organizations');
        $routes->get('organizations/(:num)', 'AdminOrganizationController::show/$1');
    });

    // User Routes (Protected)
    $routes->get('users', 'UserController::index', ['filter' => 'auth']);
    $routes->post('users/(:num)/avatar', 'UserController::uploadAvatar/$1', ['filter' => 'auth']);
    $routes->get('users/(:num)/avatar', 'UserController::avatar/$1', ['filter' => 'auth']);
    $routes->get('users/(:num)', 'UserController::show/$1', ['filter' => 'auth']);
    $routes->post('users', 'UserController::create', ['filter' => ['auth', 'admin']]);
    $routes->put('users/(:num)', 'UserController::update/$1', ['filter' => 'auth']);
    $routes->delete('users/(:num)', 'UserController::delete/$1', ['filter' => ['auth', 'admin']]);

    // Organization Routes
    $routes->get('organizations/(:num)', 'OrganizationController::show/$1', ['filter' => 'auth']);
    $routes->post('organizations', 'OrganizationController::create', ['filter' => 'auth']);
    $routes->put('organizations/(:num)', 'OrganizationController::update/$1', ['filter' => 'permission:settings.edit']);
    $routes->get('organizations/(:num)/members', 'OrganizationController::members/$1', ['filter' => 'auth']);
    $routes->post('organizations/(:num)/members', 'OrganizationController::addMember/$1', ['filter' => 'permission:users.create']);
    $routes->delete('organizations/(:num)/members/(:num)', 'OrganizationController::removeMember/$1/$2', ['filter' => 'permission:users.delete']);
    $routes->put('organizations/(:num)/members/(:num)', 'OrganizationController::updateMember/$1/$2', ['filter' => 'permission:users.edit']);
    $routes->get('organizations/(:num)/members/(:num)/projects', 'OrganizationController::getMemberProjects/$1/$2', ['filter' => 'permission:users.edit']);
    $routes->put('organizations/(:num)/members/(:num)/projects', 'OrganizationController::syncMemberProjects/$1/$2', ['filter' => 'permission:users.edit']);
    $routes->get('organizations/(:num)/members/(:num)/monitoring', 'OrganizationController::getMemberMonitoring/$1/$2', ['filter' => 'permission:users.edit']);
    $routes->put('organizations/(:num)/members/(:num)/monitoring', 'OrganizationController::updateMemberMonitoring/$1/$2', ['filter' => 'permission:users.edit']);
    $routes->get('organizations/(:num)/members/(:num)/advanced-monitoring', 'AdvancedMonitoringController::show/$1/$2', ['filter' => ['permission:monitoring.advanced', 'planFeature:advanced_monitoring']]);
    $routes->post('organizations/(:num)/members/(:num)/advanced-monitoring', 'AdvancedMonitoringController::enable/$1/$2', ['filter' => ['permission:monitoring.advanced', 'planFeature:advanced_monitoring']]);
    $routes->post('organizations/(:num)/members/(:num)/advanced-monitoring/close', 'AdvancedMonitoringController::close/$1/$2', ['filter' => ['permission:monitoring.advanced', 'planFeature:advanced_monitoring']]);
    $routes->get('monitoring/settings', 'MonitoringController::mySettings', ['filter' => 'auth']);
    $routes->put('monitoring/settings', 'MonitoringController::updateMySettings', ['filter' => 'auth']);
    $routes->get('invitations/validate', 'OrganizationController::validateInvitation');

    // Project Routes
    $routes->get('projects', 'ProjectController::index', ['filter' => 'permission:projects.view']);
    $routes->get('projects/(:num)', 'ProjectController::show/$1', ['filter' => 'permission:projects.view']);
    $routes->post('projects', 'ProjectController::create', ['filter' => 'permission:projects.create']);
    $routes->put('projects/(:num)', 'ProjectController::update/$1', ['filter' => 'permission:projects.edit']);
    $routes->delete('projects/(:num)', 'ProjectController::delete/$1', ['filter' => 'permission:projects.delete']);
    $routes->post('projects/(:num)/archive', 'ProjectController::archive/$1', ['filter' => 'permission:projects.archive']);
    $routes->get('projects/(:num)/members', 'ProjectController::members/$1', ['filter' => 'permission:projects.view']);
    $routes->put('projects/(:num)/members', 'ProjectController::syncMembers/$1', ['filter' => 'permission:projects.edit']);

    // Task Routes
    $routes->get('tasks', 'TaskController::index', ['filter' => 'permission:projects.view']);
    $routes->get('tasks/(:num)', 'TaskController::show/$1', ['filter' => 'permission:projects.view']);
    $routes->post('tasks', 'TaskController::create', ['filter' => 'permission:projects.edit']);
    $routes->put('tasks/(:num)', 'TaskController::update/$1', ['filter' => 'permission:projects.edit']);
    $routes->delete('tasks/(:num)', 'TaskController::delete/$1', ['filter' => 'permission:projects.edit']);

    // Time Entry Routes
    $routes->get('time-entries', 'TimeEntryController::index', ['filter' => 'permission:time.view_own']);
    $routes->post('time-entries/start', 'TimeEntryController::start', ['filter' => 'permission:time.edit_own']);
    $routes->post('time-entries/(:num)/stop', 'TimeEntryController::stop/$1', ['filter' => 'permission:time.edit_own']);
    $routes->post('time-entries/(:num)/pause', 'TimeEntryController::pause/$1', ['filter' => 'permission:time.edit_own']);
    $routes->post('time-entries/(:num)/discard-idle', 'TimeEntryController::discardIdle/$1', ['filter' => 'permission:time.edit_own']);
    $routes->post('time-entries/(:num)/resume', 'TimeEntryController::resume/$1', ['filter' => 'permission:time.edit_own']);
    $routes->get('time-entries/active', 'TimeEntryController::active', ['filter' => 'permission:time.view_own']);
    $routes->post('time-entries/manual', 'TimeEntryController::manual', ['filter' => 'permission:time.manual_entry']);
    $routes->put('time-entries/(:num)', 'TimeEntryController::update/$1', ['filter' => 'permission:time.manual_entry']);
    $routes->delete('time-entries/(:num)', 'TimeEntryController::delete/$1', ['filter' => 'permission:time.manual_entry']);

    // Smart notification rules
    $routes->group('smart-notifications', ['filter' => ['auth', 'permission:settings.edit']], function ($routes) {
        $routes->get('/', 'SmartNotificationController::index');
        $routes->get('templates', 'SmartNotificationController::templates');
        $routes->post('/', 'SmartNotificationController::create');
        $routes->put('(:num)', 'SmartNotificationController::update/$1');
        $routes->delete('(:num)', 'SmartNotificationController::delete/$1');
    });

    // Office locations (remote vs in-office)
    $routes->group('office-locations', ['filter' => ['auth', 'permission:settings.edit']], function ($routes) {
        $routes->get('/', 'OfficeLocationController::index');
        $routes->get('breakdown', 'OfficeLocationController::breakdown');
        $routes->post('auto-detect', 'OfficeLocationController::runAutoDetect');
        $routes->post('/', 'OfficeLocationController::create');
        $routes->put('(:num)', 'OfficeLocationController::update/$1');
        $routes->delete('(:num)', 'OfficeLocationController::delete/$1');
    });

    // Productivity Rules
    $routes->group('productivity-rules', ['filter' => ['auth', 'planFeature:productivity_rules']], function ($routes) {
        $routes->get('/', 'ProductivityRuleController::index', ['filter' => 'permission:productivity_rules.manage']);
        $routes->post('/', 'ProductivityRuleController::create', ['filter' => 'permission:productivity_rules.manage']);
        $routes->put('(:num)', 'ProductivityRuleController::update/$1', ['filter' => 'permission:productivity_rules.manage']);
        $routes->delete('(:num)', 'ProductivityRuleController::delete/$1', ['filter' => 'permission:productivity_rules.manage']);
    });

    // Timesheets
    $routes->group('timesheets', ['filter' => 'auth'], function ($routes) {
        $routes->get('/', 'TimesheetController::index', ['filter' => 'permission:timesheet.submit']);
        $routes->get('current-week', 'TimesheetController::currentWeek', ['filter' => 'permission:timesheet.submit']);
        $routes->post('(:num)/submit', 'TimesheetController::submit/$1', ['filter' => 'permission:timesheet.submit']);
        $routes->post('(:num)/approve', 'TimesheetController::approve/$1', ['filter' => 'permission:timesheet.approve']);
        $routes->post('(:num)/reject', 'TimesheetController::reject/$1', ['filter' => 'permission:timesheet.approve']);
    });

    // Screenshot Routes (thumb/view are public + signed/JWT — see routes above)
    $routes->group('screenshots', ['filter' => ['auth', 'planFeature:screenshots']], function ($routes) {
        $routes->get('(:num)', 'ScreenshotController::show/$1', ['filter' => 'permission:screenshots.view_own']);
        $routes->post('upload', 'ScreenshotController::upload', ['filter' => 'permission:screenshots.create']);
        $routes->delete('(:num)', 'ScreenshotController::delete/$1', ['filter' => 'permission:screenshots.delete']);
        $routes->get('/', 'ScreenshotController::index', ['filter' => 'permission:screenshots.view_own']);
    });

    // Activity Log Routes
    $routes->group('activity-logs', ['filter' => ['auth', 'planFeature:activity_tracking']], function ($routes) {
        $routes->get('/', 'ActivityLogController::index', ['filter' => 'permission:activity.view_own']);
        $routes->post('sync', 'ActivityLogController::sync', ['filter' => 'permission:activity.create']);
        $routes->get('stats', 'ActivityLogController::productivityStats', ['filter' => 'permission:activity.view_team']);
        $routes->get('top-apps', 'ActivityLogController::topApps', ['filter' => 'permission:activity.view_own']);
    });

    // Invoice Routes
    $routes->group('invoices', ['filter' => ['auth', 'planFeature:invoicing']], function ($routes) {
        $routes->get('/', 'InvoiceController::index', ['filter' => 'permission:invoices.view']);
        $routes->post('generate-from-time', 'InvoiceController::generateFromTime', ['filter' => 'permission:invoices.create']);
        $routes->post('/', 'InvoiceController::create', ['filter' => 'permission:invoices.create']);
        $routes->get('(:num)/pdf', 'InvoiceController::pdf/$1', ['filter' => 'permission:invoices.view']);
        $routes->get('(:num)', 'InvoiceController::show/$1', ['filter' => 'permission:invoices.view']);
        $routes->put('(:num)', 'InvoiceController::update/$1', ['filter' => 'permission:invoices.edit']);
        $routes->post('(:num)/populate-from-time', 'InvoiceController::populateFromTime/$1', ['filter' => 'permission:invoices.edit']);
        $routes->post('(:num)/items', 'InvoiceController::addItem/$1', ['filter' => 'permission:invoices.edit']);
        $routes->put('(:num)/status', 'InvoiceController::updateStatus/$1', ['filter' => 'permission:invoices.edit']);
        $routes->post('(:num)/send', 'InvoiceController::send/$1', ['filter' => 'permission:invoices.send']);
        $routes->get('(:num)/portal', 'InvoiceController::portalLink/$1', ['filter' => 'permission:invoices.view']);
        $routes->get('(:num)/payments', 'InvoiceController::payments/$1', ['filter' => 'permission:invoices.view']);
    });

    $routes->group('payroll', ['filter' => ['auth', 'planFeature:payroll']], function ($routes) {
        $routes->get('summary', 'PayrollController::summary', ['filter' => 'permission:payroll.view']);
        $routes->get('compensations', 'PayrollController::compensations', ['filter' => 'permission:payroll.view']);
        $routes->put('compensations', 'PayrollController::upsertCompensation', ['filter' => 'permission:payroll.manage']);
        $routes->get('runs', 'PayrollController::runs', ['filter' => 'permission:payroll.view']);
        $routes->post('runs', 'PayrollController::createRun', ['filter' => 'permission:payroll.manage']);
        $routes->get('runs/(:num)', 'PayrollController::showRun/$1', ['filter' => 'permission:payroll.view']);
        $routes->get('runs/(:num)/export', 'PayrollController::exportRun/$1', ['filter' => 'permission:payroll.export']);
        $routes->post('runs/(:num)/finalize', 'PayrollController::finalizeRun/$1', ['filter' => 'permission:payroll.manage']);
        $routes->put('items/(:num)', 'PayrollController::updateItem/$1', ['filter' => 'permission:payroll.manage']);
        $routes->get('items/(:num)/payslip', 'PayrollController::payslip/$1', ['filter' => 'permission:payroll.export']);
        $routes->post('items/(:num)/adjustments', 'PayrollController::addAdjustment/$1', ['filter' => 'permission:payroll.manage']);
        $routes->post('items/(:num)/payments', 'PayrollController::recordPayment/$1', ['filter' => 'permission:payroll.pay']);
        $routes->get('tax-templates', 'PayrollTaxTemplateController::index', ['filter' => 'permission:payroll.view']);
        $routes->post('tax-templates', 'PayrollTaxTemplateController::create', ['filter' => 'permission:payroll.manage']);
        $routes->get('tax-templates/(:num)', 'PayrollTaxTemplateController::show/$1', ['filter' => 'permission:payroll.view']);
        $routes->put('tax-templates/(:num)', 'PayrollTaxTemplateController::update/$1', ['filter' => 'permission:payroll.manage']);
        $routes->delete('tax-templates/(:num)', 'PayrollTaxTemplateController::delete/$1', ['filter' => 'permission:payroll.manage']);
    });

    // Client Routes (same plan gate as invoicing)
    $routes->group('clients', ['filter' => ['auth', 'planFeature:invoicing']], function ($routes) {
        $routes->get('/', 'ClientController::index', ['filter' => 'permission:invoices.view']);
        $routes->post('/', 'ClientController::create', ['filter' => 'permission:invoices.create']);
        $routes->get('(:num)', 'ClientController::show/$1', ['filter' => 'permission:invoices.view']);
        $routes->put('(:num)', 'ClientController::update/$1', ['filter' => 'permission:invoices.edit']);
        $routes->delete('(:num)', 'ClientController::delete/$1', ['filter' => 'permission:invoices.edit']);
        $routes->post('(:num)/projects', 'ClientController::linkProjects/$1', ['filter' => 'permission:invoices.edit']);
    });

    // Leave / PTO Routes
    $routes->get('leave/types', 'LeaveController::types', ['filter' => 'auth']);
    $routes->post('leave/types', 'LeaveController::createType', ['filter' => 'permission:settings.edit']);
    $routes->put('leave/types/(:num)', 'LeaveController::updateType/$1', ['filter' => 'permission:settings.edit']);
    $routes->get('leave/balances', 'LeaveController::balances', ['filter' => 'auth']);
    $routes->get('leave/requests', 'LeaveController::requests', ['filter' => 'auth']);
    $routes->post('leave/requests', 'LeaveController::requestLeave', ['filter' => 'auth']);
    $routes->post('leave/requests/(:num)/review', 'LeaveController::review/$1', ['filter' => 'permission:leave.approve,users.edit']);
    $routes->post('leave/requests/(:num)/cancel', 'LeaveController::cancel/$1', ['filter' => 'auth']);

    // Schedule & Overtime Routes
    $routes->get('schedules', 'ScheduleController::index', ['filter' => 'auth']);
    $routes->put('schedules', 'ScheduleController::upsert', ['filter' => 'permission:users.edit']);
    $routes->delete('schedules/(:num)', 'ScheduleController::deleteDay/$1', ['filter' => 'permission:users.edit']);
    $routes->get('schedules/expected-vs-actual', 'ScheduleController::expectedVsActual', ['filter' => 'auth']);
    $routes->get('overtime/rules', 'ScheduleController::overtimeRules', ['filter' => 'permission:settings.view']);
    $routes->put('overtime/rules', 'ScheduleController::upsertOvertimeRules', ['filter' => 'permission:settings.edit']);
    $routes->get('overtime/calculate', 'ScheduleController::calculateOvertime', ['filter' => 'auth']);

    // Audit Log Routes
    $routes->get('audit-logs', 'AuditController::index', ['filter' => 'permission:settings.view']);
    $routes->get('audit-logs/(:num)', 'AuditController::show/$1', ['filter' => 'permission:settings.view']);
    $routes->get('roles', 'RoleController::index', ['filter' => 'permission:settings.view']);
    $routes->post('roles', 'RoleController::create', ['filter' => 'permission:settings.edit']);
    $routes->put('roles/(:num)', 'RoleController::update/$1', ['filter' => 'permission:settings.edit']);
    $routes->delete('roles/(:num)', 'RoleController::delete/$1', ['filter' => 'permission:settings.edit']);
    $routes->put('roles/(:num)/permissions', 'RoleController::updatePermissions/$1', ['filter' => 'permission:settings.edit']);
    $routes->get('permissions', 'RoleController::permissions', ['filter' => 'permission:settings.view']);
    $routes->get('users/(:num)/permissions', 'RoleController::userPermissions/$1', ['filter' => 'permission:settings.view']);

    // Report Routes
    $routes->get('reports/summary', 'ReportController::summary', ['filter' => 'auth']);
    $routes->get('reports/active-sessions', 'ReportController::activeSessions', ['filter' => 'auth']);
    $routes->get('reports/hourly-timeline', 'ReportController::hourlyTimeline', ['filter' => 'auth']);
    $routes->get('reports/time-summary', 'ReportController::timeSummary', ['filter' => 'permission:reports.view_own']);
    $routes->get('reports/hours-calendar', 'ReportController::hoursCalendar', ['filter' => 'permission:reports.view_own']);
    $routes->get('reports/project-breakdown', 'ReportController::projectBreakdown', ['filter' => 'permission:reports.view_team']);
    $routes->get('reports/user-productivity/(:num)', 'ReportController::userProductivity/$1', ['filter' => 'permission:reports.view_team']);
    $routes->get('reports/team-leaderboard', 'ReportController::teamLeaderboard', ['filter' => 'permission:reports.view_team']);
    $routes->get('reports/top-urls', 'ReportController::topUrls', ['filter' => 'permission:reports.view_team']);
    $routes->get('reports/org-productivity', 'ReportController::orgProductivity', ['filter' => 'permission:reports.view_team']);
    $routes->get('reports/project-profitability', 'ReportController::projectProfitability', ['filter' => 'permission:reports.view_team']);
    $routes->get('reports/idle-breakdown', 'ReportController::idleBreakdown', ['filter' => 'permission:reports.view_team']);
    $routes->get('reports/advanced-monitoring', 'AdvancedMonitoringController::report', ['filter' => ['permission:monitoring.advanced', 'planFeature:advanced_monitoring']]);
    $routes->post('reports/export', 'ReportController::export', ['filter' => 'permission:reports.export']);

    // AI engine
    $routes->group('ai', ['filter' => ['auth', 'planFeature:ai_insights']], function ($routes) {
        $routes->get('status', 'AiController::status');
        $routes->post('ask', 'AiController::ask');
        $routes->get('weekly-narrative', 'AiController::weeklyNarrative');
        $routes->get('categorize', 'AiController::categorize');
        $routes->get('autopilot', 'AiController::autopilot');
        $routes->post('autopilot/apply', 'AiController::applyAutopilot');
        $routes->get('standup', 'AiController::standup');
    });

    // Per-organization integrations (OpenAI, and future OAuth providers)
    $routes->group('integrations', ['filter' => ['auth', 'planFeature:integrations']], function ($routes) {
        $routes->get('/', 'IntegrationController::index', ['filter' => 'permission:settings.view']);
        // GitHub developer activity (available to any authenticated member).
        $routes->get('github/activity', 'GithubController::activity');
        $routes->get('github/repos', 'GithubController::repos');
        $routes->get('github/pulls/(:segment)/(:segment)/(:num)', 'GithubController::pullRequest/$1/$2/$3');
        $routes->post('github/pulls/(:segment)/(:segment)/(:num)/comment', 'GithubController::pullComment/$1/$2/$3');
        $routes->post('github/pulls/(:segment)/(:segment)/(:num)/merge', 'GithubController::pullMerge/$1/$2/$3');
        $routes->post('github/pulls/(:segment)/(:segment)/(:num)/state', 'GithubController::pullState/$1/$2/$3');
        $routes->post('github/log-time', 'GithubController::logTime');
        // Slack messaging + in-app workspace.
        $routes->get('slack/meta', 'SlackController::meta');
        $routes->get('slack/channels/(:segment)/messages', 'SlackController::messages/$1');
        $routes->post('slack/channels/(:segment)/message', 'SlackController::channelMessage/$1');
        $routes->get('slack/channels', 'SlackController::channels');
        $routes->post('slack/test', 'SlackController::test');
        $routes->post('slack/send', 'SlackController::send');
        // Microsoft Teams messaging (Phase 12).
        $routes->post('teams/test', 'TeamsController::test');
        $routes->post('teams/send', 'TeamsController::send');
        // Jira issues → tracked time + in-app workspace.
        $routes->get('jira/issues/(:segment)/transitions', 'JiraController::transitions/$1');
        $routes->post('jira/issues/(:segment)/transition', 'JiraController::transition/$1');
        $routes->post('jira/issues/(:segment)/comment', 'JiraController::comment/$1');
        $routes->get('jira/issues/(:segment)', 'JiraController::issue/$1');
        $routes->get('jira/issues', 'JiraController::issues');
        $routes->post('jira/log-time', 'JiraController::logTime');
        // Calendar (Google / Outlook) meetings → tracked time.
        $routes->get('calendar/events', 'CalendarController::events');
        $routes->post('calendar/log-time', 'CalendarController::logTime');
        $routes->get('(:segment)', 'IntegrationController::show/$1', ['filter' => 'permission:settings.view']);
        $routes->put('(:segment)', 'IntegrationController::update/$1', ['filter' => 'permission:settings.edit']);
        $routes->post('(:segment)/connect', 'IntegrationController::connect/$1', ['filter' => 'permission:settings.edit']);
        $routes->post('(:segment)/toggle', 'IntegrationController::toggle/$1', ['filter' => 'permission:settings.edit']);
        $routes->delete('(:segment)', 'IntegrationController::delete/$1', ['filter' => 'permission:settings.edit']);
    });

    // Developer platform (Phase 10): API keys, webhooks, automations.
    $routes->group('developer', ['filter' => ['auth', 'planFeature:api_access']], function ($routes) {
        $routes->get('api-keys', 'ApiKeyController::index', ['filter' => 'permission:settings.view']);
        $routes->post('api-keys', 'ApiKeyController::create', ['filter' => 'permission:settings.edit']);
        $routes->delete('api-keys/(:num)', 'ApiKeyController::delete/$1', ['filter' => 'permission:settings.edit']);

        $routes->get('webhooks', 'WebhookController::index', ['filter' => 'permission:settings.view']);
        $routes->post('webhooks', 'WebhookController::create', ['filter' => 'permission:settings.edit']);
        $routes->post('webhooks/(:num)/test', 'WebhookController::test/$1', ['filter' => 'permission:settings.edit']);
        $routes->delete('webhooks/(:num)', 'WebhookController::delete/$1', ['filter' => 'permission:settings.edit']);

        $routes->get('automations', 'AutomationController::index', ['filter' => 'permission:settings.view']);
        $routes->post('automations', 'AutomationController::create', ['filter' => 'permission:settings.edit']);
        $routes->put('automations/(:num)', 'AutomationController::update/$1', ['filter' => 'permission:settings.edit']);
        $routes->delete('automations/(:num)', 'AutomationController::delete/$1', ['filter' => 'permission:settings.edit']);
    });

    // FlowTrack Public API (Phase 10): authenticated with an API key.
    $routes->group('public', ['filter' => 'apikey'], function ($routes) {
        $routes->get('ping', 'PublicApiController::ping');
        $routes->get('projects', 'PublicApiController::projects');
        $routes->get('time-entries', 'PublicApiController::timeEntries');
    });

    // Wellbeing / burnout suite (Phase 5)
    $routes->group('wellbeing', ['filter' => ['auth', 'planFeature:wellbeing']], function ($routes) {
        $routes->get('me', 'WellbeingController::me');
        $routes->get('team', 'WellbeingController::team');
    });

    // Proof-of-work ledger (Phase 6)
    $routes->group('ledger', ['filter' => ['auth', 'planFeature:proof_of_work']], function ($routes) {
        $routes->get('/', 'LedgerController::index');
        $routes->get('verify', 'LedgerController::verify');
    });

    $routes->group('insights', ['filter' => ['auth', 'permission:reports.view_own', 'planFeature:ai_insights']], function ($routes) {
        $routes->get('weekly-summary', 'InsightsController::weeklySummary');
        $routes->get('benchmarks', 'InsightsController::benchmarks');
        $routes->get('work-patterns', 'InsightsController::workPatterns');
        $routes->get('coach', 'InsightsController::coach');
        $routes->get('delivery-risks', 'InsightsController::deliveryRisks');
        $routes->get('forecast', 'InsightsController::forecast');
        $routes->get('sprints', 'InsightsController::sprints');
        $routes->post('sprints', 'InsightsController::createSprint');
        $routes->get('unusual-activity', 'InsightsController::unusualActivity');
    });

    // Scheduled Reports
    $routes->get('scheduled-reports', 'ScheduledReportController::index', ['filter' => 'permission:settings.view']);
    $routes->post('scheduled-reports', 'ScheduledReportController::create', ['filter' => 'permission:settings.edit']);
    $routes->put('scheduled-reports/(:num)', 'ScheduledReportController::update/$1', ['filter' => 'permission:settings.edit']);
    $routes->delete('scheduled-reports/(:num)', 'ScheduledReportController::delete/$1', ['filter' => 'permission:settings.edit']);

    // Team Routes
    $routes->get('teams', 'TeamController::index', ['filter' => 'auth']);
    $routes->get('teams/(:num)', 'TeamController::show/$1', ['filter' => 'auth']);
    $routes->post('teams', 'TeamController::create', ['filter' => 'permission:settings.edit']);
    $routes->put('teams/(:num)', 'TeamController::update/$1', ['filter' => 'permission:settings.edit']);
    $routes->delete('teams/(:num)', 'TeamController::delete/$1', ['filter' => 'permission:settings.edit']);
    $routes->post('teams/(:num)/members', 'TeamController::assignMembers/$1', ['filter' => 'permission:settings.edit']);
    $routes->delete('teams/(:num)/members/(:num)', 'TeamController::removeMember/$1/$2', ['filter' => 'permission:settings.edit']);
    $routes->put('teams/(:num)/lead', 'TeamController::setLead/$1', ['filter' => 'permission:settings.edit']);

    // Notification Routes
    $routes->get('notifications', 'NotificationController::index', ['filter' => 'auth']);
    $routes->get('notifications/unread-count', 'NotificationController::unreadCount', ['filter' => 'auth']);
    $routes->post('notifications/(:num)/read', 'NotificationController::markAsRead/$1', ['filter' => 'auth']);
    $routes->post('notifications/read-all', 'NotificationController::markAllAsRead', ['filter' => 'auth']);
    $routes->delete('notifications/(:num)', 'NotificationController::delete/$1', ['filter' => 'auth']);

    // Notification Preferences
    $routes->get('notification-preferences', 'NotificationPreferenceController::index', ['filter' => 'auth']);
    $routes->put('notification-preferences', 'NotificationPreferenceController::update', ['filter' => 'auth']);

    // Plans & Subscription Routes (Public - no auth for plans)
    $routes->get('plans', 'SubscriptionController::plans');
    $routes->get('plans/(:num)', 'SubscriptionController::planDetails/$1');

    // Subscription Management (Auth required)
    $routes->post('subscriptions', 'SubscriptionController::subscribe', ['filter' => 'auth']);
    $routes->post('subscriptions/checkout-session', 'SubscriptionController::checkoutSession', ['filter' => 'auth']);
    $routes->post('subscriptions/confirm-checkout', 'SubscriptionController::confirmCheckout', ['filter' => 'auth']);
    $routes->post('subscriptions/validate-promo', 'SubscriptionController::validatePromo', ['filter' => 'auth']);
    $routes->post('subscriptions/billing-portal', 'SubscriptionController::billingPortal', ['filter' => 'auth']);
    $routes->get('subscriptions/current', 'SubscriptionController::current', ['filter' => 'auth']);
    $routes->put('subscriptions/upgrade', 'SubscriptionController::upgrade', ['filter' => 'auth']);
    $routes->put('subscriptions/downgrade', 'SubscriptionController::downgrade', ['filter' => 'auth']);
    $routes->post('subscriptions/cancel', 'SubscriptionController::cancel', ['filter' => 'auth']);
    $routes->get('subscriptions/usage', 'SubscriptionController::usage', ['filter' => 'auth']);
    $routes->get('subscriptions/history', 'SubscriptionController::history', ['filter' => 'auth']);
});

/*
 * --------------------------------------------------------------------
 * Additional Routing
 * --------------------------------------------------------------------
 * For future API versions, create new groups:
 * $routes->group('api/v2', [...])
 */
