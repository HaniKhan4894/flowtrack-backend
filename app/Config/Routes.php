<?php

use CodeIgniter\Router\RouteCollection;

/**
 * @var RouteCollection $routes
 */

// Default route
$routes->get('/', 'Home::index');

// CORS preflight: return 204 for OPTIONS requests (including nested API paths)
$routes->options('api/v1/(:any)', 'App\Controllers\API\V1\CorsController::preflight');
$routes->options('api/v1/(:any)/(:any)', 'App\Controllers\API\V1\CorsController::preflight');
$routes->options('api/v1/(:any)/(:any)/(:any)', 'App\Controllers\API\V1\CorsController::preflight');
$routes->options('api/v1/(:any)/(:any)/(:any)/(:any)', 'App\Controllers\API\V1\CorsController::preflight');
$routes->options('api/v1/(:any)/(:any)/(:any)/(:any)/(:any)', 'App\Controllers\API\V1\CorsController::preflight');

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

    // Public webhook (no auth)
    $routes->post('webhooks/stripe', 'StripeWebhookController::handle');

    // Client portal (public, token-based)
    $routes->get('portal/invoice/(:segment)', 'ClientPortalController::show/$1');
    $routes->post('portal/invoice/(:segment)/approve', 'ClientPortalController::approve/$1');
    $routes->post('portal/invoice/(:segment)/payment', 'ClientPortalController::recordPayment/$1');

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

    // Super-admin routes
    $routes->group('admin', ['filter' => ['auth', 'superadmin']], function ($routes) {
        $routes->get('organizations', 'AdminController::organizations');
        $routes->get('subscriptions/stats', 'AdminController::subscriptionStats');
        $routes->get('activity/overview', 'AdminController::activityOverview');
        $routes->get('organizations/(:num)', 'AdminController::organizationDetail/$1');
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
    $routes->get('organizations/(:num)/members/(:num)/monitoring', 'OrganizationController::getMemberMonitoring/$1/$2', ['filter' => 'permission:users.edit']);
    $routes->put('organizations/(:num)/members/(:num)/monitoring', 'OrganizationController::updateMemberMonitoring/$1/$2', ['filter' => 'permission:users.edit']);
    $routes->get('monitoring/settings', 'MonitoringController::mySettings', ['filter' => 'auth']);
    $routes->get('invitations/validate', 'OrganizationController::validateInvitation');

    // Project Routes
    $routes->get('projects', 'ProjectController::index', ['filter' => 'permission:projects.view']);
    $routes->get('projects/(:num)', 'ProjectController::show/$1', ['filter' => 'permission:projects.view']);
    $routes->post('projects', 'ProjectController::create', ['filter' => 'permission:projects.create']);
    $routes->put('projects/(:num)', 'ProjectController::update/$1', ['filter' => 'permission:projects.edit']);
    $routes->delete('projects/(:num)', 'ProjectController::delete/$1', ['filter' => 'permission:projects.delete']);
    $routes->post('projects/(:num)/archive', 'ProjectController::archive/$1', ['filter' => 'permission:projects.archive']);

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
    $routes->post('time-entries/(:num)/resume', 'TimeEntryController::resume/$1', ['filter' => 'permission:time.edit_own']);
    $routes->get('time-entries/active', 'TimeEntryController::active', ['filter' => 'permission:time.view_own']);
    $routes->post('time-entries/manual', 'TimeEntryController::manual', ['filter' => 'permission:time.edit_own']);
    $routes->put('time-entries/(:num)', 'TimeEntryController::update/$1', ['filter' => 'permission:time.edit_own']);
    $routes->delete('time-entries/(:num)', 'TimeEntryController::delete/$1', ['filter' => 'permission:time.edit_own']);

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

    // Screenshot Routes
    $routes->group('screenshots', ['filter' => ['auth', 'planFeature:screenshots']], function ($routes) {
        $routes->get('(:num)', 'ScreenshotController::show/$1', ['filter' => 'permission:screenshots.view_own']);
        $routes->get('view/(:num)', 'ScreenshotController::view/$1', ['filter' => 'permission:screenshots.view_own']);
        $routes->get('thumb/(:num)', 'ScreenshotController::thumbnail/$1', ['filter' => 'permission:screenshots.view_own']);
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
        $routes->post('/', 'InvoiceController::create', ['filter' => 'permission:invoices.create']);
        $routes->get('(:num)/pdf', 'InvoiceController::pdf/$1', ['filter' => 'permission:invoices.view']);
        $routes->get('(:num)', 'InvoiceController::show/$1', ['filter' => 'permission:invoices.view']);
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

    // Client Routes
    $routes->get('clients', 'ClientController::index', ['filter' => ['auth', 'permission:invoices.view']]);
    $routes->post('clients', 'ClientController::create', ['filter' => ['auth', 'permission:invoices.create']]);
    $routes->get('clients/(:num)', 'ClientController::show/$1', ['filter' => ['auth', 'permission:invoices.view']]);
    $routes->put('clients/(:num)', 'ClientController::update/$1', ['filter' => ['auth', 'permission:invoices.edit']]);
    $routes->delete('clients/(:num)', 'ClientController::delete/$1', ['filter' => ['auth', 'permission:invoices.edit']]);
    $routes->post('clients/(:num)/projects', 'ClientController::linkProjects/$1', ['filter' => ['auth', 'permission:invoices.edit']]);

    // Leave / PTO Routes
    $routes->get('leave/types', 'LeaveController::types', ['filter' => 'auth']);
    $routes->post('leave/types', 'LeaveController::createType', ['filter' => 'permission:settings.edit']);
    $routes->put('leave/types/(:num)', 'LeaveController::updateType/$1', ['filter' => 'permission:settings.edit']);
    $routes->get('leave/balances', 'LeaveController::balances', ['filter' => 'auth']);
    $routes->get('leave/requests', 'LeaveController::requests', ['filter' => 'auth']);
    $routes->post('leave/requests', 'LeaveController::requestLeave', ['filter' => 'auth']);
    $routes->post('leave/requests/(:num)/review', 'LeaveController::review/$1', ['filter' => 'permission:users.edit']);
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
    $routes->get('reports/project-breakdown', 'ReportController::projectBreakdown', ['filter' => 'permission:reports.view_team']);
    $routes->get('reports/user-productivity/(:num)', 'ReportController::userProductivity/$1', ['filter' => 'permission:reports.view_team']);
    $routes->get('reports/team-leaderboard', 'ReportController::teamLeaderboard', ['filter' => 'permission:reports.view_team']);
    $routes->get('reports/top-urls', 'ReportController::topUrls', ['filter' => 'permission:reports.view_team']);
    $routes->get('reports/org-productivity', 'ReportController::orgProductivity', ['filter' => 'permission:reports.view_team']);
    $routes->get('reports/project-profitability', 'ReportController::projectProfitability', ['filter' => 'permission:reports.view_team']);
    $routes->get('reports/idle-breakdown', 'ReportController::idleBreakdown', ['filter' => 'permission:reports.view_team']);
    $routes->post('reports/export', 'ReportController::export', ['filter' => 'permission:reports.export']);

    $routes->get('insights/weekly-summary', 'InsightsController::weeklySummary', ['filter' => 'permission:reports.view_team']);
    $routes->get('insights/benchmarks', 'InsightsController::benchmarks', ['filter' => 'permission:reports.view_team']);
    $routes->get('insights/work-patterns', 'InsightsController::workPatterns', ['filter' => 'auth']);
    $routes->get('insights/coach', 'InsightsController::coach', ['filter' => 'auth']);
    $routes->get('insights/delivery-risks', 'InsightsController::deliveryRisks', ['filter' => 'permission:reports.view_team']);
    $routes->get('insights/sprints', 'InsightsController::sprints', ['filter' => 'permission:reports.view_team']);
    $routes->post('insights/sprints', 'InsightsController::createSprint', ['filter' => 'permission:reports.view_team']);

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
